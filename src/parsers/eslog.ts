/**
 * Slovenian eSLOG 2.0 (urn:eslog:2.00, EDIFACT INVOIC D.01B in XML) -> canonical, following
 * "e-SLOG 2.0 Electronic Invoice, Part 2: Document Composition" (April 2018), whose segment
 * tables carry the EN 16931 mapping.
 *
 * Element names are EDIFACT: S_ = segment, G_SGn = segment group, C_ = composite, D_ = data
 * element. Elements are matched by local name. Segment groups: G_SG1 RFF/DTM references,
 * G_SG2 NAD parties (RFF, FII, CTA/COM below it), G_SG7 CUX, G_SG8 PAT/DTM/PAI, G_SG16 ALC,
 * G_SG26 LIN (G_SG27 MOA, G_SG29 PRI, G_SG30 RFF, G_SG34 TAX, G_SG39 ALC), G_SG50 MOA totals,
 * G_SG52 TAX/MOA VAT breakdown.
 *
 * MOA totals: 79 BT-106, 260 BT-107, 259 BT-108, 389 BT-109, 176 BT-110, 2 BT-111,
 * 388 BT-112, 113 BT-113, 366 BT-114, 9 BT-115. Other MOA codes go to source.unmapped.
 */
import type { Element } from '@xmldom/xmldom';
import type {
  AdditionalParty,
  AllowanceCharge,
  CanonicalInvoice,
  Contact,
  CreditTransfer,
  Decimal,
  Identifier,
  IsoDate,
  Line,
  Party,
  PaymentInstructions,
  Seller,
  TaxRepresentative,
  Totals,
  VatBreakdown,
  VatInfo,
} from '../canonical.js';
import { add, sub, sum, toIsoDate, ValueError } from '../values.js';
import { CREDIT_TYPE_CODES, Ctx, finish, ParseError, parseXml, SELF_BILLED_TYPE_CODES, sourceMeta } from './context.js';
import { NotImplementedError, type ParseInput } from './index.js';

