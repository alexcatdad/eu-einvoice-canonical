/**
 * Svefaktura 1.0 (SFTI BasicInvoice, UBL 1.0 based) -> canonical, following SFTI's
 * "Mapping of Svefaktura 1.0 onto EN 16931-1".
 *
 * Elements are matched by local name in any namespace: Svefaktura mixes the document
 * namespace, the SFTI aggregate namespace and the UBL 1.0 basic namespace on sibling
 * elements, and real senders do not always place them correctly.
 *
 * EN-mandatory data Svefaktura can omit (quantity, price, line VAT, country, endpoint)
 * stays absent. The only values filled in are the ones SFTI's guide prescribes, and
 * each of them is recorded in `source.derived`.
 */
import type { Element } from '@xmldom/xmldom';
import type {
  Address,
  AllowanceCharge,
  Attachment,
  CanonicalInvoice,
  Contact,
  CreditTransfer,
  Identifier,
  Line,
  Party,
  PaymentInstructions,
  Period,
  Seller,
  Totals,
  VatBreakdown,
  VatInfo,
} from '../canonical.js';
import { add, isZero, sub, sum } from '../values.js';
import { CREDIT_TYPE_CODES, Ctx, finish, need, ParseError, parseXml, type Scope, sourceMeta } from './context.js';
import type { ParseInput } from './index.js';

/** BT-24 is absent in Svefaktura; the canonical model gets the root namespace, and `source.format` keeps the true origin. */
const SPEC_ID = 'urn:sfti:documents:BasicInvoice:1:0';
/** Svefaktura bank identifiers for Swedish giro systems -> Peppol BT-86 values (SE-R-011). */
const GIRO: Record<string, string> = { BGABSESS: 'SE:BANKGIRO', PGSISESS: 'SE:PLUSGIRO' };
/** Free-text units seen in Swedish invoices -> UN/ECE Rec 20. The source text is always kept in `unitText`. */
const UNITS: Record<string, string> = {
  st: 'H87',
  'st.': 'H87',
  styck: 'H87',
  pcs: 'H87',
  ea: 'H87',
  tim: 'HUR',
  'tim.': 'HUR',
  h: 'HUR',
  timme: 'HUR',
  timmar: 'HUR',
  dag: 'DAY',
  dagar: 'DAY',
  mån: 'MON',
  månad: 'MON',
  kg: 'KGM',
  l: 'LTR',
  liter: 'LTR',
  m: 'MTR',
  km: 'KMT',
  m2: 'MTK',
  'm²': 'MTK',
  m3: 'MTQ',
  'm³': 'MTQ',
  kwh: 'KWH',
  år: 'ANN',
};

