/**
 * FatturaPA 1.2.x (FPR12 / FPA12) and FatturaPA semplificata (FSM10) -> canonical.
 *
 * Child elements are unqualified (no namespace), so every lookup is by local name.
 * A file can hold several FatturaElettronicaBody (a "lotto"): one canonical invoice per body,
 * each with `source.indexInFile` and `source.fragmentPath`.
 *
 * Mapping notes
 * - Natura (N1..N7 with sub-codes) -> VAT category; the code itself stays in `nationalCode`.
 * - DatiRitenuta (RT01..RT06) -> `withholdings`; DatiCassaPrevidenziale -> a charge plus
 *   `extensions.it.pensionFunds`; DatiBollo -> `otherTaxes` plus `extensions.it.stampDuty`.
 * - EsigibilitaIVA = S (split payment) -> `totals.splitPaymentVat`; the VAT stays in `vatTotal`.
 * - taxExclusive and vatTotal are the sums of DatiRiepilogo; taxInclusive is their sum (derived);
 *   payable is ImportoTotaleDocumento less withholdings and split-payment VAT.
 * - FSM10 states one VAT-inclusive Importo per goods/services block: the net amount is Importo
 *   minus Imposta (derived).
 */
import type { Element } from '@xmldom/xmldom';
import type {
  Address,
  AllowanceCharge,
  Attachment,
  CanonicalInvoice,
  Decimal,
  Identifier,
  ItExtension,
  Line,
  Party,
  PaymentInstallment,
  PaymentInstructions,
  Seller,
  Totals,
  VatBreakdown,
  VatInfo,
  Withholding,
} from '../canonical.js';
import { add, cmp, isZero, sub, sum } from '../values.js';
import { Ctx, finish, ParseError, parseXml, sourceMeta } from './context.js';
import type { ParseInput } from './index.js';

interface DocType {
  typeCode: string;
  credit: boolean;
  selfBilled: boolean;
  label: string;
}

const T = (typeCode: string, label: string, opts: { credit?: boolean; selfBilled?: boolean } = {}): DocType => ({
  typeCode,
  label,
  credit: opts.credit ?? false,
  selfBilled: opts.selfBilled ?? false,
});

/** TipoDocumento -> UNCL 1001. TD04 and TD08 are credit notes; the buyer-issued integrations and self-invoices map to 389. */
const DOC_TYPES: Record<string, DocType> = {
  TD01: T('380', 'Fattura'),
  TD02: T('386', 'Acconto/anticipo su fattura'),
  TD03: T('386', 'Acconto/anticipo su parcella'),
  TD04: T('381', 'Nota di credito', { credit: true }),
  TD05: T('383', 'Nota di debito'),
  TD06: T('380', 'Parcella'),
  TD07: T('380', 'Fattura semplificata'),
  TD08: T('381', 'Nota di credito semplificata', { credit: true }),
  TD09: T('383', 'Nota di debito semplificata'),
  TD16: T('389', 'Integrazione fattura reverse charge interno', { selfBilled: true }),
  TD17: T('389', "Integrazione/autofattura per acquisto servizi dall'estero", { selfBilled: true }),
  TD18: T('389', 'Integrazione per acquisto di beni intracomunitari', { selfBilled: true }),
  TD19: T('389', 'Integrazione/autofattura per acquisto di beni ex art. 17 c.2 DPR 633/72', { selfBilled: true }),
  TD20: T('389', 'Autofattura per regolarizzazione e integrazione delle fatture', { selfBilled: true }),
  TD21: T('389', 'Autofattura per splafonamento', { selfBilled: true }),
  TD22: T('389', 'Estrazione beni da Deposito IVA', { selfBilled: true }),
  TD23: T('389', 'Estrazione beni da Deposito IVA con versamento IVA', { selfBilled: true }),
  TD24: T('380', 'Fattura differita ex art. 21 c.4 lett. a)'),
  TD25: T('380', 'Fattura differita ex art. 21 c.4 terzo periodo lett. b)'),
  TD26: T('380', 'Cessione di beni ammortizzabili e passaggi interni'),
  TD27: T('389', 'Fattura per autoconsumo o cessioni gratuite senza rivalsa', { selfBilled: true }),
  TD28: T('389', 'Acquisti da San Marino con IVA', { selfBilled: true }),
};

/** Natura -> UNCL 5305. Sub-codes fall back to their group (N6.3 -> N6). */
const NATURA: Record<string, string> = {
  N1: 'O', // escluse ex art. 15
  N2: 'O',
  'N2.1': 'O',
  'N2.2': 'O', // non soggette
  N3: 'Z',
  'N3.1': 'G',
  'N3.2': 'K',
  'N3.3': 'G',
  'N3.4': 'G',
  'N3.5': 'Z',
  'N3.6': 'Z', // non imponibili
  N4: 'E', // esenti
  N5: 'E', // regime del margine
  N6: 'AE', // reverse charge (N6.1 .. N6.9)
  N7: 'O', // IVA assolta in altro stato UE
};

