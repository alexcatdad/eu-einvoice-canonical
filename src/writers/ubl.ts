/**
 * Canonical invoice -> UBL 2.1 Invoice / CreditNote, following the EN 16931 UBL binding as Peppol BIS
 * Billing 3.0 documents it (the inverse of `parsers/ubl.ts`).
 *
 * Element order follows the UBL 2.1 XSD, not the parser. What the model holds beyond EN 16931 (country
 * extensions, clearance data, withholdings, payment schedules, national type codes...) has no place in
 * this binding and is not written. The few EN 16931 values that UBL cannot carry are listed on the
 * functions that drop them.
 */
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
  VatBreakdown,
} from '../index.js';
import { values } from '../index.js';

const { sum } = values;

import {
  type Attrs,
  type Child,
  dec,
  group,
  leaf,
  optDec,
  resolveSpecification,
  serialize,
  vatPointCodeForUbl,
  type WriterProfile,
  type XmlNode,
} from './shared.js';

export interface UblOptions {
  /**
   * Stamp the document with this specification (BT-24) and business process (BT-23) instead of the invoice's own.
   * Without it an EN 16931 based identifier is kept and anything else becomes `peppol-bis3`.
   */
  profile?: WriterProfile;
}

const NS = {
  Invoice: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  CreditNote: 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
};

const cbc = (name: string, text: string | undefined, attrs?: Attrs) => leaf(`cbc:${name}`, text, attrs);
/** An aggregate that is left out when it has no content. */
const cac = (name: string, ...children: Child[]) => group(`cac:${name}`, children);
/** An aggregate that is written even when empty (the schema requires it). */
const cacK = (name: string, ...children: Child[]): XmlNode => group(`cac:${name}`, children, { keepEmpty: true })!;
const idEl = (id: Identifier | undefined, name = 'ID') => (id ? cbc(name, id.value, { schemeID: id.schemeId }) : undefined);
const taxScheme = (id: string) => cac('TaxScheme', cbc('ID', id));
const vatCategory = (tag: string, code: string, rate: string | undefined, what: string, ...extra: Child[]): XmlNode =>
  cacK(tag, cbc('ID', code), cbc('Percent', optDec(rate, what)), ...extra, taxScheme('VAT'));

/** An amount element with the currency attribute UBL requires. */
function amount(cur: string, name: string, value: string | undefined, what: string): XmlNode | undefined {
  return cbc(name, optDec(value, what), { currencyID: cur });
}

/**
 * Writes the invoice as a UBL 2.1 document (`Invoice`, or `CreditNote` for `kind: 'creditNote'`).
 * Deterministic: the same invoice gives the same bytes. Throws `WriterError` for a value that is not a decimal.
 *
 * Not carried, because UBL 2.1 has no place for it: the sales order reference (BT-14) without a purchase order
 * reference (BT-13), the due date (BT-9) of a credit note without payment means (UBL puts it in PaymentMeans),
 * a gross price (BT-148) without a price discount (BT-147), and everything outside EN 16931.
 */
