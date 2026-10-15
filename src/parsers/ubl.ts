/**
 * UBL 2.1 Invoice / CreditNote -> canonical, following the EN 16931 UBL binding as
 * Peppol BIS Billing 3.0 documents it. One parser serves every UBL profile (Peppol,
 * XRechnung, NLCIUS, CIUS-RO, CIUS-PT, HR-CIUS, OIOUBL 3...); profile rules belong
 * in validation, not here.
 */
import type { Element } from '@xmldom/xmldom';
import type {
  Address, AllowanceCharge, Attachment, CanonicalInvoice, Contact, CountryExtensions, Identifier, Item, Line,
  Party, PaymentInstructions, Period, Seller, Totals, VatBreakdown,
} from '../canonical.js';
import { Ctx, ParseError, SELF_BILLED_TYPE_CODES, finish, parseXml, sourceMeta } from './context.js';
import type { ParseInput } from './index.js';

const NS = {
  inv: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  cn: 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
};

export function parseUbl(input: ParseInput): CanonicalInvoice[] {
  const root = parseXml(input.payload.xml);
  const isCn = root.localName === 'CreditNote';
  const c = new Ctx(NS);

  const id = c.text(root, 'cbc:ID');
  const issueDate = c.date(root, 'cbc:IssueDate', 'BT-2');
  if (!id || !issueDate) throw new ParseError('Invoice number (BT-1) or issue date (BT-2) missing');
  const typeCode = c.text(root, isCn ? 'cbc:CreditNoteTypeCode' : 'cbc:InvoiceTypeCode') ?? (isCn ? '381' : '380');
  const currency = c.text(root, 'cbc:DocumentCurrencyCode');
  if (!currency) throw new ParseError('Document currency (BT-5) missing');
  const taxCurrency = c.text(root, 'cbc:TaxCurrencyCode');

  // BT-9: UBL 2.1 CreditNote has no root DueDate; Peppol puts it in PaymentMeans.
  let dueDate = isCn ? c.date(root, 'cac:PaymentMeans/cbc:PaymentDueDate', 'BT-9') : c.date(root, 'cbc:DueDate', 'BT-9');
  if (isCn && !dueDate && c.text(root, 'cbc:DueDate')) {
    dueDate = c.date(root, 'cbc:DueDate', 'BT-9');
    c.warn('CREDITNOTE_ROOT_DUEDATE', 'CreditNote carries cbc:DueDate on the root, which UBL 2.1 does not define; used it as BT-9');
  }

  const docRefs = c.all(root, 'cac:AdditionalDocumentReference');
  const refByType = (code: string) => docRefs.find((r) => c.text(r, 'cbc:DocumentTypeCode') === code);
  const invoicedObject = refByType('130');
  const projectRef = c.text(root, 'cac:ProjectReference/cbc:ID') ?? (isCn ? c.text(refByType('50'), 'cbc:ID') : undefined);

  const sellerEl = c.el(root, 'cac:AccountingSupplierParty/cac:Party');
  const seller = party(c, sellerEl) as Seller;
  const sepa = seller.identifiers.find((i) => i.schemeId === 'SEPA');
  seller.identifiers = seller.identifiers.filter((i) => i.schemeId !== 'SEPA');
  seller.taxRegistrationId = c.all(sellerEl, 'cac:PartyTaxScheme')
    .filter((s) => c.text(s, 'cac:TaxScheme/cbc:ID') !== 'VAT').map((s) => c.text(s, 'cbc:CompanyID')).find(Boolean);
  seller.additionalLegalInfo = c.text(sellerEl, 'cac:PartyLegalEntity/cbc:CompanyLegalForm');

  const payeeEl = c.el(root, 'cac:PayeeParty');
  const payeeSepa = c.all(payeeEl, 'cac:PartyIdentification/cbc:ID').find((e) => c.attr(e, undefined, 'schemeID') === 'SEPA');
  const creditorId = c.text(payeeSepa) ?? sepa?.value;

  const lines = c.all(root, isCn ? 'cac:CreditNoteLine' : 'cac:InvoiceLine').map((l) => line(c, l, isCn));
  const { totals, vatBreakdown } = totalsAndVat(c, root, currency, taxCurrency);

  const format = input.format.id;
  const extensions: CountryExtensions = {};
  if (format === 'xrechnung-ubl') extensions.de = { xrechnungVersion: input.details.version };
  if (format === 'fr-ctc-ubl') extensions.fr = { profile: input.details.profile };

  const inv = {
    kind: isCn ? 'creditNote' : 'invoice',
    typeCode,
    id,
    issueDate,
    issueTime: c.text(root, 'cbc:IssueTime') as CanonicalInvoice['issueTime'],
    selfBilled: SELF_BILLED_TYPE_CODES.has(typeCode) || format === 'peppol-bis3-selfbilling',
    currency,
    taxCurrency,
    taxPointDate: c.date(root, 'cbc:TaxPointDate', 'BT-7'),
    vatPointDateCode: c.text(root, 'cac:InvoicePeriod/cbc:DescriptionCode'),
    dueDate,
    buyerReference: c.text(root, 'cbc:BuyerReference'),
    projectRef,
    contractRef: c.text(root, 'cac:ContractDocumentReference/cbc:ID'),
    purchaseOrderRef: c.text(root, 'cac:OrderReference/cbc:ID'),
    salesOrderRef: c.text(root, 'cac:OrderReference/cbc:SalesOrderID'),
    receivingAdviceRef: c.text(root, 'cac:ReceiptDocumentReference/cbc:ID'),
    despatchAdviceRef: c.text(root, 'cac:DespatchDocumentReference/cbc:ID'),
    tenderRef: c.text(root, 'cac:OriginatorDocumentReference/cbc:ID'),
    invoicedObjectId: c.id(invoicedObject, 'cbc:ID'),
    accountingRef: c.text(root, 'cbc:AccountingCost'),
    paymentTerms: c.texts(root, 'cac:PaymentTerms/cbc:Note').join('\n') || undefined,
    notes: c.texts(root, 'cbc:Note').map(note),
    businessProcess: c.text(root, 'cbc:ProfileID'),
    specificationId: c.text(root, 'cbc:CustomizationID') ?? '',
    precedingInvoices: c.all(root, 'cac:BillingReference/cac:InvoiceDocumentReference').map((r) => ({
      id: c.text(r, 'cbc:ID') ?? '',
      issueDate: c.date(r, 'cbc:IssueDate', 'BT-26'),
    })),
    invoicePeriod: period(c, c.el(root, 'cac:InvoicePeriod')),
    seller,
    buyer: party(c, c.el(root, 'cac:AccountingCustomerParty/cac:Party')),
    payee: payeeEl ? {
      name: c.text(payeeEl, 'cac:PartyName/cbc:Name') ?? '',
      identifier: c.all(payeeEl, 'cac:PartyIdentification/cbc:ID').filter((e) => c.attr(e, undefined, 'schemeID') !== 'SEPA').map((e) => c.id(e)!)[0],
      legalRegistrationId: c.id(payeeEl, 'cac:PartyLegalEntity/cbc:CompanyID'),
    } : undefined,
    taxRepresentative: taxRepresentative(c, c.el(root, 'cac:TaxRepresentativeParty')),
    additionalParties: [],
    delivery: delivery(c, c.el(root, 'cac:Delivery')),
    payments: c.all(root, 'cac:PaymentMeans').map((pm) => payment(c, pm, creditorId)),
    paymentSchedule: [],
    allowances: allowanceCharges(c, root, false, true),
    charges: allowanceCharges(c, root, true, true),
    totals,
    vatBreakdown,
    otherTaxes: [],
    withholdings: [],
    attachments: docRefs.filter((r) => r !== invoicedObject && !(isCn && c.text(r, 'cbc:DocumentTypeCode') === '50')).map((r) => attachment(c, r)),
    lines,
    clearance: [],
    extensions,
    source: sourceMeta(input, root, c, {
      specificationId: c.text(root, 'cbc:CustomizationID'),
      profileId: c.text(root, 'cbc:ProfileID'),
    }),
  } as CanonicalInvoice;
  return [finish(inv)];
}

