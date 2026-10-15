/**
 * Greek AADE myDATA invoice XML (InvoicesDoc/invoice) -> canonical.
 *
 * Namespaces (AADE InvoicesDoc XSD): invoices in http://www.aade.gr/myDATA/invoice/v1.0,
 * income / expense classifications in https://www.aade.gr/myDATA/incomeClassificaton/v1.0
 * and https://www.aade.gr/myDATA/expensesClassificaton/v1.0 (AADE's own spelling; the
 * classification children are matched by local name).
 *
 * - One InvoicesDoc holds several invoices; each becomes one canonical invoice.
 * - myDATA states no unit prices and no item names, only net value, VAT category and amount
 *   per line. `lineComments` becomes the item name when present.
 * - `totalGrossValue` is the amount payable: net + VAT - withheld + fees + stamp duty +
 *   other taxes - deductions. BT-112 is computed as net + VAT and the rest is carried in
 *   `withholdings` and `otherTaxes`.
 * - Credit invoices (5.1, 5.2, 11.4) carry positive amounts; `kind` records the direction.
 */
import type { Element } from '@xmldom/xmldom';
import type {
  Address,
  Attachment,
  CanonicalInvoice,
  ClearanceInfo,
  Decimal,
  GrExtension,
  Line,
  OtherTax,
  Party,
  PaymentInstructions,
  Seller,
  Totals,
  VatBreakdown,
  VatInfo,
  Withholding,
} from '../canonical.js';
import { add, cmp, isZero, sub, sum } from '../values.js';
import { Ctx, finish, ParseError, parseXml, sourceMeta } from './context.js';
import type { ParseInput } from './index.js';
import { recordUnmapped } from './leftover.js';

/** invoiceType values that are credits. */
const CREDIT_TYPES = new Set(['5.1', '5.2', '11.4']);
const TYPE_LABELS: Record<string, string> = {
  '1.1': 'Sales invoice',
  '1.2': 'Sales invoice / intra-community supplies',
  '1.3': 'Sales invoice / third country supplies',
  '2.1': 'Service rendered invoice',
  '5.1': 'Credit invoice / associated',
  '5.2': 'Credit invoice / non-associated',
  '11.1': 'Retail sales receipt',
  '11.4': 'Retail sales credit note',
};
/** vatCategory -> rate (percent). 8 = records without VAT. Other codes are not in this table. */
const VAT_RATES: Record<string, string> = { '1': '24', '2': '13', '3': '6', '4': '17', '5': '9', '6': '4', '7': '0' };
/** paymentMethodDetails/type -> UNCL 4461. 5 (on credit) names no means. */
const PAYMENT_MEANS: Record<string, string> = { '1': '30', '2': '30', '3': '10', '4': '20', '6': '30', '7': '48' };
/** measurementUnit -> UN/ECE Rec 20. */
const UNITS: Record<string, string> = { '1': 'C62', '2': 'KGM', '3': 'LTR', '4': 'MTR', '5': 'MTK', '6': 'MTQ' };

export function parseMydata(input: ParseInput): CanonicalInvoice[] {
  const root = parseXml(input.payload.xml);
  const ns = { m: root.namespaceURI ?? '' };
  const probe = new Ctx(ns);
  const docs = probe.all(root, root.localName === 'RequestedDoc' ? 'm:invoicesDoc/m:invoice' : 'm:invoice');
  if (docs.length === 0) throw new ParseError(`${root.localName} holds no invoice`);
  // AADE's retrieval services list a cancelled invoice as a bare invoice with its cancelledByMark and no header.
  const stubs = docs.filter((el) => !probe.el(el, 'm:invoiceHeader') && probe.text(el, 'm:cancelledByMark'));
  const full = docs.filter((el) => !stubs.includes(el));
  const out = full.map((el) => finish(parseInvoice(input, root, el, new Ctx(ns), docs.indexOf(el))));
  if (out.length > 0 && stubs.length > 0) {
    const message = `${stubs.length} entry(ies) with cancelledByMark and no invoiceHeader are cancellation markers, not invoices, and were not converted`;
    for (const inv of out) inv.source.warnings.push({ code: 'GR-CANCELLED-MARKER', path: '/', message });
  }
  return out.length > 0 ? out : docs.map((el, i) => finish(parseInvoice(input, root, el, new Ctx(ns), i)));
}