/** ModalitaPagamento -> UNCL 4461 (ZZZ where there is no equivalent), with the Italian label kept in meansText for those. */
const PAYMENT_MEANS: Record<string, [code: string, label: string]> = {
  MP01: ['10', 'Contanti'],
  MP02: ['20', 'Assegno'],
  MP03: ['23', 'Assegno circolare'],
  MP04: ['10', 'Contanti presso Tesoreria'],
  MP05: ['30', 'Bonifico'],
  MP06: ['60', 'Vaglia cambiario'],
  MP07: ['ZZZ', 'Bollettino bancario'],
  MP08: ['48', 'Carta di pagamento'],
  MP09: ['49', 'RID'],
  MP10: ['49', 'RID utenze'],
  MP11: ['49', 'RID veloce'],
  MP12: ['49', 'RIBA'],
  MP13: ['ZZZ', 'MAV'],
  MP14: ['ZZZ', 'Quietanza erario'],
  MP15: ['30', 'Giroconto su conti di contabilità speciale'],
  MP16: ['49', 'Domiciliazione bancaria'],
  MP17: ['49', 'Domiciliazione postale'],
  MP18: ['ZZZ', 'Bollettino di c/c postale'],
  MP19: ['59', 'SEPA Direct Debit'],
  MP20: ['59', 'SEPA Direct Debit CORE'],
  MP21: ['59', 'SEPA Direct Debit B2B'],
  MP22: ['ZZZ', 'Trattenuta su somme già riscosse'],
  MP23: ['ZZZ', 'PagoPA'],
};

const PAYMENT_TERMS: Record<string, string> = { TP01: 'Pagamento a rate', TP02: 'Pagamento completo', TP03: 'Anticipo' };

const MIME: Record<string, string> = {
  PDF: 'application/pdf',
  XML: 'application/xml',
  JPG: 'image/jpeg',
  JPEG: 'image/jpeg',
  PNG: 'image/png',
  TXT: 'text/plain',
  CSV: 'text/csv',
  TIF: 'image/tiff',
  TIFF: 'image/tiff',
};

export function parseFatturaPa(input: ParseInput): CanonicalInvoice[] {
  const root = parseXml(input.payload.xml);
  const simplified = root.localName === 'FatturaElettronicaSemplificata';
  const probe = new Ctx({});
  const bodies = probe.all(root, 'FatturaElettronicaBody');
  if (bodies.length === 0) throw new ParseError('No FatturaElettronicaBody in the file');
  return bodies.map((body, i) => {
    const c = new Ctx({});
    const fragmentPath = `/${root.localName}/FatturaElettronicaBody[${i + 1}]`;
    const inv = simplified ? parseSimplifiedBody(c, root, body, fragmentPath) : parseBody(c, root, body, fragmentPath);
    inv.specificationId = `fatturapa:${root.getAttribute('versione') || input.details.version || ''}`;
    inv.source = sourceMeta(input, root, c, {
      formatVersion: root.getAttribute('versione') || input.details.version,
      specificationId: `fatturapa:${root.getAttribute('versione') || input.details.version || ''}`,
      indexInFile: i,
      fragmentPath,
    });
    return finish(inv);
  });
}

// ---------------------------------------------------------------------------
// FPR12 / FPA12
// ---------------------------------------------------------------------------

