import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  type CanonicalInvoice,
  type ConvertOutcome,
  convert,
  detectXml,
  FORMATS_BY_ID,
  type Line,
  type Party,
  type PaymentInstructions,
} from '../src/index.js';
import { CREDIT_TYPE_CODES, parseXml } from '../src/parsers/context.js';
import { validate } from '../src/validation/index.js';
import { toCii, toUbl, WriterError } from '../src/writers/index.js';
import { vatPointCodeForCii, vatPointCodeForUbl } from '../src/writers/shared.js';
import { utf8 } from './helpers.js';

const PEPPOL_SPEC = 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0';
const PEPPOL_PROCESS = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';
const EN_BASE_SPEC = 'urn:cen.eu:en16931:2017';

type Target = 'ubl' | 'cii';
const TARGETS: Target[] = ['ubl', 'cii'];
const write = (inv: CanonicalInvoice, target: Target) => (target === 'ubl' ? toUbl(inv) : toCii(inv));

// ---------------------------------------------------------------------------
// What does not survive the trip
//
// A written document is parsed again and the two canonical invoices are compared, apart from `source` (the
// provenance of a parse: hashes, warnings, the received XML's own details). The rules below are the only
// differences tolerated, each applied to BOTH sides before comparing. Every rule names a value the target syntax has
// no place for, or one that the syntax changes by convention.
// ---------------------------------------------------------------------------

interface Loss {
  id: string;
  /** Which writer loses it. */
  target: Target | 'both';
  reason: string;
  apply(inv: CanonicalInvoice): void;
}

const eachLine = (lines: Line[], f: (l: Line) => void) => {
  for (const l of lines) {
    f(l);
    if (l.subLines) eachLine(l.subLines, f);
  }
};

/** A payment with several credit transfers is written as one payment means per transfer. */
function splitTransfers(inv: CanonicalInvoice) {
  inv.payments = inv.payments.flatMap((p): PaymentInstructions[] =>
    p.creditTransfers.length > 1
      ? p.creditTransfers.map((t, i) => ({
          ...p,
          creditTransfers: [t],
          card: i === 0 ? p.card : undefined,
          directDebit: i === 0 ? p.directDebit : undefined,
        }))
      : [p],
  );
}

const parties = (inv: CanonicalInvoice): Party[] => [inv.seller, inv.buyer];

