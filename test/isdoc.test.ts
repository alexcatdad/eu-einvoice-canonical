import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveSign } from '../src/index.js';
import { fixture, parseOne, utf8, warningCodes } from './helpers.js';

const text = (name: string) => new TextDecoder().decode(fixture(name));

describe('ISDOC 6.0.2 invoice (CZK)', async () => {
  const inv = await parseOne('isdoc-6.0.2-invoice.isdoc');

  test('header', () => {
    assert.equal(inv.kind, 'invoice');
    assert.equal(inv.typeCode, '380');
    assert.equal(inv.id, 'FV-2026-0042');
    assert.equal(inv.issueDate, '2026-10-01');
    assert.equal(inv.taxPointDate, '2026-09-30');
    assert.equal(inv.dueDate, '2026-10-30');
    assert.equal(inv.currency, 'CZK');
    assert.equal(inv.taxCurrency, undefined);
    assert.equal(inv.exchangeRate, undefined);
    assert.equal(inv.specificationId, 'isdoc:6.0.2');
    assert.deepEqual(inv.nationalType, { scheme: 'CZ:DocumentType', code: '1', label: 'Faktura - daňový doklad' });
    assert.deepEqual(inv.notes, [{ text: 'Fakturujeme dodávku dle smlouvy SML-2025-3' }]);
    assert.equal(inv.purchaseOrderRef, 'OBJ-2026-77');
    assert.equal(inv.salesOrderRef, 'ZAK-55');
    assert.equal(inv.contractRef, 'SML-2025-3');
    assert.equal(inv.despatchAdviceRef, 'DL-2026-12');
    assert.deepEqual(inv.precedingInvoices, [{ id: 'DZL-2026-0005' }]);
    assert.equal(effectiveSign(inv), 1);
    assert.equal(inv.source.format, 'isdoc');
    assert.equal(inv.source.formatVersion, '6.0.2');
    assert.deepEqual(inv.source.warnings, []);
  });

  test('IČO is a national tax ID, DIČ the VAT ID', () => {
    assert.deepEqual(inv.seller.nationalTaxIds, [{ value: '12345679', schemeId: 'CZ:ICO' }]);
    assert.equal(inv.seller.vatId, 'CZ12345679');
    assert.equal(inv.seller.name, 'Příklad Software s.r.o.');
    assert.deepEqual(inv.seller.address, { line1: 'Vzorová 12', city: 'Brno', postalCode: '60200', countryCode: 'CZ' });
    assert.equal(inv.seller.additionalLegalInfo, 'Krajský soud v Brně, C 99999, 2010-05-17');
    assert.deepEqual(inv.seller.contact, { name: 'Jana Vzorová', phone: '+420 500 000 001', email: 'fakturace@priklad-software.example' });
    assert.deepEqual(inv.buyer.nationalTaxIds, [{ value: '87654321', schemeId: 'CZ:ICO' }]);
    assert.equal(inv.buyer.vatId, 'CZ87654321');
    assert.equal(inv.delivery?.partyName, 'Obecní úřad Dolní Lhota, sklad');
    assert.equal(inv.delivery?.address?.line1, 'Skladová 3');
    assert.deepEqual(inv.additionalParties, []);
  });

  test('lines', () => {
    assert.equal(inv.lines.length, 3);
    assert.deepEqual(inv.lines[0], {
      id: '1', note: 'Zelená varianta', quantity: '10', unitCode: 'H87', unitText: 'Ks', netAmount: '1000.00', orderLineRef: '1',
      allowances: [], charges: [], price: { net: '100.00' }, vat: { categoryCode: 'S', rate: '21' },
      item: { name: 'Licenční klíč Vzor Office', sellerId: 'LIC-001', buyerId: 'OBEC-4711', standardId: { value: '8590000000019', schemeId: '0160' }, classifications: [], attributes: [] },
    });
    assert.equal(inv.lines[1].unitCode, 'HUR');
    assert.equal(inv.lines[2].vat?.rate, '12');
  });

  test('totals: deposits already claimed and paid become the prepaid amount', () => {
    assert.deepEqual(inv.totals, {
      lineNetTotal: '5300.00', taxExclusive: '5300.00', vatTotal: '1086.00', taxInclusive: '6386.00',
      prepaid: '1710.50', rounding: '0.50', payable: '4676.00',
    });
    assert.deepEqual(inv.vatBreakdown, [
      { taxableAmount: '5000.00', taxAmount: '1050.00', categoryCode: 'S', rate: '21' },
      { taxableAmount: '300.00', taxAmount: '36.00', categoryCode: 'S', rate: '12' },
    ]);
    assert.equal(inv.source.unmapped['/Invoice/LegalMonetaryTotal/AlreadyClaimedTaxExclusiveAmount'], '1000.00');
    assert.equal(inv.source.unmapped['/Invoice/LegalMonetaryTotal/DifferenceTaxInclusiveAmount'], '5176.00');
    assert.equal(inv.source.unmapped['/Invoice/NonTaxedDeposits/NonTaxedDeposit[1]'], 'ZL-2026-0010 500.50');
  });

  test('payment: symbols go to extensions.cz and the variable symbol is BT-83', () => {
    assert.deepEqual(inv.payments, [{
      meansCode: '42', remittanceInformation: '2026042',
      creditTransfers: [
        { accountId: 'CZ6508000000192000145399', serviceProviderId: 'GIBACZPX' },
        { accountId: 'CZ0801000000002000145399', serviceProviderId: 'KOMBCZPP' },
      ],
    }]);
    assert.deepEqual(inv.extensions.cz, { documentType: '1', variableSymbol: '2026042', constantSymbol: '0308', specificSymbol: '105512' });
    assert.deepEqual(inv.paymentSchedule, []);
  });

  test('supplements are references without content', () => {
    assert.deepEqual(inv.attachments, [{ kind: 'reference', id: 'podminky.pdf', description: 'sha1: AAAAAAAAAAAAAAAAAAAAAAAAAAA=' }]);
  });

  test('derived values are recorded', () => {
    const fields = inv.source.derived.map((d) => d.field);
    assert.ok(fields.includes('/vatBreakdown/*/categoryCode'));
    assert.ok(fields.includes('/totals/prepaid'));
  });
});