function parseBody(c: Ctx, root: Element, body: Element, frag: string): CanonicalInvoice {
  const header = c.el(root, 'FatturaElettronicaHeader');
  const dg = c.el(body, 'DatiGenerali/DatiGeneraliDocumento');
  const id = c.text(dg, 'Numero');
  const issueDate = c.date(dg, 'Data', 'BT-2');
  if (!dg || !id || !issueDate) throw new ParseError('Invoice number (Numero) or date (Data) missing');
  const currency = c.text(dg, 'Divisa');
  if (!currency) throw new ParseError('Currency (Divisa) missing');
  const docType = documentType(c, c.text(dg, 'TipoDocumento'));

  unmapAll(c, header, '/FatturaElettronica/FatturaElettronicaHeader', [
    'DatiTrasmissione/IdTrasmittente',
    'DatiTrasmissione/ContattiTrasmittente',
    'CedentePrestatore/StabileOrganizzazione',
    'CedentePrestatore/RiferimentoAmministrazione',
    'CessionarioCommittente/StabileOrganizzazione',
  ]);
  unmapAll(c, body, frag, [
    'DatiGenerali/DatiSAL',
    'DatiGenerali/DatiTrasporto',
    'DatiGenerali/FatturaPrincipale',
    'DatiGenerali/DatiConvenzione',
    'DatiVeicoli',
  ]);

  const seller = party(c, c.el(header, 'CedentePrestatore/DatiAnagrafici'), c.el(header, 'CedentePrestatore/Sede')) as Seller;
  const sellerEl = c.el(header, 'CedentePrestatore');
  const rea = c.el(sellerEl, 'IscrizioneREA');
  if (rea) {
    const office = c.text(rea, 'Ufficio');
    const number = c.text(rea, 'NumeroREA');
    if (number) seller.legalRegistrationId = { value: office ? `${office}-${number}` : number, schemeId: 'IT:REA' };
    const info = [
      c.text(rea, 'CapitaleSociale') && `Capitale sociale ${c.text(rea, 'CapitaleSociale')}`,
      c.text(rea, 'SocioUnico') && `Socio unico: ${c.text(rea, 'SocioUnico')}`,
      c.text(rea, 'StatoLiquidazione') && `Stato liquidazione: ${c.text(rea, 'StatoLiquidazione')}`,
    ].filter(Boolean);
    if (info.length) seller.additionalLegalInfo = info.join('; ');
  }
  const contatti = c.el(sellerEl, 'Contatti');
  if (contatti) seller.contact = { phone: c.text(contatti, 'Telefono'), email: c.text(contatti, 'Email') };
  const buyer = party(c, c.el(header, 'CessionarioCommittente/DatiAnagrafici'), c.el(header, 'CessionarioCommittente/Sede'));

  const additionalParties: CanonicalInvoice['additionalParties'] = [];
  const buyerRep = c.el(header, 'CessionarioCommittente/RappresentanteFiscale');
  if (buyerRep)
    additionalParties.push({
      role: 'buyer-tax-representative',
      sourceRole: 'IT:CessionarioCommittente/RappresentanteFiscale',
      party: party(c, buyerRep, undefined),
    });
  const emitter = c.text(header, 'SoggettoEmittente');
  const third = c.el(header, 'TerzoIntermediarioOSoggettoEmittente/DatiAnagrafici');
  if (third) {
    additionalParties.push({
      role: emitter === 'TZ' ? 'issuer' : 'intermediary',
      sourceRole: emitter ? `IT:SoggettoEmittente:${emitter}` : 'IT:TerzoIntermediarioOSoggettoEmittente',
      party: party(c, third, undefined),
    });
  }
  const repEl = c.el(header, 'RappresentanteFiscale/DatiAnagrafici') ?? c.el(sellerEl, 'RappresentanteFiscale/DatiAnagrafici');
  const rep = repEl ? party(c, repEl, undefined) : undefined;

  // Lines and VAT
  const lines = c.all(body, 'DatiBeniServizi/DettaglioLinee').map((l) => line(c, l));
  const summaries = c.all(body, 'DatiBeniServizi/DatiRiepilogo');
  if (summaries.length === 0) throw new ParseError('DatiRiepilogo (VAT summary) missing');
  const vatBreakdown = summaries.map((s) => summary(c, s));
  const splitVat = summaries.filter((s) => c.text(s, 'EsigibilitaIVA') === 'S').map((s) => c.dec(s, 'Imposta') ?? ('0' as Decimal));
  const chargeabilities = new Set(summaries.map((s) => c.text(s, 'EsigibilitaIVA')).filter(Boolean));
  if (chargeabilities.size > 1)
    c.warn(
      'IT_MIXED_ESIGIBILITA',
      `DatiRiepilogo mixes EsigibilitaIVA values (${[...chargeabilities].join(', ')}); extensions.it.vatChargeability left unset`,
    );

  // Allowances and charges
  const allowances: AllowanceCharge[] = [];
  const charges: AllowanceCharge[] = [];
  c.all(dg, 'ScontoMaggiorazione').forEach((s, n) => {
    const amount = c.dec(s, 'Importo');
    const percentage = c.dec(s, 'Percentuale');
    if (amount === undefined) {
      c.unmapped[`${frag}/DatiGenerali/DatiGeneraliDocumento/ScontoMaggiorazione[${n + 1}]`] =
        `${c.text(s, 'Tipo') ?? ''} ${percentage ?? ''}%`.trim();
      c.warn(
        'IT_DISCOUNT_WITHOUT_AMOUNT',
        'Document-level ScontoMaggiorazione has no Importo; amount not derived',
        `${frag}/DatiGenerali/DatiGeneraliDocumento/ScontoMaggiorazione`,
      );
      return;
    }
    (c.text(s, 'Tipo') === 'MG' ? charges : allowances).push({ amount, percentage });
  });
  const pensionFunds: NonNullable<ItExtension['pensionFunds']> = [];
  for (const k of c.all(dg, 'DatiCassaPrevidenziale')) {
    const amount = c.dec(k, 'ImportoContributoCassa');
    if (amount === undefined) throw new ParseError('DatiCassaPrevidenziale without ImportoContributoCassa');
    const type = c.text(k, 'TipoCassa') ?? '';
    const natura = c.text(k, 'Natura');
    const rate = c.dec(k, 'AliquotaIVA');
    const taxable = c.dec(k, 'ImponibileCassa');
    charges.push({
      amount,
      baseAmount: taxable,
      percentage: c.dec(k, 'AlCassa'),
      reason: `Cassa previdenziale ${type}`.trim(),
      vat: { categoryCode: vatCategory(c, rate, natura), rate, nationalCode: natura ? `IT:${natura}` : undefined },
    });
    pensionFunds.push({
      type,
      rate: c.dec(k, 'AlCassa'),
      amount,
      taxableAmount: taxable,
      vatRate: rate,
      subjectToWithholding: c.text(k, 'Ritenuta') ? c.text(k, 'Ritenuta') === 'SI' : undefined,
      nature: natura,
    });
  }
  summaries.forEach((s) => {
    const spese = c.dec(s, 'SpeseAccessorie');
    if (spese === undefined || isZero(spese)) return;
    const rate = c.dec(s, 'AliquotaIVA');
    const natura = c.text(s, 'Natura');
    charges.push({
      amount: spese,
      reason: 'Spese accessorie',
      vat: { categoryCode: vatCategory(c, rate, natura), rate, nationalCode: natura ? `IT:${natura}` : undefined },
    });
  });

  // Withholdings and stamp duty
  const withholdings: Withholding[] = c.all(dg, 'DatiRitenuta').map((r) => {
    const amount = c.dec(r, 'ImportoRitenuta');
    if (amount === undefined) throw new ParseError('DatiRitenuta without ImportoRitenuta');
    return {
      scheme: `IT:${c.text(r, 'TipoRitenuta') ?? 'RT'}`,
      rate: c.dec(r, 'AliquotaRitenuta'),
      amount,
      reasonCode: c.text(r, 'CausalePagamento'),
    };
  });
  const bollo = c.el(dg, 'DatiBollo');
  const stamp = bollo ? c.dec(bollo, 'ImportoBollo') : undefined;

  // Totals
  const lineNetTotal = sum(lines.map((l) => l.netAmount));
  const taxExclusive = sum(vatBreakdown.map((v) => v.taxableAmount));
  const vatTotal = sum(vatBreakdown.map((v) => v.taxAmount));
  const taxInclusive = add(taxExclusive, vatTotal);
  c.derive('/totals/taxExclusive', 'sum of DatiRiepilogo/ImponibileImporto');
  c.derive('/totals/vatTotal', 'sum of DatiRiepilogo/Imposta');
  c.derive('/totals/taxInclusive', 'taxExclusive + vatTotal (FatturaPA states only ImportoTotaleDocumento)');
  const rounding = c.dec(dg, 'Arrotondamento');
  const docTotal = c.dec(dg, 'ImportoTotaleDocumento');
  const withholdingTotal = withholdings.length ? sum(withholdings.map((w) => w.amount)) : undefined;
  const splitPaymentVat = splitVat.length ? sum(splitVat) : undefined;
  const gross = docTotal ?? add(taxInclusive, rounding ?? '0');
  if (docTotal === undefined)
    c.derive('/totals/payable', 'taxInclusive + Arrotondamento - withholdings - split-payment VAT (ImportoTotaleDocumento absent)');
  const payable = sub(sub(gross, withholdingTotal ?? '0'), splitPaymentVat ?? '0');
  const totals: Totals = {
    lineNetTotal,
    allowanceTotal: allowances.length ? sum(allowances.map((a) => a.amount)) : undefined,
    chargeTotal: charges.length ? sum(charges.map((a) => a.amount)) : undefined,
    taxExclusive,
    vatTotal,
    taxInclusive,
    rounding,
    withholdingTotal,
    splitPaymentVat,
    payable,
  };

  const otherTaxes: CanonicalInvoice['otherTaxes'] = [];
  if (bollo && stamp !== undefined) {
    // Bollo charged to the buyer normally travels as an N1 line, so it is already in the VAT base. When
    // ImportoTotaleDocumento exceeds the VAT-inclusive total by exactly the stamp, it is on top.
    const extra = docTotal !== undefined && !isZero(stamp) && cmp(sub(docTotal, add(taxInclusive, rounding ?? '0')), stamp) === 0;
    if (extra)
      c.warn(
        'IT_BOLLO_ON_TOP',
        'ImportoTotaleDocumento includes the stamp duty on top of the VAT-inclusive total; taxInclusive excludes it',
      );
    otherTaxes.push({ scheme: 'IT:BOLLO', amount: stamp, includedInTotal: !extra, inTaxExclusive: !extra });
  }

  const orders = c.all(body, 'DatiGenerali/DatiOrdineAcquisto');
  const contracts = c.all(body, 'DatiGenerali/DatiContratto');
  const it: ItExtension = {
    transmissionFormat: c.text(header, 'DatiTrasmissione/FormatoTrasmissione') ?? root.getAttribute('versione') ?? undefined,
    recipientCode: c.text(header, 'DatiTrasmissione/CodiceDestinatario'),
    recipientPec: c.text(header, 'DatiTrasmissione/PECDestinatario'),
    transmissionSequence: c.text(header, 'DatiTrasmissione/ProgressivoInvio'),
    taxRegime: c.text(c.el(header, 'CedentePrestatore/DatiAnagrafici'), 'RegimeFiscale'),
    vatChargeability: chargeabilities.size === 1 ? [...chargeabilities][0] : undefined,
    stampDuty: bollo ? { virtual: c.text(bollo, 'BolloVirtuale') === 'SI', amount: stamp } : undefined,
    pensionFunds: pensionFunds.length ? pensionFunds : undefined,
    cup: [...orders, ...contracts].map((e) => c.text(e, 'CodiceCUP')).find(Boolean),
    cig: [...orders, ...contracts].map((e) => c.text(e, 'CodiceCIG')).find(Boolean),
    reasons: c.texts(dg, 'Causale').length ? c.texts(dg, 'Causale') : undefined,
    art73: c.text(dg, 'Art73') ? c.text(dg, 'Art73') === 'SI' : undefined,
  };

  const { payments, schedule, dueDate } = paymentData(c, body, frag);
  const terms = c.texts(body, 'DatiPagamento/CondizioniPagamento').map((t) => `${t}: ${PAYMENT_TERMS[t] ?? t}`);
  const idRef = (els: Element[]) => els.map((e) => c.text(e, 'IdDocumento')).find(Boolean);

  const inv = {
    kind: docType.credit ? 'creditNote' : 'invoice',
    typeCode: docType.typeCode,
    id,
    issueDate,
    nationalType: { scheme: 'IT:TipoDocumento', code: c.text(dg, 'TipoDocumento') ?? '', label: docType.label },
    selfBilled: docType.selfBilled || emitter === 'CC',
    currency,
    dueDate,
    purchaseOrderRef: idRef(orders),
    contractRef: idRef(contracts),
    receivingAdviceRef: idRef(c.all(body, 'DatiGenerali/DatiRicezione')),
    despatchAdviceRef: c
      .all(body, 'DatiGenerali/DatiDDT')
      .map((e) => c.text(e, 'NumeroDDT'))
      .find(Boolean),
    paymentTerms: terms.length ? terms.join('; ') : undefined,
    notes: [],
    specificationId: '',
    precedingInvoices: c.all(body, 'DatiGenerali/DatiFattureCollegate').map((r) => ({
      id: c.text(r, 'IdDocumento') ?? '',
      issueDate: c.date(r, 'Data', 'BT-26'),
    })),
    seller,
    buyer,
    taxRepresentative: rep ? { name: rep.name ?? '', vatId: rep.vatId ?? '', address: {} } : undefined,
    additionalParties,
    payments,
    paymentSchedule: schedule,
    allowances,
    charges,
    totals,
    vatBreakdown,
    otherTaxes,
    withholdings,
    attachments: c.all(body, 'Allegati').map((a) => attachment(c, a)),
    lines,
    clearance: [],
    extensions: { it },
    source: undefined,
  } as unknown as CanonicalInvoice;
  return inv;
}

