/**
 * UN/CEFACT Cross Industry Invoice (D16B and D22B share the namespaces) -> canonical,
 * following the EN 16931 CII binding. Serves Factur-X / ZUGFeRD 2.x in every profile,
 * XRechnung CII, NLCIUS CII and bare EN 16931 CII.
 *
 * CII has one root for invoices and credit notes; the direction comes from the
 * TypeCode. MINIMUM and BASIC WL profiles carry no lines, so `lines` can be empty.
 */
import type { Element } from '@xmldom/xmldom';
import type {
  Address,
  AllowanceCharge,
  Attachment,
  CanonicalInvoice,
  Contact,
  CountryExtensions,
  Identifier,
  IsoDate,
  Line,
  Party,
  PaymentInstructions,
  Period,
  Seller,
  Totals,
  VatBreakdown,
} from '../canonical.js';
import { toDecimal } from '../values.js';
import { CREDIT_TYPE_CODES, Ctx, finish, need, ParseError, parseXml, type Scope, SELF_BILLED_TYPE_CODES, sourceMeta } from './context.js';
import type { ParseInput } from './index.js';

const NS = {
  rsm: 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
  ram: 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
  udt: 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100',
  qdt: 'urn:un:unece:uncefact:data:standard:QualifiedDataType:100',
};

