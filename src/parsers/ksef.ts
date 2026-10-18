/**
 * Polish KSeF structured invoices (FA(2), FA(3), FA_RR(1)) -> canonical.
 *
 * Element mapping follows the Ministry of Finance schemas (crd.gov.pl/wzor/...) and the
 * KSeF documentation (CIRFMF/ksef-docs). Elements are matched by local name.
 *
 * - FA(2)/FA(3): Podmiot1 is the seller, Podmiot2 the buyer, `Fa` the invoice.
 * - FA_RR(1) (flat-rate farmer purchase invoices): Podmiot1 is the supplier (the farmer, i.e.
 *   the seller), Podmiot2 the buyer who issues it, `FakturaRR` the invoice. The flat-rate
 *   refund (zryczałtowany zwrot podatku) is mapped as VAT category S and flagged in warnings.
 * - Corrections (KOR*): amounts are differences, and `kind` follows the sign of the
 *   correction total (see `effectiveSign`). A reduction is therefore a 'creditNote' and its
 *   amounts are negated to positive magnitudes (recorded in `source.derived`), so
 *   `effectiveSign(doc) * amount` is the ledger posting. Lines are left as written when the
 *   sender lists before/after states; delta lines are negated with the totals.
 * - The KSeF number is not in the XML. `clearance` stays empty.
 */
import type { Element } from '@xmldom/xmldom';
import type {
  AdditionalParty,
  Address,
  CanonicalInvoice,
  Correction,
  CreditTransfer,
  Decimal,
  Identifier,
  Line,
  Party,
  PaymentInstallment,
  PaymentInstructions,
  PlExtension,
  PrecedingInvoiceRef,
  Seller,
  Totals,
  VatBreakdown,
  VatInfo,
} from '../canonical.js';
import { add, cmp, isZero, neg, sign, sub, sum } from '../values.js';
import { Ctx, finish, ParseError, parseXml, sourceMeta } from './context.js';
import type { ParseInput } from './index.js';

const AMOUNT_ZERO = '0.00';

/** P_12 -> VAT category (UNCL 5305). The source code always goes to `nationalCode`. */
function vatFromRateCode(code: string, exemption?: string): VatInfo | undefined {
  const nationalCode = `PL:P_12:${code}`;
  switch (code) {
    case '0 KR':
    case '0':
      return { categoryCode: 'Z', rate: '0' as never, nationalCode };
    case '0 WDT':
      return { categoryCode: 'K', rate: '0' as never, nationalCode };
    case '0 EX':
      return { categoryCode: 'G', rate: '0' as never, nationalCode };
    case 'zw':
      return { categoryCode: 'E', nationalCode, ...(exemption ? { exemptionReason: exemption } : {}) };
    case 'oo':
      return { categoryCode: 'AE', nationalCode };
    case 'np I':
    case 'np II':
    case 'np':
      return { categoryCode: 'O', nationalCode };
    default:
      if (/^\d+(\.\d+)?$/.test(code)) return { categoryCode: 'S', rate: code as never, nationalCode };
      return undefined;
  }
}

/** Free-text units seen on Polish invoices -> UN/ECE Rec 20. The source text always stays in `unitText`. */
const UNITS: Record<string, string> = {
  szt: 'H87',
  'szt.': 'H87',
  sztuka: 'H87',
  sztuk: 'H87',
  kg: 'KGM',
  g: 'GRM',
  t: 'TNE',
  l: 'LTR',
  litr: 'LTR',
  m: 'MTR',
  mb: 'MTR',
  km: 'KMT',
  m2: 'MTK',
  'm²': 'MTK',
  m3: 'MTQ',
  'm³': 'MTQ',
  godz: 'HUR',
  'godz.': 'HUR',
  h: 'HUR',
  dzień: 'DAY',
  dni: 'DAY',
  mies: 'MON',
  'mies.': 'MON',
  mc: 'MON',
  kpl: 'SET',
  'kpl.': 'SET',
  kwh: 'KWH',
  usł: 'C62',
  'usł.': 'C62',
};

/** Podmiot3 Rola -> canonical role. */
const ROLES: Record<string, string> = {
  1: 'factor',
  2: 'recipient-unit',
  3: 'original-entity',
  4: 'additional-buyer',
  5: 'issuer',
  6: 'payer',
  7: 'local-government-issuer',
  8: 'local-government-recipient',
  9: 'vat-group-issuer',
  10: 'vat-group-recipient',
  11: 'employee',
};
const AUTHORISED_ROLES: Record<string, string> = { 1: 'enforcement-authority', 2: 'bailiff', 3: 'tax-representative' };
const KIND_LABELS: Record<string, string> = {
  VAT: 'Faktura podstawowa',
  KOR: 'Faktura korygująca',
  ZAL: 'Faktura zaliczkowa',
  ROZ: 'Faktura rozliczeniowa (art. 106f ust. 3)',
  UPR: 'Faktura uproszczona',
  KOR_ZAL: 'Korekta faktury zaliczkowej',
  KOR_ROZ: 'Korekta faktury rozliczeniowej',
  VAT_RR: 'Faktura VAT RR',
  KOR_VAT_RR: 'Faktura korygująca VAT RR',
};
const TAXPAYER_STATUS: Record<string, string> = {
  1: 'w likwidacji',
  2: 'w restrukturyzacji',
  3: 'w upadłości',
  4: 'w postępowaniu spadkowym',
};
/** UNCL 4461 for FormaPlatnosci 1-7. Kredyt (trade credit), Bon and Mobilna have no exact code and stay 'ZZZ' with the text. */
const PAYMENT_MEANS: Record<string, [code: string, text: string]> = {
  1: ['10', 'Gotówka'],
  2: ['48', 'Karta'],
  3: ['ZZZ', 'Bon'],
  4: ['20', 'Czek'],
  5: ['ZZZ', 'Kredyt'],
  6: ['30', 'Przelew'],
  7: ['ZZZ', 'Płatność mobilna'],
};
/** Aggregate buckets of the FA header: field, VAT category, source code, candidate P_12 codes for the rate. */
const BUCKETS: { n: string; tax?: string; category: string; code: string; rates?: string[]; zeroRate?: boolean }[] = [
  { n: 'P_13_1', tax: 'P_14_1', category: 'S', code: 'P_13_1', rates: ['23', '22'] },
  { n: 'P_13_2', tax: 'P_14_2', category: 'S', code: 'P_13_2', rates: ['8', '7'] },
  { n: 'P_13_3', tax: 'P_14_3', category: 'S', code: 'P_13_3', rates: ['5'] },
  { n: 'P_13_4', tax: 'P_14_4', category: 'S', code: 'P_13_4', rates: ['4', '3'] },
  { n: 'P_13_5', tax: 'P_14_5', category: 'S', code: 'P_13_5' },
  { n: 'P_13_6_1', category: 'Z', code: 'P_12:0 KR', zeroRate: true },
  { n: 'P_13_6_2', category: 'K', code: 'P_12:0 WDT', zeroRate: true },
  { n: 'P_13_6_3', category: 'G', code: 'P_12:0 EX', zeroRate: true },
  { n: 'P_13_7', category: 'E', code: 'P_12:zw' },
  { n: 'P_13_8', category: 'O', code: 'P_12:np I' },
  { n: 'P_13_9', category: 'O', code: 'P_12:np II' },
  { n: 'P_13_10', category: 'AE', code: 'P_12:oo' },
  { n: 'P_13_11', category: 'O', code: 'P_13_11' },
];