/** Peppol encodes the BT-21 subject code as "#AAI#text". */
function note(text: string) {
  const m = /^#([A-Z]{3})#([\s\S]*)$/.exec(text);
  return m ? { subjectCode: m[1], text: m[2] } : { text };
}

function party(c: Ctx, p: Element | undefined): Party {
  const vatScheme = c.all(p, 'cac:PartyTaxScheme').find((s) => c.text(s, 'cac:TaxScheme/cbc:ID') === 'VAT');
  return {
    name: c.text(p, 'cac:PartyLegalEntity/cbc:RegistrationName'),
    tradingName: c.text(p, 'cac:PartyName/cbc:Name'),
    identifiers: c.all(p, 'cac:PartyIdentification/cbc:ID').map((e) => c.id(e)).filter((i): i is Identifier => !!i),
    legalRegistrationId: c.id(p, 'cac:PartyLegalEntity/cbc:CompanyID'),
    vatId: c.text(vatScheme, 'cbc:CompanyID'),
    nationalTaxIds: [],
    endpoint: c.id(p, 'cbc:EndpointID'),
    address: address(c, c.el(p, 'cac:PostalAddress')),
    contact: contact(c, c.el(p, 'cac:Contact')),
  };
}

function address(c: Ctx, a: Element | undefined): Address | undefined {
  if (!a) return undefined;
  return {
    line1: c.text(a, 'cbc:StreetName'),
    line2: c.text(a, 'cbc:AdditionalStreetName'),
    line3: c.texts(a, 'cac:AddressLine/cbc:Line').join(', ') || undefined,
    city: c.text(a, 'cbc:CityName'),
    postalCode: c.text(a, 'cbc:PostalZone'),
    countrySubdivision: c.text(a, 'cbc:CountrySubentity'),
    countryCode: c.text(a, 'cac:Country/cbc:IdentificationCode'),
  };
}

