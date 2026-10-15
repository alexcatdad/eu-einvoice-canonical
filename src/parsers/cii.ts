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
  Address, AllowanceCharge, Attachment, CanonicalInvoice, Contact, CountryExtensions, Identifier, IsoDate,
  Line, Party, PaymentInstructions, Period, Seller, Totals, VatBreakdown,
} from '../canonical.js';
import { CREDIT_TYPE_CODES, Ctx, ParseError, SELF_BILLED_TYPE_CODES, finish, parseXml, sourceMeta } from './context.js';
import type { ParseInput } from './index.js';

const NS = {
  rsm: 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
  ram: 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
  udt: 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100',
  qdt: 'urn:un:unece:uncefact:data:standard:QualifiedDataType:100',
};

export function parseCii(input: ParseInput): CanonicalInvoice[] {
  const root = parseXml(input.payload.xml);
  const c = new Ctx(NS);
  const ctxEl = c.el(root, 'rsm:ExchangedDocumentContext');
  const doc = c.el(root, 'rsm:ExchangedDocument');
  const tx = c.el(root, 'rsm:SupplyChainTradeTransaction');
  const agreement = c.el(tx, 'ram:ApplicableHeaderTradeAgreement');
  const deliveryEl = c.el(tx, 'ram:ApplicableHeaderTradeDelivery');
  const settlement = c.el(tx, 'ram:ApplicableHeaderTradeSettlement');

  const id = c.text(doc, 'ram:ID');
  const issueDate = dateOf(c, c.el(doc, 'ram:IssueDateTime'), 'BT-2');
  if (!id || !issueDate) throw new ParseError('Invoice number (BT-1) or issue date (BT-2) missing');
  const typeCode = c.text(doc, 'ram:TypeCode') ?? '380';
  const currency = c.text(settlement, 'ram:InvoiceCurrencyCode');
  if (!currency) throw new ParseError('Invoice currency (BT-5) missing');
  const taxCurrency = c.text(settlement, 'ram:TaxCurrencyCode');

  const addDocs = c.all(agreement, 'ram:AdditionalReferencedDocument');
  const docByType = (code: string) => addDocs.filter((d) => c.text(d, 'ram:TypeCode') === code);
  const invoicedObject = docByType('130')[0];
  const tender = docByType('50')[0];

  const sellerEl = c.el(agreement, 'ram:SellerTradeParty');
  const seller = party(c, sellerEl) as Seller;
  seller.taxRegistrationId = c.all(sellerEl, 'ram:SpecifiedTaxRegistration/ram:ID').filter((e) => c.attr(e, undefined, 'schemeID') === 'FC').map((e) => c.text(e)).find(Boolean);
  seller.additionalLegalInfo = c.text(sellerEl, 'ram:Description');

  const payeeEl = c.el(settlement, 'ram:PayeeTradeParty');
  const terms = c.all(settlement, 'ram:SpecifiedTradePaymentTerms');
  const creditorId = c.text(settlement, 'ram:CreditorReferenceID');
  const mandateId = terms.map((t) => c.text(t, 'ram:DirectDebitMandateID')).find(Boolean);
  const remittance = c.text(settlement, 'ram:PaymentReference');

  const taxes = c.all(settlement, 'ram:ApplicableTradeTax');
  const { totals, vatBreakdown } = totalsAndVat(c, settlement, taxes, currency, taxCurrency);
  const firstTax = taxes[0];

  const format = input.format.id;
  const extensions: CountryExtensions = {};
  if (format === 'xrechnung-cii') extensions.de = { xrechnungVersion: input.details.version };
  if (format === 'facturx') extensions.de = { zugferdProfile: input.details.profile };
  if (format === 'fr-ctc-cii') extensions.fr = { profile: input.details.profile };

  const lines = c.all(tx, 'ram:IncludedSupplyChainTradeLineItem').map((l) => line(c, l));
  if (lines.length === 0) c.warn('NO_LINES', 'The document has no invoice lines (normal for Factur-X MINIMUM and BASIC WL, which are not complete EN 16931 invoices)');

  const inv = {
    kind: CREDIT_TYPE_CODES.has(typeCode) ? 'creditNote' : 'invoice',
    typeCode,
    id,
    issueDate,
    selfBilled: SELF_BILLED_TYPE_CODES.has(typeCode),
    currency,
    taxCurrency,
    taxPointDate: dateOf(c, c.el(firstTax, 'ram:TaxPointDate'), 'BT-7'),
    vatPointDateCode: c.text(firstTax, 'ram:DueDateTypeCode'),
    dueDate: terms.map((t) => dateOf(c, c.el(t, 'ram:DueDateDateTime'), 'BT-9')).find(Boolean),
    buyerReference: c.text(agreement, 'ram:BuyerReference'),
    projectRef: c.text(agreement, 'ram:SpecifiedProcuringProject/ram:ID'),
    contractRef: c.text(agreement, 'ram:ContractReferencedDocument/ram:IssuerAssignedID'),
    purchaseOrderRef: c.text(agreement, 'ram:BuyerOrderReferencedDocument/ram:IssuerAssignedID'),
    salesOrderRef: c.text(agreement, 'ram:SellerOrderReferencedDocument/ram:IssuerAssignedID'),
    receivingAdviceRef: c.text(deliveryEl, 'ram:ReceivingAdviceReferencedDocument/ram:IssuerAssignedID'),
    despatchAdviceRef: c.text(deliveryEl, 'ram:DespatchAdviceReferencedDocument/ram:IssuerAssignedID'),
    tenderRef: c.text(tender, 'ram:IssuerAssignedID'),
    invoicedObjectId: invoicedObject ? withScheme(c.text(invoicedObject, 'ram:IssuerAssignedID'), c.text(invoicedObject, 'ram:ReferenceTypeCode')) : undefined,
    accountingRef: c.text(settlement, 'ram:ReceivableSpecifiedTradeAccountingAccount/ram:ID'),
    paymentTerms: terms.map((t) => c.text(t, 'ram:Description')).filter(Boolean).join('\n') || undefined,
    notes: c.all(doc, 'ram:IncludedNote').map((n) => ({ subjectCode: c.text(n, 'ram:SubjectCode'), text: c.text(n, 'ram:Content') ?? '' })),
    businessProcess: c.text(ctxEl, 'ram:BusinessProcessSpecifiedDocumentContextParameter/ram:ID'),
    specificationId: c.text(ctxEl, 'ram:GuidelineSpecifiedDocumentContextParameter/ram:ID') ?? '',
    precedingInvoices: c.all(settlement, 'ram:InvoiceReferencedDocument').map((r) => ({
      id: c.text(r, 'ram:IssuerAssignedID') ?? '',
      issueDate: dateOf(c, c.el(r, 'ram:FormattedIssueDateTime'), 'BT-26'),
    })),
    invoicePeriod: period(c, c.el(settlement, 'ram:BillingSpecifiedPeriod')),
    seller,
    buyer: party(c, c.el(agreement, 'ram:BuyerTradeParty')),
    payee: payeeEl ? {
      name: c.text(payeeEl, 'ram:Name') ?? '',
      identifier: identifiers(c, payeeEl)[0],
      legalRegistrationId: c.id(payeeEl, 'ram:SpecifiedLegalOrganization/ram:ID'),
    } : undefined,
    taxRepresentative: taxRepresentative(c, c.el(agreement, 'ram:SellerTaxRepresentativeTradeParty')),
    additionalParties: [],
    delivery: delivery(c, deliveryEl),
    payments: c.all(settlement, 'ram:SpecifiedTradeSettlementPaymentMeans').map((pm) => payment(c, pm, remittance, creditorId, mandateId)),
    paymentSchedule: [],
    allowances: allowanceCharges(c, settlement, false, true),
    charges: allowanceCharges(c, settlement, true, true),
    totals,
    vatBreakdown,
    otherTaxes: [],
    withholdings: [],
    attachments: docByType('916').map((d) => attachment(c, d)),
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

/** CII dates sit in a udt:DateTimeString / udt:DateString / qdt:DateTimeString child, usually format 102 (YYYYMMDD). */
export function dateOf(c: Ctx, el: Element | undefined, field: string): IsoDate | undefined {
  const inner = c.el(el, '*:DateTimeString') ?? c.el(el, '*:DateString');
  if (!inner) return undefined;
  const fmt = c.attr(inner, undefined, 'format');
  if (fmt && fmt !== '102') c.warn('DATE_FORMAT', `${field}: date format ${fmt} is not 102 (YYYYMMDD); read as ISO`);
  return c.date(inner, undefined, field);
}

function identifiers(c: Ctx, p: Element | undefined): Identifier[] {
  return [
    ...c.all(p, 'ram:ID').map((e) => c.id(e)),
    ...c.all(p, 'ram:GlobalID').map((e) => c.id(e)),
  ].filter((i): i is Identifier => !!i);
}

export function party(c: Ctx, p: Element | undefined): Party {
  const regs = c.all(p, 'ram:SpecifiedTaxRegistration/ram:ID');
  const contactEl = c.el(p, 'ram:DefinedTradeContact');
  return {
    name: c.text(p, 'ram:Name'),
    tradingName: c.text(p, 'ram:SpecifiedLegalOrganization/ram:TradingBusinessName'),
    identifiers: identifiers(c, p),
    legalRegistrationId: c.id(p, 'ram:SpecifiedLegalOrganization/ram:ID'),
    vatId: regs.filter((e) => c.attr(e, undefined, 'schemeID') === 'VA').map((e) => c.text(e)).find(Boolean),
    nationalTaxIds: [],
    endpoint: c.id(p, 'ram:URIUniversalCommunication/ram:URIID'),
    address: address(c, c.el(p, 'ram:PostalTradeAddress')),
    contact: contactEl ? contact(c, contactEl) : undefined,
  };
}

function address(c: Ctx, a: Element | undefined): Address | undefined {
  if (!a) return undefined;
  return {
    line1: c.text(a, 'ram:LineOne'),
    line2: c.text(a, 'ram:LineTwo'),
    line3: c.text(a, 'ram:LineThree'),
    city: c.text(a, 'ram:CityName'),
    postalCode: c.text(a, 'ram:PostcodeCode'),
    countrySubdivision: c.text(a, 'ram:CountrySubDivisionName'),
    countryCode: c.text(a, 'ram:CountryID'),
  };
}

function contact(c: Ctx, e: Element): Contact {
  return {
    name: c.text(e, 'ram:PersonName') ?? c.text(e, 'ram:DepartmentName'),
    phone: c.text(e, 'ram:TelephoneUniversalCommunication/ram:CompleteNumber'),
    email: c.text(e, 'ram:EmailURIUniversalCommunication/ram:URIID'),
  };
}

export function period(c: Ctx, p: Element | undefined): Period | undefined {
  if (!p) return undefined;
  const start = dateOf(c, c.el(p, 'ram:StartDateTime'), 'period start');
  const end = dateOf(c, c.el(p, 'ram:EndDateTime'), 'period end');
  return start || end ? { start, end } : undefined;
}

function taxRepresentative(c: Ctx, t: Element | undefined) {
  if (!t) return undefined;
  return {
    name: c.text(t, 'ram:Name') ?? '',
    vatId: c.text(t, 'ram:SpecifiedTaxRegistration/ram:ID') ?? '',
    address: address(c, c.el(t, 'ram:PostalTradeAddress')) ?? {},
  };
}

export function delivery(c: Ctx, d: Element | undefined) {
  if (!d) return undefined;
  const shipTo = c.el(d, 'ram:ShipToTradeParty');
  const date = dateOf(c, c.el(d, 'ram:ActualDeliverySupplyChainEvent/ram:OccurrenceDateTime'), 'BT-72');
  if (!shipTo && !date) return undefined;
  return {
    partyName: c.text(shipTo, 'ram:Name'),
    locationId: c.id(shipTo, 'ram:GlobalID') ?? c.id(shipTo, 'ram:ID'),
    actualDate: date,
    address: address(c, c.el(shipTo, 'ram:PostalTradeAddress')),
  };
}

export function payment(c: Ctx, pm: Element, remittance: string | undefined, creditorId: string | undefined, mandateId: string | undefined): PaymentInstructions {
  const code = c.text(pm, 'ram:TypeCode') ?? '';
  const card = c.el(pm, 'ram:ApplicableTradeSettlementFinancialCard');
  const debtor = c.text(pm, 'ram:PayerPartyDebtorFinancialAccount/ram:IBANID');
  const accounts = c.all(pm, 'ram:PayeePartyCreditorFinancialAccount');
  const bic = c.text(pm, 'ram:PayeeSpecifiedCreditorFinancialInstitution/ram:BICID');
  return {
    meansCode: code,
    meansText: c.text(pm, 'ram:Information'),
    remittanceInformation: remittance,
    creditTransfers: accounts.map((a) => ({
      accountId: c.text(a, 'ram:IBANID') ?? c.text(a, 'ram:ProprietaryID') ?? '',
      accountName: c.text(a, 'ram:AccountName'),
      serviceProviderId: bic,
    })),
    card: card ? { primaryAccountNumber: c.text(card, 'ram:ID') ?? '', holderName: c.text(card, 'ram:CardholderName') } : undefined,
    directDebit: debtor || mandateId || (creditorId && code === '59') ? { mandateId, creditorId, debitedAccountId: debtor } : undefined,
  };
}

function allowanceCharges(c: Ctx, parent: Element | undefined, charge: boolean, docLevel: boolean): AllowanceCharge[] {
  return c.all(parent, 'ram:SpecifiedTradeAllowanceCharge')
    .filter((a) => (c.text(a, 'ram:ChargeIndicator/*:Indicator') ?? '').toLowerCase() === String(charge))
    .map((a) => ({
      amount: c.dec(a, 'ram:ActualAmount')!,
      baseAmount: c.dec(a, 'ram:BasisAmount'),
      percentage: c.dec(a, 'ram:CalculationPercent'),
      reason: c.text(a, 'ram:Reason'),
      reasonCode: c.text(a, 'ram:ReasonCode'),
      vat: docLevel && c.el(a, 'ram:CategoryTradeTax') ? {
        categoryCode: c.text(a, 'ram:CategoryTradeTax/ram:CategoryCode') ?? '',
        rate: c.dec(a, 'ram:CategoryTradeTax/ram:RateApplicablePercent'),
      } : undefined,
    }));
}

function totalsAndVat(c: Ctx, settlement: Element | undefined, taxes: Element[], currency: string, taxCurrency: string | undefined): { totals: Totals; vatBreakdown: VatBreakdown[] } {
  const m = c.el(settlement, 'ram:SpecifiedTradeSettlementHeaderMonetarySummation');
  if (!m) throw new ParseError('SpecifiedTradeSettlementHeaderMonetarySummation (BG-22) missing');
  const taxTotals = c.all(m, 'ram:TaxTotalAmount');
  const inCur = (cur: string) => taxTotals.find((t) => c.attr(t, undefined, 'currencyID') === cur);
  const vatEl = inCur(currency) ?? taxTotals.find((t) => !c.attr(t, undefined, 'currencyID')) ?? taxTotals[0];
  const vatTaxCurEl = taxCurrency && taxCurrency !== currency ? inCur(taxCurrency) : undefined;
  const req = (name: string, bt: string) => {
    const v = c.dec(m, `ram:${name}`);
    if (v === undefined) throw new ParseError(`${bt} (${name}) missing`);
    return v;
  };
  const lineNetTotal = c.dec(m, 'ram:LineTotalAmount');
  const taxExclusive = req('TaxBasisTotalAmount', 'BT-109');
  if (lineNetTotal === undefined) c.warn('NO_LINE_TOTAL', 'LineTotalAmount (BT-106) missing; set to TaxBasisTotalAmount (BT-109)');
  const totals: Totals = {
    lineNetTotal: lineNetTotal ?? taxExclusive,
    allowanceTotal: c.dec(m, 'ram:AllowanceTotalAmount'),
    chargeTotal: c.dec(m, 'ram:ChargeTotalAmount'),
    taxExclusive,
    vatTotal: c.dec(vatEl),
    vatTotalInTaxCurrency: c.dec(vatTaxCurEl),
    taxInclusive: req('GrandTotalAmount', 'BT-112'),
    prepaid: c.dec(m, 'ram:TotalPrepaidAmount'),
    rounding: c.dec(m, 'ram:RoundingAmount'),
    payable: req('DuePayableAmount', 'BT-115'),
  };
  if (lineNetTotal === undefined) c.derive('/totals/lineNetTotal', 'BT-106 absent; copied from BT-109');
  const vatBreakdown = taxes.map((t): VatBreakdown => {
    const taxableAmount = c.dec(t, 'ram:BasisAmount');
    const taxAmount = c.dec(t, 'ram:CalculatedAmount');
    if (taxableAmount === undefined || taxAmount === undefined) throw new ParseError('ApplicableTradeTax without BasisAmount or CalculatedAmount');
    return {
      taxableAmount,
      taxAmount,
      categoryCode: c.text(t, 'ram:CategoryCode') ?? '',
      rate: c.dec(t, 'ram:RateApplicablePercent'),
      exemptionReason: c.text(t, 'ram:ExemptionReason'),
      exemptionReasonCode: c.text(t, 'ram:ExemptionReasonCode'),
    };
  });
  return { totals, vatBreakdown };
}

function attachment(c: Ctx, d: Element): Attachment {
  const id = c.text(d, 'ram:IssuerAssignedID') ?? '';
  const description = c.text(d, 'ram:Name');
  const bin = c.el(d, 'ram:AttachmentBinaryObject');
  if (bin) {
    return {
      kind: 'embedded', id, description,
      mimeCode: c.attr(bin, undefined, 'mimeCode') ?? '',
      filename: c.attr(bin, undefined, 'filename') ?? '',
      base64: (bin.textContent ?? '').replace(/\s+/g, ''),
    };
  }
  const uri = c.text(d, 'ram:URIID');
  if (uri) return { kind: 'external', id, description, uri };
  return { kind: 'reference', id, description, typeCode: '916' };
}

function line(c: Ctx, l: Element): Line {
  const docLine = c.el(l, 'ram:AssociatedDocumentLineDocument');
  const product = c.el(l, 'ram:SpecifiedTradeProduct');
  const agreement = c.el(l, 'ram:SpecifiedLineTradeAgreement');
  const lineSettlement = c.el(l, 'ram:SpecifiedLineTradeSettlement');
  const qtyEl = c.el(l, 'ram:SpecifiedLineTradeDelivery/ram:BilledQuantity');
  const gross = c.el(agreement, 'ram:GrossPriceProductTradePrice');
  const net = c.el(agreement, 'ram:NetPriceProductTradePrice');
  const tax = c.el(lineSettlement, 'ram:ApplicableTradeTax');
  const lineId = c.text(docLine, 'ram:LineID') ?? '';
  const netAmount = c.dec(lineSettlement, 'ram:SpecifiedTradeSettlementLineMonetarySummation/ram:LineTotalAmount');
  if (netAmount === undefined) throw new ParseError(`Line ${lineId || '?'}: LineTotalAmount (BT-131) missing`);
  const objectRef = c.all(lineSettlement, 'ram:AdditionalReferencedDocument').find((d) => c.text(d, 'ram:TypeCode') === '130');
  const baseQty = c.el(net, 'ram:BasisQuantity') ?? c.el(gross, 'ram:BasisQuantity');
  return {
    id: lineId,
    note: c.all(docLine, 'ram:IncludedNote').map((n) => c.text(n, 'ram:Content')).filter(Boolean).join('\n') || undefined,
    objectId: objectRef ? withScheme(c.text(objectRef, 'ram:IssuerAssignedID'), c.text(objectRef, 'ram:ReferenceTypeCode')) : undefined,
    quantity: c.dec(qtyEl),
    unitCode: c.attr(qtyEl, undefined, 'unitCode'),
    netAmount,
    orderLineRef: c.text(agreement, 'ram:BuyerOrderReferencedDocument/ram:LineID'),
    accountingRef: c.text(lineSettlement, 'ram:ReceivableSpecifiedTradeAccountingAccount/ram:ID'),
    period: period(c, c.el(lineSettlement, 'ram:BillingSpecifiedPeriod')),
    allowances: allowanceCharges(c, lineSettlement, false, false),
    charges: allowanceCharges(c, lineSettlement, true, false),
    price: net ? {
      net: c.dec(net, 'ram:ChargeAmount')!,
      discount: c.dec(gross, 'ram:AppliedTradeAllowanceCharge/ram:ActualAmount'),
      gross: c.dec(gross, 'ram:ChargeAmount'),
      baseQuantity: c.dec(baseQty),
      baseQuantityUnit: c.attr(baseQty, undefined, 'unitCode'),
    } : undefined,
    vat: tax ? { categoryCode: c.text(tax, 'ram:CategoryCode') ?? '', rate: c.dec(tax, 'ram:RateApplicablePercent') } : undefined,
    item: {
      name: c.text(product, 'ram:Name') ?? '',
      description: c.text(product, 'ram:Description'),
      sellerId: c.text(product, 'ram:SellerAssignedID'),
      buyerId: c.text(product, 'ram:BuyerAssignedID'),
      standardId: c.id(product, 'ram:GlobalID'),
      classifications: c.all(product, 'ram:DesignatedProductClassification/ram:ClassCode').map((e) => ({
        code: c.text(e) ?? '',
        listId: c.attr(e, undefined, 'listID') ?? '',
        listVersion: c.attr(e, undefined, 'listVersionID'),
      })),
      originCountry: c.text(product, 'ram:OriginTradeCountry/ram:ID'),
      attributes: c.all(product, 'ram:ApplicableProductCharacteristic').map((p) => ({ name: c.text(p, 'ram:Description') ?? '', value: c.text(p, 'ram:Value') ?? '' })),
    },
  };
}