export function parseSvefaktura(input: ParseInput): CanonicalInvoice[] {
  const root = parseXml(input.payload.xml);
  const c = new Ctx({}, input.provenance);
  const s = c.in('');

  const id = s.text(root, 'ID', 'id');
  const issueDate = s.date(root, 'IssueDate', 'BT-2', 'issueDate');
  if (!id || !issueDate) throw new ParseError('Invoice number (BT-1) or issue date (BT-2) missing');
  let typeCode = s.text(root, 'InvoiceTypeCode', 'typeCode');
  if (!typeCode) {
    typeCode = '380';
    c.derive('/typeCode', 'No InvoiceTypeCode in the document; defaulted to 380', 'defaulted');
  }

  const legal = c.el(root, 'LegalTotal');
  if (!legal) throw new ParseError('LegalTotal missing');
  let currency = s.text(root, 'InvoiceCurrencyCode', 'currency');
  if (!currency) {
    currency = s.attr(legal, 'TaxInclusiveTotalAmount', 'amountCurrencyID', 'currency');
    if (!currency) throw new ParseError('No currency: InvoiceCurrencyCode and amountCurrencyID both missing');
    c.derive('/currency', 'InvoiceCurrencyCode absent; taken from LegalTotal/TaxInclusiveTotalAmount/@amountCurrencyID (SFTI)');
  }

  const docRefs = c.all(root, 'AdditionalDocumentReference');
  const refScheme = (r: Element) => c.attr(r, 'ID', 'identificationSchemeID');
  const refsOf = (scheme: string) => docRefs.filter((r) => refScheme(r) === scheme);
  const requisitions = c.all(root, 'RequisitionistDocumentReference').map((r) => c.el(r, 'ID'));

  const sellerParty = c.el(root, 'SellerParty');
  const sellerEl = c.el(sellerParty, 'Party');
  const seller = party(c, sellerEl, s.in('seller'), true) as Seller;
  const accounts = c.el(sellerParty, 'AccountsContact');
  if (accounts) seller.contact = contacts(c, [c.el(sellerEl, 'Contact'), accounts], s.in('seller').in('contact'));

  const lines = c.all(root, 'InvoiceLine').map((l, i) => line(c, l, s.in('lines').in(i)));
  const count = c.text(root, 'LineItemCountNumeric');
  if (count !== undefined && Number(count) !== lines.length)
    c.warn('SF-LINECOUNT', `LineItemCountNumeric is ${count} but the invoice has ${lines.length} lines`);

  const allowances = allowanceCharges(c, root, false, s.in('allowances'));
  const charges = allowanceCharges(c, root, true, s.in('charges'));
  const { totals, vatBreakdown } = totalsAndVat(c, root, legal, lines, allowances, charges, s);
  deriveLineVat(c, lines, vatBreakdown);

  // Order references live on the lines; BT-13 only when every line names the same order (SFTI).
  const orderEls = c.all(root, 'InvoiceLine/OrderLineReference/OrderReference/BuyersID');
  const orders = [...new Set(orderEls.map((e) => c.text(e)).filter(Boolean))];
  if (orders.length > 1) c.warn('SF-ORDERS', `Lines reference ${orders.length} different orders; BT-13 left empty`);
  if (orders.length === 1)
    c.mark(
      s.path('purchaseOrderRef'),
      orderEls.find((e) => c.text(e) === orders[0]),
    );

  const payments = paymentInstructions(c, root, s.in('payments'));
  const dueDates = [
    ...new Set(
      c
        .all(root, 'PaymentMeans')
        .map((pm) => c.date(pm, 'DuePaymentDate', 'BT-9'))
        .filter(Boolean),
    ),
  ];
  if (dueDates.length > 1)
    c.warn('SF-DUEDATE-CONFLICT', `PaymentMeans give different due dates: ${dueDates.join(', ')}; the first is used`);
  c.mark(
    s.path('dueDate'),
    c
      .all(root, 'PaymentMeans')
      .map((pm) => c.el(pm, 'DuePaymentDate'))
      .find((e) => c.text(e)),
  );

  const terms = c.el(root, 'PaymentTerms');
  const penalty = c.text(terms, 'PenaltySurchargePercent');
  const termsNote = c.text(terms, 'Note');
  const paymentTerms = [termsNote, penalty ? `Dröjsmålsränta ${penalty} %` : undefined].filter(Boolean).join('\n') || undefined;
  // With a penalty the text is composed here, so only a plain note maps to a node.
  if (!penalty) c.mark(s.path('paymentTerms'), c.el(terms, 'Note'));

  const objectRef = refsOf('ACD')[0];
  const deliveryEl = c.el(root, 'Delivery');
  const telefax = c.text(sellerParty, 'Party/Contact/Telefax');
  if (telefax) c.unmapped['/Invoice/SellerParty/Party/Contact/Telefax'] = telefax;
  const exchangeRate = c.el(root, 'ExchangeRate');
  if (exchangeRate) c.unmapped['/Invoice/ExchangeRate'] = (exchangeRate.textContent ?? '').replace(/\s+/g, ' ').trim();
  const specialTerms = c.text(root, 'DeliveryTerms/SpecialTerms');
  if (specialTerms) c.unmapped['/Invoice/DeliveryTerms/SpecialTerms'] = specialTerms;

  const payeeName = s.text(root, 'PaymentMeans/PayeePartyName/Name', 'payee/name');
  const d = s.in('delivery');
  const inv = {
    kind: CREDIT_TYPE_CODES.has(typeCode) ? 'creditNote' : 'invoice',
    typeCode,
    id,
    issueDate,
    selfBilled: false,
    currency,
    taxCurrency: s.text(root, 'TaxCurrencyCode', 'taxCurrency'),
    taxPointDate: s.date(root, 'TaxPointDate', 'BT-7', 'taxPointDate'),
    dueDate: dueDates[0],
    buyerReference: s.text(requisitions[0], undefined, 'buyerReference'),
    contractRef: s.text(refsOf('CT')[0], 'ID', 'contractRef'),
    purchaseOrderRef: orders.length === 1 ? orders[0] : undefined,
    despatchAdviceRef: s.text(refsOf('DQ')[0], 'ID', 'despatchAdviceRef'),
    invoicedObjectId: objectRef ? { value: s.text(objectRef, 'ID', 'invoicedObjectId/value') ?? '' } : undefined,
    accountingRef: s.text(requisitions[1], undefined, 'accountingRef'),
    paymentTerms,
    notes: c.nonEmpty(c.all(root, 'Note')).map((e, i) => ({ text: s.text(e, undefined, `notes/${i}/text`) ?? '' })),
    specificationId: SPEC_ID,
    precedingInvoices: c
      .all(root, 'InitialInvoiceDocumentReference')
      .map((r, i) => ({ id: s.text(r, 'ID', `precedingInvoices/${i}/id`) ?? '' })),
    invoicePeriod: period(c, c.el(root, 'InvoicingPeriod'), s.in('invoicePeriod')),
    seller,
    buyer: party(c, c.el(root, 'BuyerParty/Party'), s.in('buyer'), false),
    payee: payeeName ? { name: payeeName } : undefined,
    additionalParties: [],
    delivery: deliveryEl
      ? {
          actualDate: d.date(deliveryEl, 'ActualDeliveryDateTime', 'BT-72', 'actualDate'),
          locationId: gln(c, c.el(deliveryEl, 'DeliveryAddress/ID'), d.path('locationId')),
          address: address(c, c.el(deliveryEl, 'DeliveryAddress'), d.in('address')),
        }
      : undefined,
    payments,
    paymentSchedule: [],
    allowances,
    charges,
    totals,
    vatBreakdown,
    otherTaxes: [],
    withholdings: [],
    attachments: refsOf('ATS').map((r, i) => attachment(c, r, s.in('attachments').in(i))),
    lines,
    clearance: [],
    extensions: {},
    source: sourceMeta(input, root, c),
  } as CanonicalInvoice;
  return [finish(inv)];
}

