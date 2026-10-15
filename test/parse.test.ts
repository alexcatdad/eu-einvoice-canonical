import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { convert, effectiveSign, IMPLEMENTED_FAMILIES } from '../src/index.js';
import { NotImplementedError, PARSERS } from '../src/parsers/index.js';
import { fixture, parseOne, utf8, warningCodes } from './helpers.js';

describe('UBL: Peppol BIS 3 invoice', async () => {
  const inv = await parseOne('peppol-bis3-invoice.xml');

  test('header', () => {
    assert.equal(inv.kind, 'invoice');
    assert.equal(inv.typeCode, '380');
    assert.equal(inv.id, 'INV-2026-1042');
    assert.equal(inv.issueDate, '2026-10-15');
    assert.equal(inv.dueDate, '2026-11-14');
    assert.equal(inv.currency, 'SEK');
    assert.equal(inv.buyerReference, '4025:ANNA');
    assert.equal(inv.accountingRef, '6110');
    assert.equal(inv.projectRef, 'PRJ-1');
    assert.equal(inv.contractRef, 'K-2026-1');
    assert.equal(inv.purchaseOrderRef, 'PO-1001');
    assert.equal(inv.salesOrderRef, 'SO-77');
    assert.deepEqual(inv.invoicedObjectId, { value: 'OBJ-77', schemeId: 'AAB' });
    assert.equal(inv.paymentTerms, '30 dagar netto');
    assert.deepEqual(inv.invoicePeriod, { start: '2026-09-01', end: '2026-09-30' });
    assert.deepEqual(inv.precedingInvoices, [{ id: 'INV-2026-0999', issueDate: '2026-09-30' }]);
    assert.equal(inv.selfBilled, false);
    assert.equal(effectiveSign(inv), 1);
  });

  test('Peppol note subject code (#AAI#) is split out', () => {
    assert.deepEqual(inv.notes, [{ subjectCode: 'AAI', text: 'Leverans enligt avtal K-2026-1' }, { text: 'Tack för ert köp' }]);
  });

  test('seller', () => {
    const s = inv.seller;
    assert.equal(s.name, 'Snickeri Exempel AB');
    assert.equal(s.tradingName, 'Snickeri Exempel');
    assert.deepEqual(s.endpoint, { value: '5560000001', schemeId: '0007' });
    assert.deepEqual(s.legalRegistrationId, { value: '5560000001', schemeId: '0007' });
    assert.deepEqual(s.identifiers, [{ value: '7300010000002', schemeId: '0088' }]);
    assert.equal(s.vatId, 'SE556000000101');
    assert.equal(s.taxRegistrationId, 'Godkänd för F-skatt');
    assert.equal(s.additionalLegalInfo, 'Säte Stockholm');
    assert.deepEqual(s.address, { line1: 'Storgatan 1', line2: 'Box 12', city: 'Stockholm', postalCode: '11122', countryCode: 'SE' });
    assert.deepEqual(s.contact, { name: 'Erik Exempel', phone: '+46 8 123 45', email: 'faktura@snickeri.example' });
  });

  test('buyer and delivery', () => {
    assert.equal(inv.buyer.name, 'Uppsala kommun');
    assert.deepEqual(inv.buyer.endpoint, { value: '2120000001', schemeId: '0007' });
    assert.equal(inv.delivery?.actualDate, '2026-10-10');
    assert.deepEqual(inv.delivery?.locationId, { value: '7300010000019', schemeId: '0088' });
    assert.equal(inv.delivery?.partyName, 'Kommunens förråd');
    assert.equal(inv.delivery?.address?.city, 'Uppsala');
  });

  test('payment: Bankgiro is code 30 with SE:BANKGIRO', () => {
    assert.deepEqual(inv.payments, [{
      meansCode: '30', meansText: 'Bankgiro', remittanceInformation: '4711000123',
      creditTransfers: [{ accountId: '1234567', accountName: 'Snickeri Exempel AB', serviceProviderId: 'SE:BANKGIRO' }],
    }]);
  });

  test('document allowances and charges are split and keep their VAT', () => {
    assert.deepEqual(inv.allowances, [{ amount: '100.00', reason: 'Volymrabatt', reasonCode: '95', vat: { categoryCode: 'S', rate: '25' } }]);
    assert.deepEqual(inv.charges, [{ amount: '50.00', reason: 'Frakt', reasonCode: 'FC', vat: { categoryCode: 'S', rate: '25' } }]);
  });

  test('totals are decimal strings exactly as sent', () => {
    assert.deepEqual(inv.totals, {
      lineNetTotal: '2960.00', allowanceTotal: '100.00', chargeTotal: '50.00', taxExclusive: '2910.00',
      vatTotal: '680.70', taxInclusive: '3590.70', prepaid: '500.00', rounding: '0.30', payable: '3091.00',
    });
  });

  test('VAT breakdown per rate', () => {
    assert.deepEqual(inv.vatBreakdown, [
      { taxableAmount: '2550.00', taxAmount: '637.50', categoryCode: 'S', rate: '25' },
      { taxableAmount: '360.00', taxAmount: '43.20', categoryCode: 'S', rate: '12' },
    ]);
  });

  test('embedded attachment', () => {
    assert.equal(inv.attachments.length, 1);
    const a = inv.attachments[0];
    assert.equal(a.kind, 'embedded');
    if (a.kind === 'embedded') {
      assert.equal(a.filename, 'tidrapport.txt');
      assert.equal(a.mimeCode, 'text/plain');
      assert.equal(atob(a.base64), 'Hello from the timesheet.');
    }
  });

  test('lines', () => {
    assert.equal(inv.lines.length, 4);
    const [l1, l2, , l4] = inv.lines;
    assert.equal(l1.quantity, '10');
    assert.equal(l1.unitCode, 'H87');
    assert.equal(l1.note, 'Monterade på plats');
    assert.equal(l1.orderLineRef, '1');
    assert.deepEqual(l1.item.standardId, { value: '07300010000106', schemeId: '0160' });
    assert.deepEqual(l1.item.classifications, [{ code: '44111515', listId: 'STI' }]);
    assert.deepEqual(l1.item.attributes, [{ name: 'Färg', value: 'Ek' }]);
    assert.deepEqual(l2.period, { start: '2026-09-15', end: '2026-09-16' });
    assert.deepEqual(l4.price, { net: '45.00', discount: '5.00', gross: '50.00', baseQuantity: '100', baseQuantityUnit: 'C62' });
    assert.deepEqual(l4.vat, { categoryCode: 'S', rate: '25' });
  });

  test('source metadata', () => {
    assert.equal(inv.source.format, 'peppol-bis3');
    assert.equal(inv.source.syntaxDocumentType, 'Invoice');
    assert.equal(inv.source.profileId, 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0');
    assert.match(inv.source.fileSha256, /^[0-9a-f]{64}$/);
    assert.match(inv.source.payloadSha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(inv.source.warnings, []);
  });

  test('output is plain JSON (round-trips unchanged)', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(inv)), inv);
  });
});

