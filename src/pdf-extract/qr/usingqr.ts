/**
 * UsingQR payloads (Visma Spcs, "UsingQR Format specification", revision 2, https://qrkod.info/specification.pdf):
 * a JSON object with the keys below. A payload is UsingQR only when it holds the `uqr` key; Swish and other payment
 * codes are not. The specification's own examples are not valid JSON (typographic quotes, a missing or a stray
 * quote), and some generators add single quotes inside the strings, so the object is read key by key rather than
 * with `JSON.parse`. Unknown keys are ignored, as the
 * specification requires; a key given twice with different values is dropped.
 */

const KEYS = [
  'uqr',
  'tp',
  'nme',
  'cc',
  'cid',
  'iref',
  'cr',
  'idt',
  'ddt',
  'due',
  'cur',
  'vat',
  'vh',
  'vm',
  'vl',
  'pt',
  'acc',
  'bc',
  'adr',
] as const;
export type UsingQrKey = (typeof KEYS)[number];

export interface UsingQr {
  /** 1 invoice, 2 credit invoice, 3 cash paid invoice. */
  type: 1 | 2 | 3;
  /** Every recognised key as written, numbers as their digits (no float conversion). */
  fields: Partial<Record<UsingQrKey, string>>;
}

const PAIR = /"?([A-Za-z]+)"?\s*:\s*(?:"((?:[^"\\]|\\.)*)"|([^\s",}][^",}]*))/gu;

/** The UsingQR content of a decoded QR text, or undefined when it is not a UsingQR code. */
export function parseUsingQr(text: string): UsingQr | undefined {
  const s = text.replace(/[“”„‟″]/gu, '"').trim();
  if (!s.startsWith('{')) return undefined;
  const seen = new Map<string, string | null>();
  for (const m of s.matchAll(PAIR)) {
    const key = m[1].toLowerCase();
    if (!(KEYS as readonly string[]).includes(key)) continue;
    // Some generators wrap values in single quotes as well ("'SEK'")
    const value = (m[2] !== undefined ? jsonString(m[2]) : m[3]).trim().replace(/^'(.*)'$/su, '$1');
    const before = seen.get(key);
    seen.set(key, before === undefined || before === value ? value : null);
  }
  if (!seen.has('uqr')) return undefined;
  const tp = seen.get('tp');
  if (tp !== '1' && tp !== '2' && tp !== '3') return undefined;
  const fields: UsingQr['fields'] = {};
  for (const [k, v] of seen) if (v) fields[k as UsingQrKey] = v;
  return { type: Number(tp) as 1 | 2 | 3, fields };
}

function jsonString(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw;
  }
}

/** A UsingQR amount ("450.5", "-450.5") as a decimal with at least two places, or undefined. */
export function usingQrAmount(raw: string | undefined): string | undefined {
  const m = raw && /^(-?\d+)(?:\.(\d+))?$/u.exec(raw);
  return m ? `${m[1]}.${(m[2] ?? '').padEnd(2, '0')}` : undefined;
}

/** A UsingQR date (YYYYMMDD) as an ISO date, or undefined when it is not a calendar date. */
export function usingQrDate(raw: string | undefined): string | undefined {
  const m = raw && /^(\d{4})(\d{2})(\d{2})$/u.exec(raw);
  if (!m) return undefined;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(iso) ? iso : undefined;
}
