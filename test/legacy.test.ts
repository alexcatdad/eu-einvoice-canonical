import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { type CanonicalInvoice, convert, detectXml, effectiveSign } from '../src/index.js';
import { fixture, parseOne, utf8, warningCodes } from './helpers.js';

const text = (name: string) => new TextDecoder().decode(fixture(name));
const brWarnings = (inv: CanonicalInvoice) => warningCodes(inv).filter((c) => c.startsWith('BR-'));

async function parseAll(name: string, bytes?: Uint8Array): Promise<CanonicalInvoice[]> {
  const r = await convert(bytes ?? fixture(name), name);
  assert.equal(r.outcomes.length, 1);
  const o = r.outcomes[0];
  assert.equal(o.status, 'ok', JSON.stringify(o));
  return o.status === 'ok' ? o.invoices : [];
}

// ---------------------------------------------------------------------------
// ZUGFeRD 1.0
// ---------------------------------------------------------------------------

describe('ZUGFeRD 1.0 COMFORT', async () => {
  const inv = await parseOne('zugferd1-comfort.xml');

  test('detection and header', () => {
    assert.equal(inv.source.format, 'zugferd-1');
    assert.equal(inv.source.profileId, 'COMFORT');
    assert.deepEqual(inv.extensions.de, { zugferdProfile: 'COMFORT' });
    assert.equal(inv.specificationId, 'urn:ferd:CrossIndustryDocument:invoice:1p0:comfort');
    assert.equal(inv.kind, 'invoice');
    assert.equal(inv.typeCode, '380');
    assert.equal(inv.id, 'RE-2026-0815');
    assert.equal(inv.issueDate, '2026-10-08');
    assert.equal(inv.dueDate, '2026-10-22');
    assert.equal(inv.currency, 'EUR');
    assert.equal(inv.buyerReference, '04011000-12345-34');
    assert.equal(inv.purchaseOrderRef, 'B-2026-77');
    assert.equal(inv.contractRef, 'V-100');
    assert.equal(inv.despatchAdviceRef, 'LS-7001');
    assert.equal(inv.paymentTerms, 'Zahlbar innerhalb von 14 Tagen netto.');
    assert.deepEqual(inv.invoicePeriod, { start: '2026-09-01', end: '2026-09-30' });
    assert.equal(inv.delivery?.actualDate, '2026-10-01');
    assert.deepEqual(inv.notes, [{ text: 'Zahlbar innerhalb von 14 Tagen netto.' }]);
  });

  test('parties', () => {
    assert.equal(inv.seller.name, 'Musterbau GmbH');
    assert.equal(inv.seller.vatId, 'DE123456789');
    assert.equal(inv.seller.taxRegistrationId, '30/123/45678');
    assert.deepEqual(inv.seller.address, { line1: 'Beispielstrasse 1', city: 'Berlin', postalCode: '10115', countryCode: 'DE' });
    assert.deepEqual(inv.seller.contact, { name: 'Erika Muster', phone: '+49 30 1234567', email: 'rechnung@musterbau.example' });
    assert.equal(inv.buyer.name, 'Beispiel Handels AG');
    assert.deepEqual(inv.buyer.identifiers, [{ value: 'KD-4711' }]);
    assert.equal(inv.buyer.vatId, 'DE987654321');
  });

  test('payment, allowance and charge', () => {
    assert.deepEqual(inv.payments, [
      {
        meansCode: '31',
        meansText: 'Ueberweisung',
        remittanceInformation: 'RE-2026-0815',
        creditTransfers: [{ accountId: 'DE02120300000000202051', accountName: 'Musterbau GmbH', serviceProviderId: 'BYLADEM1001' }],
      },
    ]);
    assert.deepEqual(inv.allowances, [{ amount: '48.00', reason: 'Treuerabatt', vat: { categoryCode: 'S', rate: '19.00' } }]);
    assert.deepEqual(inv.charges, [{ amount: '20.00', reason: 'Versand', vat: { categoryCode: 'S', rate: '19.00' } }]);
  });

  test('totals and VAT breakdown are exactly as sent, and consistent', () => {
    assert.deepEqual(inv.totals, {
      lineNetTotal: '1048.00',
      allowanceTotal: '48.00',
      chargeTotal: '20.00',
      taxExclusive: '1020.00',
      vatTotal: '182.04',
      taxInclusive: '1202.04',
      prepaid: '200.00',
      payable: '1002.04',
    });
    assert.deepEqual(inv.vatBreakdown, [
      { taxableAmount: '922.00', taxAmount: '175.18', categoryCode: 'S', rate: '19.00' },
      { taxableAmount: '98.00', taxAmount: '6.86', categoryCode: 'S', rate: '7.00' },
    ]);
    assert.deepEqual(brWarnings(inv), []);
  });

  test('lines', () => {
    assert.equal(inv.lines.length, 2);
    const [a, b] = inv.lines;
    assert.equal(a.id, '1');
    assert.equal(a.note, 'Stundensatz nach Vertrag');
    assert.equal(a.quantity, '10');
    assert.equal(a.unitCode, 'HUR');
    assert.equal(a.netAmount, '950.00');
    assert.deepEqual(a.price, { net: '95.00', discount: '5.00', gross: '100.00', baseQuantity: '1', baseQuantityUnit: 'HUR' });
    assert.deepEqual(a.vat, { categoryCode: 'S', rate: '19.00' });
    assert.equal(a.item.name, 'Beratung Bauplanung');
    assert.equal(a.item.sellerId, 'BER-01');
    assert.equal(a.item.description, 'Projektbegleitung September');
    assert.deepEqual(b.item.standardId, { value: '4012345000009', schemeId: '0160' });
    assert.equal(b.netAmount, '98.00');
  });

  test('embedded attachment', () => {
    assert.deepEqual(inv.attachments, [
      {
        kind: 'embedded',
        id: 'ANL-1',
        description: 'Leistungsnachweis',
        mimeCode: 'text/plain',
        filename: 'nachweis.txt',
        base64: 'aGVsbG8=',
      },
    ]);
  });

  test('what has no canonical field is kept in unmapped, and the VAT category is recorded as derived', () => {
    assert.equal(inv.source.unmapped['/CrossIndustryDocument/HeaderExchangedDocument/Name'], 'RECHNUNG');
    assert.ok(Object.entries(inv.source.unmapped).some(([k, v]) => k.endsWith('/GermanBankleitzahlID') && v === '12030000'));
    assert.ok(inv.source.derived.some((d) => d.field === '/vat/categoryCode'));
  });

  test('TypeCode 381 is a credit note', async () => {
    const cn = await parseOne(utf8(text('zugferd1-comfort.xml').replace('<ram:TypeCode>380<', '<ram:TypeCode>381<')), 'cn.xml');
    assert.equal(cn.kind, 'creditNote');
    assert.equal(cn.typeCode, '381');
    assert.equal(effectiveSign(cn), -1);
  });

  test('a rate of zero with an exemption reason is category E', async () => {
    const xml = text('zugferd1-comfort.xml').replace(
      '<ram:BasisAmount currencyID="EUR">98.00</ram:BasisAmount>\n        <ram:ApplicablePercent>7.00</ram:ApplicablePercent>',
      '<ram:BasisAmount currencyID="EUR">98.00</ram:BasisAmount>\n        <ram:ExemptionReason>Steuerfrei</ram:ExemptionReason>\n        <ram:ApplicablePercent>0.00</ram:ApplicablePercent>',
    );
    const e = await parseOne(utf8(xml), 'e.xml');
    assert.deepEqual(e.vatBreakdown[1], {
      taxableAmount: '98.00',
      taxAmount: '6.86',
      categoryCode: 'E',
      rate: '0.00',
      exemptionReason: 'Steuerfrei',
    });
  });

  test('inside a PDF as ZUGFeRD-invoice.xml', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    await pdf.attach(fixture('zugferd1-comfort.xml'), 'ZUGFeRD-invoice.xml', { mimeType: 'text/xml' });
    const fromPdf = await parseOne(await pdf.save(), 'rechnung.pdf');
    assert.equal(fromPdf.id, 'RE-2026-0815');
    assert.equal(fromPdf.source.format, 'zugferd-1');
    assert.deepEqual(
      fromPdf.source.envelope.map((e) => e.kind),
      ['pdf-attachment', 'xml'],
    );
    assert.equal(fromPdf.totals.payable, '1002.04');
  });

  test('missing totals are a parse error, not a guess', async () => {
    const xml = text('zugferd1-comfort.xml').replace(/<ram:DuePayableAmount[^>]*>[^<]*<\/ram:DuePayableAmount>/, '');
    const r = await convert(utf8(xml), 'bad.xml');
    assert.equal(r.outcomes[0].status, 'error');
  });
});

