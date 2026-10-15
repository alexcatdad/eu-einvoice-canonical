/**
 * ISDOC 5.2 - 6.x (Czech national invoice format) -> canonical.
 *
 * Elements are matched by local name: the namespace is http://isdoc.cz/namespace/2013 for every
 * version, but real senders vary and the default namespace is all there is.
 *
 * Money. ISDOC states every amount in the local currency (CZK) and, when ForeignCurrencyCode is
 * set, again in the foreign currency in a sibling `...Curr` element. The invoice is then in the
 * foreign currency (BT-5), VAT is also stated in the local currency (BT-6, BT-111) and CurrRate is
 * the exchange rate. Unit prices exist in the local currency only; they are left out in that case.
 *
 * Totals. ISDOC's TaxExclusiveAmount / TaxInclusiveAmount cover the whole document. Taxed deposits
 * already invoiced (AlreadyClaimed*) and untaxed deposits paid (PaidDepositsAmount) are deducted
 * from the amount due, which is BT-113 in EN 16931 terms.
 */
import type { Element } from '@xmldom/xmldom';
import type {
  Address,
  Attachment,
  CanonicalInvoice,
  Contact,
  Identifier,
  Line,
  Party,
  PaymentInstallment,
  PaymentInstructions,
  Seller,
  Totals,
  VatBreakdown,
  VatInfo,
} from '../canonical.js';
import { cmp, neg, sign, sum } from '../values.js';
import { Ctx, finish, ParseError, parseXml, sourceMeta } from './context.js';
import type { ParseInput } from './index.js';

/** ISDOC DocumentType -> label, UNCL 1001 code (before the sign rule below). */
const DOCUMENT_TYPES: Record<string, { label: string; typeCode: string }> = {
  '1': { label: 'Faktura - daňový doklad', typeCode: '380' },
  '2': { label: 'Opravný daňový doklad (dobropis)', typeCode: '381' },
  '3': { label: 'Opravný daňový doklad (vrubopis)', typeCode: '383' },
  '4': { label: 'Zálohová faktura (nedaňový zálohový list)', typeCode: '386' },
  '5': { label: 'Daňový doklad při přijetí platby (daňový zálohový list)', typeCode: '386' },
  '6': { label: 'Opravný daňový doklad při přijetí platby (dobropis DZL)', typeCode: '381' },
  '7': { label: 'Zjednodušený daňový doklad', typeCode: '380' },
};
/** Types whose direction depends on the amounts. */
const CORRECTIVE = new Set(['2', '3', '6']);

/** Free-text Czech units -> UN/ECE Rec 20. The source text is always kept in `unitText` when it was not already a code. */
const UNITS: Record<string, string> = {
  ks: 'H87',
  'ks.': 'H87',
  kus: 'H87',
  kusy: 'H87',
  pcs: 'H87',
  hod: 'HUR',
  'hod.': 'HUR',
  h: 'HUR',
  hodina: 'HUR',
  hodiny: 'HUR',
  den: 'DAY',
  dny: 'DAY',
  měs: 'MON',
  měsíc: 'MON',
  rok: 'ANN',
  kg: 'KGM',
  t: 'TNE',
  l: 'LTR',
  m: 'MTR',
  km: 'KMT',
  m2: 'MTK',
  'm²': 'MTK',
  m3: 'MTQ',
  'm³': 'MTQ',
  kwh: 'KWH',
  sada: 'SET',
  soubor: 'SET',
  kpl: 'SET',
};

