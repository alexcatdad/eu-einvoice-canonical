import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { effectiveSign } from '../src/index.js';
import { fixture, parseOne, utf8, warningCodes } from './helpers.js';

const text = (name: string) => new TextDecoder().decode(fixture(name));
const variant = (name: string, from: string, to: string) => {
  const src = text(name);
  assert.ok(src.includes(from), `fixture lacks ${from}`);
  return parseOne(utf8(src.replace(from, to)), 'x.xml');
};

describe('ebInterface 6.1 invoice', async () => {
  const inv = await parseOne('ebinterface-6.1-invoice.xml');

  test('header', () => {
    assert.equal(inv.kind, 'invoice');
    assert.equal(inv.typeCode, '380');
    assert.equal(inv.id, 'RE-2026-1001');
    assert.equal(inv.issueDate, '2026-10-12');
    assert.equal(inv.currency, 'EUR');
    assert.equal(inv.dueDate, '2026-11-15');
    assert.equal(inv.purchaseOrderRef, 'BE-2026-5');
    assert.equal(inv.salesOrderRef, 'VK-77');
    assert.equal(inv.specificationId, 'ebinterface:6.1');
    assert.deepEqual(inv.extensions.at, { ebInterfaceVersion: '6.1', documentType: 'Invoice' });
    assert.deepEqual(inv.notes, [{ text: 'Projekt: PRJ-9' }, { text: 'Leistungen September 2026' }, { text: 'Danke für Ihren Auftrag' }]);
    assert.equal(effectiveSign(inv), 1);
    assert.equal(inv.source.format, 'ebinterface');
    assert.deepEqual(inv.source.warnings, []);
  });

  test('biller and recipient', () => {
    assert.equal(inv.seller.name, 'Muster Beratung GmbH');
    assert.equal(inv.seller.vatId, 'ATU12345678');
    assert.deepEqual(inv.seller.nationalTaxIds, [{ value: '123456a', schemeId: 'AT:FN' }]);
    assert.deepEqual(inv.seller.identifiers, [{ value: 'LIEF-100' }]);
    assert.deepEqual(inv.seller.address, { line1: 'Beispielgasse 5', city: 'Wien', postalCode: '1010', countryCode: 'AT' });
    assert.deepEqual(inv.seller.contact, { name: 'Max Muster', phone: '+43 1 0000000', email: 'rechnung@muster-beratung.example' });
    assert.equal(inv.buyer.name, 'Stadt Beispielhausen');
    assert.equal(inv.buyer.vatId, 'ATU87654321');
    assert.deepEqual(inv.buyer.identifiers, [{ value: 'KD-4711' }]);
    assert.deepEqual(inv.delivery, {
      partyName: 'Stadt Beispielhausen, Bauhof',
      actualDate: '2026-10-10',
      address: { line1: 'Werkstraße 2', city: 'Beispielhausen', postalCode: '4020', countryCode: 'AT' },
    });
  });

  test('lines with line-level reductions', () => {
    assert.deepEqual(inv.lines[0], {
      id: '1',
      quantity: '10.0000',
      unitCode: 'HUR',
      netAmount: '900.00',
      orderLineRef: '10',
      allowances: [{ amount: '100.00', baseAmount: '1000.00', percentage: '10.00', reason: 'Mengenrabatt' }],
      charges: [],
      price: { net: '100.0000' },
      vat: { categoryCode: 'S', rate: '20.00' },
      item: { name: 'Beratung', classifications: [], attributes: [] },
    });
    assert.deepEqual(inv.lines[1].item, {
      name: 'Fachbuch',
      description: 'Vertragsrecht, 2. Auflage',
      sellerId: 'BUCH-12',
      standardId: { value: '9780000000002', schemeId: '0160' },
      classifications: [],
      attributes: [],
    });
    assert.deepEqual(inv.lines[1].price, { net: '50.0000', baseQuantity: '1' });
    assert.equal(inv.lines[1].unitCode, 'C62');
  });

  test('document reductions and surcharges keep their VAT', () => {
    assert.deepEqual(inv.allowances, [
      { amount: '40.00', baseAmount: '1000.00', reason: 'Treuerabatt', vat: { categoryCode: 'S', rate: '20.00' } },
    ]);
    assert.deepEqual(inv.charges, [
      { amount: '50.00', baseAmount: '1000.00', reason: 'Versandkosten', vat: { categoryCode: 'S', rate: '20.00' } },
    ]);
  });

  test('VAT and totals; the net total is derived and says so', () => {
    assert.deepEqual(inv.vatBreakdown, [
      { taxableAmount: '910.00', taxAmount: '182.00', categoryCode: 'S', rate: '20.00' },
      { taxableAmount: '100.00', taxAmount: '10.00', categoryCode: 'S', rate: '10.00' },
    ]);
    assert.deepEqual(inv.totals, {
      lineNetTotal: '1000.00',
      allowanceTotal: '40.00',
      chargeTotal: '50.00',
      taxExclusive: '1010.00',
      vatTotal: '192.00',
      taxInclusive: '1202.00',
      prepaid: '200.00',
      payable: '1002.00',
    });
    const fields = inv.source.derived.map((d) => d.field);
    assert.ok(fields.includes('/totals/lineNetTotal'));
    assert.ok(fields.includes('/totals/taxExclusive'));
  });

  test('bank transfer with IBAN is SEPA credit transfer (58)', () => {
    assert.deepEqual(inv.payments, [
      {
        meansCode: '58',
        meansText: 'Überweisung',
        remittanceInformation: 'RE-2026-1001',
        creditTransfers: [{ accountId: 'AT611904300234573201', accountName: 'Muster Beratung GmbH', serviceProviderId: 'BKAUATWW' }],
      },
    ]);
  });

  test('payment conditions: discount in the terms and in the schedule', () => {
    const discount = 'Discount 2.00 % / 20.04 on 1002.00 if paid by 2026-10-25';
    assert.equal(inv.paymentTerms, `Zahlbar innerhalb von 30 Tagen netto\n${discount}`);
    assert.deepEqual(inv.paymentSchedule, [
      { dueDate: '2026-10-25', description: discount },
      { dueDate: '2026-11-15', description: 'Net due date' },
    ]);
  });
});