export function toUbl(invoice: CanonicalInvoice, options: UblOptions = {}): string {
  const isCn = invoice.kind === 'creditNote';
  const cur = invoice.currency;
  const spec = resolveSpecification(invoice, options.profile, 'peppol-bis3', 'ubl');
  const docRef = (tag: string, id: string | undefined) => (id === undefined ? undefined : cac(tag, cbc('ID', id)));

  const objectRef = invoice.invoicedObjectId
    ? cac('AdditionalDocumentReference', idEl(invoice.invoicedObjectId), cbc('DocumentTypeCode', '130'))
    : undefined;
  // UBL 2.1 CreditNote has no ProjectReference; Peppol carries BT-11 as a document reference of type 50 there.
  const creditNoteProject =
    isCn && invoice.projectRef !== undefined
      ? cac('AdditionalDocumentReference', cbc('ID', invoice.projectRef), cbc('DocumentTypeCode', '50'))
      : undefined;
  const additional = [objectRef, creditNoteProject, ...invoice.attachments.map(attachmentRef)];
  const contract = docRef('ContractDocumentReference', invoice.contractRef);
  const originator = docRef('OriginatorDocumentReference', invoice.tenderRef);
  const project = !isCn && invoice.projectRef !== undefined ? cac('ProjectReference', cbc('ID', invoice.projectRef)) : undefined;

  const invoicePeriod =
    invoice.invoicePeriod || invoice.vatPointDateCode !== undefined
      ? cac(
          'InvoicePeriod',
          cbc('StartDate', invoice.invoicePeriod?.start),
          cbc('EndDate', invoice.invoicePeriod?.end),
          cbc('DescriptionCode', vatPointCodeForUbl(invoice.vatPointDateCode)),
        )
      : undefined;

  const creditNoteDue = isCn ? invoice.dueDate : undefined;
  const paymentMeans = invoice.payments.flatMap((p, i) => paymentMeansOf(p, i === 0 ? creditNoteDue : undefined));

  const sepa = sepaCreditor(invoice.payments);
  const payeeNode = invoice.payee
    ? cacK(
        'PayeeParty',
        invoice.payee.identifier ? cac('PartyIdentification', idEl(invoice.payee.identifier)) : undefined,
        sepa !== undefined ? cac('PartyIdentification', cbc('ID', sepa, { schemeID: 'SEPA' })) : undefined,
        invoice.payee.name ? cac('PartyName', cbc('Name', invoice.payee.name)) : undefined,
        invoice.payee.legalRegistrationId ? cac('PartyLegalEntity', idEl(invoice.payee.legalRegistrationId, 'CompanyID')) : undefined,
      )
    : undefined;

  const children: Child[] = [
    cbc('CustomizationID', spec.specificationId),
    cbc('ProfileID', spec.businessProcess),
    cbc('ID', invoice.id),
    cbc('IssueDate', invoice.issueDate),
    cbc('IssueTime', invoice.issueTime),
    isCn ? undefined : cbc('DueDate', invoice.dueDate),
    isCn ? undefined : cbc('InvoiceTypeCode', invoice.typeCode),
    isCn ? cbc('TaxPointDate', invoice.taxPointDate) : undefined,
    isCn ? cbc('CreditNoteTypeCode', invoice.typeCode) : undefined,
    ...invoice.notes
      .filter((n) => n.text !== '' || n.subjectCode)
      .map((n) => cbc('Note', n.subjectCode ? `#${n.subjectCode}#${n.text}` : n.text)),
    isCn ? undefined : cbc('TaxPointDate', invoice.taxPointDate),
    cbc('DocumentCurrencyCode', cur),
    cbc('TaxCurrencyCode', invoice.taxCurrency),
    cbc('AccountingCost', invoice.accountingRef),
    cbc('BuyerReference', invoice.buyerReference),
    invoicePeriod,
    invoice.purchaseOrderRef !== undefined
      ? cac('OrderReference', cbc('ID', invoice.purchaseOrderRef), cbc('SalesOrderID', invoice.salesOrderRef))
      : undefined,
    ...invoice.precedingInvoices
      .filter((r) => r.id !== '')
      .map((r) => cac('BillingReference', cac('InvoiceDocumentReference', cbc('ID', r.id), cbc('IssueDate', r.issueDate)))),
    docRef('DespatchDocumentReference', invoice.despatchAdviceRef),
    docRef('ReceiptDocumentReference', invoice.receivingAdviceRef),
    // The two document kinds order the remaining references differently.
    ...(isCn ? [contract, ...additional, originator] : [originator, contract, ...additional, project]),
    cacK('AccountingSupplierParty', party(invoice.seller, { seller: invoice.seller, sepa: invoice.payee ? undefined : sepa })),
    cacK('AccountingCustomerParty', party(invoice.buyer, {})),
    payeeNode,
    invoice.taxRepresentative
      ? cac(
          'TaxRepresentativeParty',
          invoice.taxRepresentative.name ? cac('PartyName', cbc('Name', invoice.taxRepresentative.name)) : undefined,
          address('PostalAddress', invoice.taxRepresentative.address),
          invoice.taxRepresentative.vatId
            ? cac('PartyTaxScheme', cbc('CompanyID', invoice.taxRepresentative.vatId), taxScheme('VAT'))
            : undefined,
        )
      : undefined,
    delivery(invoice),
    ...paymentMeans,
    invoice.paymentTerms !== undefined ? cac('PaymentTerms', cbc('Note', invoice.paymentTerms)) : undefined,
    ...invoice.allowances.map((a) => allowanceCharge(a, false, cur, true)),
    ...invoice.charges.map((a) => allowanceCharge(a, true, cur, true)),
    ...taxTotals(invoice),
    legalMonetaryTotal(invoice),
    ...invoice.lines.map((l) => line(l, isCn, cur, false)),
  ];

  const root = group(isCn ? 'CreditNote' : 'Invoice', children, { keepEmpty: true })!;
  return serialize(root, { xmlns: isCn ? NS.CreditNote : NS.Invoice, 'xmlns:cac': NS.cac, 'xmlns:cbc': NS.cbc });
}

