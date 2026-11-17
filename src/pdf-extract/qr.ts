/**
 * Payment QR codes on a PDF invoice. QR decoding is deterministic, not OCR: codes are read from embedded images
 * (raw pixels from pdf.js, no page rendering, no canvas) and from codes drawn as vector rectangles (the module
 * matrix is rebuilt from the paths). Swedish UsingQR payloads (Visma Spcs) then fill missing payment fields and
 * cross-check the ones read from the text: a disagreement is a problem, and the text value is kept.
 *
 * The decoder (`qr`, pure TypeScript) is loaded on demand like pdfjs-dist, so it stays out of the initial bundle.
 */
import type { PdfRegion, SourceWarning } from '../canonical.js';
import { cmp } from '../values.js';
import type { GenericRead, ReadValue } from './generic.js';
import { type Pdfjs, pdfjs } from './layout.js';
import { type Gray, matrixToGray, type PdfjsImage, toGray, toRgba } from './qr/raster.js';
import { parseUsingQr, type UsingQr, usingQrAmount, usingQrDate } from './qr/usingqr.js';
import { type FilledRect, vectorCandidates } from './qr/vector.js';
import { setField } from './rules/apply.js';
import { parseBankgiro, parseBic, parseIban, parseOcr, parsePlusgiro } from './se/index.js';

export { parseUsingQr, type UsingQr } from './qr/usingqr.js';

/** A decoded QR code: its text and where it is on the page (PDF points, top-left origin, like the layout model). */
export interface QrCode {
  text: string;
  region: PdfRegion;
  source: 'image' | 'vector';
}

type Matrix = [number, number, number, number, number, number];
type Decode = typeof import('qr/decode.js').default;

let decoder: Promise<Decode> | undefined;
function loadDecoder(): Promise<Decode> {
  decoder ??= import('qr/decode.js')
    .then((m) => m.default)
    .catch((error) => {
      decoder = undefined;
      throw error;
    });
  return decoder;
}

/** Smallest image side, in pixels and in points, worth trying. */
const MIN_PIXELS = 21;
const MIN_POINTS = 20;
const MAX_PIXELS = 16_000_000;
/** Safety limit for an image pdf.js never delivers (a broken stream); normal images arrive with the page. */
const IMAGE_WAIT_MS = 10_000;

/** Every QR code on the given pages (all pages when `pages` is not given), in page and paint order. */
export async function findQrCodes(bytes: Uint8Array, pages?: number): Promise<QrCode[]> {
  const lib = await pdfjs();
  const decode = await loadDecoder();
  const task = lib.getDocument({
    data: bytes.slice(),
    verbosity: lib.VerbosityLevel.ERRORS,
    disableFontFace: true,
    useSystemFonts: false,
    useWasm: false,
    stopAtErrors: false,
    // Raw pixel data instead of ImageBitmap objects, in every runtime
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
  });
  try {
    const doc = await task.promise;
    const codes: QrCode[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, pages ?? doc.numPages); n++)
      codes.push(...(await readPage(lib, decode, await doc.getPage(n), n)));
    return codes;
  } finally {
    await task.destroy();
  }
}

type PdfPage = Awaited<ReturnType<Awaited<ReturnType<Pdfjs['getDocument']>['promise']>['getPage']>>;

