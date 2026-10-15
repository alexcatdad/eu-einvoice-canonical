/**
 * Facturae 3.2 / 3.2.1 / 3.2.2 (Spain) -> canonical.
 *
 * Children of <Facturae> carry no namespace, so paths here are bare local names.
 * A file holds one seller, one buyer and one or more <Invoice>; each Invoice becomes
 * one canonical invoice.
 *
 * Amount conventions (Facturae -> EN 16931):
 *   Line.netAmount     = InvoiceLine/GrossAmount (TotalCost - discounts + charges, before tax)
 *   lineNetTotal       = InvoiceTotals/TotalGrossAmount
 *   taxExclusive       = TotalGrossAmountBeforeTaxes
 *   vatTotal           = TotalTaxOutputs minus the recargo de equivalencia and other non-VAT taxes,
 *                        which are in `otherTaxes` (includedInTotal)
 *   taxInclusive       = InvoiceTotal + TotalTaxesWithheld (InvoiceTotal is already net of IRPF)
 *   payable            = TotalExecutableAmount, else TotalOutstandingAmount, else InvoiceTotal
 * Decimals of up to 8 places stay as the strings the sender wrote.
 *
 * A corrective invoice (Corrective element or class OR/CR) whose InvoiceTotal is negative
 * is a reduction: kind is 'creditNote' and all amounts and quantities are negated so the
 * credit note carries positive magnitudes, as `effectiveSign()` expects. The negation is
 * recorded in `source.derived`.
 */
import type { Element } from '@xmldom/xmldom';
import type {
  AllowanceCharge,
  Attachment,
  CanonicalInvoice,
  Contact,
  Decimal,
  Line,
  OtherTax,
  Party,
  PaymentInstallment,
  PaymentInstructions,
  Period,
  Seller,
  Totals,
  VatBreakdown,
  VatInfo,
  Withholding,
} from '../canonical.js';
import { add, isZero, neg, sign, sub, sum } from '../values.js';
import { Ctx, finish, ParseError, parseXml, sourceMeta } from './context.js';
import type { ParseInput } from './index.js';

/** ISO 3166-1 alpha-3 (used by Facturae) -> alpha-2. */
const COUNTRY3: Record<string, string> = {
  AUT: 'AT',
  BEL: 'BE',
  BGR: 'BG',
  HRV: 'HR',
  CYP: 'CY',
  CZE: 'CZ',
  DNK: 'DK',
  EST: 'EE',
  FIN: 'FI',
  FRA: 'FR',
  DEU: 'DE',
  GRC: 'GR',
  HUN: 'HU',
  IRL: 'IE',
  ITA: 'IT',
  LVA: 'LV',
  LTU: 'LT',
  LUX: 'LU',
  MLT: 'MT',
  NLD: 'NL',
  POL: 'PL',
  PRT: 'PT',
  ROU: 'RO',
  SVK: 'SK',
  SVN: 'SI',
  ESP: 'ES',
  SWE: 'SE',
  GBR: 'GB',
  CHE: 'CH',
  NOR: 'NO',
  ISL: 'IS',
  LIE: 'LI',
  AND: 'AD',
  USA: 'US',
  CAN: 'CA',
  MEX: 'MX',
  BRA: 'BR',
  ARG: 'AR',
  CHN: 'CN',
  JPN: 'JP',
  IND: 'IN',
  MAR: 'MA',
  AUS: 'AU',
  TUR: 'TR',
  UKR: 'UA',
};

/** Facturae UnitOfMeasure -> UN/ECE Rec 20/21. Codes without a certain match (05 other, 07 trays...) stay in `unitText`. */
const UNITS: Record<string, string> = {
  '01': 'H87',
  '02': 'HUR',
  '03': 'KGM',
  '04': 'LTR',
  '06': 'XBX',
  '15': 'CLT',
  '16': 'CMT',
  '18': 'DZN',
  '21': 'GRM',
  '22': 'KMT',
  '25': 'MTR',
  '26': 'MMT',
  '33': 'MTQ',
  '34': 'SEC',
  '35': 'WTT',
  '36': 'KWH',
};

/** Facturae PaymentMeans -> UNCL 4461; the rest become ZZZ with the Facturae label in `meansText`. */
const MEANS: Record<string, string> = {
  '01': '10',
  '02': '49',
  '04': '30',
  '09': '60',
  '10': '60',
  '11': '20',
  '16': '25',
  '17': '21',
  '19': '48',
};
const MEANS_LABEL: Record<string, string> = {
  '03': 'Recibo',
  '05': 'Aceptación de efecto',
  '06': 'Crédito documentario',
  '07': 'Contrato adjudicación',
  '08': 'Letra de cambio',
  '12': 'Pago por cuenta ajena',
  '13': 'Pago especial',
  '14': 'Compensación',
  '15': 'Giro postal',
  '18': 'Contra reembolso',
};

