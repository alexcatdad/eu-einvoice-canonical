/**
 * UBL 2.1 Invoice / CreditNote -> canonical, following the EN 16931 UBL binding as
 * Peppol BIS Billing 3.0 documents it. One parser serves every UBL profile (Peppol,
 * XRechnung, NLCIUS, CIUS-RO, CIUS-PT, HR-CIUS, OIOUBL 3...); profile rules belong
 * in validation, not here.
 */
import type { Element } from '@xmldom/xmldom';
import type {
  Address,
  AllowanceCharge,
  Attachment,
  CanonicalInvoice,
  Contact,
  CountryExtensions,
  Decimal,
  Item,
  Line,
  Party,
  PaymentInstructions,
  Period,
  Seller,
  Totals,
  VatBreakdown,
} from '../canonical.js';
import { add, sub, sum } from '../values.js';
import { Ctx, finish, need, ParseError, parseXml, type Scope, SELF_BILLED_TYPE_CODES, sourceMeta } from './context.js';
import type { ParseInput } from './index.js';
import { applyPint, isPint, PINT_VAT_SCHEMES } from './pint.js';
import { applyZatca, isZatcaControlRef } from './zatca.js';

const VAT_ONLY = new Set(['VAT']);

const NS = {
  inv: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  cn: 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
};

