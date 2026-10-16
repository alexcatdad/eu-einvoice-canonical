/**
 * Constructors and arithmetic for the branded primitive types in `canonical.ts`.
 *
 * Decimals stay strings end to end: `toDecimal()` validates the XML lexical form and
 * keeps the digits as sent (trailing zeros included), and arithmetic runs on BigInt,
 * so no value ever passes through a JS `number`.
 */
import type { Decimal, IsoDate } from './canonical.js';

export class ValueError extends Error {}

/** xsd:decimal lexical form: optional sign, digits, optional fraction. No exponent, no grouping, no comma. */
const DECIMAL = /^([+-]?)(\d*)(?:\.(\d*))?$/;

/**
 * Validates an xsd:decimal and returns it in canonical-model form: surrounding whitespace
 * removed, leading '+' dropped, '.5' -> '0.5', '5.' -> '5'. Trailing zeros are kept.
 */
export function toDecimal(raw: string): Decimal {
  const s = raw.trim();
  const m = DECIMAL.exec(s);
  if (!m || (m[2] === '' && (m[3] ?? '') === '')) throw new ValueError(`Not a decimal: "${raw}"`);
  const int = m[2] === '' ? '0' : m[2];
  const frac = m[3] ?? '';
  const sign = m[1] === '-' ? '-' : '';
  return `${sign}${int}${frac ? `.${frac}` : ''}` as Decimal;
}

export function isDecimal(raw: string): boolean {
  try {
    toDecimal(raw);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

export interface ParsedDate {
  date: IsoDate;
  /** Time part that was dropped, when the source was a date-time not at midnight. */
  droppedTime?: string;
}

/**
 * Accepts YYYY-MM-DD, an xsd:dateTime (truncated to its date) and the UN/CEFACT format 102
 * (YYYYMMDD) used by CII. An optional time-zone suffix on a date is ignored.
 */
export function toIsoDate(raw: string): ParsedDate {
  const s = raw.trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  let time: string | undefined;
  if (!m) {
    m = /^(\d{4})-(\d{2})-(\d{2})(?:T([0-9:.]+))?(?:Z|[+-]\d{2}:\d{2})?$/.exec(s);
    time = m?.[4];
  }
  if (!m) throw new ValueError(`Not a date: "${raw}"`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(0);
  probe.setUTCFullYear(y, mo - 1, d); // Date.UTC would read years 0-99 as 1900-1999

  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d)
    throw new ValueError(`Not a valid calendar date: "${raw}"`);
  const date = `${m[1]}-${m[2]}-${m[3]}` as IsoDate;
  const droppedTime = time && !/^00:00(:00(\.0+)?)?$/.test(time) ? time : undefined;
  return { date, droppedTime };
}

// ---------------------------------------------------------------------------
// Exact arithmetic
// ---------------------------------------------------------------------------

interface Scaled {
  n: bigint;
  scale: number;
}

function parse(d: string): Scaled {
  const s = toDecimal(d);
  const neg = s.startsWith('-');
  const [i, f = ''] = (neg ? s.slice(1) : s).split('.');
  const n = BigInt(i + f);
  return { n: neg ? -n : n, scale: f.length };
}

function align(a: Scaled, b: Scaled): [bigint, bigint, number] {
  const scale = Math.max(a.scale, b.scale);
  return [a.n * 10n ** BigInt(scale - a.scale), b.n * 10n ** BigInt(scale - b.scale), scale];
}

function format(n: bigint, scale: number): Decimal {
  const neg = n < 0n;
  let digits = (neg ? -n : n).toString();
  if (scale > 0) {
    digits = digits.padStart(scale + 1, '0');
    digits = `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  }
  return `${neg ? '-' : ''}${digits}` as Decimal;
}

export function add(a: string, b: string): Decimal {
  const [x, y, scale] = align(parse(a), parse(b));
  return format(x + y, scale);
}

export function sub(a: string, b: string): Decimal {
  const [x, y, scale] = align(parse(a), parse(b));
  return format(x - y, scale);
}

export function neg(a: string): Decimal {
  const p = parse(a);
  return format(-p.n, p.scale);
}

export function sum(values: readonly string[]): Decimal {
  return values.reduce<Decimal>((acc, v) => add(acc, v), '0' as Decimal);
}

/** Exact `a * b`, without rounding. */
export function mul(a: string, b: string): Decimal {
  const x = parse(a);
  const y = parse(b);
  return format(x.n * y.n, x.scale + y.scale);
}

export function abs(a: string): Decimal {
  const p = parse(a);
  return format(p.n < 0n ? -p.n : p.n, p.scale);
}

/** `a / b` rounded to `places` decimals (halves away from zero). Throws on division by zero. */
export function div(a: string, b: string, places = 6): Decimal {
  const x = parse(a);
  const y = parse(b);
  if (y.n === 0n) throw new ValueError('Division by zero');
  const num = x.n * 10n ** BigInt(places + 1 + y.scale);
  const den = y.n * 10n ** BigInt(x.scale);
  const q = num / den; // one guard digit, truncated towards zero
  const last = q % 10n;
  let r = q / 10n;
  if (last >= 5n) r += 1n;
  else if (last <= -5n) r -= 1n;
  return format(r, places);
}

/** Exact `a * rate / 100`, without rounding. */
export function percentOf(a: string, rate: string): Decimal {
  const x = parse(a);
  const r = parse(rate);
  return format(x.n * r.n, x.scale + r.scale + 2);
}

/** -1, 0 or 1. */
export function cmp(a: string, b: string): -1 | 0 | 1 {
  const [x, y] = align(parse(a), parse(b));
  return x < y ? -1 : x > y ? 1 : 0;
}

export function isZero(a: string): boolean {
  return parse(a).n === 0n;
}

export function sign(a: string): -1 | 0 | 1 {
  const n = parse(a).n;
  return n < 0n ? -1 : n > 0n ? 1 : 0;
}

/**
 * Rounds to `places` decimals the way the EN 16931 / Peppol Schematron does
 * (XPath round(): halves go towards positive infinity).
 */
export function round(a: string, places = 2): Decimal {
  const p = parse(a);
  if (p.scale <= places) return format(p.n * 10n ** BigInt(places - p.scale), places);
  const div = 10n ** BigInt(p.scale - places);
  let q = p.n / div; // truncates towards zero
  const r = p.n - q * div;
  // floor(x + 0.5): compare 2r with div, accounting for the sign of the remainder
  if (r !== 0n) {
    if (p.n > 0n && 2n * r >= div) q += 1n;
    else if (p.n < 0n && 2n * -r > div) q -= 1n;
  }
  return format(q, places);
}
