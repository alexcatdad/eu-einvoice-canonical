/**
 * Documents attached after the invoice in the same PDF (supplier invoices, delivery notes): the invoice pages are those
 * the page numbering counts ("Sida 1 av 3" on pages 1 to 3); every later page is an attachment. The attached pages are
 * copied unchanged, whatever their text quality, into one PDF that is embedded in the invoice (BG-24). pdf-lib is loaded
 * on demand, as in envelope-pdf.ts.
 */
import type { Attachment } from '../canonical.js';
import { base64 } from '../sha256.js';
import type { LayoutDocument } from './layout.js';
import { normalize } from './se/index.js';

/** "Sida 2 av 3", "Sida 2 (3)", "2 (3)", "Page 2 of 3", "2/3". */
const PAGE_MARK = /^(?:(?:sida|sid\.?|page) )?(\d{1,3}) ?(?:av|of|\/|\() ?(\d{1,3})\)?$/u;

/**
 * The number of invoice pages, when the file has more pages than its page numbering counts: each of pages 1 to N prints
 * "k av N" with its own number k. Undefined otherwise (every page is read as the invoice).
 */
export function invoicePageCount(layout: LayoutDocument): number | undefined {
  const marks = layout.pages.map((p) =>
    p.lines.flatMap((l) =>
      l.segments.flatMap((s) => {
        const m = PAGE_MARK.exec(normalize(s.text));
        return m ? [[Number(m[1]), Number(m[2])] as const] : [];
      }),
    ),
  );
  const n = marks[0]?.find(([k]) => k === 1)?.[1];
  if (!n || n >= layout.pages.length) return undefined;
  for (let k = 1; k <= n; k++) if (!marks[k - 1].some(([at, of]) => at === k && of === n)) return undefined;
  return n;
}

/** The invoice pages only, with the text quality of those pages. */
export function invoicePages(layout: LayoutDocument, n: number): LayoutDocument {
  const reasons = layout.quality.reasons.filter((r) => r.page === undefined || r.page <= n);
  return { ...layout, pages: layout.pages.slice(0, n), quality: { supported: reasons.length === 0, reasons } };
}

/** Pages `from` to `to` (1-based) of the PDF, unchanged, as one embedded PDF. Deterministic: no dates or producer are added. */
export async function attachedPages(bytes: Uint8Array, from: number, to: number, filename?: string): Promise<Attachment> {
  const { PDFDocument } = await import('pdf-lib');
  const source = await PDFDocument.load(bytes, { updateMetadata: false });
  const out = await PDFDocument.create({ updateMetadata: false });
  for (const page of await out.copyPages(
    source,
    Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i),
  ))
    out.addPage(page);
  const stem = filename?.replace(/\.pdf$/iu, '') || 'invoice';
  return {
    kind: 'embedded',
    id: `${stem} p${from}-${to}`,
    description: `Pages ${from}-${to} of the PDF: documents attached after the invoice`,
    mimeCode: 'application/pdf',
    filename: `${stem}-attachment.pdf`,
    base64: base64(await out.save()),
  };
}
