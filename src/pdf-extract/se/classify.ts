/** Classification helpers: VAT rate versus interest rate, invoice versus payment reminder. */
import type { Decimal } from '../../canonical.js';
import { toDecimal } from '../../values.js';
import { findLabels } from './lexicon.js';
import { normalize, wordRegExp } from './text.js';

export interface RateMatch {
  value: Decimal;
  /** Offsets in the normalised text. */
  start: number;
  end: number;
  /** From the nearest VAT or interest term; undefined when the text has neither. */
  kind?: 'vat' | 'interest';
}

const PERCENT = /(?<![\d,.])(\d{1,3}(?:,\d+)?) ?%/gu;
const INTEREST_WORDS = wordRegExp('ränta|räntan|räntesats(?:en)?|referensräntan?|räntelagen|interest');
const PER_PERIOD = /^ ?(?:per (?:år|månad)|\/ ?(?:år|mån)|p\.a\.)/u;

/**
 * Every percentage in `text`, each classified by the nearest VAT term (moms,
 * mervärdesskatt) or interest term (dröjsmålsränta, ränta, räntelagen) on either side, so
 * "Dröjsmålsränta 12 %" is interest even though 12 % is also a Swedish VAT rate. A rate
 * followed by "per år", "/mån" or "p.a." is interest. Ties go to interest, so an interest
 * rate is never read as VAT.
 */
export function classifyRates(text: string): RateMatch[] {
  const norm = normalize(text);
  const terms = [
    ...findLabels(norm)
      .filter((l) => l.label === 'vat' || l.label === 'lateInterest')
      .map((l) => ({ start: l.start, end: l.end, kind: l.label === 'vat' ? ('vat' as const) : ('interest' as const) })),
    ...[...norm.matchAll(INTEREST_WORDS)].map((m) => ({ start: m.index, end: m.index + m[0].length, kind: 'interest' as const })),
  ];
  return [...norm.matchAll(PERCENT)].map((m) => {
    const start = m.index;
    const end = start + m[0].length;
    const value = toDecimal(m[1].replace(',', '.'));
    if (PER_PERIOD.test(norm.slice(end))) return { value, start, end, kind: 'interest' };
    let best: { dist: number; kind: 'vat' | 'interest' } | undefined;
    for (const t of terms) {
      const dist = t.end <= start ? start - t.end : t.start >= end ? t.start - end : 0;
      if (!best || dist < best.dist || (dist === best.dist && t.kind === 'interest')) best = { dist, kind: t.kind };
    }
    return best ? { value, start, end, kind: best.kind } : { value, start, end };
  });
}

/** True when the first percentage in `context` is an interest rate rather than VAT. */
export function isInterestRate(context: string): boolean {
  return classifyRates(context)[0]?.kind === 'interest';
}

/**
 * True when some line or column cell of `text` (split at line breaks, tabs and runs of two or
 * more spaces) starts with a reminder heading ("Påminnelse", "Betalningspåminnelse",
 * "1:a påminnelse", "Påminnelsedatum"). Ordinary invoice terms such as
 * "Påminnelseavgift 60 kr" or "Vid påminnelse debiteras ..." do not count.
 */
export function isReminder(text: string): boolean {
  return text.split(/\r?\n|\t| {2,}/u).some((line) => {
    const [first] = findLabels(line);
    return first?.label === 'reminder' && first.start === 0;
  });
}