export function parseUbl(input: ParseInput): CanonicalInvoice[] {
  const root = parseXml(input.payload.xml);
  const isCn = root.localName === 'CreditNote';
  const c = new Ctx(NS, input.provenance);
  const s = c.in('');
  const format = input.format.id;
  // PINT carries GST (and Malaysian SST/TIN) in PartyTaxScheme like VAT.
  const vatSchemes = isPint(format) ? PINT_VAT_SCHEMES : VAT_ONLY;

  const id = s.text(root, 'cbc:ID', 'id');
  const issueDate = s.date(root, 'cbc:IssueDate', 'BT-2', 'issueDate');
  if (!id || !issueDate) throw new ParseError('Invoice number (BT-1) or issue date (BT-2) missing');
  let typeCode = s.text(root, isCn ? 'cbc:CreditNoteTypeCode' : 'cbc:InvoiceTypeCode', 'typeCode');
  if (!typeCode) {
    typeCode = isCn ? '381' : '380';
    c.derive('/typeCode', `No type code in the document; defaulted to ${typeCode} from the root element`);
  }
  // A UBL document outside the EN 16931 CIUSes (ubl-unknown: plain UBL 2.0/2.1, Peru, Jordan, EHF payment
  // requests...) is not bound by their mandatory fields, so what can be derived is derived instead of rejected.
  const lenient = format === 'ubl-unknown';
  let currency = s.text(root, 'cbc:DocumentCurrencyCode', 'currency');
  if (!currency && lenient) {
    currency = c.attr(root, 'cac:LegalMonetaryTotal/cbc:PayableAmount', 'currencyID');
    if (currency) c.derive('/currency', 'No DocumentCurrencyCode (optional in UBL); the currencyID of PayableAmount');
  }
  if (!currency) throw new ParseError('Document currency (BT-5) missing');
  const taxCurrency = s.text(root, 'cbc:TaxCurrencyCode', 'taxCurrency');

  // BT-9: UBL 2.1 CreditNote has no root DueDate; Peppol puts it in PaymentMeans.
  let dueDate = isCn
    ? s.date(root, 'cac:PaymentMeans/cbc:PaymentDueDate', 'BT-9', 'dueDate')
    : s.date(root, 'cbc:DueDate', 'BT-9', 'dueDate');
  if (isCn && !dueDate && c.text(root, 'cbc:DueDate')) {
    dueDate = s.date(root, 'cbc:DueDate', 'BT-9', 'dueDate');
    c.warn('CREDITNOTE_ROOT_DUEDATE', 'CreditNote carries cbc:DueDate on the root, which UBL 2.1 does not define; used it as BT-9');
  }

  const docRefs = c.all(root, 'cac:AdditionalDocumentReference');
  const refByType = (code: string) => docRefs.find((r) => c.text(r, 'cbc:DocumentTypeCode') === code);
  const invoicedObject = refByType('130');
  const projectRef =
    s.text(root, 'cac:ProjectReference/cbc:ID', 'projectRef') ?? (isCn ? s.text(refByType('50'), 'cbc:ID', 'projectRef') : undefined);

  const sellerEl = c.el(root, 'cac:AccountingSupplierParty/cac:Party');
  const seller = party(c, sellerEl, s.in('seller'), vatSchemes, true) as Seller;
  const taxRegEl = c
    .all(sellerEl, 'cac:PartyTaxScheme')
    .filter((t) => !isVatScheme(c, t, vatSchemes))
    .map((t) => c.el(t, 'cbc:CompanyID'))
    .find((e) => c.text(e));
  seller.taxRegistrationId = s.text(taxRegEl, undefined, 'seller/taxRegistrationId');
  seller.additionalLegalInfo = s.text(sellerEl, 'cac:PartyLegalEntity/cbc:CompanyLegalForm', 'seller/additionalLegalInfo');

  const payeeEl = c.el(root, 'cac:PayeeParty');
  const payeeIds = c.nonEmpty(c.all(payeeEl, 'cac:PartyIdentification/cbc:ID'));
  const creditorEl = payeeIds.find(isSepa(c)) ?? c.nonEmpty(c.all(sellerEl, 'cac:PartyIdentification/cbc:ID')).find(isSepa(c));

  const lines = c.all(root, isCn ? 'cac:CreditNoteLine' : 'cac:InvoiceLine').map((l, i) => line(c, l, isCn, s.in('lines').in(i)));
  const allowances = allowanceCharges(c, root, false, true, s.in('allowances'));
  const charges = allowanceCharges(c, root, true, true, s.in('charges'));
  const { totals, vatBreakdown } = totalsAndVat(c, root, currency, taxCurrency, s, lenient ? { lines, allowances, charges } : undefined);

  const extensions: CountryExtensions = {};
  if (format === 'xrechnung-ubl') extensions.de = { xrechnungVersion: input.details.version };
  if (format === 'fr-ctc-ubl') extensions.fr = { profile: input.details.profile };

  const inv = {
    kind: isCn ? 'creditNote' : 'invoice',
    typeCode,
    id,
    issueDate,
    issueTime: s.text(root, 'cbc:IssueTime', 'issueTime') as CanonicalInvoice['issueTime'],
    selfBilled:
      SELF_BILLED_TYPE_CODES.has(typeCode) ||
      format === 'peppol-bis3-selfbilling' ||
      /^urn:peppol:pint:selfbilling-/i.test(c.text(root, 'cbc:CustomizationID') ?? ''),
    currency,
    taxCurrency,
    taxPointDate: s.date(root, 'cbc:TaxPointDate', 'BT-7', 'taxPointDate'),
    vatPointDateCode: s.text(root, 'cac:InvoicePeriod/cbc:DescriptionCode', 'vatPointDateCode'),
    dueDate,
    buyerReference: s.text(root, 'cbc:BuyerReference', 'buyerReference'),
    projectRef,
    contractRef: s.text(root, 'cac:ContractDocumentReference/cbc:ID', 'contractRef'),
    purchaseOrderRef: s.text(root, 'cac:OrderReference/cbc:ID', 'purchaseOrderRef'),
    salesOrderRef: s.text(root, 'cac:OrderReference/cbc:SalesOrderID', 'salesOrderRef'),
    receivingAdviceRef: s.text(root, 'cac:ReceiptDocumentReference/cbc:ID', 'receivingAdviceRef'),
    despatchAdviceRef: s.text(root, 'cac:DespatchDocumentReference/cbc:ID', 'despatchAdviceRef'),
    tenderRef: s.text(root, 'cac:OriginatorDocumentReference/cbc:ID', 'tenderRef'),
    invoicedObjectId: s.id(invoicedObject, 'cbc:ID', 'invoicedObjectId'),
    accountingRef: s.text(root, 'cbc:AccountingCost', 'accountingRef'),
    paymentTerms: s.texts(root, 'cac:PaymentTerms/cbc:Note', 'paymentTerms').join('\n') || undefined,
    notes: c.nonEmpty(c.all(root, 'cbc:Note')).map((e, i) => note(c, e, s.in('notes').in(i))),
    businessProcess: s.text(root, 'cbc:ProfileID', 'businessProcess'),
    specificationId: s.text(root, 'cbc:CustomizationID', 'specificationId') ?? '',
    precedingInvoices: c.all(root, 'cac:BillingReference/cac:InvoiceDocumentReference').map((r, i) => {
      const p = s.in('precedingInvoices').in(i);
      return { id: p.text(r, 'cbc:ID', 'id') ?? '', issueDate: p.date(r, 'cbc:IssueDate', 'BT-26', 'issueDate') };
    }),
    invoicePeriod: period(c, c.el(root, 'cac:InvoicePeriod'), s.in('invoicePeriod')),
    seller,
    buyer: party(c, c.el(root, 'cac:AccountingCustomerParty/cac:Party'), s.in('buyer'), vatSchemes),
    payee: payeeEl
      ? {
          name: s.text(payeeEl, 'cac:PartyName/cbc:Name', 'payee/name') ?? '',
          identifier: c.id(
            payeeIds.find((e) => !isSepa(c)(e)),
            undefined,
            'schemeID',
            s.path('payee/identifier'),
          ),
          legalRegistrationId: s.id(payeeEl, 'cac:PartyLegalEntity/cbc:CompanyID', 'payee/legalRegistrationId'),
        }
      : undefined,
    taxRepresentative: taxRepresentative(c, c.el(root, 'cac:TaxRepresentativeParty'), s.in('taxRepresentative')),
    additionalParties: [],
    delivery: delivery(c, c.el(root, 'cac:Delivery'), s.in('delivery')),
    payments: c.all(root, 'cac:PaymentMeans').map((pm, i) => payment(c, pm, creditorEl, s.in('payments').in(i))),
    paymentSchedule: [],
    allowances,
    charges,
    totals,
    vatBreakdown,
    otherTaxes: [],
    withholdings: [],
    attachments: docRefs
      .filter(
        (r) =>
          r !== invoicedObject &&
          !(isCn && c.text(r, 'cbc:DocumentTypeCode') === '50') &&
          !(format === 'zatca-ubl' && isZatcaControlRef(c, r)),
      )
      .map((r, i) => attachment(c, r, s.in('attachments').in(i))),
    lines,
    clearance: [],
    extensions,
    source: sourceMeta(input, root, c, {
      specificationId: c.text(root, 'cbc:CustomizationID'),
      profileId: c.text(root, 'cbc:ProfileID'),
    }),
  } as CanonicalInvoice;
  if (isPint(format)) applyPint(c, root, inv, format, isCn);
  if (format === 'zatca-ubl') applyZatca(c, root, input.payload.xml, inv);
  return [finish(inv)];
}