const LOSSES: Loss[] = [
  {
    id: 'extensions-follow-the-detected-format',
    target: 'both',
    reason:
      'Country extensions (xrechnungVersion, zugferdProfile, FR profile) are read from the detected format, which depends on the syntax and, for Factur-X, on the XML having come out of a PDF. They are compared only when the document is written back in its own syntax and was not extracted from a PDF.',
    apply: () => {},
  },
  {
    id: 'ubl-vat-point-date-code-list',
    target: 'ubl',
    reason:
      'BT-8 is coded with UNTDID 2005 in UBL and UNTDID 2475 in CII. The writer translates (5, 29, 72 to 3, 35, 432), so the code comes back in the target list.',
    apply: (inv) => {
      inv.vatPointDateCode = vatPointCodeForUbl(inv.vatPointDateCode);
    },
  },
  {
    id: 'cii-vat-point-date-code-list',
    target: 'cii',
    reason:
      'BT-8 is coded with UNTDID 2005 in UBL and UNTDID 2475 in CII. The writer translates (3, 35, 432 to 5, 29, 72), so the code comes back in the target list.',
    apply: (inv) => {
      inv.vatPointDateCode = vatPointCodeForCii(inv.vatPointDateCode);
    },
  },
  {
    id: 'ubl-credit-note-due-date-needs-payment-means',
    target: 'ubl',
    reason:
      'UBL 2.1 has no DueDate on a CreditNote; it lives in PaymentMeans/PaymentDueDate, which needs a PaymentMeansCode. A credit note without payment means loses BT-9.',
    apply: (inv) => {
      if (inv.kind === 'creditNote' && inv.payments.length === 0) inv.dueDate = undefined;
    },
  },
  {
    id: 'ubl-sales-order-needs-order-reference',
    target: 'ubl',
    reason:
      'BT-14 is OrderReference/SalesOrderID, and OrderReference/ID (BT-13) is mandatory in that element. Without BT-13 there is nowhere to put it.',
    apply: (inv) => {
      if (inv.purchaseOrderRef === undefined) inv.salesOrderRef = undefined;
    },
  },
  {
    id: 'ubl-gross-price-needs-discount',
    target: 'ubl',
    reason:
      'BT-148 is the BaseAmount of the price AllowanceCharge, whose Amount (BT-147) is mandatory. A gross price without a discount is not written.',
    apply: (inv) =>
      eachLine(inv.lines, (l) => {
        if (l.price && l.price.discount === undefined) l.price.gross = undefined;
      }),
  },
  {
    id: 'ubl-card-network',
    target: 'ubl',
    reason: 'CardAccount/NetworkID is mandatory in UBL; Peppol says to send NA when unknown, so an absent network comes back as NA.',
    apply: (inv) => {
      for (const p of inv.payments) if (p.card) p.card.network ??= 'NA';
    },
  },
  {
    id: 'ubl-one-account-per-payment-means',
    target: 'ubl',
    reason: 'A PaymentMeans holds one payee account; a payment with several credit transfers becomes several payments.',
    apply: splitTransfers,
  },
  {
    id: 'ubl-empty-notes-and-preceding-ids',
    target: 'ubl',
    reason:
      'A note with no text and no subject code, and a preceding invoice reference without a number, are empty elements and are not written.',
    apply: (inv) => {
      inv.notes = inv.notes.filter((n) => n.text !== '' || n.subjectCode);
      inv.precedingInvoices = inv.precedingInvoices.filter((r) => r.id !== '');
    },
  },
  {
    id: 'cii-no-issue-time',
    target: 'cii',
    reason: 'CII writes the issue date as a date (format 102); the model reads no time from it.',
    apply: (inv) => {
      inv.issueTime = undefined;
    },
  },
  {
    id: 'cii-credit-note-type-code',
    target: 'cii',
    reason: 'CII has one root for both; the direction is the type code. A credit note carrying a non-credit code is written as 381.',
    apply: (inv) => {
      if (inv.kind === 'creditNote' && !CREDIT_TYPE_CODES.has(inv.typeCode)) inv.typeCode = '381';
    },
  },
  {
    id: 'cii-card-network',
    target: 'cii',
    reason: 'The CII financial card (ApplicableTradeSettlementFinancialCard) has no card network field.',
    apply: (inv) => {
      for (const p of inv.payments) if (p.card) p.card.network = undefined;
    },
  },
  {
    id: 'cii-one-preceding-invoice',
    target: 'cii',
    reason: 'InvoiceReferencedDocument occurs once in the D16B schema, so only the first BG-3 entry is written.',
    apply: (inv) => {
      inv.precedingInvoices = inv.precedingInvoices.filter((r) => r.id !== '').slice(0, 1);
    },
  },
  {
    id: 'cii-no-sub-lines',
    target: 'cii',
    reason: 'Sub-lines are an XRechnung / EXTENDED extension that the EN 16931 CII binding does not have.',
    apply: (inv) =>
      eachLine(inv.lines, (l) => {
        l.subLines = undefined;
      }),
  },
  {
    id: 'ubl-specification-is-syntax-specific',
    target: 'ubl',
    reason:
      'A Factur-X / ZUGFeRD profile identifier names a CII syntax; on a UBL document it is replaced by Peppol BIS Billing 3.0 and its business process.',
    apply: (inv) => {
      if (/factur-x\.eu/i.test(inv.specificationId)) {
        inv.specificationId = PEPPOL_SPEC;
        inv.businessProcess = PEPPOL_PROCESS;
      }
    },
  },
  {
    id: 'cii-specification-is-syntax-specific',
    target: 'cii',
    reason:
      'Peppol BIS Billing 3.0 is a UBL specification; on a CII document it is replaced by the EN 16931 base identifier, without a business process.',
    apply: (inv) => {
      if (/peppol\.eu:2017:poacc/i.test(inv.specificationId)) {
        inv.specificationId = EN_BASE_SPEC;
        inv.businessProcess = undefined;
      }
    },
  },
  {
    id: 'cii-bic-only',
    target: 'cii',
    reason: 'BT-86 also carries national labels such as SE:BANKGIRO; CII has BICID only, so anything that is not a BIC is not written.',
    apply: (inv) => {
      for (const p of inv.payments)
        for (const t of p.creditTransfers)
          if (t.serviceProviderId !== undefined && !/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(t.serviceProviderId))
            t.serviceProviderId = undefined;
    },
  },
  {
    id: 'cii-attachment-references',
    target: 'cii',
    reason:
      'CII attachments are AdditionalReferencedDocument of type 916; a bare reference comes back with that type code and without a scheme.',
    apply: (inv) => {
      for (const a of inv.attachments) if (a.kind === 'reference') Object.assign(a, { typeCode: '916', schemeId: undefined });
    },
  },
  {
    id: 'cii-tax-point-lives-on-vat-lines',
    target: 'cii',
    reason: 'CII keeps BT-7 and BT-8 on the first VAT breakdown entry; with no breakdown there is nowhere to write them.',
    apply: (inv) => {
      if (inv.vatBreakdown.length === 0) {
        inv.taxPointDate = undefined;
        inv.vatPointDateCode = undefined;
      }
    },
  },
  {
    id: 'cii-discount-needs-gross-price',
    target: 'cii',
    reason: 'BT-147 is written inside the gross price (GrossPriceProductTradePrice), so a discount without a gross price is not written.',
    apply: (inv) =>
      eachLine(inv.lines, (l) => {
        if (l.price && l.price.gross === undefined) l.price.discount = undefined;
      }),
  },
  {
    id: 'cii-remittance-is-per-document',
    target: 'cii',
    reason: 'PaymentReference (BT-83) sits once in the settlement, so every payment reads back the same remittance information.',
    apply: (inv) => {
      const r = inv.payments.find((p) => p.remittanceInformation !== undefined)?.remittanceInformation;
      if (r !== undefined) for (const p of inv.payments) p.remittanceInformation = r;
    },
  },
  {
    id: 'cii-identifier-order',
    target: 'cii',
    reason: 'The schema wants every ID before every GlobalID, so identifiers with a scheme (GlobalID) come after those without.',
    apply: (inv) => {
      for (const p of parties(inv))
        p.identifiers = [...p.identifiers.filter((i) => !i.schemeId), ...p.identifiers.filter((i) => i.schemeId)];
    },
  },
  {
    id: 'cii-one-account-per-payment-means',
    target: 'cii',
    reason: 'A payment means holds one payee account; a payment with several credit transfers becomes several payments.',
    apply: splitTransfers,
  },
];

