import { expect, test } from 'bun:test';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { aggregate, readBaseline, renderMarkdown } from '../scripts/pdf-eval/report.js';
import { decimal, fromInvoice, fromTruth, isKnownPointer, norm, score, type Truth, unflatten } from '../scripts/pdf-eval/score.js';
import { evaluatePaired, evaluateSwedish, readExclude } from '../scripts/pdf-eval.js';
import type { CanonicalInvoice } from '../src/canonical.js';
import { sha256Hex } from '../src/hash.js';
import type { PdfOutcome } from '../src/index.js';
import { fixturePath, parseOne } from './helpers.js';

// Synthetic values only: no corpus content.
const SHA = 'ab'.repeat(32);
const truth = (over: Partial<Truth> = {}): Truth => ({
  schemaVersion: 1,
  file: 'synthetic-1.pdf',
  sha256: SHA,
  documentType: 'invoice',
  typeCode: '380',
  invoicePages: [1],
  pricesIncludeVat: false,
  fields: {
    id: { value: '10 01' },
    issueDate: { value: '2026-01-02' },
    dueDate: { value: '2026-02-01' },
    currency: { value: 'SEK' },
    'seller.name': { value: 'Synthetic  Seller AB' },
    'seller.legalRegistrationId': { value: '5560000001' },
    'seller.vatId': { value: 'SE556000000101' },
    'payment.bankgiro': { value: '1234566' },
    'payment.remittanceInformation': { value: '1003' },
    'totals.vatTotal': { value: '25.00' },
    'totals.taxInclusive': { status: 'absent' },
    'totals.payable': { value: '125.00' },
    'buyer.name': { status: 'unreadable', note: 'masked' },
  },
  vatBreakdown: { rows: [{ categoryCode: 'S', rate: { value: '25' }, taxableAmount: { value: '100.00' }, taxAmount: { value: '25.00' } }] },
  lines: {
    rows: [
      {
        'item.name': { value: 'Widget' },
        quantity: { value: '2' },
        unitText: { value: 'st' },
        'price.net': { value: '30' },
        'vat.rate': { value: '25' },
        netAmount: { value: '60.00' },
      },
      {
        'item.name': { value: 'Gadget' },
        quantity: { value: '1' },
        unitText: { value: 'st' },
        'price.net': { value: '40' },
        'vat.rate': { value: '25' },
        netAmount: { value: '40.00' },
      },
    ],
  },
  ...over,
});

const pdf = { sha256: SHA, byteLength: 1 };
const line = (name: string, qty: string, price: string, net: string) => ({
  item: { name: name },
  quantity: qty,
  unitText: 'st',
  price: { net: price },
  vat: { categoryCode: 'S', rate: '25.00' },
  netAmount: net,
});
const invoice = (over: Record<string, unknown> = {}, warnings: { code: string; message: string; field?: string }[] = []) =>
  ({
    kind: 'invoice',
    typeCode: '380',
    id: '1001',
    issueDate: '2026-01-02',
    dueDate: '2026-02-01',
    currency: 'SEK',
    notes: [],
    seller: { name: 'Synthetic Seller AB', legalRegistrationId: { value: '556000-0001' }, vatId: 'se 5560000001 01', identifiers: [] },
    buyer: { name: 'Anyone' },
    payments: [
      { meansCode: '30', remittanceInformation: '10 03', creditTransfers: [{ accountId: '123-4566', serviceProviderId: 'SE:BANKGIRO' }] },
    ],
    totals: { vatTotal: '25', taxInclusive: '125.00', payable: '125.0' },
    vatBreakdown: [{ categoryCode: 'S', rate: '25', taxableAmount: '100', taxAmount: '25.00' }],
    lines: [line('Widget', '2.000', '30.00', '60'), line('Gadget', '1', '40', '40.00')],
    source: { warnings },
    ...over,
  }) as unknown as CanonicalInvoice;
const ok = (inv: CanonicalInvoice): PdfOutcome => ({ status: 'ok', invoices: [inv], pdf });