describe('UBL: credit notes and signs', () => {
  test('Peppol CreditNote: due date from PaymentMeans, project from document type 50, signs unchanged', async () => {
    const cn = await parseOne('peppol-bis3-creditnote.xml');
    assert.equal(cn.kind, 'creditNote');
    assert.equal(cn.typeCode, '381');
    assert.equal(cn.dueDate, '2026-11-01');
    assert.equal(cn.projectRef, 'PRJ-1');
    assert.equal(cn.attachments.length, 0);
    assert.equal(cn.lines[0].quantity, '8');
    assert.equal(cn.totals.payable, '250.00');
    assert.equal(effectiveSign(cn), -1);
  });

  test('negative 380 invoice: kind invoice, negative amounts kept, price positive', async () => {
    const inv = await parseOne('peppol-negative-invoice.xml');
    assert.equal(inv.kind, 'invoice');
    assert.equal(inv.totals.payable, '-242.00');
    assert.equal(inv.lines[0].quantity, '-2');
    assert.equal(inv.lines[0].netAmount, '-200.00');
    assert.equal(inv.lines[0].price?.net, '100.00');
    assert.deepEqual(warningCodes(inv), []);
  });

  test('a root cbc:DueDate on a CreditNote is used with a warning', async () => {
    const xml = new TextDecoder().decode(fixture('peppol-bis3-creditnote.xml'))
      .replace(/<cac:PaymentMeans>[\s\S]*?<\/cac:PaymentMeans>/, '')
      .replace('<cbc:CreditNoteTypeCode>', '<cbc:DueDate>2026-12-01</cbc:DueDate><cbc:CreditNoteTypeCode>');
    const cn = await parseOne(utf8(xml));
    assert.equal(cn.dueDate, '2026-12-01');
    assert.ok(warningCodes(cn).includes('CREDITNOTE_ROOT_DUEDATE'));
  });
});

