/** Swedish amount notation to exact decimals. */
import type { Decimal } from '../../canonical.js';
import { toDecimal } from '../../values.js';

export interface SeAmount {
  value: Decimal;
  /** Set when the text carried `kr`, `SEK`, `:-` or `,-`. */
  currency?: 'SEK';
}

const CURRENCY_PREFIX = /^(?:sek|kr\.?)\s*/iu;
const CURRENCY_SUFFIX = /\s*(?:sek|kr\.?)$/iu;
/** `100:-` and `100,-`: whole kronor, not a negative sign. */
const WHOLE_SUFFIX = /\s*[:,]-$/u;
const MINUS = '[-−–]';
/** Digits with space-variant thousands separators and an optional comma fraction. */
const SPACED = /^(\d{1,3}(?:[    ]\d{3})+|\d+)(?:,(\d+))?$/u;
/** Dot thousands separators are only unambiguous next to a comma fraction: "1.234,56". */
const DOTTED = /^(\d{1,3}(?:\.\d{3})+),(\d+)$/u;
/** A dot decimal is accepted only with exactly two decimals; "1.234" stays ambiguous. */
const DOT_DECIMAL = /^(\d+)\.(\d{2})$/u;

/**
 * Parses a Swedish amount: "1 234,56", "22 697 kr", "SEK 1.234,56", "100:-", "-0,40",
 * "1 234,56-", "(12,00)". Space, no-break, thin and narrow no-break spaces group
 * thousands. Digits are kept as written. Returns undefined for anything else, including
 * ambiguous forms such as "1.234" and malformed grouping such as "12 34".
 */
export function parseSeAmount(raw: string): SeAmount | undefined {
  let s = raw.normalize('NFC').trim();
  let currency = false;
  let whole = false;
  let negative = false;
  for (let changed = true; changed; ) {
    changed = false;
    for (const [re, mark] of [
      [CURRENCY_PREFIX, 'c'],
      [CURRENCY_SUFFIX, 'c'],
      [WHOLE_SUFFIX, 'w'],
    ] as const) {
      const next = s.replace(re, '');
      if (next !== s) {
        s = next;
        changed = true;
        if (mark === 'c') currency = true;
        else whole = currency = true;
      }
    }
  }
  const paren = /^\((.*)\)$/u.exec(s);
  const signed = new RegExp(`^${MINUS}\\s*(.*)$|^(.*?)\\s*${MINUS}$`, 'u').exec(paren ? paren[1] : s);
  if (paren || signed) negative = true;
  if (paren && signed) return undefined;
  s = signed ? (signed[1] ?? signed[2]) : paren ? paren[1] : s;
  const m = SPACED.exec(s) ?? DOTTED.exec(s) ?? DOT_DECIMAL.exec(s);
  if (!m || (whole && m[2] !== undefined)) return undefined;
  const int = m[1].replace(/\D/gu, '');
  const value = toDecimal(`${negative ? '-' : ''}${int}${m[2] ? `.${m[2]}` : ''}`);
  return currency ? { value, currency: 'SEK' } : { value };
}
