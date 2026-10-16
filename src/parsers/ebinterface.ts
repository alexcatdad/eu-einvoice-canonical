/**
 * ebInterface 4.3 - 6.1 (Austrian national invoice format) -> canonical.
 *
 * The namespace carries the version (http://www.ebinterface.at/schema/6p1/), so every element is
 * matched by local name. Attributes are read by local name too, because senders qualify them
 * (`eb:DocumentType`) even though the schemas leave them unqualified.
 *
 * Version differences handled here:
 * - 4.3 states VAT in Tax/VAT/VATItem (TaxedAmount, VATRate or TaxExemption, Amount) and on lines as
 *   VATRate / TaxExemption; 5.0 and later use TaxItem (TaxableAmount, TaxPercent@TaxCategoryCode, TaxAmount).
 * - 4.3 has one Phone, Email and a text Contact inside Address; 5.0 and later have a Contact element.
 *
 * ebInterface has no net total. BT-106 is the sum of the line amounts and BT-109 follows from it
 * and the document-level reductions and surcharges; both are recorded in `source.derived`.
 */
import type { Element } from '@xmldom/xmldom';
import type {
  Address,
  AllowanceCharge,
  CanonicalInvoice,
  Contact,
  Line,
  OtherTax,
  Party,
  PaymentInstallment,
  PaymentInstructions,
  Seller,
  Totals,
  VatBreakdown,
  VatInfo,
} from '../canonical.js';
import { add, cmp, isZero, sub, sum, toDecimal } from '../values.js';
import { Ctx, finish, ParseError, parseXml, sourceMeta } from './context.js';
import type { ParseInput } from './index.js';

/** DocumentType -> UNCL 1001 code and direction. */
const DOCUMENT_TYPES: Record<string, { typeCode: string; credit?: boolean; selfBilled?: boolean }> = {
  Invoice: { typeCode: '380' },
  InvoiceForAdvancePayment: { typeCode: '386' },
  InvoiceForPartialDelivery: { typeCode: '326' },
  FinalSettlement: { typeCode: '380' },
  SelfBilling: { typeCode: '389', selfBilled: true },
  SubsequentDebit: { typeCode: '383' },
  CreditMemo: { typeCode: '381', credit: true },
  SubsequentCredit: { typeCode: '381', credit: true },
};

/** Units are UN/ECE Rec 20 in practice; these free-text spellings are still common. */
const UNITS: Record<string, string> = {
  stk: 'H87',
  'stk.': 'H87',
  st: 'H87',
  stück: 'H87',
  pcs: 'H87',
  stunde: 'HUR',
  std: 'HUR',
  'std.': 'HUR',
  h: 'HUR',
  tag: 'DAY',
  tage: 'DAY',
  monat: 'MON',
  jahr: 'ANN',
  kg: 'KGM',
  l: 'LTR',
  m: 'MTR',
  km: 'KMT',
  pauschal: 'LS',
};

/** Attribute by local name, whatever its prefix. */
function attrOf(e: Element | undefined, name: string): string | undefined {
  if (!e) return undefined;
  for (let i = 0; i < e.attributes.length; i++) {
    const a = e.attributes.item(i)!;
    if ((a.localName ?? a.name) === name && a.value.trim()) return a.value.trim();
  }
  return undefined;
}

