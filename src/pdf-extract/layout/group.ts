/**
 * Groups positioned text runs into lines, blocks and table candidates. Pure and deterministic: the same runs in any
 * order give the same result. Coordinates are page points with the origin at the top-left corner (see layout.ts).
 */
import type { Rule, TextRun } from '../layout.js';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Runs on one line that sit closer together than a column gap. */
export interface Segment extends Box {
  text: string;
  runs: TextRun[];
}

export interface Line extends Box {
  page: number;
  rotation: number;
  text: string;
  runs: TextRun[];
  segments: Segment[];
}

export interface Block extends Box {
  page: number;
  lines: Line[];
}

export interface TableColumn {
  x: number;
  width: number;
  align: 'left' | 'right';
  /** Header text over the column, when the table has a recognised header line. */
  header?: string;
}

export interface TableRow {
  y: number;
  /** One entry per column; undefined where the row has nothing in that column. */
  cells: (string | undefined)[];
  /** A row with a single cell, e.g. a wrapped description that belongs to the row above. */
  continuation: boolean;
  line: Line;
}

export interface TableCandidate extends Box {
  page: number;
  header?: Line;
  columns: TableColumn[];
  rows: TableRow[];
}

/** Column headings that mark a line as a table header (Swedish and English invoice tables). */
export const HEADER_TERMS: readonly RegExp[] = [
  /^(antal|ant\.?|kvantitet|qty|quantity|mängd)$/i,
  /^(enhet|unit|st|stk)$/i,
  /^([àáa][-\s]?pris|pris|price|unit price|styckpris)$/i,
  /^(moms|moms ?%|moms ?sats|momssats|vat|vat ?%|tax ?%)$/i,
  /^(belopp|summa|amount|total|totalt|netto|net|brutto|sek|kr)$/i,
  /^(benämning|beskrivning|artikel|art\.? ?nr|artikelnr|description|item|specifikation|text|produkt|tjänst)$/i,
  /^(rabatt|rabatt ?%|discount)$/i,
  /^(datum|date|period)$/i,
];

const SEGMENT_GAP = 0.9; // gap between runs, in font sizes, that starts a new segment (column)
const LINE_TOLERANCE = 0.5; // baseline offset, in font sizes, still on the same line
const BLOCK_GAP = 0.7; // vertical gap, in line heights, still in the same block
const ROW_GAP = 2.5; // vertical gap, in line heights, still in the same table
const EDGE = 2.5; // points within which two column edges count as aligned

const round = (n: number) => Math.round(n * 100) / 100;
const right = (b: { x: number; width: number }) => b.x + b.width;
const bottom = (b: Box) => b.y + b.height;

export function union(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, width: round(Math.max(...boxes.map(right)) - x), height: round(Math.max(...boxes.map(bottom)) - y) };
}

/** Position along (u) and across (v) the reading direction of a run's rotation. */
function frame(b: Box, rotation: number): { u: number; v: number } {
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const a = (rotation * Math.PI) / 180;
  return { u: cx * Math.cos(a) - cy * Math.sin(a), v: cx * Math.sin(a) + cy * Math.cos(a) };
}

const byPosition = (a: TextRun, b: TextRun) =>
  a.page - b.page || a.rotation - b.rotation || a.y - b.y || a.x - b.x || a.text.localeCompare(b.text);

export function groupLines(runs: TextRun[]): Line[] {
  const lines: { page: number; rotation: number; v: number; size: number; runs: TextRun[] }[] = [];
  const placed = [...runs].sort(byPosition).map((run) => ({ run, ...frame(run, run.rotation) }));
  placed.sort((a, b) => a.run.page - b.run.page || a.run.rotation - b.run.rotation || a.v - b.v || a.u - b.u);
  for (const { run, v } of placed) {
    const line = lines.find(
      (l) => l.page === run.page && l.rotation === run.rotation && Math.abs(l.v - v) <= LINE_TOLERANCE * Math.min(l.size, run.fontSize),
    );
    if (line) line.runs.push(run);
    else lines.push({ page: run.page, rotation: run.rotation, v, size: run.fontSize, runs: [run] });
  }
  return lines.map(({ page, rotation, runs: members }) => {
    const ordered = members.sort((a, b) => frame(a, rotation).u - frame(b, rotation).u);
    const segments = segment(ordered, rotation);
    return {
      page,
      rotation,
      ...union(ordered),
      text: segments.map((s) => s.text).join('  '),
      runs: ordered,
      segments,
    };
  });
}