export function parseCii(input: ParseInput): CanonicalInvoice[] {
  const root = parseXml(input.payload.xml);
  const c = new Ctx(NS, input.provenance);
  const s = c.in('');
  const ctxEl = c.el(root, 'rsm:ExchangedDocumentContext');
  const doc = c.el(root, 'rsm:ExchangedDocument');
  const tx = c.el(root, 'rsm:SupplyChainTradeTransaction');
  const agreement = c.el(tx, 'ram:ApplicableHeaderTradeAgreement');
  const deliveryEl = c.el(tx, 'ram:ApplicableHeaderTradeDelivery');
  const settlement = c.el(tx, 'ram:ApplicableHeaderTradeSettlement');

  const id = s.text(doc, 'ram:ID', 'id');
  const issueDate = dateOf(c, c.el(doc, 'ram:IssueDateTime'), 'BT-2', s.path('issueDate'));
  if (!id || !issueDate) throw new ParseError('Invoice number (BT-1) or issue date (BT-2) missing');
  let typeCode = s.text(doc, 'ram:TypeCode', 'typeCode');
  if (!typeCode) {
    typeCode = '380';
    c.derive('/typeCode', 'No TypeCode in the document; defaulted to 380');
  }
  const currency = s.text(settlement, 'ram:InvoiceCurrencyCode', 'currency');
  if (!currency) throw new ParseError('Invoice currency (BT-5) missing');
  const taxCurrency = s.text(settlement, 'ram:TaxCurrencyCode', 'taxCurrency');

  const addDocs = c.all(agreement, 'ram:AdditionalReferencedDocument');
  const docByType = (code: string) => addDocs.filter((d) => c.text(d, 'ram:TypeCode') === code);
  const invoicedObject = docByType('130')[0];
  const tender = docByType('50')[0];

  const sellerEl = c.el(agreement, 'ram:SellerTradeParty');
  const seller = party(c, sellerEl, s.in('seller')) as Seller;
  const taxRegEl = c
    .all(sellerEl, 'ram:SpecifiedTaxRegistration/ram:ID')
    .filter((e) => c.attr(e, undefined, 'schemeID') === 'FC')
    .find((e) => c.text(e));
  seller.taxRegistrationId = s.text(taxRegEl, undefined, 'seller/taxRegistrationId');
  seller.additionalLegalInfo = s.text(sellerEl, 'ram:Description', 'seller/additionalLegalInfo');

  const payeeEl = c.el(settlement, 'ram:PayeeTradeParty');
  const terms = c.all(settlement, 'ram:SpecifiedTradePaymentTerms');
  const direct: DirectDebitEls = {
    creditor: c.el(settlement, 'ram:CreditorReferenceID'),
    mandate: terms.map((t) => c.el(t, 'ram:DirectDebitMandateID')).find((e) => c.text(e)),
    remittance: c.el(settlement, 'ram:PaymentReference'),
  };

  const taxes = c.all(settlement, 'ram:ApplicableTradeTax');
  const { totals, vatBreakdown } = totalsAndVat(c, settlement, taxes, currency, taxCurrency, s);
  const firstTax = taxes[0];

  const format = input.format.id;
  const extensions: CountryExtensions = {};
  if (format === 'xrechnung-cii') extensions.de = { xrechnungVersion: input.details.version };
  if (format === 'facturx') extensions.de = { zugferdProfile: input.details.profile };
  if (format === 'fr-ctc-cii') extensions.fr = { profile: input.details.profile };

  const lines = c.all(tx, 'ram:IncludedSupplyChainTradeLineItem').map((l, i) => line(c, l, s.in('lines').in(i)));
  if (lines.length === 0)
    c.warn(
      'NO_LINES',
      'The document has no invoice lines (normal for Factur-X MINIMUM and BASIC WL, which are not complete EN 16931 invoices)',
    );

  let dueDate: IsoDate | undefined;
  for (const t of terms) {
    dueDate = dateOf(c, c.el(t, 'ram:DueDateDateTime'), 'BT-9', s.path('dueDate'));
    if (dueDate) break;
  }

  const inv = {
    kind: CREDIT_TYPE_CODES.has(typeCode) ? 'creditNote' : 'invoice',
    typeCode,
    id,
    issueDate,
    selfBilled: SELF_BILLED_TYPE_CODES.has(typeCode),
    currency,
    taxCurrency,
    taxPointDate: dateOf(c, c.el(firstTax, 'ram:TaxPointDate'), 'BT-7', s.path('taxPointDate')),
    vatPointDateCode: s.text(firstTax, 'ram:DueDateTypeCode', 'vatPointDateCode'),
    dueDate,
    buyerReference: s.text(agreement, 'ram:BuyerReference', 'buyerReference'),
    projectRef: s.text(agreement, 'ram:SpecifiedProcuringProject/ram:ID', 'projectRef'),
    contractRef: s.text(agreement, 'ram:ContractReferencedDocument/ram:IssuerAssignedID', 'contractRef'),
    purchaseOrderRef: s.text(agreement, 'ram:BuyerOrderReferencedDocument/ram:IssuerAssignedID', 'purchaseOrderRef'),
    salesOrderRef: s.text(agreement, 'ram:SellerOrderReferencedDocument/ram:IssuerAssignedID', 'salesOrderRef'),
    receivingAdviceRef: s.text(deliveryEl, 'ram:ReceivingAdviceReferencedDocument/ram:IssuerAssignedID', 'receivingAdviceRef'),
    despatchAdviceRef: s.text(deliveryEl, 'ram:DespatchAdviceReferencedDocument/ram:IssuerAssignedID', 'despatchAdviceRef'),
    tenderRef: s.text(tender, 'ram:IssuerAssignedID', 'tenderRef'),
    invoicedObjectId: invoicedObject
      ? withScheme(
          s.text(invoicedObject, 'ram:IssuerAssignedID', 'invoicedObjectId/value'),
          s.text(invoicedObject, 'ram:ReferenceTypeCode', 'invoicedObjectId/schemeId'),
        )
      : undefined,
    accountingRef: s.text(settlement, 'ram:ReceivableSpecifiedTradeAccountingAccount/ram:ID', 'accountingRef'),
    paymentTerms: joinTexts(
      c,
      terms.map((t) => c.el(t, 'ram:Description')),
      s.path('paymentTerms'),
    ),
    notes: c.all(doc, 'ram:IncludedNote').map((n, i) => {
      const p = s.in('notes').in(i);
      return { subjectCode: p.text(n, 'ram:SubjectCode', 'subjectCode'), text: p.text(n, 'ram:Content', 'text') ?? '' };
    }),
    businessProcess: s.text(ctxEl, 'ram:BusinessProcessSpecifiedDocumentContextParameter/ram:ID', 'businessProcess'),
    specificationId: s.text(ctxEl, 'ram:GuidelineSpecifiedDocumentContextParameter/ram:ID', 'specificationId') ?? '',
    precedingInvoices: c.all(settlement, 'ram:InvoiceReferencedDocument').map((r, i) => {
      const p = s.in('precedingInvoices').in(i);
      return {
        id: p.text(r, 'ram:IssuerAssignedID', 'id') ?? '',
        issueDate: dateOf(c, c.el(r, 'ram:FormattedIssueDateTime'), 'BT-26', p.path('issueDate')),
      };
    }),
    invoicePeriod: period(c, c.el(settlement, 'ram:BillingSpecifiedPeriod'), s.in('invoicePeriod')),
    seller,
    buyer: party(c, c.el(agreement, 'ram:BuyerTradeParty'), s.in('buyer')),
    payee: payeeEl
      ? {
          name: s.text(payeeEl, 'ram:Name', 'payee/name') ?? '',
          identifier: identifiers(c, payeeEl, (i) => (i === 0 ? s.path('payee/identifier') : undefined))[0],
          legalRegistrationId: s.id(payeeEl, 'ram:SpecifiedLegalOrganization/ram:ID', 'payee/legalRegistrationId'),
        }
      : undefined,
    taxRepresentative: taxRepresentative(c, c.el(agreement, 'ram:SellerTaxRepresentativeTradeParty'), s.in('taxRepresentative')),
    additionalParties: [],
    delivery: delivery(c, deliveryEl, s.in('delivery')),
    payments: c.all(settlement, 'ram:SpecifiedTradeSettlementPaymentMeans').map((pm, i) => payment(c, pm, direct, s.in('payments').in(i))),
    paymentSchedule: [],
    allowances: allowanceCharges(c, settlement, false, true, s.in('allowances')),
    charges: allowanceCharges(c, settlement, true, true, s.in('charges')),
    totals,
    vatBreakdown,
    otherTaxes: [],
    withholdings: [],
    attachments: docByType('916').map((d, i) => attachment(c, d, s.in('attachments').in(i))),
    lines,
    clearance: [],
    extensions,
    source: sourceMeta(input, root, c, {
      specificationId: c.text(ctxEl, 'ram:GuidelineSpecifiedDocumentContextParameter/ram:ID'),
      profileId: c.text(ctxEl, 'ram:BusinessProcessSpecifiedDocumentContextParameter/ram:ID'),
    }),
  } as CanonicalInvoice;
  return [finish(inv)];
}

