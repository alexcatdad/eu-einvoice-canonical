/**
 * Finvoice 3.0 (Finnish Federation of Financial Services) -> canonical, following the
 * Finvoice 3.0 mapping onto EN 16931.
 *
 * No namespace; elements are matched by local name. Decimals use a comma
 * ("1234,56"); dates are CCYYMMDD with a Format attribute. The SOAP/ebMS envelope
 * and ISO-8859-15 decoding are handled before this parser runs.
 *
 * - Y-tunnus (SellerPartyIdentifier) -> legalRegistrationId 'FI:YTUNNUS', value as sent.
 *   OVT codes (organisation unit numbers, message addresses with SchemeID 0037) -> EAS 0216.
 * - Payable amount is EpiInstructedAmount; BT-83 is EpiRemittanceInfoIdentifier.
 * - InvoiceRows without an ArticleName (print/summary rows built from SubInvoiceRow) are
 *   not invoice lines: counting them would double the totals. They go to source.unmapped.
 */
import type { Element } from '@xmldom/xmldom';
import type {
  AdditionalParty, Address, AllowanceCharge, CanonicalInvoice, Contact, CreditTransfer, Decimal, Identifier, Line,
  IsoDate, Party, PaymentInstructions, Period, Seller, Totals, VatBreakdown, VatInfo,
} from '../canonical.js';
import { ValueError, sub, sum, toDecimal } from '../values.js';
import { CREDIT_TYPE_CODES, SELF_BILLED_TYPE_CODES, Ctx, ParseError, finish, parseXml, sourceMeta } from './context.js';
import type { ParseInput } from './index.js';

/** Finvoice InvoiceTypeCode -> UNCL 1001 when InvoiceTypeCodeUN is absent. */
const TYPE_TO_UN: Record<string, string> = { INV01: '380', INV02: '381', INV07: '389' };

