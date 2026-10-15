/**
 * Slovenian eSLOG 2.0 (urn:eslog:2.00, EDIFACT INVOIC D.01B in XML) -> canonical, following
 * the eSLOG 2.0 to EN 16931 mapping.
 *
 * Element names are EDIFACT: S_ = segment, G_SGn = segment group, C_ = composite, D_ = data
 * element. Elements are matched by local name. Segment groups used (INVOIC D.01B):
 *   G_SG1 RFF/DTM references       G_SG2 NAD parties (G_SG3 RFF, G_SG5 CTA/COM below it)
 *   G_SG7 CUX currency              G_SG8 PAT/DTM payment terms
 *   G_SG16 ALC document allowance/charge     G_SG26 LIN line (G_SG27 MOA, G_SG29 PRI, G_SG34 TAX, G_SG39 ALC)
 *   G_SG50 MOA totals               G_SG52 TAX/MOA VAT breakdown
 *
 * MOA amounts: 79 lines total (BT-106), 125 taxable (BT-109), 176 VAT (BT-110), 77 invoice
 * total with VAT (BT-112), 9 amount due (BT-115), 113 prepaid (BT-113). Other MOA codes are
 * kept in source.unmapped instead of being guessed.
 */
import type { Element } from '@xmldom/xmldom';
import type {
  AdditionalParty, AllowanceCharge, CanonicalInvoice, Contact, CreditTransfer, Decimal, Identifier, IsoDate, Line,
  Party, PaymentInstructions, Totals, VatBreakdown, VatInfo,
} from '../canonical.js';
import { add, sub, sum, ValueError, toIsoDate } from '../values.js';
import { CREDIT_TYPE_CODES, SELF_BILLED_TYPE_CODES, Ctx, ParseError, finish, parseXml, sourceMeta } from './context.js';
import type { ParseInput } from './index.js';

const SPEC_ID = 'urn:eslog:2.00';
/** NAD qualifiers, in order of preference per role. */
const SELLER_QUALIFIERS = ['SE', 'SU', 'II'];
const BUYER_QUALIFIERS = ['BY', 'IV'];

/** Every descendant segment/group named `name` below `node`, in document order. */
function descend(node: Element | undefined, name: string): Element[] {
  const out: Element[] = [];
  const walk = (n: Element) => {
    for (let ch = n.firstChild; ch; ch = ch.nextSibling) {
      if (ch.nodeType !== 1) continue;
      const el = ch as Element;
      if (el.localName === name) out.push(el);
      walk(el);
    }
  };
  if (node) walk(node);
  return out;
}

