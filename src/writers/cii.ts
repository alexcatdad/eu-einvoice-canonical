/**
 * Canonical invoice -> UN/CEFACT Cross Industry Invoice D16B, following the EN 16931 CII binding as Factur-X
 * and XRechnung use it (the inverse of `parsers/cii.ts`).
 *
 * Element order follows the D16B XSD, not the parser. What the model holds beyond EN 16931 (country
 * extensions, clearance data, withholdings, payment schedules, national type codes...) has no place in
 * this binding and is not written. The EN 16931 values that CII cannot carry are listed on `toCii`.
 */
import type {
  Address,
  AllowanceCharge,
  Attachment,
  CanonicalInvoice,
  Contact,
  Identifier,
  Line,
  Party,
  PaymentInstructions,
  Period,
  Seller,
  VatBreakdown,
} from '../canonical.js';
import { CREDIT_TYPE_CODES } from '../parsers/context.js';
import { sum } from '../values.js';
import {
  type Attrs,
  type Child,
  dec,
  group,
  leaf,
  optDec,
  resolveSpecification,
  serialize,
  type WriterProfile,
  type XmlNode,
} from './shared.js';

export interface CiiOptions {
  /** Stamp the document with this specification (BT-24) and business process (BT-23) instead of the invoice's own. */
  profile?: WriterProfile;
}

const NS = {
  rsm: 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
  ram: 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
  qdt: 'urn:un:unece:uncefact:data:standard:QualifiedDataType:100',
  udt: 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100',
};

const ram = (name: string, text: string | undefined, attrs?: Attrs) => leaf(`ram:${name}`, text, attrs);
/** An aggregate that is left out when it has no content. */
const agg = (name: string, ...children: Child[]) => group(`ram:${name}`, children);
/** An aggregate that is written even when empty (the schema requires it). */
const aggK = (name: string, ...children: Child[]): XmlNode => group(`ram:${name}`, children, { keepEmpty: true })!;
const rsm = (name: string, ...children: Child[]): XmlNode => group(`rsm:${name}`, children, { keepEmpty: true })!;

/** UN/CEFACT format 102: YYYYMMDD. */
const compact = (iso: string) => iso.replace(/-/g, '');
/** `<ram:Tag><udt:DateTimeString format="102">20260131</udt:DateTimeString></ram:Tag>` */
const dateTime = (tag: string, iso: string | undefined, inner = 'udt:DateTimeString') =>
  iso === undefined ? undefined : agg(tag, leaf(inner, compact(iso), { format: '102' }));
const indicator = (v: boolean) => agg('ChargeIndicator', leaf('udt:Indicator', String(v)));

const IBAN = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/;

/**
 * Writes the invoice as a CII D16B document. Deterministic: the same invoice gives the same bytes. Throws
 * `WriterError` for a value that is not a decimal.
 *
 * A credit note whose type code is not a credit code is written with 381, since CII reads the direction from the type
 * code. Not carried, because the EN 16931 CII binding has no place for it: the issue time, the card network, more
 * than one preceding invoice (only the first is written), sub-lines, a credit transfer beyond the first of a payment
 * (it becomes its own payment means), the tax point date and date code (BT-7, BT-8) when there is no VAT breakdown to carry
 * them, a gross price (BT-148) without a price discount (BT-147), and everything outside EN 16931.
 */