/** GLN identifiers carry identificationSchemeAgencyID="9" (GS1) -> ICD 0088. `bind` is the canonical path of the identifier. */
function gln(c: Ctx, e: Element | undefined, bind?: string): Identifier | undefined {
  const value = c.text(e, undefined, bind && `${bind}/value`);
  if (!value) return undefined;
  const agency = c.attr(e, undefined, 'identificationSchemeAgencyID');
  const scheme = c.attr(e, undefined, 'identificationSchemeID');
  if (agency === '9' || scheme === 'GLN') return { value, schemeId: '0088' };
  if (!scheme) return { value };
  c.mark(bind && `${bind}/schemeId`, e, 'identificationSchemeID');
  return { value, schemeId: scheme };
}

/** GS1 item identifiers are GTINs -> ICD 0160 (SFTI's guide says 0088, which is the GLN scheme for parties and locations). */
function gtin(c: Ctx, e: Element | undefined, bind?: string): Identifier | undefined {
  const value = c.text(e, undefined, bind && `${bind}/value`);
  if (!value) return undefined;
  return c.attr(e, undefined, 'identificationSchemeAgencyID') === '9' ? { value, schemeId: '0160' } : { value };
}

function party(c: Ctx, p: Element | undefined, s: Scope, isSeller: boolean): Party {
  const schemes = c.all(p, 'PartyTaxScheme');
  const byTax = (code: string) => schemes.find((t) => c.text(t, 'TaxScheme/ID') === code);
  const vat = byTax('VAT');
  const swt = byTax('SWT');
  const regEl = [c.el(swt, 'RegistrationName'), c.el(vat, 'RegistrationName')].find((e) => c.text(e));
  const partyNameEl = c.el(p, 'PartyName/Name');
  const regName = c.text(regEl);
  const partyName = c.text(partyNameEl);
  const orgEl = c.el(swt, 'CompanyID');
  const orgNr = c.text(orgEl);
  if (orgNr) c.mark(s.path('legalRegistrationId/value'), orgEl);
  const out: Party & Partial<Seller> = {
    name: s.text(regEl, undefined, 'name') ?? s.text(partyNameEl, undefined, 'name'),
    tradingName: regName && partyName && partyName !== regName ? s.text(partyNameEl, undefined, 'tradingName') : undefined,
    identifiers: c.nonEmpty(c.all(p, 'PartyIdentification/ID')).flatMap((e, i) => gln(c, e, s.path(`identifiers/${i}`)) ?? []),
    legalRegistrationId: orgNr ? { value: orgNr, schemeId: '0007' } : undefined,
    vatId: s.text(vat, 'CompanyID', 'vatId'),
    nationalTaxIds: [],
    address: address(c, c.el(p, 'Address'), s.in('address')),
    contact: contacts(c, [c.el(p, 'Contact')], s.in('contact')),
  };
  if (isSeller) {
    const fSkattEl = c.el(swt, 'ExemptionReason');
    const fSkatt = c.text(fSkattEl);
    out.taxRegistrationId = fSkatt && /f-skatt/i.test(fSkatt) ? 'Godkänd för F-skatt' : fSkatt;
    if (fSkatt && !/f-skatt/i.test(fSkatt)) c.mark(s.path('taxRegistrationId'), fSkattEl);
    const seat = c.text(swt, 'RegistrationAddress/CityName');
    out.additionalLegalInfo = seat ? `Säte ${seat}` : undefined;
  }
  return out;
}