export function parseEslog(input: ParseInput): CanonicalInvoice[] {
  const root = parseXml(input.payload.xml);
  const c = new Ctx({});
  const m = c.el(root, 'M_INVOIC');
  if (!m) throw new ParseError('M_INVOIC missing');

  const typeCode = c.text(m, 'S_BGM/C_C002/D_1001');
  const id = c.text(m, 'S_BGM/C_C106/D_1004');
  const issueDate = date(c, m, '137', 'BT-2');
  if (!typeCode || !id || !issueDate) throw new ParseError('Document type (BT-3), invoice number (BT-1) or issue date (BT-2) missing');
  const kind = CREDIT_TYPE_CODES.has(typeCode) ? 'creditNote' : 'invoice';

  // CUX: reference currency 2 / invoicing currency 4 -> BT-5.
  const cux = c.all(m, 'G_SG7/S_CUX/C_C504');
  const cuxEl = cux.find((e) => c.text(e, 'D_6343') === '4') ?? cux.find((e) => c.text(e, 'D_6347') === '2') ?? cux[0];
  const currency = c.text(cuxEl, 'D_6345');
  if (!currency) throw new ParseError('Currency missing (G_SG7/S_CUX/C_C504/D_6345)');

  // References.
  const refs = new Map<string, string[]>();
  const precedingDates = new Map<string, IsoDate>();
  c.all(m, 'G_SG1').forEach((g, gi) => {
    const qual = c.text(g, 'S_RFF/C_C506/D_1153');
    const val = c.text(g, 'S_RFF/C_C506/D_1154');
    if (!qual || !val) return;
    if (qual === 'IV') {
      const d = date(c, g, '171', 'BT-26');
      if (d) precedingDates.set(val, d);
    }
    const list = refs.get(qual) ?? [];
    list.push(val);
    refs.set(qual, list);
    if (!KNOWN_REFS.has(qual)) c.unmapped[`/Invoice/M_INVOIC/G_SG1[${gi + 1}]/S_RFF/${qual}`] = val;
  });
  const ref = (q: string) => refs.get(q)?.[0];

  // Parties.
  const nads = c.all(m, 'G_SG2').map((g) => ({ g, q: c.text(g, 'S_NAD/D_3035') ?? '' }));
  const pick = (qs: string[]) => { for (const q of qs) { const f = nads.find((n) => n.q === q); if (f) return f; } return undefined; };
  const sellerNad = pick(SELLER_QUALIFIERS);
  const buyerNad = pick(BUYER_QUALIFIERS);
  if (!sellerNad) c.warn('ESLOG-NO-SELLER', 'No NAD with qualifier SE, SU or II');
  if (!buyerNad) c.warn('ESLOG-NO-BUYER', 'No NAD with qualifier BY or IV');
  const seller = sellerNad ? party(c, sellerNad.g) : emptyParty();
  const buyer = buyerNad ? party(c, buyerNad.g) : emptyParty();
  const deliveryNad = nads.find((n) => n.q === 'DP');
  const payeeNad = nads.find((n) => n.q === 'PE');
  const deliveryParty = deliveryNad ? party(c, deliveryNad.g) : undefined;
  const additionalParties = nads
    .filter((n) => n !== sellerNad && n !== buyerNad && n !== deliveryNad && n !== payeeNad)
    .map((n): AdditionalParty => ({ role: `NAD:${n.q}`, sourceRole: `eSLOG:NAD:${n.q}`, party: party(c, n.g) }));

  // Payment.
  const sellerBank = bank(c, sellerNad?.g);
  const pai = c.text(descend(m, 'S_PAI')[0], 'C_C534/D_4461');
  const reference = ref('PQ');
  let payments: PaymentInstructions[] = [];
  if (pai || sellerBank || reference) {
    let meansCode = pai;
    if (!meansCode) {
      meansCode = sellerBank ? '30' : 'ZZZ';
      c.derive('/payments/0/meansCode', `No PAI segment; ${meansCode === '30' ? 'credit transfer (30) assumed from the bank account' : 'ZZZ'}`);
    }
    payments = [{ meansCode, remittanceInformation: reference, creditTransfers: sellerBank ? [sellerBank] : [] }];
  }
  const payG = c.el(m, 'G_SG8');
  const dueDate = date(c, payG, '13', 'BT-9') ?? date(c, m, '13', 'BT-9');

  // Notes and terms.
  const notes: { subjectCode?: string; text: string }[] = [];
  let paymentTerms: string | undefined;
  for (const f of c.all(m, 'S_FTX')) {
    const subject = c.text(f, 'D_4451');
    const text = c.texts(f, 'C_C108/D_4440').join(' ');
    if (!text) continue;
    if (subject === 'AAB') paymentTerms = paymentTerms ? `${paymentTerms}\n${text}` : text;
    else notes.push(subject && subject !== 'AAI' ? { subjectCode: subject, text } : { text });
  }

  // Lines.
  const lines = c.all(m, 'G_SG26').map((l, i) => line(c, l, i));

  // Document allowances and charges.
  const allowances: AllowanceCharge[] = [];
  const charges: AllowanceCharge[] = [];
  for (const g of c.all(m, 'G_SG16')) {
    const isCharge = c.text(g, 'S_ALC/D_5463') === 'C';
    const entry = allowanceCharge(c, g, isCharge, true);
    if (entry) (isCharge ? charges : allowances).push(entry);
  }

  // Totals.
  const moa = new Map<string, Decimal>();
  c.all(m, 'G_SG50').forEach((g, gi) => {
    for (const e of c.all(g, 'S_MOA/C_C516')) {
      const code = c.text(e, 'D_5025');
      const amount = c.dec(e, 'D_5004');
      if (!code || amount === undefined) continue;
      if (TOTAL_CODES.has(code) && !moa.has(code)) moa.set(code, amount);
      else c.unmapped[`/Invoice/M_INVOIC/G_SG50[${gi + 1}]/S_MOA/${code}`] = amount;
    }
  });
  const allowanceTotal = allowances.length ? sum(allowances.map((a) => a.amount)) : undefined;
  const chargeTotal = charges.length ? sum(charges.map((a) => a.amount)) : undefined;
  if (allowanceTotal) c.derive('/totals/allowanceTotal', 'Sum of document allowances');
  if (chargeTotal) c.derive('/totals/chargeTotal', 'Sum of document charges');
  let lineNetTotal = moa.get('79');
  if (lineNetTotal === undefined) {
    lineNetTotal = sum(lines.map((l) => l.netAmount));
    c.derive('/totals/lineNetTotal', 'MOA 79 absent; sum of line amounts');
  }
  let taxExclusive = moa.get('125');
  if (taxExclusive === undefined) {
    taxExclusive = add(sub(lineNetTotal, allowanceTotal ?? '0'), chargeTotal ?? '0');
    c.derive('/totals/taxExclusive', 'MOA 125 absent; BT-106 - BT-107 + BT-108');
  }
  const vatBreakdown = c.all(m, 'G_SG52').map((g): VatBreakdown => {
    const tax = c.el(g, 'S_TAX');
    const amounts = new Map<string, Decimal>();
    for (const e of c.all(g, 'S_MOA/C_C516')) {
      const code = c.text(e, 'D_5025');
      const v = c.dec(e, 'D_5004');
      if (code && v !== undefined) amounts.set(code, v);
    }
    const taxable = amounts.get('125');
    const taxAmount = amounts.get('124');
    if (taxable === undefined || taxAmount === undefined) throw new ParseError('G_SG52 without MOA 125 (taxable) or 124 (tax amount)');
    return {
      taxableAmount: taxable,
      taxAmount,
      categoryCode: c.text(tax, 'D_5305') ?? '',
      rate: c.dec(tax, 'C_C243/D_5278'),
      exemptionReason: c.text(tax, 'C_C241/D_5152'),
    };
  });
  let vatTotal = moa.get('176');
  if (vatTotal === undefined && vatBreakdown.length) {
    vatTotal = sum(vatBreakdown.map((v) => v.taxAmount));
    c.derive('/totals/vatTotal', 'MOA 176 absent; sum of VAT breakdown');
  }
  let taxInclusive = moa.get('77');
  if (taxInclusive === undefined) {
    taxInclusive = add(taxExclusive, vatTotal ?? '0');
    c.derive('/totals/taxInclusive', 'MOA 77 absent; BT-109 + BT-110');
  }
  const prepaid = moa.get('113');
  let payable = moa.get('9');
  if (payable === undefined) {
    payable = sub(taxInclusive, prepaid ?? '0');
    c.derive('/totals/payable', 'MOA 9 absent; BT-112 - BT-113');
  }
  const totals: Totals = { lineNetTotal, allowanceTotal, chargeTotal, taxExclusive, vatTotal, taxInclusive, prepaid, payable };

  // Period: DTM 167/168 or DTM 263 with format 718 (start-end).
  const range = rawDtm(c, m, '263');
  let start = date(c, m, '167', 'invoicing period start');
  let end = date(c, m, '168', 'invoicing period end');
  if (range && /^\d{8}-\d{8}$/.test(range.value)) {
    const [a, b] = range.value.split('-');
    start ??= toDate(c, a, 'invoicing period start');
    end ??= toDate(c, b, 'invoicing period end');
  }

  const buyerRef = ref('BO');
  const inv = {
    kind,
    typeCode,
    id,
    issueDate,
    nationalType: undefined,
    selfBilled: SELF_BILLED_TYPE_CODES.has(typeCode),
    currency,
    taxPointDate: date(c, m, '131', 'BT-7'),
    dueDate,
    buyerReference: buyerRef,
    projectRef: ref('PJ'),
    contractRef: ref('CT'),
    purchaseOrderRef: ref('ON'),
    salesOrderRef: ref('VN'),
    receivingAdviceRef: ref('ALO'),
    despatchAdviceRef: ref('DQ'),
    paymentTerms,
    notes,
    specificationId: SPEC_ID,
    precedingInvoices: (refs.get('IV') ?? []).map((v) => ({ id: v, issueDate: precedingDates.get(v) })),
    invoicePeriod: start || end ? { start, end } : undefined,
    seller,
    buyer,
    payee: payeeNad ? { name: party(c, payeeNad.g).name ?? '' } : undefined,
    additionalParties,
    delivery: deliveryParty || date(c, m, '35', 'BT-72') ? {
      partyName: deliveryParty?.name,
      locationId: deliveryParty?.identifiers[0],
      actualDate: date(c, m, '35', 'BT-72'),
      address: deliveryParty?.address,
    } : undefined,
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
    extensions: {},
    source: sourceMeta(input, root, c),
  } as CanonicalInvoice;
  if (lines.length === 0) c.warn('NO_LINES', 'The invoice has no lines');
  return [finish(inv)];
}

