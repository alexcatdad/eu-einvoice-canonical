import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXIT } from '../src/cli.js';
import type { CanonicalInvoice, Line } from '../src/index.js';
import {
  isOrderXml,
  MatchInputError,
  matchInvoice,
  parseOrder,
  parsePurchaseOrdersJson,
  parseReceiptsJson,
  similarity,
} from '../src/matching/index.js';
import type { PoLine, PurchaseOrder } from '../src/matching/types.js';
import { abs, div, mul } from '../src/values.js';
import { fixturePath, parseOne } from './helpers.js';

interface L {
  id: string;
  name?: string;
  qty?: string;
  amount: string;
  price?: string;
  unit?: string;
  ref?: string;
  order?: string;
  sellerId?: string;
  buyerId?: string;
  gtin?: string;
  vat?: string;
}

const line = (l: L): Line =>
  ({
    id: l.id,
    quantity: l.qty,
    unitCode: l.unit,
    netAmount: l.amount,
    orderLineRef: l.ref,
    price: l.price ? { net: l.price } : undefined,
    vat: l.vat ? { categoryCode: 'S', rate: l.vat } : undefined,
    national: l.order ? { orderReference: l.order } : undefined,
    allowances: [],
    charges: [],
    item: {
      name: l.name ?? '',
      sellerId: l.sellerId,
      buyerId: l.buyerId,
      standardId: l.gtin ? { value: l.gtin, schemeId: '0160' } : undefined,
      classifications: [],
      attributes: [],
    },
  }) as unknown as Line;

const invoice = (lines: L[], extra: Partial<CanonicalInvoice> = {}): CanonicalInvoice =>
  ({
    id: 'INV-1',
    kind: 'invoice',
    currency: 'SEK',
    purchaseOrderRef: 'PO-1',
    lines: lines.map(line),
    ...extra,
  }) as unknown as CanonicalInvoice;

const po = (lines: Partial<PoLine>[], id = 'PO-1'): PurchaseOrder => ({
  id,
  currency: 'SEK',
  lines: lines.map((l) => ({ quantity: '10', unitPrice: '25.00', unit: 'H87', ...l, id: l.id ?? '1' }) as PoLine),
});