/** The SEPA creditor identifier (BT-90) of the first payment that has one; UBL carries it as a party identifier of scheme SEPA. */
function sepaCreditor(payments: PaymentInstructions[]): string | undefined {
  return payments.find((p) => p.directDebit?.creditorId)?.directDebit?.creditorId;
}

function address(tag: string, a: Address | undefined): XmlNode | undefined {
  if (!a) return undefined;
  return cac(
    tag,
    cbc('StreetName', a.line1),
    cbc('AdditionalStreetName', a.line2),
    cbc('CityName', a.city),
    cbc('PostalZone', a.postalCode),
    cbc('CountrySubentity', a.countrySubdivision),
    a.line3 !== undefined ? cac('AddressLine', cbc('Line', a.line3)) : undefined,
    a.countryCode !== undefined ? cac('Country', cbc('IdentificationCode', a.countryCode)) : undefined,
  );
}

function contact(c: Contact | undefined): XmlNode | undefined {
  if (!c) return undefined;
  return cac('Contact', cbc('Name', c.name), cbc('Telephone', c.phone), cbc('ElectronicMail', c.email));
}

function party(p: Party, opts: { seller?: Seller; sepa?: string }): XmlNode {
  const s = opts.seller;
  return cacK(
    'Party',
    idEl(p.endpoint, 'EndpointID'),
    ...p.identifiers.map((id) => cac('PartyIdentification', idEl(id))),
    opts.sepa !== undefined ? cac('PartyIdentification', cbc('ID', opts.sepa, { schemeID: 'SEPA' })) : undefined,
    p.tradingName !== undefined ? cac('PartyName', cbc('Name', p.tradingName)) : undefined,
    address('PostalAddress', p.address),
    p.vatId !== undefined ? cac('PartyTaxScheme', cbc('CompanyID', p.vatId), taxScheme('VAT')) : undefined,
    s?.taxRegistrationId !== undefined ? cac('PartyTaxScheme', cbc('CompanyID', s.taxRegistrationId), taxScheme('TAX')) : undefined,
    cac(
      'PartyLegalEntity',
      cbc('RegistrationName', p.name),
      idEl(p.legalRegistrationId, 'CompanyID'),
      cbc('CompanyLegalForm', s?.additionalLegalInfo),
    ),
    contact(p.contact),
  );
}

function delivery(inv: CanonicalInvoice): XmlNode | undefined {
  const d = inv.delivery;
  if (!d) return undefined;
  return cac(
    'Delivery',
    cbc('ActualDeliveryDate', d.actualDate),
    cac('DeliveryLocation', idEl(d.locationId), address('Address', d.address)),
    d.partyName !== undefined ? cac('DeliveryParty', cac('PartyName', cbc('Name', d.partyName))) : undefined,
  );
}

/**
 * One PaymentMeans per credit transfer: UBL allows a single payee account per PaymentMeans, so a payment with
 * several accounts becomes several PaymentMeans. Card, mandate and the credit note due date ride on the first.
 */