/** RFF qualifiers the mapping consumes. BO (buyer's order reference) is eSLOG's carrier for BT-10. */
const KNOWN_REFS = new Set(['ON', 'CT', 'PJ', 'VN', 'DQ', 'ALO', 'IV', 'PQ', 'BO']);
const TOTAL_CODES = new Set(['79', '125', '176', '77', '9', '113']);

interface RawDtm { value: string; format?: string }

function rawDtm(c: Ctx, scope: Element | undefined, code: string): RawDtm | undefined {
  for (const d of c.all(scope, 'S_DTM/C_C507')) {
    if (c.text(d, 'D_2005') !== code) continue;
    const value = c.text(d, 'D_2380');
    if (value) return { value, format: c.text(d, 'D_2379') };
  }
  return undefined;
}

function toDate(c: Ctx, raw: string, field: string): IsoDate {
  // Format 203 (CCYYMMDDHHMM) and 204 (CCYYMMDDHHMMSS): keep the date part and say so.
  const m = /^(\d{8})(\d{4,6})$/.exec(raw);
  const value = m ? m[1] : raw;
  if (m) c.warn('TIME_DROPPED', `${field}: time ${m[2]} dropped from ${raw}`);
  try { return toIsoDate(value).date; } catch (e) {
    if (e instanceof ValueError) throw new ParseError(`${field}: ${e.message}`);
    throw e;
  }
}

