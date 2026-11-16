/** Swedish date notation to ISO dates. */
import type { IsoDate } from '../../canonical.js';
import { toIsoDate } from '../../values.js';
import { normalize } from './text.js';

/** Swedish month names and their abbreviations, indexed by month number - 1. */
export const SE_MONTHS: readonly (readonly string[])[] = [
  ['januari', 'jan'],
  ['februari', 'feb'],
  ['mars', 'mar'],
  ['april', 'apr'],
  ['maj'],
  ['juni', 'jun'],
  ['juli', 'jul'],
  ['augusti', 'aug'],
  ['september', 'sept', 'sep'],
  ['oktober', 'okt'],
  ['november', 'nov'],
  ['december', 'dec'],
];

const MONTH_INDEX = new Map(SE_MONTHS.flatMap((names, i) => names.map((n) => [n, i + 1] as const)));
const MONTH_NAMES = /^(?:den )?(\d{1,2})\.? ([a-zåäö]+)\.? (\d{4})$/u;

function iso(y: string, m: string | number, d: string | number): IsoDate | undefined {
  try {
    return toIsoDate(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`).date;
  } catch {
    return undefined;
  }
}

/**
 * Parses YYYY-MM-DD, YYYYMMDD, YY-MM-DD, YYMMDD and "D month YYYY" with Swedish month
 * names or abbreviations ("15 januari 2026", "3 feb. 2026", "den 1 maj 2026").
 * Two-digit years are read as 20YY. Returns undefined for anything else or an invalid
 * calendar date. Telling a YYMMDD date from another six-digit number is the caller's job.
 */
export function parseSeDate(raw: string): IsoDate | undefined {
  const s = normalize(raw);
  const numeric = /^(\d{2}|\d{4})(-?)(\d{2})\2(\d{2})$/u.exec(s);
  if (numeric) return iso(numeric[1].length === 2 ? `20${numeric[1]}` : numeric[1], numeric[3], numeric[4]);
  const named = MONTH_NAMES.exec(s);
  const month = named && MONTH_INDEX.get(named[2]);
  return month ? iso(named[3], month, named[1]) : undefined;
}