function address(c: Ctx, a: Element | undefined, s: Scope): Address | undefined {
  if (!a) return undefined;
  const extra = [c.el(a, 'Department'), ...c.all(a, 'AddressLine/Line')].filter((e): e is Element => !!e && !!c.text(e));
  c.markAll(s.path('line3'), extra);
  return {
    line1: s.text(a, 'StreetName', 'line1'),
    line2: s.text(a, 'Postbox', 'line2'),
    line3: extra.map((e) => c.text(e)).join(', ') || undefined,
    city: s.text(a, 'CityName', 'city'),
    postalCode: s.text(a, 'PostalZone', 'postalCode'),
    countrySubdivision: s.text(a, 'CountrySubentity', 'countrySubdivision'),
    countryCode: s.text(a, 'Country/IdentificationCode', 'countryCode'),
  };
}

/**
 * Contact from one element, or from several whose values SFTI joins with a comma (the
 * party contact and the seller's AccountsContact); equal values are kept once.
 */
function contacts(c: Ctx, els: (Element | undefined)[], s: Scope): Contact | undefined {
  const present = els.filter((e): e is Element => !!e);
  if (!present.length) return undefined;
  const field = (path: string, key: string) => {
    const found = present.map((e) => c.el(e, path)).filter((e): e is Element => !!e && !!c.text(e));
    if (!found.length) return undefined;
    const values = found.map((e) => c.text(e)!);
    if (values.length === 2 && values[0] === values[1]) {
      c.mark(s.path(key), found[0]);
      return values[0];
    }
    c.markAll(s.path(key), found);
    return values.join(', ');
  };
  return { name: field('Name', 'name'), phone: field('Telephone', 'phone'), email: field('ElectronicMail', 'email') };
}