export function parseFinvoice(input: ParseInput): CanonicalInvoice[] {
  const root = parseXml(input.payload.xml);
  const c = new Ctx({});
  const d = c.el(root, 'InvoiceDetails');
  if (!d) throw new ParseError('InvoiceDetails missing');

  const id = c.text(d, 'InvoiceNumber');
  const issueDate = c.date(d, 'InvoiceDate', 'BT-2');
  if (!id || !issueDate) throw new ParseError('Invoice number (BT-1) or issue date (BT-2) missing');

  const fiType = c.text(d, 'InvoiceTypeCode');
  let typeCode = c.text(d, 'InvoiceTypeCodeUN') ?? (fiType ? TYPE_TO_UN[fiType] : undefined);
  if (!typeCode) {
    typeCode = '380';
    c.warn('FI-TYPE-UNMAPPED', `InvoiceTypeCode ${fiType ?? '(absent)'} has no UNCL 1001 equivalent; treated as 380`);
  }
  const kind = CREDIT_TYPE_CODES.has(typeCode) ? 'creditNote' : 'invoice';

  const incl = dec(c, d, 'InvoiceTotalVatIncludedAmount');
  const excl = dec(c, d, 'InvoiceTotalVatExcludedAmount');
  if (incl === undefined || excl === undefined) throw new ParseError('InvoiceTotalVatExcludedAmount or InvoiceTotalVatIncludedAmount missing');
  if (kind === 'creditNote' && incl.startsWith('-')) {
    c.warn('FI-CREDIT-NEGATIVE', 'Finvoice credit notes (INV02) carry negative amounts; source signs are kept, so effectiveSign() must not be applied on top');
  }
  const currency = c.attr(d, 'InvoiceTotalVatIncludedAmount', 'AmountCurrencyIdentifier')
    ?? c.attr(d, 'InvoiceTotalVatExcludedAmount', 'AmountCurrencyIdentifier')
    ?? c.attr(root, 'EpiDetails/EpiPaymentInstructionDetails/EpiInstructedAmount', 'AmountCurrencyIdentifier');
  if (!currency) throw new ParseError('No currency: AmountCurrencyIdentifier missing on the invoice totals');

  const { lines, informationalRows } = lineRows(c, root);
  if (informationalRows > 0) c.warn('FI-INFO-ROWS', `${informationalRows} InvoiceRow(s) without ArticleName are print rows, not invoice lines; kept in source.unmapped`);

  const seller = party(c, [c.el(root, 'SellerPartyDetails'), root], 'Seller', 'SellerPartyIdentifier') as Seller;
  const sellerUnit = c.text(root, 'SellerOrganisationUnitNumber');
  if (sellerUnit) seller.identifiers.push({ value: sellerUnit, schemeId: '0216' });
  const buyer = party(c, [c.el(root, 'BuyerPartyDetails'), root], 'Buyer', 'BuyerPartyIdentifier');
  const buyerUnit = c.text(root, 'BuyerOrganisationUnitNumber');
  if (buyerUnit) buyer.identifiers.push({ value: buyerUnit, schemeId: '0216' });
  const from = c.el(root, 'MessageTransmissionDetails/MessageSenderDetails/FromIdentifier');
  const to = c.el(root, 'MessageTransmissionDetails/MessageReceiverDetails/ToIdentifier');
  seller.endpoint = endpoint(c, from);
  buyer.endpoint = endpoint(c, to);

  const rowsTotal = dec(c, d, 'RowsTotalVatExcludedAmount');
  let lineNetTotal = rowsTotal;
  if (lineNetTotal === undefined) {
    lineNetTotal = lines.length ? sum(lines.map((l) => l.netAmount)) : excl;
    c.derive('/totals/lineNetTotal', 'RowsTotalVatExcludedAmount absent; sum of line amounts' + (lines.length ? '' : ' (no lines: BT-109)'));
  }

  const vatBreakdown = c.all(d, 'VatSpecificationDetails').map((v): VatBreakdown => {
    const rate = dec(c, v, 'VatRatePercent');
    const code = c.text(v, 'VatCode') ?? guessCategory(c, rate, 'VAT specification');
    const base = dec(c, v, 'VatBaseAmount');
    const amount = dec(c, v, 'VatRateAmount');
    if (base === undefined || amount === undefined) throw new ParseError('VatSpecificationDetails without VatBaseAmount or VatRateAmount');
    return { taxableAmount: base, taxAmount: amount, categoryCode: code, rate, exemptionReason: c.text(v, 'VatFreeText') };
  });
  if (vatBreakdown.length === 0) c.warn('FI-NO-VATSPEC', 'No VatSpecificationDetails; EN 16931 requires at least one VAT breakdown');

  const { payments, remittance, instructed, epiDue } = paymentInstructions(c, root);
  const dueDate = c.date(d, 'PaymentTermsDetails/InvoiceDueDate', 'BT-9') ?? epiDue;

  // Finvoice 3.0 guidelines, invoice-level calculation: RowsTotal (BT-106), DiscountsTotal (BT-107), ChargesTotal (BT-108),
  // InvoiceTotalVatExcluded (BT-109), InvoiceTotalVat (BT-110), InvoiceTotalVatIncluded (BT-112), InvoicePaid (BT-113), Epi amount (BT-115).
  const prepaid = dec(c, d, 'InvoicePaidAmount');
  const totals: Totals = {
    lineNetTotal,
    allowanceTotal: dec(c, d, 'DiscountsTotalVatExcludedAmount'),
    chargeTotal: dec(c, d, 'ChargesTotalVatExcludedAmount'),
    taxExclusive: excl,
    vatTotal: dec(c, d, 'InvoiceTotalVatAmount'),
    taxInclusive: incl,
    prepaid,
    payable: instructed ?? (prepaid !== undefined ? sub(incl, prepaid) : incl),
  };
  if (instructed === undefined) c.derive('/totals/payable', `EpiInstructedAmount absent; taken from InvoiceTotalVatIncludedAmount${prepaid !== undefined ? ' minus InvoicePaidAmount' : ''}`);

  const terms = c.texts(d, 'PaymentTermsDetails/PaymentTermsFreeText');
  const fine = c.text(d, 'PaymentTermsDetails/PaymentOverDueFineDetails/PaymentOverDueFinePercent');
  if (fine) {
    terms.push(`Late payment interest ${fine.replace(',', '.')} %`);
    c.derive('/paymentTerms', 'PaymentOverDueFinePercent appended as text; EN 16931 has no structured field');
  }

  for (const p of ['SellerReferenceIdentifier', 'SellersBuyerIdentifier', 'AgreementTypeText', 'OriginCode', 'InvoiceTypeText', 'CashDiscountDate']) {
    const v = c.text(d, p) ?? c.text(d, `PaymentTermsDetails/${p}`);
    if (v) c.unmapped[`/Finvoice/InvoiceDetails/${p}`] = v;
  }
  c.all(d, 'DefinitionDetails').forEach((def, i) => {
    const key = c.text(def, 'DefinitionHeaderText');
    const val = c.text(def, 'DefinitionValue');
    if (key && val) c.unmapped[`/Finvoice/InvoiceDetails/DefinitionDetails[${i + 1}]/${c.attr(def, 'DefinitionHeaderText', 'DefinitionCode') ?? key}`] = val;
  });
  const barcode = c.text(root, 'VirtualBankBarcode');
  if (barcode) c.unmapped['/Finvoice/VirtualBankBarcode'] = barcode;

  const delivery = c.el(root, 'DeliveryPartyDetails');
  const deliveryDate = c.date(root, 'DeliveryDetails/DeliveryDate', 'BT-72');
  const siteCode = c.text(root, 'DeliverySiteCode');
  const deliveryParty = delivery ? party(c, [delivery, root], 'Delivery', 'DeliveryPartyIdentifier') : undefined;

  const orderRef = c.text(d, 'OrderIdentifier');
  const preceding = precedingInvoices(c, root, d);
  const url = c.text(d, 'InvoiceUrlText');
  const inv = {
    kind,
    typeCode,
    id,
    issueDate,
    nationalType: fiType ? { scheme: 'FI:InvoiceTypeCode', code: fiType, label: c.text(d, 'InvoiceTypeText') } : undefined,
    selfBilled: SELF_BILLED_TYPE_CODES.has(typeCode) || fiType === 'INV07',
    currency,
    dueDate,
    buyerReference: c.text(d, 'BuyerReferenceIdentifier'),
    projectRef: c.text(d, 'ProjectReferenceIdentifier'),
    contractRef: c.text(d, 'AgreementIdentifier'),
    purchaseOrderRef: orderRef,
    tenderRef: c.text(d, 'TenderReference'),
    paymentTerms: terms.join('\n') || undefined,
    notes: c.texts(d, 'InvoiceFreeText').map((text) => ({ text })),
    specificationId: `urn:finvoice:${input.details.version ?? '3.0'}`,
    precedingInvoices: preceding,
    invoicePeriod: period(c, d, 'InvoicingPeriodStartDate', 'InvoicingPeriodEndDate'),
    seller,
    buyer,
    additionalParties: c.all(root, 'AnyPartyDetails').map((a): AdditionalParty => {
      const code = c.attr(a, 'AnyPartyText', 'AnyPartyCode');
      return {
        role: c.text(a, 'AnyPartyText') ?? 'other',
        sourceRole: code ? `FI:AnyPartyCode:${code}` : undefined,
        party: party(c, [a], 'Any', 'AnyPartyIdentifier'),
      };
    }),
    delivery: deliveryParty || deliveryDate || siteCode ? {
      partyName: deliveryParty?.name,
      locationId: siteCode ? { value: siteCode } : undefined,
      actualDate: deliveryDate,
      address: deliveryParty?.address,
    } : undefined,
    payments,
    paymentSchedule: [],
    allowances: [],
    charges: [],
    totals,
    vatBreakdown,
    otherTaxes: [],
    withholdings: [],
    attachments: url ? [{ kind: 'external', id: url, uri: url }] : [],
    lines,
    clearance: [],
    extensions: { fi: { invoiceTypeCode: fiType, epiReference: remittance } },
    source: sourceMeta(input, root, c, {
      specificationId: c.text(root, 'MessageTransmissionDetails/MessageDetails/SpecificationIdentifier'),
      profileId: c.text(root, 'MessageTransmissionDetails/MessageDetails/ImplementationCode'),
    }),
  } as CanonicalInvoice;
  return [finish(inv)];
}

