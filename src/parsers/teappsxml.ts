/**
 * TEAPPSXML (Tieto / TietoEVRY Invoice Center, root INVOICE_CENTER) -> canonical.
 *
 * Source: the public TEAPPSXML v.3.0 "Empty INVOICES-structure with explanations" and
 * Implementation Guide. No namespace; INVOICE_CENTER/CONTENT_FRAME/INVOICES/INVOICE is
 * the invoice, and one file can hold several frames and invoices.
 *
 * - Amounts are `AMOUNT` elements with SIGN (+/-) and VAT (INCLUDED/EXCLUDED); several can
 *   sit in one parent. Credit notes carry SIGN="-", which is kept as a leading minus.
 * - Dates are DATE/{DAY,MONTH,CENTURY,DECADE_AND_YEAR}.
 * - The party is PAYEE (seller) and RECEIVER (buyer); other roles go to additionalParties.
 * - Row types INFO and SUBTOTAL carry no invoice amounts and header rows (MAIN) that have
 *   SPECIFICATION rows are only headings; none of these become lines.
 */
import type { Element } from '@xmldom/xmldom';
import type {
  AdditionalParty, Address, AllowanceCharge, Attachment, CanonicalInvoice, Decimal, Identifier, IsoDate, Line,
  Party, PaymentInstallment, PaymentInstructions, Seller, Totals, VatBreakdown, VatInfo,
} from '../canonical.js';
import { ValueError, add, isZero, sub, toDecimal, toIsoDate } from '../values.js';
import { CREDIT_TYPE_CODES, Ctx, ParseError, SELF_BILLED_TYPE_CODES, finish, parseXml, sourceMeta } from './context.js';
import type { ParseInput } from './index.js';
import { recordUnmapped } from './leftover.js';

/** HEADER/INVOICE_TYPE codes (TEAPPSXML) -> UNTDID 1001, used when UNTDID_CODE is not given. */
const TYPE_MAP: Record<string, string> = {
  '00': '380', '01': '381', '02': '380', '03': '380', '04': '381', '05': '381', '06': '380', '07': '381', '31': '381',
};

const PARTY_HANDLED = [
  'CUSTOMER_NAME', 'CUSTOMER_ID', 'ADDRESS', 'TRADING_NAME', 'VAT_NUMBER', 'ORGANIZATION_NUMBER', 'PARTY_IDENTIFICATION_ID',
  'CONTACT_INFORMATION', 'E-MAIL_ADDRESS',
];
const ADDRESS_HANDLED = ['STREET_ADDRESS1', 'STREET_ADDRESS2', 'STREET_ADDRESS3', 'SUBDIVISION', 'POSTAL_CODE', 'POST_OFFICE', 'COUNTRY_CODE'];
/** Parties other than PAYEE and RECEIVER and the role each gets in `additionalParties`. */
const OTHER_PARTIES: [element: string, role: string][] = [
  ['INVOICE_SENDER', 'issuer'], ['INVOICE_RECIPIENT', 'recipient'], ['SALES_CONTACT', 'sales-contact'], ['ORDERER', 'orderer'],
  ['DELIVERER', 'deliverer'], ['PAYER', 'payer'], ['PAYOR', 'payor'], ['MANUFACTURER', 'manufacturer'], ['HOLDER', 'holder'],
];

export function parseTeappsxml(input: ParseInput): CanonicalInvoice[] {
  const root = parseXml(input.payload.xml);
  const probe = new Ctx({});
  const out: CanonicalInvoice[] = [];
  let n = 0;
  probe.all(root, 'CONTENT_FRAME').forEach((frame, f) => {
    const version = probe.text(frame, 'BLOCK_RULES/FORMAT_VERSION');
    probe.all(frame, 'INVOICES/INVOICE').forEach((invoice, i) => {
      n++;
      out.push(parseInvoice(input, root, invoice, version, `/INVOICE_CENTER/CONTENT_FRAME[${f + 1}]/INVOICES/INVOICE[${i + 1}]`));
    });
  });
  if (n === 0) throw new ParseError('INVOICE_CENTER holds no CONTENT_FRAME/INVOICES/INVOICE');
  return out;
}