const TAX_VAT_LIKE = new Set(['01', '02', '03']);

export function parseFacturae(input: ParseInput): CanonicalInvoice[] {
  const root = parseXml(input.payload.xml);
  const c0 = new Ctx({});
  const invoices = c0.all(root, 'Invoices/Invoice');
  if (invoices.length === 0) throw new ParseError('No Invoices/Invoice in the Facturae document');
  return invoices.map((el, i) => invoice(input, root, el, i, invoices.length));
}

function invoice(input: ParseInput, root: Element, inv: Element, index: number, count: number): CanonicalInvoice {
  const c = new Ctx({});
  const base = `/Facturae/Invoices/Invoice[${index + 1}]`;
  const unm = (path: string, value: string | undefined) => {
    if (value !== undefined) c.unmapped[path] = value;
  };

  // --- header ----------------------------------------------------------------
  const header = c.el(inv, 'InvoiceHeader');
  const number = c.text(header, 'InvoiceNumber');
  const series = c.text(header, 'InvoiceSeriesCode');
  const issue = c.el(inv, 'InvoiceIssueData');
  const issueDate = c.date(issue, 'IssueDate', 'BT-2');
  if (!number || !issueDate) throw new ParseError('Invoice number (BT-1) or issue date (BT-2) missing');
  const id = series ? `${series}${number}` : number;
  if (series) c.derive('/id', `InvoiceSeriesCode '${series}' and InvoiceNumber '${number}' concatenated`);

  const docType = c.text(header, 'InvoiceDocumentType');
  const invClass = c.text(header, 'InvoiceClass');
  const corrective = c.el(header, 'Corrective');
  const isCorrective = corrective !== undefined || invClass === 'OR' || invClass === 'CR';

  const fileHeader = c.el(root, 'FileHeader');
  const cur = c.text(issue, 'InvoiceCurrencyCode') ?? c.text(fileHeader, 'Batch/InvoiceCurrencyCode');
  if (!cur) throw new ParseError('No currency: InvoiceIssueData/InvoiceCurrencyCode missing');

  // Sign handling: read the total first, then every amount goes through `m`.
  const rawTotal = c.dec(inv, 'InvoiceTotals/InvoiceTotal');
  if (rawTotal === undefined) throw new ParseError('InvoiceTotals/InvoiceTotal missing');
  const flip = isCorrective && sign(rawTotal) < 0;
  if (flip) {
    c.derive('/kind', 'Corrective invoice with negative InvoiceTotal: a reduction, so kind is creditNote (CreditNote typeCode 381)');
    c.derive(
      '/totals',
      'Amounts and quantities of the negative corrective invoice negated, so the credit note carries positive magnitudes',
    );
  } else if (isCorrective) {
    c.derive('/kind', 'Corrective invoice with non-negative InvoiceTotal: an increase, so kind is invoice (typeCode 384)');
  }
  const m = (n: Element | undefined, p?: string): Decimal | undefined => {
    const v = c.dec(n, p);
    return v !== undefined && flip ? neg(v) : v;
  };
  const mReq = (n: Element | undefined, p: string): Decimal => {
    const v = m(n, p);
    if (v === undefined) throw new ParseError(`${p} missing`);
    return v;
  };

  // --- parties ---------------------------------------------------------------
  const sellerEl = c.el(root, 'Parties/SellerParty');
  const buyerEl = c.el(root, 'Parties/BuyerParty');
  if (!sellerEl || !buyerEl) throw new ParseError('Parties/SellerParty or Parties/BuyerParty missing');
  const seller = party(c, sellerEl, 'seller', '/Facturae/Parties/SellerParty', true) as Seller;
  const buyer = party(c, buyerEl, 'buyer', '/Facturae/Parties/BuyerParty', false);
  const registration = c.el(sellerEl, 'LegalEntity/RegistrationData');
  if (registration) {
    const parts = [
      c.text(registration, 'RegisterOfCompaniesLocation'),
      ...(['Book', 'Sheet', 'Folio', 'Section', 'Volume'] as const).map((k) => {
        const v = c.text(registration, k);
        return v ? `${k} ${v}` : undefined;
      }),
      c.text(registration, 'AdditionalRegistrationData'),
    ].filter(Boolean);
    if (parts.length) seller.additionalLegalInfo = parts.join(', ');
  }
  const centres = c
    .all(buyerEl, 'AdministrativeCentres/AdministrativeCentre')
    .map((a) => ({
      roleCode: c.text(a, 'RoleTypeCode') ?? '',
      code: c.text(a, 'CentreCode') ?? '',
      name: c.text(a, 'CentreDescription') ?? c.text(a, 'Name'),
    }))
    .filter((a) => a.code);
  for (const a of c.all(sellerEl, 'AdministrativeCentres/AdministrativeCentre')) {
    unm(`/Facturae/Parties/SellerParty/AdministrativeCentres/${c.text(a, 'RoleTypeCode') ?? '?'}`, c.text(a, 'CentreCode'));
  }

  const additionalParties = [] as CanonicalInvoice['additionalParties'];
  const third = c.el(fileHeader, 'ThirdParty');
  if (third)
    additionalParties.push({
      role: 'third-party',
      sourceRole: 'ES:ThirdParty',
      party: party(c, third, 'third', '/Facturae/FileHeader/ThirdParty', false),
    });
  const issuerType = c.text(fileHeader, 'InvoiceIssuerType');
  if (issuerType && issuerType !== 'EM') unm('/Facturae/FileHeader/InvoiceIssuerType', issuerType);
  const selfBilled = docType === 'AF' || issuerType === 'RE';

  // --- lines -----------------------------------------------------------------
  const lineEls = c.all(inv, 'Items/InvoiceLine');
  const events = new Map<string, { code: string; reason?: string }>();
  const lines = lineEls.map((l, i) => line(c, l, i, m, mReq, events, flip));

  // --- taxes -----------------------------------------------------------------
  const vatBreakdown: VatBreakdown[] = [];
  const otherTaxes: OtherTax[] = [];
  for (const t of c.all(inv, 'TaxesOutputs/Tax')) {
    const type = c.text(t, 'TaxTypeCode') ?? '';
    const rate = c.dec(t, 'TaxRate');
    const taxable = mReq(t, 'TaxableBase/TotalAmount');
    const amount = mReq(t, 'TaxAmount/TotalAmount');
    const special = c.text(t, 'SpecialTaxableBase/TotalAmount');
    if (special !== undefined) {
      unm(`${base}/TaxesOutputs/Tax[${type}:${rate}]/SpecialTaxableBase`, special);
      unm(`${base}/TaxesOutputs/Tax[${type}:${rate}]/SpecialTaxAmount`, c.text(t, 'SpecialTaxAmount/TotalAmount'));
    }
    if (TAX_VAT_LIKE.has(type)) {
      const event = rate !== undefined && isZero(rate) ? events.get(type) : undefined;
      const cat = category(type, rate, event);
      const inTaxCurrency = m(t, 'TaxAmount/EquivalentInEuros');
      vatBreakdown.push({
        taxableAmount: taxable,
        taxAmount: amount,
        categoryCode: cat,
        rate,
        exemptionReason: event?.reason,
        taxAmountInTaxCurrency: inTaxCurrency,
        nationalCode: `ES:${type}`,
      });
    } else {
      otherTaxes.push({ scheme: `ES:TAX:${type}`, taxableAmount: taxable, rate, amount, includedInTotal: true });
    }
    const reAmount = m(t, 'EquivalenceSurchargeAmount');
    if (reAmount !== undefined) {
      otherTaxes.push({
        scheme: 'ES:RE',
        taxableAmount: taxable,
        rate: c.dec(t, 'EquivalenceSurcharge'),
        amount: reAmount,
        includedInTotal: true,
      });
    }
  }

  const withholdings: Withholding[] = c.all(inv, 'TaxesWithheld/Tax').map((t) => withholding(c, t, mReq, m));
  const totalsEl = c.el(inv, 'InvoiceTotals');
  for (const w of c.all(totalsEl, 'AmountsWithheld')) {
    const amount = m(w, 'WithholdingAmount');
    if (amount === undefined) continue;
    withholdings.push({
      scheme: 'ES:CONTRACT-RETENTION',
      rate: c.dec(w, 'WithholdingRate'),
      amount,
      reasonCode: c.text(w, 'WithholdingReason'),
    });
  }

  // --- totals ----------------------------------------------------------------
  const outputs = m(totalsEl, 'TotalTaxOutputs');
  const includedOther = sum(otherTaxes.filter((o) => o.includedInTotal).map((o) => o.amount));
  let vatTotal: Decimal;
  if (outputs === undefined) {
    vatTotal = sum(vatBreakdown.map((v) => v.taxAmount));
    c.derive('/totals/vatTotal', 'TotalTaxOutputs absent; sum of the VAT-like TaxesOutputs amounts');
  } else if (otherTaxes.length > 0) {
    vatTotal = sub(outputs, includedOther);
    c.derive('/totals/vatTotal', 'TotalTaxOutputs minus recargo de equivalencia and other non-VAT taxes, which are in otherTaxes');
  } else {
    vatTotal = outputs;
  }
  const headerWithheld = m(totalsEl, 'TotalTaxesWithheld');
  const invoiceTotal = flip ? neg(rawTotal) : rawTotal;
  const taxInclusive = headerWithheld !== undefined && !isZero(headerWithheld) ? add(invoiceTotal, headerWithheld) : invoiceTotal;
  if (taxInclusive !== invoiceTotal)
    c.derive('/totals/taxInclusive', 'InvoiceTotal + TotalTaxesWithheld: Facturae InvoiceTotal is already net of withheld taxes');

  const executable = m(totalsEl, 'TotalExecutableAmount');
  const outstanding = m(totalsEl, 'TotalOutstandingAmount');
  const payable = executable ?? outstanding ?? invoiceTotal;
  c.derive(
    '/totals/payable',
    executable !== undefined
      ? 'TotalExecutableAmount'
      : outstanding !== undefined
        ? 'TotalOutstandingAmount (TotalExecutableAmount absent)'
        : 'InvoiceTotal (TotalOutstandingAmount and TotalExecutableAmount absent)',
  );
  if (outstanding !== undefined && executable !== undefined && outstanding !== executable) {
    unm(`${base}/InvoiceTotals/TotalOutstandingAmount`, outstanding);
  }
  for (const k of ['Subsidies', 'TotalFinancialExpenses', 'TotalReimbursableExpenses']) {
    const v = c.dec(totalsEl, k);
    if (v !== undefined && !isZero(v)) {
      unm(`${base}/InvoiceTotals/${k}`, v);
      c.warn(
        'ES-TOTAL-UNMAPPED',
        `${k} ${v} has no EN 16931 equivalent and is not part of the mapped totals`,
        `${base}/InvoiceTotals/${k}`,
      );
    }
  }
  const withholdingTotal =
    withholdings.length > 0
      ? sum(withholdings.map((w) => w.amount))
      : headerWithheld !== undefined && !isZero(headerWithheld)
        ? headerWithheld
        : undefined;

  const allowances = discounts(c, totalsEl, 'GeneralDiscounts/Discount', 'Discount', m);
  const charges = discounts(c, totalsEl, 'GeneralSurcharges/Charge', 'Charge', m);
  const totals: Totals = {
    lineNetTotal: mReq(totalsEl, 'TotalGrossAmount'),
    allowanceTotal: m(totalsEl, 'TotalGeneralDiscounts'),
    chargeTotal: m(totalsEl, 'TotalGeneralSurcharges'),
    taxExclusive: mReq(totalsEl, 'TotalGrossAmountBeforeTaxes'),
    vatTotal,
    taxInclusive,
    prepaid: m(totalsEl, 'TotalPaymentsOnAccount'),
    withholdingTotal,
    payable,
  };

  // --- payment ---------------------------------------------------------------
  const pay = payment(c, inv, m);

  // --- references (only at line level in Facturae) -----------------------------
  const refs = (get: (l: Element) => string[]) => {
    const per = lineEls.map(get);
    const all = [...new Set(per.flat())];
    if (all.length > 1)
      c.warn('ES-REF-MULTIPLE', `Lines carry ${all.length} different values (${all.join(', ')}); document-level reference left empty`);
    return all.length === 1 && per.every((p) => p.length > 0) ? all[0] : undefined;
  };
  const contractRef = refs((l) => c.texts(l, 'IssuerContractReference').concat(c.texts(l, 'ReceiverContractReference')).slice(0, 1));

  // --- corrective --------------------------------------------------------------
  const precedingInvoices: CanonicalInvoice['precedingInvoices'] = [];
  let correction: CanonicalInvoice['correction'];
  if (corrective) {
    const pn = c.text(corrective, 'InvoiceNumber');
    const ps = c.text(corrective, 'InvoiceSeriesCode');
    if (pn) precedingInvoices.push({ id: ps ? `${ps}${pn}` : pn });
    const method = c.text(corrective, 'CorrectionMethod');
    correction = {
      reason: c.text(corrective, 'ReasonDescription'),
      reasonCode: c.text(corrective, 'ReasonCode'),
      method,
      period: period(c, c.el(corrective, 'TaxPeriod')),
    };
    unm(`${base}/InvoiceHeader/Corrective/CorrectionMethodDescription`, c.text(corrective, 'CorrectionMethodDescription'));
    unm(`${base}/InvoiceHeader/Corrective/AdditionalReasonDescription`, c.text(corrective, 'AdditionalReasonDescription'));
    if (method === '01') {
      c.warn(
        'ES-CORRECTION-REPLACES',
        'CorrectionMethod 01 (rectificación íntegra): the amounts are those of the whole corrected invoice, not a difference',
        `${base}/InvoiceHeader/Corrective`,
      );
    }
  } else if (isCorrective) {
    c.warn(
      'ES-CORRECTIVE-NO-REFERENCE',
      'Corrective invoice (class OR/CR) without a Corrective element: the corrected invoice is not identified',
      `${base}/InvoiceHeader`,
    );
  }
  if (invClass === 'CO' || invClass === 'CR' || invClass === 'CC') {
    c.warn(
      'ES-COPY',
      `InvoiceClass ${invClass} marks a copy of an invoice already issued; do not post it twice`,
      `${base}/InvoiceHeader/InvoiceClass`,
    );
  }

  // --- notes, attachments, remaining data ----------------------------------------
  const notes = [...c.texts(inv, 'LegalLiterals/LegalReference'), ...c.texts(inv, 'AdditionalData/InvoiceAdditionalInformation')].map(
    (text) => ({ text }),
  );
  const related = c.text(inv, 'AdditionalData/RelatedInvoice');
  unm(`${base}/AdditionalData/RelatedInvoice`, related);
  unm(`${base}/InvoiceIssueData/PlaceOfIssue`, c.text(issue, 'PlaceOfIssue/PlaceOfIssueDescription'));
  const attachments = c.all(inv, 'AdditionalData/RelatedDocuments/Attachment').map((a, i) => attachment(c, a, i));

  const batchCount = c.text(fileHeader, 'Batch/InvoicesCount');
  if (batchCount !== undefined && Number(batchCount) !== count) {
    c.warn(
      'ES-BATCH-COUNT',
      `Batch/InvoicesCount is ${batchCount} but the file holds ${count} invoices`,
      '/Facturae/FileHeader/Batch/InvoicesCount',
    );
  }

  const rate = c.dec(issue, 'ExchangeRateDetails/ExchangeRate');
  const typeCode = flip ? '381' : isCorrective ? '384' : selfBilled ? '389' : '380';
  const kind = flip ? 'creditNote' : 'invoice';

  const out = {
    kind,
    typeCode,
    id,
    issueDate,
    nationalType: invClass ? { scheme: 'ES:InvoiceClass', code: invClass, label: CLASS_LABEL[invClass] } : undefined,
    selfBilled,
    currency: cur,
    taxCurrency: c.text(issue, 'TaxCurrencyCode'),
    exchangeRate:
      rate !== undefined ? { rate, date: c.date(issue, 'ExchangeRateDetails/ExchangeRateDate', 'ExchangeRateDate') } : undefined,
    taxPointDate: c.date(issue, 'OperationDate', 'BT-7'),
    dueDate: pay.schedule.length === 1 ? pay.schedule[0].dueDate : undefined,
    purchaseOrderRef: refs((l) => c.texts(l, 'ReceiverTransactionReference').slice(0, 1)),
    salesOrderRef: refs((l) => c.texts(l, 'IssuerTransactionReference').slice(0, 1)),
    despatchAdviceRef: refs((l) => c.texts(l, 'DeliveryNotesReferences/DeliveryNote/DeliveryNoteNumber').slice(0, 1)),
    contractRef,
    notes,
    specificationId: root.namespaceURI ?? 'facturae',
    precedingInvoices,
    correction,
    invoicePeriod: period(c, c.el(issue, 'InvoicingPeriod')),
    seller,
    buyer,
    additionalParties,
    payments: pay.payments,
    paymentSchedule: pay.schedule.length > 1 ? pay.schedule : [],
    allowances,
    charges,
    totals,
    vatBreakdown,
    otherTaxes,
    withholdings,
    attachments,
    lines,
    clearance: [],
    extensions: {
      es: {
        facturaeVersion: input.details.version,
        invoiceClass: invClass,
        invoiceDocumentType: docType,
        batchId: c.text(fileHeader, 'Batch/BatchIdentifier'),
        administrativeCentres: centres.length ? centres : undefined,
      },
    },
    source: sourceMeta(input, root, c, {
      ...(count > 1 ? { indexInFile: index } : {}),
      fragmentPath: base,
    }),
  } as CanonicalInvoice;
  return finish(out);
}