const isSepa = (c: Ctx) => (e: Element) => c.attr(e, undefined, 'schemeID') === 'SEPA';

/** Peppol encodes the BT-21 subject code as "#AAI#text"; both parts are bound to the same node. */
function note(c: Ctx, e: Element, s: Scope) {
  const text = c.text(e) ?? '';
  const m = /^#([A-Z]{3})#([\s\S]*)$/.exec(text);
  c.mark(s.path('text'), e);
  if (!m) return { text };
  c.mark(s.path('subjectCode'), e);
  return { subjectCode: m[1], text: m[2] };
}

/**
 * Whether a PartyTaxScheme is VAT: EN 16931 uses TaxScheme 'VAT'; OIOUBL 2 uses its own code list, where 63 is
 * 'Moms' (Danish VAT); PINT profiles add VAT-like schemes such as GST and SST (passed in `vatSchemes`).
 */
function isVatScheme(c: Ctx, partyTaxScheme: Element, vatSchemes: ReadonlySet<string> = new Set()): boolean {
  const id = c.text(partyTaxScheme, 'cac:TaxScheme/cbc:ID') ?? '';
  return id === 'VAT' || vatSchemes.has(id) || (id === '63' && c.text(partyTaxScheme, 'cac:TaxScheme/cbc:Name')?.toLowerCase() === 'moms');
}

