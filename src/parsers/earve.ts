/**
 * Estonian e-invoice (e-arve) 1.2 / 1.2.EN -> canonical.
 *
 * No namespace. One E_Invoice file holds several Invoice elements; each becomes its own
 * canonical invoice with `source.fragmentPath` ('/E_Invoice/Invoice[n]'). `indexInFile`
 * is set by `convert()` when there is more than one.
 *
 * - Type/@type DEB -> invoice (380), CRE -> credit note (381); kept in extensions.ee.
 * - A FactorParty means the claim was assigned: extensions.ee.factoring, and the factor
 *   is listed as an additional party.
 * - e-arve states VAT by rate only. The EN category is derived (rate > 0 -> S, else
 *   Z or E from the vatId attribute) and recorded in source.derived.
 */
import type { Element } from '@xmldom/xmldom';
import type {
  AdditionalParty, Address, AllowanceCharge, CanonicalInvoice, Contact, CreditTransfer, Decimal, Line, Party,
  PaymentInstructions, Seller, Totals, VatBreakdown, VatInfo,
} from '../canonical.js';
import { sub, sum } from '../values.js';
import { Ctx, ParseError, finish, parseXml, sourceMeta } from './context.js';
import type { ParseInput } from './index.js';

export function parseEarve(input: ParseInput): CanonicalInvoice[] {
  const root = parseXml(input.payload.xml);
  const probe = new Ctx({});
  const invoices = probe.all(root, 'Invoice');
  if (invoices.length === 0) throw new ParseError('E_Invoice contains no Invoice element');
  return invoices.map((el, i) => invoice(input, root, el, i));
}