describe('ebInterface 4.3 credit memo', async () => {
  const inv = await parseOne('ebinterface-4.3-creditmemo.xml');

  test('CreditMemo is a credit note and keeps its negative amounts', () => {
    assert.equal(inv.kind, 'creditNote');
    assert.equal(inv.typeCode, '381');
    assert.equal(effectiveSign(inv), -1);
    assert.deepEqual(inv.extensions.at, { ebInterfaceVersion: '4.3', documentType: 'CreditMemo' });
    assert.equal(inv.specificationId, 'ebinterface:4.3');
    assert.deepEqual(inv.precedingInvoices, [{ id: 'RE-2026-1001', issueDate: '2026-10-05' }]);
    assert.deepEqual(inv.invoicePeriod, { start: '2026-09-01', end: '2026-09-30' });
    assert.equal(inv.delivery, undefined);
  });

  test('4.3 address contact and 4.3 VATItem', () => {
    assert.deepEqual(inv.seller.contact, { name: 'Max Muster', phone: '+43 1 0000000', email: 'rechnung@muster-beratung.example' });
    assert.deepEqual(inv.vatBreakdown, [
      { taxableAmount: '-200.00', taxAmount: '-40.00', categoryCode: 'S', rate: '20' },
      { taxableAmount: '-30.00', taxAmount: '0.00', categoryCode: 'E', rate: '0', exemptionReason: 'Steuerfrei gemäß § 6 UStG' },
    ]);
    assert.deepEqual(inv.lines[1].vat, { categoryCode: 'E', rate: '0', exemptionReason: 'Steuerfrei gemäß § 6 UStG' });
    assert.ok(inv.source.derived.some((d) => d.field === '/vat/categoryCode'));
  });

  test('totals', () => {
    assert.deepEqual(inv.totals, {
      lineNetTotal: '-230.00',
      taxExclusive: '-230.00',
      vatTotal: '-40.00',
      taxInclusive: '-270.00',
      payable: '-270.00',
    });
    assert.deepEqual(warningCodes(inv), []);
  });

  test('bank account without IBAN is a plain credit transfer (30)', () => {
    assert.deepEqual(inv.payments, [
      {
        meansCode: '30',
        remittanceInformation: 'GS-2026-0003',
        creditTransfers: [{ accountId: '00234573201', accountName: 'Muster Beratung GmbH', serviceProviderId: '19043' }],
      },
    ]);
  });
});

