import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { PDFDocument } from 'pdf-lib';
import { EXIT } from '../src/cli.js';
import { convert, schemaVersion } from '../src/index.js';
import { extractPdfInvoice } from '../src/pdf-extract/index.js';
import { fixture } from './helpers.js';

const NO_XML = 'PDF without a usable embedded XML (not a hybrid e-invoice)';
const plain = async () => {
  const doc = await PDFDocument.create();
  doc.addPage().drawText('Faktura 1');
  return doc.save();
};
const schema = JSON.parse(readFileSync(join(import.meta.dir, '..', 'schemas', `convert-result.${schemaVersion}.schema.json`), 'utf8'));
const validateResult = new Ajv2020({ strict: false }).compile(schema);

describe('convert extractPdf', () => {
  test('off (default): a PDF without XML is skipped as before', async () => {
    const r = await convert(await plain(), 'plain.pdf');
    expect(r.outcomes).toEqual([]);
    expect(r.pdfOutcomes).toBeUndefined();
    expect(r.skipped).toEqual([{ name: 'plain.pdf', reason: NO_XML }]);
  });

  test('on: the PDF goes to the extractor and its skip entry is replaced by the outcome', async () => {
    const bytes = await plain();
    const r = await convert(bytes, 'plain.pdf', undefined, { extractPdf: true });
    expect(r.outcomes).toEqual([]);
    expect(r.skipped).toEqual([]);
    expect(r.pdfOutcomes).toEqual([
      {
        status: 'unsupported',
        reason: expect.stringContaining('No invoice fields were recognised'),
        pdf: { filename: 'plain.pdf', sha256: r.fileSha256, byteLength: bytes.length },
      },
    ]);
    expect(validateResult(r)).toBe(true);
  });

  test('on, with validate: no source validation is attempted for the PDF', async () => {
    const r = await convert(await plain(), 'plain.pdf', undefined, { extractPdf: true, validate: true });
    expect(r.pdfOutcomes?.[0]?.status).toBe('unsupported');
  });

  test('on: an unreadable PDF stays skipped', async () => {
    const r = await convert(new TextEncoder().encode('%PDF-1.7 broken'), 'broken.pdf', undefined, { extractPdf: true });
    expect(r.pdfOutcomes).toBeUndefined();
    expect(r.skipped.some((s) => s.reason.startsWith('PDF unreadable'))).toBe(true);
  });

  test('on: a hybrid e-invoice converts from its XML and is not extracted', async () => {
    const r = await convert(fixture('facturx-en16931.pdf'), 'facturx-en16931.pdf', undefined, { extractPdf: true });
    expect(r.outcomes.map((o) => o.status)).toEqual(['ok']);
    expect(r.pdfOutcomes).toBeUndefined();
  });

  test('the published schema accepts a draft with page regions and rejects one without a pdf source', () => {
    const region = { page: 1, x: 56, y: 120.5, width: 80, height: 10 };
    const draft = {
      status: 'draft',
      pdf: { sha256: 'x', byteLength: 1 },
      draft: {
        fields: { '/totals/payable': '1250.00' },
        pdfProvenance: { '/totals/payable': region },
        problems: [{ code: 'missing', message: 'No invoice number', field: '/id', region }],
      },
    };
    expect(validateResult({ fileSha256: 'x', outcomes: [], pdfOutcomes: [draft], skipped: [] })).toBe(true);
    expect(validateResult({ fileSha256: 'x', outcomes: [], pdfOutcomes: [{ ...draft, pdf: undefined }], skipped: [] })).toBe(false);
  });

  test('the extractor reports a PDF without invoice fields as unsupported', async () => {
    expect(await extractPdfInvoice(await plain(), { fileSha256: '0' })).toMatchObject({ status: 'unsupported' });
  });
});

describe('einvoice convert --extract-pdf', () => {
  const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
  const run = async (...args: string[]) => {
    const proc = Bun.spawn(['bun', cli, ...args], { stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    return { stdout, stderr, code };
  };
  const file = join(mkdtempSync(join(tmpdir(), 'einvoice-pdf-')), 'plain.pdf');

  test('reports the extractor reason with the unsupported exit code', async () => {
    writeFileSync(file, await plain());
    const r = await run('convert', '--extract-pdf', file);
    expect(r.code).toBe(EXIT.unsupported);
    expect(r.stderr).toContain('No invoice fields were recognised');
    expect(r.stdout.trim()).toBe('[]');
  });

  test('is ignored with a note outside convert', async () => {
    writeFileSync(file, await plain());
    const r = await run('inspect', '--extract-pdf', file);
    expect(r.stderr).toContain('--extract-pdf only applies to convert');
  });
});
