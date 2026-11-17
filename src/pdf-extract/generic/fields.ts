/** Field labels of a Swedish invoice and the typed parsing of their values. */
import type { Decimal } from '../../canonical.js';
import { toDecimal } from '../../values.js';
import {
  findLabels,
  normalize,
  parseBankgiro,
  parseBic,
  parseIban,
  parseOcr,
  parseOrgNumber,
  parsePlusgiro,
  parseSeAmount,
  parseSeDate,
  parseSeVatNumber,
} from '../se/index.js';

export type FieldKey =
  | 'id'
  | 'issueDate'
  | 'dueDate'
  | 'payable'
  | 'taxInclusive'
  | 'vatTotal'
  | 'vatRate'
  | 'lineNetTotal'
  | 'taxExclusive'
  | 'orgNumber'
  | 'vatNumber'
  | 'ocr'
  | 'bankgiro'
  | 'plusgiro'
  | 'iban'
  | 'bic'
  | 'rounding'
  | 'charge'
  | 'allowance'
  | 'prepaid'
  | 'buyer'
  | 'sellerAddress'
  | 'vatBase'
  | 'buyerReference'
  | 'orderReference'
  | 'buyerOrgNumber'
  | 'buyerVatNumber'
  | 'buyerId'
  | 'buyerContact'
  | 'sellerContact'
  | 'phone'
  | 'email'
  | 'legalInfo'
  | 'exemptBase'
  | 'lateInterest'
  | 'buyerPhone'
  | 'buyerEmail'
  | 'invoicedObject'
  | 'accountingRef'
  | 'bankName';

/** Labels the shared lexicon does not cover: address blocks, fees and discounts beside the totals, VAT base. */
const EXTRA: [FieldKey, RegExp][] = [
  ['buyer', /^(?:faktura|fakturerings)adress$/u],
  ['sellerAddress', /^(?:post)?adress$/u],
  [
    'charge',
    /^(?:exp(?:\.|editions)? ?avg(?:ift)?\.?|fakturaavgift|faktureringsavgift|administrationsavgift|adm\.? ?avgift|frakt(?:avgift)?)$/u,
  ],
  ['allowance', /^rabatt$/u],
  ['taxExclusive', /^(?:(?:summa|belopp|totalt) )?(?:ex|exl)\.? moms$/u],
  ['vatRate', /^moms ?sats(?:en)?$/u],
  ['vatBase', /^(?:beskattnings)?underlag$/u],
  ['vatBase', /^(?:moms|skatte)underlag$|^underlag (?:för )?moms$|^moms ?pl(?:iktigt)?\.? ?belopp$|^skattepliktigt belopp$/u],
  // Seller contact and legal details, as printed in a letterhead or footer
  ['sellerContact', /^vår (?:referens|kontakt(?:person)?)$/u],
  ['phone', /^(?:telefon(?:nummer)?|tfn|tel)$/u],
  ['email', /^(?:e-?post(?:adress)?|e-?mail)$/u],
  ['legalInfo', /^(?:företagets|styrelsens|bolagets) säte$|^besöksadress$/u],
  ['invoicedObject', /^faktureringsobjekt$/u],
  ['buyerId', /^kund ?(?:nr|nummer)$/u],
  // Amount outside the scope of VAT, as with reverse charge ("Ej momspl.")
  ['exemptBase', /^ej moms ?pl(?:iktigt)?\.?(?: belopp)?$|^momsfritt belopp$/u],
  ['lateInterest', /^dröjsmålsränta$/u],
  // Column headings of a VAT summary as Peppol viewers print it
  ['vatRate', /^momskategori$/u],
  ['vatTotal', /^skattebelopp$/u],
];

