/**
 * ZUGFeRD 1.0 (urn:ferd:CrossIndustryDocument:invoice:1p0) -> canonical.
 *
 * The syntax is the pre-EN 16931 ancestor of CII: same ram/udt vocabulary, but different
 * wrapper names (SpecifiedExchangedDocumentContext, HeaderExchangedDocument,
 * SpecifiedSupplyChainTradeTransaction, ApplicableSupplyChainTrade*), `ID` where CII has
 * `IssuerAssignedID`, `ApplicablePercent` where CII has `RateApplicablePercent`, and no VAT
 * category code. Party, address, period, delivery and payment-means mapping is shared with
 * the CII parser; the ram namespace (version :12 in practice) is read from the document.
 */
import type { Element } from '@xmldom/xmldom';
import type { AllowanceCharge, Attachment, CanonicalInvoice, Decimal, Line, Totals, VatBreakdown, VatInfo } from '../canonical.js';
import { cmp, sub, toDecimal } from '../values.js';
import { type DirectDebitEls, dateOf, delivery, party, payment, period, withScheme } from './cii.js';
import { CREDIT_TYPE_CODES, Ctx, finish, ParseError, parseXml, SELF_BILLED_TYPE_CODES, sourceMeta } from './context.js';
import type { ParseInput } from './index.js';
import { recordUnmapped } from './leftover.js';

const RSM = 'urn:ferd:CrossIndustryDocument:invoice:1p0';
const RAM_DEFAULT = 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:12';
const UDT = 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:15';

const PARTY_HANDLED = [
  'ID',
  'GlobalID',
  'Name',
  'Description',
  'DefinedTradeContact',
  'PostalTradeAddress',
  'URIUniversalCommunication',
  'SpecifiedTaxRegistration',
  'SpecifiedLegalOrganization',
];

