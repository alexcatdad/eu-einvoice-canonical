import { beforeAll, describe, expect, test } from 'bun:test';
import { Ajv } from 'ajv';
import type { CanonicalInvoice } from '../src/canonical.js';
import { convert } from '../src/index.js';
import {
  AnnotationInputError,
  buildLineAnnotationInput,
  LINE_ANNOTATION_SCHEMA,
  type LineAnnotations,
  validateLineAnnotations,
} from '../src/relations/annotations.js';
import { toDecimal, toIsoDate } from '../src/values.js';
import { fixture } from './helpers.js';

let base: CanonicalInvoice;
beforeAll(async () => {
  const result = await convert(fixture('peppol-bis3-invoice.xml'), 'synthetic.xml');
  const outcome = result.outcomes[0];
  if (outcome.status !== 'ok') throw new Error('Fixture conversion failed');
  base = outcome.invoices[0];
  base.precedingInvoices = [];
  const product = structuredClone(base.lines[0]);
  base.lines = ['7', '19', '31'].map((id) => ({ ...structuredClone(product), id }));
  base.source.warnings = [];
});
const invoice = () => structuredClone(base);
const output = (): LineAnnotations => ({
  id: base.id,
  lines: [
    { id: '7', kind: 'goods', targets: [] },
    { id: '19', kind: 'descriptor', targets: ['7'] },
    { id: '31', kind: 'labour', targets: ['7'] },
  ],
});

describe('canonical field selection', () => {
  test('preserves separate text, identifiers, real header names, amounts and source evidence', () => {
    const doc = invoice();
    Object.assign(doc, {
      purchaseOrderRef: 'PO-17',
      salesOrderRef: 'SO-2',
      contractRef: 'C-3',
      projectRef: 'P-4',
      invoicePeriod: { start: toIsoDate('2026-10-01') },
    });
    Object.assign(doc.lines[0], { note: 'Includes inspection', quantity: undefined, price: undefined, netAmount: toDecimal('-12.00') });
    doc.lines[0].item.description = 'Description alongside a name';
    doc.lines[0].item.sellerId = 'SKU-4';
    doc.source.derived = [
      { field: '/lines/0/unitCode', rule: 'Mapped source unit' },
      { field: '/seller/name', rule: 'Unselected' },
    ];
    doc.source.warnings = [
      { code: 'SOURCE-NOTE', message: 'Source qualification', path: '/Invoice' },
      { code: 'LINE-RELATION-AMBIGUOUS', message: 'Heuristic' },
    ];
    doc.source.unmapped = { '/raw': '<not-for-model/>' };
    doc.lineRoles = { '7': 'discount' };
    const snapshot = structuredClone(doc);
    const input = buildLineAnnotationInput(doc);
    expect(input.lines).toEqual(doc.lines);
    expect(input.purchaseOrderRef).toBe('PO-17');
    expect(input.salesOrderRef).toBe('SO-2');
    expect(input.contractRef).toBe('C-3');
    expect(input.projectRef).toBe('P-4');
    expect(input.invoicePeriod).toEqual(doc.invoicePeriod);
    expect(input.lines[0].item.description).toBe('Description alongside a name');
    expect(input.lines[0].netAmount).toBe(toDecimal('-12.00'));
    expect(input.lines[0].quantity).toBeUndefined();
    expect(input.source.derived).toEqual([doc.source.derived[0]]);
    expect(input.source.warnings).toEqual([{ code: 'SOURCE-NOTE', message: 'Source qualification' }]);
    expect(JSON.stringify(input)).not.toContain('not-for-model');
    expect(input).not.toHaveProperty('lineRoles');
    expect(input).not.toHaveProperty('seller');
    expect(input).not.toHaveProperty('orderRef');
    expect(input).not.toHaveProperty('period');
    expect(doc).toEqual(snapshot);
    input.lines[0].item.name = 'Changed copy';
    input.source.derived[0].rule = 'Changed copy';
    expect(doc).toEqual(snapshot);
  });
  test.each([
    [
      'empty invoice ID',
      (d: CanonicalInvoice) => {
        d.id = ' ';
      },
    ],
    [
      'empty line ID',
      (d: CanonicalInvoice) => {
        d.lines[0].id = '';
      },
    ],
    [
      'reserved line ID',
      (d: CanonicalInvoice) => {
        d.lines[0].id = 'invoice';
      },
    ],
    [
      'duplicate line ID',
      (d: CanonicalInvoice) => {
        d.lines[1].id = '7';
      },
    ],
    [
      'empty invoice',
      (d: CanonicalInvoice) => {
        d.lines = [];
      },
    ],
    [
      'correction',
      (d: CanonicalInvoice) => {
        d.correction = { reason: 'Correction' };
      },
    ],
    [
      'preceding invoice',
      (d: CanonicalInvoice) => {
        d.precedingInvoices = [{ id: 'before' }];
      },
    ],
    [
      'national extension',
      (d: CanonicalInvoice) => {
        d.extensions = { ee: {} };
      },
    ],
    [
      'nested lines',
      (d: CanonicalInvoice) => {
        d.lines[0].subLines = [structuredClone(d.lines[1])];
      },
    ],
    [
      'before/after line',
      (d: CanonicalInvoice) => {
        d.lines[0].correctionState = 'before';
      },
    ],
    [
      'national line',
      (d: CanonicalInvoice) => {
        d.lines[0].national = { procedure: 'special' };
      },
    ],
    [
      'withholding line',
      (d: CanonicalInvoice) => {
        d.lines[0].subjectToWithholding = true;
      },
    ],
    [
      'synthetic source zero',
      (d: CanonicalInvoice) => {
        d.source.warnings = [{ code: 'TEXT_LINE', message: 'Amount absent' }];
      },
    ],
  ] as const)('rejects %s without mutation', (_, change) => {
    const doc = invoice();
    change(doc);
    const snapshot = structuredClone(doc);
    expect(() => buildLineAnnotationInput(doc)).toThrow(AnnotationInputError);
    expect(doc).toEqual(snapshot);
  });
  test('rejects credit notes and other invoice types', () => {
    const credit: CanonicalInvoice = { ...invoice(), kind: 'creditNote', typeCode: '381' };
    expect(() => buildLineAnnotationInput(credit)).toThrow(AnnotationInputError);
    expect(() => buildLineAnnotationInput({ ...invoice(), kind: 'invoice', typeCode: '389' })).toThrow(AnnotationInputError);
  });
});

