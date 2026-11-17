/**
 * Turns what the generic rules read into a result: an `ok` canonical invoice when every EN 16931 field the
 * invoice needs was read and the arithmetic reconciles, otherwise a draft with the printed values and the problems.
 * Totals the page does not print (BT-106, BT-109, BT-112 when only their parts are printed) are computed here and
 * recorded in `source.derived`, never in `pdfProvenance`.
 */
import type { CanonicalInvoice, Decimal, IsoDate, Line, PdfRegion, SourceWarning } from '../../canonical.js';
import { checkTotals } from '../../checks.js';
import type { CountryCode, UnitCode, VatCategoryCode } from '../../codes.js';
import { abs, add, cmp, neg, percentOf, round, sign, sub, sum } from '../../values.js';
import type { GenericRead } from '../generic.js';
import type { InvoiceDraft, PdfExtraction, PdfExtractOptions } from '../index.js';
import { parseSeVatNumber } from '../se/index.js';

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
  dygn: 'DAY',
  fp: 'XPK',
  förp: 'XPK',
  förpackning: 'XPK',
  mån: 'MON',
  månad: 'MON',
  kg: 'KGM',
  km: 'KMT',
  m: 'MTR',
  l: 'LTR',
  liter: 'LTR',
  kwh: 'KWH',
  // UN/ECE Rec 20 codes printed as they are, as Peppol viewers do
  ea: 'EA',
  h87: 'H87',
  c62: 'C62',
  hur: 'HUR',
  day: 'DAY',
  mon: 'MON',
};

/** VAT categories without VAT, and why the VAT amount is 0. */
const NO_VAT: Record<string, string> = {
  E: 'VAT-exempt sale (momsfri): no VAT',
  AE: 'Reverse charge (omvänd betalningsskyldighet): no VAT charged by the seller',
};

export function buildExtraction(printed: GenericRead, options: PdfExtractOptions): PdfExtraction {
  if (printed.notAnInvoice) return { status: 'not-an-invoice', reason: printed.notAnInvoice };
  const read = creditNoteMagnitudes(printed);
  const v = read.values;
  if (
    !v['/id'] &&
    !v['/totals/payable'] &&
    !read.lineCount &&
    !read.problems.some((p) => p.field === '/id' || p.field === '/totals/payable')
  )
    return { status: 'unsupported', reason: 'No invoice fields were recognised in the PDF text (layout not covered by the rules)' };
  const draft = (extra: SourceWarning[]): PdfExtraction => {
    const d: InvoiceDraft = {
      fields: {},
      pdfProvenance: {},
      problems: [...read.problems, ...extra, ...read.warnings],
      ...(read.unmappedText ? { unmappedText: read.unmappedText } : {}),
    };
    for (const [k, { value, region }] of Object.entries(v)) {
      d.fields[k] = value;
      d.pdfProvenance[k] = region;
    }
    return { status: 'draft', draft: d };
  };
  const built = buildInvoice(read, options);
  return 'invoice' in built && !read.problems.length ? { status: 'ok', invoice: built.invoice } : draft(built.problems ?? []);
}

const CREDIT_NOTE_RULE =
  'Credit note printed with negative amounts: amounts and quantities negated, so the credit note carries positive magnitudes';
const SIGNED = /^\/(?:totals\/\w+|vatBreakdown\/\d+\/(?:taxableAmount|taxAmount)|lines\/\d+\/netAmount)$/u;

/**
 * A kreditfaktura (381) printed with a negative total: amounts and quantities are negated so the credit note carries
 * positive magnitudes, as `effectiveSign()` and the XML parsers expect. Unit prices stay positive (BR-27): a line
 * printed with a negative price keeps its quantity, otherwise the quantity is negated, so quantity × price = amount.
 */
function creditNoteMagnitudes(read: GenericRead): GenericRead {
  const v = read.values;
  const total = v['/totals/payable']?.value ?? v['/totals/taxInclusive']?.value;
  if (v['/typeCode']?.value !== '381' || total === undefined || sign(total) >= 0) return read;
  const values = { ...v };
  for (const [k, rv] of Object.entries(v)) {
    if (SIGNED.test(k)) values[k] = { ...rv, value: neg(rv.value) };
    const line = /^\/lines\/(\d+)\/quantity$/u.exec(k);
    const price = line && v[`/lines/${line[1]}/price/net`];
    if (line && !(price && sign(price.value) < 0)) values[k] = { ...rv, value: neg(rv.value) };
    if (k.endsWith('/price/net') && sign(rv.value) < 0) values[k] = { ...rv, value: abs(rv.value) };
  }
  return { ...read, values, flipped: true };
}