/** Labels of the buyer's own references and identifiers ("Er referens", "Ert org.nr"). */
const BUYER: [FieldKey, RegExp][] = [
  ['buyerReference', /^(?:er referens(?:kod)?|beställarreferens|köparens referens)$/u],
  ['buyerContact', /^(?:er|kundens) kontakt(?:person)?$/u],
  ['orderReference', /^(?:ert (?:beställnings|order) ?(?:nr|nummer)|orderreferens)$/u],
  // The buyer's accounting reference (BT-19)
  ['accountingRef', /^konteringsreferens$/u],
  ['buyerOrgNumber', /^(?:ert|kundens|köparens) org(?:anisations)?[ .:-]{0,3}(?:nr|nummer)$/u],
  [
    'buyerVatNumber',
    /^(?:ert|kundens|köparens) (?:moms[ .:-]{0,3}reg(?:istrerings)?[ .:-]{0,3}(?:nr|nummer)|momsnr|vat[ .-]?(?:nr|nummer))$/u,
  ],
];

/** Words that may stand next to a label without changing what it names ("Avgår skattereduktion", "Fakt nr / Kundnr"). */
const FILLER =
  /^(?:avgår|ange|grön|teknik|fakturans|avdrag|varav|summa|totalt|belopp|att|för|sek|kr|nr|preliminär|vid|betalning|enligt|vänligen)$/u;
const BUYER_SIDE = /^(?:er|ert|kundens|köparens|mottagarens)\b/u;

export interface FieldLabel {
  /** One field, or several for a combined label such as "OCR/Fakturanummer". */
  keys: FieldKey[];
  /** A VAT rate printed in the label, as in "Moms 25 %". */
  rate?: Decimal;
  /** For each key, its part of a label joined by "/", and the number of parts, to pair values printed side by side. */
  part: number[];
  parts: number;
}

/**
 * The fields a cell labels, when the whole cell is a label: an optional trailing colon or full stop, a unit ("kr", "%") and a
 * VAT rate ("Moms 25 %") aside. Parts joined by "/" are read separately; a part that names no field is ignored.
 */
export function fieldLabel(text: string): FieldLabel | undefined {
  // A trailing colon, and the full stop of an abbreviation before it ("Org. nr.:")
  let t = normalize(text).replace(/\.?\s*:?$/u, '');
  let rate: Decimal | undefined;
  const pct = /(?:^|\s)\(?(\d{1,2}(?:,\d{1,2})?) ?%\)?(?=\s|$)/u.exec(t);
  if (pct && pct.index > 0) {
    rate = parseRate(pct[1]);
    t = `${t.slice(0, pct.index)}${t.slice(pct.index + pct[0].length)}`.trim();
  }
  const unit = /\s*\(?\s*(%|kr|sek)\s*\)?$/u.exec(t);
  if (unit && unit.index > 0) t = t.slice(0, unit.index);
  const percent = unit?.[1] === '%';
  const buyer = BUYER.find(([, re]) => re.test(t));
  if (buyer) return { keys: [buyer[0]], part: [0], parts: 1 };
  if (BUYER_SIDE.test(t) || /\d/u.test(t)) return undefined;
  const keys: FieldKey[] = [];
  const part: number[] = [];
  const split = t.split(/ ?\/ ?/u);
  for (const [i, text] of split.entries()) {
    const key = partKey(text, percent);
    if (key === null) return undefined;
    if (key) {
      keys.push(key);
      part.push(i);
    }
  }
  if (!keys.length || new Set(keys).size !== keys.length) return undefined;
  return { keys, part, parts: split.length, ...(rate ? { rate } : {}) };
}

/**
 * A label and its value in one text: "Fakturanummer: 941", or leading words that are a label followed by the value
 * ("Org.nr 559900-1236").
 */
export function inlinePair(text: string): { label: FieldLabel; value: string } | undefined {
  const colon = /^([^:]{2,40}):\s*(\S.*)$/u.exec(text);
  if (colon) {
    const label = fieldLabel(colon[1]);
    return label ? { label, value: colon[2] } : undefined;
  }
  const words = text.split(' ');
  for (let n = Math.min(4, words.length - 1); n >= 1; n--) {
    const label = fieldLabel(words.slice(0, n).join(' '));
    if (label) return { label, value: words.slice(n).join(' ') };
  }
  return undefined;
}