describe('two-way match', () => {
  test('exact match by order line reference', () => {
    const r = matchInvoice(
      invoice([
        { id: 'a', ref: '1', name: 'Hyllkonsol', qty: '10', unit: 'H87', price: '25.00', amount: '250.00', vat: '25' },
        { id: 'b', ref: '2', name: 'Montering', qty: '2', unit: 'HUR', price: '950.00', amount: '1900.00' },
      ]),
      [
        po([
          { id: '1', vat: { categoryCode: 'S', rate: '25' } },
          { id: '2', quantity: '2', unit: 'HUR', unitPrice: '950.00' },
        ]),
      ],
    );
    expect(r.verdict).toBe('match');
    expect(r.lines.map((l) => [l.status, l.method, l.confidence])).toEqual([
      ['matched', 'reference', 'high'],
      ['matched', 'reference', 'high'],
    ]);
    expect(r.lines[0]!.poLines).toEqual([{ poId: 'PO-1', lineId: '1' }]);
    expect(r.lines[0]!.variances.quantity?.status).toBe('exact');
    expect(r.lines[0]!.variances.unitPrice?.status).toBe('exact');
    expect(r.lines[0]!.variances.total?.status).toBe('exact');
    expect(r.lines[0]!.variances.vat?.status).toBe('exact');
    expect(r.threeWay).toBe(false);
    expect(r.unmatchedInvoiceLines).toEqual([]);
    expect(r.overInvoiced).toEqual([]);
    expect(r.purchaseOrderIds).toEqual(['PO-1']);
  });

  test('item identifiers when there is no line reference, and the Peppol fixture end to end', async () => {
    const r = matchInvoice(
      invoice([
        { id: 'a', gtin: '07300010000106', qty: '10', unit: 'H87', price: '25.00', amount: '250.00' },
        { id: 'b', sellerId: 'X-9', qty: '10', price: '25.00', amount: '250.00' },
      ]),
      [
        po([
          { id: '1', standardItemId: { value: '7300010000106' } },
          { id: '2', sellerItemId: 'x-9' },
        ]),
      ],
    );
    expect(r.lines.map((l) => [l.method, l.confidence, l.poLines[0]!.lineId])).toEqual([
      ['item', 'high', '1'],
      ['item', 'medium', '2'],
    ]);
    expect(r.verdict).toBe('match');

    const inv = await parseOne('peppol-bis3-invoice.xml');
    const fx = matchInvoice(inv, [
      po(
        [
          { id: '1', description: 'Hyllkonsol', sellerItemId: 'HK-10', vat: { categoryCode: 'S', rate: '25' } },
          { id: '9', description: 'Montering', quantity: '2', unit: 'HUR', unitPrice: '950.00' },
          { id: '10', description: 'Fika till montörer', quantity: '3', unit: 'C62', unitPrice: '120.00' },
          { id: '11', description: 'Skruv 4x40', quantity: '1000', unit: 'C62', unitPrice: '45.00', baseQuantity: '100' },
        ],
        'PO-1001',
      ),
    ]);
    expect(fx.lines[0]).toMatchObject({ method: 'reference', confidence: 'high', status: 'matched' });
    expect(fx.lines[0]!.variances.total?.status).toBe('exact');
    // The others carry no order line reference: description is the last resort, flagged for review.
    expect(fx.lines.slice(1).map((l) => [l.method, l.confidence, l.poLines[0]?.lineId])).toEqual([
      ['description', 'low', '9'],
      ['description', 'low', '10'],
      ['description', 'low', '11'],
    ]);
    expect(fx.lines[3]!.variances.unitPrice?.status).toBe('exact');
    expect(fx.lines[3]!.variances.total?.status).toBe('exact');
    expect(fx.verdict).toBe('needs-review');
    expect(fx.findings.some((f) => f.code === 'LOW_CONFIDENCE_MATCH')).toBe(true);
  });

  test('description similarity is a last resort, needs a clear winner and is never trusted', () => {
    expect(similarity('Skruv 4x40', 'skruv 4X40')).toBe(1);
    expect(similarity('Dörr', 'Door')).toBe(0);
    const r = matchInvoice(invoice([{ id: 'a', name: 'Blå hyllkonsol ek', qty: '10', price: '25.00', amount: '250.00' }]), [
      po([
        { id: '1', description: 'Hyllkonsol ek blå' },
        { id: '2', description: 'Skruv' },
      ]),
    ]);
    expect(r.lines[0]).toMatchObject({ method: 'description', confidence: 'low', similarity: '1.00' });
    expect(r.verdict).toBe('needs-review');
    const ambiguous = matchInvoice(invoice([{ id: 'a', name: 'Hyllkonsol', qty: '10', price: '25.00', amount: '250.00' }]), [
      po([
        { id: '1', description: 'Hyllkonsol' },
        { id: '2', description: 'Hyllkonsol' },
      ]),
    ]);
    expect(ambiguous.lines[0]!.status).toBe('unmatched');
    expect(ambiguous.unmatchedInvoiceLines).toEqual(['a']);
    expect(ambiguous.verdict).toBe('needs-review');
  });

  test('a reference that contradicts the item identifiers is low confidence', () => {
    const r = matchInvoice(invoice([{ id: 'a', ref: '1', sellerId: 'ZZ', qty: '10', price: '25.00', amount: '250.00' }]), [
      po([{ id: '1', sellerItemId: 'AA' }]),
    ]);
    expect(r.lines[0]).toMatchObject({ method: 'reference', confidence: 'low' });
    expect(r.verdict).toBe('needs-review');
  });
});

