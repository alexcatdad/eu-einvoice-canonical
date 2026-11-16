/**
 * Turns what the generic rules read into a result: an `ok` canonical invoice when every EN 16931 field the
 * invoice needs was read and the arithmetic reconciles, otherwise a draft with the printed values and the problems.
 * Totals the page does not print (BT-106, BT-109, BT-112 when only their parts are printed) are computed here and
 * recorded in `source.derived`, never in `pdfProvenance`.
 */
import type { CanonicalInvoice, Decimal, IsoDate, Line, PdfRegion, SourceWarning } from '../../canonical.js';
import { checkTotals } from '../../checks.js';
import type { CountryCode, UnitCode, VatCategoryCode } from '../../codes.js';
import { abs, add, cmp, percentOf, round, sub, sum } from '../../values.js';
import type { GenericRead } from '../generic.js';
import type { InvoiceDraft, PdfExtraction, PdfExtractOptions } from '../index.js';

/** Free-text units on Swedish invoices -> UN/ECE Rec 20. */
const UNITS: Record<string, string> = {
  st: 'H87',
  'st.': 'H87',
  styck: 'H87',
  stk: 'H87',
  tim: 'HUR',
  'tim.': 'HUR',
  timmar: 'HUR',
  timme: 'HUR',
  h: 'HUR',
  dag: 'DAY',
  dagar: 'DAY',
  mån: 'MON',
  månad: 'MON',
  kg: 'KGM',
  km: 'KMT',
  m: 'MTR',
  l: 'LTR',
  liter: 'LTR',
  kwh: 'KWH',
};

export function buildExtraction(read: GenericRead, options: PdfExtractOptions): PdfExtraction {
  if (read.notAnInvoice) return { status: 'not-an-invoice', reason: read.notAnInvoice };
  const v = read.values;
  if (
    !v['/id'] &&
    !v['/totals/payable'] &&
    !read.lineCount &&
    !read.problems.some((p) => p.field === '/id' || p.field === '/totals/payable')
  )
    return { status: 'unsupported', reason: 'No invoice fields were recognised in the PDF text (layout not covered by the rules)' };
  const draft = (extra: SourceWarning[]): PdfExtraction => {
    const d: InvoiceDraft = { fields: {}, pdfProvenance: {}, problems: [...read.problems, ...extra] };
    for (const [k, { value, region }] of Object.entries(v)) {
      d.fields[k] = value;
      d.pdfProvenance[k] = region;
    }
    return { status: 'draft', draft: d };
  };
  const built = buildInvoice(read, options);
  return 'invoice' in built && !read.problems.length ? { status: 'ok', invoice: built.invoice } : draft(built.problems ?? []);
}

