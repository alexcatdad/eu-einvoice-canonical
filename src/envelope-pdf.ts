/** PDF/A-3 attachment extraction. Loaded on demand by envelope.ts so pdf-lib stays out of the initial bundle. */
import { Inflate, Unzlib } from 'fflate';

import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, type PDFObject, PDFRawStream, PDFString } from 'pdf-lib';
import { concat } from './bytes.js';
import type { UnwrapLimits, UnwrapResult } from './envelope.js';

export interface PdfCtx {
  out: UnwrapResult;
  limits: UnwrapLimits;
  unpacked: number;
}

export async function pdfAttachments(
  bytes: Uint8Array,
  pdfName: string | undefined,
  ctx: PdfCtx,
): Promise<{ name: string; data: Uint8Array }[]> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
  const specs: PDFDict[] = [];
  const names = pdf.catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
  const tree = names?.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict);
  if (tree) collectNameTree(tree, specs, 0);
  const af = pdf.catalog.lookupMaybe(PDFName.of('AF'), PDFArray);
  if (af)
    for (let i = 0; i < af.size(); i++) {
      const d = af.lookupMaybe(i, PDFDict);
      if (d && !specs.includes(d)) specs.push(d);
    }

  const out: { name: string; data: Uint8Array }[] = [];
  const seen = new Set<string>();
  for (const spec of specs) {
    const name = pdfText(spec.lookup(PDFName.of('UF'))) ?? pdfText(spec.lookup(PDFName.of('F'))) ?? 'attachment';
    const ef = spec.lookupMaybe(PDFName.of('EF'), PDFDict);
    const stream = ef?.lookup(PDFName.of('F')) ?? ef?.lookup(PDFName.of('UF'));
    if (!(stream instanceof PDFRawStream) || seen.has(name)) continue;
    seen.add(name);
    if (!/\.xml$/i.test(name)) continue; // only XML attachments are ever used; skip inflating the rest
    const budget = Math.min(ctx.limits.maxEntryBytes, ctx.limits.maxUnpackedBytes - ctx.unpacked);
    // The declared size (/Params /Size) is optional and can lie; it only allows an early refusal.
    const declared = stream.dict.lookupMaybe(PDFName.of('Params'), PDFDict)?.lookup(PDFName.of('Size'));
    if (declared && Number(declared.toString()) > budget) {
      ctx.out.skipped.push({ name: `${pdfName ?? 'pdf'}#${name}`, reason: 'PDF attachment over the size limit (declared size)' });
      continue;
    }
    const data = decodeStreamCapped(stream, budget);
    if (typeof data === 'string') {
      ctx.out.skipped.push({ name: `${pdfName ?? 'pdf'}#${name}`, reason: data });
      continue;
    }
    ctx.unpacked += data.length;
    out.push({ name, data });
  }
  return out;
}

/** Decodes an embedded-file stream without ever holding more than `max` decoded bytes. Returns a reason string on refusal. */
function decodeStreamCapped(stream: PDFRawStream, max: number): Uint8Array | string {
  const filter = stream.dict.lookup(PDFName.of('Filter'));
  const filters = filter instanceof PDFArray ? filter.asArray() : filter ? [filter] : [];
  const parms = stream.dict.lookup(PDFName.of('DecodeParms'));
  if (filters.length === 0) {
    return stream.contents.length > max ? 'PDF attachment over the size limit' : stream.contents;
  }
  if (filters.length > 1 || !(filters[0] instanceof PDFName) || filters[0].asString() !== '/FlateDecode') {
    return `PDF attachment uses an unsupported stream filter (${filters.map(String).join(' ')})`;
  }
  if (parms) {
    const predictor = (parms instanceof PDFDict ? parms : undefined)?.lookup(PDFName.of('Predictor'));
    if (predictor && Number(predictor.toString()) > 1) return 'PDF attachment uses a Flate predictor (not supported)';
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  let over = false;
  const onData = (chunk: Uint8Array) => {
    total += chunk.length;
    if (total > max) over = true;
    else chunks.push(chunk);
  };
  const src = stream.contents;
  // FlateDecode is zlib-wrapped (RFC 1950); a few writers emit raw deflate, so check the header.
  const zlibHeader = src.length >= 2 && (src[0] & 0x0f) === 8 && ((src[0] << 8) | src[1]) % 31 === 0;
  const inflate = zlibHeader ? new Unzlib(onData) : new Inflate(onData);
  // Small input slices bound the output of each push (deflate expands at most ~1032:1).
  const STEP = 4096;
  try {
    for (let i = 0; i < src.length && !over; i += STEP) inflate.push(src.subarray(i, i + STEP), i + STEP >= src.length);
  } catch (e) {
    return `PDF attachment could not be inflated: ${(e as Error).message}`;
  }
  if (over) return 'PDF attachment over the size limit';
  return concat(chunks);
}

function collectNameTree(node: PDFDict, out: PDFDict[], depth: number) {
  if (depth > 20) return; // malformed or cyclic name tree
  const pairs = node.lookupMaybe(PDFName.of('Names'), PDFArray);
  if (pairs)
    for (let i = 1; i < pairs.size(); i += 2) {
      const d = pairs.lookupMaybe(i, PDFDict);
      if (d) out.push(d);
    }
  const kids = node.lookupMaybe(PDFName.of('Kids'), PDFArray);
  if (kids)
    for (let i = 0; i < kids.size(); i++) {
      const k = kids.lookupMaybe(i, PDFDict);
      if (k) collectNameTree(k, out, depth + 1);
    }
}

function pdfText(o: PDFObject | undefined): string | undefined {
  return o instanceof PDFString || o instanceof PDFHexString ? o.decodeText() : undefined;
}