function paymentMeansOf(p: PaymentInstructions, creditNoteDue: string | undefined): XmlNode[] {
  const transfers: (CreditTransfer | undefined)[] = p.creditTransfers.length > 0 ? p.creditTransfers : [undefined];
  return transfers.map((t, i) => {
    const first = i === 0;
    const mandate = first ? p.directDebit : undefined;
    const card = first ? p.card : undefined;
    return cacK(
      'PaymentMeans',
      cbc('PaymentMeansCode', p.meansCode, { name: p.meansText }),
      first ? cbc('PaymentDueDate', creditNoteDue) : undefined,
      cbc('PaymentID', p.remittanceInformation),
      card
        ? cac(
            'CardAccount',
            cbc('PrimaryAccountNumberID', card.primaryAccountNumber),
            // NetworkID is mandatory in UBL; Peppol says to send NA when the network is unknown.
            cbc('NetworkID', card.network ?? 'NA'),
            cbc('HolderName', card.holderName),
          )
        : undefined,
      t
        ? cac(
            'PayeeFinancialAccount',
            cbc('ID', t.accountId),
            cbc('Name', t.accountName),
            t.serviceProviderId !== undefined ? cac('FinancialInstitutionBranch', cbc('ID', t.serviceProviderId)) : undefined,
          )
        : undefined,
      mandate && (mandate.mandateId !== undefined || mandate.debitedAccountId !== undefined)
        ? cac(
            'PaymentMandate',
            cbc('ID', mandate.mandateId),
            mandate.debitedAccountId !== undefined ? cac('PayerFinancialAccount', cbc('ID', mandate.debitedAccountId)) : undefined,
          )
        : undefined,
    );
  });
}

function allowanceCharge(a: AllowanceCharge, charge: boolean, cur: string, docLevel: boolean): XmlNode {
  return cacK(
    'AllowanceCharge',
    cbc('ChargeIndicator', String(charge)),
    cbc('AllowanceChargeReasonCode', a.reasonCode),
    cbc('AllowanceChargeReason', a.reason),
    cbc('MultiplierFactorNumeric', optDec(a.percentage, 'allowance/charge percentage')),
    amount(cur, 'Amount', a.amount, 'allowance/charge amount'),
    amount(cur, 'BaseAmount', a.baseAmount, 'allowance/charge base amount'),
    docLevel && a.vat ? vatCategory('TaxCategory', a.vat.categoryCode, a.vat.rate, 'allowance/charge VAT rate') : undefined,
  );
}

/**
 * The VAT total (BT-110) with the breakdown, then the VAT total in the tax currency (BT-111). When the model has a
 * breakdown but no total, the total is the exact decimal sum of the breakdown's tax amounts: UBL requires one.
 */
function taxTotals(inv: CanonicalInvoice): (XmlNode | undefined)[] {
  const cur = inv.currency;
  const total =
    inv.totals.vatTotal ?? (inv.vatBreakdown.length > 0 ? sum(inv.vatBreakdown.map((v) => dec(v.taxAmount, 'VAT tax amount'))) : undefined);
  return [
    total !== undefined
      ? cacK('TaxTotal', amount(cur, 'TaxAmount', total, 'VAT total'), ...inv.vatBreakdown.map((v) => taxSubtotal(v, cur)))
      : undefined,
    inv.taxCurrency !== undefined && inv.totals.vatTotalInTaxCurrency !== undefined
      ? cacK('TaxTotal', amount(inv.taxCurrency, 'TaxAmount', inv.totals.vatTotalInTaxCurrency, 'VAT total in tax currency'))
      : undefined,
  ];
}

function taxSubtotal(v: VatBreakdown, cur: string): XmlNode {
  return cacK(
    'TaxSubtotal',
    amount(cur, 'TaxableAmount', v.taxableAmount, 'VAT taxable amount'),
    amount(cur, 'TaxAmount', v.taxAmount, 'VAT tax amount'),
    vatCategory(
      'TaxCategory',
      v.categoryCode,
      v.rate,
      'VAT rate',
      cbc('TaxExemptionReasonCode', v.exemptionReasonCode),
      cbc('TaxExemptionReason', v.exemptionReason),
    ),
  );
}

function legalMonetaryTotal(inv: CanonicalInvoice): XmlNode {
  const t = inv.totals;
  const cur = inv.currency;
  return cacK(
    'LegalMonetaryTotal',
    amount(cur, 'LineExtensionAmount', t.lineNetTotal, 'line net total'),
    amount(cur, 'TaxExclusiveAmount', t.taxExclusive, 'tax exclusive amount'),
    amount(cur, 'TaxInclusiveAmount', t.taxInclusive, 'tax inclusive amount'),
    amount(cur, 'AllowanceTotalAmount', t.allowanceTotal, 'allowance total'),
    amount(cur, 'ChargeTotalAmount', t.chargeTotal, 'charge total'),
    amount(cur, 'PrepaidAmount', t.prepaid, 'prepaid amount'),
    amount(cur, 'PayableRoundingAmount', t.rounding, 'rounding amount'),
    amount(cur, 'PayableAmount', t.payable, 'payable amount'),
  );
}