// ---------------------------------------------------------------------------
// TEAPPSXML
// ---------------------------------------------------------------------------

describe('TEAPPSXML batch', async () => {
  const [inv, cn] = await parseAll('teappsxml-invoices.xml');

  test('two invoices from one frame', () => {
    assert.equal(inv.source.format, 'teappsxml');
    assert.equal(inv.source.indexInFile, 0);
    assert.equal(cn.source.indexInFile, 1);
    assert.equal(inv.source.fragmentPath, '/INVOICE_CENTER/CONTENT_FRAME[1]/INVOICES/INVOICE[1]');
    assert.equal(cn.source.fragmentPath, '/INVOICE_CENTER/CONTENT_FRAME[1]/INVOICES/INVOICE[2]');
  });

  test('invoice header and references', () => {
    assert.equal(inv.kind, 'invoice');
    assert.equal(inv.typeCode, '380');
    assert.deepEqual(inv.nationalType, { scheme: 'FI:TEAPPSXML:INVOICE_TYPE', code: '00' });
    assert.equal(inv.id, '20261001');
    assert.equal(inv.issueDate, '2026-10-05');
    assert.equal(inv.dueDate, '2026-10-19');
    assert.equal(inv.currency, 'EUR');
    assert.equal(inv.buyerReference, 'Maija Meikäläinen');
    assert.equal(inv.purchaseOrderRef, 'PO-5521');
    assert.equal(inv.salesOrderRef, 'SO-9');
    assert.equal(inv.contractRef, 'K-77');
    assert.equal(inv.projectRef, 'P-1');
    assert.equal(inv.paymentTerms, '14 pv netto');
    assert.deepEqual(inv.invoicePeriod, { start: '2026-09-01', end: '2026-09-30' });
    assert.equal(inv.delivery?.actualDate, '2026-09-30');
    assert.deepEqual(inv.notes, [{ subjectCode: 'AAI', text: 'Toimitusehdot sopimuksen mukaan' }]);
    assert.equal(inv.specificationId, 'teappsxml:3.0');
    assert.ok(inv.source.derived.some((d) => d.field === '/specificationId'));
    assert.equal(inv.extensions.fi?.epiReference, '1234561');
  });

  test('seller (PAYEE), buyer (RECEIVER) and other roles', () => {
    const s = inv.seller;
    assert.equal(s.name, 'Testitoimisto Oy');
    assert.equal(s.vatId, 'FI12345678');
    assert.deepEqual(s.legalRegistrationId, { value: '1234567-8', schemeId: '0212' });
    assert.deepEqual(s.endpoint, { value: '003712345678', schemeId: '0216' });
    assert.deepEqual(s.address, { line1: 'Esimerkkikatu 1', city: 'Helsinki', postalCode: '00100', countryCode: 'FI' });
    assert.deepEqual(s.contact, { name: 'Teppo Testaaja', phone: '+358 9 1234567', email: 'laskutus@testitoimisto.example' });
    assert.equal(inv.buyer.name, 'Asiakas Oy');
    assert.deepEqual(inv.buyer.identifiers, [{ value: 'A-100' }]);
    assert.deepEqual(inv.buyer.endpoint, { value: '003787654321' });
    assert.deepEqual(
      inv.additionalParties.map((p) => [p.role, p.party.name]),
      [['orderer', 'Asiakas Oy, hankinta']],
    );
  });

  test('payment', () => {
    assert.deepEqual(inv.payments, [
      {
        meansCode: '30',
        meansText: 'Tilisiirto',
        remittanceInformation: '1234561',
        creditTransfers: [{ accountId: 'FI2112345600000785', accountName: 'Esimerkkipankki', serviceProviderId: 'NDEAFIHH' }],
      },
    ]);
  });

  test('totals pick the EXCLUDED and INCLUDED amounts, and the advance payment', () => {
    assert.deepEqual(inv.totals, {
      lineNetTotal: '790.00',
      chargeTotal: '10.00',
      taxExclusive: '800.00',
      vatTotal: '197.80',
      taxInclusive: '997.80',
      prepaid: '100.00',
      payable: '897.80',
    });
    assert.deepEqual(inv.vatBreakdown, [
      { taxableAmount: '760.00', taxAmount: '193.80', categoryCode: 'S', rate: '25.5' },
      { taxableAmount: '40.00', taxAmount: '4.00', categoryCode: 'S', rate: '10' },
    ]);
    assert.deepEqual(inv.charges, [
      { amount: '10.00', reason: 'Toimituskulu', reasonCode: 'FC', vat: { categoryCode: 'S', rate: '25.5' } },
    ]);
    assert.deepEqual(brWarnings(inv), []);
  });

  test('rows: discount, price, INFO row skipped', () => {
    assert.equal(inv.lines.length, 2);
    const [a, b] = inv.lines;
    assert.equal(a.id, '1');
    assert.equal(a.quantity, '10');
    assert.equal(a.unitCode, 'HUR');
    assert.equal(a.unitText, 'h');
    assert.equal(a.netAmount, '750.00');
    assert.deepEqual(a.price, { net: '75.00', gross: '80.00', baseQuantity: '1', baseQuantityUnit: 'HUR' });
    assert.deepEqual(a.allowances, [{ amount: '50.00', baseAmount: '800.00', percentage: '6.25', reason: 'Alennus', reasonCode: '95' }]);
    assert.deepEqual(a.vat, { categoryCode: 'S', rate: '25.5' });
    assert.equal(a.item.name, 'Verkkosuunnittelu');
    assert.equal(a.item.sellerId, 'WEB-01');
    assert.equal(a.item.description, 'Syyskuun työt');
    assert.deepEqual(b.item.standardId, { value: '6412345000008', schemeId: '0160' });
    assert.ok(warningCodes(inv).includes('ROW_SKIPPED'));
  });

  test('what has no canonical field is kept in unmapped', () => {
    assert.equal(inv.source.unmapped['/INVOICE_CENTER/.../INVOICE/HEADER/SUBJECT'], 'Verkkosuunnittelu ja kirja');
    assert.equal(inv.source.unmapped['/INVOICE_CENTER/.../INVOICE/PAYEE/INTERMEDIATOR'], 'TESTOP');
  });

  test('credit note: SIGN="-" becomes a minus, the type is derived, the currency comes from the VAT summary', () => {
    assert.equal(cn.kind, 'creditNote');
    assert.equal(cn.typeCode, '381');
    assert.ok(cn.source.derived.some((d) => d.field === '/typeCode'));
    assert.equal(effectiveSign(cn), -1);
    assert.equal(cn.currency, 'EUR');
    assert.ok(!cn.source.derived.some((d) => d.field === '/currency'));
    assert.deepEqual(cn.precedingInvoices, [{ id: '20261001', issueDate: '2026-10-05' }]);
    assert.deepEqual(cn.totals, {
      lineNetTotal: '-40.00',
      taxExclusive: '-40.00',
      vatTotal: '-4.00',
      taxInclusive: '-44.00',
      payable: '-44.00',
    });
    assert.equal(cn.lines[0].quantity, '-2');
    assert.equal(cn.lines[0].netAmount, '-40.00');
    assert.equal(cn.lines[0].price?.net, '20.00');
    assert.deepEqual(brWarnings(cn), []);
  });

  test('no currency anywhere: EUR is assumed, and said so', async () => {
    const xml = text('teappsxml-invoices.xml')
      .replace('<CURRENCY><CODE>EUR</CODE></CURRENCY>', '')
      .replaceAll('<CURRENCY_CODE>EUR</CURRENCY_CODE>', '');
    const [first] = await parseAll('x.xml', utf8(xml));
    assert.equal(first.currency, 'EUR');
    assert.ok(first.source.derived.some((d) => d.field === '/currency'));
    assert.ok(warningCodes(first).includes('CURRENCY_ASSUMED'));
  });

  test('a date with a missing part is a parse error', async () => {
    const xml = text('teappsxml-invoices.xml').replace(
      '<DAY>05</DAY><MONTH>10</MONTH><CENTURY>20</CENTURY><DECADE_AND_YEAR>26</DECADE_AND_YEAR></DATE></INVOICE_DATE>',
      '<DAY>05</DAY><MONTH>10</MONTH></DATE></INVOICE_DATE>',
    );
    const r = await convert(utf8(xml), 'bad.xml');
    assert.equal(r.outcomes[0].status, 'error');
  });

  test('an unknown INVOICE_TYPE is treated as 380 with a warning', async () => {
    const xml = text('teappsxml-invoices.xml').replace(
      '<INVOICE_TYPE UNTDID_CODE="380">00</INVOICE_TYPE>',
      '<INVOICE_TYPE>90</INVOICE_TYPE>',
    );
    const [first] = await parseAll('x.xml', utf8(xml));
    assert.equal(first.typeCode, '380');
    assert.ok(warningCodes(first).includes('TYPE_UNKNOWN'));
  });
});

