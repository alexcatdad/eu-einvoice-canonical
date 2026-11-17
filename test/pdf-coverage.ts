/**
 * Text coverage check of a PDF extraction: every text run on the invoice pages ends in exactly one place, checked against
 * the result the caller gets. Returns counts and the problems found, never the text, so that it can run on private files.
 */
import type { PdfRegion, PdfUnmappedText, SourceWarning } from '../src/canonical.js';
import { inside, runInFields, textCoverage } from '../src/pdf-extract/generic/unmapped.js';
import { readPdf } from '../src/pdf-extract/index.js';

export interface CoverageCheck {
  status: string;
  runs: number;
  field: number;
  consumed: number;
  unmapped: number;
  /** Texts with no usable position (`LayoutPage.unplaced`), each kept in an entry without a region. */
  unplaced: number;
  /** Rule broken, with a count; empty when text in equals text out. */
  problems: Record<string, number>;
}

const at = (page: number, b: { x: number; y: number; width: number; height: number }): PdfRegion => ({
  page,
  x: b.x,
  y: b.y,
  width: b.width,
  height: b.height,
});

/** The value at a canonical JSON Pointer, as a string, or undefined. */
function resolve(doc: unknown, pointer: string): string | undefined {
  let v: unknown = doc;
  for (const k of pointer.split('/').slice(1)) v = v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined;
  return typeof v === 'string' || typeof v === 'number' ? String(v) : undefined;
}

export async function checkCoverage(bytes: Uint8Array): Promise<CoverageCheck | undefined> {
  const { result, layout, read } = await readPdf(bytes, { fileSha256: '0'.repeat(64) });
  if (!layout || !read || read.notAnInvoice || (result.status !== 'ok' && result.status !== 'draft')) return undefined;
  const out: CoverageCheck = { status: result.status, runs: 0, field: 0, consumed: 0, unmapped: 0, unplaced: 0, problems: {} };
  const fail = (rule: string) => {
    out.problems[rule] = (out.problems[rule] ?? 0) + 1;
  };
  const ok = result.status === 'ok' ? result.invoice : undefined;
  const provenance = ok ? (ok.source.pdfProvenance ?? {}) : result.status === 'draft' ? result.draft.pdfProvenance : {};
  const warnings: SourceWarning[] = ok ? ok.source.warnings : result.status === 'draft' ? result.draft.problems : [];
  const entries: PdfUnmappedText[] = (ok ? ok.source.unmappedText : result.status === 'draft' ? result.draft.unmappedText : []) ?? [];
  const valueAt = (pointer: string) => (ok ? resolve(ok, pointer) : result.status === 'draft' ? result.draft.fields[pointer] : undefined);
  // Where the result says a field's text was printed: its provenance, and each further text joined to it
  const fields = [
    ...Object.entries(provenance).map(([pointer, region]) => ({ pointer, region })),
    ...warnings.flatMap((w) => (w.code === 'joined-text' && w.field && w.region ? [{ pointer: w.field, region: w.region }] : [])),
  ];

  const pages = layout.pages.slice(0, read.pages ?? layout.pages.length);
  const coverage = textCoverage(layout, read);
  // Every run of the invoice pages is in exactly one segment of the coverage, with one place each
  const seen = coverage.flatMap((c) => c.segment.runs);
  const all = pages.flatMap((p) => p.runs);
  if (new Set(seen).size !== seen.length) fail('run counted twice');
  if (seen.length !== all.length || all.some((r) => !seen.includes(r))) fail('run not covered');
  if (coverage.some((c) => c.kinds.length !== c.segment.runs.length)) fail('run without a place');

  const unmapped: { region: PdfRegion; text: string }[] = [];
  for (const c of coverage) {
    c.segment.runs.forEach((run, i) => {
      out.runs++;
      out[c.kinds[i]]++;
      // In a field: in the region of a field the result holds, which holds the run's text
      if (c.kinds[i] === 'field') {
        const held = fields.flatMap((f) => {
          const value = valueAt(f.pointer);
          return inside(at(c.page, run), f.region) && value !== undefined ? [{ pointer: f.pointer, value }] : [];
        });
        if (!runInFields(held, run.text)) fail('field run not in the result');
      }
    });
    const runs = c.segment.runs.filter((_, i) => c.kinds[i] === 'unmapped');
    if (runs.length) unmapped.push({ region: at(c.page, runs[0]), text: runs.map((r) => r.text).join('') });
  }
  // Every unmapped run is kept once, verbatim: its segment is one line of the entry whose region holds it
  const bare = (t: string) => t.replace(/\s+/gu, '');
  const lines = entries.map((e) => e.text.split('\n').map(bare));
  const keep = (text: string, holds: (e: PdfUnmappedText) => boolean) => {
    const k = entries.findIndex((e, i) => holds(e) && lines[i].includes(bare(text)));
    if (k < 0) fail('unmapped text not kept');
    else lines[k].splice(lines[k].indexOf(bare(text)), 1);
  };
  for (const u of unmapped) keep(u.text, (e) => !!e.region && inside(u.region, e.region));
  // Text with no usable position is kept once, verbatim, in an entry without a region
  for (const text of pages.flatMap((p) => p.unplaced)) {
    out.unplaced++;
    keep(text, (e) => !e.region);
  }
  if (lines.some((l) => l.length)) fail('unmapped text kept twice or not printed');
  // Each entry has its unmapped-text warning
  const pointers = warnings.filter((w) => w.code === 'unmapped-text').map((w) => w.field);
  if (pointers.length !== entries.length || entries.some((_, i) => !pointers.includes(`/source/unmappedText/${i}`)))
    fail('unmapped text without its warning');
  return out;
}