describe('UBL: XRechnung', () => {
  test('Leitweg-ID, IBAN and extension', async () => {
    const inv = await parseOne('xrechnung-ubl.xml');
    assert.equal(inv.source.format, 'xrechnung-ubl');
    assert.equal(inv.buyerReference, '04011000-12345-34');
    assert.deepEqual(inv.buyer.endpoint, { value: '04011000-12345-34', schemeId: '0204' });
    assert.deepEqual(inv.seller.endpoint, { value: 'rechnung@beispiel.example', schemeId: 'EM' });
    assert.deepEqual(inv.payments[0].creditTransfers, [{ accountId: 'DE02120300000000202051', accountName: 'Beispiel GmbH', serviceProviderId: 'BYLADEM1001' }]);
    assert.deepEqual(inv.extensions, { de: { xrechnungVersion: '3.0' } });
    assert.equal(inv.lines[0].unitCode, 'DAY');
  });
});

describe('CII', () => {
  test('XRechnung CII: dates in format 102, gross/net price, tax registrations', async () => {
    const inv = await parseOne('xrechnung-cii.xml');
    assert.equal(inv.kind, 'invoice');
    assert.equal(inv.issueDate, '2026-10-03');
    assert.equal(inv.dueDate, '2026-10-31');
    assert.equal(inv.delivery?.actualDate, '2026-09-30');
    assert.deepEqual(inv.notes, [{ subjectCode: 'AAI', text: 'Vielen Dank für Ihren Auftrag.' }]);
    assert.equal(inv.seller.vatId, 'DE123456789');
    assert.equal(inv.seller.taxRegistrationId, '30/123/45678');
    assert.deepEqual(inv.seller.legalRegistrationId, { value: 'HRB 12345' });
    assert.equal(inv.seller.address?.line1, 'Hauptstraße 1');
    assert.equal(inv.purchaseOrderRef, 'BE-4711');
    assert.equal(inv.contractRef, 'RV-2026-3');
    assert.equal(inv.payments[0].remittanceInformation, 'RE-2026-501');
    assert.deepEqual(inv.payments[0].creditTransfers, [{ accountId: 'DE02120300000000202051', accountName: 'Beispiel GmbH', serviceProviderId: 'BYLADEM1001' }]);
    assert.deepEqual(inv.totals, { lineNetTotal: '700.00', taxExclusive: '700.00', vatTotal: '121.00', taxInclusive: '821.00', payable: '821.00' });
    assert.equal(inv.vatBreakdown.length, 2);
    const [l1, l2] = inv.lines;
    assert.deepEqual(l1.price, { net: '200.00', discount: '20.00', gross: '220.00' });
    assert.deepEqual(l1.item.standardId, { value: '4012345000009', schemeId: '0160' });
    assert.equal(l1.item.originCountry, 'DE');
    assert.deepEqual(l2.vat, { categoryCode: 'S', rate: '7' });
    assert.deepEqual(warningCodes(inv), []);
  });

  test('Factur-X BASIC credit note: TypeCode 381 on the CII root means creditNote', async () => {
    const cn = await parseOne('facturx-basic-creditnote.xml');
    assert.equal(cn.kind, 'creditNote');
    assert.equal(cn.typeCode, '381');
    assert.deepEqual(cn.precedingInvoices, [{ id: 'F-2026-88', issueDate: '2026-09-01' }]);
    assert.deepEqual(cn.seller.legalRegistrationId, { value: '123456782', schemeId: '0002' });
    assert.deepEqual(cn.extensions, { de: { zugferdProfile: 'BASIC' } });
    assert.equal(effectiveSign(cn), -1);
  });

  test('Factur-X MINIMUM: no lines, BT-106 derived and flagged', async () => {
    const inv = await parseOne('facturx-minimum.xml');
    assert.equal(inv.lines.length, 0);
    assert.equal(inv.totals.lineNetTotal, '100.00');
    assert.ok(inv.source.derived.some((d) => d.field === '/totals/lineNetTotal'));
    assert.deepEqual(warningCodes(inv).sort(), ['NO_LINES', 'NO_LINE_TOTAL']);
  });

  test('Factur-X PDF (Mustang sample): parsed from the embedded XML', async () => {
    const inv = await parseOne('facturx-en16931.pdf');
    assert.equal(inv.id, '471102');
    assert.equal(inv.totals.payable, '529.87');
    assert.deepEqual(inv.source.envelope.map((s) => s.kind), ['pdf-attachment', 'xml']);
    assert.deepEqual(warningCodes(inv), []);
  });
});

