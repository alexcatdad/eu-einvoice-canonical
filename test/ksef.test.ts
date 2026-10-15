import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { convert, effectiveSign } from '../src/index.js';
import { fixture, parseOne, utf8, warningCodes } from './helpers.js';

const text = (name: string) => new TextDecoder().decode(fixture(name));
const NIP_SELLER = { value: '1234563218', schemeId: 'PL:NIP' };

describe('KSeF FA(3): standard VAT invoice with several rates', async () => {
  const inv = await parseOne('ksef-fa3-vat-multirate.xml');

  test('header', () => {
    assert.equal(inv.kind, 'invoice');
    assert.equal(inv.typeCode, '380');
    assert.equal(inv.id, 'FV/2026/10/0042');
    assert.equal(inv.issueDate, '2026-10-05');
    assert.equal(inv.currency, 'PLN');
    assert.deepEqual(inv.nationalType, { scheme: 'PL:RodzajFaktury', code: 'VAT', label: 'Faktura podstawowa' });
    assert.equal(inv.delivery?.actualDate, '2026-10-04');
    assert.equal(inv.contractRef, 'UM/2026/17');
    assert.equal(inv.purchaseOrderRef, 'ZAM-9001');
    assert.equal(inv.selfBilled, false);
    assert.equal(effectiveSign(inv), 1);
    assert.equal(inv.source.formatVersion, 'FA (3)');
    assert.equal(inv.specificationId, 'http://crd.gov.pl/wzor/2025/06/25/13775/');
    assert.deepEqual(inv.clearance, []);
    assert.deepEqual(inv.notes, [{ text: 'Nr projektu: PRJ-77' }, { text: 'Kapitał zakładowy 50 000 zł' }]);
  });

  test('seller: NIP as national id, VAT id derived with PL prefix and recorded as derived', () => {
    const s = inv.seller;
    assert.equal(s.name, 'Pracownia Meblowa Przykład sp. z o.o.');
    assert.deepEqual(s.nationalTaxIds, [NIP_SELLER]);
    assert.equal(s.vatId, 'PL1234563218');
    assert.ok(inv.source.derived.some((d) => d.field === '/seller/vatId'));
    assert.deepEqual(s.address, { line1: 'ul. Stolarska 12', line2: '31-001 Kraków', countryCode: 'PL' });
    assert.deepEqual(s.contact, { email: 'faktury@pracownia.example', phone: '+48 12 000 00 00' });
    assert.deepEqual(s.legalRegistrationId, { value: '0000123456', schemeId: 'PL:KRS' });
    assert.deepEqual(s.identifiers, [
      { value: '5900000000009', schemeId: '0088' },
      { value: '123456785', schemeId: 'PL:REGON' },
    ]);
  });

  test('buyer: NIP only, no VAT id guessed', () => {
    assert.equal(inv.buyer.name, 'Biuro Wzorcowe S.A.');
    assert.deepEqual(inv.buyer.nationalTaxIds, [{ value: '5252525252', schemeId: 'PL:NIP' }]);
    assert.equal(inv.buyer.vatId, undefined);
    assert.deepEqual(inv.buyer.identifiers, [{ value: 'K-0815', schemeId: 'PL:NrKlienta' }]);
  });

  test('Podmiot3 with Rola', () => {
    assert.deepEqual(
      inv.additionalParties.map((p) => [p.role, p.sourceRole, p.party.name]),
      [
        ['recipient-unit', 'PL:Rola:2', 'Oddział Wzorcowy Gdańsk'],
        ['factor', 'PL:Rola:1', 'Faktoring Przykład S.A.'],
      ],
    );
  });

  test('VAT breakdown per P_13_x with category, rate and national code', () => {
    assert.deepEqual(inv.vatBreakdown, [
      { taxableAmount: '1000.00', taxAmount: '230.00', categoryCode: 'S', rate: '23', nationalCode: 'PL:P_13_1' },
      { taxableAmount: '200.00', taxAmount: '16.00', categoryCode: 'S', rate: '8', nationalCode: 'PL:P_13_2' },
      { taxableAmount: '200.00', taxAmount: '10.00', categoryCode: 'S', rate: '5', nationalCode: 'PL:P_13_3' },
      { taxableAmount: '50.00', taxAmount: '0.00', categoryCode: 'Z', rate: '0', nationalCode: 'PL:P_12:0 KR' },
      {
        taxableAmount: '150.00',
        taxAmount: '0.00',
        categoryCode: 'E',
        exemptionReason: 'art. 43 ust. 1 pkt 37 ustawy',
        nationalCode: 'PL:P_12:zw',
      },
    ]);
  });

  test('totals', () => {
    assert.deepEqual(inv.totals, {
      lineNetTotal: '1600.00',
      taxExclusive: '1600.00',
      vatTotal: '256.00',
      taxInclusive: '1856.00',
      payable: '1856.00',
    });
    assert.ok(inv.source.derived.some((d) => d.field === '/totals/taxExclusive'));
  });

  test('lines: P_7, P_8A as unitText, P_8B, P_9A, P_11, P_12', () => {
    const [l1, l2, l3, l4, l5] = inv.lines;
    assert.equal(l1.id, '1');
    assert.equal(l1.item.name, 'Projekt wnętrza');
    assert.equal(l1.item.sellerId, 'USL-001');
    assert.equal(l1.unitText, 'godz.');
    assert.equal(l1.unitCode, 'HUR');
    assert.equal(l1.quantity, '10');
    assert.equal(l1.price?.net, '100.00');
    assert.equal(l1.netAmount, '1000.00');
    assert.deepEqual(l1.vat, { categoryCode: 'S', rate: '23', nationalCode: 'PL:P_12:23' });
    assert.deepEqual(l1.national, { GTU: 'GTU_12' });
    assert.equal(l1.correctionState, undefined);
    assert.deepEqual(l2.item.standardId, { value: '5900000000016', schemeId: '0160' });
    assert.equal(l2.unitCode, 'H87');
    assert.deepEqual(l3.item.classifications, [{ code: '4407', listId: 'PL:CN' }]);
    assert.equal(l3.unitCode, 'SET');
    assert.deepEqual(l4.vat, { categoryCode: 'Z', rate: '0', nationalCode: 'PL:P_12:0 KR' });
    assert.deepEqual(l5.vat, { categoryCode: 'E', nationalCode: 'PL:P_12:zw', exemptionReason: 'art. 43 ust. 1 pkt 37 ustawy' });
    assert.equal(l5.unitText, 'usł.');
  });

  test('payment: bank transfer, two instalments, factor account', () => {
    assert.deepEqual(inv.payments, [
      {
        meansCode: '30',
        meansText: 'Przelew',
        nationalMeansCode: '6',
        creditTransfers: [{ accountId: '61109010140000071219812874', accountName: 'Rachunek główny', serviceProviderId: 'WBKPPLPP' }],
      },
      { meansCode: '30', meansText: 'Rachunek faktora', creditTransfers: [{ accountId: '27114020040000300201355387' }] },
    ]);
    assert.deepEqual(inv.paymentSchedule, [{ dueDate: '2026-10-20' }, { dueDate: '2026-11-04' }]);
    assert.equal(inv.dueDate, undefined);
  });

  test('extensions.pl and unmapped leftovers', () => {
    assert.deepEqual(inv.extensions.pl, { invoiceKind: 'VAT', schemaVariant: 'FA (3)', exemptionBasis: 'art. 43 ust. 1 pkt 37 ustawy' });
    assert.equal(inv.source.unmapped['/Faktura/Fa/P_1M'], 'Kraków');
    assert.equal(inv.source.unmapped['/Faktura/Fa/WarunkiTransakcji/Umowy[1]/DataUmowy'], '2026-09-01');
  });

  test('arithmetic is consistent: no warnings', () => {
    assert.deepEqual(warningCodes(inv), []);
  });
});

