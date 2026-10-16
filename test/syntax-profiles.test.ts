import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { convert } from '../src/index.js';
import { fixture, parseOne, utf8, warningCodes } from './helpers.js';

/**
 * Header-plus-totals parse tests for the EN 16931 profiles and legacy variants that have no
 * dedicated parser. Each fixture is a small synthetic invoice: one line of 10 x 100.00 at one VAT rate.
 */
interface Case {
  file: string;
  format: string;
  id: string;
  typeCode: string;
  currency: string;
  specificationId: string;
  vat: string;
  payable: string;
  kind?: 'invoice' | 'creditNote';
  selfBilled?: boolean;
}

const CASES: Case[] = [
  {
    file: 'nlcius-ubl.xml',
    format: 'nlcius-ubl',
    id: 'NL-2026-001',
    typeCode: '380',
    currency: 'EUR',
    specificationId: 'urn:cen.eu:en16931:2017#compliant#urn:fdc:nen.nl:nlcius:v1.0',
    vat: '210.00',
    payable: '1210.00',
  },
  {
    file: 'cius-pt.xml',
    format: 'cius-pt',
    id: 'FT 2026/101',
    typeCode: '380',
    currency: 'EUR',
    specificationId: 'urn:cen.eu:en16931:2017#compliant#urn:feap.gov.pt:CIUS-PT:2.1.2',
    vat: '230.00',
    payable: '1230.00',
  },
  {
    file: 'fr-ctc-ubl.xml',
    format: 'fr-ctc-ubl',
    id: 'FA-2026-0042',
    typeCode: '380',
    currency: 'EUR',
    specificationId: 'urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr',
    vat: '200.00',
    payable: '1200.00',
  },
  {
    file: 'oioubl-3.xml',
    format: 'oioubl-3',
    id: 'DK-2026-7',
    typeCode: '380',
    currency: 'DKK',
    specificationId: 'urn:fdc:oioubl.dk:trns:billing:invoice:3.0',
    vat: '250.00',
    payable: '1250.00',
  },
  {
    file: 'pl-pef.xml',
    format: 'pl-pef',
    id: 'FV/2026/10/15',
    typeCode: '380',
    currency: 'PLN',
    specificationId:
      'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0#extended#urn:fdc:www.efaktura.gov.pl:ver2.0',
    vat: '230.00',
    payable: '1230.00',
  },
  {
    file: 'peppol-bis3-selfbilling.xml',
    format: 'peppol-bis3-selfbilling',
    id: 'SB-2026-12',
    typeCode: '389',
    currency: 'EUR',
    specificationId: 'urn:cen.eu:en16931:2017#conformant#urn:fdc:peppol.eu:2017:poacc:selfbilling:3.0',
    vat: '210.00',
    payable: '1210.00',
    selfBilled: true,
  },
  {
    file: 'ubl-be.xml',
    format: 'ubl-be',
    id: 'BE-2026-310',
    typeCode: '380',
    currency: 'EUR',
    specificationId: 'urn:cen.eu:en16931:2017#compliant#urn:UBL.BE:1.0.0',
    vat: '210.00',
    payable: '1210.00',
  },
  {
    file: 'peppol-bis2.xml',
    format: 'peppol-bis2',
    id: 'NO-2019-55',
    typeCode: '380',
    currency: 'NOK',
    specificationId: 'urn:www.cenbii.eu:transaction:biitrns010:ver2.0:extended:urn:www.peppol.eu:bis:peppol4a:ver2.0',
    vat: '250.00',
    payable: '1250.00',
  },
  {
    file: 'oioubl-2.xml',
    format: 'oioubl-2',
    id: 'DK-2018-31',
    typeCode: '380',
    currency: 'DKK',
    specificationId: 'OIOUBL-2.02',
    vat: '250.00',
    payable: '1250.00',
  },
  {
    file: 'ubl-unknown.xml',
    format: 'ubl-unknown',
    id: 'UNK-2026-1',
    typeCode: '380',
    currency: 'EUR',
    specificationId: 'urn:example:custom-invoice-profile:1.0',
    vat: '190.00',
    payable: '1190.00',
  },
  {
    file: 'nlcius-cii.xml',
    format: 'nlcius-cii',
    id: 'NL-2026-002',
    typeCode: '380',
    currency: 'EUR',
    specificationId: 'urn:cen.eu:en16931:2017#compliant#urn:fdc:nen.nl:nlcius:v1.0',
    vat: '210.00',
    payable: '1210.00',
  },
  {
    file: 'fr-ctc-cii.xml',
    format: 'fr-ctc-cii',
    id: 'FA-2026-0043',
    typeCode: '380',
    currency: 'EUR',
    specificationId: 'urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr',
    vat: '200.00',
    payable: '1200.00',
  },
  {
    file: 'en16931-cii.xml',
    format: 'en16931-cii',
    id: 'EN-2026-9',
    typeCode: '380',
    currency: 'EUR',
    specificationId: 'urn:cen.eu:en16931:2017',
    vat: '190.00',
    payable: '1190.00',
  },
  {
    file: 'cii-unknown.xml',
    format: 'cii-unknown',
    id: 'UNK-2026-2',
    typeCode: '380',
    currency: 'EUR',
    specificationId: 'urn:example:custom-cii-profile:1.0',
    vat: '190.00',
    payable: '1190.00',
  },
];