function parseInvoice(input: ParseInput, root: Element, inv: Element, c: Ctx, index: number): CanonicalInvoice {
  const header = c.el(inv, 'm:invoiceHeader');
  if (!header) throw new ParseError(`invoice ${index + 1}: invoiceHeader missing`);
  const series = c.text(header, 'm:series');
  const aa = c.text(header, 'm:aa');
  const issueDate = c.date(header, 'm:issueDate', 'BT-2');
  const invoiceType = c.text(header, 'm:invoiceType');
  if (!aa || !issueDate || !invoiceType) throw new ParseError(`invoice ${index + 1}: aa (number), issueDate or invoiceType missing`);
  const id = series ? `${series}-${aa}` : aa;
  if (series) c.derive('/id', 'BT-1 composed as series-aa');

  const credit = CREDIT_TYPES.has(invoiceType);
  const selfBilled = (c.text(header, 'm:selfPricing') ?? '').toLowerCase() === 'true';
  const typeCode = credit ? (selfBilled ? '261' : '381') : selfBilled ? '389' : '380';
  c.derive(
    '/typeCode',
    `myDATA invoiceType ${invoiceType} mapped to UNTDID 1001 ${typeCode} (credit types 5.1, 5.2, 11.4; selfPricing = self-billed)`,
  );

  let currency = c.text(header, 'm:currency');
  if (!currency) {
    currency = 'EUR';
    c.derive('/currency', 'invoiceHeader/currency absent; myDATA defaults to EUR');
  }

  const details = c.all(inv, 'm:invoiceDetails');
  const summary = c.el(inv, 'm:invoiceSummary');
  const lines = details.map((d) => line(c, d));
  if (lines.length === 0) c.warn('NO_LINES', 'The invoice has no invoiceDetails lines');
  const missingNames = lines.filter((l) => !l.item.name).length;
  if (missingNames)
    c.warn('NO_ITEM_NAME', `${missingNames} line(s) have no lineComments; myDATA has no item name, so the item name is empty`);

  const { vatBreakdown } = vatFrom(c, details);
  const { totals, withholdings, otherTaxes } = totalsFrom(c, details, summary);

  const issuer = c.el(inv, 'm:issuer');
  const counterpart = c.el(inv, 'm:counterpart');
  if (!issuer) c.warn('NO_ISSUER', 'issuer missing');
  if (!counterpart) c.warn('NO_COUNTERPART', 'counterpart missing (normal for retail receipts)');

  const correlated = c.texts(header, 'm:correlatedInvoices');
  if (correlated.length)
    c.warn('PRECEDING_BY_MARK', 'correlatedInvoices lists MARKs, not invoice numbers; each MARK is used as the reference id');
  const dispatchDate = c.date(header, 'm:dispatchDate', 'dispatch date');
  const rate = c.dec(header, 'm:exchangeRate');
  const classifications = classificationsOf(c, details, summary);

  const unmappedAt = `/InvoicesDoc/invoice${index > 0 ? `[${index + 1}]` : ''}`;
  recordUnmapped(
    c,
    inv,
    [
      'uid',
      'mark',
      'cancelledByMark',
      'qrCodeUrl',
      'issuer',
      'counterpart',
      'invoiceHeader',
      'paymentMethods',
      'invoiceDetails',
      'invoiceSummary',
    ],
    unmappedAt,
  );
  recordUnmapped(
    c,
    header,
    ['series', 'aa', 'issueDate', 'invoiceType', 'currency', 'exchangeRate', 'correlatedInvoices', 'selfPricing', 'dispatchDate'],
    `${unmappedAt}/invoiceHeader`,
  );
  recordUnmapped(
    c,
    summary,
    [
      'totalNetValue',
      'totalVatAmount',
      'totalWithheldAmount',
      'totalFeesAmount',
      'totalStampDutyAmount',
      'totalOtherTaxesAmount',
      'totalGrossValue',
      'incomeClassification',
      'expensesClassification',
    ],
    `${unmappedAt}/invoiceSummary`,
  );

  const extension: GrExtension = { invoiceType, classifications: classifications.length ? classifications : undefined };
  const result = {
    kind: credit ? 'creditNote' : 'invoice',
    typeCode,
    id,
    issueDate,
    nationalType: { scheme: 'GR:invoiceType', code: invoiceType, label: TYPE_LABELS[invoiceType] },
    selfBilled,
    currency,
    exchangeRate: rate === undefined ? undefined : { rate },
    notes: [],
    specificationId: root.namespaceURI ?? '',
    precedingInvoices: correlated.map((mark) => ({ id: mark, clearanceId: mark })),
    seller: party(c, issuer, unmappedAt, 'issuer') as Seller,
    buyer: party(c, counterpart, unmappedAt, 'counterpart'),
    additionalParties: [],
    delivery: dispatchDate ? { actualDate: dispatchDate } : undefined,
    payments: payments(c, inv, unmappedAt),
    paymentSchedule: [],
    allowances: [],
    charges: [],
    totals,
    vatBreakdown,
    otherTaxes,
    withholdings,
    attachments: [] as Attachment[],
    lines,
    clearance: clearance(c, inv),
    extensions: { gr: extension },
    source: sourceMeta(input, root, c, {
      specificationId: root.namespaceURI ?? undefined,
      fragmentPath: `/InvoicesDoc/invoice[${index + 1}]`,
    }),
  } as CanonicalInvoice;
  return result;
}