describe('KSeF FA(3): KOR with before/after rows', async () => {
  const inv = await parseOne('ksef-fa3-kor-before-after.xml');

  test('a reduction is a creditNote, with the direction recorded as derived', () => {
    assert.equal(inv.kind, 'creditNote');
    assert.equal(inv.typeCode, '381');
    assert.equal(effectiveSign(inv), -1);
    assert.equal(inv.nationalType?.code, 'KOR');
    assert.ok(inv.source.derived.some((d) => d.field === '/kind'));
  });

  test('totals are positive magnitudes of the difference', () => {
    assert.deepEqual(inv.totals, {
      lineNetTotal: '300.00',
      taxExclusive: '300.00',
      vatTotal: '54.00',
      taxInclusive: '354.00',
      payable: '354.00',
    });
    assert.deepEqual(
      inv.vatBreakdown.map((v) => [v.rate, v.taxableAmount, v.taxAmount]),
      [
        ['23', '200.00', '46.00'],
        ['8', '100.00', '8.00'],
      ],
    );
  });

  test('StanPrzed rows are "before", the rest "after"; lines are kept as written', () => {
    assert.deepEqual(
      inv.lines.map((l) => [l.id, l.correctionState, l.quantity, l.netAmount]),
      [
        ['1', 'before', '10', '1000.00'],
        ['1', 'after', '8', '800.00'],
        ['2', 'before', '10', '200.00'],
        ['2', 'after', '5', '100.00'],
      ],
    );
  });

  test('corrected invoice and reason', () => {
    assert.deepEqual(inv.precedingInvoices, [
      { id: 'FV/2026/10/0042', issueDate: '2026-10-05', clearanceId: '1234563218-20261005-0100ABCDEF12-3C' },
    ]);
    assert.deepEqual(inv.correction, { reason: 'Zwrot części towaru', method: '2' });
    assert.deepEqual(inv.clearance, []);
    assert.deepEqual(warningCodes(inv), []);
  });
});