export function parseKsef(input: ParseInput): CanonicalInvoice[] {
  const root = parseXml(input.payload.xml);
  const c = new Ctx({});
  const isRR = c.el(root, 'FakturaRR') !== undefined;
  const body = c.el(root, isRR ? 'FakturaRR' : 'Fa');
  if (!body) throw new ParseError('Neither Fa nor FakturaRR found');

  const formCode = c.el(root, 'Naglowek/KodFormularza');
  const schemaVariant = c.attr(formCode, undefined, 'kodSystemowy') ?? input.details.version;
  const ts = c.text(root, 'Naglowek/DataWytworzeniaFa');
  if (ts) c.unmapped['/Faktura/Naglowek/DataWytworzeniaFa'] = ts;
  const sysInfo = c.text(root, 'Naglowek/SystemInfo');
  if (sysInfo) c.unmapped['/Faktura/Naglowek/SystemInfo'] = sysInfo;

  const kindCode = c.text(body, 'RodzajFaktury');
  if (!kindCode) throw new ParseError('RodzajFaktury missing');
  const id = c.text(body, isRR ? 'P_4C' : 'P_2');
  const issueDate = c.date(body, isRR ? 'P_4B' : 'P_1', isRR ? 'P_4B' : 'P_1');
  if (!id || !issueDate) throw new ParseError('Invoice number or issue date missing');
  const currency = c.text(body, 'KodWaluty');
  if (!currency) throw new ParseError('KodWaluty missing');

  const isCorrection = kindCode.startsWith('KOR');
  const advanceLike = kindCode === 'ZAL';
  const settlement = kindCode === 'ROZ' || kindCode === 'KOR_ROZ';
  const selfBilled = !isRR && c.text(body, 'Adnotacje/P_17') === '1';

  // ---- lines, VAT, totals ------------------------------------------------------------
  const exemption = !isRR ? exemptionText(c, body) : undefined;
  const rowEls = c.all(body, isRR ? 'FakturaRRWiersz' : 'FaWiersz');
  const hasBefore = rowEls.some((r) => c.text(r, 'StanPrzed') === '1');
  const lines = rowEls.map((r, i) =>
    isRR ? rrLine(c, r, isCorrection, hasBefore, i) : faLine(c, r, isCorrection, hasBefore, exemption, i),
  );

  let totals: Totals;
  let vatBreakdown: VatBreakdown[];
  let taxCurrency: string | undefined;
  let signedTotal: string;
  if (isRR) {
    ({ totals, vatBreakdown, taxCurrency, signedTotal } = rrTotals(c, body, lines));
  } else {
    ({ totals, vatBreakdown, taxCurrency, signedTotal } = faTotals(c, body, lines, settlement, exemption));
  }

  // ---- parties -----------------------------------------------------------------------
  const seller = party(c, c.el(root, 'Podmiot1'), '/Faktura/Podmiot1') as Seller;
  const buyer = party(c, c.el(root, 'Podmiot2'), '/Faktura/Podmiot2') as Seller;
  // StatusInfoPodatnika describes the invoice issuer: Podmiot1 in FA, Podmiot2 (the buyer) in FA_RR.
  const status = c.text(root, isRR ? 'Podmiot2/StatusInfoPodatnika' : 'Podmiot1/StatusInfoPodatnika');
  if (status) (isRR ? buyer : seller).additionalLegalInfo = `Status podatnika: ${TAXPAYER_STATUS[status] ?? status}`;
  const taxableSale = vatBreakdown.some((v) => ['S', 'Z', 'K', 'G', 'AE'].includes(v.categoryCode));
  // FA_RR suppliers are flat-rate farmers, who are not VAT taxpayers: no inference there.
  if (!isRR && !seller.vatId && taxableSale) {
    const nip = seller.nationalTaxIds.find((n) => n.schemeId === 'PL:NIP');
    if (nip) {
      seller.vatId = `PL${nip.value}`;
      c.derive('/seller/vatId', 'PL + NIP: the seller states VAT-bearing sales, so it is a registered VAT taxpayer (no Prefiks given)');
    }
  }
  seller.identifiers.push(...registers(c, root, seller));

  const additionalParties: AdditionalParty[] = c.all(root, 'Podmiot3').map((p, i) => {
    const rola = c.text(p, 'Rola');
    const other = c.text(p, 'RolaInna') === '1';
    const pt = party(c, p, `/Faktura/Podmiot3[${i + 1}]`);
    const share = c.text(p, 'Udzial');
    if (share) c.unmapped[`/Faktura/Podmiot3[${i + 1}]/Udzial`] = share;
    if (other) return { role: c.text(p, 'OpisRoli') ?? 'other', sourceRole: 'PL:RolaInna', party: pt };
    return { role: (rola && ROLES[rola]) || 'other', sourceRole: `PL:Rola:${rola ?? ''}`, party: pt };
  });
  const authorised = c.el(root, 'PodmiotUpowazniony');
  if (authorised) {
    const rp = c.text(authorised, 'RolaPU') ?? '';
    additionalParties.push({
      role: AUTHORISED_ROLES[rp] ?? 'authorised-entity',
      sourceRole: `PL:RolaPU:${rp}`,
      party: party(c, authorised, '/Faktura/PodmiotUpowazniony'),
    });
  }

  // ---- header references, corrections, payment ---------------------------------------
  const precedingInvoices: PrecedingInvoiceRef[] = [
    ...c.all(body, 'DaneFaKorygowanej').map((d) => {
      const clearanceId = c.text(d, 'NrKSeFFaKorygowanej');
      const issued = c.date(d, 'DataWystFaKorygowanej', 'DataWystFaKorygowanej');
      return {
        id: c.text(d, 'NrFaKorygowanej') ?? clearanceId ?? '',
        ...(issued ? { issueDate: issued } : {}),
        ...(clearanceId ? { clearanceId } : {}),
      };
    }),
    ...c.all(body, 'FakturaZaliczkowa').map((d) => {
      const clearanceId = c.text(d, 'NrKSeFFaZaliczkowej');
      return { id: c.text(d, 'NrFaZaliczkowej') ?? clearanceId ?? '', ...(clearanceId ? { clearanceId } : {}) };
    }),
  ].filter((r) => r.id !== '');
  const reason = c.text(body, 'PrzyczynaKorekty');
  const method = c.text(body, 'TypKorekty');
  const correction: Correction | undefined = isCorrection || reason || method ? { reason, method } : undefined;
  for (const tag of ['OkresFaKorygowanej', 'NrFaKorygowany', 'P_15ZK', 'KursWalutyZK']) {
    const v = c.text(body, tag);
    if (v) c.unmapped[`/Faktura/${bodyName(isRR)}/${tag}`] = v;
  }
  for (const tag of ['Podmiot1K', 'Podmiot2K'])
    c.all(body, tag).forEach((e, i) => {
      dump(c, e, `/Faktura/${bodyName(isRR)}/${tag}[${i + 1}]`);
    });

  const { payments, paymentSchedule, dueDate } = payment(c, body, isRR);
  const settle = settlement_(c, body, totals, isRR);
  if (settle) totals.payable = settle;

  const notes = [
    ...c.all(body, 'DodatkowyOpis').map((d) => ({ text: [c.text(d, 'Klucz'), c.text(d, 'Wartosc')].filter(Boolean).join(': ') })),
    ...c.texts(root, 'Stopka/Informacje/StopkaFaktury').map((text) => ({ text })),
  ];
  const umowy = c.all(body, 'WarunkiTransakcji/Umowy');
  const zamowienia = c.all(body, 'WarunkiTransakcji/Zamowienia');
  const wz = c.texts(body, 'WZ');
  umowy.slice(1).forEach((u, i) => {
    dump(c, u, `/Faktura/Fa/WarunkiTransakcji/Umowy[${i + 2}]`);
  });
  zamowienia.slice(1).forEach((z, i) => {
    dump(c, z, `/Faktura/Fa/WarunkiTransakcji/Zamowienia[${i + 2}]`);
  });
  wz.slice(1).forEach((w, i) => {
    c.unmapped[`/Faktura/Fa/WZ[${i + 2}]`] = w;
  });
  for (const first of [umowy[0], zamowienia[0]]) {
    const date = first && c.text(first, first.localName === 'Umowy' ? 'DataUmowy' : 'DataZamowienia');
    if (date)
      c.unmapped[`/Faktura/Fa/WarunkiTransakcji/${first.localName}[1]/${first.localName === 'Umowy' ? 'DataUmowy' : 'DataZamowienia'}`] =
        date;
  }
  for (const tag of ['NrPartiiTowaru', 'WarunkiDostawy', 'KursUmowny', 'WalutaUmowna', 'PodmiotPosredniczacy']) {
    c.texts(body, `WarunkiTransakcji/${tag}`).forEach((v, i) => {
      c.unmapped[`/Faktura/Fa/WarunkiTransakcji/${tag}[${i + 1}]`] = v;
    });
  }
  c.all(body, 'WarunkiTransakcji/Transport').forEach((t, i) => {
    dump(c, t, `/Faktura/Fa/WarunkiTransakcji/Transport[${i + 1}]`);
  });
  dump(c, c.el(body, 'Zamowienie'), '/Faktura/Fa/Zamowienie');
  c.all(body, 'ZaliczkaCzesciowa').forEach((z, i) => {
    dump(c, z, `/Faktura/Fa/ZaliczkaCzesciowa[${i + 1}]`);
  });
  dump(c, c.el(root, 'Zalacznik'), '/Faktura/Zalacznik');
  for (const tag of ['P_1M', 'FP', 'TP', 'ZwrotAkcyzy', 'KursWalutyZ']) {
    const v = c.text(body, tag);
    if (v && !(tag === 'KursWalutyZ')) c.unmapped[`/Faktura/${bodyName(isRR)}/${tag}`] = v;
  }
  if (!isRR) {
    for (const tag of ['P_22', 'P_42_5', 'P_23']) {
      const v = c.text(body, `Adnotacje/${tag}`);
      if (v === '1') c.unmapped[`/Faktura/Fa/Adnotacje/${tag}`] = v;
    }
    if (c.text(body, 'Adnotacje/NoweSrodkiTransportu/P_22') === '1')
      dump(c, c.el(body, 'Adnotacje/NoweSrodkiTransportu'), '/Faktura/Fa/Adnotacje/NoweSrodkiTransportu');
  }

  // ---- header kind, sign handling ----------------------------------------------------
  const reduces = isCorrection && sign(signedTotal) === -1;
  let typeCode: string;
  if (isCorrection) typeCode = reduces ? '381' : '384';
  else if (advanceLike) typeCode = '386';
  else typeCode = selfBilled ? '389' : '380';
  if (isCorrection) {
    c.derive(
      '/kind',
      `RodzajFaktury ${kindCode}: kind from the sign of the correction total (${signedTotal}): ${reduces ? 'reduction -> creditNote' : 'increase or zero -> invoice'}`,
    );
  }

  const ext = extensions(c, root, body, isRR, kindCode, schemaVariant, selfBilled);
  if (isRR) {
    c.warn(
      'PL-RR-REFUND',
      'FA_RR: the flat-rate refund (zryczałtowany zwrot podatku) is mapped as VAT category S; it is paid by the buyer on top of the purchase value but is not VAT output tax',
    );
  }

  const actualDate = isRR ? c.date(body, 'P_4A', 'P_4A') : undefined;
  const delivery = actualDate ? { actualDate } : undefined;
  const p6 = !isRR ? c.date(body, 'P_6', 'P_6') : undefined;
  const period = !isRR ? c.el(body, 'OkresFa') : undefined;
  const inv = {
    kind: reduces ? 'creditNote' : 'invoice',
    typeCode,
    id,
    issueDate,
    nationalType: { scheme: 'PL:RodzajFaktury', code: kindCode, ...(KIND_LABELS[kindCode] ? { label: KIND_LABELS[kindCode] } : {}) },
    selfBilled,
    currency,
    taxCurrency,
    exchangeRate: c.dec(body, 'KursWalutyZ') ? { rate: c.dec(body, 'KursWalutyZ') } : undefined,
    taxPointDate: advanceLike ? p6 : undefined,
    dueDate,
    contractRef: umowy[0] ? c.text(umowy[0], 'NrUmowy') : undefined,
    purchaseOrderRef: zamowienia[0] ? c.text(zamowienia[0], 'NrZamowienia') : undefined,
    despatchAdviceRef: wz[0],
    notes,
    specificationId: root.namespaceURI ?? '',
    precedingInvoices,
    correction,
    invoicePeriod: period ? { start: c.date(period, 'P_6_Od', 'P_6_Od'), end: c.date(period, 'P_6_Do', 'P_6_Do') } : undefined,
    seller,
    buyer,
    additionalParties,
    delivery: delivery ?? (p6 && !advanceLike ? { actualDate: p6 } : undefined),
    payments,
    paymentSchedule,
    allowances: [],
    charges: [],
    totals,
    vatBreakdown,
    otherTaxes: [],
    withholdings: [],
    attachments: [],
    lines,
    clearance: [],
    extensions: { pl: ext },
    source: sourceMeta(input, root, c, { formatVersion: schemaVariant }),
  } as CanonicalInvoice;
  if (!inv.specificationId) throw new ParseError('Root namespace missing');
  c.derive('/specificationId', 'KSeF has no EN 16931 CustomizationID; the schema namespace stands in for BT-24');

  if (reduces) negateForReduction(c, inv);
  return [finish(inv)];
}