// ---------------------------------------------------------------------------
// myDATA
// ---------------------------------------------------------------------------

describe('myDATA InvoicesDoc', async () => {
  const [inv, cn] = await parseAll('mydata-two-invoices.xml');

  test('one InvoicesDoc, two invoices', () => {
    assert.equal(inv.source.format, 'gr-mydata');
    assert.equal(inv.source.indexInFile, 0);
    assert.equal(cn.source.indexInFile, 1);
    assert.equal(inv.source.fragmentPath, '/InvoicesDoc/invoice[1]');
    assert.equal(cn.source.fragmentPath, '/InvoicesDoc/invoice[2]');
    assert.equal(inv.source.rootNamespace, 'http://www.aade.gr/myDATA/invoice/v1.0');
  });

  test('type goes to nationalType, kind and the GR extension', () => {
    assert.equal(inv.kind, 'invoice');
    assert.equal(inv.typeCode, '380');
    assert.deepEqual(inv.nationalType, { scheme: 'GR:invoiceType', code: '1.1', label: 'Sales invoice' });
    assert.equal(inv.extensions.gr?.invoiceType, '1.1');
    assert.equal(cn.kind, 'creditNote');
    assert.equal(cn.typeCode, '381');
    assert.equal(cn.nationalType?.code, '5.1');
    assert.equal(effectiveSign(cn), -1);
  });

  test('MARK and UID are the GR:MYDATA clearance', () => {
    assert.deepEqual(inv.clearance, [
      { authority: 'GR:MYDATA', documentId: '400000000000101', secondaryId: '7A1B2C3D4E5F60718293A4B5C6D7E8F901234567' },
    ]);
    assert.deepEqual(cn.clearance, [{ authority: 'GR:MYDATA', documentId: '400000000000102' }]);
  });

  test('number, date, currency and parties', () => {
    assert.equal(inv.id, 'A-101');
    assert.equal(inv.issueDate, '2026-10-05');
    assert.equal(inv.currency, 'EUR');
    assert.equal(inv.seller.name, 'Δείγμα Εμπορική Α.Ε.');
    assert.equal(inv.seller.vatId, 'EL123456789');
    assert.deepEqual(inv.seller.nationalTaxIds, [{ value: '123456789', schemeId: 'GR:AFM' }]);
    assert.deepEqual(inv.seller.address, { line1: 'Οδός Δείγματος 12', city: 'Αθήνα', postalCode: '10431', countryCode: 'GR' });
    assert.equal(inv.buyer.vatId, 'EL987654321');
    assert.deepEqual(inv.buyer.address, { city: 'Θεσσαλονίκη', postalCode: '54623', countryCode: 'GR' });
    assert.equal(cn.id, 'B-7');
    assert.ok(cn.source.derived.some((d) => d.field === '/currency'));
  });

  test('classifications from the lines go to extensions.gr', () => {
    assert.deepEqual(inv.extensions.gr?.classifications, [
      { type: 'E3_561_001', category: 'category1_3', amount: '100.00' },
      { type: 'E3_561_001', category: 'category1_2', amount: '50.00' },
    ]);
    assert.equal(cn.extensions.gr?.classifications, undefined);
  });

  test('lines, VAT breakdown and totals', () => {
    assert.deepEqual(
      inv.lines.map((l) => [l.id, l.quantity, l.unitCode, l.netAmount, l.vat?.rate]),
      [
        ['1', '10', 'C62', '100.00', '24'],
        ['2', '5', 'KGM', '50.00', '13'],
      ],
    );
    assert.equal(inv.lines[0].item.name, 'Υπηρεσίες συντήρησης');
    assert.deepEqual(inv.vatBreakdown, [
      { taxableAmount: '100.00', taxAmount: '24.00', categoryCode: 'S', rate: '24', nationalCode: 'GR:vatCategory:1' },
      { taxableAmount: '50.00', taxAmount: '6.50', categoryCode: 'S', rate: '13', nationalCode: 'GR:vatCategory:2' },
    ]);
    assert.deepEqual(inv.totals, {
      lineNetTotal: '150.00',
      taxExclusive: '150.00',
      vatTotal: '30.50',
      taxInclusive: '180.50',
      payable: '180.50',
    });
    assert.deepEqual(brWarnings(inv), []);
    assert.ok(warningCodes(inv).includes('NO_ITEM_NAME'));
    assert.deepEqual(inv.payments, [{ meansCode: '30', meansText: 'Τραπεζική κατάθεση', nationalMeansCode: '1', creditTransfers: [] }]);
  });

  test('credit invoice: positive amounts, correlated MARK, withholding kept apart from the totals', () => {
    assert.deepEqual(cn.precedingInvoices, [{ id: '400000000000101', clearanceId: '400000000000101' }]);
    assert.ok(warningCodes(cn).includes('PRECEDING_BY_MARK'));
    assert.deepEqual(cn.withholdings, [{ scheme: 'GR:withheld', amount: '5.00', reasonCode: '3' }]);
    assert.deepEqual(cn.totals, {
      lineNetTotal: '100.00',
      taxExclusive: '100.00',
      vatTotal: '24.00',
      taxInclusive: '124.00',
      withholdingTotal: '5.00',
      payable: '119.00',
    });
    assert.equal(cn.lines[0].subjectToWithholding, true);
    assert.deepEqual(cn.lines[0].national, { withheldAmount: '5.00', withheldPercentCategory: '3' });
    assert.deepEqual(brWarnings(cn), []);
  });

  test('what has no canonical field is kept in unmapped', () => {
    assert.equal(inv.source.unmapped['/InvoicesDoc/invoice/issuer/branch'], '0');
    assert.equal(inv.source.unmapped['/InvoicesDoc/invoice/paymentMethods/paymentMethodDetails[1]/amount'], '180.50');
  });

  test('a document without counterpart (retail) still parses, with a warning', async () => {
    const xml = text('mydata-two-invoices.xml').replace(/<counterpart>[\s\S]*?<\/counterpart>/, '');
    const [first] = await parseAll('x.xml', utf8(xml));
    assert.deepEqual(first.buyer, { identifiers: [], nationalTaxIds: [] });
    assert.ok(warningCodes(first).includes('NO_COUNTERPART'));
  });

  test('a VAT category outside the rate table keeps its code and warns', async () => {
    const xml = text('mydata-two-invoices.xml').replace('<vatCategory>2</vatCategory>', '<vatCategory>99</vatCategory>');
    const [first] = await parseAll('x.xml', utf8(xml));
    assert.deepEqual(first.lines[1].vat, { categoryCode: 'S', nationalCode: 'GR:vatCategory:99' });
    assert.ok(warningCodes(first).includes('VAT_CATEGORY_UNKNOWN'));
  });

  test('a line without netValue is a parse error', async () => {
    const xml = text('mydata-two-invoices.xml').replace('<netValue>50.00</netValue>', '');
    const r = await convert(utf8(xml), 'bad.xml');
    assert.equal(r.outcomes[0].status, 'error');
  });
});