function party(c: Ctx, p: Element | undefined, s: Scope, vatSchemes: ReadonlySet<string>, isSeller = false): Party {
  const schemes = c.all(p, 'cac:PartyTaxScheme');
  // The VAT scheme itself wins over the other VAT-like ones (PINT-MY has both: SST as VAT, TIN as GST).
  const vatScheme = schemes.find((t) => c.text(t, 'cac:TaxScheme/cbc:ID') === 'VAT') ?? schemes.find((t) => isVatScheme(c, t, vatSchemes));
  // The SEPA creditor id (BT-90) rides along as a party identifier in UBL; it belongs to direct debit, not to the seller.
  const ids = c.nonEmpty(c.all(p, 'cac:PartyIdentification/cbc:ID')).filter((e) => !(isSeller && isSepa(c)(e)));
  return {
    name: s.text(p, 'cac:PartyLegalEntity/cbc:RegistrationName', 'name'),
    tradingName: s.text(p, 'cac:PartyName/cbc:Name', 'tradingName'),
    identifiers: ids.flatMap((e, i) => s.id(e, undefined, `identifiers/${i}`) ?? []),
    legalRegistrationId: s.id(p, 'cac:PartyLegalEntity/cbc:CompanyID', 'legalRegistrationId'),
    vatId: s.text(vatScheme, 'cbc:CompanyID', 'vatId'),
    nationalTaxIds: [],
    endpoint: s.id(p, 'cbc:EndpointID', 'endpoint'),
    address: address(c, c.el(p, 'cac:PostalAddress'), s.in('address')),
    contact: contact(c, c.el(p, 'cac:Contact'), s.in('contact')),
  };
}

function address(_c: Ctx, a: Element | undefined, s: Scope): Address | undefined {
  if (!a) return undefined;
  return {
    line1: s.text(a, 'cbc:StreetName', 'line1'),
    line2: s.text(a, 'cbc:AdditionalStreetName', 'line2'),
    line3: s.texts(a, 'cac:AddressLine/cbc:Line', 'line3').join(', ') || undefined,
    city: s.text(a, 'cbc:CityName', 'city'),
    postalCode: s.text(a, 'cbc:PostalZone', 'postalCode'),
    countrySubdivision: s.text(a, 'cbc:CountrySubentity', 'countrySubdivision'),
    countryCode: s.text(a, 'cac:Country/cbc:IdentificationCode', 'countryCode'),
  };
}

function contact(_c: Ctx, e: Element | undefined, s: Scope): Contact | undefined {
  if (!e) return undefined;
  return {
    name: s.text(e, 'cbc:Name', 'name'),
    phone: s.text(e, 'cbc:Telephone', 'phone'),
    email: s.text(e, 'cbc:ElectronicMail', 'email'),
  };
}

function period(_c: Ctx, p: Element | undefined, s: Scope): Period | undefined {
  if (!p) return undefined;
  const start = s.date(p, 'cbc:StartDate', 'period start', 'start');
  const end = s.date(p, 'cbc:EndDate', 'period end', 'end');
  return start || end ? { start, end } : undefined;
}

function taxRepresentative(c: Ctx, t: Element | undefined, s: Scope) {
  if (!t) return undefined;
  return {
    name: s.text(t, 'cac:PartyName/cbc:Name', 'name') ?? '',
    vatId: s.text(t, 'cac:PartyTaxScheme/cbc:CompanyID', 'vatId') ?? '',
    address: address(c, c.el(t, 'cac:PostalAddress'), s.in('address')) ?? {},
  };
}

function delivery(c: Ctx, d: Element | undefined, s: Scope) {
  if (!d) return undefined;
  return {
    partyName: s.text(d, 'cac:DeliveryParty/cac:PartyName/cbc:Name', 'partyName'),
    locationId: s.id(d, 'cac:DeliveryLocation/cbc:ID', 'locationId'),
    actualDate: s.date(d, 'cbc:ActualDeliveryDate', 'BT-72', 'actualDate'),
    address: address(c, c.el(d, 'cac:DeliveryLocation/cac:Address'), s.in('address')),
  };
}

function payment(c: Ctx, pm: Element, creditorEl: Element | undefined, s: Scope): PaymentInstructions {
  const code = c.el(pm, 'cbc:PaymentMeansCode');
  const account = c.el(pm, 'cac:PayeeFinancialAccount');
  const card = c.el(pm, 'cac:CardAccount');
  const mandate = c.el(pm, 'cac:PaymentMandate');
  const creditorId = c.text(creditorEl);
  const t = s.in('creditTransfers').in(0);
  const k = s.in('card');
  const d = s.in('directDebit');
  return {
    meansCode: s.text(code, undefined, 'meansCode') ?? '',
    meansText: s.attr(code, undefined, 'name', 'meansText'),
    remittanceInformation: s.text(pm, 'cbc:PaymentID', 'remittanceInformation'),
    creditTransfers: account
      ? [
          {
            accountId: t.text(account, 'cbc:ID', 'accountId') ?? '',
            accountName: t.text(account, 'cbc:Name', 'accountName'),
            serviceProviderId: t.text(account, 'cac:FinancialInstitutionBranch/cbc:ID', 'serviceProviderId'),
          },
        ]
      : [],
    card: card
      ? {
          primaryAccountNumber: k.text(card, 'cbc:PrimaryAccountNumberID', 'primaryAccountNumber') ?? '',
          holderName: k.text(card, 'cbc:HolderName', 'holderName'),
          network: k.text(card, 'cbc:NetworkID', 'network'),
        }
      : undefined,
    directDebit:
      mandate || (creditorId && c.text(code) === '59')
        ? {
            mandateId: d.text(mandate, 'cbc:ID', 'mandateId'),
            creditorId: d.text(creditorEl, undefined, 'creditorId'),
            debitedAccountId: d.text(mandate, 'cac:PayerFinancialAccount/cbc:ID', 'debitedAccountId'),
          }
        : undefined,
  };
}