/** Decimal with a comma (or dot) separator. */
function dec(c: Ctx, node: Element | undefined, path?: string): Decimal | undefined {
  const raw = c.text(node, path);
  if (raw === undefined) return undefined;
  try { return toDecimal(raw.replace(',', '.')); } catch (e) {
    if (e instanceof ValueError) throw new ParseError(`${path ?? node?.localName}: ${e.message}`);
    throw e;
  }
}

/** Exact division by 100, for unit prices stated in cents. */
function centsToUnit(v: Decimal): Decimal {
  const neg = v.startsWith('-');
  const [i, f = ''] = (neg ? v.slice(1) : v).split('.');
  const digits = i + f;
  const intLen = i.length - 2;
  const out = intLen > 0 ? `${digits.slice(0, intLen)}.${digits.slice(intLen)}` : `0.${'0'.repeat(-intLen)}${digits}`;
  return toDecimal(`${neg ? '-' : ''}${out}`);
}

function guessCategory(c: Ctx, rate: Decimal | undefined, where: string): string {
  if (rate !== undefined && rate !== '0' && !/^0(\.0*)?$/.test(rate)) {
    c.derive('/vat/categoryCode', `${where}: VAT code absent; 'S' assumed for rate ${rate}`);
    return 'S';
  }
  c.warn('FI-VATCODE-MISSING', `${where}: VAT code absent and rate is zero or missing; category left empty`);
  return '';
}