export function parseEbinterface(input: ParseInput): CanonicalInvoice[] {
  const root = parseXml(input.payload.xml);
  const c = new Ctx({});

  const id = c.text(root, 'InvoiceNumber');
  const issueDate = c.date(root, 'InvoiceDate', 'BT-2');
  if (!id || !issueDate) throw new ParseError('Invoice number (BT-1) or issue date (BT-2) missing');
  const currency = attrOf(root, 'InvoiceCurrency');
  if (!currency) throw new ParseError('InvoiceCurrency attribute missing');
  const docType = attrOf(root, 'DocumentType') ?? 'Invoice';
  const typeDef = DOCUMENT_TYPES[docType];
  if (!typeDef) c.warn('EB-DOCUMENT-TYPE', `Unknown DocumentType '${docType}'; treated as an invoice (380)`);
  const def = typeDef ?? { typeCode: '380' };
  if (attrOf(root, 'IsDuplicate') === 'true') c.warn('EB-DUPLICATE', 'The document is marked as a duplicate (IsDuplicate)');
  const title = attrOf(root, 'DocumentTitle');
  if (title) c.unmapped['/Invoice/@DocumentTitle'] = title;

  // Parties
  const billerEl = c.el(root, 'Biller');
  const recipientEl = c.el(root, 'InvoiceRecipient');
  if (!billerEl || !recipientEl) throw new ParseError('Biller or InvoiceRecipient missing');
  const seller = party(c, billerEl) as Seller;
  const billerRecipientId = c.text(billerEl, 'InvoiceRecipientsBillerID');
  if (billerRecipientId) seller.identifiers.push({ value: billerRecipientId });
  const buyer = party(c, recipientEl);
  const billersRecipientId = c.text(recipientEl, 'BillersInvoiceRecipientID');
  if (billersRecipientId) buyer.identifiers.push({ value: billersRecipientId });
  const area = c.text(recipientEl, 'AccountingArea');
  if (area) c.unmapped['/Invoice/InvoiceRecipient/AccountingArea'] = area;
  const sub0 = c.text(recipientEl, 'SubOrganizationID');
  if (sub0) c.unmapped['/Invoice/InvoiceRecipient/SubOrganizationID'] = sub0;
  const additionalParties: CanonicalInvoice['additionalParties'] = [];
  const orderingEl = c.el(root, 'OrderingParty');
  if (orderingEl) {
    const p = party(c, orderingEl);
    const oid = c.text(orderingEl, 'BillersOrderingPartyID');
    if (oid) p.identifiers.push({ value: oid });
    additionalParties.push({ role: 'ordering-party', party: p });
  }

  // References
  const lineEls = c.all(root, 'Details/ItemList/ListLineItem');
  const lineOrders = [...new Set(lineEls.map((l) => c.text(l, 'InvoiceRecipientsOrderReference/OrderID')).filter((x): x is string => !!x))];
  let purchaseOrderRef = c.text(recipientEl, 'OrderReference/OrderID');
  if (!purchaseOrderRef && lineOrders.length === 1) {
    purchaseOrderRef = lineOrders[0];
    c.derive('/purchaseOrderRef', 'No order reference on InvoiceRecipient; every line names the same order');
  }
  const precedingInvoices: CanonicalInvoice['precedingInvoices'] = [];
  const cancelled = c.el(root, 'CancelledOriginalDocument');
  if (cancelled)
    precedingInvoices.push({ id: c.text(cancelled, 'InvoiceNumber') ?? '', issueDate: c.date(cancelled, 'InvoiceDate', 'BG-3') });
  for (const r of c.all(root, 'RelatedDocument')) {
    const rid = c.text(r, 'InvoiceNumber');
    if (rid) precedingInvoices.push({ id: rid, issueDate: c.date(r, 'InvoiceDate', 'BG-3') });
  }
  const cancelComment = c.text(cancelled, 'Comment');

  // Delivery
  const deliveryEl = c.el(root, 'Delivery');
  const deliveryDate = c.date(deliveryEl, 'Date', 'BT-72');
  const periodEl = c.el(deliveryEl, 'Period');
  const period = periodEl
    ? { start: c.date(periodEl, 'FromDate', 'delivery period start'), end: c.date(periodEl, 'ToDate', 'delivery period end') }
    : undefined;
  if (period) c.derive('/invoicePeriod', 'ebInterface Delivery/Period (the delivery period) used for BG-14');
  const deliveryAddress = c.el(deliveryEl, 'Address');
  const deliveryId = c.text(deliveryEl, 'DeliveryID');
  const delivery = deliveryEl
    ? {
        partyName: c.text(deliveryAddress, 'Name'),
        locationId: deliveryId ? { value: deliveryId } : undefined,
        actualDate: deliveryDate,
        address: address(c, deliveryAddress),
      }
    : undefined;

  // Lines, document reductions and surcharges, VAT, totals
  const lines = lineEls.map((l, i) => line(c, l, i + 1));
  const rsEl = c.el(root, 'ReductionAndSurchargeDetails');
  const allowances = reductionsAndSurcharges(c, rsEl, 'Reduction');
  const charges = reductionsAndSurcharges(c, rsEl, 'Surcharge');
  const otherTaxes = otherTaxList(c, root, rsEl);
  const { vatBreakdown } = vat(c, root);
  const totals = totalsOf(c, root, lines, allowances, charges, vatBreakdown);
  if (lines.length === 0) c.warn('NO_LINES', 'The invoice has no lines');
  for (const b of c.all(root, 'Details/BelowTheLineItem')) {
    const v = c.dec(b, 'LineItemAmount');
    c.unmapped[`/Invoice/Details/BelowTheLineItem[${c.text(b, 'Description') ?? ''}]`] = v ?? '';
  }

  // Payment
  const { payments } = paymentMethod(c, root);
  const conditions = c.el(root, 'PaymentConditions');
  const dueDate = c.date(conditions, 'DueDate', 'BT-9');
  const { terms, schedule } = paymentConditions(c, conditions, dueDate);

  // Exchange rate: the accounting currency in which VAT is also stated
  const fx = c.el(root, 'CurrencyExchangeInformation');
  const fxRate = c.dec(fx, 'ExchangeRate');
  const fxCurrency = c.text(fx, 'Currency');
  const fxComment = c.text(fx, 'Comment');
  if (fxComment) c.unmapped['/Invoice/CurrencyExchangeInformation/Comment'] = fxComment;

  const notes: CanonicalInvoice['notes'] = [];
  for (const a of c.all(root, 'AdditionalInformation')) {
    const v = c.text(a);
    if (v) notes.push({ text: attrOf(a, 'Key') ? `${attrOf(a, 'Key')}: ${v}` : v });
  }
  for (const t of [c.text(root, 'Details/HeaderDescription'), c.text(root, 'Details/FooterDescription'), c.text(root, 'Comment')])
    if (t) notes.push({ text: t });

  const version = input.details.version;
  c.derive('/specificationId', 'ebInterface has no specification identifier; set from the format and the namespace version');
  const salesOrder = c.text(billerEl, 'OrderReference/OrderID');

  const inv = {
    kind: def.credit ? 'creditNote' : 'invoice',
    typeCode: def.typeCode,
    id,
    issueDate,
    selfBilled: !!def.selfBilled,
    currency,
    taxCurrency: fxCurrency,
    exchangeRate: fxRate !== undefined ? { rate: fxRate, date: c.date(fx, 'ExchangeRateDate', 'exchange rate date') } : undefined,
    purchaseOrderRef,
    salesOrderRef: salesOrder,
    paymentTerms: terms,
    dueDate,
    notes,
    specificationId: `ebinterface:${version ?? ''}`.replace(/:$/, ''),
    precedingInvoices,
    correction: cancelComment ? { reason: cancelComment } : undefined,
    invoicePeriod: period,
    seller,
    buyer,
    additionalParties,
    delivery,
    payments,
    paymentSchedule: schedule,
    allowances,
    charges,
    totals,
    vatBreakdown,
    otherTaxes,
    withholdings: [],
    attachments: [],
    lines,
    clearance: [],
    extensions: { at: { ebInterfaceVersion: version, documentType: docType } },
    source: sourceMeta(input, root, c),
  } as CanonicalInvoice;
  return [finish(inv)];
}