describe('profiles without a dedicated parser: header and totals', () => {
  for (const c of CASES) {
    test(`${c.format} (${c.file})`, async () => {
      const inv = await parseOne(c.file);
      assert.equal(inv.source.format, c.format);
      assert.equal(inv.kind, c.kind ?? 'invoice');
      assert.equal(inv.id, c.id);
      assert.equal(inv.typeCode, c.typeCode);
      assert.equal(inv.issueDate, '2026-10-15');
      assert.equal(inv.currency, c.currency);
      assert.equal(inv.specificationId, c.specificationId);
      assert.equal(inv.selfBilled, c.selfBilled ?? false);
      assert.equal(inv.seller.name, 'Voorbeeld Diensten B.V.');
      assert.equal(inv.buyer.name, 'Klant Handel B.V.');
      assert.equal(inv.lines.length, 1);
      assert.equal(inv.totals.lineNetTotal, '1000.00');
      assert.equal(inv.totals.taxExclusive, '1000.00');
      assert.equal(inv.totals.vatTotal, c.vat);
      assert.equal(inv.totals.taxInclusive, c.payable);
      assert.equal(inv.totals.payable, c.payable);
    });
  }
});

describe('eSLOG 1.6', () => {
  test('is detected, but only eSLOG 2.0 is mapped', async () => {
    const r = await convert(fixture('eslog-1.xml'), 'eslog-1.xml');
    assert.equal(r.outcomes.length, 1);
    const o = r.outcomes[0];
    assert.equal(o.detection.kind, 'invoice');
    if (o.detection.kind === 'invoice') {
      assert.equal(o.detection.format.id, 'eslog-1');
      assert.equal(o.detection.details.version, '1.6');
    }
    assert.equal(o.status, 'unsupported');
  });
});

describe('UBL outside EN 16931 (ubl-unknown): missing totals are derived', () => {
  const src = new TextDecoder().decode(fixture('ubl-unknown.xml'));
  const without = (...tags: string[]) => tags.reduce((x, t) => x.replace(new RegExp(`<cbc:${t} [^>]*>[^<]*</cbc:${t}>`), ''), src);

  test('LegalMonetaryTotal with only PayableAmount: BT-106, BT-109 and BT-112 follow from the lines and VAT', async () => {
    const inv = await parseOne(utf8(without('LineExtensionAmount', 'TaxExclusiveAmount', 'TaxInclusiveAmount')), 'x.xml');
    assert.equal(inv.totals.lineNetTotal, '1000.00');
    assert.equal(inv.totals.taxExclusive, '1000.00');
    assert.equal(inv.totals.taxInclusive, '1190.00');
    assert.equal(inv.totals.payable, '1190.00');
    assert.deepEqual(
      inv.source.derived.map((d) => d.field).filter((f) => f.startsWith('/totals/')),
      ['/totals/lineNetTotal', '/totals/taxExclusive', '/totals/taxInclusive'],
    );
    assert.equal(warningCodes(inv).filter((c) => c === 'UBL-TOTAL-DERIVED').length, 3);
  });

  test('document-level allowances without AllowanceTotalAmount are summed into the derived totals', async () => {
    const ac =
      '<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:AllowanceChargeReason>Rabatt</cbc:AllowanceChargeReason><cbc:Amount currencyID="EUR">100.00</cbc:Amount></cac:AllowanceCharge>';
    const xml = without('LineExtensionAmount', 'TaxExclusiveAmount', 'TaxInclusiveAmount').replace('<cac:TaxTotal>', `${ac}<cac:TaxTotal>`);
    const inv = await parseOne(utf8(xml), 'x.xml');
    assert.equal(inv.totals.allowanceTotal, '100.00');
    assert.equal(inv.totals.taxExclusive, '900.00');
    assert.ok(inv.source.derived.some((d) => d.field === '/totals/allowanceTotal'));
  });

  test('without DocumentCurrencyCode the currency comes from PayableAmount', async () => {
    const inv = await parseOne(utf8(src.replace('<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>', '')), 'x.xml');
    assert.equal(inv.currency, 'EUR');
    assert.ok(inv.source.derived.some((d) => d.field === '/currency'));
  });

  test('Peppol BIS 2 makes the totals mandatory: a missing one stays an error', async () => {
    const bis2 = new TextDecoder().decode(fixture('peppol-bis2.xml'));
    const r = await convert(utf8(bis2.replace(/<cbc:TaxExclusiveAmount [^>]*>[^<]*<\/cbc:TaxExclusiveAmount>/, '')), 'x.xml');
    assert.equal(r.outcomes[0].status, 'error');
  });
});
