/**
 * Svefaktura 1.0 (SFTI BasicInvoice, UBL 1.0 based) -> canonical, following SFTI's
 * "Mapping of Svefaktura 1.0 onto EN 16931-1".
 *
 * Elements are matched by local name in any namespace: Svefaktura mixes the document
 * namespace, the SFTI aggregate namespace and the UBL 1.0 basic namespace on sibling
 * elements, and real senders do not always place them correctly.
 *
 * EN-mandatory data Svefaktura can omit (quantity, price, line VAT, country, endpoint)
 * stays absent. The only values filled in are the ones SFTI's guide prescribes, and
 * each of them is recorded in `source.derived`.
 */
import type { Element } from '@xmldom/xmldom';
import type {
  Address, AllowanceCharge, Attachment, CanonicalInvoice, Contact, CreditTransfer, Identifier, Line, Party,
  PaymentInstructions, Period, Seller, Totals, VatBreakdown, VatInfo,
} from '../canonical.js';
import { add, isZero, sub, sum } from '../values.js';
import { CREDIT_TYPE_CODES, Ctx, ParseError, finish, parseXml, sourceMeta } from './context.js';
import type { ParseInput } from './index.js';

/** BT-24 is absent in Svefaktura; the canonical model gets the root namespace, and `source.format` keeps the true origin. */
const SPEC_ID = 'urn:sfti:documents:BasicInvoice:1:0';
/** Svefaktura bank identifiers for Swedish giro systems -> Peppol BT-86 values (SE-R-011). */
const GIRO: Record<string, string> = { BGABSESS: 'SE:BANKGIRO', PGSISESS: 'SE:PLUSGIRO' };
/** Free-text units seen in Swedish invoices -> UN/ECE Rec 20. The source text is always kept in `unitText`. */
const UNITS: Record<string, string> = {
  st: 'H87', 'st.': 'H87', styck: 'H87', pcs: 'H87', ea: 'H87',
  tim: 'HUR', 'tim.': 'HUR', h: 'HUR', timme: 'HUR', timmar: 'HUR',
  dag: 'DAY', dagar: 'DAY', 'mån': 'MON', 'månad': 'MON', kg: 'KGM', l: 'LTR', liter: 'LTR', m: 'MTR', km: 'KMT',
  m2: 'MTK', 'm²': 'MTK', m3: 'MTQ', 'm³': 'MTQ', kwh: 'KWH', 'år': 'ANN',
};