function party(c: Ctx, p: Element): Party {
  const out: Party & Partial<Seller> = { identifiers: [], nationalTaxIds: [] };
  const a = c.el(p, 'Address');
  out.name = c.text(a, 'Name');
  out.tradingName = c.text(a, 'TradingName');
  out.vatId = c.text(p, 'VATIdentificationNumber');
  for (const f of c.all(p, 'FurtherIdentification')) {
    const value = c.text(f);
    const type = attrOf(f, 'IdentificationType');
    if (value) out.nationalTaxIds.push({ value, schemeId: type ? `AT:${type}` : 'AT:ID' });
  }
  out.address = address(c, a);
  out.contact = contact(c, p, a);
  return out;
}

function address(c: Ctx, a: Element | undefined): Address | undefined {
  if (!a) return undefined;
  const country = c.el(a, 'Country');
  return {
    line1: c.text(a, 'Street'),
    line2: c.text(a, 'POBox'),
    city: c.text(a, 'Town'),
    postalCode: c.text(a, 'ZIP'),
    countryCode: attrOf(country, 'CountryCode'),
  };
}

/** 5.0+: a Contact element on the party; 4.3: a text Contact, one Phone and one Email inside Address. */
function contact(c: Ctx, p: Element, a: Element | undefined): Contact | undefined {
  const ct = c.el(p, 'Contact') ?? c.el(a, 'Contact');
  const complex = ct && c.el(ct, 'Name');
  const src = complex ? ct : a;
  const phones = c.texts(src, 'Phone');
  const emails = c.texts(src, 'Email');
  if (phones.length > 1) c.unmapped['/Invoice/.../Phone (further)'] = phones.slice(1).join(', ');
  if (emails.length > 1) c.unmapped['/Invoice/.../Email (further)'] = emails.slice(1).join(', ');
  const name = complex ? c.text(ct, 'Name') : c.text(ct);
  if (!name && !phones.length && !emails.length) return undefined;
  return { name, phone: phones[0], email: emails[0] };
}