/** Finvoice message addresses use SchemeID 0037 for OVT codes -> EAS 0216. */
function endpoint(c: Ctx, e: Element | undefined): Identifier | undefined {
  const value = c.text(e);
  if (!value) return undefined;
  const scheme = c.attr(e, undefined, 'SchemeID');
  if (scheme === '0037') {
    c.derive('/endpoint', 'Finvoice SchemeID 0037 (OVT) mapped to EAS 0216');
    return { value, schemeId: '0216' };
  }
  return scheme ? { value, schemeId: scheme } : { value };
}

function period(c: Ctx, node: Element | undefined, startName: string, endName: string): Period | undefined {
  const start = c.date(node, startName, startName);
  const end = c.date(node, endName, endName);
  return start || end ? { start, end } : undefined;
}

/**
 * `scopes` are searched in order: Seller/Buyer data is split between *PartyDetails
 * and the root (contact person, communication details), AnyPartyDetails holds everything itself.
 */
function party(c: Ctx, scopes: (Element | undefined)[], p: string, idName: string): Party {
  const t = (path: string) => {
    for (const s of scopes) { const v = c.text(s, path); if (v !== undefined) return v; }
    return undefined;
  };
  const names = scopes.flatMap((s) => c.texts(s, `${p}OrganisationName`));
  const addr = scopes.map((s) => c.el(s, `${p}PostalAddressDetails`)).find(Boolean);
  const yt = t(idName);
  const out: Party = {
    name: names[0],
    tradingName: names[1],
    identifiers: [],
    legalRegistrationId: yt ? { value: yt, schemeId: 'FI:YTUNNUS' } : undefined,
    vatId: t(`${p}OrganisationTaxCode`),
    nationalTaxIds: [],
    address: addr ? address(c, addr, p) : undefined,
    contact: contact(c, scopes, p),
  };
  return out;
}

function address(c: Ctx, a: Element, p: string): Address {
  return {
    line1: c.text(a, `${p}StreetName`),
    line2: c.text(a, `${p}PostOfficeBoxIdentifier`),
    city: c.text(a, `${p}TownName`),
    postalCode: c.text(a, `${p}PostCodeIdentifier`),
    countrySubdivision: c.text(a, `${p}CountrySubdivision`),
    countryCode: c.text(a, 'CountryCode'),
  };
}

function contact(c: Ctx, scopes: (Element | undefined)[], p: string): Contact | undefined {
  const t = (...paths: string[]) => {
    for (const s of scopes) for (const path of paths) { const v = c.text(s, path); if (v !== undefined) return v; }
    return undefined;
  };
  const out: Contact = {
    name: t(`${p}ContactPersonName`),
    phone: t(`${p}CommunicationDetails/${p}PhoneNumberIdentifier`),
    email: t(`${p}CommunicationDetails/${p}EmailaddressIdentifier`, `${p}CommunicationDetails/${p}EmailAddressIdentifier`),
  };
  return out.name || out.phone || out.email ? out : undefined;
}