function party(c: Ctx, p: Element | undefined, at: string, role: string): Party {
  const vat = c.text(p, 'm:vatNumber');
  const country = c.text(p, 'm:country');
  const a = c.el(p, 'm:address');
  recordUnmapped(c, p, ['vatNumber', 'country', 'name', 'address'], `${at}/${role}`);
  recordUnmapped(c, a, ['street', 'number', 'postalCode', 'city'], `${at}/${role}/address`);
  const street = c.text(a, 'm:street');
  const number = c.text(a, 'm:number');
  const address: Address | undefined = p
    ? {
        line1: street ? (number ? `${street} ${number}` : street) : undefined,
        postalCode: c.text(a, 'm:postalCode'),
        city: c.text(a, 'm:city'),
        countryCode: country,
      }
    : undefined;
  let vatId: string | undefined;
  if (vat) {
    const prefix = country === 'GR' ? 'EL' : country;
    vatId = /^[A-Z]{2}/.test(vat) || !prefix ? vat : `${prefix}${vat}`;
    if (vatId !== vat)
      c.derive(`/${role === 'issuer' ? 'seller' : 'buyer'}/vatId`, `vatNumber prefixed with the VAT country code ${prefix}`);
  }
  return {
    name: c.text(p, 'm:name'),
    identifiers: [],
    vatId,
    nationalTaxIds: vat && country === 'GR' ? [{ value: vat, schemeId: 'GR:AFM' }] : [],
    address,
  };
}

function clearance(c: Ctx, inv: Element): ClearanceInfo[] {
  const mark = c.text(inv, 'm:mark');
  const uid = c.text(inv, 'm:uid');
  if (!mark && !uid) return [];
  const cancelledBy = c.text(inv, 'm:cancelledByMark');
  return [
    {
      authority: 'GR:MYDATA',
      documentId: mark,
      secondaryId: uid,
      status: cancelledBy ? `cancelled-by:${cancelledBy}` : undefined,
      qrPayload: c.text(inv, 'm:qrCodeUrl'),
    },
  ];
}

function payments(c: Ctx, inv: Element, at: string): PaymentInstructions[] {
  return c.all(inv, 'm:paymentMethods/m:paymentMethodDetails').map((pm, i) => {
    const type = c.text(pm, 'm:type');
    recordUnmapped(c, pm, ['type', 'paymentMethodInfo'], `${at}/paymentMethods/paymentMethodDetails[${i + 1}]`);
    return {
      meansCode: (type && PAYMENT_MEANS[type]) ?? '',
      meansText: c.text(pm, 'm:paymentMethodInfo'),
      nationalMeansCode: type,
      creditTransfers: [],
    };
  });
}

// ---------------------------------------------------------------------------
// VAT, lines, totals
// ---------------------------------------------------------------------------

