import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { convert } from '../src/index.js';
import { fixture, warningCodes } from './helpers.js';

/**
 * Known answers for the public samples under test/fixtures/real/ (origin and licence of each file:
 * test/fixtures/README.md). Every value was read off the source XML by hand; amounts are compared as the
 * decimal strings the parser returns, which keep the source's own spelling ("336.9", "5096.0").
 * `buyerName`, `sellerVatId` and `vatTotal` are left out where the sample has none.
 */
interface Known {
  format: string;
  id: string;
  issueDate: string;
  currency: string;
  payable: string;
  vatTotal?: string;
  lines: number;
  sellerVatId?: string;
  buyerName?: string;
}

const CASES: { file: string; invoices: Known[]; warnings?: string[] }[] = [
  {
    file: 'fatturapa-ade-FPR12-1.xml',
    invoices: [
      {
        format: 'fatturapa',
        id: '123',
        issueDate: '2014-12-18',
        currency: 'EUR',
        payable: '6.10',
        vatTotal: '1.10',
        lines: 1,
        sellerVatId: 'IT01234567890',
        buyerName: 'DITTA BETA',
      },
    ],
  },
  {
    file: 'fatturapa-ade-FPA12-1.xml',
    invoices: [
      {
        format: 'fatturapa',
        id: '123',
        issueDate: '2017-01-18',
        currency: 'EUR',
        payable: '6.10',
        vatTotal: '1.10',
        lines: 1,
        sellerVatId: 'IT01234567890',
        buyerName: 'AMMINISTRAZIONE BETA',
      },
    ],
  },
  {
    file: 'fatturapa-ade-FPR12-3-lot.xml',
    invoices: [
      {
        format: 'fatturapa',
        id: '123',
        issueDate: '2014-12-18',
        currency: 'EUR',
        payable: '32.95',
        vatTotal: '5.95',
        lines: 2,
        sellerVatId: 'IT01234567890',
        buyerName: 'BETA GAMMA',
      },
      {
        format: 'fatturapa',
        id: '456',
        issueDate: '2014-12-20',
        currency: 'EUR',
        payable: '2440.00',
        vatTotal: '440.00',
        lines: 1,
        sellerVatId: 'IT01234567890',
        buyerName: 'BETA GAMMA',
      },
    ],
  },
  {
    file: 'ksef-fa3-pdf-generator.xml',
    invoices: [
      {
        format: 'ksef',
        id: 'FA/YUCFO-4342344706/03/2026',
        issueDate: '2025-10-31',
        currency: 'PLN',
        payable: '33569.50',
        vatTotal: '6277.22',
        lines: 13,
        sellerVatId: 'PL5265877635',
        buyerName: 'Strzelczyk LLC',
      },
    ],
  },
  {
    file: 'isdoc-test001.isdoc',
    invoices: [
      {
        format: 'isdoc',
        id: 'FV-1/2021',
        issueDate: '2021-04-01',
        currency: 'CZK',
        payable: '6655',
        vatTotal: '1155',
        lines: 13,
        sellerVatId: 'CZ12345678',
        buyerName: 'Odběratel 1',
      },
    ],
  },
  {
    // The specification's own example, written to show every element: it states the amounts in the foreign
    // currency (EUR) with the local ones beside them, and is not internally consistent.
    file: 'isdoc-priklad.isdoc',
    invoices: [
      {
        format: 'isdoc',
        id: 'FV-111999/2011',
        issueDate: '2013-02-28',
        currency: 'EUR',
        payable: '0',
        vatTotal: '0.1',
        lines: 3,
        sellerVatId: 'CZ25097563',
        buyerName: 'Ministerstvo financí ČR',
      },
    ],
  },
  {
    file: 'ebinterface-4.1-sample.xml',
    invoices: [
      {
        format: 'ebinterface',
        id: 'RE1001010',
        issueDate: '2015-12-27',
        currency: 'EUR',
        payable: '210',
        vatTotal: '10.00',
        lines: 2,
        sellerVatId: 'UID412563',
        buyerName: 'Rechnungsempfänger GmbH',
      },
    ],
  },
  {
    file: 'ebinterface-4.3-sample.xml',
    invoices: [
      {
        format: 'ebinterface',
        id: 'RNR 2016/2',
        issueDate: '2016-02-16',
        currency: 'EUR',
        payable: '44329.12',
        vatTotal: '330.00',
        lines: 2,
        sellerVatId: 'UID12384938',
        buyerName: 'VGB GmbH & Co KG',
      },
    ],
  },
  {
    // ebInterface 3.0: VAT in Tax/VAT/Item, lines with TaxRate and a ReductionRate already applied.
    file: 'ebinterface-3.0-invoice.xml',
    invoices: [
      {
        format: 'ebinterface',
        id: 'AO/4021XXX',
        issueDate: '2006-08-24',
        currency: 'EUR',
        payable: '6981.88',
        vatTotal: '1163.65',
        lines: 4,
        sellerVatId: 'ATU15184903',
        buyerName: 'Systeme GmbH',
      },
    ],
  },
  {
    file: 'ebinterface-4.0-invoice.xml',
    invoices: [
      {
        format: 'ebinterface',
        id: '1100',
        issueDate: '2012-05-25',
        currency: 'EUR',
        payable: '300.00',
        vatTotal: '50.00',
        lines: 1,
        sellerVatId: 'ATU62698637',
        buyerName: 'Fa. Einkäufer GmbH',
      },
    ],
  },
  {
    // An unstamped CFDI draft without Serie or Folio: identified by a placeholder, not rejected.
    file: 'cfdi-40-unstamped-min.xml',
    warnings: ['MX-NO-ID', 'MX-NO-STAMP'],
    invoices: [
      {
        format: 'mx-cfdi',
        id: 'UNSTAMPED:AAA010101AAA:2021-12-07T23:59:59:d022c2ca04bb',
        issueDate: '2021-12-07',
        currency: 'MXN',
        payable: '1500',
        lines: 1,
        buyerName: 'Juanito Bananas De la Sierra',
      },
    ],
  },
  {
    // ZUGFeRD 1 BASIC has no DuePayableAmount: the amount due is the grand total.
    file: 'zugferd1-basic.xml',
    warnings: ['TEST_DOCUMENT'],
    invoices: [
      {
        format: 'zugferd-1',
        id: '471102',
        issueDate: '2013-03-05',
        currency: 'EUR',
        payable: '235.62',
        vatTotal: '37.62',
        lines: 1,
        sellerVatId: 'DE123456789',
        buyerName: 'Kunden AG Mitte',
      },
    ],
  },
  {
    // Plain UBL 2.1: no DocumentCurrencyCode and only PayableAmount in LegalMonetaryTotal.
    file: 'ubl-2.1-trivial.xml',
    warnings: ['UBL-TOTAL-DERIVED'],
    invoices: [
      {
        format: 'ubl-unknown',
        id: '123',
        issueDate: '2011-09-22',
        currency: 'CAD',
        payable: '100.00',
        lines: 1,
      },
    ],
  },
  {
    file: 'oioubl-2.01-invoice.xml',
    invoices: [
      {
        format: 'oioubl-2',
        id: 'A00095678',
        issueDate: '2005-11-20',
        currency: 'DKK',
        payable: '6312.50',
        vatTotal: '1262.50',
        lines: 2,
        sellerVatId: 'DK16356700',
      },
    ],
  },
  {
    file: 'oioubl-2.01-creditnote.xml',
    invoices: [
      {
        format: 'oioubl-2',
        id: 'A00095679',
        issueDate: '2005-11-20',
        currency: 'DKK',
        payable: '6312.50',
        vatTotal: '1262.50',
        lines: 2,
        sellerVatId: 'DK16356700',
      },
    ],
  },
  {
    file: 'mydata-requested-invoice.xml',
    invoices: [
      {
        format: 'gr-mydata',
        id: '0-8',
        issueDate: '2024-02-16',
        currency: 'EUR',
        payable: '5096.0',
        vatTotal: '1176.0',
        lines: 1,
        sellerVatId: 'EL888888888',
      },
    ],
  },
  {
    // The second <invoice> of the response is a cancellation marker without a header.
    file: 'mydata-requested-two-invoices.xml',
    warnings: ['GR-CANCELLED-MARKER'],
    invoices: [
      {
        format: 'gr-mydata',
        id: 'A-101',
        issueDate: '2020-04-08',
        currency: 'EUR',
        payable: '6000.00',
        vatTotal: '1200.00',
        lines: 1,
        sellerVatId: 'EL888888888',
        buyerName: 'Παπαδόπουλος ΑΕ',
      },
    ],
  },
  {
    file: 'zugferd1-comfort-einfach.pdf',
    invoices: [
      {
        format: 'zugferd-1',
        id: '471102',
        issueDate: '2013-03-05',
        currency: 'EUR',
        payable: '529.87',
        vatTotal: '56.87',
        lines: 2,
        sellerVatId: 'DE123456789',
        buyerName: 'Kunden AG Mitte',
      },
    ],
  },
  {
    file: 'xrechnung-ubl-01.01a.xml',
    invoices: [
      {
        format: 'xrechnung-ubl',
        id: '123456XX',
        issueDate: '2016-04-04',
        currency: 'EUR',
        payable: '336.9',
        vatTotal: '22.04',
        lines: 2,
        sellerVatId: 'DE 123456789',
        buyerName: '[Buyer name]',
      },
    ],
  },
  {
    file: 'xrechnung-cii-01.01a.xml',
    invoices: [
      {
        format: 'xrechnung-cii',
        id: '123456XX',
        issueDate: '2016-04-04',
        currency: 'EUR',
        payable: '336.9',
        vatTotal: '22.04',
        lines: 2,
        sellerVatId: 'DE 123456789',
        buyerName: '[Buyer name]',
      },
    ],
  },
  {
    file: 'en16931-ubl-UC1.xml',
    invoices: [
      {
        format: 'en16931-ubl',
        id: 'F202500003',
        issueDate: '2025-07-01',
        currency: 'EUR',
        payable: '12000.00',
        vatTotal: '2000.00',
        lines: 2,
        sellerVatId: 'FR88100000009',
        buyerName: 'LE CLIENT',
      },
    ],
  },
  {
    file: 'en16931-cii-UC13.xml',
    invoices: [
      {
        format: 'en16931-cii',
        id: 'AUTOF202600028',
        issueDate: '2026-06-02',
        currency: 'EUR',
        payable: '22359.33',
        vatTotal: '1178.41',
        lines: 1,
        sellerVatId: 'FR88100000009',
        buyerName: 'COOP1',
      },
    ],
  },
  {
    file: 'fr-ctc-ubl-UC12.xml',
    invoices: [
      {
        format: 'fr-ctc-ubl',
        id: 'F202600025',
        issueDate: '2025-01-05',
        currency: 'EUR',
        payable: '580.00',
        vatTotal: '80.00',
        lines: 4,
        sellerVatId: 'FR88100000009',
        buyerName: 'LE CLIENT',
      },
    ],
  },
  {
    file: 'fr-ctc-cii-UC10.xml',
    invoices: [
      {
        format: 'fr-ctc-cii',
        id: 'F202600004',
        issueDate: '2026-01-03',
        currency: 'EUR',
        payable: '6150.00',
        vatTotal: '650.00',
        lines: 6,
        sellerVatId: 'FR88100000009',
        buyerName: 'LE CLIENT',
      },
    ],
  },
];