/** TaxItem (5.0+), or 4.3's VATRate / TaxExemption pair, as VAT category data. */
function vatOf(c: Ctx, holder: Element | undefined): VatInfo | undefined {
  if (!holder) return undefined;
  const item = c.el(holder, 'TaxItem') ?? holder;
  const percent = c.el(item, 'TaxPercent');
  if (percent) {
    const code = attrOf(percent, 'TaxCategoryCode');
    if (!code) throw new ParseError('TaxPercent without TaxCategoryCode');
    const comment = c.text(item, 'Comment');
    return { categoryCode: code, rate: c.dec(percent), exemptionReason: code === 'S' ? undefined : comment };
  }
  const rateEl = c.el(item, 'VATRate');
  const exemption = c.el(item, 'TaxExemption');
  if (exemption) {
    c.derive('/vat/categoryCode', 'ebInterface 4.x TaxExemption without a category code; mapped to E with the stated reason');
    return { categoryCode: 'E', rate: '0' as VatInfo['rate'], exemptionReason: c.text(exemption) };
  }
  if (rateEl) {
    const rate = c.dec(rateEl)!;
    c.derive('/vat/categoryCode', 'ebInterface 4.x VATRate carries no category; S for a rate above 0, Z otherwise');
    return { categoryCode: cmp(rate, '0') > 0 ? 'S' : 'Z', rate, nationalCode: attrOf(rateEl, 'TaxCode') };
  }
  return undefined;
}

function reductionsAndSurcharges(c: Ctx, parent: Element | undefined, tag: 'Reduction' | 'Surcharge'): AllowanceCharge[] {
  const out: AllowanceCharge[] = [];
  for (const e of c.all(parent, tag)) {
    const amount = c.dec(e, 'Amount');
    if (amount === undefined) {
      c.warn('EB-NO-AMOUNT', `${tag} without Amount (only a base and a percentage); skipped, not recomputed`);
      continue;
    }
    out.push({
      amount,
      baseAmount: c.dec(e, 'BaseAmount'),
      percentage: c.dec(e, 'Percentage'),
      reason: c.text(e, 'Comment'),
      vat: vatOf(c, e),
    });
  }
  return out;
}

function otherTaxList(c: Ctx, root: Element, rs: Element | undefined): OtherTax[] {
  const out: OtherTax[] = [];
  for (const t of c.all(root, 'Tax/OtherTax')) {
    const amount = c.dec(t, 'TaxAmount') ?? c.dec(t, 'Amount');
    if (amount === undefined) continue;
    const comment = c.text(t, 'Comment');
    if (comment) c.unmapped[`/Invoice/Tax/OtherTax[${out.length + 1}]/Comment`] = comment;
    out.push({ scheme: 'AT:OTHER', taxableAmount: c.dec(t, 'TaxableAmount'), rate: c.dec(t, 'TaxPercent'), amount, includedInTotal: true });
  }
  for (const t of c.all(rs, 'OtherVATableTax')) {
    const amount = c.dec(t, 'TaxItem/TaxAmount') ?? c.dec(t, 'TaxAmount');
    if (amount === undefined) continue;
    out.push({
      scheme: `AT:${c.text(t, 'TaxID') ?? 'OTHER-VATABLE'}`,
      taxableAmount: c.dec(t, 'TaxItem/TaxableAmount'),
      rate: c.dec(t, 'TaxItem/TaxPercent'),
      amount,
      includedInTotal: true,
    });
  }
  return out;
}