function paymentInstructions(c: Ctx, root: Element) {
  const epi = c.el(root, 'EpiDetails');
  const instr = c.el(epi, 'EpiPaymentInstructionDetails');
  const bfi = c.el(epi, 'EpiPartyDetails/EpiBfiPartyDetails');
  const benef = c.el(epi, 'EpiPartyDetails/EpiBeneficiaryPartyDetails');
  const remittance = c.text(instr, 'EpiRemittanceInfoIdentifier');
  const instructed = dec(c, instr, 'EpiInstructedAmount');
  const epiDue = c.date(instr, 'EpiDateOptionDate', 'BT-9');

  const transfers: CreditTransfer[] = [];
  const accountId = c.text(benef, 'EpiAccountID')?.replace(/\s/g, '');
  if (accountId) {
    transfers.push({ accountId, accountName: c.text(benef, 'EpiNameAddressDetails'), serviceProviderId: c.text(bfi, 'EpiBfiIdentifier') });
  } else {
    for (const acc of c.all(root, 'SellerInformationDetails/SellerAccountDetails')) {
      const aid = c.text(acc, 'SellerAccountID')?.replace(/\s/g, '');
      if (aid) transfers.push({ accountId: aid, accountName: c.text(acc, 'SellerAccountName'), serviceProviderId: c.text(acc, 'SellerBic') });
    }
    if (transfers.length) c.derive('/payments/0/creditTransfers', 'EpiAccountID absent; accounts taken from SellerAccountDetails');
  }
  if (!epi && transfers.length === 0) return { payments: [] as PaymentInstructions[], remittance, instructed, epiDue };

  let meansCode = c.text(instr, 'EpiPaymentMeansCode');
  if (!meansCode) {
    meansCode = transfers.length ? '30' : 'ZZZ';
    c.derive('/payments/0/meansCode', `EpiPaymentMeansCode absent; ${meansCode === '30' ? 'credit transfer (30) assumed from the bank account' : 'ZZZ (mutually defined)'}`);
  }
  const benefId = c.text(benef, 'EpiBei');
  if (benefId) c.unmapped['/Finvoice/EpiDetails/EpiPartyDetails/EpiBeneficiaryPartyDetails/EpiBei'] = benefId;
  const epiRef = c.text(epi, 'EpiIdentificationDetails/EpiReference');
  if (epiRef) c.unmapped['/Finvoice/EpiDetails/EpiIdentificationDetails/EpiReference'] = epiRef;
  const payments: PaymentInstructions[] = [{
    meansCode,
    meansText: c.text(instr, 'EpiPaymentMeansText'),
    remittanceInformation: remittance,
    creditTransfers: transfers,
  }];
  return { payments, remittance, instructed, epiDue };
}

function rowVat(c: Ctx, r: Element, where: string): VatInfo | undefined {
  const rate = dec(c, r, 'RowVatRatePercent');
  const code = c.text(r, 'RowVatCode');
  if (rate === undefined && !code) return undefined;
  return { categoryCode: code ?? guessCategory(c, rate, where), rate, exemptionReason: c.text(r, 'RowVatFreeText') };
}