describe('Svefaktura 1.0', async () => {
  const inv = await parseOne('svefaktura-1.0.xml');

  test('header and references', () => {
    assert.equal(inv.kind, 'invoice');
    assert.equal(inv.id, 'SF-2026-17');
    assert.equal(inv.currency, 'SEK');
    assert.equal(inv.dueDate, '2026-10-31');
    assert.equal(inv.buyerReference, 'Anna Andersson');
    assert.equal(inv.accountingRef, '4010');
    assert.equal(inv.contractRef, 'AVTAL-55');
    assert.equal(inv.purchaseOrderRef, 'PO-55');
    assert.equal(inv.specificationId, 'urn:sfti:documents:BasicInvoice:1:0');
    assert.equal(inv.paymentTerms, '30 dagar netto\nDröjsmålsränta 8 %');
    assert.deepEqual(inv.invoicePeriod, { start: '2026-09-01', end: '2026-09-30' });
  });

  test('ISO-8859-1 text is decoded correctly', () => {
    assert.equal(inv.notes[0].text, 'Tack för beställningen! Leverans till förrådet på Ågatan.');
    assert.equal(inv.buyer.address?.city, 'Örebro');
  });

  test('seller: org.nr -> 0007, GLN -> 0088, F-skatt and seat normalised, contacts merged', () => {
    const s = inv.seller;
    assert.equal(s.name, 'Snickeri Exempel AB');
    assert.equal(s.tradingName, 'Snickeri Exempel');
    assert.deepEqual(s.legalRegistrationId, { value: '5560000001', schemeId: '0007' });
    assert.deepEqual(s.identifiers, [{ value: '7300010000002', schemeId: '0088' }]);
    assert.equal(s.taxRegistrationId, 'Godkänd för F-skatt');
    assert.equal(s.additionalLegalInfo, 'Säte Stockholm');
    assert.equal(s.contact?.email, 'erik@snickeri.example, faktura@snickeri.example');
    assert.equal(s.address?.line2, 'Box 12');
    assert.equal(s.endpoint, undefined);
  });

  test('Telefax has no EN term and goes to source.unmapped', () => {
    assert.deepEqual(inv.source.unmapped, { '/Invoice/SellerParty/Party/Contact/Telefax': '08-123 46' });
  });

  test('Bankgiro: PaymentMeansTypeCode 1 -> 30 + SE:BANKGIRO, digits only, derivation recorded', () => {
    assert.deepEqual(inv.payments, [{ meansCode: '30', remittanceInformation: '4711000123', creditTransfers: [{ accountId: '1234567', serviceProviderId: 'SE:BANKGIRO' }] }]);
    assert.ok(inv.source.derived.some((d) => d.field === '/payments/meansCode'));
  });

  test('invoicing fee: ZZZ + @name -> reason, no reason code', () => {
    assert.deepEqual(inv.charges, [{ amount: '45.00', reason: 'Fakturaavgift', vat: { categoryCode: 'S', rate: '25' } }]);
  });

  test('totals: round-off removed from BT-112, payable keeps it', () => {
    assert.equal(inv.totals.taxInclusive, '4524.56');
    assert.equal(inv.totals.rounding, '0.44');
    assert.equal(inv.totals.payable, '4525.00');
    assert.equal(inv.totals.chargeTotal, '45.00');
    assert.ok(!warningCodes(inv).some((c) => c.startsWith('BR-CO')));
  });

  test('lines: free-text units mapped with the original kept; missing quantity is not invented', () => {
    const [l1, l2, l3] = inv.lines;
    assert.equal(l1.unitCode, 'H87');
    assert.equal(l1.unitText, 'st');
    assert.equal(l1.price?.net, '250.00');
    assert.deepEqual(l1.item.standardId, { value: '07300010000106', schemeId: '0160' });
    assert.equal(l2.quantity, '3.5');
    assert.equal(l2.unitCode, 'HUR');
    assert.equal(l2.unitText, 'tim');
    assert.equal(l3.quantity, undefined);
    assert.equal(l3.price, undefined);
    assert.equal(l3.item.name, 'Frakt');
  });

  test('line VAT derived from the single document rate, and recorded', () => {
    assert.ok(inv.lines.every((l) => l.vat?.categoryCode === 'S' && l.vat.rate === '25'));
    assert.ok(inv.source.derived.some((d) => d.field === '/lines/*/vat'));
  });

  test('delivery date-time truncated, dropped time reported', () => {
    assert.equal(inv.delivery?.actualDate, '2026-09-28');
    assert.ok(warningCodes(inv).includes('TIME_DROPPED'));
  });

  test('ObjectEnvelope attachment becomes a reference', () => {
    assert.deepEqual(inv.attachments, [{ kind: 'reference', id: 'urn:sfti:documents:object:SF-2026-17-1', schemeId: 'ATS' }]);
  });

  test('381 credit: creditNote with source signs; missing VAT breakdown synthesised and recorded', async () => {
    const cn = await parseOne('svefaktura-1.0-credit.xml');
    assert.equal(cn.kind, 'creditNote');
    assert.equal(cn.totals.payable, '500.00');
    assert.deepEqual(cn.precedingInvoices, [{ id: 'SF-2026-17' }]);
    assert.equal(cn.currency, 'SEK');
    assert.ok(cn.source.derived.some((d) => d.field === '/currency'));
    assert.deepEqual(cn.vatBreakdown, [{ taxableAmount: '500.00', taxAmount: '0', categoryCode: 'E', exemptionReason: 'No VAT stated in the source invoice' }]);
    assert.ok(cn.source.derived.some((d) => d.field === '/vatBreakdown/0'));
  });

  test('LineItemCountNumeric mismatch is reported', async () => {
    const xml = new TextDecoder('latin1').decode(fixture('svefaktura-1.0.xml')).replace('<LineItemCountNumeric>3<', '<LineItemCountNumeric>4<');
    const bytes = Uint8Array.from(xml, (ch) => ch.charCodeAt(0));
    const inv2 = await parseOne(bytes);
    assert.ok(warningCodes(inv2).includes('SF-LINECOUNT'));
  });
});