/** VAT info for one line or group. Categories 1-7 are in the rate table; 8 means no VAT; others are kept as national codes. */
function vatInfo(c: Ctx, category: string | undefined, exemption: string | undefined, vatAmount: Decimal | undefined): VatInfo | undefined {
  if (!category) return undefined;
  const nationalCode = `GR:vatCategory:${category}`;
  if (exemption) return { categoryCode: 'E', rate: '0' as Decimal, nationalCode, exemptionReason: `vatExemptionCategory ${exemption}` };
  if (category === '8') return { categoryCode: 'O', nationalCode };
  const rate = VAT_RATES[category];
  if (rate !== undefined) return { categoryCode: cmp(rate, '0') > 0 ? 'S' : 'Z', rate: rate as Decimal, nationalCode };
  c.warn('VAT_CATEGORY_UNKNOWN', `vatCategory ${category} has no rate in this parser's table; category code derived from the VAT amount`);
  return { categoryCode: vatAmount !== undefined && !isZero(vatAmount) ? 'S' : 'Z', nationalCode };
}

function line(c: Ctx, d: Element): Line {
  const lineNumber = c.text(d, 'm:lineNumber') ?? '';
  const net = c.dec(d, 'm:netValue');
  if (net === undefined) throw new ParseError(`Line ${lineNumber || '?'}: netValue (BT-131) missing`);
  const vatAmount = c.dec(d, 'm:vatAmount');
  const unit = c.text(d, 'm:measurementUnit');
  const comments = c.text(d, 'm:lineComments');
  const withheld = c.dec(d, 'm:withheldAmount');
  const national: Record<string, string> = {};
  for (const name of [
    'recType',
    'fuelCode',
    'invoiceDetailType',
    'withheldAmount',
    'withheldPercentCategory',
    'stampDutyAmount',
    'stampDutyPercentCategory',
    'feesAmount',
    'feesPercentCategory',
    'otherTaxesPercentCategory',
    'otherTaxesAmount',
    'deductionsAmount',
    'dienergia',
    'discountOption',
  ]) {
    const v = c.text(d, `m:${name}`);
    if (v !== undefined) national[name] = v;
  }
  recordUnmapped(
    c,
    d,
    [
      'lineNumber',
      'quantity',
      'measurementUnit',
      'netValue',
      'vatCategory',
      'vatAmount',
      'vatExemptionCategory',
      'lineComments',
      'incomeClassification',
      'expensesClassification',
      ...Object.keys(national),
    ],
    `/InvoicesDoc/invoice/invoiceDetails[${lineNumber}]`,
  );
  return {
    id: lineNumber,
    quantity: c.dec(d, 'm:quantity'),
    unitCode: unit ? UNITS[unit] : undefined,
    unitText: unit && !UNITS[unit] ? unit : undefined,
    netAmount: net,
    allowances: [],
    charges: [],
    vat: vatInfo(c, c.text(d, 'm:vatCategory'), c.text(d, 'm:vatExemptionCategory'), vatAmount),
    subjectToWithholding: withheld !== undefined && !isZero(withheld) ? true : undefined,
    national: Object.keys(national).length ? national : undefined,
    item: { name: comments ?? '', classifications: [], attributes: [] },
  };
}

/** VAT breakdown grouped by vatCategory (and exemption category), summed from the lines. */
function vatFrom(c: Ctx, details: Element[]): { vatBreakdown: VatBreakdown[] } {
  const groups = new Map<string, { net: Decimal[]; vat: Decimal[]; info: VatInfo }>();
  for (const d of details) {
    const category = c.text(d, 'm:vatCategory');
    if (!category) continue;
    const exemption = c.text(d, 'm:vatExemptionCategory');
    const vatAmount = c.dec(d, 'm:vatAmount');
    const key = `${category}|${exemption ?? ''}`;
    let g = groups.get(key);
    if (!g) {
      g = { net: [], vat: [], info: vatInfo(c, category, exemption, vatAmount)! };
      groups.set(key, g);
    }
    g.net.push(c.dec(d, 'm:netValue') ?? ('0' as Decimal));
    g.vat.push(vatAmount ?? ('0' as Decimal));
  }
  if (groups.size)
    c.derive('/vatBreakdown', 'myDATA has no VAT breakdown; grouped from invoiceDetails by vatCategory (and vatExemptionCategory)');
  else c.warn('NO_VAT_BREAKDOWN', 'No invoiceDetails with a vatCategory; no VAT breakdown');
  return {
    vatBreakdown: [...groups.values()].map(
      (g): VatBreakdown => ({
        taxableAmount: sum(g.net),
        taxAmount: sum(g.vat),
        categoryCode: g.info.categoryCode,
        rate: g.info.rate,
        exemptionReason: g.info.exemptionReason,
        nationalCode: g.info.nationalCode,
      }),
    ),
  };
}