describe('KSeF FA(3): KOR with deltas that increases the amount', async () => {
  const inv = await parseOne('ksef-fa3-kor-delta-increase.xml');

  test('an increase stays an invoice (384) with delta lines', () => {
    assert.equal(inv.kind, 'invoice');
    assert.equal(inv.typeCode, '384');
    assert.equal(effectiveSign(inv), 1);
    assert.equal(inv.lines[0].correctionState, 'delta');
    assert.equal(inv.lines[0].netAmount, '100.00');
    assert.equal(inv.totals.taxInclusive, '123.00');
  });

  test('corrected invoice issued outside KSeF has no clearance id', () => {
    assert.deepEqual(inv.precedingInvoices, [{ id: 'FV/2026/09/0100', issueDate: '2026-09-15' }]);
    assert.deepEqual(inv.correction, { reason: 'Podwyżka ceny usługi', method: '1' });
  });

  test('foreign currency: P_14_xW is VAT in PLN', () => {
    assert.equal(inv.currency, 'EUR');
    assert.equal(inv.taxCurrency, 'PLN');
    assert.deepEqual(inv.exchangeRate, { rate: '4.3200' });
    assert.equal(inv.vatBreakdown[0].taxAmountInTaxCurrency, '99.36');
    assert.equal(inv.totals.vatTotalInTaxCurrency, '99.36');
  });

  test('Rozliczenie: DoZaplaty wins over P_15 and the difference is flagged, not hidden', () => {
    assert.equal(inv.totals.payable, '125.00');
    assert.ok(warningCodes(inv).includes('PL-SETTLEMENT'));
    assert.equal(inv.source.unmapped['/Faktura/Fa/Rozliczenie/Obciazenia[1]/Kwota'], '5.00');
    assert.equal(inv.source.unmapped['/Faktura/Fa/Rozliczenie/Odliczenia[1]/Powod'], 'Rabat');
  });

  test('payment term given as a description goes to the schedule', () => {
    assert.deepEqual(inv.paymentSchedule, [{ description: '14 dni od daty otrzymania faktury' }]);
    assert.equal(inv.dueDate, undefined);
  });
});