function documentType(c: Ctx, code: string | undefined): DocType {
  const known = code ? DOC_TYPES[code] : undefined;
  if (known) return known;
  c.warn('IT_UNKNOWN_TIPODOCUMENTO', `TipoDocumento "${code ?? ''}" is not in the known list; treated as invoice (380)`);
  return T('380', code ?? '');
}

function unmapAll(c: Ctx, parent: Element | undefined, base: string, paths: string[]) {
  for (const p of paths) {
    c.all(parent, p).forEach((e, n) => {
      const flat = flatten(e);
      if (flat) c.unmapped[`${base}/${p}${n ? `[${n + 1}]` : ''}`] = flat;
    });
  }
}

/** "Name: value; Name: value" over the leaf elements below `e`. */
function flatten(e: Element): string {
  const out: string[] = [];
  const walk = (n: Element) => {
    let hasChild = false;
    for (let ch = n.firstChild; ch; ch = ch.nextSibling) {
      if (ch.nodeType === 1) {
        hasChild = true;
        walk(ch as Element);
      }
    }
    const t = n.textContent?.trim();
    if (!hasChild && t) out.push(n === e ? t : `${n.localName}: ${t}`);
  };
  walk(e);
  return out.join('; ');
}

function nameOf(c: Ctx, el: Element | undefined): string | undefined {
  const a = c.el(el, 'Anagrafica') ?? el;
  const denom = c.text(a, 'Denominazione');
  if (denom) return denom;
  const person = [c.text(a, 'Nome'), c.text(a, 'Cognome')].filter(Boolean).join(' ');
  return person || undefined;
}