function lineRows(c: Ctx, root: Element): { lines: Line[]; informationalRows: number } {
  const lines: Line[] = [];
  let informationalRows = 0;
  let idDerived = false;
  c.all(root, 'InvoiceRow').forEach((r, index) => {
    if (!c.el(r, 'ArticleName')) {
      informationalRows++;
      const text = c.texts(r, 'SubInvoiceRow/SubArticleName').join('; ');
      const amount = c.text(r, 'SubInvoiceRow/SubRowAmount');
      c.unmapped[`/Finvoice/InvoiceRow[${index + 1}]`] = [text, amount].filter(Boolean).join(' = ');
      return;
    }
    const where = `InvoiceRow ${index + 1}`;
    const explicitId = c.text(r, 'RowPositionIdentifier') ?? c.text(r, 'RowIdentifier');
    if (!explicitId) idDerived = true;
    let net = dec(c, r, 'RowVatExcludedAmount');
    if (net === undefined) {
      const gross = dec(c, r, 'RowAmount');
      const vat = dec(c, r, 'RowVatAmount');
      if (gross === undefined || vat === undefined) throw new ParseError(`${where}: RowVatExcludedAmount missing`);
      net = sub(gross, vat);
      c.derive(`/lines/${index}/netAmount`, `${where}: RowVatExcludedAmount absent; RowAmount minus RowVatAmount`);
    }

    const qtyEl = c.el(r, 'InvoicedQuantity');
    const unitText = c.attr(qtyEl, undefined, 'QuantityUnitCode');
    const unitCode = c.attr(qtyEl, undefined, 'QuantityUnitCodeUN');

    let price: Line['price'];
    const priceEl = c.el(r, 'UnitPriceNetAmount') ?? c.el(r, 'UnitPriceAmount');
    const rawPrice = priceEl ? dec(c, priceEl) : undefined;
    if (rawPrice !== undefined) {
      const priceUnit = c.attr(r, 'UnitPriceAmount', 'UnitPriceUnitCode') ?? '';
      const cents = /^(snt|c|cent|cents)\//i.test(priceUnit);
      price = { net: cents ? centsToUnit(rawPrice) : rawPrice };
      if (cents) c.derive(`/lines/${index}/price/net`, `${where}: unit price stated in cents (${priceUnit}); divided by 100`);
    }

    const discountAmount = dec(c, r, 'RowDiscountAmount');
    const allowances: AllowanceCharge[] = discountAmount !== undefined
      ? [{ amount: discountAmount, percentage: dec(c, r, 'RowDiscountPercent') }]
      : [];

    const subLines: Line[] = c.all(r, 'SubInvoiceRow').map((s, si) => {
      const subNet = dec(c, s, 'SubRowVatExcludedAmount') ?? dec(c, s, 'SubRowAmount');
      const subQty = c.el(s, 'SubInvoicedQuantity');
      return {
        id: `${explicitId ?? index + 1}.${si + 1}`,
        quantity: dec(c, subQty),
        unitCode: c.attr(subQty, undefined, 'QuantityUnitCodeUN'),
        unitText: c.attr(subQty, undefined, 'QuantityUnitCode'),
        netAmount: subNet ?? ('0' as Decimal),
        note: c.texts(s, 'SubRowFreeText').join('\n') || undefined,
        period: period(c, s, 'SubStartDate', 'SubEndDate'),
        allowances: [],
        charges: [],
        item: { name: c.text(s, 'SubArticleName') ?? '', classifications: [], attributes: [] },
      };
    });

    const ean = c.text(r, 'EanCode');
    const line: Line = {
      id: explicitId ?? String(index + 1),
      note: c.texts(r, 'RowFreeText').join('\n') || undefined,
      quantity: dec(c, qtyEl),
      unitCode,
      unitText,
      netAmount: net,
      orderLineRef: c.text(r, 'RowOrderPositionIdentifier'),
      accountingRef: c.text(r, 'RowAccountDimensionText'),
      period: period(c, r, 'StartDate', 'EndDate'),
      allowances,
      charges: [],
      price,
      vat: rowVat(c, r, where),
      item: {
        name: c.text(r, 'ArticleName') ?? '',
        description: c.text(r, 'ArticleDescription'),
        sellerId: c.text(r, 'ArticleIdentifier'),
        buyerId: c.text(r, 'BuyerArticleIdentifier'),
        standardId: ean ? { value: ean, schemeId: '0160' } : undefined,
        classifications: [],
        attributes: c.all(r, 'RowDefinitionDetails').flatMap((def) => {
          const name = c.text(def, 'RowDefinitionHeaderText');
          const value = c.text(def, 'RowDefinitionValue');
          return name && value ? [{ name, value }] : [];
        }),
      },
      subLines: subLines.length ? subLines : undefined,
    };
    lines.push(line);
  });
  if (idDerived) c.derive('/lines/*/id', 'RowPositionIdentifier absent on some rows; position in the file used');
  return { lines, informationalRows };
}

/**
 * OriginalInvoiceNumber in InvoiceDetails, in OriginalInvoiceReference structures (several earlier invoices) and
 * on rows (credit notes that touch several invoices). Each number is listed once.
 */
function precedingInvoices(c: Ctx, root: Element, d: Element): { id: string; issueDate?: IsoDate }[] {
  const out = new Map<string, { id: string; issueDate?: IsoDate }>();
  const add = (id: string | undefined, issueDate: IsoDate | undefined) => {
    if (!id) return;
    const prev = out.get(id);
    if (!prev) out.set(id, issueDate ? { id, issueDate } : { id });
    else if (issueDate && !prev.issueDate) prev.issueDate = issueDate;
  };
  add(c.text(d, 'OriginalInvoiceNumber'), c.date(d, 'OriginalInvoiceDate', 'BT-26'));
  for (const r of [...c.all(d, 'OriginalInvoiceReference'), ...c.all(root, 'OriginalInvoiceReference')]) {
    add(c.text(r, 'OriginalInvoiceNumber'), c.date(r, 'OriginalInvoiceDate', 'BT-26'));
  }
  for (const row of c.all(root, 'InvoiceRow')) add(c.text(row, 'OriginalInvoiceNumber'), undefined);
  return [...out.values()];
}