export function parseIsdoc(input: ParseInput): CanonicalInvoice[] {
  const root = parseXml(input.payload.xml);
  const c = new Ctx({});

  const docType = c.text(root, 'DocumentType');
  const typeDef = docType ? DOCUMENT_TYPES[docType] : undefined;
  if (!docType || !typeDef) throw new ParseError(`ISDOC DocumentType '${docType ?? ''}' missing or not 1-7`);
  const id = c.text(root, 'ID');
  const issueDate = c.date(root, 'IssueDate', 'BT-2');
  if (!id || !issueDate) throw new ParseError('Invoice number (BT-1) or issue date (BT-2) missing');
  const localCurrency = c.text(root, 'LocalCurrencyCode');
  if (!localCurrency) throw new ParseError('LocalCurrencyCode missing');

  // Foreign-currency invoice: document amounts come from the ...Curr elements.
  const foreignCode = c.text(root, 'ForeignCurrencyCode');
  const legal = c.el(root, 'LegalMonetaryTotal');
  if (!legal) throw new ParseError('LegalMonetaryTotal missing');
  const foreign = !!foreignCode && foreignCode !== localCurrency;
  if (foreign && c.text(legal, 'TaxInclusiveAmountCurr') === undefined) {
    throw new ParseError(`ForeignCurrencyCode ${foreignCode} given but LegalMonetaryTotal has no ...Curr amounts`);
  }
  const currency = foreign ? foreignCode! : localCurrency;
  /** Amount in the document currency. */
  const doc = (e: Element | undefined, name: string) => c.dec(e, foreign ? `${name}Curr` : name);

  let exchangeRate: CanonicalInvoice['exchangeRate'];
  if (foreign) {
    const rate = c.dec(root, 'CurrRate');
    const ref = c.dec(root, 'RefCurrRate');
    if (rate === undefined) c.warn('ISDOC-NO-RATE', 'ForeignCurrencyCode given without CurrRate');
    else {
      exchangeRate = { rate };
      // CurrRate is the price of RefCurrRate units of foreign currency in local currency; EN has no such term.
      if (ref !== undefined && cmp(ref, '1') !== 0) {
        c.warn('ISDOC-REFCURRRATE', `CurrRate ${rate} is for ${ref} units of ${foreignCode}; exchangeRate.rate is not per unit`);
        c.unmapped['/Invoice/RefCurrRate'] = ref;
      }
    }
  }

  const vatApplicable = (c.text(root, 'VATApplicable') ?? 'true').toLowerCase() !== 'false';

  // Parties
  const seller = party(c, c.el(root, 'AccountingSupplierParty/Party'), true) as Seller;
  const anonymous = c.el(root, 'AnonymousCustomerParty');
  let buyer: Party;
  if (anonymous) {
    const anonId = c.text(anonymous, 'ID');
    buyer = { identifiers: anonId ? [{ value: anonId }] : [], nationalTaxIds: [] };
    c.warn('ISDOC-ANONYMOUS-BUYER', 'AnonymousCustomerParty: the buyer is not named (simplified tax document)');
  } else {
    buyer = party(c, c.el(root, 'AccountingCustomerParty/Party'), false);
  }
  const additionalParties: CanonicalInvoice['additionalParties'] = [];
  for (const [path, role] of [
    ['SellerSupplierParty/Party', 'seller-supplier'],
    ['BuyerCustomerParty/Party', 'buyer-customer'],
  ] as const) {
    const el = c.el(root, path);
    if (!el) continue;
    const p = party(c, el, false);
    const base = role === 'seller-supplier' ? seller : buyer;
    // The format repeats the accounting party here when the roles coincide; only a different party is news.
    if (JSON.stringify(strip(p)) !== JSON.stringify(strip(base)))
      additionalParties.push({ role, sourceRole: path.split('/')[0], party: p });
  }

  const deliveryParty = c.el(root, 'Delivery/Party');
  const delivery = deliveryParty
    ? {
        partyName: c.text(deliveryParty, 'PartyName/Name'),
        address: address(c, c.el(deliveryParty, 'PostalAddress')),
      }
    : undefined;

  // References
  const orders = c.all(root, 'OrderReferences/OrderReference');
  const external = unique(orders.map((o) => c.text(o, 'ExternalOrderID')));
  const sales = unique(orders.map((o) => c.text(o, 'SalesOrderID')));
  if (external.length > 1) c.warn('ISDOC-ORDERS', `Invoice references ${external.length} different external orders; BT-13 left empty`);
  if (sales.length > 1) c.warn('ISDOC-ORDERS', `Invoice references ${sales.length} different sales orders; BT-14 left empty`);
  const notes = unique(c.all(root, 'DeliveryNoteReferences/DeliveryNoteReference').map((d) => c.text(d, 'ID')));
  if (notes.length > 1) c.warn('ISDOC-DELIVERY-NOTES', `Invoice references ${notes.length} delivery notes; BT-16 left empty`);
  const contracts = unique(c.all(root, 'ContractReferences/ContractReference').map((d) => c.text(d, 'ID')));
  c.all(root, 'OriginalDocumentReferences/OriginalDocumentReference').forEach((r, i) => {
    const v = c.text(r, 'ID');
    if (v) c.unmapped[`/Invoice/OriginalDocumentReferences/OriginalDocumentReference[${i + 1}]/ID`] = v;
  });

  const precedingInvoices: CanonicalInvoice['precedingInvoices'] = [];
  const parent = c.text(root, 'ParentDocumentID');
  if (parent) precedingInvoices.push({ id: parent });
  for (const dep of c.all(root, 'TaxedDeposits/TaxedDeposit')) {
    const depId = c.text(dep, 'ID');
    if (depId) precedingInvoices.push({ id: depId });
  }
  c.all(root, 'NonTaxedDeposits/NonTaxedDeposit').forEach((d, i) => {
    const depId = c.text(d, 'ID');
    const amount = doc(d, 'DepositAmount');
    if (depId) c.unmapped[`/Invoice/NonTaxedDeposits/NonTaxedDeposit[${i + 1}]`] = `${depId}${amount ? ` ${amount}` : ''}`;
  });

  // Lines, VAT, totals
  const lines = c.all(root, 'InvoiceLines/InvoiceLine').map((l, i) => line(c, l, i + 1, foreign, vatApplicable));
  const { totals, vatBreakdown } = totalsAndVat(c, root, legal, foreign, vatApplicable);
  if (lines.length === 0) c.warn('NO_LINES', 'The invoice has no lines');

  // Payment
  const { payments, schedule, symbols, dueDate } = paymentInfo(c, root, foreign);

  // Kind: corrective documents take their direction from the sign of the amounts.
  let kind: 'invoice' | 'creditNote';
  let typeCode = typeDef.typeCode;
  if (CORRECTIVE.has(docType)) {
    const basis = c.el(legal, 'DifferenceTaxInclusiveAmount') ? doc(legal, 'DifferenceTaxInclusiveAmount')! : totals.taxInclusive;
    const s = sign(basis);
    if (s === 0) {
      kind = docType === '3' ? 'invoice' : 'creditNote';
      c.derive('/kind', `DocumentType ${docType} with a zero total; kind taken from the document type`);
    } else {
      kind = s < 0 ? 'creditNote' : 'invoice';
      c.derive(
        '/kind',
        `DocumentType ${docType} is corrective; ${kind} because the corrective total is ${s < 0 ? 'negative' : 'positive'}`,
      );
    }
    typeCode = kind === 'creditNote' ? '381' : '383';
  } else {
    kind = 'invoice';
  }

  const version = c.attr(root, undefined, 'version');
  const issuing = c.text(root, 'IssuingSystem');
  if (issuing) c.unmapped['/Invoice/IssuingSystem'] = issuing;
  const uuid = c.text(root, 'UUID');
  if (uuid) c.unmapped['/Invoice/UUID'] = uuid;
  const agreement = c.text(root, 'ElectronicPossibilityAgreementReference');
  if (agreement) c.unmapped['/Invoice/ElectronicPossibilityAgreementReference'] = agreement;
  c.derive('/specificationId', 'ISDOC has no specification identifier; set from the format and the version attribute');

  const inv = {
    kind,
    typeCode,
    id,
    issueDate,
    nationalType: { scheme: 'CZ:DocumentType', code: docType, label: typeDef.label },
    selfBilled: false,
    currency,
    taxCurrency: foreign ? localCurrency : undefined,
    exchangeRate,
    taxPointDate: c.date(root, 'TaxPointDate', 'BT-7'),
    dueDate,
    contractRef: contracts.length === 1 ? contracts[0] : undefined,
    purchaseOrderRef: external.length === 1 ? external[0] : undefined,
    salesOrderRef: sales.length === 1 ? sales[0] : undefined,
    despatchAdviceRef: notes.length === 1 ? notes[0] : undefined,
    notes: c.texts(root, 'Note').map((text) => ({ text })),
    specificationId: `isdoc:${version ?? input.details.version ?? ''}`.replace(/:$/, ''),
    precedingInvoices,
    seller,
    buyer,
    additionalParties,
    delivery,
    payments,
    paymentSchedule: schedule,
    allowances: [],
    charges: [],
    totals,
    vatBreakdown,
    otherTaxes: [],
    withholdings: [],
    attachments: attachments(c, root, input.payload.siblingEntries ?? []),
    lines,
    clearance: [],
    extensions: { cz: { documentType: docType, ...symbols } },
    source: sourceMeta(input, root, c),
  } as CanonicalInvoice;
  return [finish(inv)];
}

