import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveSign } from '../src/index.js';
import { parseOne, warningCodes } from './helpers.js';

describe('eSLOG 2.0: invoice', async () => {
  const inv = await parseOne('eslog-2-invoice.xml');

  test('header', () => {
    assert.equal(inv.source.format, 'eslog-2');
    assert.equal(inv.source.formatVersion, '2.00');
    assert.equal(inv.specificationId, 'urn:eslog:2.00');
    assert.equal(inv.kind, 'invoice');
    assert.equal(inv.typeCode, '380');
    assert.equal(inv.id, '2026-001');
    assert.equal(inv.issueDate, '2026-10-15');
    assert.equal(inv.dueDate, '2026-10-29');
    assert.equal(inv.currency, 'EUR');
    assert.equal(inv.purchaseOrderRef, 'NAR-2026-77');
    assert.equal(inv.contractRef, 'POG-12');
    assert.equal(inv.buyerReference, 'Janez Kupec');
    assert.equal(inv.paymentTerms, 'Plačilo v 14 dneh');
    assert.deepEqual(inv.notes, [{ text: 'Hvala za naročilo' }]);
    assert.deepEqual(inv.invoicePeriod, { start: '2026-10-01', end: '2026-10-31' });
    assert.equal(inv.selfBilled, false);
    assert.deepEqual(warningCodes(inv), []);
  });

  test('seller', () => {
    const s = inv.seller;
    assert.equal(s.name, 'Primer d.o.o.');
    assert.deepEqual(s.identifiers, [{ value: '3830000000012', schemeId: '0088' }]);
    assert.equal(s.vatId, 'SI12345679');
    assert.deepEqual(s.legalRegistrationId, { value: '1234567000', schemeId: 'SI:MATICNA' });
    assert.deepEqual(s.address, { line1: 'Testna ulica 1', city: 'Ljubljana', postalCode: '1000', countryCode: 'SI' });
    assert.deepEqual(s.contact, { name: 'Ana Novak', phone: '+386 1 234 5678', email: 'racuni@primer.example' });
  });

  test('buyer and delivery', () => {
    assert.equal(inv.buyer.name, 'Kupec d.d.');
    assert.equal(inv.buyer.vatId, 'SI87654321');
    assert.equal(inv.delivery?.partyName, 'Skladišče Maribor');
    assert.deepEqual(inv.delivery?.locationId, { value: '3830000000036', schemeId: '0088' });
    assert.equal(inv.delivery?.actualDate, '2026-10-12');
    assert.equal(inv.delivery?.address?.city, 'Maribor');
  });

  test('payment: PAI, FII account and RFF+PQ', () => {
    assert.deepEqual(inv.payments, [{
      meansCode: '58',
      remittanceInformation: 'SI00 2026-001',
      creditTransfers: [{ accountId: 'SI56011001000000013', accountName: 'Primer d.o.o.', serviceProviderId: 'BSLJSI2X' }],
    }]);
  });

  test('document charge (G_SG16) keeps its VAT; no allowances', () => {
    assert.deepEqual(inv.charges, [{ amount: '10.00', reason: 'Prevoz', reasonCode: 'FC', vat: { categoryCode: 'S', rate: '22' } }]);
    assert.deepEqual(inv.allowances, []);
  });

  test('totals from G_SG50 MOA', () => {
    assert.deepEqual(inv.totals, {
      lineNetTotal: '380.00', chargeTotal: '10.00', taxExclusive: '390.00', vatTotal: '63.30',
      taxInclusive: '453.30', prepaid: '53.30', payable: '400.00',
    });
    assert.ok(inv.source.derived.some((d) => d.field === '/totals/chargeTotal'));
  });

  test('VAT breakdown from G_SG52', () => {
    assert.deepEqual(inv.vatBreakdown, [
      { taxableAmount: '210.00', taxAmount: '46.20', categoryCode: 'S', rate: '22' },
      { taxableAmount: '180.00', taxAmount: '17.10', categoryCode: 'S', rate: '9.5' },
    ]);
  });

  test('line 1 (G_SG26)', () => {
    const l = inv.lines[0];
    assert.equal(l.id, '1');
    assert.equal(l.quantity, '5');
    assert.equal(l.unitCode, 'HUR');
    assert.equal(l.netAmount, '200.00');
    assert.deepEqual(l.price, { net: '40.00', baseQuantity: '1', baseQuantityUnit: 'HUR' });
    assert.deepEqual(l.vat, { categoryCode: 'S', rate: '22' });
    assert.equal(l.item.name, 'Svetovanje');
    assert.equal(l.item.sellerId, 'SVET-01');
  });

  test('line 2: line allowance, GTIN, second IMD is the description', () => {
    const l = inv.lines[1];
    assert.equal(l.netAmount, '180.00');
    assert.deepEqual(l.allowances, [{ amount: '20.00', reason: 'Popust', reasonCode: '95' }]);
    assert.deepEqual(l.item.standardId, { value: '3830000000043', schemeId: '0160' });
    assert.equal(l.item.name, 'Pisarniški stol');
    assert.equal(l.item.description, 'Črn, nastavljiv');
    assert.deepEqual(l.vat, { categoryCode: 'S', rate: '9.5' });
  });
});

describe('eSLOG 2.0: credit note', async () => {
  const inv = await parseOne('eslog-2-credit.xml');

  test('381 is a credit note with a preceding invoice', () => {
    assert.equal(inv.kind, 'creditNote');
    assert.equal(inv.typeCode, '381');
    assert.equal(effectiveSign(inv), -1);
    assert.equal(inv.id, '2026-002');
    assert.deepEqual(inv.precedingInvoices, [{ id: '2026-001', issueDate: '2026-10-15' }]);
    assert.deepEqual(inv.payments, []);
    assert.deepEqual(warningCodes(inv), []);
  });

  test('totals', () => {
    assert.deepEqual(inv.totals, {
      lineNetTotal: '50.00', taxExclusive: '50.00', vatTotal: '11.00', taxInclusive: '61.00', payable: '61.00',
    });
    assert.equal(inv.lines.length, 1);
  });
});
