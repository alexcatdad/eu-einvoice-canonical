/**
 * SIE 4 export (Swedish standard for accounting data), file type 4I: transactions for import.
 *
 * The file holds a header and one `#VER` per journal entry with its `#TRANS` records. It is encoded in
 * CP437 (`#FORMAT PC8`) with CR LF line ends, as the specification says. Amounts are in the ledger
 * currency; an entry in another currency is refused rather than booked at an invented rate.
 */
import { cmp, isZero, sub, sum } from '../values.js';
import { encodeCp437 } from './cp437.js';
import { type JournalEntry, JournalError } from './journal.js';

export interface SieOptions {
  /** Ledger currency, written as `#VALUTA`. Default 'SEK'. Entries in any other currency are refused. */
  currency?: string;
  /** Verification series. Default 'LF' (leverantörsfakturor). */
  series?: string;
  /** Verification number of the first entry. Default 1. */
  firstNumber?: number;
  /** Date of the file, YYYY-MM-DD. Default: today. Pass it for byte-stable output. */
  generated?: string;
  /** The company the books belong to (the buyer). Default: taken from the first entry. */
  company?: { name?: string; orgNumber?: string };
  /** Program name and version for `#PROGRAM`. */
  program?: { name: string; version: string };
}

export interface SieFile {
  text: string;
  /** CP437 bytes: what to write to disk. */
  bytes: Uint8Array;
  /** Characters that had no CP437 form. */
  warnings: string[];
}

const compact = (iso: string) => iso.replaceAll('-', '');
const quote = (s: string) =>
  `"${s
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\\"]/g, '\\$&')
    .trim()}"`;

/** 10 digits as NNNNNN-NNNN, from a Swedish organisation number (ICD 0007). */
function orgNumber(entry: JournalEntry): string | undefined {
  const id = entry.buyer.identifiers.find((i) => i.schemeId === '0007');
  const digits = id?.value.replace(/\D/g, '');
  return digits?.length === 10 ? `${digits.slice(0, 6)}-${digits.slice(6)}` : undefined;
}

export function toSie4(entries: JournalEntry[], options: SieOptions = {}): SieFile {
  if (entries.length === 0) throw new JournalError('unsupported', 'No journal entries to export');
  const currency = options.currency ?? 'SEK';
  const bad = entries.find((e) => e.currency !== currency);
  if (bad)
    throw new JournalError(
      'unsupported',
      `Invoice ${bad.invoiceId} is in ${bad.currency} but the ledger currency is ${currency}. SIE amounts are in the ledger currency and no exchange rate is invented; convert it first, or pass the ledger currency (--currency) if the books are kept in ${bad.currency}`,
    );
  const generated = options.generated ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(generated)) throw new JournalError('unsupported', `Not a date: "${generated}" (use YYYY-MM-DD)`);
  const series = options.series ?? 'LF';
  const first = options.firstNumber ?? 1;
  const name = options.company?.name ?? entries[0].buyer.name;
  const org = options.company?.orgNumber ?? orgNumber(entries[0]);
  const program = options.program ?? { name: 'eu-einvoice-canonical', version: '1.1.0' };

  const rows: string[] = [
    '#FLAGGA 0',
    `#PROGRAM ${quote(program.name)} ${program.version}`,
    '#FORMAT PC8',
    `#GEN ${compact(generated)}`,
    '#SIETYP 4',
  ];
  if (name) rows.push(`#FNAMN ${quote(name)}`);
  if (org) rows.push(`#ORGNR ${org}`);
  rows.push(`#VALUTA ${currency}`);

  const names = new Map<string, string>();
  for (const e of entries) for (const l of e.lines) if (l.accountName && !names.has(l.account)) names.set(l.account, l.accountName);
  for (const [account, accountName] of [...names].sort(([a], [b]) => a.localeCompare(b)))
    rows.push(`#KONTO ${account} ${quote(accountName)}`);

  entries.forEach((e, i) => {
    const total = sum(e.lines.map((l) => sub(l.debit, l.credit)));
    if (!isZero(total) || cmp(e.totalDebit, e.totalCredit) !== 0)
      throw new JournalError('unbalanced', `Invoice ${e.invoiceId}: the verification does not sum to zero (${total})`);
    rows.push(`#VER ${quote(series)} ${quote(String(first + i))} ${compact(e.date)} ${quote(e.text)}`, '{');
    for (const l of e.lines) rows.push(`#TRANS ${l.account} {} ${sub(l.debit, l.credit)} ${compact(e.date)} ${quote(l.text)}`);
    rows.push('}');
  });

  const text = `${rows.join('\r\n')}\r\n`;
  const { bytes, replaced } = encodeCp437(text);
  return { text, bytes, warnings: replaced.map((c) => `Character "${c}" has no CP437 form and was replaced`) };
}