describe('myDATA detection uses the AADE invoice namespace', () => {
  const doc = (ns: string) =>
    `<InvoicesDoc xmlns="${ns}"><invoice><invoiceHeader><invoiceType>1.1</invoiceType></invoiceHeader></invoice></InvoicesDoc>`;

  test('the official namespace is detected, with the invoice type as profile', () => {
    const d = detectXml(doc('http://www.aade.gr/myDATA/invoice/v1.0'));
    assert.equal(d.kind, 'invoice');
    if (d.kind === 'invoice') {
      assert.equal(d.format.id, 'gr-mydata');
      assert.equal(d.details.profile, '1.1');
    }
  });

  test('a namespace that only contains the host name is not', () => {
    assert.notEqual(detectXml(doc('http://example.com/aade.gr/myDATA/other')).kind, 'invoice');
  });
});

describe('ZUGFeRD 1 text-only line', () => {
  test('a line with only a note is kept, recorded as 0 and flagged', async () => {
    const textLine =
      '<ram:IncludedSupplyChainTradeLineItem><ram:AssociatedDocumentLineDocument><ram:IncludedNote><ram:Content>Lieferung bis 23.12.</ram:Content></ram:IncludedNote></ram:AssociatedDocumentLineDocument><ram:SpecifiedSupplyChainTradeSettlement /></ram:IncludedSupplyChainTradeLineItem>';
    const first = '<ram:IncludedSupplyChainTradeLineItem>';
    const src = text('zugferd1-comfort.xml');
    assert.ok(src.includes(first));
    const inv = await parseOne(utf8(src.replace(first, textLine + first)), 'x.xml');
    assert.equal(inv.lines[0]?.netAmount, '0');
    assert.equal(inv.lines[0]?.note, 'Lieferung bis 23.12.');
    assert.ok(warningCodes(inv).includes('TEXT_LINE'));
  });
});