function segment(runs: TextRun[], rotation: number): Segment[] {
  const groups: TextRun[][] = [];
  let end = Number.NEGATIVE_INFINITY;
  for (const run of runs) {
    const { u } = frame(run, rotation);
    const length = rotation % 180 === 0 ? run.width : run.height;
    const start = u - length / 2;
    if (groups.length && start - end <= SEGMENT_GAP * run.fontSize) groups[groups.length - 1].push(run);
    else groups.push([run]);
    end = Math.max(end, start + length);
  }
  return groups.map((group) => ({ ...union(group), text: joinRuns(group, rotation), runs: group }));
}

/** Joins runs with a space where the gap between them is wider than a fifth of the font size. */
function joinRuns(runs: TextRun[], rotation: number): string {
  let text = '';
  let end = Number.NEGATIVE_INFINITY;
  for (const run of runs) {
    const { u } = frame(run, rotation);
    const length = rotation % 180 === 0 ? run.width : run.height;
    const gap = u - length / 2 - end;
    text += text && gap > 0.2 * run.fontSize && !/\s$/.test(text) && !/^\s/.test(run.text) ? ` ${run.text}` : run.text;
    end = Math.max(end, u + length / 2);
  }
  return text.replace(/\s+/g, ' ').trim();
}

/** Reading order: top to bottom, then left to right; rotated lines after the upright ones of their page. */
export const readingOrder = (a: Line, b: Line) =>
  a.page - b.page || (a.rotation === 0 ? 0 : 1) - (b.rotation === 0 ? 0 : 1) || a.y - b.y || a.x - b.x;

export function groupBlocks(lines: Line[]): Block[] {
  const blocks: Block[] = [];
  for (const line of [...lines].sort(readingOrder)) {
    const block = blocks.find((b) => {
      const last = b.lines[b.lines.length - 1];
      const gap = line.y - bottom(last);
      return (
        b.page === line.page &&
        last.rotation === line.rotation &&
        gap >= -0.3 * line.height &&
        gap <= BLOCK_GAP * Math.max(line.height, last.height) &&
        line.x < right(b) &&
        right(line) > b.x
      );
    });
    if (block) Object.assign(block, union([block, line]), { lines: [...block.lines, line] });
    else blocks.push({ page: line.page, ...union([line]), lines: [line] });
  }
  return blocks;
}

export const isHeaderTerm = (text: string) => HEADER_TERMS.some((term) => term.test(text.replace(/\s+/g, ' ').trim()));

function isHeader(line: Line): boolean {
  const hits = line.segments.filter((s) => isHeaderTerm(s.text)).length;
  return hits >= 2 && hits * 2 >= line.segments.length;
}

const overlaps = (a: { x: number; width: number }, b: { x: number; width: number }) => a.x < b.x + b.width && b.x < a.x + a.width;

const overlap = (c: TableColumn, b: Box) => Math.min(right(c), right(b)) - Math.max(c.x, b.x);

/** The column a segment belongs to: the one it overlaps most, or one whose left or right edge it shares. */
function columnOf(columns: TableColumn[], s: Box): number {
  let best = -1;
  for (const [i, c] of columns.entries())
    if (overlaps(c, s) || Math.abs(c.x - s.x) <= EDGE || Math.abs(right(c) - right(s)) <= EDGE)
      if (best < 0 || overlap(c, s) > overlap(columns[best], s)) best = i;
  return best;
}

/**
 * Table candidates on upright lines: a header line with known column headings (e.g. "Moms %"), or two or more lines
 * whose segments align on shared left or right edges. Vertical ruling lines split a segment that a rule crosses.
 */
export function findTables(lines: Line[], rules: Rule[] = []): TableCandidate[] {
  const upright = lines.filter((l) => l.rotation === 0).sort(readingOrder);
  const tables: TableCandidate[] = [];
  let i = 0;
  while (i < upright.length) {
    const table = growTable(upright, i, rules);
    if (table) {
      tables.push(table.candidate);
      i = table.next;
    } else i++;
  }
  return tables;
}