export function toCii(invoice: CanonicalInvoice, options: CiiOptions = {}): string {
  const cur = invoice.currency;
  const spec = resolveSpecification(invoice, options.profile, 'en16931');
  const typeCode = invoice.kind === 'creditNote' && !CREDIT_TYPE_CODES.has(invoice.typeCode) ? '381' : invoice.typeCode;
  const firstDd = invoice.payments.find((p) => p.directDebit)?.directDebit;

  const refDoc = (tag: string, id: string | undefined) => (id === undefined ? undefined : agg(tag, ram('IssuerAssignedID', id)));

  const agreement = aggK(
    'ApplicableHeaderTradeAgreement',
    ram('BuyerReference', invoice.buyerReference),
    agg('SellerTradeParty', ...tradeParty(invoice.seller, invoice.seller)),
    agg('BuyerTradeParty', ...tradeParty(invoice.buyer)),
    invoice.taxRepresentative
      ? agg(
          'SellerTaxRepresentativeTradeParty',
          ram('Name', invoice.taxRepresentative.name),
          address(invoice.taxRepresentative.address),
          invoice.taxRepresentative.vatId
            ? agg('SpecifiedTaxRegistration', ram('ID', invoice.taxRepresentative.vatId, { schemeID: 'VA' }))
            : undefined,
        )
      : undefined,
    refDoc('SellerOrderReferencedDocument', invoice.salesOrderRef),
    refDoc('BuyerOrderReferencedDocument', invoice.purchaseOrderRef),
    refDoc('ContractReferencedDocument', invoice.contractRef),
    invoice.invoicedObjectId
      ? agg(
          'AdditionalReferencedDocument',
          ram('IssuerAssignedID', invoice.invoicedObjectId.value),
          ram('TypeCode', '130'),
          ram('ReferenceTypeCode', invoice.invoicedObjectId.schemeId),
        )
      : undefined,
    invoice.tenderRef !== undefined
      ? agg('AdditionalReferencedDocument', ram('IssuerAssignedID', invoice.tenderRef), ram('TypeCode', '50'))
      : undefined,
    ...invoice.attachments.map(attachmentRef),
    invoice.projectRef !== undefined
      ? agg('SpecifiedProcuringProject', ram('ID', invoice.projectRef), ram('Name', invoice.projectRef))
      : undefined,
  );

  const d = invoice.delivery;
  const shipTo = d && (d.partyName !== undefined || d.locationId || d.address) ? agg('ShipToTradeParty', ...shipToChildren(d)) : undefined;
  const delivery = aggK(
    'ApplicableHeaderTradeDelivery',
    shipTo,
    d?.actualDate !== undefined ? agg('ActualDeliverySupplyChainEvent', dateTime('OccurrenceDateTime', d.actualDate)) : undefined,
    refDoc('DespatchAdviceReferencedDocument', invoice.despatchAdviceRef),
    refDoc('ReceivingAdviceReferencedDocument', invoice.receivingAdviceRef),
  );

  const remittance = invoice.payments.find((p) => p.remittanceInformation !== undefined)?.remittanceInformation;
  const tax = taxes(invoice);
  const terms =
    invoice.paymentTerms !== undefined || invoice.dueDate !== undefined || firstDd?.mandateId !== undefined
      ? agg(
          'SpecifiedTradePaymentTerms',
          ram('Description', invoice.paymentTerms),
          dateTime('DueDateDateTime', invoice.dueDate),
          ram('DirectDebitMandateID', firstDd?.mandateId),
        )
      : undefined;
  const payee = invoice.payee
    ? aggK(
        'PayeeTradeParty',
        ...idChildren(invoice.payee.identifier ? [invoice.payee.identifier] : []),
        ram('Name', invoice.payee.name),
        invoice.payee.legalRegistrationId ? agg('SpecifiedLegalOrganization', idEl('ID', invoice.payee.legalRegistrationId)) : undefined,
      )
    : undefined;
  const settlement = aggK(
    'ApplicableHeaderTradeSettlement',
    ram('CreditorReferenceID', firstDd?.creditorId),
    ram('PaymentReference', remittance),
    ram('TaxCurrencyCode', invoice.taxCurrency),
    ram('InvoiceCurrencyCode', cur),
    payee,
    ...invoice.payments.flatMap(paymentMeans),
    ...tax,
    period(invoice.invoicePeriod),
    ...invoice.allowances.map((a) => allowanceCharge(a, false, true)),
    ...invoice.charges.map((a) => allowanceCharge(a, true, true)),
    terms,
    monetarySummation(invoice),
    invoice.precedingInvoices[0] && invoice.precedingInvoices[0].id !== ''
      ? agg(
          'InvoiceReferencedDocument',
          ram('IssuerAssignedID', invoice.precedingInvoices[0].id),
          dateTime('FormattedIssueDateTime', invoice.precedingInvoices[0].issueDate, 'qdt:DateTimeString'),
        )
      : undefined,
    invoice.accountingRef !== undefined ? agg('ReceivableSpecifiedTradeAccountingAccount', ram('ID', invoice.accountingRef)) : undefined,
  );

  const root = rsm(
    'CrossIndustryInvoice',
    rsm(
      'ExchangedDocumentContext',
      spec.businessProcess !== undefined
        ? agg('BusinessProcessSpecifiedDocumentContextParameter', ram('ID', spec.businessProcess))
        : undefined,
      agg('GuidelineSpecifiedDocumentContextParameter', ram('ID', spec.specificationId)),
    ),
    rsm(
      'ExchangedDocument',
      ram('ID', invoice.id),
      ram('TypeCode', typeCode),
      dateTime('IssueDateTime', invoice.issueDate),
      ...invoice.notes.map((n) => agg('IncludedNote', ram('Content', n.text), ram('SubjectCode', n.subjectCode))),
    ),
    rsm('SupplyChainTradeTransaction', ...invoice.lines.map(line), agreement, delivery, settlement),
  );
  return serialize(root, { 'xmlns:rsm': NS.rsm, 'xmlns:ram': NS.ram, 'xmlns:qdt': NS.qdt, 'xmlns:udt': NS.udt });
}