const SPEC_ID = 'urn:eslog:2.00';
/** NAD qualifiers, in order of preference per role (SE and BY are the mapping's; the others are tolerated). */
const SELLER_QUALIFIERS = ['SE', 'SU', 'II'];
const BUYER_QUALIFIERS = ['BY', 'IV'];
/** Header RFF qualifiers the mapping consumes. */
const KNOWN_REFS = new Set(['AEP', 'CT', 'ON', 'VN', 'ALO', 'AAK', 'GC', 'ATS', 'OI', 'PQ']);
const TOTAL_CODES = new Set(['79', '260', '259', '389', '176', '2', '388', '113', '366', '9']);
/** VAT categories that carry an exemption reason (BT-120/121). */
const EXEMPT_CATEGORIES = new Set(['E', 'AE', 'K', 'G', 'O']);

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
  // The family also covers eSLOG 1.6 (a different structure); only 2.0 is mapped.
  if (input.format.id !== 'eslog-2') throw new NotImplementedError('eslog');
  const root = parseXml(input.payload.xml);
  const c = new Ctx({});
  const m = c.el(root, 'M_INVOIC');
  if (!m) throw new ParseError('M_INVOIC missing');

  const typeCode = c.text(m, 'S_BGM/C_C002/D_1001');
  const id = c.text(m, 'S_BGM/C_C106/D_1004');
  const issueDate = date(c, m, '137', 'BT-2');
  if (!typeCode || !id || !issueDate) throw new ParseError('Document type (BT-3), invoice number (BT-1) or issue date (BT-2) missing');
  const kind = CREDIT_TYPE_CODES.has(typeCode) ? 'creditNote' : 'invoice';

  // CUX: usage 2 = reference (invoice) currency BT-5, usage 6 = information (VAT accounting) currency BT-6.
  const cux = c.all(m, 'G_SG7/S_CUX/C_C504');
  const currency = c.text(cux.find((e) => c.text(e, 'D_6347') === '2') ?? cux[0], 'D_6345');
  if (!currency) throw new ParseError('Currency missing (G_SG7/S_CUX/C_C504/D_6345)');
  const taxCurrency = c.text(
    cux.find((e) => c.text(e, 'D_6347') === '6'),
    'D_6345',
  );

  // Header references.
  const refs = new Map<string, string[]>();
  const precedingDates = new Map<string, IsoDate>();
  c.all(m, 'G_SG1').forEach((g, gi) => {
    const qual = c.text(g, 'S_RFF/C_C506/D_1153');
    const val = c.text(g, 'S_RFF/C_C506/D_1154');
    if (!qual || !val) return;
    if (qual === 'OI') {
      const d = date(c, g, '384', 'BT-26');
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
  const pick = (qs: string[]) => {
    for (const q of qs) {
      const f = nads.find((n) => n.q === q);
      if (f) return f;
    }
    return undefined;
  };
  const sellerNad = pick(SELLER_QUALIFIERS);
  const buyerNad = pick(BUYER_QUALIFIERS);
  if (!sellerNad) c.warn('ESLOG-NO-SELLER', 'No NAD with qualifier SE, SU or II');
  if (!buyerNad) c.warn('ESLOG-NO-BUYER', 'No NAD with qualifier BY or IV');
  const sellerR = sellerNad ? party(c, sellerNad.g) : emptyParty();
  const buyerR = buyerNad ? party(c, buyerNad.g) : emptyParty();
  const seller = sellerR.party as Seller;
  seller.taxRegistrationId = sellerR.refs.get('AHP');
  const deliveryNad = nads.find((n) => n.q === 'DP');
  const payeeNad = nads.find((n) => n.q === 'PE');
  const taxRepNad = nads.find((n) => n.q === 'LC');
  const deliveryParty = deliveryNad ? party(c, deliveryNad.g).party : undefined;
  const taxRep: TaxRepresentative | undefined = taxRepNad
    ? (() => {
        const r = party(c, taxRepNad.g);
        return { name: r.party.name ?? '', vatId: r.refs.get('VA') ?? '', address: r.party.address ?? {} };
      })()
    : undefined;
  const additionalParties = nads
    .filter((n) => n !== sellerNad && n !== buyerNad && n !== deliveryNad && n !== payeeNad && n !== taxRepNad)
    .map((n): AdditionalParty => ({ role: `NAD:${n.q}`, sourceRole: `eSLOG:NAD:${n.q}`, party: party(c, n.g).party }));

  // Free text (FTX): GEN notes, AAB terms, REG seller legal info, AAT means text, AGM exemption, DOC process/specification.
  const notes: { subjectCode?: string; text: string }[] = [];
  let paymentTerms: string | undefined;
  let meansText: string | undefined;
  let businessProcess: string | undefined;
  let specificationId: string | undefined;
  let exemption: { text?: string; code?: string } | undefined;
  for (const f of c.all(m, 'S_FTX')) {
    const subject = c.text(f, 'D_4451');
    const text = c.texts(f, 'C_C108/D_4440').join(' ');
    const code = c.text(f, 'C_C107/D_4441');
    if (subject === 'DOC') {
      businessProcess ??= code;
      specificationId ??= text || undefined;
      continue;
    }
    if (subject === 'AGM') {
      exemption ??= { text: text || undefined, code };
      continue;
    }
    if (!text) continue;
    if (subject === 'AAB') paymentTerms = paymentTerms ? `${paymentTerms}\n${text}` : text;
    else if (subject === 'REG') seller.additionalLegalInfo = seller.additionalLegalInfo ? `${seller.additionalLegalInfo}\n${text}` : text;
    else if (subject === 'AAT') meansText = meansText ? `${meansText}\n${text}` : text;
    else notes.push(subject && subject !== 'GEN' ? { subjectCode: subject, text } : { text });
  }

  // Payment.
  const sellerBank = bank(c, sellerNad?.g);
  const pai = c.text(descend(m, 'S_PAI')[0], 'C_C534/D_4461');
  const reference = ref('PQ');
  let payments: PaymentInstructions[] = [];
  if (pai || sellerBank || reference) {
    let meansCode = pai;
    if (!meansCode) {
      meansCode = sellerBank ? '30' : 'ZZZ';
      c.derive(
        '/payments/0/meansCode',
        `No PAI segment; ${meansCode === '30' ? 'credit transfer (30) assumed from the bank account' : 'ZZZ'}`,
      );
    }
    payments = [{ meansCode, meansText, remittanceInformation: reference, creditTransfers: sellerBank ? [sellerBank] : [] }];
  }
  const dueDate = date(c, c.el(m, 'G_SG8'), '13', 'BT-9');

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
  let allowanceTotal = moa.get('260');
  let chargeTotal = moa.get('259');
  if (allowanceTotal === undefined && allowances.length) {
    allowanceTotal = sum(allowances.map((a) => a.amount));
    c.derive('/totals/allowanceTotal', 'MOA 260 absent; sum of document allowances');
  }
  if (chargeTotal === undefined && charges.length) {
    chargeTotal = sum(charges.map((a) => a.amount));
    c.derive('/totals/chargeTotal', 'MOA 259 absent; sum of document charges');
  }
  let lineNetTotal = moa.get('79');
  if (lineNetTotal === undefined) {
    lineNetTotal = sum(lines.map((l) => l.netAmount));
    c.derive('/totals/lineNetTotal', 'MOA 79 absent; sum of line amounts');
  }
  let taxExclusive = moa.get('389');
  if (taxExclusive === undefined) {
    taxExclusive = add(sub(lineNetTotal, allowanceTotal ?? '0'), chargeTotal ?? '0');
    c.derive('/totals/taxExclusive', 'MOA 389 absent; BT-106 - BT-107 + BT-108');
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
    return { taxableAmount: taxable, taxAmount, categoryCode: c.text(tax, 'D_5305') ?? '', rate: c.dec(tax, 'C_C243/D_5278') };
  });
  if (exemption) {
    const targets = vatBreakdown.filter((v) => EXEMPT_CATEGORIES.has(v.categoryCode));
    for (const v of targets) {
      v.exemptionReason = exemption.text;
      v.exemptionReasonCode = exemption.code;
    }
    if (targets.length === 0)
      c.warn('ESLOG-EXEMPTION-UNUSED', 'FTX AGM (VAT exemption reason) present but no exempt VAT category in the breakdown');
    else if (targets.length > 1)
      c.derive(
        '/vatBreakdown/*/exemptionReason',
        'eSLOG states one exemption reason for the document; applied to every exempt VAT category',
      );
  }
  let vatTotal = moa.get('176');
  if (vatTotal === undefined && vatBreakdown.length) {
    vatTotal = sum(vatBreakdown.map((v) => v.taxAmount));
    c.derive('/totals/vatTotal', 'MOA 176 absent; sum of VAT breakdown');
  }
  let taxInclusive = moa.get('388');
  if (taxInclusive === undefined) {
    taxInclusive = add(taxExclusive, vatTotal ?? '0');
    c.derive('/totals/taxInclusive', 'MOA 388 absent; BT-109 + BT-110');
  }
  const prepaid = moa.get('113');
  const rounding = moa.get('366');
  let payable = moa.get('9');
  if (payable === undefined) {
    payable = add(sub(taxInclusive, prepaid ?? '0'), rounding ?? '0');
    c.derive('/totals/payable', 'MOA 9 absent; BT-112 - BT-113 + BT-114');
  }
  const totals: Totals = {
    lineNetTotal,
    allowanceTotal,
    chargeTotal,
    taxExclusive,
    vatTotal,
    vatTotalInTaxCurrency: moa.get('2'),
    taxInclusive,
    prepaid,
    rounding,
    payable,
  };

  // Period: DTM 167/168.
  const start = date(c, m, '167', 'invoicing period start');
  const end = date(c, m, '168', 'invoicing period end');

  const objectRef = ref('ATS');
  const inv = {
    kind,
    typeCode,
    id,
    issueDate,
    selfBilled: SELF_BILLED_TYPE_CODES.has(typeCode),
    currency,
    taxCurrency,
    taxPointDate: date(c, m, '131', 'BT-7'),
    dueDate,
    buyerReference: buyerR.refs.get('CR'),
    projectRef: ref('AEP'),
    contractRef: ref('CT'),
    purchaseOrderRef: ref('ON'),
    salesOrderRef: ref('VN'),
    receivingAdviceRef: ref('ALO'),
    despatchAdviceRef: ref('AAK'),
    tenderRef: ref('GC'),
    invoicedObjectId: objectRef ? { value: objectRef } : undefined,
    accountingRef: buyerR.refs.get('AOU'),
    paymentTerms,
    notes,
    businessProcess,
    specificationId: specificationId ?? SPEC_ID,
    precedingInvoices: (refs.get('OI') ?? []).map((v) => ({ id: v, issueDate: precedingDates.get(v) })),
    invoicePeriod: start || end ? { start, end } : undefined,
    seller,
    buyer: buyerR.party,
    payee: payeeNad ? { name: party(c, payeeNad.g).party.name ?? '' } : undefined,
    taxRepresentative: taxRep,
    additionalParties,
    delivery:
      deliveryParty || date(c, m, '35', 'BT-72')
        ? {
            partyName: deliveryParty?.name,
            locationId: deliveryParty?.identifiers[0],
            actualDate: date(c, m, '35', 'BT-72'),
            address: deliveryParty?.address,
          }
        : undefined,
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
    source: sourceMeta(input, root, c, { specificationId }),
  } as CanonicalInvoice;
  if (lines.length === 0) c.warn('NO_LINES', 'The invoice has no lines');
  return [finish(inv)];
}

interface RawDtm {
  value: string;
  format?: string;
}

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
  try {
    return toIsoDate(value).date;
  } catch (e) {
    if (e instanceof ValueError) throw new ParseError(`${field}: ${e.message}`);
    throw e;
  }
}

