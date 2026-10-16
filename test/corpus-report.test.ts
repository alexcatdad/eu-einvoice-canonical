import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  aggregate,
  describeReport,
  type FileResult,
  linkHtml,
  normaliseMessage,
  renderHtml,
  renderMarkdown,
  summarise,
} from '../scripts/corpus-lib.js';
import { convert } from '../src/index.js';
import { fixturePath } from './helpers.js';

const doc = (over: Partial<FileResult['docs'][number]> = {}): FileResult['docs'][number] => ({
  status: 'ok',
  format: 'peppol-bis3',
  invoices: 1,
  warnings: [],
  failedRules: [],
  signatures: [],
  ...over,
});
const file = (name: string, docs: FileResult['docs'], over: Partial<FileResult> = {}): FileResult => ({
  file: name,
  corpus: name.split('/')[0] as string,
  bytes: 10,
  ms: 5,
  outcome: 'done',
  skipped: [],
  docs,
  ...over,
});

test('messages differing only in values fall into one cluster', () => {
  expect(normaliseMessage("Missing element 'cbc:ID' at line 12")).toBe(normaliseMessage("Missing element 'cbc:Name' at line 99"));
  expect(normaliseMessage('Bad hash deadbeef0123 in entry 7')).toBe('Bad hash <hex> in entry N');
});

test('summarise reduces a conversion to counts and statuses', async () => {
  const path = fixturePath('peppol-bis3-invoice.xml');
  const r = summarise(await convert(new Uint8Array(readFileSync(path)), path, undefined, { relations: true }));
  expect(r.docs).toHaveLength(1);
  expect(r.docs[0]).toMatchObject({ status: 'ok', invoices: 1 });
  expect(r.docs[0]?.validation?.parse).toBe('passed');
});

test('aggregate counts per corpus and format, clusters errors and rates BR-CO warnings', () => {
  const report = aggregate(
    [
      file('a/1.xml', [doc({ warnings: ['BR-CO-15'], validation: { schema: 'passed', semantic: 'failed' }, failedRules: ['BR-01'] })]),
      file('a/2.xml', [doc({ validation: { schema: 'passed', semantic: 'passed' }, signatures: [{ type: 'XAdES', verified: true }] })]),
      file('a/3.xml', [doc({ status: 'error', format: 'ubl-x', invoices: 0, message: "Bad value '12' in line 3" })]),
      file('b/4.xml', [
        doc({ status: 'error', format: 'ubl-x', invoices: 0, message: "Bad value '99' in line 8" }),
        doc({ status: 'not-an-invoice', format: 'other', invoices: 0 }),
      ]),
      file('b/5.pdf', [], { skipped: ['No XML attachment'] }),
      file('b/6.xml', [], { outcome: 'timeout', ms: 60000, error: 'no answer' }),
    ],
    { seconds: 2, pins: ['a abc 3 files'], options: { validate: true, relations: true, provenance: false, timeoutSeconds: 60 } },
  );
  expect(report.totals).toMatchObject({
    files: 6,
    documents: 5,
    ok: 2,
    error: 2,
    notAnInvoice: 1,
    noDocument: 1,
    timeouts: 1,
    filesPerSecond: 3,
  });
  expect(report.corpora.a).toMatchObject({ files: 3, ok: 2, error: 1 });
  expect(report.formats['ubl-x']).toMatchObject({ files: 2, error: 2 });
  expect(report.warnings).toMatchObject({ okDocuments: 2, withBrCo: 1, brCoRate: 0.5 });
  expect(report.validation.semantic).toEqual({ failed: 1, passed: 1 });
  expect(report.signatures.byType.XAdES).toEqual({ valid: 1, invalid: 0, unchecked: 0 });
  expect(report.errors).toHaveLength(1);
  expect(report.errors[0]).toMatchObject({ count: 2, examples: ['a/3.xml', 'b/4.xml'] });
  expect(report.failedRules).toEqual([{ rule: 'BR-01', count: 1 }]);
  expect(report.skipped[0]?.message).toBe('No XML attachment');
  expect(report.hung).toEqual([{ file: 'b/6.xml', outcome: 'timeout', error: 'no answer' }]);

  const md = renderMarkdown(report);
  expect(md).toContain('### Top 20 error messages');
  expect(md).toContain('Timed out or crashed');
  const html = renderHtml(report);
  expect(html).toContain('<h2>By format</h2>');
  expect(html).toContain('Bad value');
  expect(describeReport(report)).toContain(`${report.totals.files} files`);
  expect(linkHtml(report)).toContain('href="/eu-einvoice-canonical/corpus/"');
});

test('the page escapes messages from files', () => {
  const report = aggregate([file('a/1.xml', [doc({ status: 'error', invoices: 0, message: '<script>alert(1)</script>' })])], {
    seconds: 1,
    pins: [],
    options: { validate: true, relations: true, provenance: false, timeoutSeconds: 60 },
  });
  expect(renderHtml(report)).not.toContain('<script>alert');
});