const bodyName = (rr: boolean) => (rr ? 'FakturaRR' : 'Fa');

// ---------------------------------------------------------------------------------------
// Parties
// ---------------------------------------------------------------------------------------

function address(c: Ctx, el: Element | undefined): { address?: Address; gln?: string } {
  if (!el) return {};
  const line1 = c.text(el, 'AdresL1');
  const line2 = c.text(el, 'AdresL2');
  const countryCode = c.text(el, 'KodKraju');
  const gln = c.text(el, 'GLN');
  return { address: { line1, line2, countryCode }, gln };
}

function party(c: Ctx, el: Element | undefined, path: string): Party {
  const out: Party = { identifiers: [], nationalTaxIds: [] };
  if (!el) return out;
  const idEl = c.el(el, 'DaneIdentyfikacyjne');
  out.name = c.text(idEl, 'Nazwa');
  const nip = c.text(idEl, 'NIP');
  const prefix = c.text(el, 'PrefiksPodatnika');
  const kodUe = c.text(idEl, 'KodUE');
  const nrVatUe = c.text(idEl, 'NrVatUE');
  const kodKraju = c.text(idEl, 'KodKraju');
  const nrId = c.text(idEl, 'NrID');
  const idWew = c.text(idEl, 'IDWew');
  if (nip) {
    if (prefix && prefix !== 'PL') out.vatId = `${prefix}${nip}`;
    else {
      out.nationalTaxIds.push({ value: nip, schemeId: 'PL:NIP' });
      if (prefix === 'PL') out.vatId = `PL${nip}`;
    }
  }
  if (kodUe && nrVatUe) out.vatId = `${kodUe}${nrVatUe}`;
  if (nrId) out.nationalTaxIds.push({ value: nrId, schemeId: `${kodKraju ?? 'XX'}:TAXID` });
  if (idWew) out.identifiers.push({ value: idWew, schemeId: 'PL:IDWEW' });
  const eori = c.text(el, 'NrEORI');
  if (eori) out.identifiers.push({ value: eori, schemeId: 'EORI' });
  const customer = c.text(el, 'NrKlienta') ?? c.text(el, 'NrKontrahenta');
  if (customer) out.identifiers.push({ value: customer, schemeId: 'PL:NrKlienta' });
  const buyerKey = c.text(el, 'IDNabywcy');
  if (buyerKey) c.unmapped[`${path}/IDNabywcy`] = buyerKey;
  const { address: addr, gln } = address(c, c.el(el, 'Adres'));
  if (addr && Object.values(addr).some(Boolean)) out.address = addr;
  if (gln) out.identifiers.push({ value: gln, schemeId: '0088' });
  dump(c, c.el(el, 'AdresKoresp'), `${path}/AdresKoresp`);
  const contacts = c.all(el, 'DaneKontaktowe');
  const emails = contacts.flatMap((d) => c.texts(d, 'Email').concat(c.texts(d, 'EmailPU')));
  const phones = contacts.flatMap((d) => c.texts(d, 'Telefon').concat(c.texts(d, 'TelefonPU')));
  if (emails[0] || phones[0]) out.contact = { email: emails[0], phone: phones[0] };
  emails.slice(1).forEach((v, i) => {
    c.unmapped[`${path}/DaneKontaktowe/Email[${i + 2}]`] = v;
  });
  phones.slice(1).forEach((v, i) => {
    c.unmapped[`${path}/DaneKontaktowe/Telefon[${i + 2}]`] = v;
  });
  for (const flag of ['JST', 'GV']) {
    const v = c.text(el, flag);
    if (v === '1') c.unmapped[`${path}/${flag}`] = v;
  }
  return out;
}

