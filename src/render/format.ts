/**
 * Locale-aware text for the human-readable renderings. Numbers are never converted to floating point for
 * display: Intl supplies only the locale's symbols and pattern (separators, minus sign, where the currency or
 * percent sign goes), and the digits are copied from the exact decimal string. Anything that is not a plain
 * decimal, an ISO date or a known code is shown as it came in.
 */

const DECIMAL = /^([+-]?)(\d+)(?:\.(\d+))?$/;

/** A locale Intl accepts for `lang`, or `en` when the tag is not one. */
export function resolveLocale(lang: string | undefined): string {
  try {
    return Intl.getCanonicalLocales(lang ?? 'en')[0] ?? 'en';
  } catch {
    return 'en';
  }
}

interface Symbols {
  group: string;
  decimal: string;
  /** 2 where the locale leaves four-digit numbers ungrouped (es, pl: 1234 but 12 345). */
  minGrouping: number;
}

const symbolCache = new Map<string, Symbols>();

function symbols(locale: string): Symbols {
  let s = symbolCache.get(locale);
  if (!s) {
    const nf = new Intl.NumberFormat(locale);
    const parts = nf.formatToParts(1234567.5);
    s = {
      group: parts.find((p) => p.type === 'group')?.value ?? ',',
      decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.',
      minGrouping: nf.formatToParts(1234).some((p) => p.type === 'group') ? 1 : 2,
    };
    symbolCache.set(locale, s);
  }
  return s;
}

/** The digits of an unsigned decimal, grouped and with the locale's decimal sign; the fraction is padded, never cut. */
function digits(int: string, frac: string, locale: string, minFraction: number): string {
  const s = symbols(locale);
  let grouped = int;
  if (int.length >= 4 + s.minGrouping - 1) {
    grouped = '';
    for (let end = int.length; end > 0; end -= 3) grouped = int.slice(Math.max(0, end - 3), end) + (grouped ? s.group + grouped : '');
  }
  const f = frac.padEnd(minFraction, '0');
  return f ? `${grouped}${s.decimal}${f}` : grouped;
}

/**
 * Lays the exact digits into the pattern `nf` produces for `sample`: the sign, currency, percent sign, unit
 * and spacing come from Intl, the number itself from the source string.
 */
function inPattern(nf: Intl.NumberFormat, negative: boolean, number: string, sample: number): string {
  let out = '';
  let placed = false;
  for (const p of nf.formatToParts(negative ? -Math.abs(sample) : Math.abs(sample))) {
    if (p.type === 'integer' || p.type === 'group' || p.type === 'decimal' || p.type === 'fraction') {
      if (!placed) out += number;
      placed = true;
    } else out += p.value;
  }
  return out;
}

function sampleOf(value: string): number {
  const n = Math.abs(Number(value));
  return Number.isFinite(n) ? n : 1;
}

/** A decimal string in the locale's notation, e.g. `1234.5` as `1.234,5` in German. */
export function formatDecimal(value: string, locale: string, minFraction = 0): string {
  const m = DECIMAL.exec(value.trim());
  if (!m) return value;
  const number = digits(m[2]!, m[3] ?? '', locale, minFraction);
  if (m[1] !== '-') return number;
  return inPattern(new Intl.NumberFormat(locale), true, number, 1);
}

const currencyCache = new Map<string, Intl.NumberFormat | null>();

function currencyFormat(currency: string, locale: string, display: 'symbol' | 'code'): Intl.NumberFormat | null {
  const key = `${locale}|${currency}|${display}`;
  let nf = currencyCache.get(key);
  if (nf === undefined) {
    try {
      nf = /^[A-Za-z]{3}$/.test(currency)
        ? new Intl.NumberFormat(locale, { style: 'currency', currency: currency.toUpperCase(), currencyDisplay: display })
        : null;
    } catch {
      nf = null;
    }
    currencyCache.set(key, nf);
  }
  return nf;
}

/** Fraction digits the currency normally shows (2 for EUR, 0 for JPY); amounts with more keep all of theirs. */
export function currencyDigits(currency: string, locale = 'en'): number {
  return currencyFormat(currency, locale, 'code')?.resolvedOptions().minimumFractionDigits ?? 2;
}

/** An amount without the currency sign, padded to the currency's usual fraction digits (for table cells). */
export function formatAmount(value: string, currency: string, locale: string): string {
  return formatDecimal(value, locale, currencyDigits(currency, locale));
}