function contact(c: Ctx, e: Element | undefined): Contact | undefined {
  if (!e) return undefined;
  return { name: c.text(e, 'cbc:Name'), phone: c.text(e, 'cbc:Telephone'), email: c.text(e, 'cbc:ElectronicMail') };
}

function period(c: Ctx, p: Element | undefined): Period | undefined {
  if (!p) return undefined;
  const start = c.date(p, 'cbc:StartDate', 'period start');
  const end = c.date(p, 'cbc:EndDate', 'period end');
  return start || end ? { start, end } : undefined;
}

function taxRepresentative(c: Ctx, t: Element | undefined) {
  if (!t) return undefined;
  return {
    name: c.text(t, 'cac:PartyName/cbc:Name') ?? '',
    vatId: c.text(t, 'cac:PartyTaxScheme/cbc:CompanyID') ?? '',
    address: address(c, c.el(t, 'cac:PostalAddress')) ?? {},
  };
}

function delivery(c: Ctx, d: Element | undefined) {
  if (!d) return undefined;
  return {
    partyName: c.text(d, 'cac:DeliveryParty/cac:PartyName/cbc:Name'),
    locationId: c.id(d, 'cac:DeliveryLocation/cbc:ID'),
    actualDate: c.date(d, 'cbc:ActualDeliveryDate', 'BT-72'),
    address: address(c, c.el(d, 'cac:DeliveryLocation/cac:Address')),
  };
}

function payment(c: Ctx, pm: Element, creditorId: string | undefined): PaymentInstructions {
  const code = c.el(pm, 'cbc:PaymentMeansCode');
  const account = c.el(pm, 'cac:PayeeFinancialAccount');
  const card = c.el(pm, 'cac:CardAccount');
  const mandate = c.el(pm, 'cac:PaymentMandate');
  return {
    meansCode: c.text(code) ?? '',
    meansText: c.attr(code, undefined, 'name'),
    remittanceInformation: c.text(pm, 'cbc:PaymentID'),
    creditTransfers: account ? [{
      accountId: c.text(account, 'cbc:ID') ?? '',
      accountName: c.text(account, 'cbc:Name'),
      serviceProviderId: c.text(account, 'cac:FinancialInstitutionBranch/cbc:ID'),
    }] : [],
    card: card ? {
      primaryAccountNumber: c.text(card, 'cbc:PrimaryAccountNumberID') ?? '',
      holderName: c.text(card, 'cbc:HolderName'),
      network: c.text(card, 'cbc:NetworkID'),
    } : undefined,
    directDebit: mandate || (creditorId && c.text(code) === '59') ? {
      mandateId: c.text(mandate, 'cbc:ID'),
      creditorId,
      debitedAccountId: c.text(mandate, 'cac:PayerFinancialAccount/cbc:ID'),
    } : undefined,
  };
}

