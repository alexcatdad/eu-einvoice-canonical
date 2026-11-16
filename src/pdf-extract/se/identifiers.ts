/**
 * Swedish payment and party identifiers with check digits. Personal identity numbers
 * (personnummer, samordningsnummer) are only ever flagged, never returned.
 */

const strip = (raw: string) => raw.normalize('NFC').replace(/\s+/gu, '');

/** Luhn (mod 10) check over a digit string, check digit last. */
export function luhn(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return sum % 10 === 0;
}

export interface OcrReference {
  reference: string;
  /** The second-to-last digit equals the length mod 10 (Bankgirot "hard" OCR check). */
  lengthDigit: boolean;
}

/** OCR payment reference: 2-25 digits with a Luhn check digit; spaces are ignored. */
export function parseOcr(raw: string): OcrReference | undefined {
  const d = strip(raw);
  if (!/^\d{2,25}$/.test(d) || !luhn(d)) return undefined;
  return { reference: d, lengthDigit: d.length >= 3 && Number(d[d.length - 2]) === d.length % 10 };
}

export interface GiroNumber {
  digits: string;
  /** Conventional notation: "123-4567" / "1234-5678" (Bankgiro), "12 34 56-7" (Plusgiro). */
  formatted: string;
}

/** Bankgiro number: 7 or 8 digits with a Luhn check digit, written NNN-NNNN or NNNN-NNNN. */
export function parseBankgiro(raw: string): GiroNumber | undefined {
  const m = /^(\d{3,4})-?(\d{4})$/u.exec(strip(raw));
  if (!m || !luhn(m[1] + m[2])) return undefined;
  return { digits: m[1] + m[2], formatted: `${m[1]}-${m[2]}` };
}

/** Plusgiro number: 2-8 digits with a Luhn check digit, written in pairs with a hyphen before the check digit. */
export function parsePlusgiro(raw: string): GiroNumber | undefined {
  const m = /^(\d{1,7})-?(\d)$/u.exec(strip(raw));
  if (!m || !luhn(m[1] + m[2])) return undefined;
  const pairs = m[1].replace(/(?=(?:\d{2})+$)/gu, ' ').trim();
  return { digits: m[1] + m[2], formatted: `${pairs}-${m[2]}` };
}

export type PartyNumber = { kind: 'organisation'; orgNumber: string } | { kind: 'personal' };

function personalDate(yymmdd: string): boolean {
  const month = Number(yymmdd.slice(2, 4));
  let day = Number(yymmdd.slice(4, 6));
  if (day > 60) day -= 60; // samordningsnummer
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/**
 * Organisationsnummer: 10 digits (NNNNNN-NNNN, optionally with the "16" prefix) with a
 * Luhn check digit and a third digit of 2 or more. A Luhn-valid number in personnummer
 * shape (a sole trader's organisation number, or a 12-digit YYYYMMDD-NNNN) is reported as
 * `personal` without the number.
 */
export function parseOrgNumber(raw: string): PartyNumber | undefined {
  const m = /^(\d{2})?(\d{6})([-+]?)(\d{4})$/u.exec(strip(raw));
  if (!m) return undefined;
  const [, prefix, head, sep, tail] = m;
  const ten = head + tail;
  if (!luhn(ten)) return undefined;
  if (Number(ten[2]) >= 2)
    return sep === '+' || (prefix !== undefined && prefix !== '16') ? undefined : { kind: 'organisation', orgNumber: `${head}-${tail}` };
  if (prefix !== undefined && !['18', '19', '20'].includes(prefix)) return undefined;
  return personalDate(head) ? { kind: 'personal' } : undefined;
}

/** True when `text` contains a Luhn-valid personnummer or samordningsnummer anywhere. */
export function containsPersonalNumber(text: string): boolean {
  for (const m of text.normalize('NFC').matchAll(/(?<!\d)(?:\d{2})?\d{6}[-+ ]?\d{4}(?!\d)/gu))
    if (parseOrgNumber(m[0])?.kind === 'personal') return true;
  return false;
}

export type SeVatNumber = { kind: 'organisation'; vatNumber: string; orgNumber: string } | { kind: 'personal' };

/** Swedish VAT number: "SE" + 10-digit organisationsnummer + "01". Spaces and hyphens are ignored. */
export function parseSeVatNumber(raw: string): SeVatNumber | undefined {
  const m = /^SE(\d{10})01$/u.exec(strip(raw).replace(/-/gu, '').toUpperCase());
  const party = m && parseOrgNumber(m[1]);
  if (!party) return undefined;
  return party.kind === 'personal' ? party : { kind: 'organisation', vatNumber: `SE${m[1]}01`, orgNumber: party.orgNumber };
}

/** IBAN with a valid ISO 13616 mod-97 checksum; Swedish IBANs must be 24 characters. Returns it without spaces, upper case. */
export function parseIban(raw: string): string | undefined {
  const s = strip(raw).toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s) || (s.startsWith('SE') && !/^SE\d{22}$/.test(s))) return undefined;
  let rem = 0;
  for (const ch of s.slice(4) + s.slice(0, 4)) {
    const v = Number.parseInt(ch, 36);
    rem = (v > 9 ? rem * 100 + v : rem * 10 + v) % 97;
  }
  return rem === 1 ? s : undefined;
}

/** BIC (ISO 9362): 8 or 11 characters. Returns it upper case. */
export function parseBic(raw: string): string | undefined {
  const s = strip(raw).toUpperCase();
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/.test(s) ? s : undefined;
}