function vat(c: Ctx, root: Element): { vatBreakdown: VatBreakdown[] } {
  const tax = c.el(root, 'Tax');
  const items = [...c.all(tax, 'TaxItem'), ...c.all(tax, 'VAT/VATItem')];
  const vatBreakdown = items.map((t): VatBreakdown => {
    const info = vatOf(c, t);
    if (!info) throw new ParseError('Tax item without a rate or exemption');
    const taxable = c.dec(t, 'TaxableAmount') ?? c.dec(t, 'TaxedAmount');
    if (taxable === undefined) throw new ParseError('Tax item without a taxable amount');
    let taxAmount = c.dec(t, 'TaxAmount') ?? c.dec(t, 'Amount');
    if (taxAmount === undefined) {
      if (info.rate !== undefined && !isZero(info.rate)) throw new ParseError('Tax item with a rate but no tax amount');
      taxAmount = '0.00' as VatBreakdown['taxAmount'];
      c.derive('/vatBreakdown/*/taxAmount', 'Tax item without TaxAmount and a zero or exempt rate; 0.00');
    }
    const acc = c.el(t, 'AccountingCurrencyAmount');
    return {
      taxableAmount: taxable,
      taxAmount,
      categoryCode: info.categoryCode,
      rate: info.rate,
      exemptionReason: info.exemptionReason,
      taxAmountInTaxCurrency: c.dec(acc),
      nationalCode: info.nationalCode,
    };
  });
  return { vatBreakdown };
}

function totalsOf(
  c: Ctx,
  root: Element,
  lines: Line[],
  allowances: AllowanceCharge[],
  charges: AllowanceCharge[],
  breakdown: VatBreakdown[],
): Totals {
  const gross = c.dec(root, 'TotalGrossAmount');
  if (gross === undefined) throw new ParseError('TotalGrossAmount missing');
  const prepaid = c.dec(root, 'PrepaidAmount');
  const rounding = c.dec(root, 'RoundingAmount');
  let payable = c.dec(root, 'PayableAmount');
  if (payable === undefined) {
    // PayableAmount is optional up to ebInterface 4.x; real invoices omit it. BT-115 = BT-112 - BT-113 + BT-114.
    payable = add(sub(gross, prepaid ?? '0'), rounding ?? '0');
    c.derive('/totals/payable', 'PayableAmount absent: TotalGrossAmount - PrepaidAmount + RoundingAmount');
    c.warn('EB-NO-PAYABLE', 'PayableAmount is absent; the amount due was derived from TotalGrossAmount');
  }
  const lineNetTotal = sum(lines.map((l) => l.netAmount));
  c.derive('/totals/lineNetTotal', 'ebInterface has no net total; sum of the LineItemAmount values');
  const allowanceTotal = allowances.length ? sum(allowances.map((a) => a.amount)) : undefined;
  const chargeTotal = charges.length ? sum(charges.map((a) => a.amount)) : undefined;
  if (allowanceTotal) c.derive('/totals/allowanceTotal', 'Sum of the document-level reductions');
  if (chargeTotal) c.derive('/totals/chargeTotal', 'Sum of the document-level surcharges');
  const taxExclusive = add(sub(lineNetTotal, allowanceTotal ?? '0'), chargeTotal ?? '0');
  c.derive('/totals/taxExclusive', 'Computed as BT-106 - BT-107 + BT-108');
  const vatTotal = breakdown.length ? sum(breakdown.map((b) => b.taxAmount)) : undefined;
  if (vatTotal !== undefined) c.derive('/totals/vatTotal', 'Sum of the tax item amounts');
  const inTaxCurrency = breakdown.map((b) => b.taxAmountInTaxCurrency).filter((x): x is NonNullable<typeof x> => !!x);
  return {
    lineNetTotal,
    allowanceTotal,
    chargeTotal,
    taxExclusive,
    vatTotal,
    vatTotalInTaxCurrency: inTaxCurrency.length ? sum(inTaxCurrency) : undefined,
    taxInclusive: gross,
    prepaid,
    rounding,
    payable,
  };
}