export const withScheme = (value: string | undefined, schemeId: string | undefined): Identifier | undefined =>
  value ? (schemeId ? { value, schemeId } : { value }) : undefined;

/** Elements of the settlement that feed every payment's direct-debit and remittance fields. */
export interface DirectDebitEls {
  creditor?: Element;
  mandate?: Element;
  remittance?: Element;
}

/** Texts of the non-empty elements joined with a newline; the value is bound to all of them. */
function joinTexts(c: Ctx, els: (Element | undefined)[], bind: string): string | undefined {
  const used = els.filter((e): e is Element => !!e && !!c.text(e));
  c.markAll(bind, used);
  return used.map((e) => c.text(e)).join('\n') || undefined;
}

/**
 * CII dates sit in a udt:DateTimeString / udt:DateString / qdt:DateTimeString child, usually format 102 (YYYYMMDD).
 * UN/EDIFACT 2379 formats 610 (CCYYMM, a month) and 616 (CCYYWW, an ISO week) name a span, not a day; they are
 * read as its first day, or its last day for the end of a period (`end`), and recorded as derived.
 */
export function dateOf(c: Ctx, el: Element | undefined, field: string, bind?: string, end = false): IsoDate | undefined {
  const inner = c.el(el, '*:DateTimeString') ?? c.el(el, '*:DateString');
  if (!inner) return undefined;
  const fmt = c.attr(inner, undefined, 'format');
  const raw = c.text(inner);
  if ((fmt === '610' || fmt === '616') && raw && /^\d{6}$/.test(raw)) {
    c.text(inner, undefined, bind); // provenance
    const day = spanDay(fmt, raw, end);
    if (!day) throw new ParseError(`${field}: not a valid format ${fmt} value: "${raw}"`);
    c.derive(bind ?? field, `Date format ${fmt} (${fmt === '610' ? 'month' : 'week'}) ${raw} read as its ${end ? 'last' : 'first'} day`);
    return day;
  }
  if (fmt && fmt !== '102') c.warn('DATE_FORMAT', `${field}: date format ${fmt} is not 102 (YYYYMMDD); read as ISO`);
  return c.date(inner, undefined, field, bind);
}