test('decimals compare exactly, without floats', () => {
  expect(decimal('1234.50')).toBe('1234.5');
  expect(decimal('25')).toBe(decimal('25.00'));
  expect(decimal('-0.00')).toBe('0');
  expect(decimal('0.1')).not.toBe(decimal('0.10000000000000001'));
  expect(decimal('12,50')).toBeNull();
  expect(norm('digits', '123-4566')).toBe('1234566');
  expect(norm('digits', 'RE-1', false)).toBe('RE-1');
  expect(norm('upper', 'se 5560000001 01')).toBe('SE556000000101');
});

test('a complete, matching invoice scores every printed field correct', () => {
  const s = score(fromTruth(truth()), ok(invoice()));
  const sum = (v: string) => Object.values(s.fields).reduce((n, c) => n + ((c as Record<string, number>)[v] ?? 0), 0);
  expect(sum('wrong')).toBe(0);
  expect(sum('missing')).toBe(0);
  expect(s.fields.id?.correct).toBe(1);
  expect(s.fields['payment.bankgiro']?.correct).toBe(1);
  expect(s.fields['lines.quantity']?.correct).toBe(2);
  expect(s.fields['vatBreakdown.rows']?.correct).toBe(1);
  // Printed-only key: a computed total where the key is absent is its own bucket, never wrong.
  expect(s.fields['totals.taxInclusive']).toEqual({ extraOnAbsent: 1 });
  expect(s.fields['buyer.name']).toEqual({ extraOnAbsent: 1 });
});

test('wrong, missing and reported-missing values are told apart', () => {
  const inv = invoice({ dueDate: '2026-03-01', totals: { vatTotal: '25.00', payable: '125.00' } }, [
    { code: 'missing-field', message: 'x', field: '/seller/vatId' },
  ]);
  (inv.seller as { vatId?: string }).vatId = undefined;
  (inv as { currency?: string }).currency = undefined;
  const s = score(fromTruth(truth()), ok(inv));
  expect(s.fields.dueDate).toEqual({ wrong: 1 });
  expect(s.fields['seller.vatId']).toEqual({ missing: 1, missingReported: 1 });
  expect(s.fields.currency).toEqual({ missing: 1 });
  expect(s.problemCodes).toEqual(['missing-field']);
});

test('unsupported documents count truth values as not extracted', () => {
  const s = score(fromTruth(truth()), { status: 'unsupported', pdf, reason: 'no text' });
  expect(s.status).toBe('unsupported');
  expect(s.fields.id).toEqual({ notExtracted: 1 });
  expect(s.fields['totals.taxInclusive']).toEqual({ notScored: 1 });
  expect(s.fields['lines.count']).toEqual({ notExtracted: 1 });
});

test('drafts are read through their JSON Pointers; unknown pointers are reported as patterns', () => {
  const fields = {
    '/id': '1001',
    '/totals/payable': '125.00',
    '/payments/0/creditTransfers/0/accountId': '1234566',
    '/payments/0/creditTransfers/0/serviceProviderId': 'SE:BANKGIRO',
    '/lines/0/item/name': 'Widget',
    '/lines/3/surprise': 'x',
  };
  expect(unflatten(fields).payments[0].creditTransfers[0].accountId).toBe('1234566');
  expect(isKnownPointer('/lines/12/item/name')).toBe(true);
  const s = score(fromTruth(truth()), { status: 'draft', pdf, draft: { fields, pdfProvenance: {}, problems: [] } });
  expect(s.fields.id).toEqual({ correct: 1 });
  expect(s.fields['payment.bankgiro']).toEqual({ correct: 1 });
  expect(s.fields.issueDate).toEqual({ missing: 1 });
  expect(s.unmappedPointers).toEqual(['/lines/N/surprise']);
});