const CLASS_LABEL: Record<string, string> = {
  OO: 'Original',
  OR: 'Original rectificativa',
  OC: 'Original recapitulativa',
  CO: 'Copia del original',
  CR: 'Copia de la rectificativa',
  CC: 'Copia de la recapitulativa',
};

/** VAT category for IVA (01), IPSI (02) and IGIC (03). Zero-rated IVA is E/O when a line says it is exempt / not subject. */
function category(type: string, rate: Decimal | undefined, event?: { code: string }): string {
  if (type === '02') return 'M';
  if (type === '03') return 'L';
  if (rate !== undefined && !isZero(rate)) return 'S';
  return event?.code === '01' ? 'E' : event?.code === '02' ? 'O' : 'Z';
}

function withholding(
  c: Ctx,
  t: Element,
  mReq: (n: Element | undefined, p: string) => Decimal,
  m: (n: Element | undefined, p?: string) => Decimal | undefined,
): Withholding {
  const type = c.text(t, 'TaxTypeCode') ?? '';
  return {
    scheme: type === '04' ? 'ES:IRPF' : `ES:TAX:${type}`,
    taxableAmount: m(t, 'TaxableBase/TotalAmount'),
    rate: c.dec(t, 'TaxRate'),
    amount: mReq(t, 'TaxAmount/TotalAmount'),
  };
}

