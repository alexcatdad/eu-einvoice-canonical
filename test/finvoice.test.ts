import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveSign } from '../src/index.js';
import { parseOne, warningCodes } from './helpers.js';

describe('Finvoice 3.0: invoice behind a SOAP envelope, ISO-8859-15', async () => {
  const inv = await parseOne('finvoice-invoice.xml');

  test('envelope and format', () => {
    assert.equal(inv.source.format, 'finvoice');
    assert.equal(inv.source.formatVersion, '3.0');
    assert.deepEqual(inv.source.envelope.map((s) => s.kind), ['soap', 'xml']);
    assert.equal(inv.source.encoding, 'iso-8859-15');
    assert.equal(inv.source.specificationId, 'EN16931');
    assert.equal(inv.specificationId, 'urn:finvoice:3.0');
  });

  test('header', () => {
    assert.equal(inv.kind, 'invoice');
    assert.equal(inv.typeCode, '380');
    assert.equal(effectiveSign(inv), 1);
    assert.equal(inv.id, '2026-1042');
    assert.equal(inv.issueDate, '2026-10-15');
    assert.equal(inv.dueDate, '2026-10-29');
    assert.equal(inv.currency, 'EUR');
    assert.equal(inv.buyerReference, 'Pekka Ostaja');
    assert.equal(inv.purchaseOrderRef, 'TIL-5512');
    assert.equal(inv.contractRef, 'SOP-2026-3');
    assert.deepEqual(inv.invoicePeriod, { start: '2026-09-01', end: '2026-09-30' });
    assert.deepEqual(inv.notes, [{ text: 'Kiitos tilauksesta' }]);
    assert.deepEqual(inv.nationalType, { scheme: 'FI:InvoiceTypeCode', code: 'INV01', label: 'LASKU' });
    assert.deepEqual(inv.extensions.fi, { invoiceTypeCode: 'INV01', epiReference: 'RF18539007547034' });
  });

  test('payment terms keep the free text and the late-payment interest', () => {
    assert.equal(inv.paymentTerms, '14 päivää netto\nLate payment interest 7.5 %');
    assert.ok(inv.source.derived.some((d) => d.field === '/paymentTerms'));
  });

  test('seller: Y-tunnus, VAT, OVT addresses, contact', () => {
    const s = inv.seller;
    assert.equal(s.name, 'Testitalo Oy');
    assert.deepEqual(s.legalRegistrationId, { value: '2345678-9', schemeId: 'FI:YTUNNUS' });
    assert.equal(s.vatId, 'FI23456789');
    assert.deepEqual(s.identifiers, [{ value: '003723456789', schemeId: '0216' }]);
    assert.deepEqual(s.endpoint, { value: '003723456789', schemeId: '0216' });
    assert.deepEqual(s.address, { line1: 'Esimerkkikatu 1', city: 'Tampere', postalCode: '33100', countryCode: 'FI' });
    assert.deepEqual(s.contact, { name: 'Liisa Laskuttaja', phone: '+358 40 1234567', email: 'laskutus@testitalo.example' });
  });

  test('buyer and delivery', () => {
    assert.equal(inv.buyer.name, 'Ostaja Ab');
    assert.deepEqual(inv.buyer.legalRegistrationId, { value: '3456789-0', schemeId: 'FI:YTUNNUS' });
    assert.deepEqual(inv.buyer.endpoint, { value: '003734567890', schemeId: '0216' });
    assert.equal(inv.delivery?.partyName, 'Ostaja Ab, varasto');
    assert.equal(inv.delivery?.actualDate, '2026-10-12');
    assert.equal(inv.delivery?.address?.city, 'Vantaa');
  });

  test('totals use decimal points; payable is EpiInstructedAmount', () => {
    assert.deepEqual(inv.totals, {
      lineNetTotal: '965.00', taxExclusive: '965.00', vatTotal: '226.00', taxInclusive: '1191.00', payable: '1191.00',
    });
    assert.ok(!inv.source.derived.some((d) => d.field === '/totals/payable'));
  });

  test('VAT breakdown', () => {
    assert.deepEqual(inv.vatBreakdown, [
      { taxableAmount: '925.00', taxAmount: '222.00', categoryCode: 'S', rate: '24' },
      { taxableAmount: '40.00', taxAmount: '4.00', categoryCode: 'S', rate: '10' },
    ]);
  });

  test('EPI: account and BIC to creditTransfers, reference to BT-83', () => {
    assert.deepEqual(inv.payments, [{
      meansCode: '58',
      meansText: 'SEPA credit transfer',
      remittanceInformation: 'RF18539007547034',
      creditTransfers: [{ accountId: 'FI2112345600000785', accountName: 'Testitalo Oy', serviceProviderId: 'NDEAFIHH' }],
    }]);
  });

  test('lines: the print row is not a line', () => {
    assert.equal(inv.lines.length, 3);
    assert.deepEqual(warningCodes(inv), ['FI-INFO-ROWS']);
    assert.equal(inv.source.unmapped['/Finvoice/InvoiceRow[4]'], 'YHTEENSÄ = 1191,00');
  });

  test('line 1: quantity, unit, period, price, VAT', () => {
    const l = inv.lines[0];
    assert.equal(l.id, '1');
    assert.equal(l.quantity, '10.00');
    assert.equal(l.unitCode, 'HUR');
    assert.equal(l.unitText, 'h');
    assert.equal(l.netAmount, '800.00');
    assert.equal(l.price?.net, '80.00');
    assert.deepEqual(l.vat, { categoryCode: 'S', rate: '24' });
    assert.deepEqual(l.period, { start: '2026-09-01', end: '2026-09-30' });
    assert.equal(l.item.name, 'Konsultointi');
    assert.equal(l.item.description, 'Asiantuntijatyö syyskuu');
    assert.equal(l.item.sellerId, 'KONS-01');
  });

  test('line 2: unit price in cents is converted exactly and the conversion is recorded', () => {
    const l = inv.lines[1];
    assert.equal(l.netAmount, '125.00');
    assert.equal(l.price?.net, '0.1250');
    assert.equal(l.id, '2');
    assert.deepEqual(l.item.attributes, [{ name: 'Mittarin numero', value: 'M-0042' }]);
    assert.ok(inv.source.derived.some((d) => d.field.endsWith('/price/net') && /cents/.test(d.rule)));
  });

  test('line 3: RowIdentifier and EAN', () => {
    const l = inv.lines[2];
    assert.equal(l.id, 'R3');
    assert.equal(l.unitCode, 'C62');
    assert.deepEqual(l.item.standardId, { value: '6430000000011', schemeId: '0160' });
    assert.deepEqual(l.vat, { categoryCode: 'S', rate: '10' });
  });
});