test('expected problems: identifiers flagged not fixed, non-reconciling documents only as drafts', () => {
  const t = truth({
    expectedProblems: [
      { path: 'fields.payment.bankgiro', kind: 'identifier-check', detail: 'synthetic' },
      { path: 'fields.seller.vatId', kind: 'identifier-check', detail: 'synthetic' },
      { path: 'fields.payment.remittanceInformation', kind: 'identifier-check', detail: 'synthetic' },
      { path: 'vatBreakdown.rows[0]', kind: 'not-reconciling', detail: 'synthetic' },
    ],
  });
  const inv = invoice(
    { payments: [{ remittanceInformation: '9999', creditTransfers: [{ accountId: '1234566', serviceProviderId: 'SE:BANKGIRO' }] }] },
    [{ code: 'identifier-check', message: 'x', field: '/payments/0/creditTransfers/0/accountId' }],
  );
  const s = score(fromTruth(t), ok(inv));
  // Bankgiro kept as printed and flagged; VAT id kept but not flagged; OCR "corrected" to another value.
  expect(s.identifierChecks).toEqual({ expected: 3, flagged: 1, unflagged: 1, corrected: 1 });
  expect(s.notReconciling).toBe('unflagged');
  const d = score(fromTruth(t), { status: 'draft', pdf, draft: { fields: {}, pdfProvenance: {}, problems: [] } });
  expect(d.notReconciling).toBe('flagged');
});

test('a different line count is one wrong value, not a cascade', () => {
  const s = score(
    fromTruth(truth()),
    ok(invoice({ lines: [line('Widget', '2', '30', '60'), line('Gad', '1', '20', '20'), line('Gadget', '1', '20', '20')] })),
  );
  expect(s.fields['lines.count']).toEqual({ wrong: 1 });
  expect(s.fields['lines.netAmount']).toEqual({ unaligned: 2 });
});

test('VAT rows match by category and rate; an invented row is wrong', () => {
  const vat = [
    { categoryCode: 'S', rate: '25.0', taxableAmount: '100.00', taxAmount: '25' },
    { categoryCode: 'S', rate: '12', taxableAmount: '10', taxAmount: '1.20' },
  ];
  const s = score(fromTruth(truth()), ok(invoice({ vatBreakdown: vat })));
  expect(s.fields['vatBreakdown.taxAmount']).toEqual({ correct: 1 });
  expect(s.fields['vatBreakdown.rows']).toEqual({ correct: 1, wrong: 1 });
});

test('VAT rows: a missing rate is 0, rows with the same key are matched once each', () => {
  const t = truth({
    vatBreakdown: {
      rows: [
        { categoryCode: 'E', rate: { value: '0' }, taxableAmount: { value: '10.00' }, taxAmount: { value: '0.00' } },
        { categoryCode: 'S', rate: { status: 'unreadable' }, taxableAmount: { value: '100.00' }, taxAmount: { value: '25.00' } },
      ],
    },
  });
  const vat = [
    { categoryCode: 'S', rate: '25', taxableAmount: '100', taxAmount: '25' },
    { categoryCode: 'E', taxableAmount: '10', taxAmount: '0' },
    { categoryCode: 'S', rate: '25', taxableAmount: '100', taxAmount: '25' },
  ];
  const s = score(fromTruth(t), ok(invoice({ vatBreakdown: vat })));
  expect(s.fields['vatBreakdown.taxableAmount']).toEqual({ correct: 2 });
  expect(s.fields['vatBreakdown.rows']).toEqual({ correct: 2, wrong: 1 });
});

test('VAT-inclusive line amounts are not scored', () => {
  const s = score(
    fromTruth(truth({ pricesIncludeVat: true })),
    ok(invoice({ lines: [line('Widget', '2', '37.5', '75'), line('Gadget', '1', '50', '50')] })),
  );
  expect(s.fields['lines.netAmount']).toEqual({ notScored: 2 });
  expect(s.fields['lines.price.net']).toEqual({ notScored: 2 });
  expect(s.fields['lines.quantity']).toEqual({ correct: 2 });
});

