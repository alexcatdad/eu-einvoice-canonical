/**
 * QR codes drawn as vector paths: filled axis-aligned rectangles (one per module, or merged runs of modules) are
 * clustered into a square, the module count is inferred from the smallest rectangle side, and the module matrix is
 * sampled at module centres. The decoder then decides which candidate module count, if any, is a valid symbol.
 */

/** A filled rectangle in page coordinates (top-left origin), in paint order. */
export interface FilledRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  dark: boolean;
}

export interface VectorCandidate {
  box: { x: number; y: number; width: number; height: number };
  /** Module matrices to try, the likeliest module count first. */
  matrices: () => Iterable<boolean[][]>;
}

const side = (r: FilledRect) => Math.min(r.x1 - r.x0, r.y1 - r.y0);
/** Valid QR sizes: versions 1 to 40. */
const SIZES = Array.from({ length: 40 }, (_, v) => 21 + 4 * v);

/** Square clusters of small dark rectangles that may be QR codes. */
export function vectorCandidates(rects: readonly FilledRect[]): VectorCandidate[] {
  const dark = rects.filter((r) => r.dark && side(r) >= 0.2 && side(r) <= 12);
  if (dark.length < 20) return [];
  // Union-find over rectangles separated by at most about one module (the quiet zone is four)
  const parent = dark.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const order = dark.map((_, i) => i).sort((a, b) => dark[a].x0 - dark[b].x0);
  const reach = Math.max(...dark.map(side)) * 1.5;
  for (let a = 0; a < order.length; a++) {
    const r = dark[order[a]];
    for (let b = a + 1; b < order.length; b++) {
      const s = dark[order[b]];
      if (s.x0 > r.x1 + reach) break;
      const gap = 1.5 * Math.min(side(r), side(s)) + 0.01;
      if (s.x0 <= r.x1 + gap && r.x0 <= s.x1 + gap && s.y0 <= r.y1 + gap && r.y0 <= s.y1 + gap) parent[find(order[a])] = find(order[b]);
    }
  }
  const groups = new Map<number, FilledRect[]>();
  dark.forEach((r, i) => {
    const g = groups.get(find(i));
    if (g) g.push(r);
    else groups.set(find(i), [r]);
  });

  const out: VectorCandidate[] = [];
  for (const group of groups.values()) {
    if (group.length < 20) continue;
    const x0 = Math.min(...group.map((r) => r.x0));
    const y0 = Math.min(...group.map((r) => r.y0));
    const w = Math.max(...group.map((r) => r.x1)) - x0;
    const h = Math.max(...group.map((r) => r.y1)) - y0;
    if (w < 15 || Math.abs(w - h) > 0.05 * Math.max(w, h)) continue;
    const size = (w + h) / 2;
    const sides = group.map(side).sort((a, b) => a - b);
    const estimate = size / sides[Math.floor(sides.length * 0.1)];
    const counts = SIZES.filter((n) => Math.abs(n - estimate) <= Math.max(4, 0.15 * estimate)).sort(
      (a, b) => Math.abs(a - estimate) - Math.abs(b - estimate),
    );
    // Every fill over the square, light ones included, in paint order
    const painted = rects.filter((r) => r.x1 > x0 && r.x0 < x0 + w && r.y1 > y0 && r.y0 < y0 + h);
    out.push({
      box: { x: x0, y: y0, width: w, height: h },
      *matrices() {
        for (const n of counts) yield sample(painted, x0, y0, w / n, h / n, n);
      },
    });
  }
  return out;
}

/** The module matrix: a module is dark when the last fill covering its centre is dark. */
function sample(rects: readonly FilledRect[], x0: number, y0: number, px: number, py: number, n: number): boolean[][] {
  const bits = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  for (const r of rects) {
    const c0 = Math.max(0, Math.ceil((r.x0 - x0) / px - 0.5));
    const c1 = Math.min(n - 1, Math.floor((r.x1 - x0) / px - 0.5));
    const r0 = Math.max(0, Math.ceil((r.y0 - y0) / py - 0.5));
    const r1 = Math.min(n - 1, Math.floor((r.y1 - y0) / py - 0.5));
    for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) bits[y][x] = r.dark;
  }
  return bits;
}