function period(_c: Ctx, p: Element | undefined, s: Scope): Period | undefined {
  if (!p) return undefined;
  const start = s.date(p, 'StartDateTime', 'invoicing period start', 'start');
  const end = s.date(p, 'EndDateTime', 'invoicing period end', 'end');
  return start || end ? { start, end } : undefined;
}

/**
 * Svefaktura PaymentMeansTypeCode is always 1. Accounts with a Bankgiro/Plusgiro
 * institution or a domestic number map to 30; IBAN accounts to 58 (SEPA). One entry per
 * code, keeping every account (SFTI "The use of payment means").
 */
function paymentInstructions(c: Ctx, root: Element, s: Scope): PaymentInstructions[] {
  const byCode = new Map<string, { index: number; transfers: CreditTransfer[]; ocr: string[] }>();
  for (const acc of c.all(root, 'PaymentMeans/PayeeFinancialAccount')) {
    const rawId = c.text(acc, 'ID');
    const accountId = (rawId ?? '').replace(/[\s-]/g, '');
    const institution = c.text(acc, 'FinancialInstitutionBranch/FinancialInstitution/ID');
    const giro = institution ? GIRO[institution.toUpperCase()] : undefined;
    const iban = /^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(accountId);
    const code = iban && !giro ? '58' : '30';
    const entry = byCode.get(code) ?? { index: byCode.size, transfers: [], ocr: [] };
    const p = s.in(entry.index);
    const t = p.in('creditTransfers').in(entry.transfers.length);
    t.text(acc, 'ID', 'accountId');
    t.text(acc, 'Name', 'accountName');
    if (!giro) t.text(acc, 'FinancialInstitutionBranch/FinancialInstitution/ID', 'serviceProviderId');
    entry.transfers.push({ accountId, accountName: c.text(acc, 'Name'), serviceProviderId: giro ?? institution });
    const ocr = entry.ocr.length === 0 ? p.text(acc, 'PaymentInstructionID', 'remittanceInformation') : c.text(acc, 'PaymentInstructionID');
    if (ocr) entry.ocr.push(ocr);
    byCode.set(code, entry);
  }
  const allOcr = [...new Set([...byCode.values()].flatMap((e) => e.ocr))];
  if (allOcr.length > 1) c.warn('SF-OCR-CONFLICT', `Payment references differ between accounts: ${allOcr.join(', ')}`);
  if (byCode.size)
    c.derive('/payments/meansCode', 'Svefaktura PaymentMeansTypeCode 1 -> 30 (Bankgiro/Plusgiro/domestic) or 58 (IBAN), per SFTI');
  return [...byCode].map(([meansCode, e]) => ({ meansCode, remittanceInformation: e.ocr[0], creditTransfers: e.transfers }));
}

function allowanceCharges(c: Ctx, parent: Element, charge: boolean, s: Scope): AllowanceCharge[] {
  return c
    .all(parent, 'AllowanceCharge')
    .filter((a) => (c.text(a, 'ChargeIndicator') ?? '').toLowerCase() === String(charge))
    .map((a, i) => {
      const t = s.in(i);
      const reasonEl = c.el(a, 'ReasonCode');
      const code = c.text(reasonEl);
      const taxCat = c.el(a, 'TaxCategory');
      return {
        amount: need(t.dec(a, 'Amount', 'amount'), 'AllowanceCharge/Amount'),
        baseAmount: t.dec(a, 'AllowanceChargeBaseAmount', 'baseAmount'),
        percentage: t.dec(a, 'MultiplierFactorNumeric', 'percentage'),
        // SFTI uses ZZZ + @name ("Fakturaavgift"); the name is the reason and ZZZ carries no information.
        reason: t.attr(reasonEl, undefined, 'name', 'reason'),
        reasonCode: code && code !== 'ZZZ' ? t.text(reasonEl, undefined, 'reasonCode') : undefined,
        vat: taxCat ? vatCategory(c, taxCat, t.in('vat')) : undefined,
      };
    });
}