describe('variances and tolerances', () => {
  const priced = (price: string, amount: string) => invoice([{ id: 'a', ref: '1', qty: '10', unit: 'H87', price, amount }]);
  const order = [po([{ id: '1' }])];
  const tol = { unitPrice: { percent: '2' }, total: { percent: '2' } };

  test('a price variance inside tolerance', () => {
    const r = matchInvoice(priced('25.40', '254.00'), order, { tolerances: tol });
    const v = r.lines[0]!.variances;
    expect(v.unitPrice).toMatchObject({
      invoiced: '25.40',
      expected: '25.00',
      difference: '0.40',
      percent: '1.6000',
      status: 'within-tolerance',
    });
    expect(v.total).toMatchObject({ invoiced: '254.00', expected: '250.00', difference: '4.00', status: 'within-tolerance' });
    expect(r.verdict).toBe('within-tolerance');
  });

  test('the same variance outside a tighter tolerance, or with none', () => {
    const tight = matchInvoice(priced('25.40', '254.00'), order, { tolerances: { unitPrice: { percent: '1' }, total: { percent: '1' } } });
    expect(tight.lines[0]!.variances.unitPrice!.status).toBe('exceeded');
    expect(tight.verdict).toBe('needs-review');
    expect(matchInvoice(priced('25.40', '254.00'), order).verdict).toBe('needs-review');
  });

  test('absolute and percent limits must both hold', () => {
    const both = matchInvoice(priced('25.40', '254.00'), order, {
      tolerances: { unitPrice: { percent: '5', absolute: '0.10' }, total: { percent: '5', absolute: '10' } },
    });
    expect(both.lines[0]!.variances.unitPrice!.status).toBe('exceeded');
    expect(both.lines[0]!.variances.total!.status).toBe('within-tolerance');
  });

  test('VAT rate and category variances', () => {
    const inv = invoice([{ id: 'a', ref: '1', qty: '10', price: '25.00', amount: '250.00', vat: '12' }]);
    const r = matchInvoice(inv, [po([{ id: '1', vat: { categoryCode: 'S', rate: '25' } }])]);
    expect(r.lines[0]!.variances.vat).toMatchObject({ rateDifference: '-13', status: 'exceeded', categoryMismatch: false });
    const ok = matchInvoice(inv, [po([{ id: '1', vat: { rate: '12.5' } }])], { tolerances: { vat: { absolute: '1' } } });
    expect(ok.lines[0]!.variances.vat!.status).toBe('within-tolerance');
  });

  test('unit mismatch and currency mismatch need review', () => {
    const r = matchInvoice(invoice([{ id: 'a', ref: '1', qty: '10', unit: 'KGM', price: '25.00', amount: '250.00' }]), [
      { ...po([{ id: '1' }]), currency: 'EUR' },
    ]);
    expect(r.findings.map((f) => f.code).sort()).toEqual(['CURRENCY_MISMATCH', 'UNIT_MISMATCH']);
    expect(r.verdict).toBe('needs-review');
  });
});

describe('three-way match and partial delivery', () => {
  const order = [po([{ id: '1' }])];
  const receipts = [{ poId: 'PO-1', lines: [{ lineId: '1', quantity: '6' }] }];

  test('invoicing what was received matches; the rest is reported as not yet received', () => {
    const r = matchInvoice(invoice([{ id: 'a', ref: '1', qty: '6', price: '25.00', amount: '150.00' }]), order, { receipts });
    expect(r.threeWay).toBe(true);
    expect(r.verdict).toBe('match');
    expect(r.lines[0]!.variances.quantity).toMatchObject({ invoiced: '6', expected: '6', status: 'exact' });
    expect(r.notYetReceived).toEqual([{ poId: 'PO-1', lineId: '1', ordered: '10', received: '6', outstanding: '4' }]);
    expect(r.overInvoiced).toEqual([]);
  });

  test('invoicing the whole order after a partial delivery is over-invoiced against the receipt', () => {
    const r = matchInvoice(invoice([{ id: 'a', ref: '1', qty: '10', price: '25.00', amount: '250.00' }]), order, { receipts });
    expect(r.verdict).toBe('needs-review');
    expect(r.overInvoiced).toEqual([
      { poId: 'PO-1', lineId: '1', ordered: '10', received: '6', invoiced: '10', limit: 'received', excess: '4' },
    ]);
    expect(r.lines[0]!.variances.quantity!.status).toBe('exceeded');
  });

  test('a missing receipt line means nothing was received', () => {
    const r = matchInvoice(invoice([{ id: 'a', ref: '1', qty: '1', price: '25.00', amount: '25.00' }]), order, { receipts: [] });
    expect(r.verdict).toBe('needs-review');
    expect(r.overInvoiced[0]).toMatchObject({ limit: 'received', received: '0' });
  });

  test('two-way: invoicing part of the order is partial invoicing, not an error; earlier invoices count', () => {
    const partial = matchInvoice(invoice([{ id: 'a', ref: '1', qty: '4', price: '25.00', amount: '100.00' }]), order);
    expect(partial.lines[0]!.variances.quantity).toMatchObject({ partial: true, status: 'within-tolerance' });
    expect(partial.verdict).toBe('within-tolerance');
    const prev = [po([{ id: '1', invoicedQuantity: '6' }])];
    expect(matchInvoice(invoice([{ id: 'a', ref: '1', qty: '4', price: '25.00', amount: '100.00' }]), prev).verdict).toBe('match');
    const over = matchInvoice(invoice([{ id: 'a', ref: '1', qty: '5', price: '25.00', amount: '125.00' }]), prev);
    expect(over.overInvoiced[0]).toMatchObject({ invoiced: '11', excess: '1', limit: 'ordered' });
    expect(over.verdict).toBe('needs-review');
  });

  test('quantity tolerance forgives a small excess', () => {
    const r = matchInvoice(invoice([{ id: 'a', ref: '1', qty: '10.2', price: '25.00', amount: '255.00' }]), order, {
      tolerances: { quantity: { absolute: '0.5' }, total: { percent: '5' } },
    });
    expect(r.overInvoiced).toEqual([]);
    expect(r.verdict).toBe('within-tolerance');
  });

  test('receipts for unknown orders and lines are reported', () => {
    const r = matchInvoice(invoice([{ id: 'a', ref: '1', qty: '6', price: '25.00', amount: '150.00' }]), order, {
      receipts: [
        { poId: 'NOPE', lines: [] },
        {
          poId: 'PO-1',
          lines: [
            { lineId: '7', quantity: '1' },
            { lineId: '1', quantity: '6' },
          ],
        },
      ],
    });
    expect(r.findings.map((f) => f.code).sort()).toEqual(['RECEIPT_UNASSIGNED', 'RECEIPT_UNKNOWN_LINE']);
  });
});