const idEl = (name: 'ID' | 'GlobalID', id: Identifier) => ram(name, id.value, { schemeID: id.schemeId });

/** Identifiers without a scheme are `ID`, with a scheme `GlobalID`; the schema wants every `ID` before every `GlobalID`. */
function idChildren(ids: Identifier[]): (XmlNode | undefined)[] {
  return [...ids.filter((i) => !i.schemeId).map((i) => idEl('ID', i)), ...ids.filter((i) => i.schemeId).map((i) => idEl('GlobalID', i))];
}

function address(a: Address | undefined): XmlNode | undefined {
  if (!a) return undefined;
  return agg(
    'PostalTradeAddress',
    ram('PostcodeCode', a.postalCode),
    ram('LineOne', a.line1),
    ram('LineTwo', a.line2),
    ram('LineThree', a.line3),
    ram('CityName', a.city),
    ram('CountryID', a.countryCode),
    ram('CountrySubDivisionName', a.countrySubdivision),
  );
}

function contact(c: Contact | undefined): XmlNode | undefined {
  if (!c) return undefined;
  return agg(
    'DefinedTradeContact',
    ram('PersonName', c.name),
    c.phone !== undefined ? agg('TelephoneUniversalCommunication', ram('CompleteNumber', c.phone)) : undefined,
    c.email !== undefined ? agg('EmailURIUniversalCommunication', ram('URIID', c.email)) : undefined,
  );
}

/** The children of a SellerTradeParty / BuyerTradeParty, in schema order. */
function tradeParty(p: Party, seller?: Seller): Child[] {
  return [
    ...idChildren(p.identifiers),
    ram('Name', p.name),
    ram('Description', seller?.additionalLegalInfo),
    agg(
      'SpecifiedLegalOrganization',
      p.legalRegistrationId ? idEl('ID', p.legalRegistrationId) : undefined,
      ram('TradingBusinessName', p.tradingName),
    ),
    contact(p.contact),
    address(p.address),
    p.endpoint ? agg('URIUniversalCommunication', ram('URIID', p.endpoint.value, { schemeID: p.endpoint.schemeId })) : undefined,
    p.vatId !== undefined ? agg('SpecifiedTaxRegistration', ram('ID', p.vatId, { schemeID: 'VA' })) : undefined,
    seller?.taxRegistrationId !== undefined
      ? agg('SpecifiedTaxRegistration', ram('ID', seller.taxRegistrationId, { schemeID: 'FC' }))
      : undefined,
  ];
}

function shipToChildren(d: NonNullable<CanonicalInvoice['delivery']>): Child[] {
  return [
    d.locationId ? idEl(d.locationId.schemeId ? 'GlobalID' : 'ID', d.locationId) : undefined,
    ram('Name', d.partyName),
    address(d.address),
  ];
}

function attachmentRef(a: Attachment): XmlNode | undefined {
  switch (a.kind) {
    case 'embedded':
      return agg(
        'AdditionalReferencedDocument',
        ram('IssuerAssignedID', a.id),
        ram('TypeCode', '916'),
        ram('Name', a.description),
        ram('AttachmentBinaryObject', a.base64, { mimeCode: a.mimeCode, filename: a.filename }),
      );
    case 'external':
      return agg(
        'AdditionalReferencedDocument',
        ram('IssuerAssignedID', a.id),
        ram('URIID', a.uri),
        ram('TypeCode', '916'),
        ram('Name', a.description),
      );
    case 'reference':
      // The binding reads attachments by type code 916 only, so a reference is written with that.
      return agg('AdditionalReferencedDocument', ram('IssuerAssignedID', a.id), ram('TypeCode', '916'), ram('Name', a.description));
  }
}