describe('public samples: known answers', () => {
  for (const c of CASES) {
    test(c.file, async () => {
      const r = await convert(fixture(`real/${c.file}`), c.file);
      assert.equal(r.outcomes.length, 1, `documents in ${c.file}`);
      const o = r.outcomes[0];
      assert.equal(o.status, 'ok', JSON.stringify(o).slice(0, 300));
      if (o.status !== 'ok') return;
      assert.equal(o.invoices.length, c.invoices.length);
      o.invoices.forEach((inv, i) => {
        const k = c.invoices[i];
        assert.equal(o.detection.kind === 'invoice' && o.detection.format.id, k.format);
        assert.equal(inv.id, k.id);
        assert.equal(inv.issueDate, k.issueDate);
        assert.equal(inv.currency, k.currency);
        assert.equal(inv.totals.payable, k.payable);
        assert.equal(inv.totals.vatTotal, k.vatTotal);
        assert.equal(inv.lines.length, k.lines);
        assert.equal(inv.seller.vatId, k.sellerVatId);
        assert.equal(inv.buyer.name, k.buyerName);
      });
      for (const code of c.warnings ?? []) assert.ok(warningCodes(o.invoices[0]).includes(code), `warning ${code}`);
    });
  }
});

describe('myDATA RequestedDoc wrapper', () => {
  test('is detected as myDATA with the invoice type from the nested header', async () => {
    const { inspect } = await import('../src/index.js');
    const r = await inspect(fixture('real/mydata-requested-invoice.xml'));
    const d = r.documents[0].detection;
    assert.equal(d.kind === 'invoice' && d.format.id, 'gr-mydata');
    assert.equal(d.kind === 'invoice' && d.details.profile, '2.1');
  });
});

describe('OIOUBL 2: Danish VAT number', () => {
  test('PartyTaxScheme with TaxScheme 63 (Moms) is the VAT id, not a bare tax registration', async () => {
    const r = await convert(fixture('real/oioubl-2.01-invoice.xml'));
    const o = r.outcomes[0];
    assert.equal(o.status, 'ok');
    if (o.status !== 'ok') return;
    const s = o.invoices[0].seller;
    assert.equal(s.vatId, 'DK16356700');
    assert.equal(s.taxRegistrationId, undefined);
    // The buyer has a PartyName but no legal entity: the trading name stays, no legal name is invented.
    assert.equal(o.invoices[0].buyer.name, undefined);
    assert.equal(o.invoices[0].buyer.tradingName, 'Den Lille Skole');
  });
});