test('an invoice from embedded XML is a key for itself', async () => {
  const inv = await parseOne('facturx-en16931.pdf');
  const exp = fromInvoice(inv, 'x/y.pdf', 'facturx');
  const s = score(exp, ok(inv));
  const wrong = Object.values(s.fields).reduce((n, c) => n + (c.wrong ?? 0) + (c.missing ?? 0), 0);
  expect(wrong).toBe(0);
  expect(s.fields.id).toEqual({ correct: 1 });
});

test('the report holds counts and ids only, and the gate fails on a wrong value', () => {
  const t = truth();
  const bad = score(fromTruth(t), ok(invoice({ id: 'SECRET-ID-777' })));
  const report = aggregate(
    [bad, score(fromTruth({ ...t, sha256: 'cd'.repeat(32) }), { status: 'unsupported', pdf, reason: "Garbled text on page 3 'Foo'" })],
    {
      mode: 'swedish',
      generatedAt: 'T',
    },
  );
  expect(report.gate).toMatchObject({ wrong: 1, errors: 0, extracted: 1, passed: false, failures: ['1 wrong values'] });
  expect(report.documents).toMatchObject({ total: 2, ok: 1, unsupported: 1, withWrong: ['abababababab'] });
  expect(report.totals.scored).toBeGreaterThan(0);
  expect(report.unsupported[0]).toMatchObject({ message: "Garbled text on page N '…'", count: 1, examples: ['cdcdcdcdcdcd'] });
  const text = JSON.stringify(report) + renderMarkdown(report);
  for (const v of ['SECRET-ID-777', 'Synthetic', 'Widget', '1234566', 'synthetic-1']) expect(text).not.toContain(v);
  const counts = renderMarkdown(report, true);
  expect(counts).toContain('Documents with wrong values: 1.');
  for (const v of ['abababababab', 'cdcdcdcdcdcd', 'Garbled']) expect(counts).not.toContain(v);
});

test('the gate fails when extraction collapses, even with no wrong value', () => {
  const t = truth();
  const failed = (outcome: Parameters<typeof score>[1]) =>
    aggregate([score(fromTruth(t), outcome)], { mode: 'swedish', generatedAt: 'T' }).gate;
  expect(failed({ status: 'error', pdf, error: 'Internal error: x' })).toMatchObject({
    wrong: 0,
    passed: false,
    failures: ['1 documents errored', 'no values scored', 'no ok or draft documents'],
  });
  expect(failed({ status: 'unsupported', pdf, reason: 'no text' }).failures).toEqual(['no values scored', 'no ok or draft documents']);
  const unsupported = score(fromTruth(t), { status: 'unsupported', pdf, reason: 'no text' });
  const partial = aggregate([score(fromTruth(t), ok(invoice())), unsupported, unsupported], { mode: 'swedish', generatedAt: 'T' });
  expect(partial.gate.failures).toEqual(['only 1 documents ok or draft']);
  expect(renderMarkdown(partial, true)).toContain('Gate: **failed (only 1 documents ok or draft)**, 0 wrong of');
  expect(aggregate([], { mode: 'swedish', generatedAt: 'T' }).gate.failures).toEqual(['no values scored', 'no ok or draft documents']);
  expect(failed(ok(invoice()))).toMatchObject({ passed: true, failures: [] });
});

test('the gate fails when results drop below the committed baseline, though above half the documents', () => {
  const t = truth();
  const docs = (unsupported: number) => [
    ...Array.from({ length: 4 - unsupported }, () => score(fromTruth(t), ok(invoice()))),
    ...Array.from({ length: unsupported }, () => score(fromTruth(t), { status: 'unsupported', pdf, reason: 'no text' })),
  ];
  const correct = aggregate(docs(0), { mode: 'swedish', generatedAt: 'T' }).totals.correct;
  const baseline = { ok: 4, okOrDraft: 4, correct };
  expect(aggregate(docs(0), { mode: 'swedish', generatedAt: 'T', baseline }).gate).toMatchObject({ passed: true, baseline });
  // One document of four turns unsupported: still above half, but below the baseline
  const partial = aggregate(docs(1), { mode: 'swedish', generatedAt: 'T', baseline });
  expect(partial.gate.failures).toEqual([
    '3 ok documents, baseline 4',
    '3 ok or draft documents, baseline 4',
    `${(correct * 3) / 4} correct values, baseline ${correct}`,
  ]);
  const md = renderMarkdown(partial, true);
  expect(md).toContain('Baseline: at least 4 ok, 4 ok or draft documents');
  // Fewer correct values alone also fail
  const fewer = aggregate(docs(0), { mode: 'swedish', generatedAt: 'T', baseline: { ...baseline, correct: correct + 1 } });
  expect(fewer.gate.failures).toEqual([`${correct} correct values, baseline ${correct + 1}`]);
});