/** One payment means per credit transfer (CII allows a single payee account per means). Card and debtor account ride on the first. */
function paymentMeans(p: PaymentInstructions): XmlNode[] {
  const transfers = p.creditTransfers.length > 0 ? p.creditTransfers : [undefined];
  return transfers.map((t, i) => {
    const first = i === 0;
    return aggK(
      'SpecifiedTradeSettlementPaymentMeans',
      ram('TypeCode', p.meansCode),
      ram('Information', p.meansText),
      first && p.card
        ? agg('ApplicableTradeSettlementFinancialCard', ram('ID', p.card.primaryAccountNumber), ram('CardholderName', p.card.holderName))
        : undefined,
      first && p.directDebit?.debitedAccountId !== undefined
        ? agg('PayerPartyDebtorFinancialAccount', ram('IBANID', p.directDebit.debitedAccountId))
        : undefined,
      t
        ? agg(
            'PayeePartyCreditorFinancialAccount',
            IBAN.test(t.accountId.replace(/\s+/g, '')) ? ram('IBANID', t.accountId) : undefined,
            ram('AccountName', t.accountName),
            IBAN.test(t.accountId.replace(/\s+/g, '')) ? undefined : ram('ProprietaryID', t.accountId),
          )
        : undefined,
      t?.serviceProviderId !== undefined ? agg('PayeeSpecifiedCreditorFinancialInstitution', ram('BICID', t.serviceProviderId)) : undefined,
    );
  });
}

/**
 * The VAT breakdown. The tax point date (BT-7) and date code (BT-8) belong to the document but CII keeps them on the
 * VAT lines; they are written on the first.
 */
function taxes(inv: CanonicalInvoice): XmlNode[] {
  return inv.vatBreakdown.map((v: VatBreakdown, i) => {
    const first = i === 0;
    return aggK(
      'ApplicableTradeTax',
      ram('CalculatedAmount', dec(v.taxAmount, 'VAT tax amount')),
      ram('TypeCode', 'VAT'),
      ram('ExemptionReason', v.exemptionReason),
      ram('BasisAmount', dec(v.taxableAmount, 'VAT taxable amount')),
      ram('CategoryCode', v.categoryCode),
      ram('ExemptionReasonCode', v.exemptionReasonCode),
      first ? dateTime('TaxPointDate', inv.taxPointDate, 'udt:DateString') : undefined,
      first ? ram('DueDateTypeCode', inv.vatPointDateCode) : undefined,
      ram('RateApplicablePercent', optDec(v.rate, 'VAT rate')),
    );
  });
}

function allowanceCharge(a: AllowanceCharge, charge: boolean, docLevel: boolean): XmlNode {
  return aggK(
    'SpecifiedTradeAllowanceCharge',
    indicator(charge),
    ram('CalculationPercent', optDec(a.percentage, 'allowance/charge percentage')),
    ram('BasisAmount', optDec(a.baseAmount, 'allowance/charge base amount')),
    ram('ActualAmount', dec(a.amount, 'allowance/charge amount')),
    ram('ReasonCode', a.reasonCode),
    ram('Reason', a.reason),
    docLevel && a.vat
      ? agg(
          'CategoryTradeTax',
          ram('TypeCode', 'VAT'),
          ram('CategoryCode', a.vat.categoryCode),
          ram('RateApplicablePercent', optDec(a.vat.rate, 'allowance/charge VAT rate')),
        )
      : undefined,
  );
}

function monetarySummation(inv: CanonicalInvoice): XmlNode {
  const t = inv.totals;
  const vatTotal =
    t.vatTotal ?? (inv.vatBreakdown.length > 0 ? sum(inv.vatBreakdown.map((v) => dec(v.taxAmount, 'VAT tax amount'))) : undefined);
  return aggK(
    'SpecifiedTradeSettlementHeaderMonetarySummation',
    ram('LineTotalAmount', dec(t.lineNetTotal, 'line net total')),
    ram('ChargeTotalAmount', optDec(t.chargeTotal, 'charge total')),
    ram('AllowanceTotalAmount', optDec(t.allowanceTotal, 'allowance total')),
    ram('TaxBasisTotalAmount', dec(t.taxExclusive, 'tax exclusive amount')),
    ram('TaxTotalAmount', optDec(vatTotal, 'VAT total'), { currencyID: inv.currency }),
    inv.taxCurrency !== undefined && t.vatTotalInTaxCurrency !== undefined
      ? ram('TaxTotalAmount', dec(t.vatTotalInTaxCurrency, 'VAT total in tax currency'), { currencyID: inv.taxCurrency })
      : undefined,
    ram('RoundingAmount', optDec(t.rounding, 'rounding amount')),
    ram('GrandTotalAmount', dec(t.taxInclusive, 'tax inclusive amount')),
    ram('TotalPrepaidAmount', optDec(t.prepaid, 'prepaid amount')),
    ram('DuePayableAmount', dec(t.payable, 'payable amount')),
  );
}