const unique = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];
const strip = (p: Party) => ({ n: p.name, v: p.vatId, i: p.nationalTaxIds, a: p.address });

function party(c: Ctx, p: Element | undefined, isSeller: boolean): Party {
  const out: Party & Partial<Seller> = { identifiers: [], nationalTaxIds: [] };
  if (!p) return out;
  out.name = c.text(p, 'PartyName/Name');
  const ico = c.text(p, 'PartyIdentification/ID');
  if (ico) out.nationalTaxIds.push({ value: ico, schemeId: 'CZ:ICO' });
  for (const s of c.all(p, 'PartyTaxScheme')) {
    const value = c.text(s, 'CompanyID');
    if (!value) continue;
    const scheme = (c.text(s, 'TaxScheme') ?? 'VAT').toUpperCase();
    if (scheme === 'VAT') out.vatId = out.vatId ?? value;
    else out.nationalTaxIds.push({ value, schemeId: 'CZ:DIC' });
  }
  out.address = address(c, c.el(p, 'PostalAddress'));
  const ct = c.el(p, 'Contact');
  if (ct) out.contact = { name: c.text(ct, 'Name'), phone: c.text(ct, 'Telephone'), email: c.text(ct, 'ElectronicMail') } as Contact;
  if (isSeller) {
    const reg = c.el(p, 'RegisterIdentification');
    if (reg) {
      const date = c.text(reg, 'RegisterDate');
      out.additionalLegalInfo =
        [c.text(reg, 'RegisterKeptAt'), c.text(reg, 'RegisterFileRef'), date].filter(Boolean).join(', ') || undefined;
    }
  }
  return out;
}

