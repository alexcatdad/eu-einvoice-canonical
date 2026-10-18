import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { detectXml } from '../src/index.js';
import { planFor } from '../src/validation/plan.js';
import { parseOne, ublHeader, warningCodes } from './helpers.js';

const detect = (xml: string) => {
  const d = detectXml(xml);
  assert.equal(d.kind, 'invoice');
  return d.kind === 'invoice' ? d : (undefined as never);
};

describe('PINT detection', () => {
  const RULES: [string, string, string | undefined, string | undefined][] = [
    ['urn:peppol:pint:billing-1', 'peppol-pint', undefined, undefined],
    ['urn:peppol:pint:billing-1@sg-1', 'pint-sg', 'sg-1', undefined],
    ['urn:peppol:pint:billing-1@aunz-1', 'pint-aunz', 'aunz-1', undefined],
    ['urn:peppol:pint:selfbilling-1@aunz-1', 'pint-aunz', 'aunz-1', 'self-billing'],
    ['urn:peppol:pint:billing-1@jp-1', 'pint-jp', 'jp-1', undefined],
    ['urn:peppol:pint:selfbilling-1@jp-1', 'pint-jp', 'jp-1', 'self-billing'],
    ['urn:peppol:pint:nontaxinvoice-1@jp-1', 'pint-jp', 'jp-1', 'non-tax-registered'],
    ['urn:peppol:pint:billing-1@my-1', 'pint-my', 'my-1', undefined],
    ['urn:peppol:pint:billing-1@ae-1', 'pint-ae', 'ae-1', undefined],
    ['urn:peppol:pint:billing-1@om-1', 'pint-om', 'om-1', undefined],
    ['urn:peppol:pint:billing-1@eu-1', 'pint-eu', 'eu-1', undefined],
    // A jurisdiction without its own rule stays in the generic PINT format, labelled with the jurisdiction.
    ['urn:peppol:pint:billing-1@xx-1', 'peppol-pint', undefined, 'xx-1'],
    ['urn:cen.eu:en16931:2017#conformant#urn:fdc:peppol.eu:2017:poacc:billing:international:aunz:3.0', 'peppol-pint', undefined, 'aunz'],
  ];
  for (const [cid, format, version, profile] of RULES) {
    test(`${format} <- ${cid}`, () => {
      const d = detect(ublHeader(cid));
      assert.equal(d.format.id, format);
      assert.equal(d.details.version, version);
      assert.equal(d.details.profile, profile);
    });
  }

  test('CreditNote root is detected as well', () =>
    assert.equal(detect(ublHeader('urn:peppol:pint:billing-1@sg-1', { root: 'CreditNote' })).format.id, 'pint-sg'));

  test('PINT gets its shared rules without claiming a jurisdiction profile', () => {
    const plan = planFor(detect(ublHeader('urn:peppol:pint:billing-1')));
    assert.deepEqual(plan, { schema: 'xsd-ubl-2.1', semantic: 'pint-shared-1.1.3' });
  });
});

describe('PINT base', () => {
  test('maps as plain UBL', async () => {
    const inv = await parseOne('pint-base.xml');
    assert.equal(inv.source.format, 'peppol-pint');
    assert.equal(inv.specificationId, 'urn:peppol:pint:billing-1');
    assert.equal(inv.seller.vatId, 'IE0000000TEST');
    assert.equal(inv.totals.payable, '1230.00');
    assert.deepEqual(inv.extensions, {});
  });

  for (const [file, format] of [
    ['pint-eu-invoice.xml', 'pint-eu'],
    ['pint-om-invoice.xml', 'pint-om'],
  ]) {
    test(`${format} parses as plain UBL`, async () => {
      const inv = await parseOne(file);
      assert.equal(inv.source.format, format);
      assert.equal(inv.totals.payable, '1230.00');
      assert.equal(inv.seller.vatId, 'IE0000000TEST');
    });
  }
});

describe('PINT Singapore', () => {
  test('GST is a VAT-like scheme and UEN comes from the endpoint', async () => {
    const inv = await parseOne('pint-sg-invoice.xml');
    assert.equal(inv.source.format, 'pint-sg');
    assert.equal(inv.currency, 'SGD');
    assert.equal(inv.seller.vatId, 'M2-0000001-A');
    assert.equal(inv.buyer.vatId, 'M9-0000002-B');
    assert.equal(inv.seller.taxRegistrationId, undefined);
    assert.deepEqual(inv.extensions.sg, {
      sellerUen: 'SGUEN201912345A',
      buyerUen: 'SGUEN200812345B',
      gstRegistrationNumber: 'M2-0000001-A',
      buyerGstRegistrationNumber: 'M9-0000002-B',
      gstCategories: ['SR', 'ZR'],
    });
  });

  test('category codes stay as sent', async () => {
    const inv = await parseOne('pint-sg-invoice.xml');
    assert.deepEqual(
      inv.vatBreakdown.map((v) => [v.categoryCode, v.rate, v.taxAmount]),
      [
        ['SR', '9', '45.00'],
        ['ZR', '0', '0.00'],
      ],
    );
    assert.equal(inv.totals.vatTotal, '45.00');
    assert.equal(inv.totals.payable, '745.00');
  });
});