/** The canonical invoice as it is expected to come back from `target`: lossy fields settled, `source` dropped, undefined keys gone. */
function expected(inv: CanonicalInvoice, target: Target, dropExtensions: boolean): unknown {
  const copy = structuredClone(inv);
  for (const loss of LOSSES) {
    if (loss.target !== 'both' && loss.target !== target) continue;
    loss.apply(copy);
  }
  if (dropExtensions) copy.extensions = {};
  const { source, ...rest } = copy;
  void source;
  return JSON.parse(JSON.stringify(rest));
}

function diffs(a: unknown, b: unknown, path = ''): string[] {
  if (Object.is(a, b)) return [];
  if (Array.isArray(a) && Array.isArray(b)) {
    const out = a.length === b.length ? [] : [`${path}: ${a.length} entries, then ${b.length}`];
    for (let i = 0; i < Math.min(a.length, b.length); i++) out.push(...diffs(a[i], b[i], `${path}/${i}`));
    return out;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const x = a as Record<string, unknown>;
    const y = b as Record<string, unknown>;
    return [...new Set([...Object.keys(x), ...Object.keys(y)])].flatMap((k) => diffs(x[k], y[k], `${path}/${k}`));
  }
  return [`${path}: ${JSON.stringify(a)}, then ${JSON.stringify(b)}`];
}

/**
 * National formats carry data EN 16931 cannot express (withholdings, other taxes, extra parties, national codes,
 * clearance data...), and which of their EN fields survive depends on how loosely the source filled them. For them the
 * round trip asserts the EN 16931 core: who, when, how much, which lines.
 */
function core(inv: CanonicalInvoice): unknown {
  const t = inv.totals;
  return JSON.parse(
    JSON.stringify({
      id: inv.id,
      issueDate: inv.issueDate,
      currency: inv.currency,
      seller: { name: inv.seller.name, vatId: inv.seller.vatId },
      buyer: { name: inv.buyer.name, vatId: inv.buyer.vatId },
      totals: { lineNetTotal: t.lineNetTotal, taxExclusive: t.taxExclusive, taxInclusive: t.taxInclusive, payable: t.payable },
      vatBreakdown: inv.vatBreakdown.map((v) => ({
        taxableAmount: v.taxableAmount,
        taxAmount: v.taxAmount,
        categoryCode: v.categoryCode,
        rate: v.rate,
      })),
      lines: inv.lines.map((l) => ({ id: l.id, netAmount: l.netAmount })),
    }),
  );
}

/** Syntaxes in which a fixture is an EN 16931 invoice: the whole canonical document is compared for these. */
const EN_FORMATS = new Set([
  'peppol-bis3',
  'peppol-bis3-selfbilling',
  'xrechnung-ubl',
  'xrechnung-cii',
  'nlcius-ubl',
  'nlcius-cii',
  'cius-ro',
  'cius-pt',
  'hr-cius',
  'fr-ctc-ubl',
  'fr-ctc-cii',
  'en16931-ubl',
  'en16931-cii',
  'facturx',
]);

async function reparse(xml: string): Promise<CanonicalInvoice> {
  const r = await convert(utf8(xml), 'written.xml');
  const o: ConvertOutcome | undefined = r.outcomes[0];
  if (r.outcomes.length !== 1 || o?.status !== 'ok' || o.invoices.length !== 1) {
    throw new Error(
      `the written document does not parse back to one invoice: ${JSON.stringify(r.outcomes.map((x) => (x.status === 'ok' ? 'ok' : x)))}`,
    );
  }
  return o.invoices[0];
}