function discounts(
  c: Ctx,
  node: Element | undefined,
  path: string,
  kind: 'Discount' | 'Charge',
  m: (n: Element | undefined, p?: string) => Decimal | undefined,
): AllowanceCharge[] {
  return c.all(node, path).flatMap((d) => {
    const amount = m(d, `${kind}Amount`);
    if (amount === undefined) return [];
    return [{ amount, percentage: c.dec(d, `${kind}Rate`), reason: c.text(d, `${kind}Reason`) }];
  });
}

function line(
  c: Ctx,
  l: Element,
  index: number,
  m: (n: Element | undefined, p?: string) => Decimal | undefined,
  mReq: (n: Element | undefined, p: string) => Decimal,
  events: Map<string, { code: string; reason?: string }>,
  flip: boolean,
): Line {
  const seq = c.text(l, 'SequenceNumber');
  if (seq === undefined) c.derive(`/lines/${index}/id`, 'SequenceNumber absent; position in the file');
  const qty = c.dec(l, 'Quantity');
  const unit = c.text(l, 'UnitOfMeasure');

  const taxes = c.all(l, 'TaxesOutputs/Tax');
  const event = c.el(l, 'SpecialTaxableEvent');
  const eventInfo = event
    ? { code: c.text(event, 'SpecialTaxableEventCode') ?? '', reason: c.text(event, 'SpecialTaxableEventReason') }
    : undefined;
  let vat: VatInfo | undefined;
  const otherTaxes: OtherTax[] = [];
  for (const t of taxes) {
    const type = c.text(t, 'TaxTypeCode') ?? '';
    const rate = c.dec(t, 'TaxRate');
    const taxable = m(t, 'TaxableBase/TotalAmount');
    if (TAX_VAT_LIKE.has(type)) {
      if (rate !== undefined && isZero(rate) && eventInfo?.code && !events.has(type)) events.set(type, eventInfo);
      if (!vat)
        vat = {
          categoryCode: category(type, rate, rate !== undefined && isZero(rate) ? eventInfo : undefined),
          rate,
          nationalCode: `ES:${type}`,
          exemptionReason: rate !== undefined && isZero(rate) ? eventInfo?.reason : undefined,
        };
    } else {
      const amount = m(t, 'TaxAmount/TotalAmount');
      if (amount !== undefined) otherTaxes.push({ scheme: `ES:TAX:${type}`, taxableAmount: taxable, rate, amount, includedInTotal: true });
    }
    const re = m(t, 'EquivalenceSurchargeAmount');
    if (re !== undefined)
      otherTaxes.push({
        scheme: 'ES:RE',
        taxableAmount: taxable,
        rate: c.dec(t, 'EquivalenceSurcharge'),
        amount: re,
        includedInTotal: true,
      });
  }
  const withholdings = c.all(l, 'TaxesWithheld/Tax').map((t) => withholding(c, t, mReq, m));

  const national: Record<string, string | string[]> = {};
  const put = (k: string, v: string | string[] | undefined) => {
    if (v !== undefined && v.length > 0) national[k] = v;
  };
  put('issuerContractReference', c.text(l, 'IssuerContractReference'));
  put('receiverContractReference', c.text(l, 'ReceiverContractReference'));
  put('issuerTransactionReference', c.text(l, 'IssuerTransactionReference'));
  put('receiverTransactionReference', c.text(l, 'ReceiverTransactionReference'));
  put('fileReference', c.text(l, 'FileReference'));
  put('deliveryNotes', c.texts(l, 'DeliveryNotesReferences/DeliveryNote/DeliveryNoteNumber'));
  put('transactionDate', c.text(l, 'TransactionDate'));
  put('specialTaxableEvent', eventInfo?.code);

  const unitPrice = c.dec(l, 'UnitPriceWithoutTax');
  const lp = c.el(l, 'LineItemPeriod');
  return {
    id: seq ?? String(index + 1),
    note: c.text(l, 'AdditionalLineItemInformation'),
    quantity: qty !== undefined && flip ? neg(qty) : qty,
    unitCode: unit ? UNITS[unit] : undefined,
    unitText: unit && !UNITS[unit] ? unit : undefined,
    netAmount: mReq(l, 'GrossAmount'),
    period: lp ? period(c, lp) : undefined,
    allowances: discounts(c, l, 'Discounts/Discount', 'Discount', m),
    charges: discounts(c, l, 'Charges/Charge', 'Charge', m),
    price: unitPrice !== undefined ? { net: unitPrice } : undefined,
    vat,
    item: {
      name: c.text(l, 'ItemDescription') ?? '',
      sellerId: c.text(l, 'ArticleCode'),
      classifications: [],
      attributes: [],
    },
    subjectToWithholding: withholdings.length > 0 ? true : undefined,
    otherTaxes: otherTaxes.length ? otherTaxes : undefined,
    withholdings: withholdings.length ? withholdings : undefined,
    national: Object.keys(national).length ? national : undefined,
  };
}