/** The field one label part names; undefined for a short part that names none ("Kundnr"); null when it is not a label. */
function partKey(t: string, percent: boolean): FieldKey | undefined | null {
  for (const [key, re] of EXTRA) if (re.test(t)) return key;
  const labels = findLabels(t);
  let rest = t;
  for (const l of [...labels].reverse()) rest = rest.slice(0, l.start) + rest.slice(l.end);
  const words = rest.split(/[ -]+/u).filter(Boolean);
  if (!labels.length) return words.length <= 1 ? undefined : null;
  if (words.length > 4 || words.some((w) => !FILLER.test(w))) return null;
  const keys = new Set(labels.map((l) => keyOf(l.label, t, percent)).filter((k) => k !== undefined));
  return keys.size === 1 ? [...keys][0] : keys.size ? null : undefined;
}

function keyOf(label: string, t: string, percent: boolean): FieldKey | undefined {
  switch (label) {
    case 'invoiceNumber':
      return 'id';
    case 'invoiceDate':
      return 'issueDate';
    case 'dueDate':
      return 'dueDate';
    case 'amountDue':
      return 'payable';
    case 'total':
      return /inkl|totala belopp|totalbelopp|fakturabelopp/u.test(t) ? 'taxInclusive' : undefined;
    case 'vat':
      return percent ? 'vatRate' : 'vatTotal';
    case 'net':
      return t.includes('exkl') ? 'taxExclusive' : 'lineNetTotal';
    case 'orgNumber':
    case 'vatNumber':
    case 'ocr':
    case 'bankgiro':
    case 'plusgiro':
    case 'iban':
    case 'bic':
    case 'rounding':
      return label as FieldKey;
    case 'rot':
    case 'rut':
    case 'householdWork':
      return 'prepaid';
    default:
      return undefined;
  }
}

/** A value parsed for a field. `checkFailed`: kept as printed although its check digits fail. `personal`: a personal identity number, never kept. */
export type Parsed = { value: string; checkFailed?: true } | { personal: true };

/** ISO 3166 region names; `of()` is undefined for a code that is not a region (a BIC's country check). */
const REGIONS = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
const digits = (s: string) => s.replace(/\D/gu, '');
const clean = (s: string) => s.normalize('NFC').replace(/\s+/gu, ' ').trim();

/** Rate as a percent number without trailing fraction zeros: "25,00 %" -> "25". */
export function parseRate(raw: string): Decimal | undefined {
  const m = /^(\d{1,2})(?:[,.](\d{1,3}))? ?%?$/u.exec(clean(raw));
  if (!m) return undefined;
  const frac = (m[2] ?? '').replace(/0+$/u, '');
  return toDecimal(frac ? `${m[1]}.${frac}` : m[1]);
}

/** A VAT category and rate as Peppol viewers print them, "S, 25.00%" or "VAT : S (Standard), 25.00%": the rate of a standard (S) or zero-rated (Z) line. */
export function parseCategoryRate(raw: string): Decimal | undefined {
  const m = /^(?:(?:vat|moms) ?: ?)?([SZ])(?: \([^)]*\))?, ?(\d{1,2}(?:[,.]\d{1,2})?) ?%$/iu.exec(clean(raw));
  const rate = m ? parseRate(m[2]) : undefined;
  return rate !== undefined && Number(rate) > 0 === (m![1].toUpperCase() === 'S') ? rate : undefined;
}

export function parseAmount(raw: string): Decimal | undefined {
  return parseSeAmount(clean(raw))?.value;
}