export function parseZugferd1(input: ParseInput): CanonicalInvoice[] {
  const root = parseXml(input.payload.xml);
  const doc0 = firstChild(root, 'HeaderExchangedDocument');
  const ram = (doc0 && firstElement(doc0)?.namespaceURI) || RAM_DEFAULT;
  const c = new Ctx({ rsm: RSM, ram, udt: UDT });

  const ctxEl = c.el(root, 'rsm:SpecifiedExchangedDocumentContext');
  const doc = c.el(root, 'rsm:HeaderExchangedDocument');
  const tx = c.el(root, 'rsm:SpecifiedSupplyChainTradeTransaction');
  const agreement = c.el(tx, 'ram:ApplicableSupplyChainTradeAgreement');
  const deliveryEl = c.el(tx, 'ram:ApplicableSupplyChainTradeDelivery');
  const settlement = c.el(tx, 'ram:ApplicableSupplyChainTradeSettlement');

  const id = c.text(doc, 'ram:ID');
  const issueDate = dateOf(c, c.el(doc, 'ram:IssueDateTime'), 'BT-2');
  if (!id || !issueDate) throw new ParseError('Invoice number (BT-1) or issue date (BT-2) missing');
  const typeCode = c.text(doc, 'ram:TypeCode') ?? '380';
  const currency = c.text(settlement, 'ram:InvoiceCurrencyCode');
  if (!currency) throw new ParseError('Invoice currency (BT-5) missing');
  if ((c.text(ctxEl, 'ram:TestIndicator/*:Indicator') ?? '').toLowerCase() === 'true')
    c.warn('TEST_DOCUMENT', 'TestIndicator is true: the sender marked this document as a test');

  const guideline = c.text(ctxEl, 'ram:GuidelineSpecifiedDocumentContextParameter/ram:ID');
  const profile = input.details.profile;

  const addDocs = c.all(agreement, 'ram:AdditionalReferencedDocument');
  const docByType = (code: string) => addDocs.filter((d) => c.text(d, 'ram:TypeCode') === code);
  const invoicedObject = docByType('130')[0];
  const tender = docByType('50')[0];
  const attachmentDocs = addDocs.filter((d) => !['130', '50'].includes(c.text(d, 'ram:TypeCode') ?? ''));

  const sellerEl = c.el(agreement, 'ram:SellerTradeParty');
  const seller = party(c, sellerEl, c.in('/seller')) as CanonicalInvoice['seller'];
  seller.taxRegistrationId = c
    .all(sellerEl, 'ram:SpecifiedTaxRegistration/ram:ID')
    .filter((e) => c.attr(e, undefined, 'schemeID') === 'FC')
    .map((e) => c.text(e))
    .find(Boolean);
  seller.additionalLegalInfo = c.text(sellerEl, 'ram:Description');
  const buyerEl = c.el(agreement, 'ram:BuyerTradeParty');

  const inviteeEl = c.el(settlement, 'ram:InvoiceeTradeParty');
  const payeeEl = c.el(settlement, 'ram:PayeeTradeParty');
  const terms = c.all(settlement, 'ram:SpecifiedTradePaymentTerms');
  const direct: DirectDebitEls = { remittance: c.el(settlement, 'ram:PaymentReference') };

  const taxes = c.all(settlement, 'ram:ApplicableTradeTax');
  const { totals, vatBreakdown } = totalsAndVat(c, settlement, taxes, profile);

  const lines = c.all(tx, 'ram:IncludedSupplyChainTradeLineItem').map((l, i) => line(c, l, i));
  if (lines.length === 0) c.warn('NO_LINES', 'The document has no invoice lines');

  const logistics = c.all(settlement, 'ram:SpecifiedLogisticsServiceCharge').map(
    (s): AllowanceCharge => ({
      amount: c.dec(s, 'ram:AppliedAmount')!,
      reason: c.text(s, 'ram:Description'),
      vat: c.el(s, 'ram:AppliedTradeTax') ? vatInfo(c, c.el(s, 'ram:AppliedTradeTax')) : undefined,
    }),
  );
  if (logistics.length) c.warn('LOGISTICS_CHARGE', 'SpecifiedLogisticsServiceCharge mapped to a document charge');

  for (const pm of c.all(settlement, 'ram:SpecifiedTradeSettlementPaymentMeans')) {
    const blz = c.text(pm, 'ram:PayeeSpecifiedCreditorFinancialInstitution/ram:GermanBankleitzahlID');
    if (blz)
      c.unmapped[
        '/CrossIndustryDocument/SpecifiedSupplyChainTradeTransaction/ApplicableSupplyChainTradeSettlement/SpecifiedTradeSettlementPaymentMeans/PayeeSpecifiedCreditorFinancialInstitution/GermanBankleitzahlID'
      ] = blz;
  }
  for (const t of terms) {
    const partial = c.dec(t, 'ram:PartialPaymentAmount');
    if (partial !== undefined)
      c.unmapped[
        '/CrossIndustryDocument/SpecifiedSupplyChainTradeTransaction/ApplicableSupplyChainTradeSettlement/SpecifiedTradePaymentTerms/PartialPaymentAmount'
      ] = partial;
  }

  recordUnmapped(
    c,
    ctxEl,
    ['TestIndicator', 'GuidelineSpecifiedDocumentContextParameter'],
    '/CrossIndustryDocument/SpecifiedExchangedDocumentContext',
  );
  recordUnmapped(c, doc, ['ID', 'TypeCode', 'IssueDateTime', 'IncludedNote'], '/CrossIndustryDocument/HeaderExchangedDocument');
  recordUnmapped(
    c,
    agreement,
    [
      'BuyerReference',
      'SellerTradeParty',
      'BuyerTradeParty',
      'ContractReferencedDocument',
      'BuyerOrderReferencedDocument',
      'AdditionalReferencedDocument',
    ],
    '/CrossIndustryDocument/SpecifiedSupplyChainTradeTransaction/ApplicableSupplyChainTradeAgreement',
  );
  recordUnmapped(
    c,
    deliveryEl,
    ['ShipToTradeParty', 'ActualDeliverySupplyChainEvent', 'DeliveryNoteReferencedDocument', 'ReceivingAdviceReferencedDocument'],
    '/CrossIndustryDocument/SpecifiedSupplyChainTradeTransaction/ApplicableSupplyChainTradeDelivery',
  );
  recordUnmapped(
    c,
    settlement,
    [
      'PaymentReference',
      'InvoiceCurrencyCode',
      'InvoiceeTradeParty',
      'PayeeTradeParty',
      'SpecifiedTradeSettlementPaymentMeans',
      'ApplicableTradeTax',
      'BillingSpecifiedPeriod',
      'SpecifiedTradeAllowanceCharge',
      'SpecifiedLogisticsServiceCharge',
      'SpecifiedTradePaymentTerms',
      'SpecifiedTradeSettlementMonetarySummation',
      'ReceivableSpecifiedTradeAccountingAccount',
    ],
    '/CrossIndustryDocument/SpecifiedSupplyChainTradeTransaction/ApplicableSupplyChainTradeSettlement',
  );
  recordUnmapped(c, sellerEl, PARTY_HANDLED, '/CrossIndustryDocument/.../SellerTradeParty');
  recordUnmapped(c, buyerEl, PARTY_HANDLED, '/CrossIndustryDocument/.../BuyerTradeParty');

  const inv = {
    kind: CREDIT_TYPE_CODES.has(typeCode) ? 'creditNote' : 'invoice',
    typeCode,
    id,
    issueDate,
    selfBilled: SELF_BILLED_TYPE_CODES.has(typeCode),
    currency,
    dueDate: terms.map((t) => dateOf(c, c.el(t, 'ram:DueDateDateTime'), 'BT-9')).find(Boolean),
    buyerReference: c.text(agreement, 'ram:BuyerReference'),
    contractRef: refId(c, agreement, 'ram:ContractReferencedDocument'),
    purchaseOrderRef: refId(c, agreement, 'ram:BuyerOrderReferencedDocument'),
    despatchAdviceRef: refId(c, deliveryEl, 'ram:DeliveryNoteReferencedDocument'),
    receivingAdviceRef: refId(c, deliveryEl, 'ram:ReceivingAdviceReferencedDocument'),
    tenderRef: tender ? c.text(tender, 'ram:ID') : undefined,
    invoicedObjectId: invoicedObject
      ? withScheme(c.text(invoicedObject, 'ram:ID'), c.text(invoicedObject, 'ram:ReferenceTypeCode'))
      : undefined,
    accountingRef: c.text(settlement, 'ram:ReceivableSpecifiedTradeAccountingAccount/ram:ID'),
    paymentTerms:
      terms
        .map((t) => c.text(t, 'ram:Description'))
        .filter(Boolean)
        .join('\n') || undefined,
    notes: c.all(doc, 'ram:IncludedNote').map((n) => ({ subjectCode: c.text(n, 'ram:SubjectCode'), text: c.text(n, 'ram:Content') ?? '' })),
    specificationId: guideline ?? '',
    precedingInvoices: [],
    invoicePeriod: period(c, c.el(settlement, 'ram:BillingSpecifiedPeriod'), c.in('/invoicePeriod')),
    seller,
    buyer: party(c, buyerEl, c.in('/buyer')),
    payee: payeeEl
      ? {
          name: c.text(payeeEl, 'ram:Name') ?? '',
          identifier: c.id(payeeEl, 'ram:ID') ?? c.id(payeeEl, 'ram:GlobalID'),
          legalRegistrationId: c.id(payeeEl, 'ram:SpecifiedLegalOrganization/ram:ID'),
        }
      : undefined,
    additionalParties: inviteeEl ? [{ role: 'invoicee', party: party(c, inviteeEl, c.in('/additionalParties/0/party')) }] : [],
    delivery: delivery(c, deliveryEl, c.in('/delivery')),
    payments: c.all(settlement, 'ram:SpecifiedTradeSettlementPaymentMeans').map((pm, i) => payment(c, pm, direct, c.in(`/payments/${i}`))),
    paymentSchedule: [],
    allowances: allowanceCharges(c, settlement, false),
    charges: [...allowanceCharges(c, settlement, true), ...logistics],
    totals,
    vatBreakdown,
    otherTaxes: [],
    withholdings: [],
    attachments: attachmentDocs.map((d) => attachment(c, d)),
    lines,
    clearance: [],
    extensions: profile ? { de: { zugferdProfile: profile } } : {},
    source: sourceMeta(input, root, c, { specificationId: guideline, profileId: profile }),
  } as CanonicalInvoice;
  return [finish(inv)];
}