function vatCategory(_c: Ctx, t: Element, s: Scope): VatInfo {
  return {
    categoryCode: s.text(t, 'ID', 'categoryCode') ?? '',
    rate: s.dec(t, 'Percent', 'rate'),
    exemptionReason: s.text(t, 'ExemptionReason', 'exemptionReason'),
  };
}

function totalsAndVat(
  c: Ctx,
  root: Element,
  legal: Element,
  lines: Line[],
  allowances: AllowanceCharge[],
  charges: AllowanceCharge[],
  s: Scope,
): { totals: Totals; vatBreakdown: VatBreakdown[] } {
  const ts = s.in('totals');
  const taxTotal = c.el(root, 'TaxTotal');
  const lineNetTotal = ts.dec(legal, 'LineExtensionTotalAmount', 'lineNetTotal');
  if (lineNetTotal === undefined) throw new ParseError('LegalTotal/LineExtensionTotalAmount missing');
  const gross = c.dec(legal, 'TaxInclusiveTotalAmount');
  if (gross === undefined) throw new ParseError('LegalTotal/TaxInclusiveTotalAmount missing');
  const roundOff = ts.dec(legal, 'RoundOffAmount', 'rounding');
  const grossEl = c.el(legal, 'TaxInclusiveTotalAmount');
  c.mark(ts.path('payable'), grossEl);
  // With a round-off, BT-112 is computed (see the derivation below) and has no node of its own.
  if (!roundOff) c.mark(ts.path('taxInclusive'), grossEl);
  const allowanceTotal = allowances.length ? sum(allowances.map((a) => a.amount)) : undefined;
  const chargeTotal = charges.length ? sum(charges.map((a) => a.amount)) : undefined;
  if (allowanceTotal) c.derive('/totals/allowanceTotal', 'Sum of document allowances (no Svefaktura element)');
  if (chargeTotal) c.derive('/totals/chargeTotal', 'Sum of document charges (no Svefaktura element)');
  let taxExclusive = ts.dec(legal, 'TaxExclusiveTotalAmount', 'taxExclusive');
  if (taxExclusive === undefined) {
    taxExclusive = add(sub(lineNetTotal, allowanceTotal ?? '0'), chargeTotal ?? '0');
    c.derive('/totals/taxExclusive', 'TaxExclusiveTotalAmount absent; computed as BT-106 - BT-107 + BT-108');
  }
  const vatTotal = ts.dec(taxTotal, 'TotalTaxAmount', 'vatTotal');

  const subTotals = c.all(taxTotal, 'TaxSubTotal');
  let vatBreakdown = subTotals.map((sub, i): VatBreakdown => {
    const v = s.in('vatBreakdown').in(i);
    const cat = c.el(sub, 'TaxCategory');
    return {
      taxableAmount: need(v.dec(sub, 'TaxableAmount', 'taxableAmount'), 'TaxSubtotal/TaxableAmount'),
      taxAmount: need(v.dec(sub, 'TaxAmount', 'taxAmount'), 'TaxSubtotal/TaxAmount'),
      categoryCode: v.text(cat, 'ID', 'categoryCode') ?? '',
      rate: v.dec(cat, 'Percent', 'rate'),
      exemptionReason: v.text(cat, 'ExemptionReason', 'exemptionReason'),
      taxAmountInTaxCurrency: v.dec(sub, 'TaxCurrencyTaxAmount', 'taxAmountInTaxCurrency'),
    };
  });
  for (const v of vatBreakdown)
    if (v.taxableAmount === undefined || v.taxAmount === undefined) throw new ParseError('TaxSubTotal without TaxableAmount or TaxAmount');
  if (vatBreakdown.some((v) => v.categoryCode === 'E')) {
    c.warn(
      'SF-VAT-E',
      'Svefaktura category E covers every kind of exemption; EN separates E, AE, K, G, O and Z. Kept as E with the reason text; review before booking',
    );
  }
  if (vatBreakdown.length === 0 && (vatTotal === undefined || isZero(vatTotal))) {
    // SFTI: no breakdown, or only TotalTaxAmount = 0. EN requires at least one BG-23.
    vatBreakdown = [
      {
        taxableAmount: taxExclusive,
        taxAmount: vatTotal ?? ('0' as VatBreakdown['taxAmount']),
        categoryCode: 'E',
        exemptionReason: 'No VAT stated in the source invoice',
      },
    ];
    c.derive('/vatBreakdown/0', 'No TaxSubTotal and no VAT: one category E breakdown synthesised from BT-109 (SFTI)');
  }
  const taxCurrencyAmounts = vatBreakdown.map((v) => v.taxAmountInTaxCurrency).filter((x): x is NonNullable<typeof x> => !!x);
  if (taxCurrencyAmounts.length === 1) {
    c.mark(
      ts.path('vatTotalInTaxCurrency'),
      c
        .all(taxTotal, 'TaxSubTotal')
        .map((sub) => c.el(sub, 'TaxCurrencyTaxAmount'))
        .find((e) => c.text(e)),
    );
  } else if (taxCurrencyAmounts.length > 1) {
    c.derive('/totals/vatTotalInTaxCurrency', 'Sum of TaxCurrencyTaxAmount over the TaxSubTotals');
  }

  const totals: Totals = {
    lineNetTotal,
    allowanceTotal,
    chargeTotal,
    taxExclusive,
    vatTotal,
    vatTotalInTaxCurrency: taxCurrencyAmounts.length ? sum(taxCurrencyAmounts) : undefined,
    // Svefaktura's TaxInclusiveTotalAmount already includes the round-off; EN's BT-112 does not.
    taxInclusive: roundOff ? sub(gross, roundOff) : gross,
    rounding: roundOff,
    payable: gross,
  };
  if (roundOff) c.derive('/totals/taxInclusive', 'TaxInclusiveTotalAmount minus RoundOffAmount (Svefaktura includes rounding)');
  if (lines.length === 0) c.warn('NO_LINES', 'The invoice has no lines');
  return { totals, vatBreakdown };
}