describe('atomic annotation validation', () => {
  test('preserves distinct goods, descriptor and separately supplied labour', () => {
    const input = buildLineAnnotationInput(invoice());
    const out = output();
    const snapshot = structuredClone(out);
    const result = validateLineAnnotations(JSON.stringify(out), input);
    expect(result).toEqual({ ok: true, value: out });
    expect(out).toEqual(snapshot);
  });
  test('unknown role and subject uncertainty remain independent', () => {
    const input = buildLineAnnotationInput(invoice());
    const out = output();
    out.lines[0] = { id: '7', kind: 'unknown', targets: ['31'] };
    out.lines[1].targets = null;
    out.lines[2] = { id: '31', kind: 'item_unknown', targets: [] };
    expect(validateLineAnnotations(out, input)).toEqual({ ok: true, value: out });
  });
  test('supports whole-invoice adjustment and separate adjustment targets', () => {
    const input = buildLineAnnotationInput(invoice());
    const out = output();
    out.lines[1] = { id: '19', kind: 'adjustment', targets: ['invoice'] };
    out.lines[2] = { id: '31', kind: 'adjustment', targets: ['19'] };
    expect(validateLineAnnotations(out, input).ok).toBe(true);
  });
  test.each([
    [
      'changed invoice ID',
      (o: LineAnnotations) => {
        o.id = 'other';
      },
    ],
    [
      'omitted line',
      (o: LineAnnotations) => {
        o.lines.pop();
      },
    ],
    [
      'extra line',
      (o: LineAnnotations) => {
        o.lines.push({ id: '99', kind: 'goods', targets: [] });
      },
    ],
    [
      'duplicate line',
      (o: LineAnnotations) => {
        o.lines[1].id = '7';
      },
    ],
    [
      'reordered lines',
      (o: LineAnnotations) => {
        o.lines.reverse();
      },
    ],
    [
      'self target',
      (o: LineAnnotations) => {
        o.lines[1].targets = ['19'];
      },
    ],
    [
      'absent target',
      (o: LineAnnotations) => {
        o.lines[1].targets = ['99'];
      },
    ],
    [
      'duplicate target',
      (o: LineAnnotations) => {
        o.lines[1].targets = ['7', '7'];
      },
    ],
    [
      'mixed invoice scope',
      (o: LineAnnotations) => {
        o.lines[1].targets = ['invoice', '7'];
      },
    ],
    [
      'descriptor without subject state',
      (o: LineAnnotations) => {
        o.lines[1].targets = [];
      },
    ],
    [
      'adjustment without subject state',
      (o: LineAnnotations) => {
        o.lines[1] = { id: '19', kind: 'adjustment', targets: [] };
      },
    ],
  ] as const)('rejects %s as a whole', (_, change) => {
    const input = buildLineAnnotationInput(invoice());
    const out = output();
    change(out);
    const snapshot = structuredClone(out);
    const result = validateLineAnnotations(out, input);
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('value');
    if (!result.ok) expect(result.issues.length).toBeGreaterThan(0);
    expect(out).toEqual(snapshot);
  });
  test.each(['```json\n{}\n```', '{"id":', '{} {}', '{/* comments */}', '{"id":"x",}'])(
    'rejects nonstandard or incomplete response %s',
    (raw) => {
      expect(validateLineAnnotations(raw, buildLineAnnotationInput(invoice())).ok).toBe(false);
    },
  );
  test('rejects extra fields, wrong kinds, missing fields and non-string IDs', () => {
    const input = buildLineAnnotationInput(invoice());
    for (const raw of [
      null,
      {},
      [],
      { ...output(), reasoning: 'extra' },
      { ...output(), lines: [{ ...output().lines[0], amount: '12' }] },
      { ...output(), lines: [{ id: 7, kind: 'goods', targets: [] }] },
      { ...output(), lines: [{ id: '7', kind: 'made_up', targets: [] }] },
      { ...output(), lines: [{ id: '7', kind: 'goods' }] },
    ])
      expect(validateLineAnnotations(raw, input).ok).toBe(false);
  });
  test('rejects ambiguous source identity even when invoked directly', () => {
    expect(validateLineAnnotations(output(), { id: base.id, lines: [{ id: '7' }, { id: '7' }] }).ok).toBe(false);
  });
  test('exported JSON schema is strict and agrees with runtime shape checks', () => {
    const check = new Ajv({ strict: false }).compile(LINE_ANNOTATION_SCHEMA);
    expect(check(output())).toBe(true);
    expect(check({ ...output(), money: '10' })).toBe(false);
    expect(check({ ...output(), lines: [{ id: '7', kind: 'unknown', targets: null }] })).toBe(true);
    expect(check({ ...output(), lines: [{ id: '7', kind: 'unknown', targets: '7' }] })).toBe(false);
  });
});