describe('line roles and relations', () => {
  test('descriptor lines are ignored and a markup follows the line it applies to', () => {
    const r = matchInvoice(
      invoice([
        { id: '1', name: 'Rubrik', amount: '0.00' },
        { id: '2', ref: '1', name: 'Dörr', qty: '1', price: '1000.00', amount: '1000.00' },
        { id: '3', name: 'Materialpåslag 10 %', qty: '1', price: '100.00', amount: '100.00' },
      ]),
      [po([{ id: '1', quantity: '1', unitPrice: '1000.00' }])],
    );
    expect(r.lines[0]).toMatchObject({ status: 'ignored', role: 'heading', poLines: [] });
    expect(r.lines[1]).toMatchObject({ method: 'reference', status: 'matched' });
    expect(r.lines[2]).toMatchObject({
      method: 'relation',
      role: 'surcharge',
      confidence: 'high',
      appliesTo: ['2'],
      poLines: [{ poId: 'PO-1', lineId: '1' }],
    });
    expect(r.lines[2]!.variances).toEqual({});
    expect(r.unmatchedInvoiceLines).toEqual([]);
    expect(r.verdict).toBe('match');
    expect(r.findings.map((f) => f.code)).toEqual(['ADJUSTMENT_NOT_ON_ORDER']);
  });

  test('the Svefaktura example: three descriptors, an item, its 10 % markup and a second item', async () => {
    const inv = await parseOne('svefaktura-1.0-descriptors.xml');
    expect(inv.lines[3]!.national).toEqual({ orderReference: 'AVR026226' });
    const r = matchInvoice(inv, [
      po(
        [
          { id: 'A', description: '19st Aluminiumdörrar (IADP01) (Ändring till 20st)', quantity: '1', unitPrice: '337170', unit: 'st' },
          { id: 'B', description: 'Dörrgångjärn (syntetisk testrad)', quantity: '20', unitPrice: '100', unit: 'st' },
        ],
        'AVR026226',
      ),
    ]);
    expect(r.lines.map((l) => l.status)).toEqual(['ignored', 'ignored', 'ignored', 'matched', 'matched', 'matched']);
    expect(r.lines[4]).toMatchObject({ method: 'relation', appliesTo: ['4'], poLines: [{ poId: 'AVR026226', lineId: 'A' }] });
    expect(r.lines[3]).toMatchObject({ method: 'description', similarity: '1.00' });
    expect(r.lines[3]!.variances.total?.status).toBe('exact');
    expect(r.lines[5]!.variances.quantity?.status).toBe('exact');
    expect(r.verdict).toBe('needs-review');
  });

  test('a markup whose target is not matched is unmatched, and a relation never rescues an unknown line', () => {
    const r = matchInvoice(
      invoice([
        { id: '1', name: 'Okänd vara', qty: '1', price: '1000.00', amount: '1000.00' },
        { id: '2', name: 'Påslag 10 %', qty: '1', price: '100.00', amount: '100.00' },
      ]),
      [po([{ id: '1', description: 'Något helt annat' }])],
    );
    expect(r.unmatchedInvoiceLines).toEqual(['1', '2']);
    expect(r.verdict).toBe('needs-review');
  });

  test('an invoice with nothing but text lines has nothing to match', () => {
    const r = matchInvoice(invoice([{ id: '1', name: 'Bara text', amount: '0.00' }]), [po([{ id: '1' }])]);
    expect(r.findings.map((f) => f.code)).toEqual(['NO_LINES']);
    expect(r.verdict).toBe('needs-review');
  });
});