/** SFTI: line VAT may be derived only when the document has exactly one category and rate. */
function deriveLineVat(c: Ctx, lines: Line[], breakdown: VatBreakdown[]) {
  const missing = lines.filter((l) => !l.vat);
  if (missing.length === 0) return;
  if (breakdown.length === 1) {
    const { categoryCode, rate } = breakdown[0];
    for (const l of missing) l.vat = { categoryCode, rate };
    c.derive(
      '/lines/*/vat',
      `Line VAT absent on ${missing.length} line(s); taken from the single VAT category ${categoryCode} ${rate ?? ''}`.trim(),
    );
  } else {
    c.warn(
      'SF-LINE-VAT',
      `${missing.length} line(s) have no VAT category and the document has ${breakdown.length} categories; not derived`,
    );
  }
}

function attachment(c: Ctx, r: Element, s: Scope): Attachment {
  const id = s.text(r, 'ID', 'id') ?? '';
  // urn:sfti:documents:object:... points to a separate ObjectEnvelope; http(s) values are links.
  if (/^https?:\/\//i.test(id)) {
    c.mark(s.path('uri'), c.el(r, 'ID'));
    return { kind: 'external', id, uri: id };
  }
  // The scheme is the one the reference was selected by (ATS).
  return { kind: 'reference', id, schemeId: s.attr(r, 'ID', 'identificationSchemeID', 'schemeId') ?? 'ATS' };
}