describe('ISDOC 6.0.2 credit note in a foreign currency', async () => {
  const inv = await parseOne('isdoc-6.0.2-credit-eur.isdoc');

  test('type 2 with a negative total is a credit note', () => {
    assert.equal(inv.kind, 'creditNote');
    assert.equal(inv.typeCode, '381');
    assert.equal(effectiveSign(inv), -1);
    assert.equal(inv.nationalType?.code, '2');
    assert.deepEqual(inv.precedingInvoices, [{ id: 'FV-2026-0042' }]);
    assert.equal(inv.dueDate, undefined);
    assert.ok(inv.source.derived.some((d) => d.field === '/kind'));
  });

  test('document in EUR, VAT also in CZK at CurrRate', () => {
    assert.equal(inv.currency, 'EUR');
    assert.equal(inv.taxCurrency, 'CZK');
    assert.deepEqual(inv.exchangeRate, { rate: '25.00' });
    assert.deepEqual(inv.totals, {
      lineNetTotal: '-50.00', taxExclusive: '-50.00', vatTotal: '-9.60', vatTotalInTaxCurrency: '-240.00',
      taxInclusive: '-59.60', rounding: '0', payable: '-59.60',
    });
    assert.deepEqual(inv.vatBreakdown, [
      { taxableAmount: '-40.00', taxAmount: '-8.40', categoryCode: 'S', rate: '21', taxAmountInTaxCurrency: '-210.00' },
      { taxableAmount: '-10.00', taxAmount: '-1.20', categoryCode: 'S', rate: '12', taxAmountInTaxCurrency: '-30.00' },
    ]);
  });

  test('lines use the foreign amounts; local unit prices are not mixed in', () => {
    assert.equal(inv.lines[0].quantity, '-2');
    assert.equal(inv.lines[0].netAmount, '-40.00');
    assert.equal(inv.lines[0].price, undefined);
    assert.equal(inv.source.unmapped['/Invoice/InvoiceLines/InvoiceLine[1]/UnitPrice'], '500.00');
  });

  test('only the variable symbol is present', () => {
    assert.deepEqual(inv.extensions.cz, { documentType: '2', variableSymbol: '20260007' });
    assert.equal(inv.payments[0].remittanceInformation, '20260007');
    assert.deepEqual(warningCodes(inv), []);
  });
});