describe('credit notes', () => {
  test('a credit note against a PO credits at the PO price and may credit part of the quantity', () => {
    const cn = invoice([{ id: 'a', ref: '1', qty: '3', unit: 'H87', price: '25.00', amount: '75.00' }], { kind: 'creditNote' });
    const r = matchInvoice(cn, [po([{ id: '1', invoicedQuantity: '10' }])]);
    expect(r.kind).toBe('creditNote');
    expect(r.lines[0]!.variances.quantity).toMatchObject({ invoiced: '3', expected: '10', partial: true });
    expect(r.lines[0]!.variances.unitPrice!.status).toBe('exact');
    expect(r.lines[0]!.variances.total!.status).toBe('exact');
    expect(r.overInvoiced).toEqual([]);
    expect(r.verdict).toBe('within-tolerance');
  });

  test('negative amounts on a credit note and crediting more than was invoiced', () => {
    const neg = invoice([{ id: 'a', ref: '1', qty: '-3', price: '-25.00', amount: '-75.00' }], { kind: 'creditNote' });
    expect(matchInvoice(neg, [po([{ id: '1', invoicedQuantity: '10' }])]).lines[0]!.variances.unitPrice!.status).toBe('exact');
    const too = invoice([{ id: 'a', ref: '1', qty: '12', price: '25.00', amount: '300.00' }], { kind: 'creditNote' });
    const r = matchInvoice(too, [po([{ id: '1', invoicedQuantity: '10' }])]);
    expect(r.lines[0]!.variances.quantity!.status).toBe('exceeded');
    expect(r.verdict).toBe('needs-review');
  });

  test('crediting what an earlier invoice charged in full leaves the order line uninvoiced', () => {
    const cn = invoice([{ id: 'a', ref: '1', qty: '10', price: '25.00', amount: '250.00' }], { kind: 'creditNote' });
    expect(matchInvoice(cn, [po([{ id: '1', invoicedQuantity: '10' }])]).verdict).toBe('match');
  });
});

describe('multiple purchase orders', () => {
  const orders = [
    po([{ id: '1' }], 'PO-1'),
    po([{ id: '1', sellerItemId: 'B-2', unitPrice: '40.00', quantity: '5' }, { id: '2' }], 'PO-2'),
  ];

  test('lines that name different orders (Svefaktura BuyersID) match within their order', () => {
    const r = matchInvoice(
      invoice(
        [
          { id: 'a', order: 'PO-1', ref: '1', qty: '10', price: '25.00', amount: '250.00' },
          { id: 'b', order: 'PO-2', ref: '1', qty: '5', price: '40.00', amount: '200.00' },
        ],
        { purchaseOrderRef: undefined },
      ),
      orders,
    );
    expect(r.lines.map((l) => l.poLines[0])).toEqual([
      { poId: 'PO-1', lineId: '1' },
      { poId: 'PO-2', lineId: '1' },
    ]);
    expect(r.purchaseOrderIds).toEqual(['PO-1', 'PO-2']);
    expect(r.verdict).toBe('match');
  });

  test('without an order reference the item id finds the order, and a bare line reference on two orders is ambiguous', () => {
    const noRef = { purchaseOrderRef: undefined };
    const byItem = matchInvoice(invoice([{ id: 'a', sellerId: 'B-2', qty: '5', price: '40.00', amount: '200.00' }], noRef), orders);
    expect(byItem.lines[0]).toMatchObject({ method: 'item', poLines: [{ poId: 'PO-2', lineId: '1' }] });
    const amb = matchInvoice(invoice([{ id: 'a', ref: '1', name: 'x', qty: '5', price: '40.00', amount: '200.00' }], noRef), orders);
    expect(amb.lines[0]!.status).toBe('unmatched');
    expect(amb.lines[0]!.notes.join(' ')).toContain('exists on 2 orders');
    const unique = matchInvoice(invoice([{ id: 'a', ref: '2', qty: '10', price: '25.00', amount: '250.00' }], noRef), orders);
    expect(unique.lines[0]).toMatchObject({ method: 'reference', confidence: 'medium', poLines: [{ poId: 'PO-2', lineId: '2' }] });
  });

  test('an order the invoice names but was not supplied is an error, never matched elsewhere', () => {
    const r = matchInvoice(
      invoice([{ id: 'a', ref: '1', qty: '10', price: '25.00', amount: '250.00' }], { purchaseOrderRef: 'PO-404' }),
      orders,
    );
    expect(r.lines[0]!.status).toBe('unmatched');
    expect(r.findings.some((f) => f.code === 'PO_NOT_PROVIDED' && f.severity === 'error')).toBe(true);
  });

  test('receipts without poId go to the only order; duplicate order ids are rejected', () => {
    const r = matchInvoice(invoice([{ id: 'a', ref: '1', qty: '6', price: '25.00', amount: '150.00' }]), [po([{ id: '1' }])], {
      receipts: [{ lines: [{ lineId: '1', quantity: '6' }] }],
    });
    expect(r.verdict).toBe('match');
    expect(() => matchInvoice(invoice([]), [po([{}]), po([{}])])).toThrow(MatchInputError);
  });

  test('several invoice lines on one order line are checked in aggregate', () => {
    const r = matchInvoice(
      invoice([
        { id: 'a', ref: '1', qty: '6', price: '25.00', amount: '150.00' },
        { id: 'b', ref: '1', qty: '6', price: '25.00', amount: '150.00' },
      ]),
      [po([{ id: '1' }])],
    );
    expect(r.lines[0]!.variances.quantity).toBeUndefined();
    expect(r.overInvoiced[0]).toMatchObject({ invoiced: '12', excess: '2' });
    expect(r.verdict).toBe('needs-review');
  });
});

