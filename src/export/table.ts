/** Generic journal export: JSON and CSV, one row per journal line. */
import type { JournalEntry } from './journal.js';

export function journalToJson(entries: JournalEntry[], pretty = false): string {
  return `${JSON.stringify(entries, null, pretty ? 2 : undefined)}\n`;
}

export const CSV_COLUMNS = [
  'entry',
  'date',
  'invoice',
  'kind',
  'currency',
  'supplier',
  'account',
  'account_name',
  'debit',
  'credit',
  'role',
  'text',
  'vat_category',
  'vat_rate',
] as const;

/** Text that a spreadsheet would run as a formula gets a leading apostrophe. */
const safe = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
const cell = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** RFC 4180 CSV with a header row and CR LF line ends. Entry numbers start at 1. */
export function journalToCsv(entries: JournalEntry[]): string {
  const rows: string[][] = [[...CSV_COLUMNS]];
  entries.forEach((e, i) => {
    for (const l of e.lines)
      rows.push([
        String(i + 1),
        e.date,
        safe(e.invoiceId),
        e.kind,
        e.currency,
        safe(e.supplier.name ?? ''),
        l.account,
        safe(l.accountName ?? ''),
        l.debit,
        l.credit,
        l.role,
        safe(l.text),
        l.vatCategory ?? '',
        l.vatRate ?? '',
      ]);
  });
  return `${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}