/** Document level (`docLevel`) carries VAT on the allowance/charge; line level does not. */
function allowanceCharges(c: Ctx, parent: Element, charge: boolean, docLevel: boolean, s: Scope): AllowanceCharge[] {
  return c
    .all(parent, 'cac:AllowanceCharge')
    .filter((a) => (c.text(a, 'cbc:ChargeIndicator') ?? '').toLowerCase() === String(charge))
    .map((a, i) => {
      const t = s.in(i);
      return {
        amount: need(t.dec(a, 'cbc:Amount', 'amount'), 'AllowanceCharge/Amount'),
        baseAmount: t.dec(a, 'cbc:BaseAmount', 'baseAmount'),
        percentage: t.dec(a, 'cbc:MultiplierFactorNumeric', 'percentage'),
        reason: t.text(a, 'cbc:AllowanceChargeReason', 'reason'),
        reasonCode: t.text(a, 'cbc:AllowanceChargeReasonCode', 'reasonCode'),
        vat:
          docLevel && c.el(a, 'cac:TaxCategory')
            ? {
                categoryCode: t.text(a, 'cac:TaxCategory/cbc:ID', 'vat/categoryCode') ?? '',
                rate: t.dec(a, 'cac:TaxCategory/cbc:Percent', 'vat/rate'),
              }
            : undefined,
      };
    });
}

