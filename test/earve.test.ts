import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { convert, effectiveSign } from '../src/index.js';
import { fixture, utf8 } from './helpers.js';

describe('e-arve 1.2: two invoices in one file', async () => {
  const r = await convert(fixture('e-arve-1.2-two-invoices.xml'), 'e-arve-1.2-two-invoices.xml');
  assert.equal(r.outcomes.length, 1);
  const o = r.outcomes[0];
  assert.equal(o.status, 'ok');
  const invoices = o.status === 'ok' ? o.invoices : [];
  const [deb, cre] = invoices;

  test('one canonical invoice per Invoice element, with position and fragment path', () => {
    assert.equal(invoices.length, 2);
    assert.deepEqual([deb.source.indexInFile, cre.source.indexInFile], [0, 1]);
    assert.deepEqual([deb.source.fragmentPath, cre.source.fragmentPath], ['/E_Invoice/Invoice[1]', '/E_Invoice/Invoice[2]']);
    assert.equal(deb.source.format, 'e-arve');
    assert.equal(deb.source.formatVersion, '1.2');
    assert.equal(deb.source.fileSha256, cre.source.fileSha256);
    assert.equal(deb.source.payloadSha256, cre.source.payloadSha256);
  });

  test('DEB: header and extensions', () => {
    assert.equal(deb.kind, 'invoice');
    assert.equal(deb.typeCode, '380');
    assert.equal(effectiveSign(deb), 1);
    assert.equal(deb.id, '2026-001');
    assert.equal(deb.issueDate, '2026-10-15');
    assert.equal(deb.dueDate, '2026-10-29');
    assert.equal(deb.currency, 'EUR');
    assert.equal(deb.contractRef, 'LEP-2026-9');
    assert.deepEqual(deb.notes, [{ text: 'Oktoobri teenused' }]);
    assert.equal(deb.paymentTerms, 'Penalty 0.05 % per day');
    assert.deepEqual(deb.extensions.ee, { invoiceType: 'DEB', factoring: true });
    assert.deepEqual(deb.nationalType, { scheme: 'EE:InvoiceType', code: 'DEB' });
  });

  test('DEB: parties, factor', () => {
    assert.equal(deb.seller.name, 'Näidis OÜ');
    assert.deepEqual(deb.seller.legalRegistrationId, { value: '10000001', schemeId: 'EE:REGCODE' });
    assert.equal(deb.seller.vatId, 'EE100000001');
    assert.deepEqual(deb.seller.address, { line1: 'Testi tn 1', city: 'Tallinn', postalCode: '10111', countryCode: 'EE' });
    assert.deepEqual(deb.seller.contact, { name: 'Mari Maasikas', phone: '+372 5000 0001', email: 'arved@naidis.example' });
    assert.equal(deb.buyer.name, 'Proov AS');
    assert.deepEqual(deb.buyer.legalRegistrationId, { value: '10000002', schemeId: 'EE:REGCODE' });
    assert.equal(deb.additionalParties.length, 1);
    assert.equal(deb.additionalParties[0].role, 'factor');
    assert.equal(deb.additionalParties[0].party.name, 'Faktor Pank AS');
  });

  test('DEB: totals, VAT, payment', () => {
    assert.deepEqual(deb.totals, {
      lineNetTotal: '130.00', taxExclusive: '130.00', vatTotal: '24.00', taxInclusive: '154.00', payable: '154.00',
    });
    assert.deepEqual(deb.vatBreakdown, [
      { taxableAmount: '100.00', taxAmount: '24.00', categoryCode: 'S', rate: '24' },
      { taxableAmount: '30.00', taxAmount: '0.00', categoryCode: 'E', rate: '0' },
    ]);
    assert.deepEqual(deb.payments, [{
      meansCode: '30', meansText: 'Arve 2026-001', remittanceInformation: '20260013',
      creditTransfers: [{ accountId: 'EE382200221020145685', accountName: 'Näidis OÜ', serviceProviderId: 'HABAEE2X' }],
    }]);
  });

  test('DEB: TAXEX maps to E without guessing; nothing warns', () => {
    assert.deepEqual(deb.source.warnings, []);
  });

  test('DEB: payment reference is PaymentRefId, not PaymentId (the invoice number)', () => {
    assert.equal(deb.payments[0].remittanceInformation, '20260013');
  });

  test('DEB: embedded attachment', () => {
    assert.deepEqual(deb.attachments, [{
      kind: 'embedded', id: 'arve-2026-001.pdf', mimeCode: 'application/pdf', filename: 'arve-2026-001.pdf', base64: 'JVBERi0xLjQK',
    }]);
  });

  test('DEB: lines', () => {
    assert.equal(deb.lines.length, 2);
    const l = deb.lines[0];
    assert.equal(l.quantity, '2');
    assert.equal(l.unitText, 'tk');
    assert.equal(l.price?.net, '50.00');
    assert.equal(l.netAmount, '100.00');
    assert.deepEqual(l.vat, { categoryCode: 'S', rate: '24' });
    assert.equal(l.item.name, 'Veebiarendus');
    assert.equal(l.item.sellerId, 'TEENUS-1');
    assert.deepEqual(deb.lines[1].vat, { categoryCode: 'E', rate: '0' });
  });

  test('CRE: credit note', () => {
    assert.equal(cre.kind, 'creditNote');
    assert.equal(cre.typeCode, '381');
    assert.equal(effectiveSign(cre), -1);
    assert.equal(cre.id, '2026-002');
    assert.equal(cre.issueDate, '2026-10-20');
    assert.deepEqual(cre.extensions.ee, { invoiceType: 'CRE' });
    assert.deepEqual(cre.additionalParties, []);
    assert.deepEqual(cre.totals, {
      lineNetTotal: '50.00', taxExclusive: '50.00', vatTotal: '12.00', taxInclusive: '62.00', payable: '62.00',
    });
    assert.deepEqual(cre.payments, []);
    assert.deepEqual(cre.source.warnings, []);
  });

  test('a file without Invoice dates is an error outcome, not a crash', async () => {
    const bad = await convert(fixture('e-arve-two-invoices.xml'));
    assert.equal(bad.outcomes[0].status, 'error');
  });
});