function period(p: Period | undefined): XmlNode | undefined {
  if (!p) return undefined;
  return agg('BillingSpecifiedPeriod', dateTime('StartDateTime', p.start), dateTime('EndDateTime', p.end));
}

function line(l: Line): XmlNode {
  const it = l.item;
  const p = l.price;
  return aggK(
    'IncludedSupplyChainTradeLineItem',
    aggK(
      'AssociatedDocumentLineDocument',
      ram('LineID', l.id),
      l.note !== undefined ? agg('IncludedNote', ram('Content', l.note)) : undefined,
    ),
    aggK(
      'SpecifiedTradeProduct',
      it.standardId ? idEl('GlobalID', it.standardId) : undefined,
      ram('SellerAssignedID', it.sellerId),
      ram('BuyerAssignedID', it.buyerId),
      ram('Name', it.name),
      ram('Description', it.description),
      ...it.attributes.map((a) => agg('ApplicableProductCharacteristic', ram('Description', a.name), ram('Value', a.value))),
      ...it.classifications.map((k) =>
        agg('DesignatedProductClassification', ram('ClassCode', k.code, { listID: k.listId, listVersionID: k.listVersion })),
      ),
      it.originCountry !== undefined ? agg('OriginTradeCountry', ram('ID', it.originCountry)) : undefined,
    ),
    aggK(
      'SpecifiedLineTradeAgreement',
      l.orderLineRef !== undefined ? agg('BuyerOrderReferencedDocument', ram('LineID', l.orderLineRef)) : undefined,
      p && p.gross !== undefined
        ? agg(
            'GrossPriceProductTradePrice',
            ram('ChargeAmount', dec(p.gross, 'gross price')),
            ram('BasisQuantity', optDec(p.baseQuantity, 'base quantity'), { unitCode: p.baseQuantityUnit }),
            p.discount !== undefined
              ? agg('AppliedTradeAllowanceCharge', indicator(false), ram('ActualAmount', dec(p.discount, 'price discount')))
              : undefined,
          )
        : undefined,
      p
        ? agg(
            'NetPriceProductTradePrice',
            ram('ChargeAmount', dec(p.net, 'unit price')),
            ram('BasisQuantity', optDec(p.baseQuantity, 'base quantity'), { unitCode: p.baseQuantityUnit }),
          )
        : undefined,
    ),
    aggK('SpecifiedLineTradeDelivery', ram('BilledQuantity', optDec(l.quantity, 'line quantity'), { unitCode: l.unitCode })),
    aggK(
      'SpecifiedLineTradeSettlement',
      l.vat
        ? agg(
            'ApplicableTradeTax',
            ram('TypeCode', 'VAT'),
            ram('CategoryCode', l.vat.categoryCode),
            ram('RateApplicablePercent', optDec(l.vat.rate, 'line VAT rate')),
          )
        : undefined,
      period(l.period),
      ...l.allowances.map((a) => allowanceCharge(a, false, false)),
      ...l.charges.map((a) => allowanceCharge(a, true, false)),
      agg('SpecifiedTradeSettlementLineMonetarySummation', ram('LineTotalAmount', dec(l.netAmount, 'line net amount'))),
      l.objectId
        ? agg(
            'AdditionalReferencedDocument',
            ram('IssuerAssignedID', l.objectId.value),
            ram('TypeCode', '130'),
            ram('ReferenceTypeCode', l.objectId.schemeId),
          )
        : undefined,
      l.accountingRef !== undefined ? agg('ReceivableSpecifiedTradeAccountingAccount', ram('ID', l.accountingRef)) : undefined,
    ),
  );
}