function totalsAndVat(
  c: Ctx,
  root: Element,
  currency: string,
  taxCurrency: string | undefined,
  s: Scope,
  /** Given for ubl-unknown only: missing LegalMonetaryTotal amounts are then derived from them. */
  derivableFrom?: { lines: Line[]; allowances: AllowanceCharge[]; charges: AllowanceCharge[] },
): { totals: Totals; vatBreakdown: VatBreakdown[] } {
  const taxTotals = c.all(root, 'cac:TaxTotal');
  const inCur = (t: Element, cur: string) => c.attr(t, 'cbc:TaxAmount', 'currencyID') === cur;
  // ZATCA sends two TaxTotal elements in the same currency: one with the amount only, one with the subtotals.
  const main =
    taxTotals.find((t) => inCur(t, currency) && c.el(t, 'cac:TaxSubtotal')) ??
    taxTotals.find((t) => inCur(t, currency)) ??
    taxTotals.find((t) => c.el(t, 'cac:TaxSubtotal')) ??
    taxTotals[0];
  const inTaxCur = taxCurrency && taxCurrency !== currency ? taxTotals.find((t) => t !== main && inCur(t, taxCurrency)) : undefined;
  const m = c.el(root, 'cac:LegalMonetaryTotal');
  if (!m) throw new ParseError('LegalMonetaryTotal (BG-22) missing');
  const ts = s.in('totals');
  const req = (name: string, bt: string, key: string, derive?: () => Decimal, rule?: string) => {
    const v = ts.dec(m, `cbc:${name}`, key);
    if (v !== undefined) return v;
    if (!derivableFrom || !derive) throw new ParseError(`${bt} (LegalMonetaryTotal/${name}) missing`);
    c.derive(`/totals/${key}`, `${name} absent (not mandatory outside EN 16931): ${rule}`);
    c.warn('UBL-TOTAL-DERIVED', `${bt} (LegalMonetaryTotal/${name}) is absent; derived as ${rule}`);
    return derive();
  };
  // Optional totals of the document-level allowances and charges; when only the entries are given, they are summed.
  const docTotal = (name: string, key: string, list: AllowanceCharge[] | undefined) => {
    const v = ts.dec(m, `cbc:${name}`, key);
    if (v !== undefined || !list?.length) return v;
    c.derive(`/totals/${key}`, `${name} absent: sum of the document-level AllowanceCharge amounts`);
    return sum(list.map((a) => a.amount));
  };
  const allowanceTotal = docTotal('AllowanceTotalAmount', 'allowanceTotal', derivableFrom?.allowances);
  const chargeTotal = docTotal('ChargeTotalAmount', 'chargeTotal', derivableFrom?.charges);
  const vatTotal = ts.dec(main, 'cbc:TaxAmount', 'vatTotal');
  const prepaid = ts.dec(m, 'cbc:PrepaidAmount', 'prepaid');
  const rounding = ts.dec(m, 'cbc:PayableRoundingAmount', 'rounding');
  const lineNetTotal = req(
    'LineExtensionAmount',
    'BT-106',
    'lineNetTotal',
    () => sum((derivableFrom?.lines ?? []).map((l) => l.netAmount)),
    'the sum of the line amounts',
  );
  const taxExclusive = req(
    'TaxExclusiveAmount',
    'BT-109',
    'taxExclusive',
    () => add(sub(lineNetTotal, allowanceTotal ?? '0'), chargeTotal ?? '0'),
    'BT-106 - BT-107 + BT-108',
  );
  const taxInclusive = req('TaxInclusiveAmount', 'BT-112', 'taxInclusive', () => add(taxExclusive, vatTotal ?? '0'), 'BT-109 + BT-110');
  const totals: Totals = {
    lineNetTotal,
    allowanceTotal,
    chargeTotal,
    taxExclusive,
    vatTotal,
    vatTotalInTaxCurrency: ts.dec(inTaxCur, 'cbc:TaxAmount', 'vatTotalInTaxCurrency'),
    taxInclusive,
    prepaid,
    rounding,
    payable: req(
      'PayableAmount',
      'BT-115',
      'payable',
      () => add(sub(taxInclusive, prepaid ?? '0'), rounding ?? '0'),
      'BT-112 - BT-113 + BT-114',
    ),
  };
  const vatBreakdown = c.all(main, 'cac:TaxSubtotal').map((sub, i): VatBreakdown => {
    const v = s.in('vatBreakdown').in(i);
    return {
      taxableAmount: need(v.dec(sub, 'cbc:TaxableAmount', 'taxableAmount'), 'TaxSubtotal/TaxableAmount'),
      taxAmount: need(v.dec(sub, 'cbc:TaxAmount', 'taxAmount'), 'TaxSubtotal/TaxAmount'),
      categoryCode: v.text(sub, 'cac:TaxCategory/cbc:ID', 'categoryCode') ?? '',
      rate: v.dec(sub, 'cac:TaxCategory/cbc:Percent', 'rate'),
      exemptionReason: v.text(sub, 'cac:TaxCategory/cbc:TaxExemptionReason', 'exemptionReason'),
      exemptionReasonCode: v.text(sub, 'cac:TaxCategory/cbc:TaxExemptionReasonCode', 'exemptionReasonCode'),
    };
  });
  for (const v of vatBreakdown)
    if (v.taxableAmount === undefined || v.taxAmount === undefined) throw new ParseError('TaxSubtotal without TaxableAmount or TaxAmount');
  return { totals, vatBreakdown };
}

function attachment(c: Ctx, r: Element, s: Scope): Attachment {
  const id = s.text(r, 'cbc:ID', 'id') ?? '';
  const description = s.text(r, 'cbc:DocumentDescription', 'description');
  const bin = c.el(r, 'cac:Attachment/cbc:EmbeddedDocumentBinaryObject');
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
  const uri = s.text(r, 'cac:Attachment/cac:ExternalReference/cbc:URI', 'uri');
  if (uri) return { kind: 'external', id, description, uri };
  return {
    kind: 'reference',
    id,
    description,
    typeCode: s.text(r, 'cbc:DocumentTypeCode', 'typeCode'),
    schemeId: s.attr(r, 'cbc:ID', 'schemeID', 'schemeId'),
  };
}