function firstElement(el: Element): Element | undefined {
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) return n as Element;
  return undefined;
}

function firstChild(root: Element, local: string): Element | undefined {
  for (let n = root.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && (n as Element).localName === local) return n as Element;
  return undefined;
}

/** ZUGFeRD 1 names the referenced document's number `ID`; CII uses `IssuerAssignedID`. */
function refId(c: Ctx, parent: Element | undefined, path: string): string | undefined {
  return c.text(parent, `${path}/ram:ID`) ?? c.text(parent, `${path}/ram:IssuerAssignedID`);
}

/**
 * ZUGFeRD 1 has no VAT category code. Derived from the rate: S above zero, E when an
 * exemption reason is stated, otherwise Z. Recorded once per document.
 */
function vatInfo(c: Ctx, t: Element | undefined): VatInfo {
  const rate = c.dec(t, 'ram:ApplicablePercent');
  const given = c.text(t, 'ram:CategoryCode');
  if (given) return { categoryCode: given, rate };
  const categoryCode = rate !== undefined && cmp(rate, '0') > 0 ? 'S' : c.text(t, 'ram:ExemptionReason') ? 'E' : 'Z';
  if (!c.derived.some((d) => d.field === '/vat/categoryCode')) {
    c.derive(
      '/vat/categoryCode',
      'ZUGFeRD 1 has no VAT category code; derived from the rate (S above 0, E with an exemption reason, otherwise Z)',
    );
  }
  return { categoryCode, rate };
}

