import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { DuplicateIndex, findDuplicates, formatReport, normaliseInvoiceNumber } from '../src/duplicates/index.js';
import { runDuplicates } from '../src/duplicates/run.js';
import { type CanonicalInvoice, convert } from '../src/index.js';
import { fixture, parseOne, utf8 } from './helpers.js';
import { makeIdentity, signCms } from './sig-helpers.js';

const text = (name: string) => new TextDecoder().decode(fixture(name));
const base = text('peppol-bis3-invoice.xml');

/** The Peppol fixture with another number, issue date or payable amount. */
function variant(opts: { id?: string; date?: string; payable?: string; xml?: string } = {}): string {
  let xml = opts.xml ?? base;
  if (opts.id) xml = xml.replace('<cbc:ID>INV-2026-1042</cbc:ID>', `<cbc:ID>${opts.id}</cbc:ID>`);
  if (opts.date) xml = xml.replace('<cbc:IssueDate>2026-10-15</cbc:IssueDate>', `<cbc:IssueDate>${opts.date}</cbc:IssueDate>`);
  if (opts.payable) xml = xml.replace('currencyID="SEK">3091.00<', `currencyID="SEK">${opts.payable}<`);
  return xml;
}
const inv = (xml: string, name: string) => parseOne(utf8(xml), name);

describe('normaliseInvoiceNumber', () => {
  test('case, whitespace, separators and leading zeros', () => {
    expect(normaliseInvoiceNumber('INV-2026-1042').normalised).toBe('INV-2026-1042');
    expect(normaliseInvoiceNumber(' inv 2026/0001042 ').normalised).toBe('INV-2026-1042');
    expect(normaliseInvoiceNumber('INV2026_1042').normalised).toBe('INV-2026-1042');
    expect(normaliseInvoiceNumber('000').normalised).toBe('0');
    expect(normaliseInvoiceNumber('A.B:C#7').normalised).toBe('A-B-C-7');
  });
  test('records what changed', () => {
    expect(normaliseInvoiceNumber('INV-1').steps).toEqual([]);
    expect(normaliseInvoiceNumber('inv-1').steps).toEqual(['case']);
    expect(normaliseInvoiceNumber('INV-0001').steps).toEqual(['leading-zeros']);
    expect(normaliseInvoiceNumber('INV/1').steps).toEqual(['separators']);
    expect(normaliseInvoiceNumber(' INV 1').steps).toEqual(['whitespace', 'separators']);
  });
  test('different numbers stay different', () => {
    expect(normaliseInvoiceNumber('INV-12').normalised).not.toBe(normaliseInvoiceNumber('INV-120').normalised);
    expect(normaliseInvoiceNumber('1-23').normalised).not.toBe(normaliseInvoiceNumber('12-3').normalised);
  });
});