function line(c: Ctx, l: Element, isCn: boolean, s: Scope, sub = false): Line {
  const qtyName = sub ? 'cbc:InvoicedQuantity' : isCn ? 'cbc:CreditedQuantity' : 'cbc:InvoicedQuantity';
  // A sub-line of a credit note line is a SubCreditNoteLine in UBL 2.1 and carries a CreditedQuantity; the XRechnung-style SubInvoiceLine uses InvoicedQuantity.
  const qtyEl = c.el(l, qtyName) ?? (sub ? c.el(l, 'cbc:CreditedQuantity') : undefined);
  const price = c.el(l, 'cac:Price');
  const priceAc = c.el(price, 'cac:AllowanceCharge');
  const tax = c.el(l, 'cac:Item/cac:ClassifiedTaxCategory');
  const objectRef = c.all(l, 'cac:DocumentReference').find((r) => c.text(r, 'cbc:DocumentTypeCode') === '130');
  const netAmount = s.dec(l, 'cbc:LineExtensionAmount', 'netAmount');
  if (netAmount === undefined) throw new ParseError(`Line ${c.text(l, 'cbc:ID') ?? '?'}: LineExtensionAmount (BT-131) missing`);
  const subLines = [...c.all(l, 'cac:SubInvoiceLine'), ...c.all(l, 'cac:SubCreditNoteLine')].map((e, i) =>
    line(c, e, isCn, s.in('subLines').in(i), true),
  );
  const p = s.in('price');
  const priceNet = p.dec(price, 'cbc:PriceAmount', 'net');
  return {
    id: s.text(l, 'cbc:ID', 'id') ?? '',
    note: s.texts(l, 'cbc:Note', 'note').join('\n') || undefined,
    objectId: s.id(objectRef, 'cbc:ID', 'objectId'),
    quantity: s.dec(qtyEl, undefined, 'quantity'),
    unitCode: s.attr(qtyEl, undefined, 'unitCode', 'unitCode'),
    netAmount,
    orderLineRef: s.text(l, 'cac:OrderLineReference/cbc:LineID', 'orderLineRef'),
    accountingRef: s.text(l, 'cbc:AccountingCost', 'accountingRef'),
    period: period(c, c.el(l, 'cac:InvoicePeriod'), s.in('period')),
    allowances: allowanceCharges(c, l, false, false, s.in('allowances')),
    charges: allowanceCharges(c, l, true, false, s.in('charges')),
    price:
      price && priceNet !== undefined
        ? {
            net: priceNet,
            discount: p.dec(priceAc, 'cbc:Amount', 'discount'),
            gross: p.dec(priceAc, 'cbc:BaseAmount', 'gross'),
            baseQuantity: p.dec(price, 'cbc:BaseQuantity', 'baseQuantity'),
            baseQuantityUnit: p.attr(price, 'cbc:BaseQuantity', 'unitCode', 'baseQuantityUnit'),
          }
        : undefined,
    vat: tax ? { categoryCode: s.text(tax, 'cbc:ID', 'vat/categoryCode') ?? '', rate: s.dec(tax, 'cbc:Percent', 'vat/rate') } : undefined,
    item: item(c, c.el(l, 'cac:Item'), s.in('item')),
    subLines: subLines.length ? subLines : undefined,
  };
}

function item(c: Ctx, i: Element | undefined, s: Scope): Item {
  return {
    name: s.text(i, 'cbc:Name', 'name') ?? '',
    description: s.texts(i, 'cbc:Description', 'description').join('\n') || undefined,
    sellerId: s.text(i, 'cac:SellersItemIdentification/cbc:ID', 'sellerId'),
    buyerId: s.text(i, 'cac:BuyersItemIdentification/cbc:ID', 'buyerId'),
    standardId: s.id(i, 'cac:StandardItemIdentification/cbc:ID', 'standardId'),
    classifications: c.all(i, 'cac:CommodityClassification/cbc:ItemClassificationCode').map((e, n) => {
      const k = s.in('classifications').in(n);
      return {
        code: k.text(e, undefined, 'code') ?? '',
        listId: k.attr(e, undefined, 'listID', 'listId') ?? '',
        listVersion: k.attr(e, undefined, 'listVersionID', 'listVersion'),
      };
    }),
    originCountry: s.text(i, 'cac:OriginCountry/cbc:IdentificationCode', 'originCountry'),
    attributes: c.all(i, 'cac:AdditionalItemProperty').map((e, n) => {
      const a = s.in('attributes').in(n);
      return { name: a.text(e, 'cbc:Name', 'name') ?? '', value: a.text(e, 'cbc:Value', 'value') ?? '' };
    }),
  };
}