function date(c: Ctx, scope: Element | undefined, code: string, field: string): IsoDate | undefined {
  const r = rawDtm(c, scope, code);
  return r ? toDate(c, r.value, field) : undefined;
}

interface PartyResult {
  party: Party /** Party-level RFF values by qualifier. */;
  refs: Map<string, string>;
}

function emptyParty(): PartyResult {
  return { party: { identifiers: [], nationalTaxIds: [] }, refs: new Map() };
}

function party(c: Ctx, g: Element): PartyResult {
  const nad = c.el(g, 'S_NAD');
  const idValue = c.text(nad, 'C_C082/D_3039');
  // D_1131 carries the ISO 6523 ICD of the identifier (BT-29-1 / BT-46-1), e.g. 0088 for a GLN.
  const idScheme = c.text(nad, 'C_C082/D_1131');
  const identifiers: Identifier[] = idValue ? [idScheme ? { value: idValue, schemeId: idScheme } : { value: idValue }] : [];
  const street = c.texts(nad, 'C_C059/D_3042');
  const names = c.texts(nad, 'C_C080/D_3036');
  const refs = new Map<string, string>();
  for (const r of descend(g, 'S_RFF')) {
    const q = c.text(r, 'C_C506/D_1153');
    const v = c.text(r, 'C_C506/D_1154');
    if (!q || !v) continue;
    if (!refs.has(q)) refs.set(q, v);
    if (!PARTY_REFS.has(q)) c.unmapped[`/Invoice/M_INVOIC/G_SG2[${c.text(nad, 'D_3035') ?? '?'}]/S_RFF/${q}`] = v;
  }
  // G_SG5 groups: a CTA with a name is the contact point; a CTA-less or nameless one with COM EM is the electronic address.
  let contact: Contact | undefined;
  let endpoint: Identifier | undefined;
  for (const sg of descend(g, 'G_SG5')) {
    const cta = c.el(sg, 'S_CTA');
    const name = c.text(cta, 'C_C056/D_3412');
    const coms = c.all(sg, 'S_COM').map((e) => ({ v: c.text(e, 'C_C076/D_3148'), t: c.text(e, 'C_C076/D_3155') }));
    const email = coms.find((x) => x.t === 'EM')?.v;
    const phone = coms.find((x) => x.t === 'TE')?.v;
    if (name || phone)
      contact = { ...contact, name: name ?? contact?.name, phone: phone ?? contact?.phone, email: email ?? contact?.email };
    else if (email) endpoint = { value: email, schemeId: 'EM' };
  }
  return {
    refs,
    party: {
      name: names[0],
      tradingName: names[1],
      identifiers,
      legalRegistrationId: refs.get('GN') ? { value: refs.get('GN')! } : undefined,
      vatId: refs.get('VA'),
      nationalTaxIds: [],
      endpoint,
      address: {
        line1: street[0],
        line2: street[1],
        line3: street[2],
        city: c.text(nad, 'D_3164'),
        postalCode: c.text(nad, 'D_3251'),
        countrySubdivision: c.text(nad, 'D_3229'),
        countryCode: c.text(nad, 'D_3207'),
      },
      contact: contact && (contact.name || contact.phone || contact.email) ? contact : undefined,
    },
  };
}
/** Party RFF qualifiers the mapping consumes: GN legal registration, VA VAT, AHP tax registration, CR buyer reference, AOU buyer accounting reference. */
const PARTY_REFS = new Set(['GN', 'VA', 'AHP', 'CR', 'AOU']);

