import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { convert } from '../src/index.js';
import { extractLayout } from '../src/pdf-extract/layout.js';
import { checkResult } from './fuzz/properties.js';
import { checkCoverage } from './pdf-coverage.js';

const original = new Uint8Array(readFileSync(join(import.meta.dir, 'pdf-synth', 'pdflib-standard14.pdf')));
const bare = (t: string) => t.replace(/\s+/gu, '');
// Text pdf.js gives no usable position: zero font size, zero horizontal scale, a matrix whose numbers overflow (NaN), a flat matrix
const TEXTS = ['Dold text', 'Smal text', 'Trasig matris', 'Platt matris'];

/** The synthetic invoice with the texts above drawn in a further content stream of its page. */
async function withUnplacedText() {
  const doc = await PDFDocument.load(original);
  const page = doc.getPage(0);
  const f = page.node.newFontDictionary('Fx', (await doc.embedFont(StandardFonts.Helvetica)).ref).toString();
  const ops = [`0 Tf 50 120 Td`, `10 Tf 0 Tz 50 100 Td`, `10 Tf 1${'0'.repeat(400)} 0 0 1 50 80 Tm`, `10 Tf 1 0 0 0 50 60 Tm`].map(
    (state, i) => `q BT ${f} ${state} (${TEXTS[i]}) Tj ET Q`,
  );
  page.node.addContentStream(doc.context.register(doc.context.stream(ops.join('\n'))));
  return doc.save();
}

test('text with no usable position is kept in unmappedText without a region, and never used for the layout', async () => {
  const bytes = await withUnplacedText();
  const [before, after] = await Promise.all([extractLayout(original), extractLayout(bytes)]);
  expect(after.pages[0].runs).toEqual(before.pages[0].runs);
  expect(after.pages[0].lines).toEqual(before.pages[0].lines);
  expect(after.pages[0].unplaced.map(bare)).toEqual(TEXTS.map(bare));

  const result = await convert(bytes, 'unplaced.pdf', undefined, { extractPdf: true });
  checkResult(result);
  expect(JSON.stringify(result, (_, v) => (typeof v === 'number' && !Number.isFinite(v) ? 'non-finite' : v))).not.toContain('non-finite');
  const outcome = result.pdfOutcomes?.[0];
  if (outcome?.status !== 'ok' && outcome?.status !== 'draft') throw new Error(`not read: ${outcome?.status}`);
  const kept = (outcome.status === 'ok' ? outcome.invoices[0].source.unmappedText : outcome.draft.unmappedText) ?? [];
  const warnings = outcome.status === 'ok' ? outcome.invoices[0].source.warnings : outcome.draft.problems;
  const unplaced = kept.flatMap((u, i) => (u.region ? [] : [{ i, text: bare(u.text) }]));
  expect(unplaced.map((u) => u.text)).toEqual(TEXTS.map(bare));
  // After the positioned blocks, each with its unmapped-text warning, which has no region either
  expect(unplaced[0].i).toBe(kept.length - TEXTS.length);
  for (const { i } of unplaced) {
    const w = warnings.find((x) => x.field === `/source/unmappedText/${i}`);
    expect(w).toMatchObject({ code: 'unmapped-text', message: expect.stringContaining('position cannot be read') });
    expect(w?.region).toBeUndefined();
  }

  const coverage = await checkCoverage(bytes);
  expect(coverage).toMatchObject({ problems: {}, unplaced: TEXTS.length });
}, 60_000);
