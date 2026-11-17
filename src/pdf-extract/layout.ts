/**
 * Layout model of a PDF's text layer, for deterministic invoice extraction (no OCR, no network).
 *
 * pdfjs-dist is loaded on demand, like pdf-lib in envelope-pdf.ts, so it stays out of the initial bundle. Its modern
 * build is used, so the native canvas package it lists as optional is never loaded (the legacy build loads it on
 * import in Node). That build calls built-ins only Bun 1.4+ and current browsers have (Node keeps Math.sumPrecise
 * behind a flag); other runtimes get the `unsupported-runtime` reason instead of an exception. pdf.js prints one
 * "Please use the `legacy` build" warning on first load in Bun; it has no setting to turn that off before import.
 * The worker runs in the calling thread, so no Worker, worker URL or fetch is involved.
 *
 * Work is bounded by {@link PdfLimits}: a file over a limit gives the `too-large` reason. The page, text run and
 * operator limits are deterministic; the time limit is checked between pages and depends on the machine.
 *
 * Fonts that need predefined CMaps (non-Identity CJK encodings) or non-embedded standard font files read nothing
 * from the network: without `cMapUrl`/`standardFontDataUrl` their text may come out empty or garbled, which the
 * quality check reports. Callers that need them pass the directories shipped in the package (`pdfjs-dist/cmaps/`,
 * `pdfjs-dist/standard_fonts/`), as a file path in Node and Bun or as a URL they host in browsers.
 *
 * Coordinates are PDF points at scale 1 in the page's viewport: origin at the top-left corner of the visible page
 * (CropBox, /Rotate applied), x to the right, y down, values rounded to 0.01. A run's box is axis-aligned and spans
 * its font's ascent and descent; `rotation` is the reading direction in degrees counter-clockwise (0 = upright).
 */
import { type Block, findTables, groupBlocks, groupLines, type Line, type TableCandidate } from './layout/group.js';
import { checkQuality, type TextQuality, type UnsupportedReason } from './layout/quality.js';

export type { Block, Line, Segment, TableCandidate, TableColumn, TableRow } from './layout/group.js';
export { HEADER_TERMS } from './layout/group.js';
export type { TextQuality, UnsupportedCode, UnsupportedReason } from './layout/quality.js';

export interface TextRun {
  page: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Font name as written in the PDF (BaseFont, with any subset prefix), or pdf.js's family guess. */
  fontName: string;
  fontSize: number;
  rotation: number;
}