describe('levels', () => {
  test('level 3: same seller and number, different amount or date', async () => {
    const a = await inv(base, 'a.xml');
    const dearer = await inv(variant({ payable: '4000.00' }), 'b.xml');
    const later = await inv(variant({ date: '2026-10-20' }), 'c.xml');
    const [g] = findDuplicates([a, dearer, later]);
    expect(g.level).toBe('conflicting-resend');
    expect(g.rank).toBe(3);
    expect(g.members.map((m) => m.ref)).toEqual(['a.xml', 'b.xml', 'c.xml']);
    expect(g.differences.map((d) => d.field)).toEqual(expect.arrayContaining(['payable', 'issueDate']));
    expect(g.evidence.map((e) => e.kind)).toEqual(
      expect.arrayContaining(['same-seller', 'same-number', 'different-date', 'different-amount']),
    );
  });

  test('level 2: same seller, number and date, written differently', async () => {
    const a = await inv(base, 'a.xml');
    const b = await inv(variant({ id: 'inv 2026/001042' }), 'b.xml');
    const [g] = findDuplicates([a, b]);
    expect(g.level).toBe('same-invoice');
    const num = g.evidence.find((e) => e.kind === 'same-number');
    expect(num).toMatchObject({ normalised: 'INV-2026-1042', steps: expect.arrayContaining(['case', 'leading-zeros']) });
    expect(num?.kind === 'same-number' && num.raw.map((r) => r.number)).toEqual(['INV-2026-1042', 'inv 2026/001042']);
    expect(g.differences.map((d) => d.field)).toContain('number');
    expect(g.evidence.find((e) => e.kind === 'same-seller')).toMatchObject({ via: 'vat', key: 'vat:SE556000000101' });
  });

  test('level 4: new number, same amount, close dates and the same lines', async () => {
    const a = await inv(base, 'a.xml');
    const b = await inv(variant({ id: 'INV-2026-1043', date: '2026-10-17' }), 'b.xml');
    const [g] = findDuplicates([a, b]);
    expect(g.level).toBe('likely-duplicate');
    expect(g.evidence.find((e) => e.kind === 'date-within')).toMatchObject({ days: 2, maxDays: 7 });
    expect(g.evidence.find((e) => e.kind === 'similar-lines')).toMatchObject({ similarity: 1 });
  });

  test('level 4 needs the date window, the amount and similar lines', async () => {
    const a = await inv(base, 'a.xml');
    const far = await inv(variant({ id: 'INV-2026-1043', date: '2026-11-30' }), 'far.xml');
    const dearer = await inv(variant({ id: 'INV-2026-1044', payable: '3092.00' }), 'dearer.xml');
    const other = await inv(
      variant({ id: 'INV-2026-1045' }).replace('Hyllkonsol', 'Bokhylla').replace('Montering', 'Frakt').replace('Skruv 4x40', 'Spik'),
      'other.xml',
    );
    expect(findDuplicates([a, far, dearer, other])).toEqual([]);
    expect(findDuplicates([a, far], { windowDays: 60 })).toHaveLength(1);
    expect(findDuplicates([a, other], { minLineSimilarity: 0.1 })).toHaveLength(1);
  });

  test('another seller is never a duplicate, even with the same number', async () => {
    const a = await inv(base, 'a.xml');
    const b = await inv(base.replaceAll('SE556000000101', 'SE999000000101'), 'b.xml');
    expect(findDuplicates([a, b])).toEqual([]);
  });

  test('seller falls back to the registration id and then the endpoint', async () => {
    const noVat = (id: string) => variant({ id }).replace('<cbc:CompanyID>SE556000000101</cbc:CompanyID>', '');
    const a = await inv(noVat('INV-2026-1042'), 'a.xml');
    const b = await inv(noVat('INV-2026-1042'), 'b.xml');
    const [g] = findDuplicates([a, b]);
    expect(g.level).toBe('identical-payload');
    const c = await inv(noVat('INV-2026-1042').replace('Tack för ert köp', 'Tack'), 'c.xml');
    const [g2] = findDuplicates([a, c]);
    expect(g2.level).toBe('same-invoice');
    expect(g2.evidence.find((e) => e.kind === 'same-seller')?.kind === 'same-seller').toBe(true);
  });
});

describe('credit notes', () => {
  test('a credit note is paired with the invoice it refers to, not a duplicate', async () => {
    const invoice = await parseOne('peppol-bis3-invoice.xml');
    const credit = await parseOne('peppol-bis3-creditnote.xml');
    const idx = new DuplicateIndex();
    expect(idx.add(invoice, 'invoice.xml')).toEqual([]);
    expect(idx.add(credit, 'credit.xml')).toEqual([]);
    expect(idx.groups()).toEqual([]);
    expect(idx.pairings()).toEqual([{ ref: 'credit.xml', refersTo: 'invoice.xml', number: 'INV-2026-1042' }]);
    expect(formatReport([], idx.pairings())).toContain('not a duplicate');
  });

  test('a credit note with the same number and amount as an invoice is not compared', async () => {
    const invoice = await parseOne('peppol-bis3-invoice.xml');
    const credit: CanonicalInvoice = { ...(await parseOne('peppol-bis3-creditnote.xml')), id: invoice.id, precedingInvoices: [] };
    expect(findDuplicates([invoice, credit])).toEqual([]);
  });

  test('the same credit note twice is still a duplicate', async () => {
    const credit = await parseOne('peppol-bis3-creditnote.xml');
    const [g] = findDuplicates([credit, credit]);
    expect(g.level).toBe('identical-payload');
  });
});