/** Stopka/Rejestry (footer register data) belong to the seller. */
function registers(c: Ctx, root: Element, seller: Seller): Identifier[] {
  const ids: Identifier[] = [];
  c.all(root, 'Stopka/Rejestry').forEach((r, i) => {
    const krs = c.text(r, 'KRS');
    if (krs && !seller.legalRegistrationId) seller.legalRegistrationId = { value: krs, schemeId: 'PL:KRS' };
    else if (krs) ids.push({ value: krs, schemeId: 'PL:KRS' });
    const regon = c.text(r, 'REGON');
    if (regon) ids.push({ value: regon, schemeId: 'PL:REGON' });
    const bdo = c.text(r, 'BDO');
    if (bdo) ids.push({ value: bdo, schemeId: 'PL:BDO' });
    const full = c.text(r, 'PelnaNazwa');
    if (full) c.unmapped[`/Faktura/Stopka/Rejestry[${i + 1}]/PelnaNazwa`] = full;
  });
  return ids;
}

// ---------------------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------------------

function exemptionText(c: Ctx, body: Element): string | undefined {
  if (c.text(body, 'Adnotacje/Zwolnienie/P_19') !== '1') return undefined;
  const parts = ['P_19A', 'P_19B', 'P_19C'].map((t) => c.text(body, `Adnotacje/Zwolnienie/${t}`)).filter(Boolean);
  return parts.length ? parts.join('; ') : undefined;
}