function invoice(input: ParseInput, root: Element, inv: Element, index: number): CanonicalInvoice {
  const c = new Ctx({});
  const info = c.el(inv, 'InvoiceInformation');
  const id = c.text(info, 'InvoiceNumber');
  const issueDate = c.date(info, 'InvoiceDate', 'BT-2');
  if (!id || !issueDate) throw new ParseError(`Invoice ${index + 1}: invoice number (BT-1) or issue date (BT-2) missing`);

  const eeType = c.attr(info, 'Type', 'type');
  if (eeType !== 'DEB' && eeType !== 'CRE') c.warn('EE-TYPE', `Invoice ${index + 1}: Type/@type is ${eeType ?? 'absent'}, expected DEB or CRE; treated as an invoice`);
  const kind = eeType === 'CRE' ? 'creditNote' : 'invoice';
  const typeCode = kind === 'creditNote' ? '381' : '380';
  c.derive('/typeCode', `Type/@type ${eeType ?? '(absent)'} -> UNCL 1001 ${typeCode}`);

  const sums = c.el(inv, 'InvoiceSumGroup');
  const pay = c.el(inv, 'PaymentInfo');
  const currency = c.text(sums, 'Currency') ?? c.text(pay, 'Currency');
  if (!currency) throw new ParseError(`Invoice ${index + 1}: currency missing (InvoiceSumGroup/Currency)`);
  const gross = c.dec(sums, 'TotalSum');
  const lineNet = c.dec(sums, 'InvoiceSum');
  if (gross === undefined || lineNet === undefined) throw new ParseError(`Invoice ${index + 1}: InvoiceSum or TotalSum missing`);

  const parties = c.el(inv, 'InvoiceParties');
  const seller = party(c, c.el(parties, 'SellerParty'), c.attr(inv, undefined, 'sellerRegnumber')) as Seller;
  const buyer = party(c, c.el(parties, 'BuyerParty'), c.attr(inv, undefined, 'regNumber'));
  const factor = c.el(parties, 'FactorParty');

  const lines = c.all(inv, 'InvoiceItem/InvoiceItemGroup/ItemEntry').concat(c.all(inv, 'InvoiceItem/ItemEntry')).map((e, li) => line(c, e, li));

  const allowances: AllowanceCharge[] = [];
  const charges: AllowanceCharge[] = [];
  for (const a of c.all(sums, 'Addition')) {
    const amount = c.dec(a, 'AddSum');
    if (amount === undefined) continue;
    const entry: AllowanceCharge = {
      amount: amount.startsWith('-') ? amount.slice(1) as Decimal : amount,
      percentage: c.dec(a, 'AddRate'),
      reason: c.text(a, 'AddContent'),
    };
    // addCode DSC = discount; everything else (CHR, ...) is a charge. Negative amounts are discounts.
    if (c.attr(a, undefined, 'addCode') === 'DSC' || amount.startsWith('-')) allowances.push(entry); else charges.push(entry);
  }
  const allowanceTotal = allowances.length ? sum(allowances.map((x) => x.amount)) : undefined;
  const chargeTotal = charges.length ? sum(charges.map((x) => x.amount)) : undefined;

  const vatBreakdown = c.all(sums, 'VAT').map((v): VatBreakdown => {
    const rate = c.dec(v, 'VATRate');
    const taxable = c.dec(v, 'SumBeforeVAT');
    const tax = c.dec(v, 'VATSum');
    if (taxable === undefined || tax === undefined) throw new ParseError(`Invoice ${index + 1}: VAT group without SumBeforeVAT or VATSum`);
    return { taxableAmount: taxable, taxAmount: tax, categoryCode: category(c, c.attr(v, undefined, 'vatId'), rate), rate };
  });
  const vatTotal = c.dec(sums, 'TotalVATSum') ?? (vatBreakdown.length ? sum(vatBreakdown.map((v) => v.taxAmount)) : undefined);
  if (c.dec(sums, 'TotalVATSum') === undefined && vatTotal !== undefined) c.derive('/totals/vatTotal', 'TotalVATSum absent; sum of VAT group amounts');

  const rounding = c.dec(sums, 'Rounding');
  const taxInclusive = rounding ? sub(gross, rounding) : gross;
  const taxExclusive = vatTotal !== undefined ? sub(taxInclusive, vatTotal) : lineNet;
  if (vatTotal !== undefined) c.derive('/totals/taxExclusive', 'e-arve has no total without VAT after allowances; BT-112 minus TotalVATSum');
  const payable = c.dec(pay, 'PaymentTotalSum') ?? c.dec(sums, 'TotalToPay');
  const totals: Totals = {
    lineNetTotal: lineNet,
    allowanceTotal,
    chargeTotal,
    taxExclusive,
    vatTotal,
    taxInclusive,
    rounding,
    payable: payable ?? gross,
  };
  if (rounding) c.derive('/totals/taxInclusive', 'TotalSum includes Rounding in e-arve; BT-112 is TotalSum minus Rounding');
  if (payable === undefined) c.derive('/totals/payable', 'No PaymentTotalSum/TotalToPay; taken from TotalSum');

  const accounts: CreditTransfer[] = [];
  const toAccount = c.text(pay, 'PayToAccount');
  if (toAccount) accounts.push({ accountId: toAccount.replace(/\s/g, ''), accountName: c.text(pay, 'PayToName') });
  for (const acc of c.all(parties, 'SellerParty/AccountInfo')) {
    const iban = c.text(acc, 'IBAN')?.replace(/\s/g, '');
    if (iban && !accounts.some((a) => a.accountId === iban)) accounts.push({ accountId: iban, accountName: c.text(acc, 'AccountName'), serviceProviderId: c.text(acc, 'BIC') });
    else if (iban) {
      const existing = accounts.find((a) => a.accountId === iban)!;
      existing.serviceProviderId ??= c.text(acc, 'BIC');
    }
  }
  const reference = c.text(info, 'PaymentReferenceNumber') ?? c.text(pay, 'PaymentId');
  const payments: PaymentInstructions[] = accounts.length || reference ? [{
    meansCode: accounts.length ? '30' : 'ZZZ',
    meansText: c.text(pay, 'PaymentDescription'),
    remittanceInformation: reference,
    creditTransfers: accounts,
  }] : [];
  if (payments.length) c.derive('/payments/0/meansCode', `e-arve states no means code; ${accounts.length ? 'credit transfer (30) assumed from the bank account' : 'ZZZ'}`);

  const start = c.date(info, 'Period/StartDate', 'invoicing period start');
  const end = c.date(info, 'Period/EndDate', 'invoicing period end');
  const contractNo = c.text(info, 'ContractNumber');
  const content = c.text(info, 'InvoiceContentText');
  const fine = c.text(info, 'FineRatePerDay');
  const documentName = c.text(info, 'DocumentName');
  if (documentName) c.unmapped[xp(index, 'InvoiceInformation/DocumentName')] = documentName;
  const contractDate = c.text(info, 'ContractDate');
  if (contractDate) c.unmapped[xp(index, 'InvoiceInformation/ContractDate')] = contractDate;
  c.all(info, 'Extension').forEach((x, xi) => {
    const name = c.text(x, 'InformationName');
    const value = c.text(x, 'InformationContent');
    if (name && value) c.unmapped[xp(index, `InvoiceInformation/Extension[${xi + 1}]/${name}`)] = value;
  });
  const globId = c.attr(inv, undefined, 'invoiceGlobUniqId');
  if (globId) c.unmapped[xp(index, '@invoiceGlobUniqId')] = globId;

  const out = {
    kind,
    typeCode,
    id,
    issueDate,
    nationalType: eeType ? { scheme: 'EE:InvoiceType', code: eeType } : undefined,
    selfBilled: false,
    currency,
    dueDate: c.date(info, 'DueDate', 'BT-9') ?? c.date(pay, 'PayDueDate', 'BT-9'),
    contractRef: contractNo,
    paymentTerms: fine ? `Penalty ${fine} % per day` : undefined,
    notes: content ? [{ text: content }] : [],
    specificationId: `urn:e-arve:${input.details.version ?? '1.2'}`,
    precedingInvoices: [],
    invoicePeriod: start || end ? { start, end } : undefined,
    seller,
    buyer,
    additionalParties: factor ? [{ role: 'factor', sourceRole: 'EE:FactorParty', party: party(c, factor, undefined) } as AdditionalParty] : [],
    payments,
    paymentSchedule: [],
    allowances,
    charges,
    totals,
    vatBreakdown,
    otherTaxes: [],
    withholdings: [],
    attachments: [],
    lines,
    clearance: [],
    extensions: { ee: { invoiceType: eeType, factoring: factor ? true : undefined } },
    source: sourceMeta(input, root, c, { indexInFile: index, fragmentPath: `/E_Invoice/Invoice[${index + 1}]` }),
  } as CanonicalInvoice;
  if (factor) c.derive('/extensions/ee/factoring', 'FactorParty present');
  return finish(out);
}

