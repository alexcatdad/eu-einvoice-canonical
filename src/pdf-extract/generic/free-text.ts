/**
 * Free text the invoice labels: payment terms ("Betalningsvillkor: 30 dagar netto", BT-20) and invoice notes
 * ("Anteckning", "Meddelande", BT-22). The text is kept verbatim, one text line per line: right of the label or after its
 * colon, then the lines directly under it in the same column, up to a label, a heading in capitals or a gap.
 */
import type { SourceWarning } from '../../canonical.js';
import type { GenericRead, ReadValue } from '../generic.js';
import type { LayoutDocument } from '../layout.js';
import { findLabels, normalize } from '../se/index.js';
import { below, type Cell, cellRows, regionOf, rightOf } from './cells.js';
import { fieldLabel } from './fields.js';
import { merge } from './items.js';
import { partyId } from './party-ids.js';

const TERMS = /^(?:betalningsvillkor|betalvillkor|payment terms)$/u;
const NOTE = /^(?:anteckning(?:ar)?|notering|meddelande|övrigt|övrig information|kommentar|note|notes)$/u;
const CAPITALS = /^[^\p{Ll}]*\p{Lu}{3}[^\p{Ll}]*$/u;

type Block = { text: string; region: ReadValue['region'] };

/** A payment terms or invoice note label on its own ("Betalningsvillkor:"). */
export const isFreeTextLabel = (text: string) => {
  const t = normalize(text).replace(/:$/u, '');
  return TERMS.test(t) || NOTE.test(t);
};

const isLabel = (rows: Cell[][], c: Cell) => {
  const head = normalize(c.text.split(':')[0]);
  return (
    !!fieldLabel(c.text) ||
    TERMS.test(head) ||
    NOTE.test(head) ||
    CAPITALS.test(c.text) ||
    partyId(rows, c) !== undefined ||
    (/:/u.test(c.text) && findLabels(c.text.split(':')[0]).length > 0)
  );
};

/** The text each label in `re` introduces, in reading order. */
function blocks(rows: Cell[][], free: Cell[][], re: RegExp): Block[] {
  const out: Block[] = [];
  for (const cell of free.flat()) {
    const colon = /^([^:]{2,40}):\s*(.*)$/u.exec(cell.text);
    if (!re.test(normalize(colon ? colon[1] : cell.text))) continue;
    const lines: { text: string; cell: Cell }[] = [];
    const inline = colon?.[2].trim();
    const right = inline ? undefined : rightOf(rows, cell);
    if (inline) lines.push({ text: inline, cell });
    else if (right && !isLabel(rows, right)) lines.push({ text: right.text, cell: right });
    // Further lines start where the first one does (under the label when nothing stands right of it)
    const column = lines[0]?.cell ?? cell;
    for (let at = column, n = 0; n < 12; n++) {
      const next = below(rows, at);
      if (!next || isLabel(rows, next) || Math.abs(next.x - column.x) > 2) break;
      lines.push({ text: next.text, cell: next });
      at = next;
    }
    if (lines.length) out.push({ text: lines.map((l) => l.text).join('\n'), region: merge(lines.map((l) => regionOf(l.cell))) });
  }
  return out;
}

/** Writes the distinct texts as one value, in page order; each further text is recorded with its own region. */
function joined(field: string, found: Block[], values: Record<string, ReadValue>, warnings: SourceWarning[]) {
  const distinct = found.filter((b, i) => found.findIndex((o) => o.text === b.text) === i);
  if (!distinct.length) return;
  values[field] = { value: distinct.map((b) => b.text).join('\n'), region: distinct[0].region };
  for (const b of distinct.slice(1))
    warnings.push({
      code: 'joined-text',
      field,
      message: 'Another printed text for this field is kept after the first, on a new line',
      region: b.region,
    });
}

/**
 * Payment terms (BT-20) and invoice notes (BT-22, after a note already at `/notes/0/text`), read after the rule layers
 * so that text in the item table area (from its first to its last line value, per page) is left to the item lines.
 */
export function freeTextValues(layout: LayoutDocument, read: GenericRead): GenericRead {
  const pages = new Set(layout.pages.slice(0, read.pages ?? layout.pages.length).map((p) => p.number));
  const rows = cellRows(layout).filter((r) => pages.has(r[0].page));
  const band = new Map<number, { top: number; bottom: number }>();
  for (const [k, { region: r }] of Object.entries(read.values)) {
    if (!k.startsWith('/lines/')) continue;
    const b = band.get(r.page);
    band.set(r.page, { top: Math.min(b?.top ?? r.y, r.y), bottom: Math.max(b?.bottom ?? 0, r.y + r.height) });
  }
  const free = rows.filter((r) => {
    const b = band.get(r[0].page);
    return !b || r[0].line.y + r[0].line.height < b.top || r[0].line.y > b.bottom;
  });
  const values = { ...read.values };
  const warnings = [...read.warnings];
  joined('/paymentTerms', blocks(rows, free, TERMS), values, warnings);
  joined(values['/notes/0/text'] ? '/notes/1/text' : '/notes/0/text', blocks(rows, free, NOTE), values, warnings);
  return { ...read, values, warnings };
}