function stateOf(c: Ctx, r: Element, isCorrection: boolean, hasBefore: boolean): Line['correctionState'] {
  if (!isCorrection) return undefined;
  if (c.text(r, 'StanPrzed') === '1') return 'before';
  return hasBefore ? 'after' : 'delta';
}

function faLine(c: Ctx, r: Element, isCorrection: boolean, hasBefore: boolean, exemption: string | undefined, index: number): Line {
  const unitText = c.text(r, 'P_8A');
  const code = c.text(r, 'P_12');
  const xii = c.text(r, 'P_12_XII');
  let vat: VatInfo | undefined;
  if (code) {
    vat = vatFromRateCode(code, exemption);
    if (!vat) c.warn('PL-P12-UNKNOWN', `P_12 value "${code}" is not a known rate code; line VAT left empty`, '/Faktura/Fa/FaWiersz/P_12');
  } else if (xii) {
    vat = { categoryCode: 'S', rate: c.dec(r, 'P_12_XII'), nationalCode: 'PL:P_12_XII' };
  }
  let net = c.dec(r, 'P_11');
  const gross = c.dec(r, 'P_11A');
  const lineVat = c.dec(r, 'P_11Vat');
  const lineNo = c.text(r, 'NrWierszaFa') ?? '';
  if (net === undefined) {
    if (gross !== undefined && lineVat !== undefined) {
      net = sub(gross, lineVat);
      c.derive(`/lines/${index}/netAmount`, 'P_11A (gross) minus P_11Vat');
    } else if (gross !== undefined) {
      net = gross;
      c.warn(
        'PL-LINE-GROSS-ONLY',
        `Line ${lineNo} states only the gross value (P_11A); it is carried in netAmount unchanged`,
        '/Faktura/Fa/FaWiersz/P_11A',
      );
    } else {
      net = AMOUNT_ZERO as never;
      c.warn('PL-LINE-NO-VALUE', `Line ${lineNo} has no P_11 or P_11A; netAmount set to 0.00`, '/Faktura/Fa/FaWiersz');
    }
  }
  const priceNet = c.dec(r, 'P_9A');
  const priceGross = c.dec(r, 'P_9B');
  const discount = c.dec(r, 'P_10');
  const gtin = c.text(r, 'GTIN');
  const classifications: Line['item']['classifications'] = [];
  for (const [tag, listId] of [
    ['CN', 'PL:CN'],
    ['PKWiU', 'PL:PKWiU'],
    ['PKOB', 'PL:PKOB'],
  ] as const) {
    const v = c.text(r, tag);
    if (v) classifications.push({ code: v, listId });
  }
  const national: Record<string, string | string[]> = {};
  for (const tag of ['UU_ID', 'GTU', 'Procedura', 'P_6A', 'P_12_Zal_15', 'KwotaAkcyzy', 'KursWaluty', 'P_11Vat']) {
    const v = c.text(r, tag);
    if (v) national[tag] = v;
  }
  if (gross !== undefined && c.dec(r, 'P_11') !== undefined) national.P_11A = gross;
  if (priceGross !== undefined && priceNet !== undefined) national.P_9B = priceGross;
  return {
    id: lineNo,
    quantity: c.dec(r, 'P_8B'),
    unitCode: unitText ? UNITS[unitText.toLowerCase()] : undefined,
    unitText,
    netAmount: net,
    allowances: discount !== undefined ? [{ amount: discount, reason: 'P_10' }] : [],
    charges: [],
    price: priceNet !== undefined ? { net: priceNet, ...(priceGross !== undefined ? { gross: priceGross } : {}) } : undefined,
    vat,
    item: {
      name: c.text(r, 'P_7') ?? '',
      sellerId: c.text(r, 'Indeks'),
      standardId: gtin ? { value: gtin, schemeId: '0160' } : undefined,
      classifications,
      attributes: [],
    },
    correctionState: stateOf(c, r, isCorrection, hasBefore),
    national: Object.keys(national).length ? national : undefined,
  } as Line;
}