/** FII with qualifier RB (receiving financial institution) below the seller's NAD group. */
function bank(c: Ctx, g: Element | undefined): CreditTransfer | undefined {
  const fii = descend(g, 'S_FII').find((f) => c.text(f, 'D_3035') === 'RB');
  const accountId = c.text(fii, 'C_C078/D_3194')?.replace(/\s/g, '');
  if (!accountId) return undefined;
  return { accountId, accountName: c.text(fii, 'C_C078/D_3192'), serviceProviderId: c.text(fii, 'C_C088/D_3433') };
}

/**
 * ALC: reason text in C552/D_1230; reason code in C552/D_5189 for allowances and C214/D_7161 for charges.
 * MOA 204 = allowance amount, 23 = charge amount, 25 = base amount; PCD gives the percentage.
 */
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
  return {
    amount,
    baseAmount: amounts.get('25'),
    percentage: c.dec(descend(g, 'C_C501')[0], 'D_5482'),
    reason: c.text(g, 'S_ALC/C_C552/D_1230'),
    reasonCode: isCharge ? c.text(g, 'S_ALC/C_C214/D_7161') : c.text(g, 'S_ALC/C_C552/D_5189'),
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

  // BT-157: LIN's C212 (D_7143 SRV = GTIN). PIA 5 = supplier/buyer item numbers, PIA 1 = classification.
  const linId = c.el(lin, 'C_C212');
  const linValue = c.text(linId, 'D_7140');
  const linType = c.text(linId, 'D_7143');
  let standardId: Identifier | undefined = linValue
    ? linType === 'SRV'
      ? { value: linValue, schemeId: '0160' }
      : { value: linValue }
    : undefined;
  let sellerId: string | undefined;
  let buyerId: string | undefined;
  const classifications: { code: string; listId: string; listVersion?: string }[] = [];
  for (const pia of c.all(l, 'S_PIA')) {
    const q = c.text(pia, 'D_4347');
    for (const e of c.all(pia, 'C_C212')) {
      const v = c.text(e, 'D_7140');
      const t = c.text(e, 'D_7143');
      if (!v) continue;
      if (q === '1') classifications.push({ code: v, listId: t ?? '', listVersion: c.text(e, 'D_1131') });
      else if (t === 'SA') sellerId ??= v;
      else if (t === 'IN') buyerId ??= v;
      else if (t === 'SRV') standardId ??= { value: v, schemeId: '0160' };
    }
  }

  // IMD: F = item name (BT-153), A = long description (BT-154).
  const imds = c
    .all(l, 'S_IMD')
    .map((e) => ({ f: c.text(e, 'D_7077'), t: c.texts(e, 'C_C273/D_7008').join(' ') }))
    .filter((x) => x.t);
  const name = imds.find((x) => x.f === 'F')?.t;
  if (!name) c.warn('ESLOG-NO-ITEM-NAME', `Line ${id}: no S_IMD with format F (BT-153 is mandatory in EN 16931)`);
  const description =
    imds
      .filter((x) => x.f === 'A')
      .map((x) => x.t)
      .join('\n') || undefined;

  const qty = c.all(l, 'S_QTY/C_C186').find((q) => c.text(q, 'D_6063') === '47');

  const pri = c.all(l, 'G_SG29/S_PRI/C_C509');
  const priceOf = (q: string) => pri.find((p) => c.text(p, 'D_5125') === q);
  const net1 = priceOf('AAA');
  const gross1 = priceOf('AAB');
  const netPrice = c.dec(net1, 'D_5118');

  const taxEl = descend(c.el(l, 'G_SG34'), 'S_TAX')[0];
  const vat: VatInfo | undefined = taxEl ? { categoryCode: c.text(taxEl, 'D_5305') ?? '', rate: c.dec(taxEl, 'C_C243/D_5278') } : undefined;

  const allowances: AllowanceCharge[] = [];
  const charges: AllowanceCharge[] = [];
  for (const g of c.all(l, 'G_SG39')) {
    const isCharge = c.text(g, 'S_ALC/D_5463') === 'C';
    const e = allowanceCharge(c, g, isCharge, false);
    if (e) (isCharge ? charges : allowances).push(e);
  }

  // G_SG30 RFF: AVE = object identifier (BT-128), ON = purchase order line (BT-132, D_1156), AWQ = accounting reference (BT-133).
  const lineRefs = c.all(l, 'G_SG30/S_RFF/C_C506');
  const lineRef = (q: string) => lineRefs.find((r) => c.text(r, 'D_1153') === q);
  const objectId = c.text(lineRef('AVE'), 'D_1154');

  const noteTexts = c
    .all(l, 'S_FTX')
    .filter((f) => c.text(f, 'D_4451') === 'ACB')
    .map((f) => c.texts(f, 'C_C108/D_4440').join(' '))
    .filter(Boolean);
  const lineStart = date(c, l, '167', 'line period start');
  const lineEnd = date(c, l, '168', 'line period end');
  return {
    id,
    note: noteTexts.join('\n') || undefined,
    objectId: objectId ? { value: objectId } : undefined,
    quantity: c.dec(qty, 'D_6060'),
    unitCode: c.text(qty, 'D_6411'),
    netAmount: net,
    orderLineRef: c.text(lineRef('ON'), 'D_1156'),
    accountingRef: c.text(lineRef('AWQ'), 'D_1154'),
    period: lineStart || lineEnd ? { start: lineStart, end: lineEnd } : undefined,
    allowances,
    charges,
    price:
      netPrice !== undefined
        ? {
            net: netPrice,
            gross: c.dec(gross1, 'D_5118'),
            baseQuantity: c.dec(net1, 'D_5284'),
            baseQuantityUnit: c.text(net1, 'D_6411'),
          }
        : undefined,
    vat,
    item: { name: name ?? '', description, sellerId, buyerId, standardId, classifications, attributes: [] },
  };
}