function splitByRules(line: Line, rules: Rule[]): Segment[] {
  const cuts = rules.filter((r) => r.page === line.page && r.height > r.width && r.y <= line.y && bottom(r) >= bottom(line));
  if (!cuts.length) return line.segments;
  return line.segments.flatMap((s) => {
    const parts: TextRun[][] = [[]];
    for (const run of s.runs) {
      const last = parts[parts.length - 1];
      if (last.length && cuts.some((r) => r.x > right(last[last.length - 1]) - 0.5 && r.x < run.x + 0.5)) parts.push([run]);
      else last.push(run);
    }
    return parts.length === 1 ? [s] : parts.map(toSegment);
  });
}

const toSegment = (runs: TextRun[]): Segment => ({ ...union(runs), text: joinRuns(runs, 0), runs });

/** Splits a segment that spans two or more columns, giving each run to the column it overlaps most. */
function splitByColumns(segments: Segment[], columns: TableColumn[]): Segment[] {
  return segments.flatMap((s) => {
    if (s.runs.length < 2 || columns.filter((c) => overlaps(c, s)).length < 2) return [s];
    const groups = new Map<number, TextRun[]>();
    for (const run of s.runs) {
      const best = columns.reduce((b, c, i) => (overlap(c, run) > overlap(columns[b], run) ? i : b), 0);
      groups.set(best, [...(groups.get(best) ?? []), run]);
    }
    return [...groups.values()].map(toSegment);
  });
}

function growTable(lines: Line[], start: number, rules: Rule[]) {
  const first = lines[start];
  const firstSegments = splitByRules(first, rules);
  if (firstSegments.length < 2) return undefined;
  const header = isHeader(first) ? first : undefined;
  const columns: TableColumn[] = firstSegments.map((s) => ({
    x: s.x,
    width: s.width,
    align: 'left',
    ...(header ? { header: s.text } : {}),
  }));
  const rows: { line: Line; segments: Segment[] }[] = header ? [] : [{ line: first, segments: firstSegments }];
  let prev = first;
  let i = start + 1;
  for (; i < lines.length; i++) {
    const line = lines[i];
    const gap = line.y - bottom(prev);
    if (line.page !== first.page || gap > ROW_GAP * Math.max(prev.height, line.height)) break;
    const segments = splitByColumns(splitByRules(line, rules), columns);
    const matched = segments.filter((s) => columnOf(columns, s) >= 0).length;
    // A single cell continues the row above only when it sits as close as a wrapped line would.
    if (segments.length >= 2 ? matched < 2 : !matched || !rows.length || gap > BLOCK_GAP * line.height) break;
    if (segments.length >= 2) {
      for (const s of segments) {
        const c = columnOf(columns, s);
        if (c < 0) columns.push({ x: s.x, width: s.width, align: 'left' });
        else if (columns.filter((col) => overlaps(col, s)).length < 2)
          Object.assign(columns[c], {
            x: Math.min(columns[c].x, s.x),
            width: round(Math.max(right(columns[c]), right(s)) - Math.min(columns[c].x, s.x)),
          });
      }
      columns.sort((a, b) => a.x - b.x);
    }
    rows.push({ line, segments });
    prev = line;
  }
  if (rows.filter((r) => r.segments.length >= 2).length < (header ? 1 : 2)) return undefined;
  for (const [c, column] of columns.entries()) {
    const cells = rows.flatMap((r) => r.segments.filter((s) => columnOf(columns, s) === c));
    const spread = (f: (s: Segment) => number) => Math.max(...cells.map(f)) - Math.min(...cells.map(f));
    if (cells.length >= 2 && spread(right) < spread((s) => s.x)) column.align = 'right';
  }
  const tableRows: TableRow[] = rows.map(({ line, segments }) => {
    const cells: (string | undefined)[] = columns.map(() => undefined);
    for (const s of segments) {
      const c = columnOf(columns, s);
      if (c >= 0) cells[c] = cells[c] === undefined ? s.text : `${cells[c]} ${s.text}`;
    }
    return { y: line.y, cells, continuation: segments.length < 2, line };
  });
  const all = [...(header ? [header] : []), ...rows.map((r) => r.line)];
  return {
    candidate: { page: first.page, ...union(all), ...(header ? { header } : {}), columns, rows: tableRows },
    next: start + all.length,
  };
}