function address(c: Ctx, a: Element | undefined): Address | undefined {
  if (!a) return undefined;
  const street = c.text(a, 'StreetName');
  const number = c.text(a, 'BuildingNumber');
  return {
    line1: [street, number].filter(Boolean).join(' ') || undefined,
    city: c.text(a, 'CityName'),
    postalCode: c.text(a, 'PostalZone'),
    countryCode: c.text(a, 'Country/IdentificationCode'),
  };
}

/** ISDOC states only the rate; the EN category is derived from it and the VAT flags. */
function vatInfo(c: Ctx, cat: Element | undefined, vatApplicable: boolean): VatInfo {
  const rate = c.dec(cat, 'Percent');
  const reverse = (c.text(cat, 'LocalReverseChargeFlag') ?? '').toLowerCase() === 'true';
  const applicable = vatApplicable && (c.text(cat, 'VATApplicable') ?? 'true').toLowerCase() !== 'false';
  let categoryCode: string;
  if (reverse) categoryCode = 'AE';
  else if (!applicable) categoryCode = 'O';
  else categoryCode = rate !== undefined && sign(rate) !== 0 ? 'S' : 'Z';
  const out: VatInfo = { categoryCode };
  if (rate !== undefined && categoryCode !== 'O') out.rate = rate;
  return out;
}