describe('KSeF FA(3): ZAL advance invoice', async () => {
  const inv = await parseOne('ksef-fa3-zal.xml');

  test('prepayment invoice 386; P_6 is the tax point (date of payment)', () => {
    assert.equal(inv.kind, 'invoice');
    assert.equal(inv.typeCode, '386');
    assert.equal(inv.nationalType?.code, 'ZAL');
    assert.equal(inv.taxPointDate, '2026-10-10');
    assert.equal(inv.delivery, undefined);
  });

  test('totals are the advance, paid flag in extensions', () => {
    assert.deepEqual(inv.totals, {
      lineNetTotal: '500.00',
      taxExclusive: '500.00',
      vatTotal: '115.00',
      taxInclusive: '615.00',
      payable: '615.00',
    });
    assert.deepEqual(inv.extensions.pl, { invoiceKind: 'ZAL', schemaVariant: 'FA (3)', paid: true, paidDate: '2026-10-10' });
  });

  test('the order the advance relates to is kept in unmapped', () => {
    assert.equal(inv.source.unmapped['/Faktura/Fa/Zamowienie/WartoscZamowienia'], '2050.00');
    assert.equal(inv.source.unmapped['/Faktura/Fa/Zamowienie/ZamowienieWiersz/P_7Z'], 'Zestaw mebli biurowych');
    assert.deepEqual(warningCodes(inv), []);
  });
});

describe('KSeF FA_RR', async () => {
  const inv = await parseOne('ksef-fa-rr.xml');

  test('Podmiot1 is the supplier (seller), Podmiot2 the buyer who issues the invoice', () => {
    assert.equal(inv.seller.name, 'Gospodarstwo Rolne Przykład');
    assert.deepEqual(inv.seller.nationalTaxIds, [{ value: '5170000007', schemeId: 'PL:NIP' }]);
    assert.equal(inv.seller.vatId, undefined);
    assert.equal(inv.buyer.name, 'Skup Zbóż Wzorcowy sp. z o.o.');
    assert.equal(inv.id, 'RR/2026/10/0007');
    assert.equal(inv.issueDate, '2026-10-06');
    assert.equal(inv.delivery?.actualDate, '2026-10-05');
    assert.equal(inv.nationalType?.code, 'VAT_RR');
    assert.equal(inv.source.formatVersion, 'FA_RR (1)');
  });

  test('flat-rate refund as VAT, flagged', () => {
    assert.deepEqual(inv.totals, {
      lineNetTotal: '11000.00',
      taxExclusive: '11000.00',
      vatTotal: '770.00',
      taxInclusive: '11770.00',
      payable: '11770.00',
    });
    assert.deepEqual(inv.vatBreakdown, [
      { taxableAmount: '11000.00', taxAmount: '770.00', categoryCode: 'S', rate: '7', nationalCode: 'PL:RR:7' },
    ]);
    assert.deepEqual(warningCodes(inv), ['PL-RR-REFUND']);
  });

  test('lines', () => {
    const l = inv.lines[0];
    assert.equal(l.item.name, 'Pszenica konsumpcyjna');
    assert.equal(l.item.description, 'klasa A');
    assert.equal(l.unitCode, 'TNE');
    assert.equal(l.quantity, '10');
    assert.equal(l.price?.net, '800.00');
    assert.equal(l.netAmount, '8000.00');
    assert.deepEqual(l.national, { refundAmount: '560.00', valueWithRefund: '8560.00' });
    assert.deepEqual(inv.payments[0].creditTransfers, [{ accountId: '61109010140000071219812874' }]);
  });
});