export function parseSvefaktura(input: ParseInput): CanonicalInvoice[] {
  const root = parseXml(input.payload.xml);
  const c = new Ctx({});

  const id = c.text(root, 'ID');
  const issueDate = c.date(root, 'IssueDate', 'BT-2');
  if (!id || !issueDate) throw new ParseError('Invoice number (BT-1) or issue date (BT-2) missing');
  const typeCode = c.text(root, 'InvoiceTypeCode') ?? '380';

  const legal = c.el(root, 'LegalTotal');
  if (!legal) throw new ParseError('LegalTotal missing');
  let currency = c.text(root, 'InvoiceCurrencyCode');
  if (!currency) {
    currency = c.attr(legal, 'TaxInclusiveTotalAmount', 'amountCurrencyID');
    if (!currency) throw new ParseError('No currency: InvoiceCurrencyCode and amountCurrencyID both missing');
    c.derive('/currency', 'InvoiceCurrencyCode absent; taken from LegalTotal/TaxInclusiveTotalAmount/@amountCurrencyID (SFTI)');
  }

  const docRefs = c.all(root, 'AdditionalDocumentReference');
  const refScheme = (r: Element) => c.attr(r, 'ID', 'identificationSchemeID');
  const refsOf = (scheme: string) => docRefs.filter((r) => refScheme(r) === scheme);
  const requisitions = c.all(root, 'RequisitionistDocumentReference').map((r) => c.text(r, 'ID'));

  const sellerParty = c.el(root, 'SellerParty');
  const seller = party(c, c.el(sellerParty, 'Party'), true) as Seller;
  const accounts = c.el(sellerParty, 'AccountsContact');
  if (accounts) seller.contact = mergeContact(seller.contact, contact(c, accounts));

  const lines = c.all(root, 'InvoiceLine').map((l) => line(c, l));
  const count = c.text(root, 'LineItemCountNumeric');
  if (count !== undefined && Number(count) !== lines.length) c.warn('SF-LINECOUNT', `LineItemCountNumeric is ${count} but the invoice has ${lines.length} lines`);

  const allowances = allowanceCharges(c, root, false);
  const charges = allowanceCharges(c, root, true);
  const { totals, vatBreakdown } = totalsAndVat(c, root, legal, lines, allowances, charges);
  deriveLineVat(c, lines, vatBreakdown);

  // Order references live on the lines; BT-13 only when every line names the same order (SFTI).
  const orders = [...new Set(c.all(root, 'InvoiceLine/OrderLineReference/OrderReference/BuyersID').map((e) => c.text(e)).filter(Boolean))];
  if (orders.length > 1) c.warn('SF-ORDERS', `Lines reference ${orders.length} different orders; BT-13 left empty`);

  const payments = paymentInstructions(c, root);
  const dueDates = [...new Set(c.all(root, 'PaymentMeans').map((pm) => c.date(pm, 'DuePaymentDate', 'BT-9')).filter(Boolean))];
  if (dueDates.length > 1) c.warn('SF-DUEDATE-CONFLICT', `PaymentMeans give different due dates: ${dueDates.join(', ')}; the first is used`);

  const terms = c.el(root, 'PaymentTerms');
  const penalty = c.text(terms, 'PenaltySurchargePercent');
  const paymentTerms = [c.text(terms, 'Note'), penalty ? `Dröjsmålsränta ${penalty} %` : undefined].filter(Boolean).join('\n') || undefined;

  const objectRef = refsOf('ACD')[0];
  const deliveryEl = c.el(root, 'Delivery');
  const telefax = c.text(sellerParty, 'Party/Contact/Telefax');
  if (telefax) c.unmapped['/Invoice/SellerParty/Party/Contact/Telefax'] = telefax;
  const exchangeRate = c.el(root, 'ExchangeRate');
  if (exchangeRate) c.unmapped['/Invoice/ExchangeRate'] = (exchangeRate.textContent ?? '').replace(/\s+/g, ' ').trim();
  const specialTerms = c.text(root, 'DeliveryTerms/SpecialTerms');
  if (specialTerms) c.unmapped['/Invoice/DeliveryTerms/SpecialTerms'] = specialTerms;

  const payeeName = c.text(root, 'PaymentMeans/PayeePartyName/Name');
  const inv = {
    kind: CREDIT_TYPE_CODES.has(typeCode) ? 'creditNote' : 'invoice',
    typeCode,
    id,
    issueDate,
    selfBilled: false,
    currency,
    taxCurrency: c.text(root, 'TaxCurrencyCode'),
    taxPointDate: c.date(root, 'TaxPointDate', 'BT-7'),
    dueDate: dueDates[0],
    buyerReference: requisitions[0],
    contractRef: c.text(refsOf('CT')[0], 'ID'),
    purchaseOrderRef: orders.length === 1 ? orders[0] : undefined,
    despatchAdviceRef: c.text(refsOf('DQ')[0], 'ID'),
    invoicedObjectId: objectRef ? { value: c.text(objectRef, 'ID') ?? '' } : undefined,
    accountingRef: requisitions[1],
    paymentTerms,
    notes: c.texts(root, 'Note').map((text) => ({ text })),
    specificationId: SPEC_ID,
    precedingInvoices: c.all(root, 'InitialInvoiceDocumentReference').map((r) => ({ id: c.text(r, 'ID') ?? '' })),
    invoicePeriod: period(c, c.el(root, 'InvoicingPeriod')),
    seller,
    buyer: party(c, c.el(root, 'BuyerParty/Party'), false),
    payee: payeeName ? { name: payeeName } : undefined,
    additionalParties: [],
    delivery: deliveryEl ? {
      actualDate: c.date(deliveryEl, 'ActualDeliveryDateTime', 'BT-72'),
      locationId: gln(c, c.el(deliveryEl, 'DeliveryAddress/ID')),
      address: address(c, c.el(deliveryEl, 'DeliveryAddress')),
    } : undefined,
    payments,
    paymentSchedule: [],
    allowances,
    charges,
    totals,
    vatBreakdown,
    otherTaxes: [],
    withholdings: [],
    attachments: refsOf('ATS').map((r) => attachment(c, r)),
    lines,
    clearance: [],
    extensions: {},
    source: sourceMeta(input, root, c),
  } as CanonicalInvoice;
  return [finish(inv)];
}