async function readPage(lib: Pdfjs, decode: Decode, page: PdfPage, number: number): Promise<QrCode[]> {
  const { OPS, Util } = lib;
  const viewport = page.getViewport({ scale: 1 });
  const vt = viewport.transform as Matrix;
  const list = await page.getOperatorList();
  const fills = new Set<number>([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const codes: QrCode[] = [];
  const rects: FilledRect[] = [];
  const stack: { ctm: Matrix; dark: boolean | undefined }[] = [];
  let ctm = vt;
  let dark: boolean | undefined = true; // default fill colour is black; undefined for patterns and unknown colours
  const region = (b: number[]): PdfRegion => {
    const r = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
    Util.axialAlignedBoundingBox([b[0], b[1], b[2], b[3]], ctm, r);
    const round = (v: number) => Math.round(v * 100) / 100 + 0;
    return { page: number, x: round(r[0]), y: round(r[1]), width: round(r[2] - r[0]), height: round(r[3] - r[1]) };
  };
  // Images are fetched after the walk: pdf.js may still be decoding them when the operator list is ready
  const images: { at: PdfRegion; image: () => Promise<PdfjsImage | undefined> }[] = [];
  const addImage = (image: () => Promise<PdfjsImage | undefined>) => {
    const at = region([0, 0, 1, 1]);
    if (Math.min(at.width, at.height) >= MIN_POINTS) images.push({ at, image });
  };
  const stored = (id: string) => () => {
    const store = id.startsWith('g_') ? page.commonObjs : page.objs;
    return new Promise<PdfjsImage | undefined>((resolve) => {
      const timer = setTimeout(() => resolve(undefined), IMAGE_WAIT_MS);
      store.get(id, (img: unknown) => {
        clearTimeout(timer);
        resolve((img ?? undefined) as PdfjsImage | undefined);
      });
    });
  };

  list.fnArray.forEach((fn, i) => {
    const args = list.argsArray[i] as unknown[];
    if (fn === OPS.save) stack.push({ ctm, dark });
    else if (fn === OPS.restore) ({ ctm, dark } = stack.pop() ?? { ctm: vt, dark: true });
    else if (fn === OPS.transform) ctm = Util.transform(ctm, args as Matrix) as Matrix;
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push({ ctm, dark });
      if (Array.isArray(args[0])) ctm = Util.transform(ctm, args[0] as Matrix) as Matrix;
    } else if (fn === OPS.paintFormXObjectEnd) ({ ctm, dark } = stack.pop() ?? { ctm: vt, dark: true });
    else if (fn === OPS.setFillRGBColor) dark = isDark(args[0]);
    else if (fn === OPS.setFillColorN || fn === OPS.shadingFill) dark = undefined;
    else if (fn === OPS.constructPath && fills.has(args[0] as number) && dark !== undefined)
      rects.push(...pathRects(Array.from((args[1] as ArrayLike<number>[])?.[0] ?? []), ctm, dark));
    else if (fn === OPS.paintImageXObject) addImage(stored(args[0] as string));
    else if (fn === OPS.paintInlineImageXObject) addImage(async () => args[0] as PdfjsImage);
    else if (fn === OPS.paintImageMaskXObject) {
      // A stencil mask: 1-bit data without a kind; both polarities are tried
      const img = args[0] as PdfjsImage | undefined;
      addImage(async () => img && { width: img.width, height: img.height, data: img.data });
    }
  });

  for (const { at, image } of images) {
    const img = await image();
    if (!img || Math.min(img.width, img.height) < MIN_PIXELS || img.width * img.height > MAX_PIXELS) continue;
    if (Math.max(img.width, img.height) > 3 * Math.min(img.width, img.height)) continue;
    const gray = toGray(img);
    const text = gray && decodeGray(decode, gray);
    if (text !== undefined) codes.push({ text, region: at, source: 'image' });
  }

  for (const c of vectorCandidates(rects))
    for (const bits of c.matrices()) {
      const text = decodeGray(decode, matrixToGray(bits), 4);
      if (text === undefined) continue;
      codes.push({ text, region: { page: number, ...roundBox(c.box) }, source: 'vector' });
      break;
    }
  return codes;
}

const roundBox = (b: { x: number; y: number; width: number; height: number }) => {
  const r = (v: number) => Math.round(v * 100) / 100 + 0;
  return { x: r(b.x), y: r(b.y), width: r(b.width), height: r(b.height) };
};

/** "#rrggbb" (pdf.js converts every device colour to RGB) as dark or light; undefined when not a colour. */
function isDark(color: unknown): boolean | undefined {
  const m = typeof color === 'string' && /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/iu.exec(color);
  if (!m) return undefined;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => Number.parseInt(h, 16));
  return r * 0.299 + g * 0.587 + b * 0.114 < 128;
}

