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
  | 'vatBase';

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
  ['vatBase', /^(?:moms|skatte)underlag$|^underlag (?:för )?moms$|^moms ?pl(?:iktigt)?\.? ?belopp$/u],
];

/** Words that may stand next to a label without changing what it names ("Avgår skattereduktion", "Fakt nr / Kundnr"). */
const FILLER = /^(?:avgår|ange|fakturans|avdrag|varav|summa|totalt|belopp|att|för|sek|kr|nr|preliminär|vid|betalning|enligt)$/u;
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
 * The fields a cell labels, when the whole cell is a label: an optional trailing colon, a unit ("kr", "%") and a
 * VAT rate ("Moms 25 %") aside. Parts joined by "/" are read separately; a part that names no field is ignored.
 */
export function fieldLabel(text: string): FieldLabel | undefined {
  let t = normalize(text).replace(/\s*:$/u, '');
  let rate: Decimal | undefined;
  const pct = /(?:^|\s)\(?(\d{1,2}(?:,\d{1,2})?) ?%\)?(?=\s|$)/u.exec(t);
  if (pct && pct.index > 0) {
    rate = parseRate(pct[1]);
    t = `${t.slice(0, pct.index)}${t.slice(pct.index + pct[0].length)}`.trim();
  }
  const unit = /\s*\(?\s*(%|kr|sek)\s*\)?$/u.exec(t);
  if (unit && unit.index > 0) t = t.slice(0, unit.index);
  const percent = unit?.[1] === '%';
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

/** The field one label part names; undefined for a short part that names none ("Kundnr"); null when it is not a label. */
function partKey(t: string, percent: boolean): FieldKey | undefined | null {
  for (const [key, re] of EXTRA) if (re.test(t)) return key;
  const labels = findLabels(t);
  let rest = t;
  for (const l of [...labels].reverse()) rest = rest.slice(0, l.start) + rest.slice(l.end);
  const words = rest.split(/[ -]+/u).filter(Boolean);
  if (!labels.length) return words.length <= 1 ? undefined : null;
  if (words.length > 2 || words.some((w) => !FILLER.test(w))) return null;
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