function totalsAndVat(
  c: Ctx,
  root: Element,
  legal: Element,
  foreign: boolean,
  vatApplicable: boolean,
): { totals: Totals; vatBreakdown: VatBreakdown[] } {
  const doc = (e: Element | undefined, name: string) => c.dec(e, foreign ? `${name}Curr` : name);
  const taxExclusive = doc(legal, 'TaxExclusiveAmount');
  const taxInclusive = doc(legal, 'TaxInclusiveAmount');
  if (taxExclusive === undefined || taxInclusive === undefined)
    throw new ParseError('LegalMonetaryTotal: TaxExclusiveAmount or TaxInclusiveAmount missing');
  const payable = doc(legal, 'PayableAmount');
  if (payable === undefined) throw new ParseError('LegalMonetaryTotal/PayableAmount missing');

  const claimed = doc(legal, 'AlreadyClaimedTaxInclusiveAmount');
  const paidDeposits = doc(legal, 'PaidDepositsAmount');
  // Both reduce the amount due; the sample documents write PaidDepositsAmount negative.
  const parts = [claimed, paidDeposits === undefined ? undefined : sign(paidDeposits) < 0 ? neg(paidDeposits) : paidDeposits].filter(
    (x): x is NonNullable<typeof x> => x !== undefined,
  );
  const prepaidSum = parts.length ? sum(parts) : undefined;
  const prepaid = prepaidSum !== undefined && sign(prepaidSum) !== 0 ? prepaidSum : undefined;
  if (prepaid !== undefined)
    c.derive(
      '/totals/prepaid',
      'AlreadyClaimedTaxInclusiveAmount plus the absolute PaidDepositsAmount (taxed and untaxed deposits already settled)',
    );

  for (const name of ['AlreadyClaimedTaxExclusiveAmount', 'DifferenceTaxExclusiveAmount', 'DifferenceTaxInclusiveAmount']) {
    const v = doc(legal, name);
    if (v !== undefined && sign(v) !== 0) c.unmapped[`/Invoice/LegalMonetaryTotal/${name}`] = v;
  }

  const taxTotal = c.el(root, 'TaxTotal');
  const vatBreakdown = c.all(taxTotal, 'TaxSubTotal').map((s): VatBreakdown => {
    const info = vatInfo(c, c.el(s, 'TaxCategory'), vatApplicable);
    const taxable = doc(s, 'TaxableAmount');
    const tax = doc(s, 'TaxAmount');
    if (taxable === undefined || tax === undefined) throw new ParseError('TaxSubTotal without TaxableAmount or TaxAmount');
    return {
      taxableAmount: taxable,
      taxAmount: tax,
      categoryCode: info.categoryCode,
      rate: info.rate,
      taxAmountInTaxCurrency: foreign ? c.dec(s, 'TaxAmount') : undefined,
    };
  });
  if (vatBreakdown.length)
    c.derive(
      '/vatBreakdown/*/categoryCode',
      'ISDOC states the rate only; category S (rate > 0), Z (rate 0), AE (LocalReverseChargeFlag) or O (VATApplicable false)',
    );

  const totals: Totals = {
    lineNetTotal: taxExclusive,
    taxExclusive,
    vatTotal: doc(taxTotal, 'TaxAmount'),
    vatTotalInTaxCurrency: foreign ? c.dec(taxTotal, 'TaxAmount') : undefined,
    taxInclusive,
    prepaid,
    rounding: doc(legal, 'PayableRoundingAmount'),
    payable,
  };
  c.derive('/totals/lineNetTotal', 'ISDOC has no document-level allowances or charges; BT-106 taken from TaxExclusiveAmount');
  return { totals, vatBreakdown };
}