describe('Finvoice 3.0: credit note without EpiDetails', async () => {
  const inv = await parseOne('finvoice-credit.xml');

  test('INV02 is a credit note, signs are kept', () => {
    assert.equal(inv.kind, 'creditNote');
    assert.equal(inv.typeCode, '381');
    assert.equal(effectiveSign(inv), -1);
    assert.equal(inv.id, '2026-1100');
    assert.equal(inv.totals.taxInclusive, '22.00');
    assert.deepEqual(inv.precedingInvoices, [{ id: '2026-1042' }]);
    assert.equal(inv.extensions.fi?.invoiceTypeCode, 'INV02');
    assert.deepEqual(warningCodes(inv), []);
  });

  test('payable and payment account are derived, and say so', () => {
    assert.equal(inv.totals.payable, '22.00');
    assert.deepEqual(inv.payments, [{ meansCode: '30', creditTransfers: [{ accountId: 'FI2112345600000785', serviceProviderId: 'NDEAFIHH' }] }]);
    const fields = inv.source.derived.map((d) => d.field);
    assert.ok(fields.includes('/totals/payable'));
    assert.ok(fields.includes('/totals/lineNetTotal'));
    assert.ok(fields.includes('/payments/0/meansCode'));
  });

  test('row without position identifier gets its position', () => {
    assert.equal(inv.lines[0].id, '1');
    assert.equal(inv.lines[0].price?.net, '20.00');
  });
});