/** First (or last) day of a CCYYMM month (610) or a CCYYWW ISO 8601 week (616); undefined when out of range. */
function spanDay(fmt: '610' | '616', raw: string, end: boolean): IsoDate | undefined {
  const year = Number(raw.slice(0, 4));
  const n = Number(raw.slice(4));
  const d = new Date(0);
  if (fmt === '610') {
    if (n < 1 || n > 12) return undefined;
    d.setUTCFullYear(year, end ? n : n - 1, end ? 0 : 1);
  } else {
    // ISO week 1 holds 4 January; weeks start on Monday.
    d.setUTCFullYear(year, 0, 4);
    const monday = 4 - ((d.getUTCDay() + 6) % 7);
    const weeks = new Date(0);
    weeks.setUTCFullYear(year, 11, 28); // 28 December is always in the last week
    const last = Math.round((weeks.getTime() - Date.UTC(year, 0, monday)) / 604_800_000) + 1;
    if (n < 1 || n > last) return undefined;
    d.setUTCFullYear(year, 0, monday + (n - 1) * 7 + (end ? 6 : 0));
  }
  return d.toISOString().slice(0, 10) as IsoDate;
}

/** `path(i)` gives the canonical path of the i-th identifier, or undefined where it is not wanted. */
function identifiers(c: Ctx, p: Element | undefined, path: (i: number) => string | undefined): Identifier[] {
  const els = c.nonEmpty([...c.all(p, 'ram:ID'), ...c.all(p, 'ram:GlobalID')]);
  return els.flatMap((e, i) => c.id(e, undefined, 'schemeID', path(i)) ?? []);
}

export function party(c: Ctx, p: Element | undefined, s: Scope): Party {
  const regs = c.all(p, 'ram:SpecifiedTaxRegistration/ram:ID');
  const contactEl = c.el(p, 'ram:DefinedTradeContact');
  const vatEl = regs.filter((e) => c.attr(e, undefined, 'schemeID') === 'VA').find((e) => c.text(e));
  return {
    name: s.text(p, 'ram:Name', 'name'),
    tradingName: s.text(p, 'ram:SpecifiedLegalOrganization/ram:TradingBusinessName', 'tradingName'),
    identifiers: identifiers(c, p, (i) => s.path(`identifiers/${i}`)),
    legalRegistrationId: s.id(p, 'ram:SpecifiedLegalOrganization/ram:ID', 'legalRegistrationId'),
    vatId: s.text(vatEl, undefined, 'vatId'),
    nationalTaxIds: [],
    endpoint: s.id(p, 'ram:URIUniversalCommunication/ram:URIID', 'endpoint'),
    address: address(c, c.el(p, 'ram:PostalTradeAddress'), s.in('address')),
    contact: contactEl ? contact(contactEl, s.in('contact')) : undefined,
  };
}