function line(c: Ctx, l: Element, n: number): Line {
  const id = c.text(l, 'PositionNumber') ?? String(n);
  const netAmount = c.dec(l, 'LineItemAmount');
  if (netAmount === undefined) throw new ParseError(`Line ${id}: LineItemAmount missing`);
  const descriptions = c.texts(l, 'Description');
  if (!descriptions.length) c.warn('EB-NO-ITEM-NAME', `Line ${id}: no Description (BT-153 is mandatory in EN 16931)`);

  let sellerId: string | undefined;
  let buyerId: string | undefined;
  let standardId: Line['item']['standardId'];
  const attributes: { name: string; value: string }[] = [];
  for (const a of c.all(l, 'ArticleNumber')) {
    const v = c.text(a);
    if (!v) continue;
    const type = attrOf(a, 'ArticleNumberType');
    if (type === 'GTIN') standardId = { value: v, schemeId: '0160' };
    else if (type === 'InvoiceRecipientsArticleNumber') buyerId = buyerId ?? v;
    else if (type === 'PZN') attributes.push({ name: 'PZN', value: v });
    else sellerId = sellerId ?? v;
  }
  for (const a of c.all(l, 'AdditionalInformation')) {
    const v = c.text(a);
    if (v) attributes.push({ name: attrOf(a, 'Key') ?? 'AdditionalInformation', value: v });
  }

  const qty = c.el(l, 'Quantity');
  const unitText = attrOf(qty, 'Unit');
  const mapped = unitText ? UNITS[unitText.toLowerCase()] : undefined;
  const unitCode = mapped ?? (unitText && /^[A-Z0-9]{2,3}$/.test(unitText) ? unitText : undefined);

  const priceEl = c.el(l, 'UnitPrice');
  const rs = c.el(l, 'ReductionAndSurchargeListLineItemDetails');
  const lineAllowances = lineRs(c, rs, 'ReductionListLineItem');
  const lineCharges = lineRs(c, rs, 'SurchargeListLineItem');
  if (c.el(rs, 'OtherVATableTaxListLineItem'))
    c.unmapped[`/Invoice/Details/ItemList/ListLineItem[${n}]/OtherVATableTaxListLineItem`] = 'present';

  const vatInfo = vatOf(c, l);
  const nonVatDisc = c.el(l, 'DiscountFlag');
  if (nonVatDisc) c.unmapped[`/Invoice/Details/ItemList/ListLineItem[${n}]/DiscountFlag`] = c.text(nonVatDisc) ?? '';

  return {
    id,
    quantity: c.dec(qty),
    unitCode,
    unitText: unitText && unitText !== unitCode ? unitText : undefined,
    netAmount,
    orderLineRef: c.text(l, 'InvoiceRecipientsOrderReference/OrderPositionNumber'),
    allowances: lineAllowances,
    charges: lineCharges,
    price: priceEl && c.dec(priceEl) !== undefined ? { net: c.dec(priceEl)!, baseQuantity: numAttr(priceEl, 'BaseQuantity') } : undefined,
    vat: vatInfo,
    item: {
      name: descriptions[0] ?? '',
      description: descriptions.length > 1 ? descriptions.slice(1).join('\n') : undefined,
      sellerId,
      buyerId,
      standardId,
      classifications: c
        .all(l, 'Classification')
        .map((k) => ({ code: c.text(k) ?? '', listId: attrOf(k, 'ClassificationSchema') ?? '' }))
        .filter((k) => k.code),
      attributes,
    },
  };
}

function numAttr(e: Element, name: string) {
  const v = attrOf(e, name);
  if (v === undefined) return undefined;
  try {
    return toDecimal(v);
  } catch {
    throw new ParseError(`${name}: not a decimal: "${v}"`);
  }
}

function lineRs(c: Ctx, parent: Element | undefined, tag: string): AllowanceCharge[] {
  const out: AllowanceCharge[] = [];
  for (const e of c.all(parent, tag)) {
    const amount = c.dec(e, 'Amount');
    if (amount === undefined) {
      c.warn('EB-NO-AMOUNT', `${tag} without Amount (only a base and a percentage); skipped, not recomputed`);
      continue;
    }
    out.push({ amount, baseAmount: c.dec(e, 'BaseAmount'), percentage: c.dec(e, 'Percentage'), reason: c.text(e, 'Comment') });
  }
  return out;
}