/** Axis-aligned rectangles among a path's subpaths (pdf.js DrawOPS: 0 moveTo, 1 lineTo, 2 curveTo, 3 quadraticCurveTo, 4 closePath). */
function pathRects(data: number[], m: Matrix, dark: boolean): FilledRect[] {
  const out: FilledRect[] = [];
  let points: number[][] = [];
  let curved = false;
  const flush = () => {
    if (!curved && (points.length === 4 || points.length === 5)) {
      const pts = points.map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
      const xs = [...new Set(pts.slice(0, 4).map((p) => Math.round(p[0] * 1000)))];
      const ys = [...new Set(pts.slice(0, 4).map((p) => Math.round(p[1] * 1000)))];
      const axis = pts.slice(0, 4).every((p, i, a) => {
        const q = a[(i + 1) % 4];
        return Math.abs(p[0] - q[0]) < 1e-3 || Math.abs(p[1] - q[1]) < 1e-3;
      });
      if (axis && xs.length === 2 && ys.length === 2) {
        const [x0, x1] = xs.sort((a, b) => a - b).map((v) => v / 1000);
        const [y0, y1] = ys.sort((a, b) => a - b).map((v) => v / 1000);
        out.push({ x0, y0, x1, y1, dark });
      }
    }
    points = [];
    curved = false;
  };
  for (let i = 0; i < data.length; ) {
    const op = data[i++];
    if (op === 0) {
      flush();
      points.push([data[i++], data[i++]]);
    } else if (op === 1) points.push([data[i++], data[i++]]);
    else if (op === 2) {
      curved = true;
      i += 6;
    } else if (op === 3) {
      curved = true;
      i += 4;
    } else if (op === 4) flush();
    else break;
  }
  flush();
  return out;
}

/** Decodes a grey image: enlarged to at least about 200 pixels, with a white quiet zone, then inverted when that fails. */
function decodeGray(decode: Decode, gray: Gray, scale?: number): string | undefined {
  const s = scale ?? Math.min(8, Math.max(1, Math.ceil(200 / Math.min(gray.width, gray.height))));
  const pad = scale ? 4 * scale : Math.max(16, Math.round(0.1 * Math.max(gray.width, gray.height) * s));
  for (const invert of [false, true]) {
    try {
      // timeLimit: Infinity keeps retries independent of machine speed (the default is a wall-clock budget)
      return decode(toRgba(gray, s, pad, invert), { timeLimit: Number.POSITIVE_INFINITY });
    } catch {
      // not a QR code, or not readable at this polarity
    }
  }
  return undefined;
}

/**
 * Applies the payment QR codes to what the text rules read. Only UsingQR codes on the pages read are used; other
 * codes (Swish and the like) are ignored. Fields: amount due (type 1 only), due date, and the Bankgiro, Plusgiro or
 * IBAN account, each only when its check digits hold. A field the text did not give is filled with the QR code's
 * region as provenance; one the text gave with another value is a `qr-conflict` problem. The OCR reference is only
 * cross-checked (see below).
 */