/** A thin filled or stroked path: a ruling line of a table or a separator. */
export interface Rule {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageFont {
  name: string;
  type3: boolean;
}

export interface LayoutPage {
  /** 1-based. */
  number: number;
  width: number;
  height: number;
  runs: TextRun[];
  lines: Line[];
  blocks: Block[];
  tables: TableCandidate[];
  rules: Rule[];
  fonts: PageFont[];
  /** Share of the page covered by images, 0 to 1 (overlaps counted once per image). */
  imageCoverage: number;
}

export interface LayoutDocument {
  producer?: string;
  creator?: string;
  pageCount: number;
  /** True when the file has an /Encrypt dictionary, whether or not it opened without a password. */
  encrypted: boolean;
  pages: LayoutPage[];
  quality: TextQuality;
}

export interface LayoutOptions {
  /** Directory or URL of pdf.js's binary CMaps (ending in "/"); not used unless given. */
  cMapUrl?: string;
  /** Directory or URL of pdf.js's standard font data (ending in "/"); not used unless given. */
  standardFontDataUrl?: string;
  /** Work limits; each one left out takes its {@link DEFAULT_PDF_LIMITS} value. */
  limits?: Partial<PdfLimits>;
}

/** Bounds on the work done for one PDF, in the manner of `UnwrapLimits`. */
export interface PdfLimits {
  /** Pages per PDF. Checked before any page is read. */
  maxPages: number;
  /** Text runs (pdf.js text items) across all pages. */
  maxTextRuns: number;
  /** Drawing operators across all pages. */
  maxOperators: number;
  /** Time spent reading pages, in milliseconds; checked after each page. */
  maxMilliseconds: number;
}

/** Well above any invoice: the largest synthetic invoice has 3 pages and reads in well under a second. */
export const DEFAULT_PDF_LIMITS: PdfLimits = {
  maxPages: 100,
  maxTextRuns: 200_000,
  maxOperators: 2_000_000,
  maxMilliseconds: 20_000,
};

export type Pdfjs = typeof import('pdfjs-dist');

/** Built-ins the modern pdf.js build calls without a fallback. */
export function missingRuntimeFeatures(): string[] {
  const has = (owner: object | undefined, name: string) => typeof (owner as Record<string, unknown> | undefined)?.[name] === 'function';
  return [
    has(Math, 'sumPrecise') ? '' : 'Math.sumPrecise',
    has(Map.prototype, 'getOrInsertComputed') ? '' : 'Map.prototype.getOrInsertComputed',
    has(Uint8Array.prototype, 'toHex') ? '' : 'Uint8Array.prototype.toHex',
    has(Promise, 'try') ? '' : 'Promise.try',
  ].filter(Boolean);
}
type Matrix = [number, number, number, number, number, number];

let loading: Promise<Pdfjs> | undefined;
export function pdfjs(): Promise<Pdfjs> {
  loading ??= (async () => {
    // pdf.js runs its worker code in this thread when it finds the handler here: no Worker, no worker URL.
    const g = globalThis as { pdfjsWorker?: unknown };
    g.pdfjsWorker ??= await import('pdfjs-dist/build/pdf.worker.mjs');
    return import('pdfjs-dist');
  })().catch((error) => {
    loading = undefined;
    throw error;
  });
  return loading;
}

const round = (n: number) => Math.round(n * 100) / 100 + 0; // + 0 turns -0 into 0
const finite = (n: number | undefined, fallback = 0) => (Number.isFinite(n) ? (n as number) : fallback);

const unsupported = (reason: UnsupportedReason, encrypted = false): LayoutDocument => ({
  pageCount: 0,
  encrypted,
  pages: [],
  quality: { supported: false, reasons: [reason] },
});

const UNREADABLE = 'The file is not a readable PDF';
const tooLarge = (limit: keyof PdfLimits, limits: PdfLimits) =>
  unsupported({ code: 'too-large', detail: `The PDF is over the extraction limit ${limit} (${limits[limit]})` });

export async function extractLayout(bytes: Uint8Array, options: LayoutOptions = {}): Promise<LayoutDocument> {
  const missing = missingRuntimeFeatures();
  if (missing.length)
    return unsupported({
      code: 'unsupported-runtime',
      detail: `PDF extraction is supported on Bun 1.4+ and current browsers; this runtime lacks ${missing.join(', ')}`,
    });
  const { limits: given, ...urls } = options;
  const limits = { ...DEFAULT_PDF_LIMITS, ...given };
  const lib = await pdfjs();
  const task = lib.getDocument({
    data: bytes.slice(), // pdf.js may take ownership of the buffer
    ...urls,
    verbosity: lib.VerbosityLevel.ERRORS,
    disableFontFace: true,
    useSystemFonts: false,
    fontExtraProperties: true,
    useWasm: false,
    stopAtErrors: false,
  });
  try {
    const doc = await task.promise.catch((error: unknown) =>
      error instanceof lib.PasswordException ? ('encrypted' as const) : ('unreadable' as const),
    );
    if (typeof doc === 'string') {
      const detail = doc === 'encrypted' ? 'The file needs a password to open' : UNREADABLE;
      return unsupported({ code: doc, detail }, doc === 'encrypted');
    }
    if (doc.numPages > limits.maxPages) return tooLarge('maxPages', limits);
    const { info } = (await parsed(doc.getMetadata())) as { info: Record<string, unknown> };
    const text = (key: string) => (typeof info[key] === 'string' && info[key] ? { [key.toLowerCase()]: info[key] } : {});
    const pages: LayoutPage[] = [];
    const work = { started: performance.now(), runs: 0, operators: 0 };
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await readPage(lib, await parsed(doc.getPage(n)), n, limits, work);
      if (typeof page === 'string') return tooLarge(page, limits);
      pages.push(page);
      if (performance.now() - work.started > limits.maxMilliseconds) return tooLarge('maxMilliseconds', limits);
    }
    return {
      ...(text('Producer') as { producer?: string }),
      ...(text('Creator') as { creator?: string }),
      pageCount: doc.numPages,
      encrypted: Boolean(info.EncryptFilterName),
      pages,
      quality: checkQuality(pages),
    };
  } catch (error) {
    if (error instanceof Unparsable) return unsupported({ code: 'unreadable', detail: UNREADABLE });
    throw error;
  } finally {
    await task.destroy();
  }
}

/** A pdf.js call failed on the file's structure (bad xref, stream or object); unlike a fault in this module, it is the file's. */
class Unparsable {}
const parsed = <T>(p: Promise<T>): Promise<T> =>
  p.catch(() => {
    throw new Unparsable();
  });

type PdfPage = Awaited<ReturnType<Awaited<ReturnType<Pdfjs['getDocument']>['promise']>['getPage']>>;