describe('wrappers', () => {
  test('the same CII invoice as XML, in a PDF, in a p7m and in a zip is one payload', async () => {
    const xml = fixture('en16931-cii.xml');
    const pdf = await PDFDocument.create();
    pdf.addPage();
    await pdf.attach(xml, 'factur-x.xml', { mimeType: 'text/xml' });
    const p7m = await signCms(xml, await makeIdentity('Signer'));
    const files: [string, Uint8Array][] = [
      ['plain.xml', xml],
      ['wrapped.pdf', await pdf.save()],
      ['signed.xml.p7m', p7m],
      ['bundle.zip', zipSync({ 'inv.xml': xml })],
    ];
    const idx = new DuplicateIndex();
    for (const [name, bytes] of files) idx.addResult(await convert(bytes, name), name);
    expect(idx.size).toBe(4);
    const groups = idx.groups();
    expect(groups).toHaveLength(1);
    const [g] = groups;
    expect(g.level).toBe('identical-payload');
    expect(g.members.map((m) => m.ref)).toEqual(files.map(([n]) => n));
    expect(new Set(g.members.map((m) => m.payloadSha256)).size).toBe(1);
    expect(g.members.map((m) => m.envelope)).toEqual(expect.arrayContaining(['pdf-attachment>xml', 'cms-p7m>xml', 'zip>xml']));
    expect(g.differences.map((d) => d.field)).toEqual(expect.arrayContaining(['envelope']));
    expect(g.differences.map((d) => d.field)).not.toContain('payloadSha256');
  });

  test('two invoices of one multi-invoice file are not duplicates of each other', async () => {
    const r = await convert(fixture('fatturapa-lot.xml'), 'lot.xml');
    const idx = new DuplicateIndex();
    idx.addResult(r, 'lot.xml');
    expect(idx.size).toBeGreaterThan(1);
    expect(idx.groups()).toEqual([]);
    // The same lot sent again: each invoice matches its twin.
    idx.addResult(r, 'lot-again.xml');
    expect(idx.groups().length).toBe(idx.size / 2);
  });
});

describe('incremental index', () => {
  test('add reports the groups the new invoice joined; re-adding changes nothing', async () => {
    const a = await inv(base, 'a.xml');
    const b = await inv(variant({ payable: '4000.00' }), 'b.xml');
    const idx = new DuplicateIndex();
    expect(idx.add(a, 'a.xml')).toEqual([]);
    const joined = idx.add(b, 'b.xml');
    expect(joined).toHaveLength(1);
    expect(joined[0].members.map((m) => m.ref)).toEqual(['a.xml', 'b.xml']);
    expect(idx.add(b, 'b.xml')).toHaveLength(1);
    expect(idx.size).toBe(2);
    const c = await inv(variant({ date: '2026-10-30' }), 'c.xml');
    expect(idx.add(c, 'c.xml')[0].members).toHaveLength(3);
  });

  test('persists as JSON and keeps finding duplicates after a reload', async () => {
    const a = await inv(base, 'a.xml');
    const idx = new DuplicateIndex({ windowDays: 3 });
    idx.add(a, 'a.xml');
    const json = JSON.stringify(idx);
    const loaded = DuplicateIndex.fromJSON(json);
    expect(loaded.size).toBe(1);
    expect(loaded.options.windowDays).toBe(3);
    const joined = loaded.add(await inv(variant({ id: 'inv-2026-1042' }), 'b.xml'), 'b.xml');
    expect(joined[0].level).toBe('same-invoice');
    expect(DuplicateIndex.fromJSON(JSON.stringify(loaded)).groups()).toEqual(loaded.groups());
    expect(DuplicateIndex.fromJSON(json, { windowDays: 9 }).options.windowDays).toBe(9);
    expect(() => DuplicateIndex.fromJSON('{"version":2}')).toThrow('Not a duplicate index');
  });

  test('addResult labels several invoices of one file and skips failures', async () => {
    const idx = new DuplicateIndex();
    const lot = await convert(fixture('fatturapa-lot.xml'), 'lot.xml');
    idx.addResult(lot, 'lot.xml');
    expect(idx.addResult(await convert(utf8('not xml'), 'x.txt'), 'x.txt')).toEqual([]);
    expect(formatReport(idx.groups())).toBe('');
    const again = new DuplicateIndex();
    again.addResult(lot);
    expect(again.size).toBe(idx.size);
  });
});

describe('report', () => {
  test('describes every level', async () => {
    const a = await inv(base, 'a.xml');
    const groups = findDuplicates([
      a,
      await inv(variant({ id: 'inv-2026-1042' }), 'same.xml'),
      await inv(variant({ id: 'INV-2026-2000', date: '2026-10-16' }).replace('Tack för ert köp', 'x'), 'like.xml'),
      await inv(variant({ payable: '4000.00', date: '2026-10-20' }), 'conflict.xml'),
    ]);
    const report = formatReport(groups);
    expect(report).toContain('[2] same-invoice');
    expect(report).toContain('same number "INV-2026-1042"');
    expect(report).toContain('different issue dates');
    expect(report).toContain('differs: payable');
    const simple = formatReport(findDuplicates([a, await inv(variant({ id: 'INV-2026-1043', date: '2026-10-17' }), 'b.xml')]));
    expect(simple).toContain('line similarity 1');
    expect(simple).toContain('2 day(s) apart');
    expect(simple).toContain('same payable amount 3091 SEK');
    const same = formatReport(findDuplicates([a, await inv(variant({ id: 'inv 2026 1042' }), 'b.xml')]));
    expect(same).toContain('same issue date 2026-10-15');
    const payload = formatReport(findDuplicates([a, a]));
    expect(payload).toContain('same payload sha256');
  });
});