/** `ids` holds IdFiscaleIVA / CodiceFiscale / Anagrafica (DatiAnagrafici in FPR12, the party element itself in FSM10). */
function party(c: Ctx, ids: Element | undefined, sede: Element | undefined, nameEl: Element | undefined = ids): Party {
  const vat = c.el(ids, 'IdFiscaleIVA');
  const vatId = vat ? `${c.text(vat, 'IdPaese') ?? ''}${c.text(vat, 'IdCodice') ?? ''}` : undefined;
  const cf = c.text(ids, 'CodiceFiscale');
  const eori = c.text(c.el(ids, 'Anagrafica'), 'CodEORI');
  const identifiers: Identifier[] = eori ? [{ value: eori, schemeId: 'EORI' }] : [];
  return {
    name: nameOf(c, nameEl),
    identifiers,
    vatId: vatId || undefined,
    nationalTaxIds: cf ? [{ value: cf, schemeId: 'IT:CF' }] : [],
    address: address(c, sede),
  };
}

function address(c: Ctx, s: Element | undefined): Address | undefined {
  if (!s) return undefined;
  const line1 = [c.text(s, 'Indirizzo'), c.text(s, 'NumeroCivico')].filter(Boolean).join(', ');
  return {
    line1: line1 || undefined,
    city: c.text(s, 'Comune'),
    postalCode: c.text(s, 'CAP'),
    countrySubdivision: c.text(s, 'Provincia'),
    countryCode: c.text(s, 'Nazione'),
  };
}