function period(c: Ctx, e: Element | undefined): Period | undefined {
  if (!e) return undefined;
  const p = { start: c.date(e, 'StartDate'), end: c.date(e, 'EndDate') };
  return p.start || p.end ? p : undefined;
}

function country(c: Ctx, code: string | undefined, path: string): string | undefined {
  if (!code) return undefined;
  if (/^[A-Z]{2}$/.test(code)) return code;
  const a2 = COUNTRY3[code];
  if (!a2) c.warn('ES-COUNTRY', `Unknown country code '${code}'`, path);
  return a2;
}

function party(c: Ctx, e: Element, role: 'seller' | 'buyer' | 'third', path: string, isSeller: boolean): Party {
  const tax = c.el(e, 'TaxIdentification');
  const tin = c.text(tax, 'TaxIdentificationNumber');
  const person = c.text(tax, 'PersonTypeCode');
  const residence = c.text(tax, 'ResidenceTypeCode');
  const out: Party = { identifiers: [], nationalTaxIds: [] };
  if (tin) {
    if (residence === 'R') {
      const nif = /^ES[A-Z0-9]{9}$/.test(tin) ? tin.slice(2) : tin;
      out.nationalTaxIds.push({ value: nif, schemeId: 'ES:NIF' });
      if (isSeller || person === 'J') {
        out.vatId = `ES${nif}`;
        c.derive(`${path}/vatId`, 'Spanish NIF with the ES prefix (NIF-IVA); Facturae states only the NIF');
      }
    } else if (residence === 'U' && /^[A-Z]{2}/.test(tin)) {
      out.vatId = tin;
    } else {
      out.nationalTaxIds.push({ value: tin });
    }
  }
  const ident = c.text(e, 'PartyIdentification');
  if (ident) out.identifiers.push({ value: ident });

  const kindEl = c.el(e, 'LegalEntity') ?? c.el(e, 'Individual');
  if (kindEl) {
    const legal = kindEl.localName === 'LegalEntity';
    out.name = legal
      ? c.text(kindEl, 'CorporateName')
      : [c.text(kindEl, 'Name'), c.text(kindEl, 'FirstSurname'), c.text(kindEl, 'SecondSurname')].filter(Boolean).join(' ') || undefined;
    if (legal) out.tradingName = c.text(kindEl, 'TradeName');
    const spain = c.el(kindEl, 'AddressInSpain');
    const abroad = c.el(kindEl, 'OverseasAddress');
    if (spain) {
      out.address = {
        line1: c.text(spain, 'Address'),
        city: c.text(spain, 'Town'),
        postalCode: c.text(spain, 'PostCode'),
        countrySubdivision: c.text(spain, 'Province'),
        countryCode: country(c, c.text(spain, 'CountryCode'), `${path}/AddressInSpain/CountryCode`),
      };
    } else if (abroad) {
      out.address = {
        line1: c.text(abroad, 'Address'),
        city: c.text(abroad, 'PostCodeAndTown'),
        countrySubdivision: c.text(abroad, 'Province'),
        countryCode: country(c, c.text(abroad, 'CountryCode'), `${path}/OverseasAddress/CountryCode`),
      };
      c.warn(
        'ES-OVERSEAS-TOWN',
        'OverseasAddress/PostCodeAndTown is one field; stored in city without splitting the postal code',
        `${path}/OverseasAddress`,
      );
    }
    const cd = c.el(kindEl, 'ContactDetails');
    if (cd) {
      const contact: Contact = { name: c.text(cd, 'ContactPersons'), phone: c.text(cd, 'Telephone'), email: c.text(cd, 'ElectronicMail') };
      if (contact.name || contact.phone || contact.email) out.contact = contact;
      for (const k of ['TeleFax', 'WebAddress', 'CnoCnae', 'INETownCode', 'AdditionalContactDetails']) {
        const v = c.text(cd, k);
        if (v !== undefined) c.unmapped[`${path}/${kindEl.localName}/ContactDetails/${k}`] = v;
      }
    }
  } else if (role !== 'third') {
    c.warn('ES-PARTY-KIND', 'Party has neither LegalEntity nor Individual', path);
  }
  return out;
}