test('a baseline file must hold the three counts as non-negative integers', () => {
  expect(readBaseline('{"ok":1,"okOrDraft":2,"correct":3}')).toEqual({ ok: 1, okOrDraft: 2, correct: 3 });
  expect(() => readBaseline('{"ok":1,"okOrDraft":2}')).toThrow('correct must be a non-negative integer');
  expect(() => readBaseline('{"ok":-1,"okOrDraft":2,"correct":3}')).toThrow('ok must be');
  expect(() => readBaseline('not json')).toThrow();
});

for (const set of ['swedish', 'synthetic'])
  test(`the committed ${set} baseline holds counts only`, () => {
    const text = readFileSync(join(import.meta.dir, '..', 'scripts', 'pdf-eval', `baseline-${set}.json`), 'utf8');
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(['correct', 'ok', 'okOrDraft']);
    expect(readBaseline(text).okOrDraft).toBeGreaterThan(0);
  });

async function blankPdf() {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  return doc.save();
}

test('Swedish mode reads truth/ next to the PDFs and checks their SHA-256', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pdf-eval-se-'));
  mkdirSync(join(dir, 'truth'));
  const bytes = await blankPdf();
  writeFileSync(join(dir, 'a-1.pdf'), bytes);
  writeFileSync(join(dir, 'b-1.pdf'), bytes);
  writeFileSync(join(dir, 'truth', 'a-1.json'), JSON.stringify(truth({ file: 'a-1.pdf', sha256: await sha256Hex(bytes) })));
  writeFileSync(join(dir, 'truth', 'b-1.json'), JSON.stringify(truth({ file: 'b-1.pdf' })));
  writeFileSync(join(dir, 'truth', 'truth.schema.json'), '{"type":"object"}');
  const r = await evaluateSwedish(dir);
  expect(r.documents.total).toBe(2);
  expect(r.documents.unsupported).toBe(1); // a page without text
  expect(r.errors).toEqual([{ message: 'PDF does not match the truth file SHA-N', count: 1, examples: ['abababababab'] }]);
  expect(r.gate).toMatchObject({
    wrong: 0,
    passed: false,
    failures: ['1 documents errored', 'no values scored', 'no ok or draft documents'],
  });
});

test('paired mode keys hybrid PDFs by their XML, skips others, and honours the exclude list', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pdf-eval-paired-'));
  mkdirSync(join(dir, 'corpus'));
  copyFileSync(fixturePath('facturx-en16931.pdf'), join(dir, 'corpus', 'hybrid.pdf'));
  writeFileSync(join(dir, 'corpus', 'plain.pdf'), await blankPdf());
  const r = await evaluatePaired(dir);
  expect(r.documents.total).toBe(1);
  expect(r.noReference).toBe(1);
  expect(Object.values(r.byDocType).map((t) => t.documents)).toEqual([1]);
  const exclude = join(dir, 'exclude.txt');
  writeFileSync(exclude, '# comment\ncorpus/hybrid.pdf  # page shows other totals\n');
  const x = await evaluatePaired(join(dir), readExclude(exclude));
  expect(x.documents.total).toBe(0);
  expect(x.excluded).toEqual(['corpus/hybrid.pdf']);
  expect(renderMarkdown(x)).toContain('- corpus/hybrid.pdf');
});