function vatCategory(c: Ctx, rate: string | undefined, natura: string | undefined): string {
  if (natura) {
    const cat = NATURA[natura] ?? NATURA[natura.split('.')[0]];
    if (cat) return cat;
    c.warn('IT_UNKNOWN_NATURA', `Natura "${natura}" is not a known code; category set to O`);
    return 'O';
  }
  if (rate !== undefined && isZero(rate)) {
    noteDerived(c, 'zero rate without Natura -> category Z');
    return 'Z';
  }
  return 'S';
}

function noteDerived(c: Ctx, rule: string) {
  if (!c.derived.some((d) => d.field === '/vatCategory' && d.rule === rule)) c.derive('/vatCategory', rule);
}

function vatInfo(c: Ctx, rate: Decimal | undefined, natura: string | undefined, reference?: string): VatInfo {
  return {
    categoryCode: vatCategory(c, rate, natura),
    rate,
    nationalCode: natura ? `IT:${natura}` : undefined,
    exemptionReason: reference,
  };
}

function summary(c: Ctx, s: Element): VatBreakdown {
  const taxableAmount = c.dec(s, 'ImponibileImporto');
  const taxAmount = c.dec(s, 'Imposta');
  if (taxableAmount === undefined || taxAmount === undefined) throw new ParseError('DatiRiepilogo without ImponibileImporto or Imposta');
  const rate = c.dec(s, 'AliquotaIVA');
  const natura = c.text(s, 'Natura');
  return {
    taxableAmount,
    taxAmount,
    categoryCode: vatCategory(c, rate, natura),
    rate,
    exemptionReason: c.text(s, 'RiferimentoNormativo'),
    nationalCode: natura ? `IT:${natura}` : undefined,
  };
}

function line(c: Ctx, l: Element): Line {
  const no = c.text(l, 'NumeroLinea') ?? '';
  const netAmount = c.dec(l, 'PrezzoTotale');
  if (netAmount === undefined) throw new ParseError(`Line ${no || '?'}: PrezzoTotale missing`);
  const rate = c.dec(l, 'AliquotaIVA');
  const natura = c.text(l, 'Natura');
  const unitPrice = c.dec(l, 'PrezzoUnitario');
  const national: Record<string, string | string[]> = {};
  const tipoCessione = c.text(l, 'TipoCessionePrestazione');
  if (tipoCessione) national.TipoCessionePrestazione = tipoCessione;
  for (const a of c.all(l, 'AltriDatiGestionali')) {
    const key = c.text(a, 'TipoDato') ?? 'AltriDatiGestionali';
    const value = [c.text(a, 'RiferimentoTesto'), c.text(a, 'RiferimentoNumero'), c.text(a, 'RiferimentoData')].filter(Boolean).join(' ');
    if (!value) continue;
    const prev = national[key];
    national[key] = prev === undefined ? value : Array.isArray(prev) ? [...prev, value] : [prev, value];
  }
  const allowances: AllowanceCharge[] = [];
  const charges: AllowanceCharge[] = [];
  const unstructured: string[] = [];
  for (const s of c.all(l, 'ScontoMaggiorazione')) {
    const tipo = c.text(s, 'Tipo') ?? '';
    const amount = c.dec(s, 'Importo');
    const percentage = c.dec(s, 'Percentuale');
    if (amount === undefined) {
      unstructured.push(`${tipo} ${percentage ?? ''}%`.trim());
      continue;
    }
    (tipo === 'MG' ? charges : allowances).push({ amount, percentage });
  }
  if (unstructured.length) national.ScontoMaggiorazione = unstructured;

  const codes = c
    .all(l, 'CodiceArticolo')
    .map((k) => ({ type: c.text(k, 'CodiceTipo') ?? '', value: c.text(k, 'CodiceValore') ?? '' }))
    .filter((k) => k.value);
  const gtin = codes.find((k) => /^(EAN|GTIN)/i.test(k.type));
  const others = codes.filter((k) => k !== gtin);
  const start = c.date(l, 'DataInizioPeriodo', 'line period start');
  const end = c.date(l, 'DataFinePeriodo', 'line period end');
  return {
    id: no,
    quantity: c.dec(l, 'Quantita'),
    unitText: c.text(l, 'UnitaMisura'),
    netAmount,
    accountingRef: c.text(l, 'RiferimentoAmministrazione'),
    period: start || end ? { start, end } : undefined,
    allowances,
    charges,
    price: unitPrice !== undefined ? { net: unitPrice } : undefined,
    vat: vatInfo(c, rate, natura),
    item: {
      name: c.text(l, 'Descrizione') ?? '',
      sellerId: others[0]?.value,
      standardId: gtin ? { value: gtin.value, schemeId: '0160' } : undefined,
      classifications: [],
      attributes: others.slice(1).map((k) => ({ name: k.type, value: k.value })),
    },
    subjectToWithholding: c.text(l, 'Ritenuta') ? c.text(l, 'Ritenuta') === 'SI' : undefined,
    national: Object.keys(national).length ? national : undefined,
  };
}