/** Document level (`docLevel`) carries VAT on the allowance/charge; line level does not. */
function allowanceCharges(c: Ctx, parent: Element, charge: boolean, docLevel: boolean): AllowanceCharge[] {
  return c.all(parent, 'cac:AllowanceCharge')
    .filter((a) => (c.text(a, 'cbc:ChargeIndicator') ?? '').toLowerCase() === String(charge))
    .map((a) => ({
      amount: c.dec(a, 'cbc:Amount')!,
      baseAmount: c.dec(a, 'cbc:BaseAmount'),
      percentage: c.dec(a, 'cbc:MultiplierFactorNumeric'),
      reason: c.text(a, 'cbc:AllowanceChargeReason'),
      reasonCode: c.text(a, 'cbc:AllowanceChargeReasonCode'),
      vat: docLevel && c.el(a, 'cac:TaxCategory') ? {
        categoryCode: c.text(a, 'cac:TaxCategory/cbc:ID') ?? '',
        rate: c.dec(a, 'cac:TaxCategory/cbc:Percent'),
      } : undefined,
    }));
}

function totalsAndVat(c: Ctx, root: Element, currency: string, taxCurrency: string | undefined): { totals: Totals; vatBreakdown: VatBreakdown[] } {
  const taxTotals = c.all(root, 'cac:TaxTotal');
  const inCur = (t: Element, cur: string) => c.attr(t, 'cbc:TaxAmount', 'currencyID') === cur;
  const main = taxTotals.find((t) => inCur(t, currency)) ?? taxTotals.find((t) => c.el(t, 'cac:TaxSubtotal')) ?? taxTotals[0];
  const inTaxCur = taxCurrency && taxCurrency !== currency ? taxTotals.find((t) => t !== main && inCur(t, taxCurrency)) : undefined;
  const m = c.el(root, 'cac:LegalMonetaryTotal');
  if (!m) throw new ParseError('LegalMonetaryTotal (BG-22) missing');
  const req = (name: string, bt: string) => {
    const v = c.dec(m, `cbc:${name}`);
    if (v === undefined) throw new ParseError(`${bt} (LegalMonetaryTotal/${name}) missing`);
    return v;
  };
  const totals: Totals = {
    lineNetTotal: req('LineExtensionAmount', 'BT-106'),
    allowanceTotal: c.dec(m, 'cbc:AllowanceTotalAmount'),
    chargeTotal: c.dec(m, 'cbc:ChargeTotalAmount'),
    taxExclusive: req('TaxExclusiveAmount', 'BT-109'),
    vatTotal: c.dec(main, 'cbc:TaxAmount'),
    vatTotalInTaxCurrency: c.dec(inTaxCur, 'cbc:TaxAmount'),
    taxInclusive: req('TaxInclusiveAmount', 'BT-112'),
    prepaid: c.dec(m, 'cbc:PrepaidAmount'),
    rounding: c.dec(m, 'cbc:PayableRoundingAmount'),
    payable: req('PayableAmount', 'BT-115'),
  };
  const vatBreakdown = c.all(main, 'cac:TaxSubtotal').map((s): VatBreakdown => ({
    taxableAmount: c.dec(s, 'cbc:TaxableAmount')!,
    taxAmount: c.dec(s, 'cbc:TaxAmount')!,
    categoryCode: c.text(s, 'cac:TaxCategory/cbc:ID') ?? '',
    rate: c.dec(s, 'cac:TaxCategory/cbc:Percent'),
    exemptionReason: c.text(s, 'cac:TaxCategory/cbc:TaxExemptionReason'),
    exemptionReasonCode: c.text(s, 'cac:TaxCategory/cbc:TaxExemptionReasonCode'),
  }));
  for (const v of vatBreakdown) if (v.taxableAmount === undefined || v.taxAmount === undefined) throw new ParseError('TaxSubtotal without TaxableAmount or TaxAmount');
  return { totals, vatBreakdown };
}