const xp = (index: number, rest: string) => `/E_Invoice/Invoice[${index + 1}]/${rest}`;

/** e-arve gives a rate only. vatId NTAX/NOTAX = outside scope or exempt. */
function category(c: Ctx, vatId: string | undefined, rate: Decimal | undefined): string {
  if (rate !== undefined && !/^0(\.0*)?$/.test(rate)) {
    c.derive('/vat/categoryCode', `e-arve states no VAT category; 'S' assumed for rate ${rate}`);
    return 'S';
  }
  const code = vatId && /^N/i.test(vatId) ? 'E' : 'Z';
  c.derive('/vat/categoryCode', `e-arve states no VAT category; '${code}' assumed for rate 0${vatId ? ` (vatId ${vatId})` : ''}`);
  c.warn('EE-VAT-CATEGORY-GUESSED', `Zero-rate VAT mapped to ${code}; EN 16931 separates Z, E, AE, K, G and O. Review before booking`);
  return code;
}

function party(c: Ctx, p: Element | undefined, attrRegNumber: string | undefined): Party {
  const reg = c.text(p, 'RegNumber') ?? attrRegNumber;
  if (!c.text(p, 'RegNumber') && attrRegNumber) c.derive('/party/legalRegistrationId', 'RegNumber element absent; taken from the Invoice attribute');
  const contactData = c.el(p, 'ContactData');
  const legal = c.el(contactData, 'LegalAddress') ?? c.el(contactData, 'MailAddress');
  const addr: Address | undefined = legal ? {
    line1: c.text(legal, 'PostalAddress1'),
    line2: c.text(legal, 'PostalAddress2'),
    city: c.text(legal, 'City'),
    postalCode: c.text(legal, 'PostalCode'),
    countrySubdivision: c.text(legal, 'County'),
    countryCode: c.text(legal, 'Country'),
  } : undefined;
  const contact: Contact = {
    name: c.text(contactData, 'ContactName'),
    phone: c.text(contactData, 'PhoneNumber'),
    email: c.text(contactData, 'E-mailAddress'),
  };
  return {
    name: c.text(p, 'Name'),
    identifiers: [],
    legalRegistrationId: reg ? { value: reg, schemeId: 'EE:REGCODE' } : undefined,
    vatId: c.text(p, 'VATRegNumber'),
    nationalTaxIds: [],
    address: addr,
    contact: contact.name || contact.phone || contact.email ? contact : undefined,
  };
}

function line(c: Ctx, e: Element, index: number): Line {
  const where = `ItemEntry ${index + 1}`;
  const detail = c.el(e, 'ItemDetailInfo');
  const vatEl = c.el(e, 'VAT');
  const net = c.dec(e, 'ItemSum') ?? c.dec(vatEl, 'SumBeforeVAT');
  if (net === undefined) throw new ParseError(`${where}: ItemSum missing`);
  const rate = c.dec(vatEl, 'VATRate');
  const vat: VatInfo | undefined = vatEl ? { categoryCode: category(c, c.attr(vatEl, undefined, 'vatId'), rate), rate } : undefined;
  const price = c.dec(detail, 'ItemPrice');
  const ean = c.text(e, 'EAN');
  const allowances: AllowanceCharge[] = [];
  const charges: AllowanceCharge[] = [];
  for (const a of c.all(e, 'Addition')) {
    const amount = c.dec(a, 'AddSum');
    if (amount === undefined) continue;
    const entry: AllowanceCharge = { amount: amount.startsWith('-') ? amount.slice(1) as Decimal : amount, percentage: c.dec(a, 'AddRate'), reason: c.text(a, 'AddContent') };
    if (c.attr(a, undefined, 'addCode') === 'DSC' || amount.startsWith('-')) allowances.push(entry); else charges.push(entry);
  }
  const unitText = c.text(detail, 'ItemUnit');
  return {
    id: c.text(e, 'RowNo') ?? String(index + 1),
    quantity: c.dec(detail, 'ItemAmount'),
    unitText,
    netAmount: net,
    allowances,
    charges,
    price: price !== undefined ? { net: price } : undefined,
    vat,
    item: {
      name: c.text(e, 'Description') ?? '',
      sellerId: c.text(e, 'SellerProductId'),
      standardId: ean ? { value: ean, schemeId: '0160' } : undefined,
      classifications: [],
      attributes: [],
    },
  };
}