function paymentData(c: Ctx, body: Element, frag: string) {
  const payments: PaymentInstructions[] = [];
  const schedule: PaymentInstallment[] = [];
  const dates = new Set<string>();
  let n = 0;
  for (const d of c.all(body, 'DatiPagamento/DettaglioPagamento')) {
    n += 1;
    const mp = c.text(d, 'ModalitaPagamento') ?? '';
    const mapped = PAYMENT_MEANS[mp];
    if (!mapped) c.warn('IT_UNKNOWN_MODALITA_PAGAMENTO', `ModalitaPagamento "${mp}" is not a known code; means set to ZZZ`);
    const iban = c.text(d, 'IBAN');
    const bic = c.text(d, 'BIC');
    const base = `${frag}/DatiPagamento/DettaglioPagamento[${n}]`;
    for (const k of [
      'IstitutoFinanziario',
      'ABI',
      'CAB',
      'ScontoPagamentoAnticipato',
      'DataLimitePagamentoAnticipato',
      'PenalitaPagamentiRitardati',
      'DataDecorrenzaPenale',
    ]) {
      const v = c.text(d, k);
      if (v) c.unmapped[`${base}/${k}`] = v;
    }
    const code = mapped?.[0] ?? 'ZZZ';
    payments.push({
      meansCode: code,
      meansText: code === 'ZZZ' ? (mapped?.[1] ?? (mp || undefined)) : undefined,
      nationalMeansCode: mp || undefined,
      remittanceInformation: c.text(d, 'CodicePagamento'),
      creditTransfers: iban ? [{ accountId: iban, accountName: c.text(d, 'Beneficiario'), serviceProviderId: bic }] : [],
    });
    const due = c.date(d, 'DataScadenzaPagamento', 'DataScadenzaPagamento');
    if (due) dates.add(due);
    const days = c.text(d, 'GiorniTerminiPagamento');
    const ref = c.date(d, 'DataRiferimentoTerminiPagamento', 'DataRiferimentoTerminiPagamento');
    schedule.push({
      dueDate: due,
      amount: c.dec(d, 'ImportoPagamento'),
      description: days ? `${days} days${ref ? ` from ${ref}` : ''}` : undefined,
      paymentIndex: payments.length - 1,
    });
  }
  return {
    payments,
    schedule: schedule.length > 1 ? schedule : [],
    dueDate: dates.size === 1 ? ([...dates][0] as CanonicalInvoice['dueDate']) : undefined,
  };
}

function attachment(c: Ctx, a: Element): Attachment {
  const name = c.text(a, 'NomeAttachment') ?? '';
  const format = c.text(a, 'FormatoAttachment');
  const compression = c.text(a, 'AlgoritmoCompressione');
  if (compression)
    c.warn('IT_ATTACHMENT_COMPRESSED', `Attachment "${name}" is compressed (${compression}); base64 holds the compressed bytes`);
  let mimeCode = format ? MIME[format.toUpperCase()] : undefined;
  if (!mimeCode) {
    if (format) c.warn('IT_ATTACHMENT_FORMAT', `FormatoAttachment "${format}" has no known MIME type; set to application/octet-stream`);
    mimeCode = 'application/octet-stream';
  }
  return {
    kind: 'embedded',
    id: name,
    description: c.text(a, 'DescrizioneAttachment'),
    mimeCode,
    filename: name,
    base64: (c.el(a, 'Attachment')?.textContent ?? '').replace(/\s+/g, ''),
  };
}

// ---------------------------------------------------------------------------
// FSM10 (semplificata)
// ---------------------------------------------------------------------------