function address(_c: Ctx, a: Element | undefined, s: Scope): Address | undefined {
  if (!a) return undefined;
  return {
    line1: s.text(a, 'ram:LineOne', 'line1'),
    line2: s.text(a, 'ram:LineTwo', 'line2'),
    line3: s.text(a, 'ram:LineThree', 'line3'),
    city: s.text(a, 'ram:CityName', 'city'),
    postalCode: s.text(a, 'ram:PostcodeCode', 'postalCode'),
    countrySubdivision: s.text(a, 'ram:CountrySubDivisionName', 'countrySubdivision'),
    countryCode: s.text(a, 'ram:CountryID', 'countryCode'),
  };
}

function contact(e: Element, s: Scope): Contact {
  return {
    name: s.text(e, 'ram:PersonName', 'name') ?? s.text(e, 'ram:DepartmentName', 'name'),
    phone: s.text(e, 'ram:TelephoneUniversalCommunication/ram:CompleteNumber', 'phone'),
    email: s.text(e, 'ram:EmailURIUniversalCommunication/ram:URIID', 'email'),
  };
}

export function period(c: Ctx, p: Element | undefined, s: Scope): Period | undefined {
  if (!p) return undefined;
  const start = dateOf(c, c.el(p, 'ram:StartDateTime'), 'period start', s.path('start'));
  const end = dateOf(c, c.el(p, 'ram:EndDateTime'), 'period end', s.path('end'), true);
  return start || end ? { start, end } : undefined;
}

function taxRepresentative(c: Ctx, t: Element | undefined, s: Scope) {
  if (!t) return undefined;
  return {
    name: s.text(t, 'ram:Name', 'name') ?? '',
    vatId: s.text(t, 'ram:SpecifiedTaxRegistration/ram:ID', 'vatId') ?? '',
    address: address(c, c.el(t, 'ram:PostalTradeAddress'), s.in('address')) ?? {},
  };
}

export function delivery(c: Ctx, d: Element | undefined, s: Scope) {
  if (!d) return undefined;
  const shipTo = c.el(d, 'ram:ShipToTradeParty');
  const date = dateOf(c, c.el(d, 'ram:ActualDeliverySupplyChainEvent/ram:OccurrenceDateTime'), 'BT-72', s.path('actualDate'));
  if (!shipTo && !date) return undefined;
  return {
    partyName: s.text(shipTo, 'ram:Name', 'partyName'),
    locationId: s.id(shipTo, 'ram:GlobalID', 'locationId') ?? s.id(shipTo, 'ram:ID', 'locationId'),
    actualDate: date,
    address: address(c, c.el(shipTo, 'ram:PostalTradeAddress'), s.in('address')),
  };
}

export function payment(c: Ctx, pm: Element, direct: DirectDebitEls, s: Scope): PaymentInstructions {
  const code = s.text(pm, 'ram:TypeCode', 'meansCode') ?? '';
  const card = c.el(pm, 'ram:ApplicableTradeSettlementFinancialCard');
  const debtorEl = c.el(pm, 'ram:PayerPartyDebtorFinancialAccount/ram:IBANID');
  const accounts = c.all(pm, 'ram:PayeePartyCreditorFinancialAccount');
  const creditorId = c.text(direct.creditor);
  const d = s.in('directDebit');
  const k = s.in('card');
  return {
    meansCode: code,
    meansText: s.text(pm, 'ram:Information', 'meansText'),
    remittanceInformation: s.text(direct.remittance, undefined, 'remittanceInformation'),
    creditTransfers: accounts.map((a, i) => {
      const t = s.in('creditTransfers').in(i);
      return {
        accountId: t.text(a, 'ram:IBANID', 'accountId') ?? t.text(a, 'ram:ProprietaryID', 'accountId') ?? '',
        accountName: t.text(a, 'ram:AccountName', 'accountName'),
        serviceProviderId: t.text(pm, 'ram:PayeeSpecifiedCreditorFinancialInstitution/ram:BICID', 'serviceProviderId'),
      };
    }),
    card: card
      ? {
          primaryAccountNumber: k.text(card, 'ram:ID', 'primaryAccountNumber') ?? '',
          holderName: k.text(card, 'ram:CardholderName', 'holderName'),
        }
      : undefined,
    directDebit:
      c.text(debtorEl) || c.text(direct.mandate) || (creditorId && code === '59')
        ? {
            mandateId: d.text(direct.mandate, undefined, 'mandateId'),
            creditorId: d.text(direct.creditor, undefined, 'creditorId'),
            debitedAccountId: d.text(debtorEl, undefined, 'debitedAccountId'),
          }
        : undefined,
  };
}