function date(c: Ctx, scope: Element | undefined, code: string, field: string): IsoDate | undefined {
  const r = rawDtm(c, scope, code);
  return r ? toDate(c, r.value, field) : undefined;
}

function emptyParty(): Party {
  return { identifiers: [], nationalTaxIds: [] };
}

function party(c: Ctx, g: Element): Party {
  const nad = c.el(g, 'S_NAD');
  const idValue = c.text(nad, 'C_C082/D_3039');
  const agency = c.text(nad, 'C_C082/D_3055');
  // 9 = GS1: the party ID is a GLN. Other agencies are kept without a scheme.
  const identifiers: Identifier[] = idValue ? [agency === '9' ? { value: idValue, schemeId: '0088' } : { value: idValue }] : [];
  const street = c.texts(nad, 'C_C059/D_3042');
  const country = c.text(nad, 'D_3207');
  const refs = descend(g, 'S_RFF').map((r) => ({ q: c.text(r, 'C_C506/D_1153'), v: c.text(r, 'C_C506/D_1154') }));
  const vatId = refs.find((r) => r.q === 'VA')?.v;
  const reg = refs.find((r) => r.q === 'XA')?.v;
  for (const r of refs) {
    if (r.q && r.v && r.q !== 'VA' && r.q !== 'XA') c.unmapped[`/Invoice/M_INVOIC/G_SG2[${c.text(nad, 'D_3035') ?? '?'}]/S_RFF/${r.q}`] = r.v;
  }
  const cta = descend(g, 'S_CTA')[0];
  const comms = descend(g, 'S_COM').map((e) => ({ v: c.text(e, 'C_C076/D_3148'), t: c.text(e, 'C_C076/D_3155') }));
  const contact: Contact = {
    name: c.text(cta, 'C_C056/D_3412'),
    phone: comms.find((x) => x.t === 'TE')?.v,
    email: comms.find((x) => x.t === 'EM')?.v,
  };
  return {
    name: c.texts(nad, 'C_C080/D_3036').join(' ') || undefined,
    identifiers,
    legalRegistrationId: reg ? { value: reg, schemeId: 'SI:MATICNA' } : undefined,
    vatId,
    nationalTaxIds: [],
    address: {
      line1: street[0],
      line2: street[1],
      line3: street[2],
      city: c.text(nad, 'D_3164'),
      postalCode: c.text(nad, 'D_3251'),
      countrySubdivision: c.text(nad, 'D_3229'),
      countryCode: country,
    },
    contact: contact.name || contact.phone || contact.email ? contact : undefined,
  };
}

/** FII with qualifier RB (account holder's bank) below the seller's NAD group. */
function bank(c: Ctx, g: Element | undefined): CreditTransfer | undefined {
  const fii = descend(g, 'S_FII').find((f) => c.text(f, 'D_3035') === 'RB');
  const accountId = c.text(fii, 'C_C078/D_3194')?.replace(/\s/g, '');
  if (!accountId) return undefined;
  return { accountId, accountName: c.text(fii, 'C_C078/D_3192'), serviceProviderId: c.text(fii, 'C_C088/D_3433') };
}