function payment(
  c: Ctx,
  inv: Element,
  m: (n: Element | undefined, p?: string) => Decimal | undefined,
): { payments: PaymentInstructions[]; schedule: PaymentInstallment[] } {
  const payments: PaymentInstructions[] = [];
  const schedule: PaymentInstallment[] = [];
  const keys: string[] = [];
  for (const inst of c.all(inv, 'PaymentDetails/Installment')) {
    const means = c.text(inst, 'PaymentMeans');
    const credit = account(c, c.el(inst, 'AccountToBeCredited'));
    const debit = account(c, c.el(inst, 'AccountToBeDebited'));
    const ref = c.text(inst, 'PaymentReconciliationReference');
    let paymentIndex: number | undefined;
    if (means) {
      const key = JSON.stringify([means, credit, debit, ref]);
      paymentIndex = keys.indexOf(key);
      if (paymentIndex === -1) {
        paymentIndex = keys.push(key) - 1;
        const code = MEANS[means] ?? 'ZZZ';
        payments.push({
          meansCode: code,
          meansText: code === 'ZZZ' ? MEANS_LABEL[means] : undefined,
          nationalMeansCode: means,
          remittanceInformation: ref,
          creditTransfers: credit ? [{ accountId: credit.id, serviceProviderId: credit.bic }] : [],
          directDebit: debit ? { debitedAccountId: debit.id } : undefined,
        });
      }
    }
    schedule.push({
      dueDate: c.date(inst, 'InstallmentDueDate', 'InstallmentDueDate'),
      amount: m(inst, 'InstallmentAmount'),
      paymentIndex,
    });
  }
  return { payments, schedule };
}