function allowanceCharges(c: Ctx, parent: Element | undefined, charge: boolean, docLevel: boolean, s: Scope): AllowanceCharge[] {
  return c
    .all(parent, 'ram:SpecifiedTradeAllowanceCharge')
    .filter((a) => (c.text(a, 'ram:ChargeIndicator/*:Indicator') ?? '').toLowerCase() === String(charge))
    .map((a, i) => {
      const t = s.in(i);
      return {
        amount: need(t.dec(a, 'ram:ActualAmount', 'amount'), 'SpecifiedTradeAllowanceCharge/ActualAmount'),
        baseAmount: t.dec(a, 'ram:BasisAmount', 'baseAmount'),
        percentage: t.dec(a, 'ram:CalculationPercent', 'percentage'),
        reason: t.text(a, 'ram:Reason', 'reason'),
        reasonCode: t.text(a, 'ram:ReasonCode', 'reasonCode'),
        vat:
          docLevel && c.el(a, 'ram:CategoryTradeTax')
            ? {
                categoryCode: t.text(a, 'ram:CategoryTradeTax/ram:CategoryCode', 'vat/categoryCode') ?? '',
                rate: t.dec(a, 'ram:CategoryTradeTax/ram:RateApplicablePercent', 'vat/rate'),
              }
            : undefined,
      };
    });
}

function totalsAndVat(
  c: Ctx,
  settlement: Element | undefined,
  taxes: Element[],
  currency: string,
  taxCurrency: string | undefined,
  s: Scope,
): { totals: Totals; vatBreakdown: VatBreakdown[] } {
  const m = c.el(settlement, 'ram:SpecifiedTradeSettlementHeaderMonetarySummation');
  if (!m) throw new ParseError('SpecifiedTradeSettlementHeaderMonetarySummation (BG-22) missing');
  const taxTotals = c.all(m, 'ram:TaxTotalAmount');
  const inCur = (cur: string) => taxTotals.find((t) => c.attr(t, undefined, 'currencyID') === cur);
  const vatEl = inCur(currency) ?? taxTotals.find((t) => !c.attr(t, undefined, 'currencyID')) ?? taxTotals[0];
  const vatTaxCurEl = taxCurrency && taxCurrency !== currency ? inCur(taxCurrency) : undefined;
  const ts = s.in('totals');
  const req = (name: string, bt: string, key: string) => {
    const v = ts.dec(m, `ram:${name}`, key);
    if (v === undefined) throw new ParseError(`${bt} (${name}) missing`);
    return v;
  };
  const lineNetTotal = ts.dec(m, 'ram:LineTotalAmount', 'lineNetTotal');
  const taxExclusive = req('TaxBasisTotalAmount', 'BT-109', 'taxExclusive');
  if (lineNetTotal === undefined) c.warn('NO_LINE_TOTAL', 'LineTotalAmount (BT-106) missing; set to TaxBasisTotalAmount (BT-109)');
  const totals: Totals = {
    lineNetTotal: lineNetTotal ?? taxExclusive,
    allowanceTotal: ts.dec(m, 'ram:AllowanceTotalAmount', 'allowanceTotal'),
    chargeTotal: ts.dec(m, 'ram:ChargeTotalAmount', 'chargeTotal'),
    taxExclusive,
    vatTotal: ts.dec(vatEl, undefined, 'vatTotal'),
    vatTotalInTaxCurrency: ts.dec(vatTaxCurEl, undefined, 'vatTotalInTaxCurrency'),
    taxInclusive: req('GrandTotalAmount', 'BT-112', 'taxInclusive'),
    prepaid: ts.dec(m, 'ram:TotalPrepaidAmount', 'prepaid'),
    rounding: ts.dec(m, 'ram:RoundingAmount', 'rounding'),
    payable: req('DuePayableAmount', 'BT-115', 'payable'),
  };
  if (lineNetTotal === undefined) c.derive('/totals/lineNetTotal', 'BT-106 absent; copied from BT-109');
  const vatBreakdown = taxes.map((t, i): VatBreakdown => {
    const v = s.in('vatBreakdown').in(i);
    const taxableAmount = v.dec(t, 'ram:BasisAmount', 'taxableAmount');
    const taxAmount = v.dec(t, 'ram:CalculatedAmount', 'taxAmount');
    if (taxableAmount === undefined || taxAmount === undefined)
      throw new ParseError('ApplicableTradeTax without BasisAmount or CalculatedAmount');
    return {
      taxableAmount,
      taxAmount,
      categoryCode: v.text(t, 'ram:CategoryCode', 'categoryCode') ?? '',
      rate: v.dec(t, 'ram:RateApplicablePercent', 'rate'),
      exemptionReason: v.text(t, 'ram:ExemptionReason', 'exemptionReason'),
      exemptionReasonCode: v.text(t, 'ram:ExemptionReasonCode', 'exemptionReasonCode'),
    };
  });
  return { totals, vatBreakdown };
}