function line(c: Ctx, l: Element, s: Scope): Line {
  const qtyEl = c.el(l, 'InvoicedQuantity');
  const unitAttr = c.attr(qtyEl, undefined, 'quantityUnitCode') ? 'quantityUnitCode' : 'unitCode';
  const unitText = c.attr(qtyEl, undefined, unitAttr);
  const unitCode = unitText ? (UNITS[unitText.toLowerCase()] ?? (/^[A-Z0-9]{2,3}$/.test(unitText) ? unitText : undefined)) : undefined;
  // A mapped code (st -> H87) has no node of its own; the source text stays in unitText.
  if (unitText && unitText !== unitCode) c.mark(s.path('unitText'), qtyEl, unitAttr);
  else if (unitText) c.mark(s.path('unitCode'), qtyEl, unitAttr);
  const itemEl = c.el(l, 'Item');
  const basePrice = c.el(itemEl, 'BasePrice');
  const taxCat = c.el(itemEl, 'TaxCategory');
  const netAmount = s.dec(l, 'LineExtensionAmount', 'netAmount');
  const lineId = s.text(l, 'ID', 'id') ?? '';
  if (netAmount === undefined) throw new ParseError(`Line ${lineId || '?'}: LineExtensionAmount missing`);
  c.valueOrigins[s.path('netAmount')] = 'source';
  const it = s.in('item');
  const description = it.text(itemEl, 'Description', 'name');
  if (!description) c.warn('SF-NO-ITEM-NAME', `Line ${lineId}: no Item/Description (BT-153 is mandatory in EN 16931)`);
  const noteEls = [c.el(l, 'Note'), c.el(l, 'DespatchLineReference/DocumentReference/ID')].filter((e): e is Element => !!e && !!c.text(e));
  c.markAll(s.path('note'), noteEls);
  const p = s.in('price');
  // Svefaktura names the order on each line (BuyersID); the relation rules and PO matching read it from here.
  const orderEl = c.el(l, 'OrderLineReference/OrderReference/BuyersID');
  const orderReference = c.text(orderEl);
  if (orderReference) c.mark(s.path('national/orderReference'), orderEl);
  return {
    id: lineId,
    note: noteEls.map((e) => c.text(e)).join('\n') || undefined,
    quantity: s.dec(qtyEl, undefined, 'quantity'),
    unitCode,
    unitText: unitText && unitText !== unitCode ? unitText : undefined,
    netAmount,
    orderLineRef: s.text(l, 'OrderLineReference/BuyersLineID', 'orderLineRef'),
    national: orderReference ? { orderReference } : undefined,
    allowances: allowanceCharges(c, l, false, s.in('allowances')).map(({ vat: _vat, ...a }) => a),
    charges: allowanceCharges(c, l, true, s.in('charges')).map(({ vat: _vat, ...a }) => a),
    price:
      basePrice && c.dec(basePrice, 'PriceAmount') !== undefined
        ? {
            net: p.dec(basePrice, 'PriceAmount', 'net')!,
            baseQuantity: p.dec(basePrice, 'BaseQuantity', 'baseQuantity'),
            baseQuantityUnit: p.attr(basePrice, 'BaseQuantity', 'quantityUnitCode', 'baseQuantityUnit'),
          }
        : undefined,
    vat: taxCat ? vatCategory(c, taxCat, s.in('vat')) : undefined,
    item: {
      name: description ?? '',
      sellerId: it.text(itemEl, 'SellersItemIdentification/ID', 'sellerId'),
      buyerId: it.text(itemEl, 'BuyersItemIdentification/ID', 'buyerId'),
      standardId: gtin(c, c.el(itemEl, 'StandardItemIdentification/ID'), it.path('standardId')),
      classifications: [],
      attributes: [],
    },
  };
}