describe('runDuplicates', () => {
  const dir = mkdtempSync(join(tmpdir(), 'einvoice-dup-'));
  const put = (sub: string, name: string, content: string | Uint8Array) => {
    mkdirSync(join(dir, sub), { recursive: true });
    writeFileSync(join(dir, sub, name), content);
    return join(dir, sub);
  };

  test('exit 0 when nothing repeats, 8 when something does, 5 when only some files fail', async () => {
    const clean = put('clean', 'a.xml', base);
    put('clean', 'b.xml', variant({ id: 'INV-9', date: '2026-01-01' }));
    const out: string[] = [];
    expect(await runDuplicates([clean], {}, (l) => out.push(l))).toBe(0);
    expect(out.join('\n')).toContain('0 duplicate group(s)');

    const dup = put('dup', 'a.xml', base);
    put('dup', 'b.xml', variant({ id: 'inv-2026-1042' }));
    out.length = 0;
    expect(await runDuplicates([dup], {}, (l) => out.push(l))).toBe(8);
    expect(out.join('\n')).toContain('same-invoice');

    const broken = put('broken', 'x.xml', 'not xml at all');
    const warnings: string[] = [];
    expect(
      await runDuplicates(
        [broken, join(clean, 'a.xml')],
        {},
        () => {},
        (l) => warnings.push(l),
      ),
    ).toBe(5);
    expect(warnings[0]).toContain('x.xml');
  });

  test('--json output and a persisted index across runs', async () => {
    const first = put('inc1', 'a.xml', base);
    const second = put('inc2', 'b.xml', variant({ id: 'INV-2026-1042', payable: '1.00' }));
    const indexFile = join(dir, 'index.json');
    const out: string[] = [];
    expect(await runDuplicates([first], { indexFile, json: true }, (l) => out.push(l))).toBe(0);
    // Same files again do not become duplicates of themselves.
    expect(await runDuplicates([first], { indexFile, json: true }, (l) => out.push(l))).toBe(0);
    out.length = 0;
    expect(await runDuplicates([second], { indexFile, json: true, pretty: true }, (l) => out.push(l))).toBe(8);
    const report = JSON.parse(out.join('\n'));
    expect(report.invoices).toBe(2);
    expect(report.groups[0].level).toBe('conflicting-resend');
  });
});

describe('einvoice duplicates (CLI)', () => {
  const cli = new URL('../src/cli.ts', import.meta.url).pathname;
  const run = async (args: string[]) => {
    const p = Bun.spawn(['bun', cli, ...args], { stdout: 'pipe', stderr: 'pipe', stdin: 'ignore' });
    const [stdout, stderr, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    return { stdout, stderr, code };
  };
  const dir = mkdtempSync(join(tmpdir(), 'einvoice-dupcli-'));
  writeFileSync(join(dir, 'a.xml'), base);
  writeFileSync(join(dir, 'b.xml'), variant({ id: 'inv-2026-1042' }));

  test('prints a report and exits 8', async () => {
    const r = await run(['duplicates', dir]);
    expect(r.code).toBe(8);
    expect(r.stdout).toContain('[2] same-invoice');
  });
  test('--window and --json', async () => {
    const r = await run(['duplicates', dir, '--window', '2', '--json']);
    expect(r.code).toBe(8);
    expect(JSON.parse(r.stdout).groups).toHaveLength(1);
  });
  test('rejects a bad --window and a missing directory', async () => {
    expect((await run(['duplicates', dir, '--window', 'x'])).code).toBe(1);
    expect((await run(['duplicates'])).code).toBe(1);
  });
});

describe('hostile input', () => {
  test('long runs of zeros normalise in linear time (no regex backtracking)', () => {
    const zeros = '0'.repeat(200_000);
    const started = performance.now();
    expect(normaliseInvoiceNumber(`${zeros}1`).normalised).toBe('1');
    expect(normaliseInvoiceNumber(`${zeros}A`).normalised).toBe('0-A');
    expect(normaliseInvoiceNumber(zeros).normalised).toBe('0');
    expect(performance.now() - started).toBeLessThan(500);
  });
});