function line(c: Ctx, l: Element, n: number, foreign: boolean, vatApplicable: boolean): Line {
  const lineId = c.text(l, 'ID') ?? String(n);
  const netAmount = c.dec(l, foreign ? 'LineExtensionAmountCurr' : 'LineExtensionAmount');
  if (netAmount === undefined) throw new ParseError(`Line ${lineId}: LineExtensionAmount${foreign ? 'Curr' : ''} missing`);
  const qtyEl = c.el(l, 'InvoicedQuantity');
  const unitText = c.attr(qtyEl, undefined, 'unitCode');
  const mapped = unitText ? UNITS[unitText.toLowerCase()] : undefined;
  const unitCode = mapped ?? (unitText && /^[A-Z0-9]{2,3}$/.test(unitText) ? unitText : undefined);

  const item = c.el(l, 'Item');
  const name = c.text(item, 'Description');
  if (!name) c.warn('ISDOC-NO-ITEM-NAME', `Line ${lineId}: no Item/Description (BT-153 is mandatory in EN 16931)`);
  const ean = c.text(item, 'CatalogueItemIdentification/ID');
  const attributes: { name: string; value: string }[] = [];
  for (const tag of ['SecondarySellersItemIdentification', 'TertiarySellersItemIdentification']) {
    const v = c.text(item, `${tag}/ID`);
    if (v) attributes.push({ name: tag, value: v });
  }
  for (const b of c.all(item, 'StoreBatches/StoreBatch')) {
    const v = [c.text(b, 'Name'), c.text(b, 'BatchOrSerialNumber')].filter(Boolean).join(' / ');
    if (v) attributes.push({ name: 'StoreBatch', value: v });
  }

  const unitPrice = c.dec(l, 'UnitPrice');
  if (foreign && unitPrice !== undefined) c.unmapped[`/Invoice/InvoiceLines/InvoiceLine[${n}]/UnitPrice`] = unitPrice;

  const orderRef = c.text(l, 'OrderReference/LineID');
  return {
    id: lineId,
    note: c.text(l, 'Note'),
    quantity: c.dec(qtyEl),
    unitCode,
    unitText: unitText && unitText !== unitCode ? unitText : undefined,
    netAmount,
    orderLineRef: orderRef,
    allowances: [],
    charges: [],
    price: !foreign && unitPrice !== undefined ? { net: unitPrice } : undefined,
    vat: vatInfo(c, c.el(l, 'ClassifiedTaxCategory'), vatApplicable),
    item: {
      name: name ?? '',
      sellerId: c.text(item, 'SellersItemIdentification/ID'),
      buyerId: c.text(item, 'BuyersItemIdentification/ID'),
      // The catalogue number is an EAN/GTIN when it has that shape.
      standardId: ean ? (/^\d{8}$|^\d{12,14}$/.test(ean) ? ({ value: ean, schemeId: '0160' } as Identifier) : { value: ean }) : undefined,
      classifications: [],
      attributes,
    },
  };
}