function buildInvoice(
  read: GenericRead,
  options: PdfExtractOptions,
): { invoice: CanonicalInvoice; problems?: undefined } | { problems: SourceWarning[] } {
  const v = read.values;
  // A rule layer's default stands only where no value was read, and is recorded as derived
  const defaults = Object.entries(read.defaults ?? {}).filter(([k]) => !v[k]);
  const get = (k: string) => v[k]?.value ?? read.defaults?.[k]?.value;
  const problems: SourceWarning[] = [];
  const derived: { field: string; rule: string }[] = defaults.map(([field, d]) => ({ field, rule: d.rule }));
  if (read.flipped) derived.push({ field: '/totals', rule: CREDIT_NOTE_RULE });
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
  const exemptOnly = NO_VAT[get('/vatBreakdown/0/categoryCode') ?? ''] !== undefined && get('/vatBreakdown/1/categoryCode') === undefined;
  const vatTotal = (exemptOnly ? (get('/totals/vatTotal') ?? '0.00') : need('/totals/vatTotal', 'Total VAT (BT-110)')) as Decimal;
  if (exemptOnly && !get('/totals/vatTotal'))
    derived.push({ field: '/totals/vatTotal', rule: NO_VAT[get('/vatBreakdown/0/categoryCode')!] });
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
    if (!v[`${party}/address/countryCode`])
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
  const exempt = vatRows.length === 1 && exemptOnly;
  // A zero-rate line is in the exempt (E) or reverse-charge (AE) category the breakdown names, else zero-rated (Z)
  const zeroCategory = vatRows.map((k) => get(`/vatBreakdown/${k}/categoryCode`)).find((c) => NO_VAT[c ?? ''] !== undefined);
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
      note: get(`${p}/note`),
      quantity,
      unitCode: unitCode as UnitCode,
      unitText,
      netAmount,
      allowances: [],
      charges: get(`${p}/charges/0/amount`)
        ? [{ amount: get(`${p}/charges/0/amount`) as Decimal, reason: get(`${p}/charges/0/reason`) }]
        : [],
      price: price === undefined ? undefined : { net: price },
      vat:
        rate === undefined
          ? undefined
          : { categoryCode: (Number(rate) > 0 ? 'S' : (zeroCategory ?? 'Z')) as VatCategoryCode, rate: rate as Decimal },
      item: { name: name ?? '', sellerId: get(`${p}/item/sellerId`), classifications: [], attributes: [] },
      ...(get(`${p}/orderLineRef`) ? { orderLineRef: get(`${p}/orderLineRef`) } : {}),
      ...(get(`${p}/national/orderReference`) ? { national: { orderReference: get(`${p}/national/orderReference`)! } } : {}),
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
    const category = get(`${p}/categoryCode`) ?? '';
    const isExempt = NO_VAT[category] !== undefined;
    const taxAmount = (get(`${p}/taxAmount`) ?? (isExempt ? '0.00' : undefined)) as Decimal | undefined;
    if (isExempt && !get(`${p}/taxAmount`)) derive(`${p}/taxAmount`, NO_VAT[category]);
    if (category === 'AE') derive(`${p}/exemptionReasonCode`, 'Reverse charge (AE): VATEX-EU-AE');
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
      ...(category === 'AE' ? { exemptionReasonCode: 'VATEX-EU-AE' } : {}),
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
  const meansCode = get('/payments/0/meansCode') ?? '30';
  // Without an account there is no payment instruction for a means code default to describe
  if (!transfers.length) derived.splice(0, derived.length, ...derived.filter((d) => d.field !== '/payments/0/meansCode'));
  if (transfers.length && !v['/payments/0/meansCode'] && !defaults.some(([k]) => k === '/payments/0/meansCode'))
    derive('/payments/0/meansCode', 'Bankgiro, Plusgiro or IBAN printed: credit transfer (30)');
  const orgNumber = get('/seller/legalRegistrationId/value');
  // BT-34 (Peppol R020): the printed org.nr, else the org.nr inside a seller SE VAT number that passes its check digits
  const vat = parseSeVatNumber(get('/seller/vatId') ?? '');
  // A printed electronic address ("Säljarens PEPPOL-ID: ... [0007]") wins over one derived from the org.nr or VAT number
  const printedEndpoint = (party: '/seller' | '/buyer') => {
    const value = get(`${party}/endpoint/value`);
    const schemeId = get(`${party}/endpoint/schemeId`);
    return value && schemeId ? { value, schemeId } : undefined;
  };
  const endpointId = orgNumber ?? (vat?.kind === 'organisation' ? vat.orgNumber.replace('-', '') : undefined);
  const printedSeller = printedEndpoint('/seller');
  const sellerEndpoint = printedSeller ?? (endpointId ? { value: endpointId, schemeId: '0007' } : undefined);
  if (!printedSeller && orgNumber) derive('/seller/endpoint', 'Organisation number as Peppol endpoint (scheme 0007)');
  else if (!printedSeller && endpointId)
    derive('/seller/endpoint', 'Organisation number from the seller SE VAT number (SE + org.nr + 01) as Peppol endpoint (scheme 0007)');
  const notes = [0, 1].flatMap((k) => (get(`/notes/${k}/text`) ? [{ text: get(`/notes/${k}/text`)! }] : []));

  const identifiers = (party: '/seller' | '/buyer') =>
    [0, 1, 2, 3].flatMap((k) => {
      const value = get(`${party}/identifiers/${k}/value`);
      const schemeId = get(`${party}/identifiers/${k}/schemeId`);
      return value ? [schemeId ? { value, schemeId } : { value }] : [];
    });
  const contact = (party: '/seller' | '/buyer') => {
    const c = { name: get(`${party}/contact/name`), phone: get(`${party}/contact/phone`), email: get(`${party}/contact/email`) };
    return c.name || c.phone || c.email ? c : undefined;
  };
  const invoice: CanonicalInvoice = {
    kind: get('/typeCode') === '381' ? 'creditNote' : 'invoice',
    typeCode: (get('/typeCode') ?? '380') as never,
    id,
    issueDate,
    selfBilled: false,
    currency: currency as CanonicalInvoice['currency'],
    dueDate: get('/dueDate') as IsoDate | undefined,
    notes,
    paymentTerms: get('/paymentTerms'),
    specificationId: '',
    precedingInvoices: [],
    seller: {
      name: sellerName,
      identifiers: identifiers('/seller'),
      legalRegistrationId: orgNumber ? { value: orgNumber, schemeId: '0007' } : undefined,
      vatId: get('/seller/vatId'),
      taxRegistrationId: get('/seller/taxRegistrationId'),
      nationalTaxIds: [],
      endpoint: sellerEndpoint,
      address: sellerAddress,
      additionalLegalInfo: get('/seller/additionalLegalInfo'),
      contact: contact('/seller'),
    },
    buyer: {
      name: buyerName,
      identifiers: identifiers('/buyer'),
      legalRegistrationId: get('/buyer/legalRegistrationId/value')
        ? { value: get('/buyer/legalRegistrationId/value')!, schemeId: '0007' }
        : undefined,
      vatId: get('/buyer/vatId'),
      nationalTaxIds: [],
      endpoint: printedEndpoint('/buyer'),
      address: buyerAddress,
      contact: contact('/buyer'),
    },
    buyerReference: get('/buyerReference'),
    accountingRef: get('/accountingRef'),
    purchaseOrderRef: get('/purchaseOrderRef'),
    ...(get('/invoicedObjectId/value') ? { invoicedObjectId: { value: get('/invoicedObjectId/value')! } } : {}),
    additionalParties: [],
    payments: transfers.length
      ? [
          {
            meansCode: meansCode as never,
            meansText: get('/payments/0/meansText'),
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
    // Supporting documents printed as references only (BG-24 without content)
    attachments: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((k) =>
      get(`/attachments/${k}/id`)
        ? [{ kind: 'reference' as const, id: get(`/attachments/${k}/id`)!, description: get(`/attachments/${k}/description`) }]
        : [],
    ),
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
      ...(read.unmappedText ? { unmappedText: read.unmappedText } : {}),
      warnings: read.warnings,
    },
  };
  const mismatch = reconcile(invoice, lineSum);
  return mismatch.length ? { problems: mismatch } : { invoice };
}

/**
 * EN 16931 calculation rules plus the VAT breakdown arithmetic; each failure is a problem, placed at the printed value
 * it names (or the first printed value under it), else at the printed amount due.
 */
function reconcile(inv: CanonicalInvoice, lineSum: Decimal): SourceWarning[] {
  const printed = Object.entries(inv.source.pdfProvenance ?? {});
  const at = (field: string | undefined) => {
    const region =
      printed.find(([k]) => k === field)?.[1] ??
      printed.find(([k]) => k.startsWith(`${field}/`))?.[1] ??
      inv.source.pdfProvenance?.['/totals/payable'];
    return { code: 'not-reconciling', field, ...(region ? { region } : {}) };
  };
  const out: SourceWarning[] = checkTotals(inv).map((f) => ({ ...at(f.path), message: `${f.message} [${f.code}]` }));
  if (cmp(round(lineSum), round(inv.totals.lineNetTotal)) !== 0 && !out.some((p) => p.field === '/totals/lineNetTotal'))
    out.push({ ...at('/totals/lineNetTotal'), message: `Sum of line net amounts is ${lineSum}, printed ${inv.totals.lineNetTotal}` });
  for (const [i, b] of inv.vatBreakdown.entries()) {
    const tax = round(percentOf(b.taxableAmount, b.rate ?? '0'));
    if (cmp(abs(sub(tax, b.taxAmount)), '0.01') > 0)
      out.push({ ...at(`/vatBreakdown/${i}/taxAmount`), message: `VAT ${b.taxAmount} is not ${b.rate} % of ${b.taxableAmount} (${tax})` });
  }
  const taxableSum = sum(inv.vatBreakdown.map((b) => b.taxableAmount));
  if (cmp(round(taxableSum), round(inv.totals.taxExclusive)) !== 0)
    out.push({
      ...at('/vatBreakdown'),
      message: `VAT breakdown taxable amounts add up to ${taxableSum}, total without VAT is ${inv.totals.taxExclusive}`,
    });
  return out;
}
