import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { convert, effectiveSign } from '../src/index.js';
import { parseOne, utf8, warningCodes } from './helpers.js';

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
    assert.deepEqual(s.legalRegistrationId, { value: '1234567000' });
    assert.equal(s.additionalLegalInfo, 'Družba vpisana v sodni register Ljubljana');
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
      meansText: 'Nakazilo',
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
    assert.ok(!inv.source.derived.some((d) => d.field === '/totals/chargeTotal'));
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

describe('eSLOG 2.0: fields from the EN 16931 mapping tables', async () => {
  const seg = (q: string, v: string) => `<S_RFF><C_C506><D_1153>${q}</D_1153><D_1154>${v}</D_1154></C_C506></S_RFF>`;
  const moa = (code: string, v: string) => `<G_SG50><S_MOA><C_C516><D_5025>${code}</D_5025><D_5004>${v}</D_5004></C_C516></S_MOA></G_SG50>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Invoice xmlns="urn:eslog:2.00" Version="2.00"><M_INVOIC Id="data">
<S_BGM><C_C002><D_1001>380</D_1001></C_C002><C_C106><D_1004>X1</D_1004></C_C106></S_BGM>
<S_DTM><C_C507><D_2005>137</D_2005><D_2380>20261015</D_2380><D_2379>102</D_2379></C_C507></S_DTM>
<S_FTX><D_4451>DOC</D_4451><C_C107><D_4441>P1</D_4441></C_C107><C_C108><D_4440>urn:cen.eu:en16931:2017</D_4440></C_C108></S_FTX>
<S_FTX><D_4451>AGM</D_4451><C_C107><D_4441>VATEX-EU-AE</D_4441></C_C107><C_C108><D_4440>Reverse charge</D_4440></C_C108></S_FTX>
<G_SG1>${seg('AEP', 'PRJ-1')}</G_SG1><G_SG1>${seg('AAK', 'DESP-1')}</G_SG1><G_SG1>${seg('GC', 'TENDER-1')}</G_SG1>
<G_SG2><S_NAD><D_3035>SE</D_3035><C_C080><D_3036>S d.o.o.</D_3036><D_3036>S trade</D_3036></C_C080></S_NAD><G_SG3>${seg('VA', 'SI11111111')}</G_SG3><G_SG3>${seg('AHP', '11111111')}</G_SG3></G_SG2>
<G_SG2><S_NAD><D_3035>BY</D_3035><C_C080><D_3036>B d.o.o.</D_3036></C_C080></S_NAD><G_SG3>${seg('GN', '5555555000')}</G_SG3><G_SG3>${seg('AOU', 'KONTO-7')}</G_SG3>
<G_SG5><S_CTA><D_3139>IC</D_3139></S_CTA><S_COM><C_C076><D_3148>buyer@b.example</D_3148><D_3155>EM</D_3155></C_C076></S_COM></G_SG5></G_SG2>
<G_SG2><S_NAD><D_3035>LC</D_3035><C_C080><D_3036>Zastopnik d.o.o.</D_3036></C_C080><C_C059><D_3042>Cesta 1</D_3042></C_C059><D_3164>Celje</D_3164><D_3207>SI</D_3207></S_NAD><G_SG3>${seg('VA', 'SI99999999')}</G_SG3></G_SG2>
<G_SG7><S_CUX><C_C504><D_6347>2</D_6347><D_6345>EUR</D_6345></C_C504></S_CUX></G_SG7><G_SG7><S_CUX><C_C504><D_6347>6</D_6347><D_6345>EUR</D_6345></C_C504></S_CUX></G_SG7>
<G_SG26><S_LIN><D_1082>1</D_1082><C_C212><D_7140>3830000000050</D_7140><D_7143>SRV</D_7143></C_C212></S_LIN>
<S_IMD><D_7077>F</D_7077><C_C273><D_7008>Storitev</D_7008></C_C273></S_IMD>
<S_QTY><C_C186><D_6063>47</D_6063><D_6060>1</D_6060><D_6411>C62</D_6411></C_C186></S_QTY>
<G_SG27><S_MOA><C_C516><D_5025>203</D_5025><D_5004>100.00</D_5004></C_C516></S_MOA></G_SG27>
<G_SG30><S_RFF><C_C506><D_1153>ON</D_1153><D_1154>PO1</D_1154><D_1156>3</D_1156></C_C506></S_RFF></G_SG30>
<G_SG30><S_RFF><C_C506><D_1153>AWQ</D_1153><D_1154>ACC-9</D_1154></C_C506></S_RFF></G_SG30>
<G_SG30><S_RFF><C_C506><D_1153>AVE</D_1153><D_1154>OBJ-3</D_1154></C_C506></S_RFF></G_SG30>
<G_SG34><S_TAX><D_5283>7</D_5283><C_C241><D_5153>VAT</D_5153></C_C241><C_C243><D_5278>0</D_5278></C_C243><D_5305>AE</D_5305></S_TAX></G_SG34></G_SG26>
${moa('79', '100.00')}${moa('260', '5.00')}${moa('389', '95.00')}${moa('176', '0.00')}${moa('388', '95.00')}${moa('366', '0.02')}${moa('9', '95.02')}
<G_SG52><S_TAX><D_5283>7</D_5283><C_C241><D_5153>VAT</D_5153></C_C241><C_C243><D_5278>0</D_5278></C_C243><D_5305>AE</D_5305></S_TAX>
<S_MOA><C_C516><D_5025>125</D_5025><D_5004>95.00</D_5004></C_C516></S_MOA><S_MOA><C_C516><D_5025>124</D_5025><D_5004>0.00</D_5004></C_C516></S_MOA></G_SG52>
</M_INVOIC></Invoice>`;
  const inv = await parseOne(utf8(xml), 'x.xml');

  test('totals use MOA 260, 389, 388, 366', () => {
    assert.deepEqual(inv.totals, {
      lineNetTotal: '100.00', allowanceTotal: '5.00', taxExclusive: '95.00', vatTotal: '0.00', taxInclusive: '95.00', rounding: '0.02', payable: '95.02',
    });
    assert.deepEqual(inv.source.unmapped, {});
    assert.deepEqual(warningCodes(inv), []);
  });

  test('exemption reason and code come from FTX AGM', () => {
    assert.deepEqual(inv.vatBreakdown, [{
      taxableAmount: '95.00', taxAmount: '0.00', categoryCode: 'AE', rate: '0', exemptionReason: 'Reverse charge', exemptionReasonCode: 'VATEX-EU-AE',
    }]);
  });

  test('process, specification, tax currency and header references', () => {
    assert.equal(inv.businessProcess, 'P1');
    assert.equal(inv.specificationId, 'urn:cen.eu:en16931:2017');
    assert.equal(inv.taxCurrency, 'EUR');
    assert.equal(inv.projectRef, 'PRJ-1');
    assert.equal(inv.despatchAdviceRef, 'DESP-1');
    assert.equal(inv.tenderRef, 'TENDER-1');
  });

  test('parties: names, GN, AHP, CR, AOU, electronic address, tax representative (LC)', () => {
    assert.equal(inv.seller.name, 'S d.o.o.');
    assert.equal(inv.seller.tradingName, 'S trade');
    assert.equal(inv.seller.taxRegistrationId, '11111111');
    assert.deepEqual(inv.buyer.legalRegistrationId, { value: '5555555000' });
    assert.equal(inv.buyerReference, undefined);
    assert.equal(inv.accountingRef, 'KONTO-7');
    assert.deepEqual(inv.buyer.endpoint, { value: 'buyer@b.example', schemeId: 'EM' });
    assert.deepEqual(inv.taxRepresentative, { name: 'Zastopnik d.o.o.', vatId: 'SI99999999', address: { line1: 'Cesta 1', city: 'Celje', countryCode: 'SI' } });
    assert.deepEqual(inv.additionalParties, []);
  });

  test('line: GTIN from LIN, order line from G_SG30 ON/D_1156, object and accounting references', () => {
    const l = inv.lines[0];
    assert.deepEqual(l.item.standardId, { value: '3830000000050', schemeId: '0160' });
    assert.equal(l.orderLineRef, '3');
    assert.equal(l.accountingRef, 'ACC-9');
    assert.deepEqual(l.objectId, { value: 'OBJ-3' });
  });
});

describe('eSLOG 1.6', () => {
  test('stays unsupported (only 2.0 is mapped)', async () => {
    const r = await convert(utf8('<IzdaniRacunEnostavni><GlavaRacuna/></IzdaniRacunEnostavni>'), 'old.xml');
    assert.equal(r.outcomes[0].status, 'unsupported');
  });
});