/** An amount with its currency, in the locale's pattern: `€1,234.50`, `1.234,50 €`, `1 234,50 EUR`. */
export function formatMoney(value: string, currency: string, locale: string, display: 'symbol' | 'code' = 'symbol'): string {
  const m = DECIMAL.exec(value.trim());
  const nf = currencyFormat(currency, locale, display);
  if (!m || !nf) return [value, currency].filter((s) => s.trim() !== '').join(' ');
  const number = digits(m[2]!, m[3] ?? '', locale, nf.resolvedOptions().minimumFractionDigits ?? 2);
  return inPattern(nf, m[1] === '-', number, 1);
}

const percentCache = new Map<string, Intl.NumberFormat>();

/** A percentage given in percent units (`25` for 25 %), in the locale's pattern: `25%`, `25 %`, `12,5 %`. */
export function formatPercent(value: string, locale: string): string {
  const m = DECIMAL.exec(value.trim());
  if (!m) return value;
  let nf = percentCache.get(locale);
  if (!nf) {
    nf = new Intl.NumberFormat(locale, { style: 'percent' });
    percentCache.set(locale, nf);
  }
  return inPattern(nf, m[1] === '-', digits(m[2]!, m[3] ?? '', locale, 0), 0.5);
}

/** A date in the reader's locale. `iso` is set only for a real calendar date; anything else comes back as `text`. */
export function formatDate(value: string, locale: string): { text: string; iso?: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return { text: value };
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(ms);
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3]))
    return { text: value };
  return { text: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(d), iso: m[0] };
}

/** An IBAN in groups of four (`DE89 3704 0044 0532 0130 00`), when the string is one with a valid check sum. */
export function formatIban(value: string): string | undefined {
  const compact = value.replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact)) return undefined;
  const moved = compact.slice(4) + compact.slice(0, 4);
  let rest = 0;
  for (const ch of moved) {
    const n = ch >= 'A' ? ch.charCodeAt(0) - 55 : ch.charCodeAt(0) - 48;
    rest = (n > 9 ? rest * 100 + n : rest * 10 + n) % 97;
  }
  return rest === 1 ? compact.replace(/(.{4})(?=.)/g, '$1 ') : undefined;
}

/** A country name in the locale (`SE` as `Sweden` or `Schweden`), or the code when Intl does not know it. */
export function countryName(code: string, locale: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return code;
  try {
    return new Intl.DisplayNames([locale], { type: 'region', fallback: 'code' }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** UN/ECE Rec 20 codes Intl can spell in every language, with plural forms. */
const INTL_UNITS: Record<string, string> = {
  HUR: 'hour',
  DAY: 'day',
  WEE: 'week',
  MON: 'month',
  ANN: 'year',
  MIN: 'minute',
  SEC: 'second',
  KGM: 'kilogram',
  GRM: 'gram',
  LTR: 'liter',
  MLT: 'milliliter',
  MTR: 'meter',
  LM: 'meter',
  CMT: 'centimeter',
  MMT: 'millimeter',
  KMT: 'kilometer',
  HAR: 'hectare',
  LBR: 'pound',
};

/** Rec 20 / Rec 21 codes whose symbol is the same in every language. */
const SYMBOL_UNITS: Record<string, string> = {
  MTK: 'm²',
  MTQ: 'm³',
  TNE: 't',
  KWH: 'kWh',
  MWH: 'MWh',
  KWT: 'kW',
  P1: '%',
};

export type UnitWord = 'uPiece' | 'uSet' | 'uPair' | 'uBox' | 'uPack' | 'uLumpSum' | 'uUnit';

/** Rec 20 / Rec 21 codes for counted things, named through the labels. */
const WORD_UNITS: Record<string, UnitWord> = {
  C62: 'uPiece',
  H87: 'uPiece',
  EA: 'uPiece',
  NAR: 'uPiece',
  XPP: 'uPiece',
  SET: 'uSet',
  NMP: 'uPack',
  PR: 'uPair',
  XBX: 'uBox',
  BX: 'uBox',
  XCT: 'uBox',
  XPK: 'uPack',
  PK: 'uPack',
  XPA: 'uPack',
  LS: 'uLumpSum',
  E48: 'uUnit',
  ZZ: 'uUnit',
  XUN: 'uUnit',
};

/**
 * A quantity with its unit spelled out: `10 h`, `10 Std.`, `3 pcs`, `2,5 m²`. Unknown codes are shown as
 * written; `unitText` (free text from the source) wins over the code.
 */
export function formatQuantity(
  quantity: string | undefined,
  unitCode: string | undefined,
  unitText: string | undefined,
  locale: string,
  word: (w: UnitWord) => string,
): string {
  const q = quantity === undefined ? '' : formatDecimal(quantity, locale);
  if (unitText?.trim()) return [q, unitText.trim()].filter(Boolean).join(' ');
  if (!unitCode) return q;
  const code = unitCode.toUpperCase();
  const intlUnit = INTL_UNITS[code];
  if (intlUnit && quantity !== undefined && DECIMAL.test(quantity.trim())) {
    const m = DECIMAL.exec(quantity.trim())!;
    const nf = new Intl.NumberFormat(locale, { style: 'unit', unit: intlUnit, unitDisplay: 'short' });
    return inPattern(nf, m[1] === '-', digits(m[2]!, m[3] ?? '', locale, 0), sampleOf(quantity));
  }
  const name = SYMBOL_UNITS[code] ?? (WORD_UNITS[code] ? word(WORD_UNITS[code]!) : unitCode);
  return [q, name].filter(Boolean).join(' ');
}

/** Paragraph or bullet list taken from text that has line breaks or "-" items. */
export type Para = { kind: 'p'; lines: string[] } | { kind: 'ul'; items: string[] };

const BULLET = /^\s*(?:[-*•–]|\d{1,3}[.)])\s+/;

/**
 * Splits free text into paragraphs (at blank lines) and bullet lists (runs of lines starting with "-", "*",
 * "•" or "1."). Single line breaks inside a paragraph are kept as lines.
 */
export function paragraphs(text: string | undefined): Para[] {
  if (!text?.trim()) return [];
  const out: Para[] = [];
  let current: Para | undefined;
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) {
      current = undefined;
      continue;
    }
    if (BULLET.test(line)) {
      const item = line.replace(BULLET, '');
      if (current?.kind === 'ul') current.items.push(item);
      else {
        current = { kind: 'ul', items: [item] };
        out.push(current);
      }
    } else if (current?.kind === 'p') current.lines.push(line);
    else {
      current = { kind: 'p', lines: [line] };
      out.push(current);
    }
  }
  return out;
}