function attachment(c: Ctx, r: Element): Attachment {
  const id = c.text(r, 'cbc:ID') ?? '';
  const description = c.text(r, 'cbc:DocumentDescription');
  const bin = c.el(r, 'cac:Attachment/cbc:EmbeddedDocumentBinaryObject');
  if (bin) {
    return {
      kind: 'embedded', id, description,
      mimeCode: c.attr(bin, undefined, 'mimeCode') ?? '',
      filename: c.attr(bin, undefined, 'filename') ?? '',
      base64: (bin.textContent ?? '').replace(/\s+/g, ''),
    };
  }
  const uri = c.text(r, 'cac:Attachment/cac:ExternalReference/cbc:URI');
  if (uri) return { kind: 'external', id, description, uri };
  return { kind: 'reference', id, description, typeCode: c.text(r, 'cbc:DocumentTypeCode'), schemeId: c.attr(r, 'cbc:ID', 'schemeID') };
}

function line(c: Ctx, l: Element, isCn: boolean, sub = false): Line {
  const qtyName = sub ? 'cbc:InvoicedQuantity' : isCn ? 'cbc:CreditedQuantity' : 'cbc:InvoicedQuantity';
  const qtyEl = c.el(l, qtyName);
  const price = c.el(l, 'cac:Price');
  const priceAc = c.el(price, 'cac:AllowanceCharge');
  const tax = c.el(l, 'cac:Item/cac:ClassifiedTaxCategory');
  const objectRef = c.all(l, 'cac:DocumentReference').find((r) => c.text(r, 'cbc:DocumentTypeCode') === '130');
  const netAmount = c.dec(l, 'cbc:LineExtensionAmount');
  if (netAmount === undefined) throw new ParseError(`Line ${c.text(l, 'cbc:ID') ?? '?'}: LineExtensionAmount (BT-131) missing`);
  const subLines = c.all(l, 'cac:SubInvoiceLine').map((s) => line(c, s, isCn, true));
  return {
    id: c.text(l, 'cbc:ID') ?? '',
    note: c.texts(l, 'cbc:Note').join('\n') || undefined,
    objectId: c.id(objectRef, 'cbc:ID'),
    quantity: c.dec(qtyEl),
    unitCode: c.attr(qtyEl, undefined, 'unitCode'),
    netAmount,
    orderLineRef: c.text(l, 'cac:OrderLineReference/cbc:LineID'),
    accountingRef: c.text(l, 'cbc:AccountingCost'),
    period: period(c, c.el(l, 'cac:InvoicePeriod')),
    allowances: allowanceCharges(c, l, false, false),
    charges: allowanceCharges(c, l, true, false),
    price: price ? {
      net: c.dec(price, 'cbc:PriceAmount')!,
      discount: c.dec(priceAc, 'cbc:Amount'),
      gross: c.dec(priceAc, 'cbc:BaseAmount'),
      baseQuantity: c.dec(price, 'cbc:BaseQuantity'),
      baseQuantityUnit: c.attr(price, 'cbc:BaseQuantity', 'unitCode'),
    } : undefined,
    vat: tax ? { categoryCode: c.text(tax, 'cbc:ID') ?? '', rate: c.dec(tax, 'cbc:Percent') } : undefined,
    item: item(c, c.el(l, 'cac:Item')),
    subLines: subLines.length ? subLines : undefined,
  };
}

function item(c: Ctx, i: Element | undefined): Item {
  return {
    name: c.text(i, 'cbc:Name') ?? '',
    description: c.texts(i, 'cbc:Description').join('\n') || undefined,
    sellerId: c.text(i, 'cac:SellersItemIdentification/cbc:ID'),
    buyerId: c.text(i, 'cac:BuyersItemIdentification/cbc:ID'),
    standardId: c.id(i, 'cac:StandardItemIdentification/cbc:ID'),
    classifications: c.all(i, 'cac:CommodityClassification/cbc:ItemClassificationCode').map((e) => ({
      code: c.text(e) ?? '',
      listId: c.attr(e, undefined, 'listID') ?? '',
      listVersion: c.attr(e, undefined, 'listVersionID'),
    })),
    originCountry: c.text(i, 'cac:OriginCountry/cbc:IdentificationCode'),
    attributes: c.all(i, 'cac:AdditionalItemProperty').map((p) => ({ name: c.text(p, 'cbc:Name') ?? '', value: c.text(p, 'cbc:Value') ?? '' })),
  };
}