export function applyPaymentQr(read: GenericRead, codes: readonly QrCode[]): GenericRead {
  const found = codes
    .filter((c) => read.pages === undefined || c.region.page <= read.pages)
    .map((c) => ({ code: c, qr: parseUsingQr(c.text) }))
    .filter((c): c is { code: QrCode; qr: UsingQr } => c.qr !== undefined);
  if (!found.length || read.notAnInvoice) return read;
  const out: GenericRead = { ...read, values: { ...read.values }, problems: [...read.problems] };
  if (new Set(found.map((f) => f.code.text)).size > 1) {
    out.problems.push({
      code: 'ambiguous',
      field: '/payments/0',
      message: 'Several payment QR codes with different content; none is used',
      region: found[0].code.region,
    });
    return out;
  }
  const [{ code, qr }] = found;
  const f = qr.fields;
  const region = code.region;
  const conflict = (field: string, what: string): SourceWarning => ({
    code: 'qr-conflict',
    field,
    message: `The payment QR code gives another ${what} than the text`,
    region,
  });
  const fill = (field: string, value: string | undefined, what: string, same: (a: string, b: string) => boolean) => {
    if (value === undefined) return;
    const text = out.values[field];
    if (!text) out.values[field] = { value, region };
    else if (!same(text.value, value)) out.problems.push(conflict(field, what));
  };
  const equal = (a: string, b: string) => a === b;

  // The amount is compared unless both currencies are known and differ; it is filled in only when the code gives
  // no currency or the text's
  const textCurrency = out.values['/currency']?.value;
  const qrCurrency = f.cur?.toUpperCase();
  const amount = qr.type === 1 ? usingQrAmount(f.due) : undefined;
  if (amount && out.values['/totals/payable']) {
    if (!(qrCurrency && textCurrency && qrCurrency !== textCurrency))
      fill('/totals/payable', amount, 'amount due', (a, b) => cmp(a, b) === 0);
  } else if (amount && (!qrCurrency || qrCurrency === textCurrency)) fill('/totals/payable', amount, 'amount due', equal);
  fill('/dueDate', usingQrDate(f.ddt), 'due date', equal);
  // The reference is an OCR reference or the invoice number, and often one the page does not print: it is only
  // compared with an OCR reference read from the text, never filled in
  const ocr = f.iref ? parseOcr(f.iref)?.reference : undefined;
  const textOcr = out.values['/payments/0/remittanceInformation']?.value;
  if (ocr && textOcr && ocr !== textOcr && ocr !== out.values['/id']?.value?.replace(/\D/gu, ''))
    out.problems.push(conflict('/payments/0/remittanceInformation', 'OCR reference'));

  const account = (() => {
    const pt = f.pt?.toUpperCase();
    if (!f.acc) return undefined;
    if (pt === 'BG') return { kind: 'bankgiro' as const, value: parseBankgiro(f.acc)?.digits };
    if (pt === 'PG') return { kind: 'plusgiro' as const, value: parsePlusgiro(f.acc)?.digits };
    if (pt === 'IBAN') return { kind: 'iban' as const, value: parseIban(f.acc) };
    return undefined; // BBAN has no field here
  })();
  if (account?.value) {
    const provider = { bankgiro: 'SE:BANKGIRO', plusgiro: 'SE:PLUSGIRO' }[account.kind as string];
    // The text's account of the same kind (one per kind), matched by kind rather than position
    let same: string | undefined;
    for (let k = 0; out.values[`/payments/0/creditTransfers/${k}/accountId`]; k++) {
      const sp = out.values[`/payments/0/creditTransfers/${k}/serviceProviderId`]?.value;
      const giro = sp === 'SE:BANKGIRO' || sp === 'SE:PLUSGIRO';
      if (provider ? sp === provider : !giro) same ??= `/payments/0/creditTransfers/${k}/accountId`;
    }
    if (!same) {
      setField(out.values, `/payments/0/${account.kind}`, { value: account.value, region });
      const bic = account.kind === 'iban' && f.bc ? parseBic(f.bc) : undefined;
      if (bic) setField(out.values, '/payments/0/bic', { value: bic, region });
    } else if (out.values[same].value !== account.value) out.problems.push(conflict(same, `${account.kind} account`));
  }
  return out;
}

/**
 * Payment facts from the UsingQR code of a PDF whose text is not read (an image-only or garbled page): the fields
 * `applyPaymentQr` fills, plus the code's currency, each with the code's region. Undefined without one usable code.
 */
export function qrPaymentFacts(codes: readonly QrCode[]): Record<string, ReadValue> | undefined {
  const usable = codes.map((code) => ({ code, qr: parseUsingQr(code.text) })).filter((c) => c.qr);
  const cur = usable[0]?.qr?.fields.cur?.toUpperCase();
  const values: Record<string, ReadValue> =
    cur && /^[A-Z]{3}$/u.test(cur) ? { '/currency': { value: cur, region: usable[0].code.region } } : {};
  const out = applyPaymentQr({ values, problems: [], warnings: [], pricesIncludeVat: false, lineCount: 0 }, codes);
  return out.problems.length || Object.keys(out.values).length <= Object.keys(values).length ? undefined : out.values;
}