/** GLN identifiers carry identificationSchemeAgencyID="9" (GS1) -> ICD 0088. */
function gln(c: Ctx, e: Element | undefined): Identifier | undefined {
  const value = c.text(e);
  if (!value) return undefined;
  const agency = c.attr(e, undefined, 'identificationSchemeAgencyID');
  const scheme = c.attr(e, undefined, 'identificationSchemeID');
  if (agency === '9' || scheme === 'GLN') return { value, schemeId: '0088' };
  return scheme ? { value, schemeId: scheme } : { value };
}

/** GS1 item identifiers are GTINs -> ICD 0160 (SFTI's guide says 0088, which is the GLN scheme for parties and locations). */
function gtin(c: Ctx, e: Element | undefined): Identifier | undefined {
  const value = c.text(e);
  if (!value) return undefined;
  return c.attr(e, undefined, 'identificationSchemeAgencyID') === '9' ? { value, schemeId: '0160' } : { value };
}

function party(c: Ctx, p: Element | undefined, isSeller: boolean): Party {
  const schemes = c.all(p, 'PartyTaxScheme');
  const byTax = (code: string) => schemes.find((s) => c.text(s, 'TaxScheme/ID') === code);
  const vat = byTax('VAT');
  const swt = byTax('SWT');
  const regName = c.text(swt, 'RegistrationName') ?? c.text(vat, 'RegistrationName');
  const partyName = c.text(p, 'PartyName/Name');
  const orgNr = c.text(swt, 'CompanyID');
  const out: Party & Partial<Seller> = {
    name: regName ?? partyName,
    tradingName: regName && partyName && partyName !== regName ? partyName : undefined,
    identifiers: c.all(p, 'PartyIdentification/ID').map((e) => gln(c, e)).filter((i): i is Identifier => !!i),
    legalRegistrationId: orgNr ? { value: orgNr, schemeId: '0007' } : undefined,
    vatId: c.text(vat, 'CompanyID'),
    nationalTaxIds: [],
    address: address(c, c.el(p, 'Address')),
    contact: contact(c, c.el(p, 'Contact')),
  };
  if (isSeller) {
    const fSkatt = c.text(swt, 'ExemptionReason');
    out.taxRegistrationId = fSkatt && /f-skatt/i.test(fSkatt) ? 'Godkänd för F-skatt' : fSkatt;
    const seat = c.text(swt, 'RegistrationAddress/CityName');
    out.additionalLegalInfo = seat ? `Säte ${seat}` : undefined;
  }
  return out;
}

function address(c: Ctx, a: Element | undefined): Address | undefined {
  if (!a) return undefined;
  const extra = [c.text(a, 'Department'), ...c.texts(a, 'AddressLine/Line')].filter(Boolean);
  return {
    line1: c.text(a, 'StreetName'),
    line2: c.text(a, 'Postbox'),
    line3: extra.join(', ') || undefined,
    city: c.text(a, 'CityName'),
    postalCode: c.text(a, 'PostalZone'),
    countrySubdivision: c.text(a, 'CountrySubentity'),
    countryCode: c.text(a, 'Country/IdentificationCode'),
  };
}