describe('ISDOC document types', () => {
  const base = text('isdoc-6.0.2-invoice.isdoc');
  const as = (type: string) => parseOne(utf8(base.replace('<DocumentType>1<', `<DocumentType>${type}<`)), 'x.isdoc');

  test('1, 7 -> invoice 380; 4, 5 -> prepayment invoice 386', async () => {
    for (const [t, code] of [['1', '380'], ['7', '380'], ['4', '386'], ['5', '386']] as const) {
      const inv = await as(t);
      assert.equal(inv.kind, 'invoice');
      assert.equal(inv.typeCode, code);
      assert.equal(inv.nationalType?.code, t);
      assert.equal(inv.extensions.cz?.documentType, t);
    }
  });

  test('corrective types take their direction from the sign of the total', async () => {
    // Positive correction (the fixture's amounts): a vrubopis or an increasing dobropis is an invoice.
    for (const t of ['2', '3', '6']) {
      const inv = await as(t);
      assert.equal(inv.kind, 'invoice');
      assert.equal(inv.typeCode, '383');
    }
    // Negative correction: a credit note whatever the type.
    const neg = text('isdoc-6.0.2-credit-eur.isdoc');
    const inv = await parseOne(utf8(neg.replace('<DocumentType>2<', '<DocumentType>3<')), 'x.isdoc');
    assert.equal(inv.kind, 'creditNote');
    assert.equal(inv.nationalType?.code, '3');
  });

  test('a zero-total correction follows the document type and says so', async () => {
    const zero = text('isdoc-6.0.2-credit-eur.isdoc')
      .replace(/<(\w*(?:Amount|Total)\w*)>-?[\d.]+<\/\1>/g, '<$1>0</$1>');
    const inv = await parseOne(utf8(zero), 'x.isdoc');
    assert.equal(inv.kind, 'creditNote');
    assert.match(inv.source.derived.find((d) => d.field === '/kind')!.rule, /zero total/);
  });

  test('an unknown DocumentType is an error, not a guess', async () => {
    await assert.rejects(parseOne(utf8(base.replace('<DocumentType>1<', '<DocumentType>9<')), 'x.isdoc'), /DocumentType/);
  });
});

describe('ISDOCX: the sample from the ISDOC specification', async () => {
  const inv = await parseOne('invoice.isdocx');

  test('foreign-currency invoice with the CZK rate', () => {
    assert.equal(inv.currency, 'EUR');
    assert.equal(inv.taxCurrency, 'CZK');
    assert.deepEqual(inv.exchangeRate, { rate: '25.10' });
    assert.equal(inv.seller.name, 'ABRA Software a.s.');
    assert.deepEqual(inv.seller.nationalTaxIds, [{ value: '25097563', schemeId: 'CZ:ICO' }]);
    assert.equal(inv.seller.vatId, 'CZ25097563');
  });

  test('other ZIP entries and listed supplements become references', () => {
    assert.ok(inv.attachments.every((a) => a.kind === 'reference'));
    const ids = inv.attachments.map((a) => a.id);
    assert.ok(ids.includes('priloha.txt'));
    assert.ok(ids.includes('Logo.bmp'));
    assert.equal(ids.filter((i) => i === 'priloha.txt').length, 1);
  });

  test('two payments with different due dates fill the schedule', () => {
    assert.equal(inv.dueDate, '2013-03-13');
    assert.deepEqual(inv.paymentSchedule.map((s) => s.dueDate), ['2013-03-13', '2013-06-30']);
    assert.ok(warningCodes(inv).includes('ISDOC-DUEDATES'));
    assert.ok(warningCodes(inv).includes('ISDOC-ORDERS'));
    assert.equal(inv.extensions.cz?.variableSymbol, '111999');
  });
});