describe('e-arve 1.2: VAT ids, prepaid amount and rounding', async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><E_Invoice><Header><Date>2026-10-15</Date><FileId>F2</FileId><Version>1.2</Version></Header>
<Invoice invoiceId="9"><InvoiceParties><SellerParty><Name>S OÜ</Name><RegNumber>10000001</RegNumber></SellerParty><BuyerParty><Name>B AS</Name><RegNumber>10000002</RegNumber></BuyerParty></InvoiceParties>
<InvoiceInformation><Type type="DEB"/><InvoiceNumber>9</InvoiceNumber><InvoiceDate>2026-10-15</InvoiceDate></InvoiceInformation>
<InvoiceSumGroup><InvoiceSum>100.00</InvoiceSum><VAT vatId="NOTTAX"><SumBeforeVAT>100.00</SumBeforeVAT><VATRate>0</VATRate><VATSum>0.00</VATSum></VAT><Rounding>0.01</Rounding><TotalVATSum>0.00</TotalVATSum><TotalSum>100.00</TotalSum><Currency>EUR</Currency>
<Extension><CustomContent><InvoiceSumGroupEN><PrepaidAmount>40.00</PrepaidAmount></InvoiceSumGroupEN></CustomContent></Extension></InvoiceSumGroup></Invoice></E_Invoice>`;
  const r = await convert(utf8(xml), 'x.xml');
  const o = r.outcomes[0];
  assert.equal(o.status, 'ok');
  const inv = o.status === 'ok' ? o.invoices[0] : undefined;

  test('NOTTAX is category O; TotalSum excludes Rounding; payable = TotalSum - prepaid + Rounding', () => {
    assert.deepEqual(inv?.vatBreakdown, [{ taxableAmount: '100.00', taxAmount: '0.00', categoryCode: 'O', rate: '0' }]);
    assert.deepEqual(inv?.totals, {
      lineNetTotal: '100.00', taxExclusive: '100.00', vatTotal: '0.00', taxInclusive: '100.00', prepaid: '40.00', rounding: '0.01', payable: '60.01',
    });
    assert.deepEqual(inv?.source.warnings, []);
  });
});
