/**
 * pdf-lib renderings for font and producer edge cases. No CreationDate, ModDate or /ID, so the bytes are stable.
 *
 * - standard14: Helvetica (WinAnsiEncoding, no ToUnicode), table with ruling lines
 * - no-ruling: Helvetica, table without any lines
 * - type0-gid: embedded DejaVu Sans as a Type0/CIDFontType2 font, Identity-H with CID = glyph id, no ToUnicode
 * - producer-word / producer-visma: Helvetica with a Producer and Creator of another generator
 */
import {
  beginText,
  endText,
  moveText,
  PDFDocument,
  type PDFFont,
  PDFHexString,
  type PDFPage,
  type PDFRef,
  PDFString,
  rgb,
  StandardFonts,
  setFontAndSize,
  showText,
} from 'pdf-lib';
import type { Printed, Variant } from './model.js';

interface Face {
  width(text: string, size: number): number;
  draw(page: PDFPage, text: string, x: number, y: number, size: number, bold?: boolean): void;
}

const PRODUCERS: Partial<Record<Variant, [string, string]>> = {
  'producer-word': ['Microsoft® Word for Microsoft 365', 'Microsoft® Word for Microsoft 365'],
  'producer-visma': ['Visma Spcs', 'Visma Administration'],
};

export async function toPdfLib(p: Printed, variant: Variant, ttf?: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const [producer, creator] = PRODUCERS[variant] ?? ['pdf-lib (https://github.com/Hopding/pdf-lib)', 'pdf-synth'];
  doc.setProducer(producer);
  doc.setCreator(creator);
  let face: Face;
  if (variant === 'type0-gid') {
    if (!ttf) throw new Error('type0-gid needs the DejaVu Sans font file');
    face = type0Face(doc, ttf);
  } else {
    const [reg, bold] = [await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold)];
    const f = (b?: boolean): PDFFont => (b ? bold : reg);
    face = {
      width: (t, s) => reg.widthOfTextAtSize(t, s),
      draw: (page, t, x, y, size, b) => page.drawText(t, { x, y, size, font: f(b), color: rgb(0, 0, 0) }),
    };
  }
  layout(doc, p, face, variant === 'standard14');
  return doc.save({ useObjectStreams: false });
}

/** A4, one column of blocks; the item table continues on a new page with its header repeated. */
function layout(doc: PDFDocument, p: Printed, face: Face, ruled: boolean) {
  const [W, H, M] = [595.28, 841.89, 50];
  let page = doc.addPage([W, H]);
  let y = H - M;
  const text = (t: string, x: number, size = 9, bold = false, right = false) =>
    face.draw(page, t, right ? x - face.width(t, size) : x, y, size, bold);
  const rule = () => ruled && page.drawLine({ start: { x: M, y: y - 3 }, end: { x: W - M, y: y - 3 }, thickness: 0.5 });
  const footer = () => {
    const t = p.footer.join(' · ');
    face.draw(page, t, M, 30, 7);
  };
  text(p.title, M, 16, true);
  y -= 26;
  const top = y;
  p.seller.forEach((t, i) => {
    text(t, M, 9, i === 0);
    y -= 12;
  });
  const afterSeller = y;
  y = top;
  for (const [k, v] of p.meta) {
    text(k, 330);
    text(v, W - M, 9, false, true);
    y -= 12;
  }
  y = Math.min(y, afterSeller) - 12;
  text(p.buyerLabel, M, 9, true);
  y -= 12;
  for (const t of p.buyer) {
    text(t, M);
    y -= 12;
  }
  y -= 12;
  const cols = [M, 290, 340, 400, 450, W - M]; // left edges, last numeric columns right-aligned at the next edge
  const rightAt = [0, 335, 0, 445, 490, W - M];
  const row = (cells: string[], bold = false) => {
    cells.forEach((t, i) => {
      if (i === 0 || i === 2) text(t, cols[i], 9, bold);
      else text(t, rightAt[i], 9, bold, true);
    });
  };
  if (p.items) {
    const header = () => {
      row(p.items!.header, true);
      rule();
      y -= 14;
    };
    header();
    for (const r of p.items.rows) {
      if (y < 90) {
        footer();
        page = doc.addPage([W, H]);
        y = H - M;
        header();
      }
      row(r);
      y -= 12;
    }
    rule();
    y -= 16;
  }
  const kvRight = (rows: [string, string][], boldLast = false) =>
    rows.forEach(([k, v], i) => {
      const b = boldLast && i === rows.length - 1;
      text(k, 330, 9, b);
      text(v, W - M, 9, b, true);
      y -= 12;
    });
  if (p.vat) {
    text(p.vat.header[0], 330, 9, true);
    text(p.vat.header[1], 470, 9, true, true);
    text(p.vat.header[2], W - M, 9, true, true);
    rule();
    y -= 14;
    for (const [a, b, c] of p.vat.rows) {
      text(a, 330);
      text(b, 470, 9, false, true);
      text(c, W - M, 9, false, true);
      y -= 12;
    }
    y -= 8;
  }
  kvRight(p.totals, true);
  y -= 10;
  for (const t of p.notes) {
    text(t, M, 8);
    y -= 11;
  }
  y -= 8;
  if (p.payment.length) {
    text('Betalningsinformation', M, 9, true);
    y -= 12;
    for (const [k, v] of p.payment) {
      text(`${k}: ${v}`, M);
      y -= 12;
    }
  }
  footer();
}