function allowanceCharges(c: Ctx, parent: Element | undefined, charge: boolean): AllowanceCharge[] {
  return c
    .all(parent, 'ram:SpecifiedTradeAllowanceCharge')
    .filter((a) => (c.text(a, 'ram:ChargeIndicator/*:Indicator') ?? '').toLowerCase() === String(charge))
    .map((a) => ({
      amount: c.dec(a, 'ram:ActualAmount')!,
      baseAmount: c.dec(a, 'ram:BasisAmount'),
      percentage: c.dec(a, 'ram:CalculationPercent'),
      reason: c.text(a, 'ram:Reason'),
      reasonCode: c.text(a, 'ram:ReasonCode'),
      vat: c.el(a, 'ram:CategoryTradeTax') ? vatInfo(c, c.el(a, 'ram:CategoryTradeTax')) : undefined,
    }));
}

function totalsAndVat(
  c: Ctx,
  settlement: Element | undefined,
  taxes: Element[],
  profile: string | undefined,
): { totals: Totals; vatBreakdown: VatBreakdown[] } {
  const m = c.el(settlement, 'ram:SpecifiedTradeSettlementMonetarySummation');
  if (!m) throw new ParseError('SpecifiedTradeSettlementMonetarySummation (BG-22) missing');
  const req = (name: string, bt: string) => {
    const v = c.dec(m, `ram:${name}`);
    if (v === undefined) throw new ParseError(`${bt} (${name}) missing`);
    return v;
  };
  const taxExclusive = req('TaxBasisTotalAmount', 'BT-109');
  const lineNetTotal = c.dec(m, 'ram:LineTotalAmount');
  if (lineNetTotal === undefined) {
    c.warn('NO_LINE_TOTAL', 'LineTotalAmount (BT-106) missing; set to TaxBasisTotalAmount (BT-109)');
    c.derive('/totals/lineNetTotal', 'BT-106 absent; copied from BT-109');
  }
  const taxInclusive = req('GrandTotalAmount', 'BT-112');
  const prepaid = c.dec(m, 'ram:TotalPrepaidAmount');
  let payable = c.dec(m, 'ram:DuePayableAmount');
  if (payable === undefined) {
    // The BASIC profile has neither TotalPrepaidAmount nor DuePayableAmount: the grand total is the amount due.
    if (profile !== 'BASIC') throw new ParseError('BT-115 (DuePayableAmount) missing');
    payable = sub(taxInclusive, prepaid ?? '0');
    c.derive('/totals/payable', 'ZUGFeRD 1 BASIC has no DuePayableAmount: GrandTotalAmount - TotalPrepaidAmount');
  }
  const totals: Totals = {
    lineNetTotal: lineNetTotal ?? taxExclusive,
    allowanceTotal: c.dec(m, 'ram:AllowanceTotalAmount'),
    chargeTotal: c.dec(m, 'ram:ChargeTotalAmount'),
    taxExclusive,
    vatTotal: c.dec(m, 'ram:TaxTotalAmount'),
    taxInclusive,
    prepaid,
    payable,
  };
  const vatBreakdown = taxes.map((t): VatBreakdown => {
    const taxableAmount = c.dec(t, 'ram:BasisAmount');
    const taxAmount = c.dec(t, 'ram:CalculatedAmount');
    if (taxableAmount === undefined || taxAmount === undefined)
      throw new ParseError('ApplicableTradeTax without BasisAmount or CalculatedAmount');
    const taxType = c.text(t, 'ram:TypeCode');
    if (taxType && taxType !== 'VAT') c.warn('TAX_TYPE', `ApplicableTradeTax type ${taxType} is not VAT; mapped as a VAT breakdown`);
    const { categoryCode, rate } = vatInfo(c, t);
    recordUnmapped(
      c,
      t,
      ['CalculatedAmount', 'BasisAmount', 'ApplicablePercent', 'ExemptionReason', 'CategoryCode', 'TypeCode'],
      '/CrossIndustryDocument/.../ApplicableTradeTax',
    );
    return { taxableAmount, taxAmount, categoryCode, rate, exemptionReason: c.text(t, 'ram:ExemptionReason') };
  });
  return { totals, vatBreakdown };
}