function buildInvoice(
  read: GenericRead,
  options: PdfExtractOptions,
): { invoice: CanonicalInvoice; problems?: undefined } | { problems: SourceWarning[] } {
  const v = read.values;
  const get = (k: string) => v[k]?.value;
  const problems: SourceWarning[] = [];
  const derived: { field: string; rule: string }[] = [];
  const need = (k: string, what: string) => {
    if (get(k) === undefined) problems.push({ code: 'missing', field: k, message: `${what} was not found` });
    return get(k) ?? '';
  };
  const derive = (field: string, rule: string) => derived.push({ field, rule });

  const id = need('/id', 'Invoice number (BT-1)');
  const issueDate = need('/issueDate', 'Invoice date (BT-2)') as IsoDate;
  const currency = need('/currency', 'Currency (BT-5)');
  const sellerName = need('/seller/name', 'Seller name (BT-27)');
  const buyerName = need('/buyer/name', 'Buyer name (BT-44)');
  const payable = need('/totals/payable', 'Amount due (BT-115)') as Decimal;
  const exemptOnly = get('/vatBreakdown/0/categoryCode') === 'E' && get('/vatBreakdown/1/categoryCode') === undefined;
  const vatTotal = (exemptOnly ? '0.00' : need('/totals/vatTotal', 'Total VAT (BT-110)')) as Decimal;
  if (exemptOnly) derived.push({ field: '/totals/vatTotal', rule: 'VAT-exempt sale (momsfri): no VAT' });
  if (!read.lineCount) problems.push({ code: 'missing', field: '/lines', message: 'No invoice lines (BG-25) were found' });

  const address = (party: '/seller' | '/buyer') => {
    const postalCode = get(`${party}/address/postalCode`);
    if (!postalCode) {
      problems.push({
        code: 'missing',
        field: `${party}/address`,
        message: `${party === '/seller' ? 'Seller' : 'Buyer'} postal address was not found`,
      });
      return undefined;
    }
    derive(`${party}/address/countryCode`, 'Swedish postal code format NNN NN on a Swedish-language invoice');
    return {
      line1: get(`${party}/address/line1`),
      line2: get(`${party}/address/line2`),
      postalCode,
      city: get(`${party}/address/city`),
      countryCode: 'SE' as CountryCode,
    };
  };
  const sellerAddress = address('/seller');
  const buyerAddress = address('/buyer');

  // Lines
  const vatRows: number[] = [];
  for (let k = 0; get(`/vatBreakdown/${k}/categoryCode`) !== undefined; k++) vatRows.push(k);
  const exempt = vatRows.length === 1 && get('/vatBreakdown/0/categoryCode') === 'E';
  const singleRate = vatRows.length === 1 ? (exempt ? '0' : get('/vatBreakdown/0/rate')) : undefined;
  const lines: Line[] = [];
  for (let i = 0; i < read.lineCount; i++) {
    const p = `/lines/${i}`;
    const netAmount = get(`${p}/netAmount`) as Decimal;
    const name = get(`${p}/item/name`);
    let quantity = get(`${p}/quantity`) as Decimal | undefined;
    let price = get(`${p}/price/net`) as Decimal | undefined;
    if (quantity === undefined && price === undefined) {
      quantity = '1' as Decimal;
      price = netAmount;
      derive(`${p}/quantity`, 'No quantity or unit price printed: one unit at the line amount');
      derive(`${p}/price/net`, 'No quantity or unit price printed: one unit at the line amount');
    }
    const unitText = get(`${p}/unitText`);
    let unitCode = unitText ? UNITS[unitText.toLowerCase()] : 'C62';
    if (!unitText) derive(`${p}/unitCode`, 'No unit printed: C62 (one)');
    if (!unitCode)
      problems.push({
        code: 'unknown-unit',
        field: `${p}/unitCode`,
        message: `Unit "${unitText}" has no UN/ECE code mapping`,
        region: v[`${p}/unitText`]?.region,
      });
    const rate = get(`${p}/vat/rate`) ?? singleRate;
    if (!get(`${p}/vat/rate`) && rate) derive(`${p}/vat/rate`, 'The invoice prints one VAT rate');
    if (!name)
      problems.push({
        code: 'missing',
        field: `${p}/item/name`,
        message: `Line ${i + 1} has no description`,
        region: v[`${p}/netAmount`]?.region,
      });
    if (quantity === undefined || price === undefined)
      problems.push({
        code: 'missing',
        field: `${p}/price/net`,
        message: `Line ${i + 1} lacks a quantity or unit price`,
        region: v[`${p}/netAmount`]?.region,
      });
    if (rate === undefined)
      problems.push({
        code: 'missing',
        field: `${p}/vat/rate`,
        message: `Line ${i + 1} has no VAT rate`,
        region: v[`${p}/netAmount`]?.region,
      });
    unitCode ??= 'C62';
    lines.push({
      id: String(i + 1),
      quantity,
      unitCode: unitCode as UnitCode,
      unitText,
      netAmount,
      allowances: [],
      charges: [],
      price: price === undefined ? undefined : { net: price },
      vat:
        rate === undefined
          ? undefined
          : { categoryCode: (exempt ? 'E' : Number(rate) > 0 ? 'S' : 'Z') as VatCategoryCode, rate: rate as Decimal },
      item: { name: name ?? '', classifications: [], attributes: [] },
    });
  }

  // Totals: printed, or the sum of their printed parts
  const lineSum = sum(lines.map((l) => l.netAmount));
  let lineNetTotal = get('/totals/lineNetTotal') as Decimal | undefined;
  if (lineNetTotal === undefined) {
    lineNetTotal = lineSum;
    derive('/totals/lineNetTotal', 'Sum of line net amounts (BR-CO-10)');
  }
  const allowanceTotal = get('/totals/allowanceTotal') as Decimal | undefined;
  const chargeTotal = get('/totals/chargeTotal') as Decimal | undefined;
  let taxExclusive = get('/totals/taxExclusive') as Decimal | undefined;
  if (taxExclusive === undefined) {
    taxExclusive = add(sub(lineNetTotal, allowanceTotal ?? '0'), chargeTotal ?? '0');
    derive('/totals/taxExclusive', 'BT-106 - BT-107 + BT-108 (BR-CO-13)');
  }
  let taxInclusive = get('/totals/taxInclusive') as Decimal | undefined;
  if (taxInclusive === undefined && vatTotal) {
    taxInclusive = add(taxExclusive, vatTotal);
    derive('/totals/taxInclusive', 'BT-109 + BT-110 (BR-CO-15)');
  }

  // VAT breakdown
  if (!vatRows.length) problems.push({ code: 'missing', field: '/vatBreakdown', message: 'VAT breakdown (BG-23) was not found' });
  const vatBreakdown = vatRows.map((k) => {
    const p = `/vatBreakdown/${k}`;
    let taxableAmount = get(`${p}/taxableAmount`) as Decimal | undefined;
    if (taxableAmount === undefined && vatRows.length === 1) {
      taxableAmount = taxExclusive;
      derive(`${p}/taxableAmount`, 'One VAT rate: the taxable amount is BT-109');
    }
    const isExempt = get(`${p}/categoryCode`) === 'E';
    const taxAmount = (isExempt ? '0.00' : get(`${p}/taxAmount`)) as Decimal | undefined;
    if (isExempt) derive(`${p}/taxAmount`, 'VAT-exempt sale (momsfri): no VAT, rate 0');
    if (taxableAmount === undefined || taxAmount === undefined)
      problems.push({
        code: 'missing',
        field: p,
        message: `VAT breakdown row ${k + 1} lacks its taxable or VAT amount`,
        region: v[`${p}/rate`]?.region,
      });
    return {
      taxableAmount: taxableAmount as Decimal,
      taxAmount: taxAmount as Decimal,
      categoryCode: get(`${p}/categoryCode`) as VatCategoryCode,
      rate: (isExempt ? '0' : get(`${p}/rate`)) as Decimal,
      exemptionReason: get(`${p}/exemptionReason`),
    };
  });
  if ((chargeTotal || allowanceTotal) && !singleRate)
    problems.push({
      code: 'missing',
      field: '/charges',
      message: 'Document-level fee or discount with several VAT rates: its VAT rate is not printed',
    });

  if (problems.length) return { problems };
  const charges = chargeTotal && cmp(chargeTotal, '0') !== 0 ? [{ amount: chargeTotal, reason: 'Avgift', vat: lines[0]?.vat }] : [];
  const allowances =
    allowanceTotal && cmp(allowanceTotal, '0') !== 0 ? [{ amount: allowanceTotal, reason: 'Rabatt', vat: lines[0]?.vat }] : [];
  const transfers = [0, 1, 2].flatMap((k) => {
    const accountId = get(`/payments/0/creditTransfers/${k}/accountId`);
    return accountId ? [{ accountId, serviceProviderId: get(`/payments/0/creditTransfers/${k}/serviceProviderId`) }] : [];
  });
  if (transfers.length) derive('/payments/0/meansCode', 'Bankgiro, Plusgiro or IBAN printed: credit transfer (30)');
  const orgNumber = get('/seller/legalRegistrationId/value');
  if (orgNumber) derive('/seller/endpoint', 'Organisation number as Peppol endpoint (scheme 0007)');
  const note = get('/notes/0/text');

  const invoice: CanonicalInvoice = {
    kind: get('/typeCode') === '381' ? 'creditNote' : 'invoice',
    typeCode: (get('/typeCode') ?? '380') as never,
    id,
    issueDate,
    selfBilled: false,
    currency: currency as CanonicalInvoice['currency'],
    dueDate: get('/dueDate') as IsoDate | undefined,
    notes: note ? [{ text: note }] : [],
    specificationId: '',
    precedingInvoices: [],
    seller: {
      name: sellerName,
      identifiers: [],
      legalRegistrationId: orgNumber ? { value: orgNumber, schemeId: '0007' } : undefined,
      vatId: get('/seller/vatId'),
      taxRegistrationId: get('/seller/taxRegistrationId'),
      nationalTaxIds: [],
      endpoint: orgNumber ? { value: orgNumber, schemeId: '0007' } : undefined,
      address: sellerAddress,
    },
    buyer: { name: buyerName, identifiers: [], nationalTaxIds: [], address: buyerAddress },
    additionalParties: [],
    payments: transfers.length
      ? [
          {
            meansCode: '30' as never,
            remittanceInformation: get('/payments/0/remittanceInformation'),
            creditTransfers: transfers.map((t) => ({ accountId: t.accountId, serviceProviderId: t.serviceProviderId })),
          },
        ]
      : [],
    paymentSchedule: [],
    allowances,
    charges,
    totals: {
      lineNetTotal,
      allowanceTotal,
      chargeTotal,
      taxExclusive,
      vatTotal,
      taxInclusive: taxInclusive as Decimal,
      prepaid: get('/totals/prepaid') as Decimal | undefined,
      rounding: get('/totals/rounding') as Decimal | undefined,
      payable,
    },
    vatBreakdown,
    otherTaxes: [],
    withholdings: [],
    attachments: [],
    lines,
    clearance: [],
    extensions: {},
    source: {
      format: 'pdf-text',
      syntaxDocumentType: 'PDF',
      rootNamespace: '',
      envelope: [],
      fileSha256: options.fileSha256,
      payloadSha256: options.fileSha256,
      ...(options.filename ? { filename: options.filename } : {}),
      signatures: [],
      unmapped: {},
      derived,
      valueOrigins: Object.fromEntries([...Object.keys(v).map((k) => [k, 'source']), ...derived.map((d) => [d.field, 'derived'])]),
      pdfProvenance: Object.fromEntries(Object.entries(v).map(([k, r]) => [k, r.region])) as Record<string, PdfRegion>,
      warnings: [],
    },
  };
  const mismatch = reconcile(invoice, lineSum);
  return mismatch.length ? { problems: mismatch } : { invoice };
}