function allowanceCharge(c: Ctx, g: Element, isCharge: boolean, withVat: boolean): AllowanceCharge | undefined {
  const amounts = new Map<string, Decimal>();
  for (const e of descend(g, 'C_C516')) {
    const code = c.text(e, 'D_5025');
    const v = c.dec(e, 'D_5004');
    if (code && v !== undefined) amounts.set(code, v);
  }
  const amount = amounts.get(isCharge ? '23' : '204');
  if (amount === undefined) return undefined;
  const tax = withVat ? descend(g, 'S_TAX')[0] : undefined;
  const vat: VatInfo | undefined = tax ? { categoryCode: c.text(tax, 'D_5305') ?? '', rate: c.dec(tax, 'C_C243/D_5278') } : undefined;
  const code = c.text(g, 'S_ALC/C_C214/D_7161') ?? c.text(g, 'S_ALC/C_C552/D_1230');
  return {
    amount,
    baseAmount: amounts.get('25'),
    percentage: c.dec(descend(g, 'C_C501')[0], 'D_5482'),
    reason: c.text(g, 'S_ALC/C_C214/D_7160'),
    reasonCode: code,
    vat,
  };
}

function line(c: Ctx, l: Element, index: number): Line {
  const lin = c.el(l, 'S_LIN');
  const id = c.text(lin, 'D_1082') ?? String(index + 1);
  const moa = new Map<string, Decimal>();
  for (const e of descend(c.el(l, 'G_SG27'), 'C_C516')) {
    const code = c.text(e, 'D_5025');
    const v = c.dec(e, 'D_5004');
    if (code && v !== undefined) moa.set(code, v);
  }
  const net = moa.get('203');
  if (net === undefined) throw new ParseError(`Line ${id}: MOA 203 (line amount) missing`);

  // Item identification: LIN's own C212 plus PIA segments.
  let sellerId: string | undefined;
  let buyerId: string | undefined;
  let standardId: Identifier | undefined;
  const ids = [c.el(lin, 'C_C212'), ...c.all(l, 'S_PIA/C_C212')];
  for (const e of ids) {
    const v = c.text(e, 'D_7140');
    const t = c.text(e, 'D_7143');
    if (!v) continue;
    if (t === 'SRV' || t === 'EN') standardId ??= { value: v, schemeId: '0160' };
    else if (t === 'SA') sellerId ??= v;
    else if (t === 'IN') buyerId ??= v;
  }

  const imds = c.all(l, 'S_IMD').map((e) => c.texts(e, 'C_C273/D_7008').join(' ')).filter(Boolean);
  if (imds.length === 0) c.warn('ESLOG-NO-ITEM-NAME', `Line ${id}: no S_IMD (BT-153 is mandatory in EN 16931)`);

  const qty = c.all(l, 'S_QTY/C_C186').find((q) => c.text(q, 'D_6063') === '47');
  const unit = c.text(qty, 'D_6411');

  const pri = c.all(l, 'G_SG29/S_PRI/C_C509');
  const priceOf = (q: string) => pri.find((p) => c.text(p, 'D_5125') === q);
  const net1 = priceOf('AAA');
  const gross1 = priceOf('AAB');
  const netPrice = c.dec(net1, 'D_5118');

  const taxEl = descend(c.el(l, 'G_SG34'), 'S_TAX')[0];
  const rate = c.dec(taxEl, 'C_C243/D_5278');
  const category = c.text(taxEl, 'D_5305');
  const vat: VatInfo | undefined = taxEl ? { categoryCode: category ?? '', rate } : undefined;

  const allowances: AllowanceCharge[] = [];
  const charges: AllowanceCharge[] = [];
  for (const g of c.all(l, 'G_SG39')) {
    const isCharge = c.text(g, 'S_ALC/D_5463') === 'C';
    const e = allowanceCharge(c, g, isCharge, false);
    if (e) (isCharge ? charges : allowances).push(e);
  }

  const noteTexts = c.all(l, 'S_FTX').map((f) => c.texts(f, 'C_C108/D_4440').join(' ')).filter(Boolean);
  const orderLine = descend(l, 'S_RFF').find((r) => c.text(r, 'C_C506/D_1153') === 'LI');
  return {
    id,
    note: noteTexts.join('\n') || undefined,
    quantity: c.dec(qty, 'D_6060'),
    unitCode: unit,
    netAmount: net,
    orderLineRef: c.text(orderLine, 'C_C506/D_1154'),
    allowances,
    charges,
    price: netPrice !== undefined ? {
      net: netPrice,
      gross: c.dec(gross1, 'D_5118'),
      baseQuantity: c.dec(net1, 'D_5284'),
      baseQuantityUnit: c.text(net1, 'D_6411'),
    } : undefined,
    vat,
    item: {
      name: imds[0] ?? '',
      description: imds.slice(1).join('\n') || undefined,
      sellerId,
      buyerId,
      standardId,
      classifications: [],
      attributes: [],
    },
  };
}