function attachment(c: Ctx, d: Element): Attachment {
  const id = c.text(d, 'ram:ID') ?? '';
  const description = c.text(d, 'ram:Name');
  const bin = c.el(d, 'ram:AttachmentBinaryObject');
  if (bin) {
    return {
      kind: 'embedded',
      id,
      description,
      mimeCode: c.attr(bin, undefined, 'mimeCode') ?? '',
      filename: c.attr(bin, undefined, 'filename') ?? '',
      base64: (bin.textContent ?? '').replace(/\s+/g, ''),
    };
  }
  const uri = c.text(d, 'ram:URIID');
  if (uri) return { kind: 'external', id, description, uri };
  return { kind: 'reference', id, description, typeCode: c.text(d, 'ram:TypeCode') };
}

function line(c: Ctx, l: Element, index: number): Line {
  const docLine = c.el(l, 'ram:AssociatedDocumentLineDocument');
  const product = c.el(l, 'ram:SpecifiedTradeProduct');
  const agreement = c.el(l, 'ram:SpecifiedSupplyChainTradeAgreement');
  const lineDelivery = c.el(l, 'ram:SpecifiedSupplyChainTradeDelivery');
  const lineSettlement = c.el(l, 'ram:SpecifiedSupplyChainTradeSettlement');
  const qtyEl = c.el(lineDelivery, 'ram:BilledQuantity');
  const gross = c.el(agreement, 'ram:GrossPriceProductTradePrice');
  const net = c.el(agreement, 'ram:NetPriceProductTradePrice');
  const tax = c.el(lineSettlement, 'ram:ApplicableTradeTax');
  const lineId = c.text(docLine, 'ram:LineID') ?? '';
  let netAmount = c.dec(lineSettlement, 'ram:SpecifiedTradeSettlementMonetarySummation/ram:LineTotalAmount');
  if (netAmount !== undefined) c.valueOrigins[`/lines/${index}/netAmount`] = 'source';
  if (netAmount === undefined && textOnly(c, l, docLine, qtyEl, net, gross)) {
    netAmount = toDecimal('0');
    c.valueOrigins[`/lines/${index}/netAmount`] = 'defaulted';
    c.warn(
      'TEXT_LINE',
      `Line ${lineId || '?'} carries only a note and no amounts; its amount is recorded as 0`,
      undefined,
      `/lines/${index}/netAmount`,
    );
  }
  if (netAmount === undefined) throw new ParseError(`Line ${lineId || '?'}: LineTotalAmount (BT-131) missing`);
  const baseQty = c.el(net, 'ram:BasisQuantity') ?? c.el(gross, 'ram:BasisQuantity');
  const at = `/CrossIndustryDocument/.../IncludedSupplyChainTradeLineItem[${lineId}]`;
  recordUnmapped(c, docLine, ['LineID', 'IncludedNote'], `${at}/AssociatedDocumentLineDocument`);
  recordUnmapped(
    c,
    agreement,
    ['GrossPriceProductTradePrice', 'NetPriceProductTradePrice', 'BuyerOrderReferencedDocument'],
    `${at}/SpecifiedSupplyChainTradeAgreement`,
  );
  recordUnmapped(c, lineDelivery, ['BilledQuantity'], `${at}/SpecifiedSupplyChainTradeDelivery`);
  recordUnmapped(
    c,
    lineSettlement,
    [
      'ApplicableTradeTax',
      'BillingSpecifiedPeriod',
      'SpecifiedTradeAllowanceCharge',
      'SpecifiedTradeSettlementMonetarySummation',
      'ReceivableSpecifiedTradeAccountingAccount',
    ],
    `${at}/SpecifiedSupplyChainTradeSettlement`,
  );
  recordUnmapped(
    c,
    product,
    [
      'GlobalID',
      'SellerAssignedID',
      'BuyerAssignedID',
      'Name',
      'Description',
      'ApplicableProductCharacteristic',
      'DesignatedProductClassification',
      'OriginTradeCountry',
    ],
    `${at}/SpecifiedTradeProduct`,
  );
  return {
    id: lineId,
    note:
      c
        .all(docLine, 'ram:IncludedNote')
        .map((n) => c.text(n, 'ram:Content'))
        .filter(Boolean)
        .join('\n') || undefined,
    quantity: c.dec(qtyEl),
    unitCode: c.attr(qtyEl, undefined, 'unitCode'),
    netAmount,
    orderLineRef: c.text(agreement, 'ram:BuyerOrderReferencedDocument/ram:LineID'),
    accountingRef: c.text(lineSettlement, 'ram:ReceivableSpecifiedTradeAccountingAccount/ram:ID'),
    period: period(c, c.el(lineSettlement, 'ram:BillingSpecifiedPeriod'), c.in(`/lines/${index}/period`)),
    allowances: allowanceCharges(c, lineSettlement, false),
    charges: allowanceCharges(c, lineSettlement, true),
    price: net
      ? {
          net: c.dec(net, 'ram:ChargeAmount')!,
          discount: discount(c, gross),
          gross: c.dec(gross, 'ram:ChargeAmount'),
          baseQuantity: c.dec(baseQty),
          baseQuantityUnit: c.attr(baseQty, undefined, 'unitCode'),
        }
      : undefined,
    vat: tax ? vatInfo(c, tax) : undefined,
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
      attributes: c
        .all(product, 'ram:ApplicableProductCharacteristic')
        .map((p) => ({ name: c.text(p, 'ram:Description') ?? '', value: c.text(p, 'ram:Value') ?? '' })),
    },
  };
}

/** BT-147: the gross price's allowance (ChargeIndicator false). */
function discount(c: Ctx, gross: Element | undefined): Decimal | undefined {
  const a = c
    .all(gross, 'ram:AppliedTradeAllowanceCharge')
    .find((x) => (c.text(x, 'ram:ChargeIndicator/*:Indicator') ?? '').toLowerCase() === 'false');
  return c.dec(a, 'ram:ActualAmount');
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