function attachment(c: Ctx, d: Element, s: Scope): Attachment {
  const id = s.text(d, 'ram:IssuerAssignedID', 'id') ?? '';
  const description = s.text(d, 'ram:Name', 'description');
  const bin = c.el(d, 'ram:AttachmentBinaryObject');
  if (bin) {
    c.mark(s.path('base64'), bin);
    return {
      kind: 'embedded',
      id,
      description,
      mimeCode: s.attr(bin, undefined, 'mimeCode', 'mimeCode') ?? '',
      filename: s.attr(bin, undefined, 'filename', 'filename') ?? '',
      base64: (bin.textContent ?? '').replace(/\s+/g, ''),
    };
  }
  const uri = s.text(d, 'ram:URIID', 'uri');
  if (uri) return { kind: 'external', id, description, uri };
  return { kind: 'reference', id, description, typeCode: s.text(d, 'ram:TypeCode', 'typeCode') ?? '916' };
}

function line(c: Ctx, l: Element, s: Scope): Line {
  const docLine = c.el(l, 'ram:AssociatedDocumentLineDocument');
  const product = c.el(l, 'ram:SpecifiedTradeProduct');
  const agreement = c.el(l, 'ram:SpecifiedLineTradeAgreement');
  const lineSettlement = c.el(l, 'ram:SpecifiedLineTradeSettlement');
  const qtyEl = c.el(l, 'ram:SpecifiedLineTradeDelivery/ram:BilledQuantity');
  const gross = c.el(agreement, 'ram:GrossPriceProductTradePrice');
  const net = c.el(agreement, 'ram:NetPriceProductTradePrice');
  const tax = c.el(lineSettlement, 'ram:ApplicableTradeTax');
  const lineId = s.text(docLine, 'ram:LineID', 'id') ?? '';
  let netAmount = s.dec(lineSettlement, 'ram:SpecifiedTradeSettlementLineMonetarySummation/ram:LineTotalAmount', 'netAmount');
  if (netAmount === undefined && textOnly(c, l, docLine, qtyEl, net, gross)) {
    netAmount = toDecimal('0');
    c.warn('TEXT_LINE', `Line ${lineId || '?'} carries only a note and no amounts; its amount is recorded as 0`);
  }
  if (netAmount === undefined) throw new ParseError(`Line ${lineId || '?'}: LineTotalAmount (BT-131) missing`);
  const objectRef = c.all(lineSettlement, 'ram:AdditionalReferencedDocument').find((d) => c.text(d, 'ram:TypeCode') === '130');
  const baseQty = c.el(net, 'ram:BasisQuantity') ?? c.el(gross, 'ram:BasisQuantity');
  const p = s.in('price');
  const priceNet = p.dec(net, 'ram:ChargeAmount', 'net');
  const it = s.in('item');
  return {
    id: lineId,
    note: joinTexts(
      c,
      c.all(docLine, 'ram:IncludedNote').map((n) => c.el(n, 'ram:Content')),
      s.path('note'),
    ),
    objectId: objectRef
      ? withScheme(
          s.text(objectRef, 'ram:IssuerAssignedID', 'objectId/value'),
          s.text(objectRef, 'ram:ReferenceTypeCode', 'objectId/schemeId'),
        )
      : undefined,
    quantity: s.dec(qtyEl, undefined, 'quantity'),
    unitCode: s.attr(qtyEl, undefined, 'unitCode', 'unitCode'),
    netAmount,
    orderLineRef: s.text(agreement, 'ram:BuyerOrderReferencedDocument/ram:LineID', 'orderLineRef'),
    accountingRef: s.text(lineSettlement, 'ram:ReceivableSpecifiedTradeAccountingAccount/ram:ID', 'accountingRef'),
    period: period(c, c.el(lineSettlement, 'ram:BillingSpecifiedPeriod'), s.in('period')),
    allowances: allowanceCharges(c, lineSettlement, false, false, s.in('allowances')),
    charges: allowanceCharges(c, lineSettlement, true, false, s.in('charges')),
    price:
      net && priceNet !== undefined
        ? {
            net: priceNet,
            discount: p.dec(gross, 'ram:AppliedTradeAllowanceCharge/ram:ActualAmount', 'discount'),
            gross: p.dec(gross, 'ram:ChargeAmount', 'gross'),
            baseQuantity: p.dec(baseQty, undefined, 'baseQuantity'),
            baseQuantityUnit: p.attr(baseQty, undefined, 'unitCode', 'baseQuantityUnit'),
          }
        : undefined,
    vat: tax
      ? {
          categoryCode: s.text(tax, 'ram:CategoryCode', 'vat/categoryCode') ?? '',
          rate: s.dec(tax, 'ram:RateApplicablePercent', 'vat/rate'),
        }
      : undefined,
    item: {
      name: it.text(product, 'ram:Name', 'name') ?? '',
      description: it.text(product, 'ram:Description', 'description'),
      sellerId: it.text(product, 'ram:SellerAssignedID', 'sellerId'),
      buyerId: it.text(product, 'ram:BuyerAssignedID', 'buyerId'),
      standardId: it.id(product, 'ram:GlobalID', 'standardId'),
      classifications: c.all(product, 'ram:DesignatedProductClassification/ram:ClassCode').map((e, i) => {
        const k = it.in('classifications').in(i);
        return {
          code: k.text(e, undefined, 'code') ?? '',
          listId: k.attr(e, undefined, 'listID', 'listId') ?? '',
          listVersion: k.attr(e, undefined, 'listVersionID', 'listVersion'),
        };
      }),
      originCountry: it.text(product, 'ram:OriginTradeCountry/ram:ID', 'originCountry'),
      attributes: c.all(product, 'ram:ApplicableProductCharacteristic').map((e, i) => {
        const a = it.in('attributes').in(i);
        return { name: a.text(e, 'ram:Description', 'name') ?? '', value: a.text(e, 'ram:Value', 'value') ?? '' };
      }),
    },
  };
}

/** A line with a note and nothing else (ZUGFeRD/Factur-X Extended text lines): no quantity, price or amount. */
function textOnly(
  c: Ctx,
  l: Element,
  docLine: Element | undefined,
  qty: Element | undefined,
  net: Element | undefined,
  gross: Element | undefined,
): boolean {
  return !qty && !net && !gross && c.all(docLine, 'ram:IncludedNote').length > 0 && !c.el(l, 'ram:SpecifiedTradeProduct');
}