describe('KSeF: variants', () => {
  test('P_17 = 1 is self-billing: typeCode 389 and extensions.pl.selfBilling', async () => {
    const xml = text('ksef-fa3-vat-multirate.xml').replace('<P_17>2</P_17>', '<P_17>1</P_17>');
    const inv = await parseOne(utf8(xml), 'selfbilled.xml');
    assert.equal(inv.selfBilled, true);
    assert.equal(inv.typeCode, '389');
    assert.equal(inv.extensions.pl?.selfBilling, true);
  });

  test('P_16, P_18, P_18A flags', async () => {
    const xml = text('ksef-fa3-vat-multirate.xml')
      .replace('<P_16>2</P_16>', '<P_16>1</P_16>')
      .replace('<P_18>2</P_18>', '<P_18>1</P_18>')
      .replace('<P_18A>2</P_18A>', '<P_18A>1</P_18A>');
    const inv = await parseOne(utf8(xml), 'flags.xml');
    assert.equal(inv.extensions.pl?.cashAccounting, true);
    assert.equal(inv.extensions.pl?.reverseCharge, true);
    assert.equal(inv.extensions.pl?.splitPayment, true);
  });

  test('EU buyer identified by KodUE + NrVatUE gets that VAT id and no PL:NIP', async () => {
    const xml = text('ksef-fa3-vat-multirate.xml').replace('<NIP>5252525252</NIP>', '<KodUE>DE</KodUE><NrVatUE>123456789</NrVatUE>');
    const inv = await parseOne(utf8(xml), 'eu-buyer.xml');
    assert.equal(inv.buyer.vatId, 'DE123456789');
    assert.deepEqual(inv.buyer.nationalTaxIds, []);
  });

  test('Podmiot1 with a PrefiksPodatnika keeps that prefix', async () => {
    const xml = text('ksef-fa3-vat-multirate.xml').replace(
      '<Podmiot1><DaneIdentyfikacyjne>',
      '<Podmiot1><PrefiksPodatnika>PL</PrefiksPodatnika><DaneIdentyfikacyjne>',
    );
    const inv = await parseOne(utf8(xml), 'prefix.xml');
    assert.equal(inv.seller.vatId, 'PL1234563218');
    assert.ok(!inv.source.derived.some((d) => d.field === '/seller/vatId'));
  });

  test('every P_12 code maps to a VAT category and keeps its national code', async () => {
    const codes: Record<string, [string, string | undefined]> = {
      '23': ['S', '23'],
      '22': ['S', '22'],
      '8': ['S', '8'],
      '7': ['S', '7'],
      '5': ['S', '5'],
      '4': ['S', '4'],
      '3': ['S', '3'],
      '0 KR': ['Z', '0'],
      '0 WDT': ['K', '0'],
      '0 EX': ['G', '0'],
      zw: ['E', undefined],
      oo: ['AE', undefined],
      'np I': ['O', undefined],
      'np II': ['O', undefined],
    };
    for (const [code, [category, rate]] of Object.entries(codes)) {
      const xml = text('ksef-fa3.xml').replace('<P_12>23</P_12>', `<P_12>${code}</P_12>`);
      const inv = await parseOne(utf8(xml), 'p12.xml');
      assert.deepEqual(inv.lines[0].vat, { categoryCode: category, ...(rate ? { rate } : {}), nationalCode: `PL:P_12:${code}` }, code);
    }
  });

  test('an unknown P_12 code is a warning, not a guess', async () => {
    const xml = text('ksef-fa3.xml').replace('<P_12>23</P_12>', '<P_12>99x</P_12>');
    const inv = await parseOne(utf8(xml), 'p12-unknown.xml');
    assert.equal(inv.lines[0].vat, undefined);
    assert.ok(warningCodes(inv).includes('PL-P12-UNKNOWN'));
  });

  test('a gross-only line (P_11A, P_11Vat) derives the net amount and says so', async () => {
    const xml = text('ksef-fa3.xml').replace('<P_11>100.00</P_11>', '<P_11A>123.00</P_11A><P_11Vat>23.00</P_11Vat>');
    const inv = await parseOne(utf8(xml), 'gross.xml');
    assert.equal(inv.lines[0].netAmount, '100.00');
    assert.ok(inv.source.derived.some((d) => d.field === '/lines/1/netAmount'));
  });

  test('a malformed amount is an error naming the element', async () => {
    const xml = text('ksef-fa3-vat-multirate.xml').replace('<P_15>1856.00</P_15>', '<P_15>1.856,00</P_15>');
    const r = await convert(utf8(xml));
    const o = r.outcomes[0];
    assert.equal(o.status, 'error');
    if (o.status === 'error') assert.match(o.error, /P_15.*Not a decimal/);
  });

  test('the original minimal FA(3) sample still parses', async () => {
    const inv = await parseOne('ksef-fa3.xml');
    assert.equal(inv.id, 'FV/1/10/2026');
    assert.equal(inv.totals.payable, '123.00');
    assert.deepEqual(warningCodes(inv), []);
  });
});