describe('ZUGFeRD 1 BASIC without DuePayableAmount', () => {
  const src = text('zugferd1-comfort.xml');
  const due = '<ram:DuePayableAmount currencyID="EUR">1002.04</ram:DuePayableAmount>';

  test('BASIC has no DuePayableAmount: the amount due is GrandTotalAmount - TotalPrepaidAmount, recorded as derived', async () => {
    assert.ok(src.includes(due) && src.includes('1p0:comfort'));
    const inv = await parseOne(utf8(src.replace('1p0:comfort', '1p0:basic').replace(due, '')), 'x.xml');
    assert.equal(inv.source.profileId, 'BASIC');
    assert.equal(inv.totals.payable, '1002.04');
    assert.ok(inv.source.derived.some((d) => d.field === '/totals/payable'));
  });

  test('COMFORT requires it', async () => {
    const r = await convert(utf8(src.replace(due, '')), 'x.xml');
    assert.equal(r.outcomes[0].status, 'error');
  });
});

describe('CII dates in format 610 (month) and 616 (ISO week)', () => {
  const src = text('zugferd1-comfort.xml');
  const period = (start: string, end: string) =>
    utf8(
      src
        .replace('<udt:DateTimeString format="102">20260901</udt:DateTimeString>', start)
        .replace('<udt:DateTimeString format="102">20260930</udt:DateTimeString>', end),
    );

  test('a week runs Monday to Sunday', async () => {
    const week = '<udt:DateTimeString format="616">201338</udt:DateTimeString>';
    const inv = await parseOne(period(week, week), 'x.xml');
    assert.deepEqual(inv.invoicePeriod, { start: '2013-09-16', end: '2013-09-22' });
    assert.ok(inv.source.derived.some((d) => /616/.test(d.rule)));
  });

  test('a month runs from its first to its last day', async () => {
    const month = '<udt:DateTimeString format="610">202402</udt:DateTimeString>';
    const inv = await parseOne(period(month, month), 'x.xml');
    assert.deepEqual(inv.invoicePeriod, { start: '2024-02-01', end: '2024-02-29' });
  });

  for (const value of ['202153', '201353']) {
    test(`week 53 of a year with 52 weeks is an error (${value})`, async () => {
      const week = `<udt:DateTimeString format="616">${value}</udt:DateTimeString>`;
      const r = await convert(period(week, week), 'x.xml');
      assert.equal(r.outcomes[0].status, 'error');
    });
  }

  test('week 53 of a year that has one is accepted', async () => {
    const week = '<udt:DateTimeString format="616">202053</udt:DateTimeString>';
    const inv = await parseOne(period(week, week), 'x.xml');
    assert.deepEqual(inv.invoicePeriod, { start: '2020-12-28', end: '2021-01-03' });
  });
});