function account(c: Ctx, e: Element | undefined): { id: string; bic?: string } | undefined {
  if (!e) return undefined;
  const id = c.text(e, 'IBAN') ?? c.text(e, 'AccountNumber');
  return id ? { id, bic: c.text(e, 'BIC') } : undefined;
}

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  xml: 'application/xml',
  gif: 'image/gif',
  jpg: 'image/jpeg',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  doc: 'application/msword',
  rtf: 'application/rtf',
  xls: 'application/vnd.ms-excel',
};

function attachment(c: Ctx, a: Element, index: number): Attachment {
  const format = (c.text(a, 'AttachmentFormat') ?? '').toLowerCase();
  const description = c.text(a, 'AttachmentDescription');
  const data = c.text(a, 'AttachmentData');
  const compressed = c.text(a, 'AttachmentCompressionAlgorithm');
  const encoding = c.text(a, 'AttachmentEncodingAlgorithm');
  const id = String(index + 1);
  const plain = (!compressed || compressed === '0000') && encoding === '0001';
  if (data && plain && MIME[format]) {
    return {
      kind: 'embedded',
      id,
      description,
      mimeCode: MIME[format],
      filename: `attachment-${id}.${format}`,
      base64: data.replace(/\s+/g, ''),
    };
  }
  if (data)
    c.warn(
      'ES-ATTACHMENT',
      `Attachment ${id} (format '${format}', compression '${compressed ?? ''}', encoding '${encoding ?? ''}') cannot be embedded as is; content dropped`,
    );
  return { kind: 'reference', id, description, typeCode: format || undefined };
}