function rrLine(c: Ctx, r: Element, isCorrection: boolean, hasBefore: boolean, index: number): Line {
  const unitText = c.text(r, 'P_6A');
  const rate = c.text(r, 'P_9');
  const gtin = c.text(r, 'GTIN');
  const classifications: Line['item']['classifications'] = [];
  for (const [tag, listId] of [
    ['CN', 'PL:CN'],
    ['PKWiU', 'PL:PKWiU'],
  ] as const) {
    const v = c.text(r, tag);
    if (v) classifications.push({ code: v, listId });
  }
  const national: Record<string, string> = {};
  for (const tag of ['UU_ID', 'P_4AA', 'KursWaluty', 'P_10', 'P_11']) {
    const v = c.text(r, tag);
    if (v) national[tag === 'P_10' ? 'refundAmount' : tag === 'P_11' ? 'valueWithRefund' : tag] = v;
  }
  const priceNet = c.dec(r, 'P_7');
  const netAmount = c.dec(r, 'P_8');
  c.valueOrigins[`/lines/${index}/netAmount`] = netAmount === undefined ? 'defaulted' : 'source';
  return {
    id: c.text(r, 'NrWierszaFa') ?? '',
    quantity: c.dec(r, 'P_6B'),
    unitCode: unitText ? UNITS[unitText.toLowerCase()] : undefined,
    unitText,
    netAmount: netAmount ?? (AMOUNT_ZERO as never),
    allowances: [],
    charges: [],
    price: priceNet !== undefined ? { net: priceNet } : undefined,
    vat: rate ? { categoryCode: 'S', rate: c.dec(r, 'P_9'), nationalCode: `PL:RR:${rate}` } : undefined,
    item: {
      name: c.text(r, 'P_5') ?? '',
      description: c.text(r, 'P_6C'),
      standardId: gtin ? { value: gtin, schemeId: '0160' } : undefined,
      classifications,
      attributes: [],
    },
    correctionState: stateOf(c, r, isCorrection, hasBefore),
    national: Object.keys(national).length ? national : undefined,
  } as Line;
}

// ---------------------------------------------------------------------------------------
// Totals and VAT breakdown
// ---------------------------------------------------------------------------------------

type TotalsResult = { totals: Totals; vatBreakdown: VatBreakdown[]; taxCurrency: string | undefined; signedTotal: string };

function faTotals(c: Ctx, body: Element, lines: Line[], settlement: boolean, exemption: string | undefined): TotalsResult {
  const lineRates = (codes: string[]) => [
    ...new Set(lines.map((l) => l.vat?.nationalCode?.replace('PL:P_12:', '')).filter((x): x is string => !!x && codes.includes(x))),
  ];
  const xiiRates = [
    ...new Set(
      lines
        .filter((l) => l.vat?.nationalCode === 'PL:P_12_XII')
        .map((l) => l.vat?.rate)
        .filter(Boolean),
    ),
  ];
  const vatBreakdown: VatBreakdown[] = [];
  let anyW = false;
  const wAmounts: string[] = [];
  for (const b of BUCKETS) {
    const taxable = c.dec(body, b.n);
    if (taxable === undefined) continue;
    let taxAmount = b.tax ? c.dec(body, b.tax) : undefined;
    if (taxAmount === undefined) {
      taxAmount = AMOUNT_ZERO as never;
      if (b.tax) c.warn('PL-MISSING-TAX', `${b.n} is present without ${b.tax}; tax amount set to 0.00`);
    }
    const row: VatBreakdown = {
      taxableAmount: taxable,
      taxAmount: taxAmount as never,
      categoryCode: b.category,
      nationalCode: `PL:${b.code}`,
    };
    if (b.rates) {
      const found = lineRates(b.rates);
      if (found.length === 1) row.rate = found[0] as never;
      else c.warn('PL-RATE-UNKNOWN', `${b.n}: rate cannot be told apart (${b.rates.join(' or ')}) from the lines`, `/Faktura/Fa/${b.n}`);
    } else if (b.n === 'P_13_5') {
      if (xiiRates.length === 1) row.rate = xiiRates[0] as never;
    } else if (b.zeroRate) row.rate = '0' as never;
    if (b.category === 'E' && exemption) row.exemptionReason = exemption;
    const w = b.tax ? c.dec(body, `${b.tax}W`) : undefined;
    if (w !== undefined) {
      row.taxAmountInTaxCurrency = w;
      anyW = true;
      wAmounts.push(w);
    }
    vatBreakdown.push(row);
  }
  const taxExclusive = sum(vatBreakdown.map((v) => v.taxableAmount));
  const vatTotal = sum(vatBreakdown.map((v) => v.taxAmount));
  c.derive('/totals/lineNetTotal', 'sum of P_13_x (KSeF states no separate net total)');
  c.derive('/totals/taxExclusive', 'sum of P_13_x');
  c.derive('/totals/vatTotal', 'sum of P_14_x');
  const p15 = c.dec(body, 'P_15');
  if (p15 === undefined) throw new ParseError('Fa/P_15 missing');
  const totals: Totals = { lineNetTotal: taxExclusive, taxExclusive, vatTotal, taxInclusive: p15, payable: p15 };
  if (anyW) {
    totals.vatTotalInTaxCurrency = sum(wAmounts);
    c.derive('/totals/vatTotalInTaxCurrency', 'sum of P_14_xW');
  }
  if (settlement) {
    // P_15 is the amount left to pay after advances (art. 106f ust. 3); the lines and P_13/P_14 carry the full value.
    const full = add(taxExclusive, vatTotal);
    totals.taxInclusive = full;
    totals.prepaid = sub(full, p15);
    c.derive('/totals/taxInclusive', 'P_13_x + P_14_x: for settlement invoices P_15 is the amount remaining after advances');
    c.derive('/totals/prepaid', 'P_13_x + P_14_x minus P_15 (advance payments already made)');
  }
  return { totals, vatBreakdown, taxCurrency: anyW ? 'PLN' : undefined, signedTotal: p15 };
}