describe('ebInterface variants', () => {
  const inv = 'ebinterface-6.1-invoice.xml';

  test('any version namespace is accepted', async () => {
    const r = await variant(inv, '/schema/6p1/', '/schema/5p0/');
    assert.equal(r.specificationId, 'ebinterface:5.0');
    assert.equal(r.extensions.at?.ebInterfaceVersion, '5.0');
  });

  test('qualified attributes (eb:DocumentType) are read', async () => {
    const r = await variant(inv, 'DocumentType="Invoice"', 'xmlns:eb="http://www.ebinterface.at/schema/6p1/" eb:DocumentType="CreditMemo"');
    assert.equal(r.kind, 'creditNote');
  });

  test('document types', async () => {
    for (const [t, code, kind, self] of [
      ['InvoiceForAdvancePayment', '386', 'invoice', false],
      ['InvoiceForPartialDelivery', '326', 'invoice', false],
      ['FinalSettlement', '380', 'invoice', false],
      ['SelfBilling', '389', 'invoice', true],
      ['SubsequentDebit', '383', 'invoice', false],
      ['SubsequentCredit', '381', 'creditNote', false],
    ] as const) {
      const r = await variant(inv, 'DocumentType="Invoice"', `DocumentType="${t}"`);
      assert.equal(r.typeCode, code, t);
      assert.equal(r.kind, kind, t);
      assert.equal(r.selfBilled, self, t);
      assert.equal(r.extensions.at?.documentType, t);
    }
  });

  test('an unknown document type warns and falls back to 380', async () => {
    const r = await variant(inv, 'DocumentType="Invoice"', 'DocumentType="Mystery"');
    assert.equal(r.typeCode, '380');
    assert.ok(warningCodes(r).includes('EB-DOCUMENT-TYPE'));
  });

  test('OtherTax goes to otherTaxes', async () => {
    const r = await variant(inv, '</Tax>', '<OtherTax><TaxAmount>3.00</TaxAmount><Comment>Abgabe</Comment></OtherTax></Tax>');
    assert.deepEqual(r.otherTaxes, [{ scheme: 'AT:OTHER', amount: '3.00', includedInTotal: true }]);
    assert.equal(r.source.unmapped['/Invoice/Tax/OtherTax[1]/Comment'], 'Abgabe');
  });

  test('SEPA direct debit', async () => {
    const r = await variant(
      inv,
      /<UniversalBankTransaction>[\s\S]*<\/UniversalBankTransaction>/.exec(text(inv))![0],
      '<SEPADirectDebit><Type>B2B</Type><IBAN>AT611904300234573201</IBAN><CreditorID>AT00ZZZ00000000001</CreditorID><MandateReference>M-1</MandateReference></SEPADirectDebit>',
    );
    assert.deepEqual(r.payments, [
      {
        meansCode: '59',
        meansText: 'Überweisung',
        nationalMeansCode: 'B2B',
        creditTransfers: [],
        directDebit: { mandateId: 'M-1', creditorId: 'AT00ZZZ00000000001', debitedAccountId: 'AT611904300234573201' },
      },
    ]);
  });

  test('a missing InvoiceCurrency is an error', async () => {
    await assert.rejects(variant(inv, ' InvoiceCurrency="EUR"', ''), /InvoiceCurrency/);
  });
});