/** EN 16931 calculation rules plus the VAT breakdown arithmetic; each failure is a problem. */
function reconcile(inv: CanonicalInvoice, lineSum: Decimal): SourceWarning[] {
  const out: SourceWarning[] = checkTotals(inv).map((f) => ({
    code: 'not-reconciling',
    field: f.path,
    message: `${f.message} [${f.code}]`,
  }));
  if (cmp(round(lineSum), round(inv.totals.lineNetTotal)) !== 0 && !out.some((p) => p.field === '/totals/lineNetTotal'))
    out.push({
      code: 'not-reconciling',
      field: '/totals/lineNetTotal',
      message: `Sum of line net amounts is ${lineSum}, printed ${inv.totals.lineNetTotal}`,
    });
  for (const [i, b] of inv.vatBreakdown.entries()) {
    const tax = round(percentOf(b.taxableAmount, b.rate ?? '0'));
    if (cmp(abs(sub(tax, b.taxAmount)), '0.01') > 0)
      out.push({
        code: 'not-reconciling',
        field: `/vatBreakdown/${i}/taxAmount`,
        message: `VAT ${b.taxAmount} is not ${b.rate} % of ${b.taxableAmount} (${tax})`,
      });
  }
  const taxableSum = sum(inv.vatBreakdown.map((b) => b.taxableAmount));
  if (cmp(round(taxableSum), round(inv.totals.taxExclusive)) !== 0)
    out.push({
      code: 'not-reconciling',
      field: '/vatBreakdown',
      message: `VAT breakdown taxable amounts add up to ${taxableSum}, total without VAT is ${inv.totals.taxExclusive}`,
    });
  return out;
}