function parseSimplifiedBody(c: Ctx, root: Element, body: Element, frag: string): CanonicalInvoice {
  const header = c.el(root, 'FatturaElettronicaHeader');
  const dg = c.el(body, 'DatiGenerali/DatiGeneraliDocumento');
  const id = c.text(dg, 'Numero');
  const issueDate = c.date(dg, 'Data', 'BT-2');
  if (!dg || !id || !issueDate) throw new ParseError('Invoice number (Numero) or date (Data) missing');
  const docType = documentType(c, c.text(dg, 'TipoDocumento'));
  let currency = c.text(dg, 'Divisa');
  if (!currency) {
    currency = 'EUR';
    c.derive('/currency', 'Divisa absent in FSM10; EUR assumed');
  }

  const sellerEl = c.el(header, 'CedentePrestatore');
  const seller = party(c, sellerEl, c.el(sellerEl, 'Sede')) as Seller;
  const buyerEl = c.el(header, 'CessionarioCommittente');
  const other = c.el(buyerEl, 'AltriDatiIdentificativi');
  const buyer = party(c, c.el(buyerEl, 'IdentificativiFiscali'), c.el(other, 'Sede'), other);

  const lines: Line[] = [];
  const breakdown = new Map<string, VatBreakdown>();
  let gross: Decimal = '0' as Decimal;
  let vatTotal: Decimal = '0' as Decimal;
  c.all(body, 'DatiBeniServizi').forEach((b, n) => {
    const importo = c.dec(b, 'Importo');
    if (importo === undefined) throw new ParseError(`DatiBeniServizi ${n + 1}: Importo missing`);
    const imposta = c.dec(b, 'DatiIVA/Imposta');
    const rate = c.dec(b, 'DatiIVA/Aliquota');
    const natura = c.text(b, 'Natura');
    const reference = c.text(b, 'RiferimentoNormativo');
    if (imposta === undefined && !natura && (rate === undefined || !isZero(rate))) {
      c.warn(
        'IT_FSM_VAT_AMOUNT_MISSING',
        `DatiBeniServizi ${n + 1} has no Imposta; Importo taken as net`,
        `${frag}/DatiBeniServizi[${n + 1}]`,
      );
    }
    const tax = imposta ?? ('0' as Decimal);
    const net = sub(importo, tax);
    gross = add(gross, importo);
    vatTotal = add(vatTotal, tax);
    const vat = vatInfo(c, rate, natura, reference);
    lines.push({
      id: String(n + 1),
      netAmount: net,
      allowances: [],
      charges: [],
      vat,
      item: { name: c.texts(b, 'Descrizione').join('\n'), classifications: [], attributes: [] },
    });
    const key = `${vat.categoryCode}|${rate ?? ''}|${natura ?? ''}`;
    const prev = breakdown.get(key);
    breakdown.set(key, {
      taxableAmount: add(prev?.taxableAmount ?? '0', net),
      taxAmount: add(prev?.taxAmount ?? '0', tax),
      categoryCode: vat.categoryCode,
      rate,
      exemptionReason: reference,
      nationalCode: vat.nationalCode,
    });
  });
  if (lines.length === 0) throw new ParseError('DatiBeniServizi missing');
  c.derive('/lines/*/netAmount', 'Importo (VAT-inclusive in FSM10) minus DatiIVA/Imposta');
  c.derive('/totals', 'FSM10 states only VAT-inclusive amounts: net, VAT and gross are summed from the blocks');
  c.derive('/vatBreakdown', 'grouped from DatiBeniServizi by VAT category, rate and Natura');

  const net = sub(gross, vatTotal);
  const totals: Totals = { lineNetTotal: net, taxExclusive: net, vatTotal, taxInclusive: gross, payable: gross };

  const rectified = c.el(body, 'DatiGenerali/DatiFatturaRettificata');
  const it: ItExtension = {
    transmissionFormat: c.text(header, 'DatiTrasmissione/FormatoTrasmissione') ?? root.getAttribute('versione') ?? undefined,
    recipientCode: c.text(header, 'DatiTrasmissione/CodiceDestinatario'),
    recipientPec: c.text(header, 'DatiTrasmissione/PECDestinatario'),
    transmissionSequence: c.text(header, 'DatiTrasmissione/ProgressivoInvio'),
    taxRegime: c.text(sellerEl, 'RegimeFiscale') ?? c.text(c.el(sellerEl, 'DatiAnagrafici'), 'RegimeFiscale'),
  };
  if (rectified) {
    const el = c.text(rectified, 'ElementiRettificati');
    if (el) c.unmapped[`${frag}/DatiGenerali/DatiFatturaRettificata/ElementiRettificati`] = el;
  }

  return {
    kind: docType.credit ? 'creditNote' : 'invoice',
    typeCode: docType.typeCode,
    id,
    issueDate,
    nationalType: { scheme: 'IT:TipoDocumento', code: c.text(dg, 'TipoDocumento') ?? '', label: docType.label },
    selfBilled: docType.selfBilled,
    currency,
    notes: [],
    specificationId: '',
    precedingInvoices:
      rectified && c.text(rectified, 'NumeroFR')
        ? [{ id: c.text(rectified, 'NumeroFR') ?? '', issueDate: c.date(rectified, 'DataFR', 'BT-26') }]
        : [],
    seller,
    buyer,
    additionalParties: [],
    payments: [],
    paymentSchedule: [],
    allowances: [],
    charges: [],
    totals,
    vatBreakdown: [...breakdown.values()],
    otherTaxes: [],
    withholdings: [],
    attachments: [],
    lines,
    clearance: [],
    extensions: { it },
    source: undefined,
  } as unknown as CanonicalInvoice;
}