/** Parses `raw` as the value of `key`; undefined when it is not a value of that type. */
export function parseField(key: FieldKey, raw: string): Parsed | undefined {
  const s = clean(raw);
  switch (key) {
    case 'id': {
      if (parseSeDate(s)) return undefined;
      if (/^\d{1,4}(?: \d{3,4})+$/u.test(s)) return { value: s.replace(/ /gu, '') };
      return /^(?=.*\d)[A-Za-z0-9][A-Za-z0-9\-/.]*$/u.test(s) ? { value: s } : undefined;
    }
    case 'issueDate':
    case 'dueDate': {
      const d = parseSeDate(s);
      return d ? { value: d } : undefined;
    }
    case 'vatRate': {
      const r = parseRate(s);
      return r ? { value: r } : undefined;
    }
    case 'orgNumber': {
      if (!/^(?:\d{2})?\d{6}[-+ ]?\d{4}$/u.test(s)) return undefined;
      const p = parseOrgNumber(s);
      if (p?.kind === 'personal') return { personal: true };
      return p ? { value: digits(p.orgNumber) } : { value: digits(s).slice(-10), checkFailed: true };
    }
    case 'vatNumber': {
      const compact = s.replace(/[\s-]/gu, '').toUpperCase();
      const withSe = /^\d{12}$/u.test(compact) ? `SE${compact}` : compact;
      if (!/^[A-Z]{2}[0-9A-Z]{8,14}$/u.test(withSe)) return undefined;
      const p = parseSeVatNumber(withSe);
      if (p?.kind === 'personal') return { personal: true };
      if (p) return { value: p.vatNumber };
      return { value: compact, checkFailed: true };
    }
    case 'ocr': {
      if (!/^\d[\d ]{0,30}\d$/u.test(s)) return undefined;
      const o = parseOcr(s);
      return o ? { value: o.reference } : { value: digits(s), checkFailed: true };
    }
    case 'bankgiro': {
      if (!/^\d{3,4}[- ]?\d{4}$/u.test(s)) return undefined;
      const g = parseBankgiro(s);
      return g ? { value: g.digits } : { value: digits(s), checkFailed: true };
    }
    case 'plusgiro': {
      if (!/^\d[\d ]{0,9}-\d$|^\d{2,8}$/u.test(s)) return undefined;
      const g = parsePlusgiro(s);
      return g ? { value: g.digits } : { value: digits(s), checkFailed: true };
    }
    case 'iban': {
      if (!/^[A-Z]{2}\d{2}[A-Z0-9 ]{11,40}$/iu.test(s)) return undefined;
      return parseIban(s) ? { value: parseIban(s)! } : { value: s.replace(/ /gu, '').toUpperCase(), checkFailed: true };
    }
    case 'buyer':
    case 'sellerAddress':
      return undefined;
    // Free text, but never another label ("Vår referens", "Betalningsvillkor:"); an order number has a digit
    case 'buyerReference':
    case 'accountingRef':
    case 'orderReference':
    case 'invoicedObject':
      return s &&
        s.length <= 60 &&
        !/:$/u.test(s) &&
        !fieldLabel(s) &&
        !findLabels(s).length &&
        (key === 'buyerReference' || key === 'accountingRef' || /\d/u.test(s))
        ? { value: s }
        : undefined;
    // Names and other free text: never another label
    case 'buyerContact':
    case 'sellerContact':
    case 'legalInfo':
      return s.length <= 80 && /\p{L}{2}/u.test(s) && !/:$/u.test(s) && !fieldLabel(s) && !findLabels(s).some((l) => l.start === 0)
        ? { value: s }
        : undefined;
    case 'buyerId':
      return s.length <= 40 && /\d/u.test(s) && !parseSeDate(s) && !findLabels(s).length ? { value: s } : undefined;
    case 'phone':
    case 'buyerPhone':
      return /^\+?\d[\d ()-]{5,20}\d$/u.test(s) ? { value: s } : undefined;
    case 'email':
    case 'buyerEmail':
      return /^[^\s@]+@[^\s@]+\.\p{L}{2,}$/u.test(s) ? { value: s } : undefined;
    case 'lateInterest':
      return parseRate(s) ? { value: s } : undefined;
    case 'bankName':
      return /^\p{L}[\p{L} .&-]{1,38}$/u.test(s) && !fieldLabel(s) && !findLabels(s).length ? { value: s } : undefined;
    case 'buyerOrgNumber':
      return parseField('orgNumber', s);
    case 'buyerVatNumber':
      return parseField('vatNumber', s);
    case 'bic': {
      const b = parseBic(s);
      return b && REGIONS.of(b.slice(4, 6)) !== undefined ? { value: b } : undefined;
    }
    default: {
      const a = parseAmount(s);
      return a ? { value: a } : undefined;
    }
  }
}