describe('purchase order input', () => {
  const orderXml = `<?xml version="1.0"?>
<Order xmlns="urn:oasis:names:specification:ubl:schema:xsd:Order-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>PO-1001</cbc:ID><cbc:IssueDate>2026-09-01</cbc:IssueDate><cbc:DocumentCurrencyCode>SEK</cbc:DocumentCurrencyCode>
  <cac:BuyerCustomerParty><cac:Party><cac:PartyName><cbc:Name>Kommunen</cbc:Name></cac:PartyName></cac:Party></cac:BuyerCustomerParty>
  <cac:SellerSupplierParty><cac:Party><cac:PartyLegalEntity><cbc:RegistrationName>Snickeri Exempel AB</cbc:RegistrationName></cac:PartyLegalEntity><cac:PartyTaxScheme><cbc:CompanyID>SE556000000101</cbc:CompanyID></cac:PartyTaxScheme></cac:Party></cac:SellerSupplierParty>
  <cac:OrderLine><cac:LineItem>
    <cbc:ID>1</cbc:ID><cbc:Quantity unitCode="H87">10</cbc:Quantity>
    <cac:Price><cbc:PriceAmount currencyID="SEK">25.00</cbc:PriceAmount><cbc:BaseQuantity unitCode="H87">1</cbc:BaseQuantity></cac:Price>
    <cac:Item><cbc:Name>Hyllkonsol</cbc:Name><cac:BuyersItemIdentification><cbc:ID>B-1</cbc:ID></cac:BuyersItemIdentification><cac:SellersItemIdentification><cbc:ID>HK-10</cbc:ID></cac:SellersItemIdentification><cac:StandardItemIdentification><cbc:ID schemeID="0160">07300010000106</cbc:ID></cac:StandardItemIdentification><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item>
  </cac:LineItem></cac:OrderLine>
</Order>`;

  test('a UBL Order parses into a purchase order and matches an invoice', async () => {
    expect(isOrderXml(orderXml)).toBe(true);
    const o = parseOrder(orderXml);
    expect(o).toEqual({
      id: 'PO-1001',
      currency: 'SEK',
      issueDate: '2026-09-01',
      seller: { name: 'Snickeri Exempel AB', vatId: 'SE556000000101' },
      buyer: { name: 'Kommunen' },
      lines: [
        {
          id: '1',
          description: 'Hyllkonsol',
          sellerItemId: 'HK-10',
          buyerItemId: 'B-1',
          standardItemId: { value: '07300010000106', schemeId: '0160' },
          quantity: '10',
          unit: 'H87',
          unitPrice: '25.00',
          baseQuantity: '1',
          vat: { categoryCode: 'S', rate: '25' },
        },
      ],
    });
    const inv = await parseOne('peppol-bis3-invoice.xml');
    const r = matchInvoice(inv, [o]);
    expect(r.lines[0]).toMatchObject({ method: 'reference', confidence: 'high' });
    expect(r.lines[0]!.variances.vat!.status).toBe('exact');
    expect(parseOrder(new TextEncoder().encode(orderXml)).id).toBe('PO-1001');
  });

  test('bad orders are rejected with a message', () => {
    expect(() => parseOrder('<Invoice xmlns="urn:x"/>')).toThrow('Not a UBL 2.1 Order');
    expect(() => parseOrder('<!DOCTYPE x []><Order/>')).toThrow('DOCTYPE');
    expect(() => parseOrder('<Order')).toThrow(MatchInputError);
    expect(() => parseOrder(orderXml.replace('<cbc:Quantity unitCode="H87">10</cbc:Quantity>', ''))).toThrow('Quantity missing');
    expect(() => parseOrder(orderXml.replace('<cbc:ID>PO-1001</cbc:ID>', ''))).toThrow('Order number');
    expect(() => parseOrder(orderXml.replace('<cbc:Quantity unitCode="H87">10', '<cbc:Quantity unitCode="H87">ten'))).toThrow(
      MatchInputError,
    );
  });

  test('JSON purchase orders: one, many or wrapped; numbers accepted; errors name the field', () => {
    const one = { id: 'P', lines: [{ id: '1', quantity: 2, unitPrice: '1.50', standardItemId: '123', vat: { rate: 25 } }] };
    expect(parsePurchaseOrdersJson(JSON.stringify(one))[0]!.lines[0]).toMatchObject({
      quantity: '2',
      standardItemId: { value: '123' },
      vat: { rate: '25' },
    });
    expect(parsePurchaseOrdersJson(JSON.stringify([one, { ...one, id: 'Q' }]))).toHaveLength(2);
    expect(parsePurchaseOrdersJson(JSON.stringify({ purchaseOrders: [one] }))).toHaveLength(1);
    expect(() => parsePurchaseOrdersJson('{')).toThrow('not valid JSON');
    expect(() => parsePurchaseOrdersJson('[]')).toThrow('No purchase orders');
    expect(() => parsePurchaseOrdersJson('{"id":"P"}')).toThrow('purchaseOrder.lines must be an array');
    expect(() => parsePurchaseOrdersJson('{"id":"P","lines":[{"id":"1","quantity":"x","unitPrice":"1"}]}')).toThrow(
      'lines[0].quantity is not a decimal',
    );
    expect(() => parsePurchaseOrdersJson('{"id":"P","lines":[{"id":"1","quantity":"1"}]}')).toThrow('unitPrice is required');
    expect(() =>
      parsePurchaseOrdersJson('{"id":"P","lines":[{"id":"1","quantity":"1","unitPrice":"1"},{"id":"1","quantity":"1","unitPrice":"1"}]}'),
    ).toThrow('duplicate line id');
    expect(() => parsePurchaseOrdersJson('{"id":"P","lines":[3]}')).toThrow('must be an object');
  });

  test('receipts JSON', () => {
    expect(parseReceiptsJson('[{"poId":"P","lines":[{"lineId":"1","quantity":"4"}]}]')).toEqual([
      { poId: 'P', lines: [{ lineId: '1', quantity: '4' }] },
    ]);
    expect(parseReceiptsJson('{"receipts":[{"lines":[]}]}')).toHaveLength(1);
    expect(() => parseReceiptsJson('nope')).toThrow('not valid JSON');
    expect(() => parseReceiptsJson('{"lines":[{"lineId":"1"}]}')).toThrow('quantity is required');
  });
});