function rrTotals(c: Ctx, body: Element, lines: Line[]): TotalsResult {
  const net = c.dec(body, 'P_11_1');
  const refund = c.dec(body, 'P_11_2');
  const gross = c.dec(body, 'P_12_1');
  if (net === undefined || refund === undefined || gross === undefined)
    throw new ParseError('FakturaRR totals (P_11_1, P_11_2, P_12_1) missing');
  const refundW = c.dec(body, 'P_11_2W');
  for (const tag of ['P_11_1W', 'P_12_1W']) {
    const v = c.text(body, tag);
    if (v) c.unmapped[`/Faktura/FakturaRR/${tag}`] = v;
  }
  const words = c.text(body, 'P_12_2');
  if (words) c.unmapped['/Faktura/FakturaRR/P_12_2'] = words;
  const base = lines.filter((l) => l.correctionState === undefined || l.correctionState === 'delta');
  const rates = [...new Set(base.map((l) => l.vat?.rate).filter((r): r is NonNullable<typeof r> => !!r))];
  let vatBreakdown: VatBreakdown[];
  if (rates.length > 0 && base.every((l) => l.vat?.rate)) {
    vatBreakdown = rates.map((rate) => {
      const rows = base.filter((l) => l.vat?.rate === rate);
      const refunds = rows.map((l) => (l.national?.refundAmount as string | undefined) ?? '0');
      return {
        taxableAmount: sum(rows.map((l) => l.netAmount)),
        taxAmount: sum(refunds),
        categoryCode: 'S',
        rate,
        nationalCode: `PL:RR:${rate}`,
      } as VatBreakdown;
    });
    c.derive('/vatBreakdown', 'grouped by P_9 over the lines (FakturaRR has no per-rate totals)');
  } else {
    vatBreakdown = [{ taxableAmount: net, taxAmount: refund, categoryCode: 'S', nationalCode: 'PL:RR' } as VatBreakdown];
  }
  if (refundW !== undefined && vatBreakdown.length === 1) vatBreakdown[0].taxAmountInTaxCurrency = refundW;
  const totals: Totals = { lineNetTotal: net, taxExclusive: net, vatTotal: refund, taxInclusive: gross, payable: gross };
  if (refundW !== undefined) totals.vatTotalInTaxCurrency = refundW;
  return { totals, vatBreakdown, taxCurrency: refundW !== undefined ? 'PLN' : undefined, signedTotal: gross };
}

// ---------------------------------------------------------------------------------------
// Payment
// ---------------------------------------------------------------------------------------

function account(c: Ctx, a: Element): CreditTransfer {
  const nr = c.text(a, 'NrRB') ?? '';
  const bank = c.text(a, 'NazwaBanku');
  const own = c.text(a, 'RachunekWlasnyBanku');
  if (bank) c.unmapped[`/Faktura/Platnosc/RachunekBankowy[${nr}]/NazwaBanku`] = bank;
  if (own) c.unmapped[`/Faktura/Platnosc/RachunekBankowy[${nr}]/RachunekWlasnyBanku`] = own;
  return { accountId: nr, accountName: c.text(a, 'OpisRachunku'), serviceProviderId: c.text(a, 'SWIFT') };
}

function payment(c: Ctx, body: Element, isRR: boolean) {
  const pay = c.el(body, 'Platnosc');
  const payments: PaymentInstructions[] = [];
  const paymentSchedule: PaymentInstallment[] = [];
  let dueDate: ReturnType<Ctx['date']>;
  if (!pay) return { payments, paymentSchedule, dueDate };

  const forma = c.text(pay, 'FormaPlatnosci');
  const other = c.text(pay, 'PlatnoscInna') === '1';
  const desc = c.text(pay, 'OpisPlatnosci');
  const accounts = c.all(pay, isRR ? 'RachunekBankowy1' : 'RachunekBankowy').map((a) => account(c, a));
  if (isRR)
    c.all(pay, 'RachunekBankowy2').forEach((a, i) => {
      c.unmapped[`/Faktura/FakturaRR/Platnosc/RachunekBankowy2[${i + 1}]`] = c.text(a, 'NrRB') ?? '';
    });
  let means: PaymentInstructions | undefined;
  if (other) {
    means = { meansCode: 'ZZZ', meansText: desc, creditTransfers: accounts };
  } else if (forma) {
    const [code, text] = PAYMENT_MEANS[forma] ?? ['ZZZ', `FormaPlatnosci ${forma}`];
    means = { meansCode: code, meansText: text, nationalMeansCode: forma, creditTransfers: accounts };
  } else if (accounts.length) {
    means = { meansCode: '30', creditTransfers: accounts };
    c.derive('/payments/0/meansCode', 'credit transfer (30): the invoice names a bank account but no FormaPlatnosci');
  }
  if (means) payments.push(means);
  const factorAccounts = c.all(pay, 'RachunekBankowyFaktora').map((a) => account(c, a));
  if (factorAccounts.length) payments.push({ meansCode: '30', meansText: 'Rachunek faktora', creditTransfers: factorAccounts });

  const terms = c.all(pay, 'TerminPlatnosci').map((t): PaymentInstallment => {
    const termin = c.date(t, 'Termin', 'Termin');
    const opis = c.el(t, 'TerminOpis');
    const description = opis
      ? [c.text(opis, 'Ilosc'), c.text(opis, 'Jednostka'), c.text(opis, 'ZdarzeniePoczatkowe')].filter(Boolean).join(' ')
      : undefined;
    return { ...(termin ? { dueDate: termin } : {}), ...(description ? { description } : {}) };
  });
  if (terms.length === 1 && terms[0].dueDate && !terms[0].description) dueDate = terms[0].dueDate;
  else paymentSchedule.push(...terms);

  for (const tag of ['LinkDoPlatnosci', 'IPKSeF']) {
    const v = c.text(pay, tag);
    if (v) c.unmapped[`/Faktura/${bodyName(isRR)}/Platnosc/${tag}`] = v;
  }
  dump(c, c.el(pay, 'Skonto'), `/Faktura/${bodyName(isRR)}/Platnosc/Skonto`);
  c.all(pay, 'ZaplataCzesciowa').forEach((z, i) => {
    dump(c, z, `/Faktura/${bodyName(isRR)}/Platnosc/ZaplataCzesciowa[${i + 1}]`);
  });
  const mark = c.text(pay, 'ZnacznikZaplatyCzesciowej');
  if (mark) c.unmapped[`/Faktura/${bodyName(isRR)}/Platnosc/ZnacznikZaplatyCzesciowej`] = mark;
  return { payments, paymentSchedule, dueDate };
}

