import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync } from 'fflate';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { convert, inspect } from '../src/index.js';
import { PEPPOL, fixture, ublHeader, utf8 } from './helpers.js';

const MB = 1024 * 1024;

describe('XML', () => {
  test('a DOCTYPE is rejected before any parsing (entity expansion)', async () => {
    const bomb = `<?xml version="1.0"?>
<!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">]>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><cbc:ID xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">&lol2;</cbc:ID></Invoice>`;
    const r = await inspect(utf8(bomb), 'bomb.xml');
    assert.equal(r.documents.length, 0);
    assert.match(r.skipped[0].reason, /DOCTYPE/);
  });

  test('a DOCTYPE with an external DTD is rejected', async () => {
    const r = await inspect(utf8(`<?xml version="1.0"?><!DOCTYPE Invoice SYSTEM "http://attacker.example/x.dtd">${ublHeader(PEPPOL)}`));
    assert.equal(r.documents.length, 0);
    assert.match(r.skipped[0].reason, /DOCTYPE/);
  });

  test('convert() reports why nothing came out', async () => {
    const r = await convert(utf8(`<!DOCTYPE x [<!ENTITY a "a">]>${ublHeader(PEPPOL)}`), 'x.xml');
    assert.deepEqual(r.outcomes, []);
    assert.equal(r.skipped.length, 1);
    assert.match(r.skipped[0].reason, /DOCTYPE/);
    assert.match(r.fileSha256, /^[0-9a-f]{64}$/);
  });

  test('files over maxFileBytes are refused without unwrapping', async () => {
    const r = await convert(fixture('xrechnung-ubl.xml'), 'x.xml', { maxFileBytes: 100 });
    assert.deepEqual(r.outcomes, []);
    assert.match(r.skipped[0].reason, /larger than 100 bytes/);
  });
});

describe('ZIP', () => {
  test('entries over the size limit are not inflated', async () => {
    const r = await inspect(fixture('anaf-download.zip'), 'anaf-download.zip', { maxEntryBytes: 1000 });
    assert.equal(r.documents.length, 0);
    assert.ok(r.skipped.some((s) => /size or count limit/.test(s.reason)));
  });

  test('payload count is capped', async () => {
    const one = fixture('hr-cius.xml');
    const r = await inspect(zipSync({ 'a.xml': one, 'b.xml': one, 'c.xml': one }), 'many.zip', { maxPayloads: 2 });
    assert.equal(r.documents.length, 2);
    assert.ok(r.skipped.some((s) => /More than 2/.test(s.reason)));
  });

  test('entry count is capped', async () => {
    const one = fixture('hr-cius.xml');
    const r = await inspect(zipSync({ 'a.xml': one, 'b.xml': one, 'c.xml': one }), 'many.zip', { maxEntries: 1 });
    assert.equal(r.documents.length, 1);
    assert.ok(r.skipped.some((s) => /entry count/.test(s.reason)));
  });

  test('an entry whose header understates its size is refused before inflating', async () => {
    const zip = zipSync({ 'invoice.xml': new Uint8Array(20 * MB) }, { level: 9 });
    const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    for (let i = 0; i + 4 <= zip.length; i++) {
      const sig = dv.getUint32(i, true);
      if (sig === 0x04034b50) dv.setUint32(i + 22, 100, true); // local header: uncompressed size
      if (sig === 0x02014b50) dv.setUint32(i + 24, 100, true); // central directory: uncompressed size
    }
    const started = performance.now();
    const r = await inspect(zip, 'lying.zip');
    assert.equal(r.documents.length, 0);
    assert.ok(r.skipped.some((s) => /understates its size/.test(s.reason)), JSON.stringify(r.skipped));
    assert.ok(performance.now() - started < 1000, 'should not spend time inflating');
  });

  test('nested envelopes beyond maxDepth are refused', async () => {
    let bytes = fixture('hr-cius.xml');
    for (let i = 0; i < 4; i++) bytes = zipSync({ [`level${i}.zip`]: bytes });
    const r = await inspect(bytes, 'deep.zip', { maxDepth: 2 });
    assert.equal(r.documents.length, 0);
    assert.ok(r.skipped.some((s) => /Too many nested envelopes/.test(s.reason)));
  });
});

describe('PDF', () => {
  /** A PDF with one embedded factur-x.xml of `size` zero bytes, optionally without the /Params /Size hint. */
  async function pdfWithAttachment(size: number, stripDeclaredSize: boolean): Promise<Uint8Array> {
    let pdf = await PDFDocument.create();
    pdf.addPage();
    await pdf.attach(new Uint8Array(size), 'factur-x.xml', { mimeType: 'text/xml' });
    if (!stripDeclaredSize) return pdf.save();
    pdf = await PDFDocument.load(await pdf.save());
    for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFRawStream) obj.dict.delete(PDFName.of('Params'));
    }
    return pdf.save({ useObjectStreams: false });
  }

  test('an attachment over the limit is refused from its declared size', async () => {
    const r = await inspect(await pdfWithAttachment(2 * MB, false), 'big.pdf', { maxEntryBytes: MB });
    assert.equal(r.documents.length, 0);
    assert.ok(r.skipped.some((s) => /declared size/.test(s.reason)), JSON.stringify(r.skipped));
  });

  test('an attachment without a declared size stops inflating at the limit (decompression bomb)', async () => {
    const bytes = await pdfWithAttachment(64 * MB, true);
    assert.ok(bytes.length < 200 * 1024, 'the bomb itself is small');
    const r = await inspect(bytes, 'bomb.pdf', { maxEntryBytes: MB });
    assert.equal(r.documents.length, 0);
    const reason = r.skipped.map((s) => s.reason).join(' | ');
    assert.match(reason, /PDF attachment over the size limit/);
    assert.doesNotMatch(reason, /declared size/);
  });

  test('a PDF without an XML attachment is skipped with a reason', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const r = await inspect(await pdf.save(), 'plain.pdf');
    assert.equal(r.documents.length, 0);
    assert.match(r.skipped[0].reason, /without a usable embedded XML/);
  });
});

describe('hashes', () => {
  test('file and payload SHA-256 are recorded', async () => {
    const bytes = fixture('IT01234567890_FPR12.xml.p7m');
    const r = await inspect(bytes);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    assert.equal(r.fileSha256, Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join(''));
    assert.match(r.documents[0].payload.sha256, /^[0-9a-f]{64}$/);
    assert.notEqual(r.documents[0].payload.sha256, r.fileSha256);
  });

  test('the same invoice in different wrappers has the same payload hash', async () => {
    const xml = fixture('hr-cius.xml');
    const [plain, zipped] = await Promise.all([inspect(xml), inspect(zipSync({ 'a.xml': xml }))]);
    assert.notEqual(plain.fileSha256, zipped.fileSha256);
    assert.equal(plain.documents[0].payload.sha256, zipped.documents[0].payload.sha256);
  });
});