function paymentMethod(c: Ctx, root: Element): { payments: PaymentInstructions[]; meansText?: string } {
  const pm = c.el(root, 'PaymentMethod');
  if (!pm) return { payments: [] };
  const meansText = c.text(pm, 'Comment');
  const payments: PaymentInstructions[] = [];

  const ubt = c.el(pm, 'UniversalBankTransaction');
  if (ubt) {
    const accounts = c.all(ubt, 'BeneficiaryAccount');
    const transfers = accounts
      .map((a) => {
        const iban = c.text(a, 'IBAN');
        const nr = c.text(a, 'BankAccountNr');
        const bank = c.text(a, 'BankCode');
        return {
          accountId: iban ?? nr ?? '',
          accountName: c.text(a, 'BankAccountOwner'),
          serviceProviderId: c.text(a, 'BIC') ?? bank,
        };
      })
      .filter((t) => t.accountId);
    const sepa = accounts.some((a) => c.text(a, 'IBAN'));
    c.derive(
      '/payments/0/meansCode',
      `ebInterface UniversalBankTransaction -> ${sepa ? '58 (SEPA credit transfer, IBAN given)' : '30 (credit transfer)'}`,
    );
    payments.push({
      meansCode: sepa ? '58' : '30',
      meansText,
      remittanceInformation: c.text(ubt, 'PaymentReference'),
      creditTransfers: transfers,
    });
    if (attrOf(ubt, 'ConsolidatorPayable') === 'true')
      c.unmapped['/Invoice/PaymentMethod/UniversalBankTransaction/@ConsolidatorPayable'] = 'true';
  }
  const dd = c.el(pm, 'SEPADirectDebit');
  if (dd) {
    c.derive('/payments/0/meansCode', 'ebInterface SEPADirectDebit -> 59');
    payments.push({
      meansCode: '59',
      meansText,
      nationalMeansCode: c.text(dd, 'Type'),
      creditTransfers: [],
      directDebit: {
        mandateId: c.text(dd, 'MandateReference'),
        creditorId: c.text(dd, 'CreditorID'),
        debitedAccountId: c.text(dd, 'IBAN'),
      },
    });
    const collect = c.text(dd, 'DebitCollectionDate');
    if (collect) c.unmapped['/Invoice/PaymentMethod/SEPADirectDebit/DebitCollectionDate'] = collect;
  }
  const card = c.el(pm, 'PaymentCard');
  if (card) {
    payments.push({
      meansCode: '48',
      meansText,
      creditTransfers: [],
      card: { primaryAccountNumber: c.text(card, 'PrimaryAccountNumber') ?? '', holderName: c.text(card, 'CardHolderName') },
    });
  }
  if (c.el(pm, 'OtherPayment')) payments.push({ meansCode: 'ZZZ', meansText, creditTransfers: [] });
  if (c.el(pm, 'NoPayment')) c.unmapped['/Invoice/PaymentMethod/NoPayment'] = meansText ?? 'true';
  return { payments, meansText };
}

function paymentConditions(
  c: Ctx,
  cond: Element | undefined,
  dueDate: string | undefined,
): { terms?: string; schedule: PaymentInstallment[] } {
  if (!cond) return { schedule: [] };
  const lines: string[] = [];
  const comment = c.text(cond, 'Comment');
  if (comment) lines.push(comment);
  const schedule: PaymentInstallment[] = [];
  for (const d of c.all(cond, 'Discount')) {
    const date = c.date(d, 'PaymentDate', 'discount date');
    const pct = c.text(d, 'Percentage');
    const amount = c.dec(d, 'Amount');
    const base = c.dec(d, 'BaseAmount');
    const text = [pct ? `${pct} %` : undefined, amount ? `${amount}` : undefined].filter(Boolean).join(' / ');
    const description = `Discount ${text}${base ? ` on ${base}` : ''} if paid by ${date}${c.text(d, 'Comment') ? `: ${c.text(d, 'Comment')}` : ''}`;
    lines.push(description);
    schedule.push({ dueDate: date, description });
  }
  const min = c.dec(cond, 'MinimumPayment');
  if (min) lines.push(`Minimum payment ${min}`);
  if (schedule.length && dueDate) schedule.push({ dueDate: dueDate as PaymentInstallment['dueDate'], description: 'Net due date' });
  return { terms: lines.join('\n') || undefined, schedule };
}