/** Rozliczenie: DoZaplaty is the amount to pay after charges and deductions; DoRozliczenia an overpayment. */
function settlement_(c: Ctx, body: Element, totals: Totals, isRR: boolean): Decimal | undefined {
  const r = c.el(body, 'Rozliczenie');
  if (!r) return undefined;
  const base = `/Faktura/${bodyName(isRR)}/Rozliczenie`;
  c.all(r, 'Obciazenia').forEach((o, i) => {
    dump(c, o, `${base}/Obciazenia[${i + 1}]`);
  });
  c.all(r, 'Odliczenia').forEach((o, i) => {
    dump(c, o, `${base}/Odliczenia[${i + 1}]`);
  });
  const due = c.dec(r, 'DoZaplaty');
  const over = c.dec(r, 'DoRozliczenia');
  const computed = sub(totals.taxInclusive, totals.prepaid ?? '0');
  if (due !== undefined) {
    if (cmp(due, computed) !== 0) {
      c.warn(
        'PL-SETTLEMENT',
        `DoZaplaty ${due} differs from the invoice total less advances (${computed}) because of Obciazenia/Odliczenia; the stated amount to pay is used`,
        `${base}/DoZaplaty`,
      );
    }
    return due;
  }
  if (over !== undefined && !isZero(over)) {
    c.derive('/totals/payable', 'negative DoRozliczenia: overpayment to be settled or refunded to the buyer');
    return neg(over);
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------
// Extensions, helpers
// ---------------------------------------------------------------------------------------

function extensions(
  c: Ctx,
  root: Element,
  body: Element,
  isRR: boolean,
  kindCode: string,
  schemaVariant: string | undefined,
  selfBilled: boolean,
): PlExtension {
  const ext: PlExtension = { invoiceKind: kindCode, schemaVariant };
  if (!isRR) {
    const flag = (tag: string) => c.text(body, `Adnotacje/${tag}`) === '1';
    if (flag('P_16')) ext.cashAccounting = true;
    if (selfBilled) ext.selfBilling = true;
    if (flag('P_18')) ext.reverseCharge = true;
    if (flag('P_18A')) ext.splitPayment = true;
    const basis = exemptionText(c, body);
    if (basis) ext.exemptionBasis = basis;
    if (flag('PMarzy/P_PMarzy')) {
      const kinds: [string, string][] = [
        ['P_PMarzy_2', 'travel-agent'],
        ['P_PMarzy_3_1', 'used-goods'],
        ['P_PMarzy_3_2', 'works-of-art'],
        ['P_PMarzy_3_3', 'collectors-items-antiques'],
      ];
      ext.marginScheme =
        kinds
          .filter(([t]) => flag(`PMarzy/${t}`))
          .map(([, k]) => k)
          .join(',') || 'margin';
    }
    if (c.text(root, 'Podmiot2/JST') === '1') ext.buyerIsLocalGovernmentUnit = true;
    if (c.text(root, 'Podmiot2/GV') === '1') ext.buyerIsVatGroupMember = true;
  }
  const pay = c.el(body, 'Platnosc');
  if (pay && c.text(pay, 'Zaplacono') === '1') {
    ext.paid = true;
    const d = c.date(pay, 'DataZaplaty', 'DataZaplaty');
    if (d) ext.paidDate = d;
  }
  return ext;
}

/** Records every leaf below `el` in `unmapped`, keyed by XPath. */
function dump(c: Ctx, el: Element | undefined, path: string): void {
  if (!el) return;
  const kids: Element[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) kids.push(n as Element);
  if (kids.length === 0) {
    const t = el.textContent?.trim();
    if (t) c.unmapped[path] = t;
    return;
  }
  const seen = new Map<string, number>();
  const total = new Map<string, number>();
  for (const k of kids) total.set(k.localName ?? '', (total.get(k.localName ?? '') ?? 0) + 1);
  for (const k of kids) {
    const name = k.localName ?? '';
    const i = (seen.get(name) ?? 0) + 1;
    seen.set(name, i);
    dump(c, k, `${path}/${name}${(total.get(name) ?? 1) > 1 ? `[${i}]` : ''}`);
  }
}

/** Reduction corrections become credit notes with positive magnitudes, so effectiveSign() posts them negative. */
function negateForReduction(c: Ctx, inv: CanonicalInvoice): void {
  const n = (v: string | undefined) => (v === undefined ? undefined : (neg(v) as never));
  const t = inv.totals;
  t.lineNetTotal = n(t.lineNetTotal)!;
  t.taxExclusive = n(t.taxExclusive)!;
  t.vatTotal = n(t.vatTotal);
  t.vatTotalInTaxCurrency = n(t.vatTotalInTaxCurrency);
  t.taxInclusive = n(t.taxInclusive)!;
  t.prepaid = n(t.prepaid);
  t.payable = n(t.payable)!;
  for (const v of inv.vatBreakdown) {
    v.taxableAmount = n(v.taxableAmount)!;
    v.taxAmount = n(v.taxAmount)!;
    v.taxAmountInTaxCurrency = n(v.taxAmountInTaxCurrency);
  }
  for (const l of inv.lines) {
    if (l.correctionState === 'before' || l.correctionState === 'after') continue;
    l.netAmount = n(l.netAmount)!;
    l.quantity = n(l.quantity);
    for (const a of l.allowances) a.amount = n(a.amount)!;
  }
  c.derive(
    '/totals',
    'reduction correction: totals, VAT breakdown and delta lines negated to positive magnitudes, direction carried by kind=creditNote',
  );
}