function parseInvoice(input: ParseInput, root: Element, inv: Element, formatVersion: string | undefined, fragmentPath: string): CanonicalInvoice {
  const c = new Ctx({});
  const header = c.el(inv, 'HEADER');
  if (!header) throw new ParseError('INVOICE without HEADER');
  const summary = c.el(inv, 'SUMMARY');
  const payeeEl = c.el(inv, 'PAYEE');
  const receiverEl = c.el(inv, 'RECEIVER');

  const id = c.text(header, 'INVOICE_ID');
  const issueDate = dateOf(c, c.el(header, 'INVOICE_DATE'), 'BT-2');
  if (!id || !issueDate) throw new ParseError('Invoice number (BT-1) or issue date (BT-2) missing');

  // Type
  const typeEl = c.el(header, 'INVOICE_TYPE');
  const typeText = c.text(typeEl);
  const untdid = c.attr(typeEl, undefined, 'UNTDID_CODE');
  let typeCode = untdid ?? (typeText !== undefined ? TYPE_MAP[typeText] : undefined);
  if (!untdid && typeCode) c.derive('/typeCode', `TEAPPSXML INVOICE_TYPE ${typeText} mapped to UNTDID 1001 ${typeCode}`);
  if (!typeCode) {
    typeCode = '380';
    c.derive('/typeCode', typeText ? `TEAPPSXML INVOICE_TYPE ${typeText} has no UNTDID equivalent; assumed 380` : 'INVOICE_TYPE absent; assumed 380');
    if (typeText) c.warn('TYPE_UNKNOWN', `INVOICE_TYPE ${typeText} is not a sales or credit invoice type; treated as 380`);
  }

  // Currency
  let currency = c.text(header, 'CURRENCY/CODE') ?? c.text(summary, 'VAT_SUMMARY/CURRENCY_CODE');
  if (!currency) {
    currency = 'EUR';
    c.derive('/currency', 'No currency element in the invoice; EUR assumed (Finnish operator format)');
    c.warn('CURRENCY_ASSUMED', 'No currency code (BT-5) in the invoice; EUR assumed');
  }
  const otherCurrency = c.el(summary, 'VAT_TOTAL_IN_OTHER_CURRENCY');
  const taxCurrency = c.text(otherCurrency, 'CURRENCY/CODE');

  // Parties
  const seller = partyOf(c, payeeEl) as Seller;
  seller.taxRegistrationId = c.text(payeeEl, 'PRELIMINARY_TAX_REGISTERED');
  seller.additionalLegalInfo = c.text(payeeEl, 'ADDITIONAL_LEGAL_INFO');
  const buyer = partyOf(c, receiverEl);
  if (!payeeEl) c.warn('NO_PAYEE', 'PAYEE (seller) missing');
  if (!receiverEl) c.warn('NO_RECEIVER', 'RECEIVER (buyer) missing');
  const additionalParties: AdditionalParty[] = [];
  for (const [element, role] of OTHER_PARTIES) {
    for (const p of c.all(inv, element)) additionalParties.push({ role, sourceRole: element, party: partyOf(c, p) });
  }
  const other = c.all(inv, 'OTHER_PARTNER');
  for (const p of other) additionalParties.push({ role: c.attr(p, undefined, 'PARTNER_TYPE') ?? 'other', sourceRole: `OTHER_PARTNER:${c.attr(p, undefined, 'PARTNER_TYPE') ?? ''}`, party: partyOf(c, p) });
  const deliveryParty = c.el(inv, 'DELIVERY_PARTY');

  // References
  const orders = c.all(header, 'ORDER_INFORMATION');
  const orderOf = (type: string) => orders.find((o) => c.attr(o, undefined, 'ORDER_TYPE') === type);
  const co = orderOf('CO');
  const vn = orderOf('VN');
  const contract = c.el(header, 'CONTRACT_INFORMATION');
  const project = c.el(header, 'PROJECT_INFORMATION');
  const invoicedObject = c.el(header, 'INVOICED_OBJECT');
  const posting = c.el(header, 'PAYER_POSTING_GROUP_DEFAULTS/POSTING_DEFAULT');

  // Notes
  const notes = [
    ...c.all(header, 'HEADER_INFO').map((h) => ({ subjectCode: c.attr(h, 'TITLE', 'INFO_TYPE'), text: c.text(h, 'CONTENT') ?? c.text(h, 'TITLE') ?? '' })),
    ...c.all(header, 'FREE_TEXT').map((t) => ({ text: c.text(t) ?? '' })),
  ].filter((nn) => nn.text);

  const preceding = precedingInvoices(c, header, summary);
  const payments = paymentsOf(c, inv, header, payeeEl);
  const lines = rowsOf(c, inv);
  if (lines.length === 0) c.warn('NO_LINES', 'The invoice has no invoice rows');
  const { totals, vatBreakdown } = totalsAndVat(c, summary);

  const epi = c.text(payeeEl, 'DETAILS_OF_PAYMENT/FI_PAYMENT_REFERENCE') ?? c.text(inv, 'EpiDetails/EpiPaymentInstructionDetails/EpiRemittanceInfoIdentifier');
  const specId = c.text(header, 'SPECIFICATION_ID');
  if (!specId) c.derive('/specificationId', 'SPECIFICATION_ID absent; synthesised from the TEAPPSXML format version');

  unmappedFor(c, inv, header, payeeEl, receiverEl, [co, vn, contract, project].filter((x): x is Element => !!x));

  const result = {
    kind: CREDIT_TYPE_CODES.has(typeCode) ? 'creditNote' : 'invoice',
    typeCode,
    id,
    issueDate,
    nationalType: typeText ? { scheme: 'FI:TEAPPSXML:INVOICE_TYPE', code: typeText } : undefined,
    selfBilled: SELF_BILLED_TYPE_CODES.has(typeCode),
    currency,
    taxCurrency,
    exchangeRate: exchangeRate(c, otherCurrency),
    taxPointDate: dateOf(c, c.el(header, 'TAX_POINT_DATE'), 'BT-7'),
    vatPointDateCode: c.text(header, 'TAX_POINT_DATE/DATE_CODE'),
    dueDate: dateOf(c, c.el(header, 'DUE_DATE'), 'BT-9'),
    buyerReference: c.text(co, 'ORDER_REFERENCE') ?? c.text(header, 'BUYER_REFERENCE') ?? c.text(header, 'ORDER_REFERENCE'),
    projectRef: c.text(project, 'PROJECT_NUMBER'),
    contractRef: c.text(contract, 'CONTRACT_NUMBER'),
    purchaseOrderRef: c.text(co, 'ORDER_NUMBER') ?? c.text(header, 'INVOICE_ORDER_NUMBER'),
    salesOrderRef: c.text(vn, 'ORDER_NUMBER'),
    receivingAdviceRef: c.text(header, 'TRANSPORT_INFORMATION/TRANSPORT_NOTE'),
    despatchAdviceRef: c.text(header, 'NOTE_NUMBER'),
    tenderRef: c.text(header, 'OFFER_REFERENCE'),
    invoicedObjectId: c.id(invoicedObject, undefined, 'SCHEME_ID'),
    accountingRef: c.text(posting, 'ACCOUNT_REFERENCE'),
    paymentTerms: c.text(header, 'TERMS_OF_PAYMENT'),
    notes,
    businessProcess: c.text(header, 'BUSINESS_PROCESS_TYPE'),
    specificationId: specId ?? `teappsxml:${formatVersion ?? ''}`.replace(/:$/, ''),
    precedingInvoices: preceding,
    invoicePeriod: periodOf(c, header),
    seller,
    buyer,
    taxRepresentative: undefined,
    additionalParties,
    delivery: deliveryOf(c, header, deliveryParty),
    payments,
    paymentSchedule: c.all(inv, 'PART_PAYMENTS/PAYMENT').map((p): PaymentInstallment => ({
      dueDate: dateOf(c, c.el(p, 'PART_DUE_DATE'), 'part payment due date'),
      amount: amount(c, p, 'PART_SUM', 'INCLUDED'),
      description: c.text(p, 'PART_ID'),
    })),
    allowances: allowanceCharges(c, summary, 'DISCOUNT', 'DISCOUNT_NAME', 'DISCOUNT_FROM_AMOUNT', 'DISCOUNT_AMOUNT', true),
    charges: allowanceCharges(c, summary, 'CHARGES', 'CHARGE_NAME', 'CHARGE_FROM_AMOUNT', 'CHARGE_AMOUNT', true),
    totals,
    vatBreakdown,
    otherTaxes: [],
    withholdings: [],
    attachments: attachments(c, inv, header),
    lines,
    clearance: [],
    extensions: { fi: { epiReference: epi } },
    source: sourceMeta(input, root, c, {
      formatVersion: formatVersion ?? input.details.version,
      specificationId: specId,
      fragmentPath,
    }),
  } as CanonicalInvoice;
  return finish(result);
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** DATE/{CENTURY,DECADE_AND_YEAR,MONTH,DAY} below `el`. */
function dateOf(c: Ctx, el: Element | undefined, field: string): IsoDate | undefined {
  const d = c.el(el, 'DATE');
  if (!d) return undefined;
  const [cc, yy, mm, dd] = ['CENTURY', 'DECADE_AND_YEAR', 'MONTH', 'DAY'].map((name) => c.text(d, name));
  if (!cc && !yy && !mm && !dd) return undefined;
  if (!cc || !yy || !mm || !dd) throw new ParseError(`${field}: incomplete DATE`);
  try {
    return toIsoDate(`${cc.padStart(2, '0')}${yy.padStart(2, '0')}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`).date;
  } catch (e) {
    if (e instanceof ValueError) throw new ParseError(`${field}: ${e.message}`);
    throw e;
  }
}

/** Applies a SIGN="-" attribute as a leading minus (never double-negating, never making -0). */
function signed(c: Ctx, el: Element | undefined): Decimal | undefined {
  const v = c.dec(el);
  if (v === undefined) return undefined;
  const sign = c.attr(el, undefined, 'SIGN');
  if (sign?.startsWith('-') && !v.startsWith('-') && !isZero(v)) return `-${v}` as Decimal;
  return v;
}

/**
 * The AMOUNT below `parent/path` that matches the VAT attribute. An AMOUNT without a VAT
 * attribute is used when no AMOUNT states the requested taxability.
 */
function amount(c: Ctx, parent: Element | undefined, path: string, vat: 'INCLUDED' | 'EXCLUDED'): Decimal | undefined {
  const els = c.all(parent, path ? `${path}/AMOUNT` : 'AMOUNT');
  const hit = els.find((e) => c.attr(e, undefined, 'VAT') === vat) ?? els.find((e) => !c.attr(e, undefined, 'VAT'));
  return signed(c, hit);
}

function quantity(c: Ctx, el: Element | undefined) {
  return { value: signed(c, el), unitCode: c.attr(el, undefined, 'Q_UNIT_UNECE_CODE'), unitText: c.attr(el, undefined, 'Q_UNIT') };
}

function idOf(c: Ctx, el: Element | undefined): Identifier | undefined {
  const value = c.text(el);
  if (!value) return undefined;
  const schemeId = c.attr(el, undefined, 'SCHEME_ID') ?? c.attr(el, undefined, 'AUTHORITY');
  return schemeId ? { value, schemeId } : { value };
}

function periodOf(c: Ctx, parent: Element | undefined) {
  const start = dateOf(c, c.el(parent, 'START_PERIOD'), 'period start');
  const end = dateOf(c, c.el(parent, 'END_PERIOD'), 'period end');
  return start || end ? { start, end } : undefined;
}

function exchangeRate(c: Ctx, el: Element | undefined) {
  const rate = c.dec(el, 'CURRENCY/RATE');
  return rate === undefined ? undefined : { rate, date: dateOf(c, c.el(el, 'CURRENCY'), 'exchange rate date') };
}

function vatOf(c: Ctx, vat: Element | undefined): VatInfo | undefined {
  if (!vat) return undefined;
  const categoryCode = c.attr(vat, undefined, 'VAT_TYPE');
  if (!categoryCode) c.warn('VAT_CATEGORY_MISSING', 'VAT without VAT_TYPE (UNTDID 5305 category)');
  return { categoryCode: categoryCode ?? '', rate: c.dec(vat, 'RATE') };
}

// ---------------------------------------------------------------------------
// Parties
// ---------------------------------------------------------------------------

function addressOf(c: Ctx, a: Element | undefined): Address | undefined {
  if (!a) return undefined;
  return {
    line1: c.text(a, 'STREET_ADDRESS1'),
    line2: c.text(a, 'STREET_ADDRESS2'),
    line3: c.text(a, 'STREET_ADDRESS3'),
    city: c.text(a, 'POST_OFFICE'),
    postalCode: c.text(a, 'POSTAL_CODE'),
    countrySubdivision: c.text(a, 'SUBDIVISION'),
    countryCode: c.text(a, 'COUNTRY_CODE'),
  };
}

/** `holder` is a party container (PAYEE, RECEIVER...) whose CUSTOMER_INFORMATION carries the party data. */
function partyOf(c: Ctx, holder: Element | undefined): Party {
  const info = c.el(holder, 'CUSTOMER_INFORMATION');
  const contactEl = c.el(info, 'CONTACT_INFORMATION');
  const addr = c.el(info, 'ADDRESS');
  const code = c.text(holder, 'EADDRESS_SCHEME_ID_CODE');
  const service = c.text(holder, 'NET_SERVICE_ID');
  const org = idOf(c, c.el(info, 'ORGANIZATION_NUMBER'));
  const path = `/INVOICE_CENTER/.../${holder?.localName ?? 'party'}/CUSTOMER_INFORMATION`;
  recordUnmapped(c, info, PARTY_HANDLED, path);
  recordUnmapped(c, addr, c.text(addr, 'COUNTRY_CODE') ? [...ADDRESS_HANDLED, 'COUNTRY'] : ADDRESS_HANDLED, `${path}/ADDRESS`);
  return {
    name: c.text(info, 'CUSTOMER_NAME'),
    tradingName: c.text(info, 'TRADING_NAME'),
    identifiers: [idOf(c, c.el(info, 'CUSTOMER_ID')), idOf(c, c.el(info, 'PARTY_IDENTIFICATION_ID'))].filter((i): i is Identifier => !!i),
    legalRegistrationId: org,
    vatId: c.text(info, 'VAT_NUMBER'),
    nationalTaxIds: [],
    endpoint: service ? (code ? { value: service, schemeId: code } : { value: service }) : undefined,
    address: addressOf(c, addr),
    contact: contactEl || c.text(info, 'E-MAIL_ADDRESS') ? {
      name: c.text(contactEl, 'CONTACT_PERSON'),
      phone: c.text(contactEl, 'TELEPHONE_NUMBER'),
      email: c.text(contactEl, 'E-MAIL_ADDRESS') ?? c.text(info, 'E-MAIL_ADDRESS'),
    } : undefined,
  };
}

function deliveryOf(c: Ctx, header: Element | undefined, party: Element | undefined) {
  const actualDate = dateOf(c, c.el(header, 'DELIVERY_DATE'), 'BT-72');
  const info = c.el(party, 'CUSTOMER_INFORMATION');
  if (!actualDate && !info) return undefined;
  return {
    partyName: c.text(info, 'CUSTOMER_NAME'),
    locationId: idOf(c, c.el(info, 'CUSTOMER_ID')),
    actualDate,
    address: addressOf(c, c.el(info, 'ADDRESS')),
  };
}

// ---------------------------------------------------------------------------
// Payment, references, attachments
// ---------------------------------------------------------------------------

function precedingInvoices(c: Ctx, header: Element | undefined, summary: Element | undefined) {
  const refs: { id: string; issueDate?: IsoDate }[] = [];
  const fromHeader = c.text(header, 'CREDIT_INVOICE_NUMBER');
  if (fromHeader) refs.push({ id: fromHeader, issueDate: dateOf(c, c.el(header, 'CREDIT_INVOICE_DATE'), 'BT-26') });
  for (const p of c.all(summary, 'PRECEDING_INVOICE_INFORMATION')) {
    const pid = c.text(p, 'PRECEDING_INVOICE_ID');
    if (pid && !refs.some((r) => r.id === pid)) refs.push({ id: pid, issueDate: dateOf(c, c.el(p, 'PRECEDING_INVOICE_DATE'), 'BT-26') });
  }
  return refs;
}

function paymentsOf(c: Ctx, inv: Element, header: Element | undefined, payee: Element | undefined): PaymentInstructions[] {
  const banks = c.all(payee, 'BANKS');
  const card = c.el(header, 'PAYMENT_CARD_INFORMATION');
  const debit = c.el(header, 'DIRECT_DEBIT_INFO');
  const meansEl = c.el(payee, 'PAYMENT_MEANS');
  const details = c.el(payee, 'DETAILS_OF_PAYMENT');
  const refName = ['FI_PAYMENT_REFERENCE', 'IPI_REFERENCE', 'FREE_TEXT'].find((n) => c.text(details, n));
  recordUnmapped(c, details, refName ? [refName] : [], '/INVOICE_CENTER/.../PAYEE/DETAILS_OF_PAYMENT');
  let meansCode = c.attr(meansEl, undefined, 'PAYMENT_MEANS_CODE');
  if (!meansCode && banks.length) {
    meansCode = '30';
    c.derive('/payments/0/meansCode', 'PAYEE/BANKS given without PAYMENT_MEANS_CODE; credit transfer (30) assumed');
  }
  const remittance = refName ? c.text(details, refName) : undefined;
  if (!meansCode && !card && !debit && !remittance) return [];
  const debited = c.el(debit, 'DEBITED_ACCOUNT');
  return [{
    meansCode: meansCode ?? '',
    meansText: c.text(meansEl),
    remittanceInformation: remittance,
    creditTransfers: banks.map((b) => ({
      accountId: c.text(b, 'IBAN_ACCOUNT_NUMBER') ?? c.text(b, 'BANK_ACCOUNT_NUMBER') ?? '',
      accountName: c.text(b, 'BANK_NAME'),
      serviceProviderId: c.text(b, 'SWIFT_CODE'),
    })),
    card: card ? { primaryAccountNumber: c.text(card, 'PRIMARY_ACCOUNT_NUMBER') ?? '', holderName: c.text(card, 'PAYMENT_CARD_HOLDER') } : undefined,
    directDebit: debit ? {
      mandateId: c.text(debit, 'MANDATE_REFERENCE'),
      creditorId: c.text(debit, 'CREDITOR_ID'),
      debitedAccountId: c.text(debited, 'IBAN_ACCOUNT_NUMBER') ?? c.text(debited, 'BANK_ACCOUNT_NUMBER'),
    } : undefined,
  }];
}

function attachments(c: Ctx, inv: Element, header: Element | undefined): Attachment[] {
  const out: Attachment[] = [];
  for (const img of c.all(inv, 'CONTROL/IMAGE_CONTROL')) {
    const file = c.text(img, 'IMAGE_FILE');
    if (file) out.push({ kind: 'reference', id: file, description: c.text(img, 'IMAGE_DESCRIPTION'), typeCode: c.attr(img, undefined, 'TYPE') });
  }
  for (const link of c.all(header, 'LINKS/LINK')) {
    const uri = c.attr(link, undefined, 'OBJECT') ?? c.text(link);
    if (uri) out.push({ kind: 'external', id: c.attr(link, undefined, 'TYPE') ?? '', uri });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Allowances, charges, totals
// ---------------------------------------------------------------------------

function allowanceCharges(
  c: Ctx, parent: Element | undefined, element: string, nameEl: string, fromEl: string, amountEl: string, docLevel: boolean,
): AllowanceCharge[] {
  return c.all(parent, element).map((a) => {
    const value = amount(c, a, amountEl, 'EXCLUDED');
    if (value === undefined) throw new ParseError(`${element} without ${amountEl}`);
    if (value.startsWith('-') && element === 'DISCOUNT') c.warn('ALLOWANCE_SIGN', 'A discount carries a negative sign; kept as sent');
    return {
      amount: value,
      baseAmount: amount(c, a, fromEl, 'EXCLUDED'),
      percentage: c.dec(a, 'PER_CENT'),
      reason: c.text(a, nameEl),
      reasonCode: c.attr(a, undefined, 'TYPE'),
      vat: docLevel ? vatOf(c, c.el(a, 'VAT')) : undefined,
    };
  });
}

function totalsAndVat(c: Ctx, s: Element | undefined): { totals: Totals; vatBreakdown: VatBreakdown[] } {
  if (!s) throw new ParseError('SUMMARY (invoice totals) missing');
  const payable = amount(c, s, 'INVOICE_TOTAL', 'INCLUDED');
  if (payable === undefined) throw new ParseError('SUMMARY/INVOICE_TOTAL (BT-115) missing');
  const vatTotal = amount(c, s, 'VAT_TOTAL', 'EXCLUDED');
  const prepaid = amount(c, s, 'ADVANCE_PAYMENT', 'INCLUDED');
  const rounding = c.dec(s, 'ROUNDINGS');

  let taxInclusive = amount(c, s, 'INVOICE_TOTAL_WITHOUT_ADVANCE_PAYMENT', 'INCLUDED');
  if (taxInclusive === undefined) {
    taxInclusive = payable;
    if (prepaid !== undefined) taxInclusive = add(taxInclusive, prepaid);
    if (rounding !== undefined) taxInclusive = sub(taxInclusive, rounding);
    if (prepaid !== undefined || rounding !== undefined) {
      c.derive('/totals/taxInclusive', 'INVOICE_TOTAL_WITHOUT_ADVANCE_PAYMENT absent; INVOICE_TOTAL plus advance payment minus rounding');
    }
  }
  let taxExclusive = amount(c, s, 'INVOICE_TOTAL_WITHOUT_ADVANCE_PAYMENT', 'EXCLUDED') ?? amount(c, s, 'INVOICE_TOTAL', 'EXCLUDED');
  if (taxExclusive === undefined) {
    if (vatTotal === undefined) throw new ParseError('Total without VAT (BT-109) missing and not derivable');
    taxExclusive = sub(taxInclusive, vatTotal);
    c.derive('/totals/taxExclusive', 'No total excluding VAT; computed as BT-112 - BT-110');
  }
  let lineNetTotal = amount(c, s, 'ROWS_TOTAL', 'EXCLUDED');
  if (lineNetTotal === undefined) {
    lineNetTotal = taxExclusive;
    c.warn('NO_LINE_TOTAL', 'ROWS_TOTAL (BT-106) missing; set to BT-109');
    c.derive('/totals/lineNetTotal', 'ROWS_TOTAL absent; copied from BT-109');
  }

  const otherCurrency = c.el(s, 'VAT_TOTAL_IN_OTHER_CURRENCY');
  const totals: Totals = {
    lineNetTotal,
    allowanceTotal: amount(c, s, 'DISCOUNTS_TOTAL', 'EXCLUDED'),
    chargeTotal: amount(c, s, 'CHARGES_TOTAL', 'EXCLUDED'),
    taxExclusive,
    vatTotal,
    vatTotalInTaxCurrency: amount(c, otherCurrency, '', 'EXCLUDED'),
    taxInclusive,
    prepaid,
    rounding,
    payable,
  };
  const vatBreakdown = c.all(s, 'VAT_SUMMARY').map((v): VatBreakdown => {
    const taxableAmount = amount(c, v, 'ACCORDING', 'EXCLUDED');
    const taxAmount = amount(c, v, 'VAT_RATE_TOTAL', 'EXCLUDED');
    if (taxableAmount === undefined || taxAmount === undefined) throw new ParseError('VAT_SUMMARY without ACCORDING or VAT_RATE_TOTAL');
    const categoryCode = c.attr(v, undefined, 'VAT_TYPE');
    if (!categoryCode) c.warn('VAT_CATEGORY_MISSING', 'VAT_SUMMARY without VAT_TYPE (UNTDID 5305 category)');
    recordUnmapped(c, v, ['RATE', 'ACCORDING', 'VAT_RATE_TOTAL', 'VAT_DESCRIPTION', 'EXEMPTION_REASON_CODE', 'CURRENCY_CODE'], '/INVOICE_CENTER/.../SUMMARY/VAT_SUMMARY');
    return {
      taxableAmount, taxAmount, categoryCode: categoryCode ?? '', rate: c.dec(v, 'RATE'),
      exemptionReason: c.text(v, 'VAT_DESCRIPTION'), exemptionReasonCode: c.text(v, 'EXEMPTION_REASON_CODE'),
    };
  });
  recordUnmapped(c, s, [
    'ROWS_TOTAL', 'INVOICE_TOTAL', 'VAT_SUMMARY', 'VAT_TOTAL', 'ROUNDINGS', 'DISCOUNT', 'DISCOUNTS_TOTAL', 'CHARGES', 'CHARGES_TOTAL',
    'PRECEDING_INVOICE_INFORMATION', 'INVOICE_TOTAL_WITHOUT_ADVANCE_PAYMENT', 'ADVANCE_PAYMENT', 'VAT_TOTAL_IN_OTHER_CURRENCY',
  ], '/INVOICE_CENTER/.../INVOICE/SUMMARY');
  return { totals, vatBreakdown };
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

function rowsOf(c: Ctx, inv: Element): Line[] {
  const rows = c.all(inv, 'ROWS/ROW');
  const typeOf = (r: Element) => c.attr(r, undefined, 'ROW_TYPE');
  const specified = new Set(rows.filter((r) => typeOf(r) === 'SPECIFICATION').map((r) => c.attr(r, undefined, 'ROW_ID') ?? ''));
  const lines: Line[] = [];
  rows.forEach((r, i) => {
    const t = typeOf(r);
    if (t === 'INFO' || t === 'SUBTOTAL') {
      c.warn('ROW_SKIPPED', `Row ${c.text(r, 'ROW_NUMBER') ?? i + 1} has ROW_TYPE ${t}; its amounts are not invoice lines`);
      return;
    }
    if (t === 'MAIN' && specified.has(c.attr(r, undefined, 'ROW_ID') ?? '')) {
      c.warn('ROW_SKIPPED', `Row ${c.text(r, 'ROW_NUMBER') ?? i + 1} is a MAIN heading row with SPECIFICATION rows; only the specification rows are lines`);
      return;
    }
    lines.push(rowLine(c, r, i));
  });
  return lines;
}

const ROW_HANDLED = [
  'ROW_NUMBER', 'ARTICLE', 'START_PERIOD', 'END_PERIOD', 'QUANTITY', 'INVOICED_OBJECT', 'ORDER_INFORMATION', 'PRICE_PER_UNIT',
  'DISCOUNT_FROM_PRICE_PER_UNIT', 'PRICE_PER_UNIT_WITH_DISCOUNT', 'PRICE_PER_UNIT_NET', 'DISCOUNT', 'ROW_CHARGE', 'ROW_TOTAL', 'VAT',
  'CN', 'RECEIVER_PRODUCT_CODE', 'DEFAULT_ROW_POSTING', 'FREE_TEXT',
];

function rowLine(c: Ctx, r: Element, index: number): Line {
  const rowNumber = c.text(r, 'ROW_NUMBER');
  const lineId = rowNumber ?? String(index + 1);
  if (!rowNumber) c.derive(`/lines/${index}/id`, 'ROW_NUMBER absent; position among the ROW elements');
  const netAmount = amount(c, r, 'ROW_TOTAL', 'EXCLUDED');
  if (netAmount === undefined) throw new ParseError(`Row ${lineId}: ROW_TOTAL (BT-131) missing`);
  const article = c.el(r, 'ARTICLE');
  const qty = quantity(c, c.el(r, 'QUANTITY/CHARGED'));
  const co = c.all(r, 'ORDER_INFORMATION').find((o) => c.attr(o, undefined, 'ORDER_TYPE') === 'CO');
  const priceEl = c.el(r, 'PRICE_PER_UNIT');
  const grossPrice = amount(c, r, 'PRICE_PER_UNIT', 'EXCLUDED');
  let netPrice = amount(c, r, 'PRICE_PER_UNIT_NET', 'EXCLUDED');
  if (netPrice === undefined) {
    netPrice = amount(c, r, 'PRICE_PER_UNIT_WITH_DISCOUNT', 'EXCLUDED') ?? grossPrice;
    if (netPrice !== undefined) c.derive(`/lines/${index}/price/net`, 'PRICE_PER_UNIT_NET absent; taken from the discounted or the plain unit price');
  }
  const prQty = priceEl ? numAttr(c, priceEl, 'PR_QTY') : undefined;
  const at = `/INVOICE_CENTER/.../ROWS/ROW[${lineId}]`;
  recordUnmapped(c, r, ROW_HANDLED, at);
  recordUnmapped(c, article, [
    'ARTICLE_ID', 'ARTICLE_NAME', 'EAN_CODE', 'PRODUCT_GROUP', 'FREE_TEXT', 'ARTICLE_DESCRIPTIONS',
  ], `${at}/ARTICLE`);
  recordUnmapped(c, c.el(r, 'CN'), ['COUNTRY_OF_ORIGIN_CODE'], `${at}/CN`);
  recordUnmapped(c, c.el(r, 'QUANTITY'), ['CHARGED'], `${at}/QUANTITY`);
  recordUnmapped(c, co, ['ORDER_POSITION'], `${at}/ORDER_INFORMATION`);
  const vat = c.el(r, 'VAT');
  recordUnmapped(c, vat, ['RATE'], `${at}/VAT`);
  return {
    id: lineId,
    note: c.texts(r, 'FREE_TEXT').join('\n') || undefined,
    objectId: idOf(c, c.el(r, 'INVOICED_OBJECT')),
    quantity: qty.value,
    unitCode: qty.unitCode,
    unitText: qty.unitText,
    netAmount,
    orderLineRef: c.text(co, 'ORDER_POSITION'),
    accountingRef: c.text(r, 'DEFAULT_ROW_POSTING/ACCOUNT_REFERENCE'),
    period: periodOf(c, r),
    allowances: allowanceCharges(c, r, 'DISCOUNT', 'DISCOUNT_NAME', 'DISCOUNT_FROM_AMOUNT', 'DISCOUNT_AMOUNT', false),
    charges: allowanceCharges(c, r, 'ROW_CHARGE', 'CHARGE_NAME', 'CHARGE_FROM_AMOUNT', 'CHARGE_AMOUNT', false),
    price: netPrice === undefined ? undefined : {
      net: netPrice,
      discount: amount(c, r, 'DISCOUNT_FROM_PRICE_PER_UNIT', 'EXCLUDED'),
      gross: grossPrice,
      baseQuantity: prQty,
      baseQuantityUnit: c.attr(priceEl, undefined, 'PR_UNIT_UNECE_CODE'),
    },
    vat: vatOf(c, vat),
    item: {
      name: c.text(article, 'ARTICLE_NAME') ?? '',
      description: c.texts(article, 'FREE_TEXT').join('\n') || undefined,
      sellerId: c.text(article, 'ARTICLE_ID'),
      buyerId: c.text(r, 'RECEIVER_PRODUCT_CODE'),
      standardId: idOf(c, c.el(article, 'EAN_CODE')),
      classifications: c.all(article, 'PRODUCT_GROUP').map((g) => ({
        code: c.text(g) ?? '',
        listId: c.attr(g, undefined, 'SCHEME_ID') ?? '',
        listVersion: c.attr(g, undefined, 'SCHEME_VERSION'),
      })),
      originCountry: c.text(r, 'CN/COUNTRY_OF_ORIGIN_CODE'),
      attributes: c.all(article, 'ARTICLE_DESCRIPTIONS/ARTICLE_DESCRIPTION').map((d) => ({
        name: c.text(d, 'DESCRIPTION_TYPE') ?? '',
        value: c.text(d, 'DESCRIPTION_VALUE') ?? '',
      })),
    },
  };
}

function numAttr(c: Ctx, el: Element, name: string): Decimal | undefined {
  const raw = c.attr(el, undefined, name);
  if (raw === undefined) return undefined;
  try { return toDecimal(raw); } catch { throw new ParseError(`${el.localName}/@${name}: not a decimal: "${raw}"`); }
}

// ---------------------------------------------------------------------------
// Whole-invoice leftovers
// ---------------------------------------------------------------------------

const HEADER_HANDLED = [
  'INVOICE_ID', 'INVOICE_TYPE', 'BUSINESS_PROCESS_TYPE', 'SPECIFICATION_ID', 'CREDIT_INVOICE_NUMBER', 'CREDIT_INVOICE_DATE', 'INVOICE_DATE',
  'DUE_DATE', 'TAX_POINT_DATE', 'START_PERIOD', 'END_PERIOD', 'DELIVERY_DATE', 'NOTE_NUMBER', 'TERMS_OF_PAYMENT', 'CURRENCY',
  'ORDER_REFERENCE', 'ORDER_INFORMATION', 'CONTRACT_INFORMATION', 'PROJECT_INFORMATION', 'TRANSPORT_INFORMATION', 'PAYER_POSTING_GROUP_DEFAULTS',
  'BUYER_REFERENCE', 'OFFER_REFERENCE', 'INVOICED_OBJECT', 'HEADER_INFO', 'PAYMENT_CARD_INFORMATION', 'DIRECT_DEBIT_INFO', 'LINKS',
  'FREE_TEXT', 'INVOICE_ORDER_NUMBER',
];

function unmappedFor(
  c: Ctx, inv: Element, header: Element, payee: Element | undefined, receiver: Element | undefined, refs: Element[],
): void {
  recordUnmapped(c, header, HEADER_HANDLED, '/INVOICE_CENTER/.../INVOICE/HEADER');
  recordUnmapped(c, c.el(header, 'TRANSPORT_INFORMATION'), ['TRANSPORT_NOTE'], '/INVOICE_CENTER/.../HEADER/TRANSPORT_INFORMATION');
  for (const o of refs) {
    const name = o.localName ?? '';
    const keep = name === 'ORDER_INFORMATION' ? ['ORDER_NUMBER', 'ORDER_REFERENCE'] : name === 'CONTRACT_INFORMATION' ? ['CONTRACT_NUMBER'] : ['PROJECT_NUMBER'];
    recordUnmapped(c, o, keep, `/INVOICE_CENTER/.../HEADER/${name}`);
  }
  recordUnmapped(c, payee, [
    'CUSTOMER_INFORMATION', 'BANKS', 'NET_SERVICE_ID', 'EADDRESS_SCHEME_ID_CODE', 'PRELIMINARY_TAX_REGISTERED', 'ADDITIONAL_LEGAL_INFO',
    'PAYMENT_MEANS', 'DETAILS_OF_PAYMENT',
  ], '/INVOICE_CENTER/.../INVOICE/PAYEE');
  recordUnmapped(c, receiver, ['CUSTOMER_INFORMATION', 'NET_SERVICE_ID', 'EADDRESS_SCHEME_ID_CODE'], '/INVOICE_CENTER/.../INVOICE/RECEIVER');
  for (const b of c.all(payee, 'BANKS')) {
    recordUnmapped(c, b, ['BANK_NAME', 'BANK_ACCOUNT_NUMBER', 'IBAN_ACCOUNT_NUMBER', 'SWIFT_CODE'], '/INVOICE_CENTER/.../PAYEE/BANKS');
  }
  recordUnmapped(c, c.el(inv, 'CONTROL'), ['IMAGE_CONTROL'], '/INVOICE_CENTER/.../INVOICE/CONTROL');
  recordUnmapped(c, inv, [
    'CONTROL', 'HEADER', 'SUMMARY', 'ROWS', 'PAYEE', 'RECEIVER', 'DELIVERY_PARTY', 'PART_PAYMENTS', ...OTHER_PARTIES.map(([e]) => e), 'OTHER_PARTNER',
  ], '/INVOICE_CENTER/.../INVOICE');
}
