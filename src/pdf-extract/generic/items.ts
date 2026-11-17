/**
 * The item table: a header line with a description and an amount column, then one item per line that has an amount
 * in the amount column. A line with text in the description column only continues the item above (a wrapped
 * description). The table ends at a line that carries a field label (the totals) or after a wide vertical gap.
 */
import type { Decimal, PdfRegion } from '../../canonical.js';
import type { Line } from '../layout.js';
import { normalize } from '../se/index.js';
import { type Cell, overlapX, regionOf } from './cells.js';
import { fieldLabel, parseAmount, parseCategoryRate, parseRate } from './fields.js';

export type Column = 'desc' | 'pos' | 'vat' | 'artnr' | 'qty' | 'qtyUnit' | 'unit' | 'price' | 'rate' | 'discount' | 'amount' | 'date';

const COLUMNS: [Column, RegExp][] = [
  [
    'desc',
    /^(?:benämning|beskrivning|description|specifikation|text|produkt|tjänst|vara|artikel|artikel ?\/ ?tjänst|produkt ?\/ ?tjänst|(?:fakturan )?avser)$/u,
  ],
  ['artnr', /^(?:art\.? ?nr\.?|artikelnr\.?|artikelnummer|art\.?)$/u],
  ['qtyUnit', /^(?:lev\.? )?(?:antal|ant\.?) (?:enh(?:et)?\.?)$/u],
  ['qty', /^(?:lev\.? ?)?(?:antal|ant\.?|kvantitet|mängd)$|^levererat antal$/u],
  ['unit', /^(?:enh(?:et)?\.?)$/u],
  ['price', /^(?:[àáa][- ]?pris|pris|styckpris|enhetspris|pris\/enh(?:et)?)(?: (?:kr|sek))?$/u],
  ['rate', /^(?:moms ?%|moms ?sats|momssats)$/u],
  ['discount', /^rabatt(?: ?%)?$/u],
  ['amount', /^(?:belopp|summa|totalt?|netto|nettobelopp|sek|kr)(?: (?:kr|sek))?$/u],
  ['date', /^(?:datum|period|tid)$/u],
  ['pos', /^(?:#|pos\.?|rad)$/u],
  // A plain "Moms" column: read as the line's rate only where it prints a percentage
  ['vat', /^moms$/u],
];

/** How far the first and last columns reach beyond their headers, in points. */
const EDGE_REACH = 40;
const SUBTOTAL = /^(?:deltotal|delsumma|subtotal)$/u;
const TOTAL = /^(?:summa|totalt?|summa .*)$/u;
const QTY_WITH_UNIT = /^-?\d[\d ]*(?:[,.]\d+)?\s*\p{L}/u;
const DATE_ONLY = /^[\d\s.:/–-]+$/u;
const QTY_UNIT = /^(-?\d[\d ]*(?:[,.]\d+)?)\s*(\p{L}[\p{L}.²³0-9]*)?$/u;
/** A labelled note under an item ("Anteckning: ..."): it and the description lines after it are the item's note (BT-127). */
const NOTE = /^(?:anteckning|notering|kommentar|not) ?: ?/iu;

const columnOf = (text: string) => COLUMNS.find(([, re]) => re.test(normalize(text)))?.[0];

export interface ItemValue {
  value: string;
  region: PdfRegion;
}

export interface Item {
  name?: ItemValue;
  quantity?: ItemValue;
  unitText?: ItemValue;
  price?: ItemValue;
  rate?: ItemValue;
  discount?: ItemValue;
  amount: ItemValue & { value: Decimal };
  /** A labelled note under the item and the description lines after it, one per text line (BT-127). */
  note?: ItemValue;
  /** Text lines under the item that are neither a wrapped description nor a date: description or note, unknown. */
  unclearName?: PdfRegion;
}

export interface ItemTable {
  header: Cell[];
  items: Item[];
  /** Every line of the table, header included: their cells are not read as labels or values elsewhere. */
  lines: Set<Line>;
}

function headerColumns(row: Cell[]): Column[] | undefined {
  const cols = row.map((c) => columnOf(c.text));
  const known = cols.filter((c) => c !== undefined);
  if (!known.includes('desc') || !known.includes('amount') || known.length < row.length - 1 || known.length < 2) return undefined;
  return cols as Column[];
}

/** Every item table; `headerOf` gives the columns of a header line (rule layers pass their own header definitions). */
export function findItemTables(rows: Cell[][], headerOf: (row: Cell[]) => (Column | undefined)[] | undefined = headerColumns): ItemTable[] {
  const tables: ItemTable[] = [];
  for (let i = 0; i < rows.length; i++) {
    const header = splitHeader(rows[i]);
    const cols = headerOf(header);
    if (!cols) continue;
    const table = readTable(rows, i, cols, header);
    tables.push(table);
    i += table.lines.size - 1;
  }
  return tables;
}

/**
 * A header line whose headings sit too close to form separate segments ("À-pris Moms %"): such a segment is split into
 * its text runs when every run is a known heading, else at the one word boundary where both halves are known headings
 * (each half's position estimated from its share of the characters).
 */
function splitHeader(row: Cell[]): Cell[] {
  return row.flatMap((cell) => {
    if (columnOf(cell.text)) return [cell];
    const runs = cell.line.segments[cell.index]?.runs ?? [];
    if (runs.length > 1 && runs.every((r) => columnOf(r.text)))
      return runs.map((r) => ({ ...cell, text: r.text.trim(), x: r.x, y: r.y, width: r.width, height: r.height, fontSize: r.fontSize }));
    const words = cell.text.split(' ');
    const cuts = words.slice(1).flatMap((_, i) => {
      const left = words.slice(0, i + 1).join(' ');
      return columnOf(left) && columnOf(words.slice(i + 1).join(' ')) ? [left.length + 1] : [];
    });
    if (cuts.length !== 1) return [cell];
    const at = cell.x + (cell.width * cuts[0]) / cell.text.length;
    return [
      { ...cell, text: cell.text.slice(0, cuts[0] - 1), width: at - cell.x },
      { ...cell, text: cell.text.slice(cuts[0]), x: at, width: cell.x + cell.width - at },
    ];
  });
}

function readTable(rows: Cell[][], start: number, cols: (Column | undefined)[], header: Cell[]): ItemTable {
  // Column spans reach halfway to the neighbouring headers, so left- and right-aligned values both fall inside.
  const spans = header.map((c, k) => {
    const prev = header[k - 1];
    const next = header[k + 1];
    const x0 = prev ? (prev.x + prev.width + c.x) / 2 : c.x - EDGE_REACH;
    const x1 = next ? (c.x + c.width + next.x) / 2 : c.x + c.width + EDGE_REACH;
    return { x: x0, width: x1 - x0 };
  });
  const place = (cell: Cell) => {
    let best = -1;
    for (const [k, s] of spans.entries())
      if (overlapX(s, cell) >= Math.min(cell.width, s.width) / 2 && (best < 0 || overlapX(s, cell) > overlapX(spans[best], cell))) best = k;
    return best < 0 ? undefined : cols[best];
  };
  const lines = new Set<Line>([header[0].line]);
  const items: Item[] = [];
  const nameEnd = new Map<Item, number>();
  let inNote = false;
  let prev = header[0].line;
  for (let i = start + 1; i < rows.length; i++) {
    const row = rows[i];
    const line = row[0].line;
    const gap = line.y - (prev.y + prev.height);
    if (line.page !== prev.page || gap > Math.max(5 * line.height, 40) || row.some((c) => fieldLabel(c.text))) break;
    // A total row ends the table; a subtotal row is skipped
    const words = row.map((c) => normalize(c.text).replace(/:$/u, ''));
    if (headerColumns(row) || words.some((w) => TOTAL.test(w))) break;
    if (words.some((w) => SUBTOTAL.test(w))) {
      lines.add(line);
      prev = line;
      continue;
    }
    lines.add(line);
    prev = line;
    const placed = new Map<Column, Cell[]>();
    for (const cell of row) {
      const col = place(cell);
      if (col) placed.set(col, [...(placed.get(col) ?? []), cell]);
    }
    const one = (col: Column) => {
      const cells = placed.get(col);
      return cells?.length === 1 ? cells[0] : undefined;
    };
    const amountCell = one('amount');
    const amount = amountCell && parseAmount(amountCell.text);
    const text = (cells: Cell[] | undefined) =>
      cells?.length
        ? { value: cells.map((c) => c.text).join(' '), region: regionOf(cells.length === 1 ? cells[0] : merge(cells)) }
        : undefined;
    if (amountCell && amount) {
      inNote = false;
      const item: Item = { amount: { value: amount, region: regionOf(amountCell) } };
      const name = text(placed.get('desc'));
      // "1 Framtagande ..." where the position number ran into the description
      if (name && cols.includes('pos') && !placed.has('pos')) name.value = name.value.replace(/^\d{1,3} (?=\p{L})/u, '');
      if (name) {
        item.name = name;
        nameEnd.set(item, name.region.x + name.region.width);
      }
      // "15 Tim" may stand in a quantity, unit or combined column
      const qu = one('qtyUnit') ?? [one('qty'), one('unit')].find((c) => c && QTY_WITH_UNIT.test(c.text));
      const m = qu && QTY_UNIT.exec(qu.text);
      if (qu && m && parseAmount(m[1])) {
        item.quantity = { value: parseAmount(m[1])!, region: regionOf(qu) };
        if (m[2]) item.unitText = { value: m[2], region: regionOf(qu) };
      } else {
        const q = one('qty');
        const v = q && parseAmount(q.text);
        if (q && v) item.quantity = { value: v, region: regionOf(q) };
        const u = one('unit');
        if (u && !parseAmount(u.text)) item.unitText = { value: u.text, region: regionOf(u) };
      }
      const p = one('price');
      const pv = p && parseAmount(p.text);
      if (p && pv) item.price = { value: pv, region: regionOf(p) };
      const r = one('rate') ?? (one('vat')?.text.includes('%') ? one('vat') : undefined);
      const rv = r && (parseRate(r.text) ?? parseCategoryRate(r.text));
      if (r && rv) item.rate = { value: rv, region: regionOf(r) };
      const d = one('discount');
      if (d && /\d/u.test(d.text)) item.discount = { value: d.text, region: regionOf(d) };
      items.push(item);
    } else if ([...placed.keys()].every((k) => k === 'desc') && placed.has('desc') && items.length) {
      const last = items[items.length - 1];
      const cells = placed.get('desc')!;
      // Text that does not start at the description's edge is not part of the item, e.g. a page footer
      if (last.name && Math.abs(cells[0].x - last.name.region.x) > 2) break;
      const more = text(cells)!;
      const label = NOTE.exec(more.value);
      if (label || inNote) {
        inNote = true;
        const line = more.value.slice(label?.[0].length ?? 0);
        if (line)
          last.note = last.note
            ? { value: `${last.note.value}\n${line}`, region: merge([last.note.region, more.region]) }
            : { value: line, region: more.region };
        continue;
      }
      if (DATE_ONLY.test(more.value)) continue;
      if (last.name && !last.unclearName && wraps(last.name.region.x, nameEnd.get(last) ?? 0, cells, spans[cols.indexOf('desc')])) {
        nameEnd.set(last, Math.max(...cells.map((c) => c.x + c.width)));
        last.name = { value: `${last.name.value} ${more.value}`, region: merge([last.name.region, more.region]) };
      } else last.unclearName = more.region;
    }
  }
  return { header, items, lines };
}

/**
 * A description line continues the item above only when its first word would not have fitted after the line above
 * within the description column (the text was wrapped), and it is text, not a date or period. Other lines under an
 * item are reported as unclear.
 */
function wraps(nameX: number, nameEnd: number, cells: Cell[], span: { x: number; width: number }): boolean {
  const text = cells.map((c) => c.text).join(' ');
  if (Math.abs(cells[0].x - nameX) > 2 || !Number.isFinite(span.x + span.width)) return false;
  const firstWord = (text.split(' ')[0].length / text.length) * cells[0].width;
  return firstWord + 0.3 * cells[0].fontSize > span.x + span.width - nameEnd;
}

export function merge(boxes: { page: number; x: number; y: number; width: number; height: number }[]): PdfRegion {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    page: boxes[0].page,
    x,
    y,
    width: r(Math.max(...boxes.map((b) => b.x + b.width)) - x),
    height: r(Math.max(...boxes.map((b) => b.y + b.height)) - y),
  };
}