/** Names of the identifier schemes (ISO 6523 ICD and EAS codes) people meet most on invoices. */
const SCHEMES: Record<string, string> = {
  '0002': 'SIRENE',
  '0007': 'Organisationsnummer',
  '0009': 'SIRET',
  '0037': 'LY-tunnus',
  '0060': 'DUNS',
  '0088': 'GLN',
  '0096': 'DK P',
  '0106': 'KvK',
  '0151': 'ABN',
  '0160': 'GTIN',
  '0183': 'CHE UID',
  '0184': 'CVR',
  '0188': 'Corporate number',
  '0190': 'OIN',
  '0191': 'Registrikood',
  '0192': 'Organisasjonsnummer',
  '0193': 'UBL.BE',
  '0195': 'UEN',
  '0196': 'Kennitala',
  '0198': 'ERST',
  '0199': 'LEI',
  '0200': 'Juridinio asmens kodas',
  '0201': 'Codice IPA',
  '0204': 'Leitweg-ID',
  '0208': 'KBO-BCE',
  '0209': 'GS1',
  '0210': 'Codice fiscale',
  '0211': 'Partita IVA',
  '0213': 'Finnish VAT',
  '0216': 'OVT',
  '0221': 'JP invoice number',
  '0230': 'MY',
  '9906': 'IT Partita IVA',
  '9907': 'IT Codice fiscale',
  '9910': 'HU VAT',
  '9914': 'AT UID',
  '9915': 'AT Verwaltung',
  '9918': 'IBAN',
  '9919': 'AT KUR',
  '9920': 'ES VAT',
  '9922': 'AD VAT',
  '9925': 'BE VAT',
  '9930': 'DE VAT',
  '9931': 'EE VAT',
  '9938': 'LU VAT',
  '9944': 'NL VAT',
  '9945': 'PL VAT',
  '9947': 'RO VAT',
  '9957': 'FR VAT',
  EM: 'Email',
};

/** A readable name for an identifier scheme: `0088` as `GLN`, `PL:NIP` as `NIP`; unknown schemes as written. */
export function schemeName(scheme: string | undefined): string | undefined {
  if (!scheme) return undefined;
  return SCHEMES[scheme] ?? (/^[A-Z]{2}:/.test(scheme) ? scheme.slice(3) : scheme);
}