function contact(c: Ctx, e: Element | undefined): Contact | undefined {
  if (!e) return undefined;
  return { name: c.text(e, 'Name'), phone: c.text(e, 'Telephone'), email: c.text(e, 'ElectronicMail') };
}

/** SFTI: the party contact and the seller's AccountsContact are joined with a comma. */
function mergeContact(a: Contact | undefined, b: Contact | undefined): Contact | undefined {
  if (!a) return b;
  if (!b) return a;
  const join = (x?: string, y?: string) => (x && y && x !== y ? `${x}, ${y}` : x ?? y);
  return { name: join(a.name, b.name), phone: join(a.phone, b.phone), email: join(a.email, b.email) };
}

function period(c: Ctx, p: Element | undefined): Period | undefined {
  if (!p) return undefined;
  const start = c.date(p, 'StartDateTime', 'invoicing period start');
  const end = c.date(p, 'EndDateTime', 'invoicing period end');
  return start || end ? { start, end } : undefined;
}

/**
 * Svefaktura PaymentMeansTypeCode is always 1. Accounts with a Bankgiro/Plusgiro
 * institution or a domestic number map to 30; IBAN accounts to 58 (SEPA). One entry per
 * code, keeping every account (SFTI "The use of payment means").
 */
function paymentInstructions(c: Ctx, root: Element): PaymentInstructions[] {
  const byCode = new Map<string, { transfers: CreditTransfer[]; ocr: string[] }>();
  for (const acc of c.all(root, 'PaymentMeans/PayeeFinancialAccount')) {
    const accountId = (c.text(acc, 'ID') ?? '').replace(/[\s-]/g, '');
    const institution = c.text(acc, 'FinancialInstitutionBranch/FinancialInstitution/ID');
    const giro = institution ? GIRO[institution.toUpperCase()] : undefined;
    const iban = /^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(accountId);
    const code = iban && !giro ? '58' : '30';
    const entry = byCode.get(code) ?? { transfers: [], ocr: [] };
    entry.transfers.push({ accountId, accountName: c.text(acc, 'Name'), serviceProviderId: giro ?? institution });
    const ocr = c.text(acc, 'PaymentInstructionID');
    if (ocr) entry.ocr.push(ocr);
    byCode.set(code, entry);
  }
  const allOcr = [...new Set([...byCode.values()].flatMap((e) => e.ocr))];
  if (allOcr.length > 1) c.warn('SF-OCR-CONFLICT', `Payment references differ between accounts: ${allOcr.join(', ')}`);
  if (byCode.size) c.derive('/payments/meansCode', 'Svefaktura PaymentMeansTypeCode 1 -> 30 (Bankgiro/Plusgiro/domestic) or 58 (IBAN), per SFTI');
  return [...byCode].map(([meansCode, e]) => ({ meansCode, remittanceInformation: e.ocr[0], creditTransfers: e.transfers }));
}

function allowanceCharges(c: Ctx, parent: Element, charge: boolean): AllowanceCharge[] {
  return c.all(parent, 'AllowanceCharge')
    .filter((a) => (c.text(a, 'ChargeIndicator') ?? '').toLowerCase() === String(charge))
    .map((a) => {
      const reasonEl = c.el(a, 'ReasonCode');
      const code = c.text(reasonEl);
      const taxCat = c.el(a, 'TaxCategory');
      return {
        amount: c.dec(a, 'Amount')!,
        baseAmount: c.dec(a, 'AllowanceChargeBaseAmount'),
        percentage: c.dec(a, 'MultiplierFactorNumeric'),
        // SFTI uses ZZZ + @name ("Fakturaavgift"); the name is the reason and ZZZ carries no information.
        reason: c.attr(reasonEl, undefined, 'name'),
        reasonCode: code && code !== 'ZZZ' ? code : undefined,
        vat: taxCat ? vatCategory(c, taxCat) : undefined,
      };
    });
}

function vatCategory(c: Ctx, t: Element): VatInfo {
  return { categoryCode: c.text(t, 'ID') ?? '', rate: c.dec(t, 'Percent'), exemptionReason: c.text(t, 'ExemptionReason') };
}