function attachmentRef(a: Attachment): XmlNode | undefined {
  switch (a.kind) {
    case 'embedded':
      return cac(
        'AdditionalDocumentReference',
        cbc('ID', a.id),
        cbc('DocumentDescription', a.description),
        cac('Attachment', cbc('EmbeddedDocumentBinaryObject', a.base64, { mimeCode: a.mimeCode, filename: a.filename })),
      );
    case 'external':
      return cac(
        'AdditionalDocumentReference',
        cbc('ID', a.id),
        cbc('DocumentDescription', a.description),
        cac('Attachment', cac('ExternalReference', cbc('URI', a.uri))),
      );
    case 'reference':
      return cac(
        'AdditionalDocumentReference',
        cbc('ID', a.id, { schemeID: a.schemeId }),
        cbc('DocumentTypeCode', a.typeCode),
        cbc('DocumentDescription', a.description),
      );
  }
}

function period(p: Period | undefined): XmlNode | undefined {
  if (!p) return undefined;
  return cac('InvoicePeriod', cbc('StartDate', p.start), cbc('EndDate', p.end));
}

function line(l: Line, isCn: boolean, cur: string, sub: boolean): XmlNode {
  const lineTag = sub ? (isCn ? 'SubCreditNoteLine' : 'SubInvoiceLine') : isCn ? 'CreditNoteLine' : 'InvoiceLine';
  const qtyTag = isCn ? 'CreditedQuantity' : 'InvoicedQuantity';
  const it = l.item;
  return cacK(
    lineTag,
    cbc('ID', l.id),
    l.note !== undefined ? cbc('Note', l.note) : undefined,
    cbc(qtyTag, optDec(l.quantity, 'line quantity'), { unitCode: l.unitCode }),
    amount(cur, 'LineExtensionAmount', l.netAmount, 'line net amount'),
    cbc('AccountingCost', l.accountingRef),
    period(l.period),
    l.orderLineRef !== undefined ? cac('OrderLineReference', cbc('LineID', l.orderLineRef)) : undefined,
    l.objectId ? cac('DocumentReference', idEl(l.objectId), cbc('DocumentTypeCode', '130')) : undefined,
    ...l.allowances.map((a) => allowanceCharge(a, false, cur, false)),
    ...l.charges.map((a) => allowanceCharge(a, true, cur, false)),
    cacK(
      'Item',
      cbc('Description', it.description),
      cbc('Name', it.name),
      it.buyerId !== undefined ? cac('BuyersItemIdentification', cbc('ID', it.buyerId)) : undefined,
      it.sellerId !== undefined ? cac('SellersItemIdentification', cbc('ID', it.sellerId)) : undefined,
      it.standardId ? cac('StandardItemIdentification', idEl(it.standardId)) : undefined,
      it.originCountry !== undefined ? cac('OriginCountry', cbc('IdentificationCode', it.originCountry)) : undefined,
      ...it.classifications.map((k) =>
        cac('CommodityClassification', cbc('ItemClassificationCode', k.code, { listID: k.listId, listVersionID: k.listVersion })),
      ),
      l.vat ? vatCategory('ClassifiedTaxCategory', l.vat.categoryCode, l.vat.rate, 'line VAT rate') : undefined,
      ...it.attributes.map((a) => cac('AdditionalItemProperty', cbc('Name', a.name), cbc('Value', a.value))),
    ),
    price(l, cur),
    ...(l.subLines ?? []).map((s) => line(s, isCn, cur, true)),
  );
}

function price(l: Line, cur: string): XmlNode | undefined {
  const p = l.price;
  if (!p) return undefined;
  return cac(
    'Price',
    amount(cur, 'PriceAmount', p.net, 'unit price'),
    cbc('BaseQuantity', optDec(p.baseQuantity, 'base quantity'), { unitCode: p.baseQuantityUnit }),
    p.discount !== undefined
      ? cacK(
          'AllowanceCharge',
          cbc('ChargeIndicator', 'false'),
          amount(cur, 'Amount', p.discount, 'price discount'),
          amount(cur, 'BaseAmount', p.gross, 'gross price'),
        )
      : undefined,
  );
}