function paymentInfo(c: Ctx, root: Element, foreign: boolean) {
  const payments: PaymentInstructions[] = [];
  const schedule: PaymentInstallment[] = [];
  const symbols: { variableSymbol?: string; constantSymbol?: string; specificSymbol?: string } = {};
  const dueDates: string[] = [];
  const mean = c.el(root, 'PaymentMeans');

  c.all(mean, 'Payment').forEach((p, i) => {
    const d = c.el(p, 'Details');
    const code = c.text(p, 'PaymentMeansCode') ?? 'ZZZ';
    const iban = c.text(d, 'IBAN');
    const accountNo = c.text(d, 'ID');
    const bankCode = c.text(d, 'BankCode');
    const bban = accountNo ? (bankCode ? `${accountNo}/${bankCode}` : accountNo) : undefined;
    const vs = c.text(d, 'VariableSymbol');
    const cs = c.text(d, 'ConstantSymbol');
    const ss = c.text(d, 'SpecificSymbol');
    for (const [k, v] of [
      ['variableSymbol', vs],
      ['constantSymbol', cs],
      ['specificSymbol', ss],
    ] as const) {
      if (v === undefined) continue;
      if (symbols[k] === undefined) symbols[k] = v;
      else if (symbols[k] !== v)
        c.warn('ISDOC-SYMBOL-CONFLICT', `Payments carry different ${k} values (${symbols[k]}, ${v}); the first is used`);
    }
    const accountId = iban ?? bban;
    const bankName = c.text(d, 'Name');
    if (bankName) c.unmapped[`/Invoice/PaymentMeans/Payment[${i + 1}]/Details/Name`] = bankName;
    const cashDoc = c.text(d, 'DocumentID');
    if (cashDoc) c.unmapped[`/Invoice/PaymentMeans/Payment[${i + 1}]/Details/DocumentID`] = cashDoc;

    payments.push({
      meansCode: code,
      remittanceInformation: vs,
      creditTransfers: accountId ? [{ accountId, serviceProviderId: c.text(d, 'BIC') }] : [],
    });
    const due = c.date(d, 'PaymentDueDate', 'BT-9');
    if (due) {
      dueDates.push(due);
      const amount = c.dec(p, foreign ? 'PaidAmountCurr' : 'PaidAmount');
      schedule.push({ dueDate: due, amount: amount !== undefined && sign(amount) !== 0 ? amount : undefined, paymentIndex: i });
    }
  });

  // Alternative accounts hang on the bank-transfer payment.
  const alt = c.all(mean, 'AlternateBankAccounts/AlternateBankAccount');
  if (alt.length) {
    const target = payments.find((p) => p.creditTransfers.length > 0) ?? payments[0];
    for (const a of alt) {
      const iban = c.text(a, 'IBAN');
      const no = c.text(a, 'ID');
      const bank = c.text(a, 'BankCode');
      const accountId = iban ?? (no ? (bank ? `${no}/${bank}` : no) : undefined);
      if (!accountId) continue;
      if (target) target.creditTransfers.push({ accountId, serviceProviderId: c.text(a, 'BIC') });
      else c.unmapped['/Invoice/PaymentMeans/AlternateBankAccounts'] = accountId;
    }
  }

  const distinct = [...new Set(dueDates)];
  if (distinct.length > 1)
    c.warn('ISDOC-DUEDATES', `Payments give ${distinct.length} due dates; dueDate (BT-9) is the first and the rest are in paymentSchedule`);
  // A single due date needs no schedule: BT-9 says it all.
  return { payments, schedule: distinct.length > 1 ? schedule : [], symbols, dueDate: dueDates[0] as CanonicalInvoice['dueDate'] };
}

/** Supplements named in the invoice, plus ISDOCX ZIP entries it does not list. Content is not carried over. */
function attachments(c: Ctx, root: Element, siblings: string[]): Attachment[] {
  const norm = (s: string) => s.replace(/\\/g, '/');
  const out: Attachment[] = [];
  const seen = new Set<string>();
  for (const s of c.all(root, 'SupplementsList/Supplement')) {
    const filename = c.text(s, 'Filename');
    if (!filename) continue;
    seen.add(norm(filename));
    const algorithm = c.attr(s, 'DigestMethod', 'Algorithm')?.split('#').pop();
    const digest = c.text(s, 'DigestValue');
    const description = [
      c.attr(s, undefined, 'preview') === 'true' ? 'Preview of the invoice' : undefined,
      digest ? `${algorithm ?? 'digest'}: ${digest}` : undefined,
    ]
      .filter(Boolean)
      .join('; ');
    out.push({ kind: 'reference', id: filename, ...(description ? { description } : {}) });
  }
  for (const name of siblings) {
    if (seen.has(norm(name))) continue;
    out.push({ kind: 'reference', id: name, description: 'ISDOCX entry not listed in SupplementsList' });
  }
  return out;
}