function totalsAndVat(c: Ctx, root: Element, legal: Element, lines: Line[], allowances: AllowanceCharge[], charges: AllowanceCharge[]): { totals: Totals; vatBreakdown: VatBreakdown[] } {
  const taxTotal = c.el(root, 'TaxTotal');
  const lineNetTotal = c.dec(legal, 'LineExtensionTotalAmount');
  if (lineNetTotal === undefined) throw new ParseError('LegalTotal/LineExtensionTotalAmount missing');
  const gross = c.dec(legal, 'TaxInclusiveTotalAmount');
  if (gross === undefined) throw new ParseError('LegalTotal/TaxInclusiveTotalAmount missing');
  const roundOff = c.dec(legal, 'RoundOffAmount');
  const allowanceTotal = allowances.length ? sum(allowances.map((a) => a.amount)) : undefined;
  const chargeTotal = charges.length ? sum(charges.map((a) => a.amount)) : undefined;
  if (allowanceTotal) c.derive('/totals/allowanceTotal', 'Sum of document allowances (no Svefaktura element)');
  if (chargeTotal) c.derive('/totals/chargeTotal', 'Sum of document charges (no Svefaktura element)');
  let taxExclusive = c.dec(legal, 'TaxExclusiveTotalAmount');
  if (taxExclusive === undefined) {
    taxExclusive = add(sub(lineNetTotal, allowanceTotal ?? '0'), chargeTotal ?? '0');
    c.derive('/totals/taxExclusive', 'TaxExclusiveTotalAmount absent; computed as BT-106 - BT-107 + BT-108');
  }
  const vatTotal = c.dec(taxTotal, 'TotalTaxAmount');

  let vatBreakdown = c.all(taxTotal, 'TaxSubTotal').map((s): VatBreakdown => {
    const cat = c.el(s, 'TaxCategory');
    return {
      taxableAmount: c.dec(s, 'TaxableAmount')!,
      taxAmount: c.dec(s, 'TaxAmount')!,
      categoryCode: c.text(cat, 'ID') ?? '',
      rate: c.dec(cat, 'Percent'),
      exemptionReason: c.text(cat, 'ExemptionReason'),
      taxAmountInTaxCurrency: c.dec(s, 'TaxCurrencyTaxAmount'),
    };
  });
  for (const v of vatBreakdown) if (v.taxableAmount === undefined || v.taxAmount === undefined) throw new ParseError('TaxSubTotal without TaxableAmount or TaxAmount');
  if (vatBreakdown.some((v) => v.categoryCode === 'E')) {
    c.warn('SF-VAT-E', 'Svefaktura category E covers every kind of exemption; EN separates E, AE, K, G, O and Z. Kept as E with the reason text; review before booking');
  }
  if (vatBreakdown.length === 0 && (vatTotal === undefined || isZero(vatTotal))) {
    // SFTI: no breakdown, or only TotalTaxAmount = 0. EN requires at least one BG-23.
    vatBreakdown = [{ taxableAmount: taxExclusive, taxAmount: vatTotal ?? ('0' as VatBreakdown['taxAmount']), categoryCode: 'E', exemptionReason: 'No VAT stated in the source invoice' }];
    c.derive('/vatBreakdown/0', 'No TaxSubTotal and no VAT: one category E breakdown synthesised from BT-109 (SFTI)');
  }
  const taxCurrencyAmounts = vatBreakdown.map((v) => v.taxAmountInTaxCurrency).filter((x): x is NonNullable<typeof x> => !!x);

  const totals: Totals = {
    lineNetTotal,
    allowanceTotal,
    chargeTotal,
    taxExclusive,
    vatTotal,
    vatTotalInTaxCurrency: taxCurrencyAmounts.length ? sum(taxCurrencyAmounts) : undefined,
    // Svefaktura's TaxInclusiveTotalAmount already includes the round-off; EN's BT-112 does not.
    taxInclusive: roundOff ? sub(gross, roundOff) : gross,
    rounding: roundOff,
    payable: gross,
  };
  if (roundOff) c.derive('/totals/taxInclusive', 'TaxInclusiveTotalAmount minus RoundOffAmount (Svefaktura includes rounding)');
  if (lines.length === 0) c.warn('NO_LINES', 'The invoice has no lines');
  return { totals, vatBreakdown };
}