// ---------------------------------------------------------------------------
// Every fixture that converts
// ---------------------------------------------------------------------------

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const listFixtures = (dir = ''): string[] =>
  readdirSync(join(FIXTURES, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFixtures(join(dir, e.name)) : [join(dir, e.name)],
  );

interface Converted {
  label: string;
  file: string;
  inv: CanonicalInvoice;
}

const converted: Converted[] = [];
for (const file of listFixtures().filter((f) => !/(^|\/)(README\.md|expected\.json)$/.test(f))) {
  const r = await convert(new Uint8Array(readFileSync(join(FIXTURES, file))), file);
  for (const o of r.outcomes) {
    if (o.status !== 'ok') continue;
    for (const [i, inv] of o.invoices.entries()) converted.push({ label: o.invoices.length > 1 ? `${file}#${i}` : file, file, inv });
  }
}
const family = (inv: CanonicalInvoice) => FORMATS_BY_ID[inv.source.format]?.family;

describe('round trip: parse, write, parse again', () => {
  test('there are fixtures to try, EN 16931 ones among them', () => {
    assert.ok(converted.length >= 60, `only ${converted.length} invoices converted`);
    assert.ok(converted.filter((c) => EN_FORMATS.has(c.inv.source.format)).length >= 15);
  });

  test('the loss rules are documented', () => {
    const ids = LOSSES.map((l) => l.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const l of LOSSES) assert.ok(l.reason.length > 40, l.id);
  });

  for (const target of TARGETS) {
    describe(`to ${target.toUpperCase()}`, () => {
      for (const { label, inv } of converted) {
        const strict = EN_FORMATS.has(inv.source.format);
        test(`${label}${strict ? '' : ' (EN 16931 core)'}`, async () => {
          const xml = write(inv, target);
          parseXml(xml); // well-formed
          const back = await reparse(xml);
          if (strict) {
            const keepExtensions = family(inv) === target && !inv.source.envelope.some((s) => s.kind === 'pdf-attachment');
            assert.deepEqual(diffs(expected(inv, target, !keepExtensions), expected(back, target, !keepExtensions)), []);
          } else {
            assert.deepEqual(diffs(core(inv), core(back)), []);
          }
          assert.equal(write(inv, target), xml, 'the same invoice must give the same bytes');
        });
      }
    });
  }
});

// ---------------------------------------------------------------------------
// The written documents against the schema and the Schematron
// ---------------------------------------------------------------------------

describe('written documents validate', () => {
  test('EN 16931 fixtures that are valid as received stay valid when written', { timeout: 300_000 }, async () => {
    const problems: string[] = [];
    let checked = 0;
    for (const { label, file, inv } of converted) {
      if (!EN_FORMATS.has(inv.source.format) || converted.filter((c) => c.file === file).length !== 1) continue;
      const received = await convert(new Uint8Array(readFileSync(join(FIXTURES, file))), file, undefined, { validate: true });
      const o = received.outcomes[0];
      const v = o?.status === 'ok' ? o.invoices[0].source.validation : undefined;
      if (v?.schema !== 'passed' || v.semantic !== 'passed') continue; // only documents that are valid as received can be held to it
      for (const target of TARGETS) {
        const xml = write(inv, target);
        const w = await validate({ xml }, detectXml(xml));
        checked++;
        const layers = family(inv) === target ? (['schema', 'semantic', 'profile'] as const) : (['schema', 'semantic'] as const);
        for (const layer of layers) {
          if (layer === 'profile' && v.profile !== 'passed') continue;
          if (w[layer] === 'failed') {
            const rules = w.findings
              .filter((f) => f.layer === layer && f.severity === 'fatal')
              .map((f) => `${f.ruleId ?? '-'}: ${f.message.slice(0, 160)}`);
            problems.push(`${label} -> ${target} ${layer}: ${rules.join(' | ')}`);
          }
        }
      }
    }
    assert.ok(checked >= 6, `only ${checked} written documents were validated`);
    assert.deepEqual(problems, []);
  });
});

// ---------------------------------------------------------------------------
// A hand-built invoice that uses every part of the mapping
// ---------------------------------------------------------------------------

function rich(kind: 'invoice' | 'creditNote' = 'invoice'): CanonicalInvoice {
  return {
    kind,
    typeCode: kind === 'invoice' ? '380' : '381',
    id: 'RICH-1',
    issueDate: '2026-01-31',
    issueTime: '10:30:00',
    selfBilled: false,
    currency: 'EUR',
    taxCurrency: 'SEK',
    taxPointDate: '2026-01-30',
    vatPointDateCode: '5',
    dueDate: '2026-02-28',
    buyerReference: 'BUYER-REF',
    projectRef: 'PRJ-1',
    contractRef: 'CTR-1',
    purchaseOrderRef: 'PO-1',
    salesOrderRef: 'SO-1',
    receivingAdviceRef: 'RA-1',
    despatchAdviceRef: 'DA-1',
    tenderRef: 'TND-1',
    invoicedObjectId: { value: 'OBJ-1', schemeId: 'AAB' },
    accountingRef: 'ACC-1',
    paymentTerms: 'Net 30 days',
    notes: [{ subjectCode: 'AAI', text: 'General' }, { text: 'Plain note' }],
    businessProcess: PEPPOL_PROCESS,
    specificationId: PEPPOL_SPEC,
    precedingInvoices: [{ id: 'INV-0', issueDate: '2026-01-01' }],
    invoicePeriod: { start: '2026-01-01', end: '2026-01-31' },
    seller: {
      name: 'Seller AB',
      tradingName: 'Seller Trading',
      identifiers: [{ value: 'LOCAL-1' }, { value: '7300010000002', schemeId: '0088' }],
      legalRegistrationId: { value: '5560000001', schemeId: '0007' },
      vatId: 'SE556000000101',
      taxRegistrationId: 'Godkänd för F-skatt',
      additionalLegalInfo: 'Säte Stockholm',
      nationalTaxIds: [],
      endpoint: { value: '5560000001', schemeId: '0007' },
      address: {
        line1: 'Storgatan 1',
        line2: 'Box 12',
        line3: 'Floor 3',
        city: 'Stockholm',
        postalCode: '11122',
        countrySubdivision: 'AB',
        countryCode: 'SE',
      },
      contact: { name: 'Erik', phone: '+46 8 123 45', email: 'faktura@seller.example' },
    },
    buyer: {
      name: 'Buyer BV',
      identifiers: [],
      vatId: 'NL123456789B01',
      nationalTaxIds: [],
      address: { city: 'Amsterdam', countryCode: 'NL' },
    },
    payee: {
      name: 'Payee Factoring',
      identifier: { value: '7300010000019', schemeId: '0088' },
      legalRegistrationId: { value: '5560000002', schemeId: '0007' },
    },
    taxRepresentative: { name: 'Rep & Co', vatId: 'SE556000000201', address: { line1: 'Repgatan 2', city: 'Uppsala', countryCode: 'SE' } },
    additionalParties: [],
    delivery: {
      partyName: 'Warehouse',
      locationId: { value: '7300010000026', schemeId: '0088' },
      actualDate: '2026-01-29',
      address: { line1: 'Lagervägen 5', city: 'Uppsala', countryCode: 'SE' },
    },
    payments: [
      {
        meansCode: '59',
        meansText: 'SEPA direct debit',
        remittanceInformation: 'RF18 5390 0754 7034',
        creditTransfers: [{ accountId: 'SE4550000000058398257466', accountName: 'Seller AB', serviceProviderId: 'ESSESESS' }],
        directDebit: { mandateId: 'MND-1', creditorId: 'SE98ZZZ0000001', debitedAccountId: 'DE89370400440532013000' },
      },
    ],
    paymentSchedule: [],
    allowances: [
      {
        amount: '10.00',
        baseAmount: '100.00',
        percentage: '10',
        reason: 'Volume discount',
        reasonCode: '95',
        vat: { categoryCode: 'S', rate: '25' },
      },
    ],
    charges: [{ amount: '5.00', reason: 'Freight', reasonCode: 'FC', vat: { categoryCode: 'S', rate: '25' } }],
    totals: {
      lineNetTotal: '200.00',
      allowanceTotal: '10.00',
      chargeTotal: '5.00',
      taxExclusive: '195.00',
      vatTotal: '48.75',
      vatTotalInTaxCurrency: '520.10',
      taxInclusive: '243.75',
      prepaid: '3.75',
      rounding: '0.00',
      payable: '240.00',
    },
    vatBreakdown: [
      { taxableAmount: '195.00', taxAmount: '48.75', categoryCode: 'S', rate: '25' },
      {
        taxableAmount: '0.00',
        taxAmount: '0.00',
        categoryCode: 'E',
        rate: '0',
        exemptionReason: 'Exempt supply',
        exemptionReasonCode: 'VATEX-EU-132',
      },
    ],
    otherTaxes: [],
    withholdings: [],
    attachments: [
      { kind: 'embedded', id: 'ATT-1', description: 'Time sheet', mimeCode: 'text/plain', filename: 'sheet.txt', base64: 'SGVsbG8=' },
      { kind: 'external', id: 'ATT-2', description: 'Terms', uri: 'https://example.test/terms' },
      { kind: 'reference', id: 'ATT-3', typeCode: '916' },
    ],
    lines: [
      {
        id: '1',
        note: 'Line note',
        objectId: { value: 'LOBJ-1', schemeId: 'AAB' },
        quantity: '2',
        unitCode: 'C62',
        netAmount: '200.00',
        orderLineRef: '10',
        accountingRef: '4025',
        period: { start: '2026-01-01', end: '2026-01-31' },
        allowances: [{ amount: '1.00', reason: 'Line discount', reasonCode: '95' }],
        charges: [{ amount: '2.00', reason: 'Line charge', reasonCode: 'FC' }],
        price: { net: '100.5000', discount: '5.00', gross: '105.5000', baseQuantity: '1', baseQuantityUnit: 'C62' },
        vat: { categoryCode: 'S', rate: '25' },
        item: {
          name: 'Widget',
          description: 'A fine widget',
          sellerId: 'W-1',
          buyerId: 'B-1',
          standardId: { value: '7300010000033', schemeId: '0160' },
          classifications: [{ code: '12345678', listId: 'STI', listVersion: '1.0' }],
          originCountry: 'SE',
          attributes: [{ name: 'Colour', value: 'Red' }],
        },
      },
      { id: '2', netAmount: '0.00', allowances: [], charges: [], item: { name: 'Free sample', classifications: [], attributes: [] } },
    ],
    clearance: [],
    extensions: {},
    source: {
      format: 'peppol-bis3',
      syntaxDocumentType: 'Invoice',
      rootNamespace: '',
      envelope: [],
      fileSha256: '',
      payloadSha256: '',
      signatures: [],
      unmapped: {},
      derived: [],
      warnings: [],
    },
  } as unknown as CanonicalInvoice;
}

describe('a hand-built invoice that uses every part of the mapping', () => {
  for (const kind of ['invoice', 'creditNote'] as const) {
    for (const target of TARGETS) {
      test(`${kind} -> ${target} and back`, async () => {
        const inv = rich(kind);
        const xml = write(inv, target);
        parseXml(xml);
        const back = await reparse(xml);
        assert.deepEqual(diffs(expected(inv, target, false), expected(back, target, false)), []);
      });
    }
  }

  test('UBL element order follows the schema', () => {
    const xml = toUbl(rich());
    const order = [
      '<cbc:CustomizationID>',
      '<cbc:ID>RICH-1',
      '<cbc:IssueDate>',
      '<cbc:DueDate>',
      '<cbc:InvoiceTypeCode>',
      '<cbc:Note>',
      '<cbc:TaxPointDate>',
      '<cbc:DocumentCurrencyCode>',
      '<cbc:BuyerReference>',
      '<cac:InvoicePeriod>',
      '<cac:OrderReference>',
      '<cac:BillingReference>',
      '<cac:DespatchDocumentReference>',
      '<cac:ReceiptDocumentReference>',
      '<cac:OriginatorDocumentReference>',
      '<cac:ContractDocumentReference>',
      '<cac:AdditionalDocumentReference>',
      '<cac:ProjectReference>',
      '<cac:AccountingSupplierParty>',
      '<cac:AccountingCustomerParty>',
      '<cac:PayeeParty>',
      '<cac:TaxRepresentativeParty>',
      '<cac:Delivery>',
      '<cac:PaymentMeans>',
      '<cac:PaymentTerms>',
      '<cac:AllowanceCharge>',
      '<cac:TaxTotal>',
      '<cac:LegalMonetaryTotal>',
      '<cac:InvoiceLine>',
    ];
    const at = order.map((s) => xml.indexOf(s));
    assert.ok(
      at.every((i) => i >= 0),
      `missing: ${order.filter((_, i) => at[i] < 0)}`,
    );
    assert.deepEqual(
      at,
      [...at].sort((a, b) => a - b),
    );
  });

  test('UBL credit notes use their own order, root and line names', () => {
    const xml = toUbl(rich('creditNote'));
    assert.match(xml, /<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"/);
    assert.match(xml, /<cbc:CreditNoteTypeCode>381<\/cbc:CreditNoteTypeCode>/);
    assert.match(xml, /<cbc:CreditedQuantity unitCode="C62">2<\/cbc:CreditedQuantity>/);
    assert.ok(!xml.includes('<cbc:DueDate>'), 'a credit note has no DueDate');
    assert.match(xml, /<cac:PaymentMeans>[\s\S]*<cbc:PaymentDueDate>2026-02-28<\/cbc:PaymentDueDate>/);
    // CreditNote: Contract, Additional, Originator (an Invoice puts Originator first and has a ProjectReference).
    const at = [
      '<cac:ContractDocumentReference>',
      '<cac:AdditionalDocumentReference>',
      '<cac:OriginatorDocumentReference>',
      '<cac:AccountingSupplierParty>',
    ].map((s) => xml.indexOf(s));
    assert.deepEqual(
      at,
      [...at].sort((a, b) => a - b),
    );
    assert.ok(!xml.includes('<cac:ProjectReference>'));
    assert.match(xml, /<cbc:DocumentTypeCode>50<\/cbc:DocumentTypeCode>/);
  });

  test('CII element order follows the schema', () => {
    const xml = toCii(rich(), { profile: 'xrechnung' }); // a profile with a business process, which the Peppol identifier of rich() would not keep in CII
    const order = [
      '<rsm:ExchangedDocumentContext>',
      '<ram:BusinessProcessSpecifiedDocumentContextParameter>',
      '<ram:GuidelineSpecifiedDocumentContextParameter>',
      '<rsm:ExchangedDocument>',
      '<rsm:SupplyChainTradeTransaction>',
      '<ram:IncludedSupplyChainTradeLineItem>',
      '<ram:ApplicableHeaderTradeAgreement>',
      '<ram:SellerTradeParty>',
      '<ram:BuyerTradeParty>',
      '<ram:SellerTaxRepresentativeTradeParty>',
      '<ram:SellerOrderReferencedDocument>',
      '<ram:BuyerOrderReferencedDocument>',
      '<ram:ContractReferencedDocument>',
      '<ram:AdditionalReferencedDocument>',
      '<ram:SpecifiedProcuringProject>',
      '<ram:ApplicableHeaderTradeDelivery>',
      '<ram:ShipToTradeParty>',
      '<ram:ActualDeliverySupplyChainEvent>',
      '<ram:DespatchAdviceReferencedDocument>',
      '<ram:ReceivingAdviceReferencedDocument>',
      '<ram:ApplicableHeaderTradeSettlement>',
      '<ram:CreditorReferenceID>',
      '<ram:PaymentReference>',
      '<ram:TaxCurrencyCode>',
      '<ram:InvoiceCurrencyCode>',
      '<ram:PayeeTradeParty>',
      '<ram:SpecifiedTradeSettlementPaymentMeans>',
      '<ram:ApplicableTradeTax>',
      '<ram:BillingSpecifiedPeriod>',
      '<ram:SpecifiedTradeAllowanceCharge>',
      '<ram:SpecifiedTradePaymentTerms>',
      '<ram:SpecifiedTradeSettlementHeaderMonetarySummation>',
      '<ram:InvoiceReferencedDocument>',
      '<ram:ReceivableSpecifiedTradeAccountingAccount>',
    ];
    // The header elements are searched after the last line item: lines have a BuyerOrderReferencedDocument, an AdditionalReferencedDocument and so on of their own.
    const tail = xml.lastIndexOf('</ram:IncludedSupplyChainTradeLineItem>');
    const at = order.map((s, i) => xml.indexOf(s, i < 6 ? 0 : tail));
    assert.ok(
      at.every((i) => i >= 0),
      `missing: ${order.filter((_, i) => at[i] < 0)}`,
    );
    assert.deepEqual(
      at,
      [...at].sort((a, b) => a - b),
    );
  });

  test('CII line children follow the schema', () => {
    const xml = toCii(rich());
    const order = [
      '<ram:AssociatedDocumentLineDocument>',
      '<ram:SpecifiedTradeProduct>',
      '<ram:SpecifiedLineTradeAgreement>',
      '<ram:GrossPriceProductTradePrice>',
      '<ram:NetPriceProductTradePrice>',
      '<ram:SpecifiedLineTradeDelivery>',
      '<ram:SpecifiedLineTradeSettlement>',
      '<ram:SpecifiedTradeSettlementLineMonetarySummation>',
    ];
    const at = order.map((s) => xml.indexOf(s));
    assert.ok(at.every((i) => i >= 0));
    assert.deepEqual(
      at,
      [...at].sort((a, b) => a - b),
    );
  });
});

// ---------------------------------------------------------------------------
// Behaviour
// ---------------------------------------------------------------------------

describe('writer behaviour', () => {
  test('decimals are written exactly as held', () => {
    const inv = rich();
    inv.totals.payable = '240.100' as never;
    inv.lines[0].price!.net = '0.0010' as never;
    for (const xml of [toUbl(inv), toCii(inv)]) {
      assert.ok(xml.includes('>240.100<'));
      assert.ok(xml.includes('>0.0010<'));
      assert.ok(xml.includes('>100.5000<') === false);
    }
    assert.ok(toUbl(rich()).includes('>100.5000<'));
  });

  test('a value that is not a decimal is refused', () => {
    const inv = rich();
    inv.totals.payable = '1e3' as never;
    assert.throws(() => toUbl(inv), WriterError);
    assert.throws(() => toCii(inv), /payable amount: "1e3" is not a decimal/);
    const line = rich();
    line.lines[0].quantity = '2,5' as never;
    assert.throws(() => toUbl(line), /line quantity/);
  });

  test('text and attributes are escaped, and characters XML forbids are dropped', () => {
    const inv = rich();
    inv.id = 'A<&>"\'B\u0001\u0008C';
    inv.notes = [{ text: 'line one\nline two & <tag> \u{1F600} \uD800' }];
    inv.seller.name = 'Smith & "Sons" <Ltd>';
    inv.attachments = [{ kind: 'embedded', id: 'X', mimeCode: 'text/plain', filename: 'a"b&c<d>.txt\n', base64: 'AAAA' }];
    for (const target of TARGETS) {
      const xml = write(inv, target);
      assert.ok(xml.includes('A&lt;&amp;&gt;"\'BC'), target);
      assert.ok(xml.includes('Smith &amp; "Sons" &lt;Ltd&gt;'), target);
      assert.ok(xml.includes('filename="a&quot;b&amp;c&lt;d&gt;.txt&#10;"'), target);
      parseXml(xml);
    }
    const ubl = toUbl(inv);
    assert.ok(ubl.includes('line one\nline two &amp; &lt;tag&gt; \u{1F600} </cbc:Note>'));
  });

  test('the same invoice gives the same bytes, with a declaration and a trailing newline', () => {
    for (const target of TARGETS) {
      const a = write(rich(), target);
      assert.equal(a, write(structuredClone(rich()), target));
      assert.ok(a.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n'));
      assert.ok(a.endsWith('>\n'));
    }
  });

  test('profile picks the specification; an EN 16931 identifier is kept; anything else falls back', () => {
    const inv = rich();
    assert.ok(toUbl(inv).includes(`<cbc:CustomizationID>${PEPPOL_SPEC}</cbc:CustomizationID>`));
    assert.ok(toUbl(inv, { profile: 'xrechnung' }).includes('urn:xeinkauf.de:kosit:xrechnung_3.0'));
    const en = toUbl(inv, { profile: 'en16931' });
    assert.ok(en.includes('<cbc:CustomizationID>urn:cen.eu:en16931:2017</cbc:CustomizationID>'));
    assert.ok(!en.includes('<cbc:ProfileID>'));
    assert.throws(() => toUbl(inv, { profile: 'nope' as never }), /Unknown profile/);

    inv.specificationId = 'fatturapa:1.2';
    inv.businessProcess = undefined;
    assert.ok(toUbl(inv).includes(`<cbc:CustomizationID>${PEPPOL_SPEC}</cbc:CustomizationID>`));
    assert.ok(toUbl(inv).includes(`<cbc:ProfileID>${PEPPOL_PROCESS}</cbc:ProfileID>`));
    assert.ok(toCii(inv).includes('<ram:ID>urn:cen.eu:en16931:2017</ram:ID>'));
    assert.ok(!toCii(inv).includes('BusinessProcessSpecifiedDocumentContextParameter'));
    inv.specificationId = '';
    assert.ok(toUbl(inv).includes(PEPPOL_SPEC));
  });

  test('a specification that exists in one syntax only is not carried into the other', () => {
    const peppol = rich(); // Peppol BIS Billing 3.0 is UBL
    const cii = toCii(peppol);
    assert.ok(cii.includes(`<ram:ID>${EN_BASE_SPEC}</ram:ID>`));
    assert.ok(!cii.includes('peppol'), 'no Peppol identifier on a CII document');
    assert.ok(toCii(peppol, { profile: 'peppol-bis3' }).includes(PEPPOL_SPEC), 'an explicit profile is taken as asked');

    const facturx = rich();
    facturx.specificationId = 'urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended';
    facturx.businessProcess = undefined;
    assert.ok(toCii(facturx).includes('urn:factur-x.eu:1p0:extended'));
    const ubl = toUbl(facturx);
    assert.ok(!ubl.includes('factur-x'), 'no Factur-X identifier on a UBL document');
    assert.ok(ubl.includes(`<cbc:CustomizationID>${PEPPOL_SPEC}</cbc:CustomizationID>`));

    const xr = rich();
    xr.specificationId = 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0';
    assert.ok(toCii(xr).includes('xrechnung_3.0'), 'XRechnung exists in both syntaxes');
    assert.ok(toUbl(xr).includes('xrechnung_3.0'));
  });

  test('a bank identifier that is not a BIC is not written as one', () => {
    const inv = rich();
    inv.payments[0].creditTransfers = [{ accountId: '1234567', serviceProviderId: 'SE:BANKGIRO' }];
    assert.ok(!toCii(inv).includes('BICID'));
    assert.ok(toUbl(inv).includes('<cbc:ID>SE:BANKGIRO</cbc:ID>'));
    inv.payments[0].creditTransfers[0].serviceProviderId = 'DEUTDEFF500';
    assert.ok(toCii(inv).includes('<ram:BICID>DEUTDEFF500</ram:BICID>'));
  });

  test('a credit note with a non-credit type code is written as 381 in CII, as is in UBL', () => {
    const inv = rich('creditNote');
    inv.typeCode = '380';
    assert.ok(toCii(inv).includes('<ram:TypeCode>381</ram:TypeCode>'));
    assert.ok(toUbl(inv).includes('<cbc:CreditNoteTypeCode>380</cbc:CreditNoteTypeCode>'));
  });

  test('the VAT total is the exact sum of the breakdown when the model has none', () => {
    const inv = rich();
    inv.totals.vatTotal = undefined;
    inv.vatBreakdown[0].taxAmount = '0.10' as never;
    inv.vatBreakdown[1].taxAmount = '0.20' as never;
    assert.ok(toUbl(inv).includes('<cbc:TaxAmount currencyID="EUR">0.30</cbc:TaxAmount>'));
    assert.ok(toCii(inv).includes('<ram:TaxTotalAmount currencyID="EUR">0.30</ram:TaxTotalAmount>'));
    inv.vatBreakdown = [];
    assert.ok(!toUbl(inv).includes('<cbc:TaxAmount currencyID="EUR">'));
    assert.ok(!toCii(inv).includes('<ram:TaxTotalAmount currencyID="EUR">'));
  });

  test('a payment with several credit transfers becomes several payment means', () => {
    const inv = rich();
    inv.payments[0].creditTransfers.push({ accountId: 'NL57RABO0107307510' });
    const ubl = toUbl(inv);
    assert.equal(ubl.match(/<cac:PaymentMeans>/g)?.length, 2);
    assert.equal(ubl.match(/<cac:PaymentMandate>/g)?.length, 1, 'the mandate rides on the first only');
    const cii = toCii(inv);
    assert.equal(cii.match(/<ram:SpecifiedTradeSettlementPaymentMeans>/g)?.length, 2);
    assert.ok(cii.includes('<ram:IBANID>NL57RABO0107307510</ram:IBANID>'));
  });

  test('accounts that are not IBANs are written as proprietary ids; a card is written with its network in UBL only', async () => {
    const inv = rich();
    inv.payments = [
      {
        meansCode: '48',
        creditTransfers: [{ accountId: '1234567', serviceProviderId: 'SE:BANKGIRO' }],
        card: { primaryAccountNumber: '1234', holderName: 'A Holder' },
      },
    ];
    const cii = toCii(inv);
    assert.ok(cii.includes('<ram:ProprietaryID>1234567</ram:ProprietaryID>'));
    assert.ok(cii.includes('<ram:ID>1234</ram:ID>'));
    const ubl = toUbl(inv);
    assert.ok(ubl.includes('<cbc:NetworkID>NA</cbc:NetworkID>'));
    const back = await reparse(ubl);
    assert.equal(back.payments[0].card?.primaryAccountNumber, '1234');
    assert.equal(back.payments[0].creditTransfers[0].serviceProviderId, 'SE:BANKGIRO');
  });

  test('a credit note due date without payment means, and a sales order alone, are not written to UBL', () => {
    const cn = rich('creditNote');
    cn.payments = [];
    assert.ok(!toUbl(cn).includes('2026-02-28'));
    assert.ok(toCii(cn).includes('2026-02-28'.replace(/-/g, '')));
    const so = rich();
    so.purchaseOrderRef = undefined;
    assert.ok(!toUbl(so).includes('<cac:OrderReference>'));
    assert.ok(toCii(so).includes('<ram:SellerOrderReferencedDocument>'));
  });

  test('sub-lines are written to UBL in the line kind of the document', async () => {
    for (const kind of ['invoice', 'creditNote'] as const) {
      const inv = rich(kind);
      inv.lines[0].subLines = [
        {
          id: '1.1',
          quantity: '1',
          unitCode: 'C62',
          netAmount: '50.00',
          allowances: [],
          charges: [],
          item: { name: 'Part', classifications: [], attributes: [] },
        } as never,
      ];
      const xml = toUbl(inv);
      assert.ok(xml.includes(kind === 'invoice' ? '<cac:SubInvoiceLine>' : '<cac:SubCreditNoteLine>'));
      const back = await reparse(xml);
      assert.equal(back.lines[0].subLines?.[0].id, '1.1');
      assert.equal(back.lines[0].subLines?.[0].quantity, '1');
      assert.ok(!toCii(inv).includes('<ram:LineID>1.1<'));
    }
  });

  test('an invoice with nothing optional still writes well-formed documents', async () => {
    const inv = rich();
    const bare = {
      kind: 'invoice',
      typeCode: '380',
      id: 'B-1',
      issueDate: '2026-01-31',
      selfBilled: false,
      currency: 'EUR',
      notes: [],
      specificationId: 'urn:cen.eu:en16931:2017',
      precedingInvoices: [],
      seller: { identifiers: [], nationalTaxIds: [] },
      buyer: { identifiers: [], nationalTaxIds: [] },
      additionalParties: [],
      payments: [],
      paymentSchedule: [],
      allowances: [],
      charges: [],
      totals: { lineNetTotal: '0.00', taxExclusive: '0.00', taxInclusive: '0.00', payable: '0.00' },
      vatBreakdown: [],
      otherTaxes: [],
      withholdings: [],
      attachments: [],
      lines: [],
      clearance: [],
      extensions: {},
      source: inv.source,
    } as unknown as CanonicalInvoice;
    for (const target of TARGETS) {
      const xml = write(bare, target);
      parseXml(xml);
      const back = await reparse(xml);
      assert.equal(back.id, 'B-1');
      assert.equal(back.totals.payable, '0.00');
    }
  });
});
