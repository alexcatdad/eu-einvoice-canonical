/** Text cells (line segments) of a layout and the geometry that pairs a label with its value. */
import type { PdfRegion } from '../../canonical.js';
import type { LayoutDocument, Line } from '../layout.js';

export interface Cell {
  page: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  line: Line;
  /** Index of the segment in its line. */
  index: number;
}

export const regionOf = (c: { page: number; x: number; y: number; width: number; height: number }): PdfRegion => ({
  page: c.page,
  x: c.x,
  y: c.y,
  width: c.width,
  height: c.height,
});

const right = (c: { x: number; width: number }) => c.x + c.width;
const bottom = (c: { y: number; height: number }) => c.y + c.height;
export const overlapX = (a: { x: number; width: number }, b: { x: number; width: number }) =>
  Math.min(right(a), right(b)) - Math.max(a.x, b.x);

/** Upright lines of every page as rows of cells, top to bottom. */
export function cellRows(layout: LayoutDocument): Cell[][] {
  return layout.pages.flatMap((p) =>
    p.lines
      .filter((l) => l.rotation === 0)
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((line) =>
        line.segments.map((s, index) => ({
          page: p.number,
          text: s.text,
          x: s.x,
          y: s.y,
          width: s.width,
          height: s.height,
          fontSize: Math.max(...s.runs.map((r) => r.fontSize)),
          line,
          index,
        })),
      ),
  );
}

/** The cell right of `cell` on its line, if any. */
export function rightOf(rows: Cell[][], cell: Cell): Cell | undefined {
  return rows.find((r) => r[0]?.line === cell.line)?.[cell.index + 1];
}

/**
 * The cell directly under `cell`: on the nearest following line of the same page that has a cell overlapping it
 * horizontally, at most about one empty line below. Undefined when that line has several such cells.
 */
export function below(rows: Cell[][], cell: Cell): Cell | undefined {
  const hits = belowAll(rows, cell);
  return hits.length === 1 ? hits[0] : undefined;
}

/** Every cell of the nearest following line that overlaps `cell` horizontally, left to right. */
export function belowAll(rows: Cell[][], cell: Cell): Cell[] {
  const limit = bottom(cell) + 1.6 * Math.max(cell.height, 8);
  for (const row of rows) {
    const first = row[0];
    if (!first || first.page !== cell.page || first.line === cell.line || first.line.y > limit) continue;
    // Each cell's own top, not its line's (a larger font beside it raises the line), and half the font size, not half the
    // box: a text box can be far taller than its glyphs and reach into the next line
    const own = cell.y + Math.min(cell.height, 1.2 * cell.fontSize) / 2;
    const hits = row.filter((c) => c.y > own && overlapX(c, cell) > 0);
    if (hits.length) return hits;
  }
  return [];
}