/** SFTI: line VAT may be derived only when the document has exactly one category and rate. */
function deriveLineVat(c: Ctx, lines: Line[], breakdown: VatBreakdown[]) {
  const missing = lines.filter((l) => !l.vat);
  if (missing.length === 0) return;
  if (breakdown.length === 1) {
    const { categoryCode, rate } = breakdown[0];
    for (const l of missing) l.vat = { categoryCode, rate };
    c.derive('/lines/*/vat', `Line VAT absent on ${missing.length} line(s); taken from the single VAT category ${categoryCode} ${rate ?? ''}`.trim());
  } else {
    c.warn('SF-LINE-VAT', `${missing.length} line(s) have no VAT category and the document has ${breakdown.length} categories; not derived`);
  }
}

function attachment(c: Ctx, r: Element): Attachment {
  const id = c.text(r, 'ID') ?? '';
  // urn:sfti:documents:object:... points to a separate ObjectEnvelope; http(s) values are links.
  if (/^https?:\/\//i.test(id)) return { kind: 'external', id, uri: id };
  return { kind: 'reference', id, schemeId: 'ATS' };
}

function line(c: Ctx, l: Element): Line {
  const qtyEl = c.el(l, 'InvoicedQuantity');
  const unitText = c.attr(qtyEl, undefined, 'quantityUnitCode') ?? c.attr(qtyEl, undefined, 'unitCode');
  const unitCode = unitText ? UNITS[unitText.toLowerCase()] ?? (/^[A-Z0-9]{2,3}$/.test(unitText) ? unitText : undefined) : undefined;
  const itemEl = c.el(l, 'Item');
  const basePrice = c.el(itemEl, 'BasePrice');
  const taxCat = c.el(itemEl, 'TaxCategory');
  const netAmount = c.dec(l, 'LineExtensionAmount');
  const lineId = c.text(l, 'ID') ?? '';
  if (netAmount === undefined) throw new ParseError(`Line ${lineId || '?'}: LineExtensionAmount missing`);
  const description = c.text(itemEl, 'Description');
  if (!description) c.warn('SF-NO-ITEM-NAME', `Line ${lineId}: no Item/Description (BT-153 is mandatory in EN 16931)`);
  const notes = [c.text(l, 'Note'), c.text(l, 'DespatchLineReference/DocumentReference/ID')].filter(Boolean);
  return {
    id: lineId,
    note: notes.join('\n') || undefined,
    quantity: c.dec(qtyEl),
    unitCode,
    unitText: unitText && unitText !== unitCode ? unitText : undefined,
    netAmount,
    orderLineRef: c.text(l, 'OrderLineReference/BuyersLineID'),
    allowances: allowanceCharges(c, l, false).map(({ vat: _vat, ...a }) => a),
    charges: allowanceCharges(c, l, true).map(({ vat: _vat, ...a }) => a),
    price: basePrice && c.dec(basePrice, 'PriceAmount') !== undefined ? {
      net: c.dec(basePrice, 'PriceAmount')!,
      baseQuantity: c.dec(basePrice, 'BaseQuantity'),
      baseQuantityUnit: c.attr(basePrice, 'BaseQuantity', 'quantityUnitCode'),
    } : undefined,
    vat: taxCat ? vatCategory(c, taxCat) : undefined,
    item: {
      name: description ?? '',
      sellerId: c.text(itemEl, 'SellersItemIdentification/ID'),
      buyerId: c.text(itemEl, 'BuyersItemIdentification/ID'),
      standardId: gtin(c, c.el(itemEl, 'StandardItemIdentification/ID')),
      classifications: [],
      attributes: [],
    },
  };
}