describe('real samples (phive-rules / Mustang / ANAF)', () => {
  for (const f of ['anaf-download.zip', 'hr-cius.xml', 'en16931-2026.xml', 'peppol-in-sbdh.xml', 'peppol-utf16.xml']) {
    test(`${f} parses with consistent totals`, async () => {
      const inv = await parseOne(f);
      assert.ok(inv.lines.length > 0);
      assert.deepEqual(warningCodes(inv).filter((c) => c.startsWith('BR-CO')), []);
    });
  }
});

describe('parser registry', () => {
  test('IMPLEMENTED_FAMILIES is derived from the registry and lists the real parsers', () => {
    for (const f of ['ubl', 'cii', 'svefaktura'] as const) assert.ok(IMPLEMENTED_FAMILIES.includes(f), f);
    for (const f of IMPLEMENTED_FAMILIES) assert.ok(f in PARSERS, f);
  });
});

describe('convert outcomes', () => {
  test('formats without a parser are "unsupported", with the detection kept', async () => {
    // Every family has a parser now, so stand in a stub for one of them for the duration of the test.
    const original = PARSERS.mydata;
    PARSERS.mydata = () => { throw new NotImplementedError('mydata'); };
    try {
      const r = await convert(fixture('mydata.xml'), 'mydata.xml');
      assert.equal(r.outcomes[0].status, 'unsupported');
      assert.equal(r.outcomes[0].detection.kind, 'invoice');
    } finally {
      PARSERS.mydata = original;
    }
  });

  test('a recognised non-invoice is "not-an-invoice"', async () => {
    const r = await convert(fixture('sdi-metadata.xml'));
    assert.equal(r.outcomes[0].status, 'not-an-invoice');
  });

  test('a malformed amount is an error naming the element, not a silent value', async () => {
    const xml = new TextDecoder().decode(fixture('xrechnung-ubl.xml')).replace('<cbc:PayableAmount currencyID="EUR">1190.00', '<cbc:PayableAmount currencyID="EUR">1.190,00');
    const r = await convert(utf8(xml));
    const o = r.outcomes[0];
    assert.equal(o.status, 'error');
    if (o.status === 'error') assert.match(o.error, /PayableAmount.*Not a decimal/);
  });

  test('a missing invoice number is an error', async () => {
    const xml = new TextDecoder().decode(fixture('xrechnung-ubl.xml')).replace('<cbc:ID>RE-2026-500</cbc:ID>', '');
    const r = await convert(utf8(xml));
    assert.equal(r.outcomes[0].status, 'error');
  });

  test('tampered totals are reported as BR-CO warnings, values untouched', async () => {
    const xml = new TextDecoder().decode(fixture('peppol-bis3-invoice.xml'))
      .replace('<cbc:PayableAmount currencyID="SEK">3091.00', '<cbc:PayableAmount currencyID="SEK">3100.00')
      .replace('<cbc:TaxAmount currencyID="SEK">680.70</cbc:TaxAmount>', '<cbc:TaxAmount currencyID="SEK">680.00</cbc:TaxAmount>');
    const inv = await parseOne(utf8(xml));
    assert.equal(inv.totals.payable, '3100.00');
    assert.deepEqual(warningCodes(inv).sort(), ['BR-CO-14', 'BR-CO-15', 'BR-CO-16']);
  });
});