/** Minimal TrueType reader: unitsPerEm, bounding box, ascent/descent, Unicode BMP cmap (format 4) and advance widths. */
function readTtf(b: Uint8Array) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tables: Record<string, number> = {};
  for (let i = 0; i < dv.getUint16(4); i++) {
    const r = 12 + i * 16;
    tables[String.fromCharCode(...b.subarray(r, r + 4))] = dv.getUint32(r + 8);
  }
  const head = tables.head;
  const unitsPerEm = dv.getUint16(head + 18);
  const bbox = [36, 38, 40, 42].map((o) => dv.getInt16(head + o));
  const hhea = tables.hhea;
  const [ascent, descent, nMetrics] = [dv.getInt16(hhea + 4), dv.getInt16(hhea + 6), dv.getUint16(hhea + 34)];
  const advance = (gid: number) => dv.getUint16(tables.hmtx + 4 * Math.min(gid, nMetrics - 1));
  const cmap = tables.cmap;
  let sub = -1;
  for (let i = 0; i < dv.getUint16(cmap + 2); i++) {
    const r = cmap + 4 + i * 8;
    if (dv.getUint16(r) === 3 && dv.getUint16(r + 2) === 1) sub = cmap + dv.getUint32(r + 4);
  }
  if (sub < 0 || dv.getUint16(sub) !== 4) throw new Error('font has no Unicode BMP cmap (format 4)');
  const segs = dv.getUint16(sub + 6) / 2;
  const [ends, starts, deltas, offs] = [sub + 14, sub + 16 + 2 * segs, sub + 16 + 4 * segs, sub + 16 + 6 * segs];
  const glyph = (code: number) => {
    for (let i = 0; i < segs; i++) {
      if (code > dv.getUint16(ends + 2 * i)) continue;
      const start = dv.getUint16(starts + 2 * i);
      if (code < start) return 0;
      const ro = dv.getUint16(offs + 2 * i);
      if (ro === 0) return (code + dv.getInt16(deltas + 2 * i)) & 0xffff;
      const g = dv.getUint16(offs + 2 * i + ro + 2 * (code - start));
      return g === 0 ? 0 : (g + dv.getInt16(deltas + 2 * i)) & 0xffff;
    }
    return 0;
  };
  return { unitsPerEm, bbox, ascent, descent, advance, glyph };
}

/** Type0 font with CID = glyph id and no ToUnicode: text is drawn as glyph ids only. */
function type0Face(doc: PDFDocument, ttf: Uint8Array): Face {
  const f = readTtf(ttf);
  const ctx = doc.context;
  const scale = 1000 / f.unitsPerEm;
  const used = new Map<number, number>();
  const names = new Map<PDFPage, ReturnType<PDFPage['node']['newFontDictionary']>>();
  const fileRef = ctx.register(ctx.flateStream(ttf, { Length1: ttf.length }));
  const descriptor = ctx.register(
    ctx.obj({
      Type: 'FontDescriptor',
      FontName: 'DejaVuSans',
      Flags: 32,
      FontBBox: f.bbox.map((v) => Math.round(v * scale)),
      ItalicAngle: 0,
      Ascent: Math.round(f.ascent * scale),
      Descent: Math.round(f.descent * scale),
      CapHeight: 729,
      StemV: 80,
      FontFile2: fileRef,
    }),
  );
  const cidRef: PDFRef = ctx.nextRef();
  const fontRef = ctx.register(
    ctx.obj({ Type: 'Font', Subtype: 'Type0', BaseFont: 'DejaVuSans', Encoding: 'Identity-H', DescendantFonts: [cidRef] }),
  );
  const gids = (t: string) => [...t].map((c) => f.glyph(c.codePointAt(0)!));
  const width = (t: string, size: number) => gids(t).reduce((a, g) => a + f.advance(g) * scale, 0) * (size / 1000);
  // The CIDFont's W array is written when the document is saved, from the glyphs actually drawn.
  const save = doc.save.bind(doc);
  doc.save = async (o) => {
    const w = [...used.entries()].sort((a, b) => a[0] - b[0]).flatMap(([g, adv]) => [g, [adv]]);
    ctx.assign(
      cidRef,
      ctx.obj({
        Type: 'Font',
        Subtype: 'CIDFontType2',
        BaseFont: 'DejaVuSans',
        CIDSystemInfo: { Registry: PDFString.of('Adobe'), Ordering: PDFString.of('Identity'), Supplement: 0 },
        FontDescriptor: descriptor,
        DW: 1000,
        W: w,
        CIDToGIDMap: 'Identity',
      }),
    );
    return save(o);
  };
  return {
    width,
    draw(page, t, x, y, size) {
      const g = gids(t);
      for (const id of g) used.set(id, Math.round(f.advance(id) * scale));
      let name = names.get(page);
      if (!name) {
        name = page.node.newFontDictionary('DejaVu', fontRef);
        names.set(page, name);
      }
      const hex = g.map((id) => id.toString(16).padStart(4, '0')).join('');
      page.pushOperators(beginText(), setFontAndSize(name, size), moveText(x, y), showText(PDFHexString.of(hex)), endText());
    },
  };
}