describe('PINT Australia and New Zealand', () => {
  test('Australian invoice: ABN and GST', async () => {
    const inv = await parseOne('pint-aunz-au-invoice.xml');
    assert.equal(inv.source.format, 'pint-aunz');
    assert.equal(inv.selfBilled, false);
    assert.equal(inv.seller.vatId, '12345678901');
    assert.equal(inv.extensions.nz, undefined);
    assert.deepEqual(inv.extensions.au, {
      abn: '12345678901',
      gstRegistrationNumber: '12345678901',
      buyerAbn: '98765432109',
      buyerGstRegistrationNumber: '98765432109',
      gstCategories: ['S'],
    });
  });

  test('New Zealand self-billed credit note: NZBN and IRD number, stored under nz', async () => {
    const inv = await parseOne('pint-aunz-nz-selfbilling-creditnote.xml');
    assert.equal(inv.kind, 'creditNote');
    assert.equal(inv.typeCode, '381');
    assert.equal(inv.selfBilled, true);
    assert.equal(inv.source.formatVersion, 'aunz-1');
    assert.equal(inv.seller.vatId, '123-456-789');
    assert.equal(inv.extensions.au, undefined);
    assert.deepEqual(inv.extensions.nz, {
      nzbn: '9429000000000',
      gstRegistrationNumber: '123-456-789',
      buyerNzbn: '9429000000017',
      buyerGstRegistrationNumber: '987-654-321',
      gstCategories: ['S'],
    });
    assert.equal(inv.precedingInvoices[0].id, 'NZ-SB-INV-3');
  });
});

describe('PINT Japan', () => {
  test('qualified invoice issuer number', async () => {
    const inv = await parseOne('pint-jp-invoice.xml');
    assert.equal(inv.source.format, 'pint-jp');
    assert.equal(inv.currency, 'JPY');
    assert.equal(inv.seller.name, '株式会社サンプル商事');
    assert.equal(inv.seller.vatId, 'T1234567890123');
    assert.deepEqual(inv.extensions.jp, { qualifiedInvoiceIssuerNumber: 'T1234567890123', buyerRegistrationNumber: 'T3210987654321' });
    assert.deepEqual(
      inv.vatBreakdown.map((v) => [v.categoryCode, v.rate, v.taxAmount]),
      [
        ['S', '10', '1000'],
        ['S', '8', '320'],
      ],
    );
    assert.equal(inv.totals.payable, '15320');
  });

  test('a business not registered for the qualified invoice system has no issuer number', async () => {
    const inv = await parseOne('pint-jp-ntr-invoice.xml');
    assert.equal(inv.source.formatVersion, 'jp-1');
    assert.equal(inv.seller.vatId, undefined);
    assert.equal(inv.extensions.jp?.qualifiedInvoiceIssuerNumber, undefined);
    assert.equal(inv.extensions.jp?.buyerRegistrationNumber, 'T3210987654321');
    assert.deepEqual(warningCodes(inv), []);
  });
});

describe('PINT Malaysia', () => {
  test('TIN, SST, MSIC and the LHDN references', async () => {
    const inv = await parseOne('pint-my-invoice.xml');
    assert.equal(inv.source.format, 'pint-my');
    // The VAT scheme (SST) is the party's vatId; the TIN travels in the scheme named GST.
    assert.equal(inv.seller.vatId, 'W10-1808-32000001');
    assert.equal(inv.seller.taxRegistrationId, undefined);
    assert.deepEqual(inv.extensions.my, {
      tin: 'C20000000001',
      buyerTin: 'C20000000002',
      sstRegistrationNumber: 'W10-1808-32000001',
      buyerSstRegistrationNumber: 'B16-1808-32000002',
      businessRegistrationNumber: '201901000001',
      msicCode: '01111',
      msicDescription: 'Growing of maize',
      freeTradeAgreement: 'ASEAN-Australia-New Zealand FTA (AANZFTA)',
      customsForm2: 'E12345678912',
      customsImportForms: ['IMPORT-FORM-1'],
      originalDocumentUuid: '11111111-2222-3333-4444-555555555555',
      taxCategories: ['SE'],
    });
    assert.deepEqual(inv.invoicePeriod, { start: '2026-02-01', end: '2026-02-28' });
  });
});

describe('PINT United Arab Emirates', () => {
  test('transaction flags, UUID, TIN, registration authority and exchange rate', async () => {
    const inv = await parseOne('pint-ae-invoice.xml');
    assert.equal(inv.source.format, 'pint-ae');
    assert.equal(inv.currency, 'USD');
    assert.equal(inv.taxCurrency, 'AED');
    assert.equal(inv.totals.vatTotalInTaxCurrency, '183.50');
    assert.equal(inv.seller.vatId, '100000000000003');
    assert.deepEqual(inv.extensions.ae, {
      transactionTypeCode: '10000010',
      transactionTypes: ['freeTradeZone', 'ecommerce'],
      uuid: 'f12f329f-6430-4399-b661-7c5cd9c3a9e6',
      sellerTin: '1000000001',
      buyerTin: '1000000002',
      sellerRegistrationType: 'TL',
      sellerRegistrationAuthority: 'Dubai Economy',
      buyerRegistrationType: 'TL',
      buyerRegistrationAuthority: 'Abu Dhabi DED',
      taxExchangeRate: { sourceCurrency: 'USD', targetCurrency: 'AED', rate: '3.67' },
      billingFrequency: 'MTH',
    });
    assert.deepEqual(inv.lines[0].national, { commodityCode: 'G' });
  });
});