function totalsFrom(
  c: Ctx,
  details: Element[],
  s: Element | undefined,
): { totals: Totals; withholdings: Withholding[]; otherTaxes: OtherTax[] } {
  const lineSum = (name: string) => sum(details.map((d) => c.dec(d, `m:${name}`) ?? ('0' as Decimal)));
  const net =
    c.dec(s, 'm:totalNetValue') ??
    (() => {
      c.derive('/totals/taxExclusive', 'totalNetValue absent; summed from invoiceDetails/netValue');
      return lineSum('netValue');
    })();
  const vat =
    c.dec(s, 'm:totalVatAmount') ??
    (() => {
      c.derive('/totals/vatTotal', 'totalVatAmount absent; summed from invoiceDetails/vatAmount');
      return lineSum('vatAmount');
    })();
  const taxInclusive = add(net, vat);
  c.derive('/totals/taxInclusive', 'myDATA states only totalGrossValue (the amount payable); BT-112 computed as net + VAT');
  c.derive('/totals/lineNetTotal', 'myDATA has no separate line total; totalNetValue (netValue is after line discounts)');

  const withheldTotal = c.dec(s, 'm:totalWithheldAmount') ?? lineSum('withheldAmount');
  const feesTotal = c.dec(s, 'm:totalFeesAmount') ?? lineSum('feesAmount');
  const stampTotal = c.dec(s, 'm:totalStampDutyAmount') ?? lineSum('stampDutyAmount');
  const otherTotal = c.dec(s, 'm:totalOtherTaxesAmount') ?? lineSum('otherTaxesAmount');
  const deductions = c.dec(s, 'm:totalDeductionsAmount') ?? lineSum('deductionsAmount');
  if (!isZero(deductions)) c.warn('DEDUCTIONS', `deductions of ${deductions} are part of totalGrossValue but have no canonical field`);

  let payable = c.dec(s, 'm:totalGrossValue');
  if (payable === undefined) {
    payable = sub(sub(add(add(add(taxInclusive, feesTotal), stampTotal), otherTotal), withheldTotal), deductions);
    c.derive('/totals/payable', 'totalGrossValue absent; net + VAT + fees + stamp duty + other taxes - withheld - deductions');
  }

  // Withholdings per percent category when the lines carry them, else the summary total.
  const byCategory = new Map<string, Decimal[]>();
  for (const d of details) {
    const w = c.dec(d, 'm:withheldAmount');
    if (w === undefined || isZero(w)) continue;
    const cat = c.text(d, 'm:withheldPercentCategory') ?? '';
    byCategory.set(cat, [...(byCategory.get(cat) ?? []), w]);
  }
  const withholdings: Withholding[] = byCategory.size
    ? [...byCategory].map(([cat, amounts]) => ({ scheme: 'GR:withheld', amount: sum(amounts), reasonCode: cat || undefined }))
    : !isZero(withheldTotal)
      ? [{ scheme: 'GR:withheld', amount: withheldTotal }]
      : [];

  const otherTaxes: OtherTax[] = [
    ['GR:fees', feesTotal],
    ['GR:stampDuty', stampTotal],
    ['GR:otherTaxes', otherTotal],
  ]
    .filter(([, v]) => !isZero(v as string))
    .map(([scheme, amount]) => ({ scheme: scheme as string, amount: amount as Decimal, includedInTotal: false }));

  return {
    totals: {
      lineNetTotal: net,
      taxExclusive: net,
      vatTotal: vat,
      taxInclusive,
      withholdingTotal: isZero(withheldTotal) ? undefined : withheldTotal,
      payable,
    },
    withholdings,
    otherTaxes,
  };
}

/** Income / expense classifications. Line-level ones win; the summary's repeat them or stand alone (retail). */
function classificationsOf(c: Ctx, details: Element[], s: Element | undefined): NonNullable<GrExtension['classifications']> {
  const read = (parent: Element | undefined) =>
    [...c.all(parent, 'm:incomeClassification'), ...c.all(parent, 'm:expensesClassification')].map((e) => ({
      type: c.text(e, '*:classificationType') ?? '',
      category: c.text(e, '*:classificationCategory') ?? '',
      amount: c.dec(e, '*:amount') ?? ('0' as Decimal),
    }));
  const fromLines = details.flatMap((d) => read(d));
  return fromLines.length ? fromLines : read(s);
}