describe('exact arithmetic helpers', () => {
  test('mul, div and abs', () => {
    expect(String(mul('1.5', '-2.25'))).toBe('-3.375');
    expect(String(div('10', '3', 4))).toBe('3.3333');
    expect(String(div('2', '3', 2))).toBe('0.67');
    expect(String(div('-2', '3', 2))).toBe('-0.67');
    expect(String(div('1', '8', 2))).toBe('0.13');
    expect(String(abs('-0.50'))).toBe('0.50');
    expect(() => div('1', '0')).toThrow('Division by zero');
  });
});

describe('einvoice match', () => {
  const dir = mkdtempSync(join(tmpdir(), 'einvoice-match-'));
  const write = (name: string, content: string) => {
    const p = join(dir, name);
    writeFileSync(p, content);
    return p;
  };
  const CLI = new URL('../src/cli.ts', import.meta.url).pathname;
  async function run(args: string[]) {
    const proc = Bun.spawn(['bun', CLI, ...args], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    return { stdout, stderr, code };
  }
  const invoiceFile = fixturePath('peppol-bis3-invoice.xml');
  const orderJson = (price: string) =>
    write(
      `po-${price}.json`,
      JSON.stringify({
        id: 'PO-1001',
        currency: 'SEK',
        lines: [
          { id: '1', description: 'Hyllkonsol', quantity: '10', unit: 'H87', unitPrice: price },
          { id: '9', description: 'Montering', quantity: '2', unit: 'HUR', unitPrice: '950.00' },
        ],
      }),
    );

  test('prints the match result as JSON; exit 8 when it needs review', async () => {
    const r = await run(['match', '--po', orderJson('25.00'), invoiceFile]);
    const out = JSON.parse(r.stdout);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ invoiceId: 'INV-2026-1042', threeWay: false });
    expect(out[0].lines[0]).toMatchObject({ method: 'reference', status: 'matched' });
    // The other fixture lines have no order line to match.
    expect(out[0].verdict).toBe('needs-review');
    expect(r.code).toBe(EXIT.needsReview);
  });

  test('--receipts makes it three-way and --tolerance is applied', async () => {
    const receipts = write('r.json', JSON.stringify([{ poId: 'PO-1001', lines: [{ lineId: '1', quantity: '4' }] }]));
    const r = await run([
      'match',
      '--po',
      orderJson('25.00'),
      '--receipts',
      receipts,
      '--tolerance',
      '{"quantity":{"absolute":"1"}}',
      invoiceFile,
    ]);
    const out = JSON.parse(r.stdout);
    expect(out[0].threeWay).toBe(true);
    expect(out[0].overInvoiced[0]).toMatchObject({ lineId: '1', limit: 'received', excess: '6' });
    expect(out[0].notYetReceived.map((n: { lineId: string }) => n.lineId)).toEqual(['1', '9']);
  });

  test('an Order XML is accepted for --po', async () => {
    const order = write(
      'order.xml',
      `<Order xmlns="urn:oasis:names:specification:ubl:schema:xsd:Order-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"><cbc:ID>PO-1001</cbc:ID><cac:OrderLine><cac:LineItem><cbc:ID>1</cbc:ID><cbc:Quantity unitCode="H87">10</cbc:Quantity><cac:Price><cbc:PriceAmount>25.00</cbc:PriceAmount></cac:Price><cac:Item><cbc:Name>Hyllkonsol</cbc:Name></cac:Item></cac:LineItem></cac:OrderLine></Order>`,
    );
    const r = await run(['match', '--po', order, invoiceFile]);
    expect(JSON.parse(r.stdout)[0].purchaseOrderIds).toEqual(['PO-1001']);
  });

  test('usage and input errors exit 1 with a message', async () => {
    expect((await run(['match', invoiceFile])).code).toBe(EXIT.usage);
    const bad = await run(['match', '--po', write('bad.json', '{'), invoiceFile]);
    expect(bad.code).toBe(EXIT.usage);
    expect(bad.stderr).toContain('not valid JSON');
    expect((await run(['match', '--po', join(dir, 'missing.json'), invoiceFile])).code).toBe(EXIT.usage);
    expect((await run(['match', '--po', orderJson('25.00'), '--tolerance', '{"price":{}}', invoiceFile])).code).toBe(EXIT.usage);
    expect((await run(['match', '--po', orderJson('25.00'), '--tolerance', '[1]', invoiceFile])).code).toBe(EXIT.usage);
    expect((await run(['match', '--po', orderJson('25.00'), '--tolerance', 'x', invoiceFile])).code).toBe(EXIT.usage);
    expect((await run(['match', '--po', orderJson('25.00'), '--tolerance', '{"total":{"percent":"-1"}}', invoiceFile])).code).toBe(
      EXIT.usage,
    );
    expect((await run(['match', '--po', orderJson('25.00'), '--tolerance', '{"total":{"max":"1"}}', invoiceFile])).code).toBe(EXIT.usage);
    expect((await run(['match', '--po', orderJson('25.00'), '--tolerance', '{"total":3}', invoiceFile])).code).toBe(EXIT.usage);
  });

  test('an unreadable or unsupported invoice is reported', async () => {
    const missing = await run(['match', '--po', orderJson('25.00'), join(dir, 'nope.xml')]);
    expect(missing.code).toBe(EXIT.internal);
    const junk = await run(['match', '--po', orderJson('25.00'), write('junk.xml', '<Thing xmlns="urn:x"/>')]);
    expect(junk.code).toBe(EXIT.unsupported);
  });
});