/** Reads one page, or names the limit the running totals in `work` went over. */
async function readPage(
  lib: Pdfjs,
  page: PdfPage,
  number: number,
  limits: PdfLimits,
  work: { runs: number; operators: number },
): Promise<LayoutPage | 'maxTextRuns' | 'maxOperators'> {
  const viewport = page.getViewport({ scale: 1 });
  const vt = viewport.transform as Matrix;
  const content = await parsed(page.getTextContent());
  work.runs += content.items.length;
  if (work.runs > limits.maxTextRuns) return 'maxTextRuns';
  const ops = await parsed(page.getOperatorList()); // also resolves the fonts used by the text
  work.operators += ops.fnArray.length;
  if (work.operators > limits.maxOperators) return 'maxOperators';
  const fonts = new Map<string, PageFont>();
  const fontOf = (id: string): PageFont => {
    let font = fonts.get(id);
    if (!font) {
      const data = page.commonObjs.has(id) ? (page.commonObjs.get(id) as { name?: string; type?: string }) : {};
      font = { name: data.name || content.styles[id]?.fontFamily || 'unknown', type3: data.type === 'Type3' };
      fonts.set(id, font);
    }
    return font;
  };

  const runs: TextRun[] = [];
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue;
    const m = lib.Util.transform(vt, item.transform) as Matrix;
    const size = Math.hypot(m[2], m[3]);
    if (!size) continue;
    const style = content.styles[item.fontName];
    const ascent = finite(style?.ascent) || 0.8;
    const descent = finite(style?.descent, -0.2);
    const length = Math.hypot(m[0], m[1]) ? finite(item.width) : 0;
    const dir = [m[0] / Math.hypot(m[0], m[1]), m[1] / Math.hypot(m[0], m[1])];
    const up = [m[2] / size, m[3] / size];
    const corners = [0, length].flatMap((a) =>
      [descent * size, ascent * size].map((b) => [m[4] + dir[0] * a + up[0] * b, m[5] + dir[1] * a + up[1] * b]),
    );
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    runs.push({
      page: number,
      text: item.str,
      x: round(x),
      y: round(y),
      width: round(Math.max(...xs) - x),
      height: round(Math.max(...ys) - y),
      fontName: fontOf(item.fontName).name,
      fontSize: round(size),
      rotation: (((Math.round((Math.atan2(-m[1], m[0]) * 180) / Math.PI) % 360) + 360) % 360) + 0,
    });
  }

  const { rules, imageCoverage } = graphics(lib, ops, vt, viewport.width, viewport.height, number);
  const lines = groupLines(runs);
  const usedFonts = [...new Map([...fonts.values()].map((f) => [f.name, f])).values()].sort((a, b) => a.name.localeCompare(b.name));
  return {
    number,
    width: round(viewport.width),
    height: round(viewport.height),
    runs: [...runs].sort((a, b) => a.y - b.y || a.x - b.x),
    lines,
    blocks: groupBlocks(lines),
    tables: findTables(lines, rules),
    rules,
    fonts: usedFonts,
    imageCoverage,
  };
}

/** Ruling lines and image coverage from the operator list, tracking the transformation matrix through save/restore. */
function graphics(lib: Pdfjs, list: { fnArray: number[]; argsArray: unknown[] }, vt: Matrix, w: number, h: number, page: number) {
  const { OPS, Util } = lib;
  const images = new Set<number>([
    OPS.paintImageXObject,
    OPS.paintInlineImageXObject,
    OPS.paintImageMaskXObject,
    OPS.paintImageXObjectRepeat,
    OPS.paintInlineImageXObjectGroup,
  ]);
  const stack: Matrix[] = [];
  let ctm = vt;
  const rules: Rule[] = [];
  let covered = 0;
  const box = (minMax: number[], m: Matrix) => {
    const r = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
    Util.axialAlignedBoundingBox([minMax[0], minMax[1], minMax[2], minMax[3]], m, r);
    const x0 = Math.max(0, r[0]);
    const y0 = Math.max(0, r[1]);
    return { x: x0, y: y0, width: Math.min(w, r[2]) - x0, height: Math.min(h, r[3]) - y0 };
  };
  list.fnArray.forEach((fn, i) => {
    const args = list.argsArray[i] as unknown[];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? vt;
    else if (fn === OPS.transform) ctm = Util.transform(ctm, args as Matrix) as Matrix;
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      if (Array.isArray(args[0])) ctm = Util.transform(ctm, args[0] as Matrix) as Matrix;
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? vt;
    else if (fn === OPS.constructPath && args[2]) {
      const b = box(Array.from(args[2] as ArrayLike<number>), ctm);
      const thin = Math.min(b.width, b.height);
      const long = Math.max(b.width, b.height);
      if (thin >= 0 && thin <= 2 && long >= 20 && long >= 20 * thin)
        rules.push({ page, x: round(b.x), y: round(b.y), width: round(b.width), height: round(b.height) });
    } else if (images.has(fn)) {
      const b = box([0, 0, 1, 1], ctm);
      if (b.width > 0 && b.height > 0) covered += (b.width * b.height) / (w * h);
    }
  });
  return { rules, imageCoverage: round(Math.min(1, covered)) };
}
