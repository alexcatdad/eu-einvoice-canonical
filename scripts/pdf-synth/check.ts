/**
 * Checks the committed synthetic set against a fresh generation (needs Docker):
 *
 *   bun scripts/pdf-synth/check.ts [--dir test/pdf-synth]
 *
 * - LibreOffice PDFs: same page count and same extracted text, line by line (LibreOffice is not byte-reproducible)
 * - pdf-lib PDFs: same bytes, and no CreationDate, ModDate or /ID
 * - answer keys: equal to the key derived from the spec; sha256 matches the committed PDF
 * - every word the spec prints appears in the committed PDF's text layer (except the font case without ToUnicode)
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { sha256Hex } from '../../src/hash.js';
import { extractLayout } from '../../src/pdf-extract/layout.js';
import { generate } from './generate.js';

const pageTexts = async (bytes: Uint8Array) =>
  (await extractLayout(bytes)).pages.map((p) => p.lines.map((l) => l.text.replace(/\s+/g, ' ').trim()).join('\n'));

const i = process.argv.indexOf('--dir');
const dir = resolve(i > 0 ? process.argv[i + 1] : join(import.meta.dir, '../../test/pdf-synth'));
const fresh = mkdtempSync(join(tmpdir(), 'pdf-synth-check-'));
const errors: string[] = [];
try {
  const models = await generate(fresh);
  const keyed = new Set(models.filter((m) => m.truth).map((m) => `${m.spec.file}.json`));
  for (const n of readdirSync(join(dir, 'truth'))) if (!keyed.has(n)) errors.push(`truth/${n}: no case spec`);
  for (const m of models) {
    const name = m.spec.file;
    const err = (msg: string) => errors.push(`${name}: ${msg}`);
    const path = join(dir, `${name}.pdf`);
    if (!existsSync(path)) {
      err('PDF not committed');
      continue;
    }
    const [old, now] = [new Uint8Array(readFileSync(path)), new Uint8Array(readFileSync(join(fresh, `${name}.pdf`)))];
    if (m.spec.renderer === 'pdflib') {
      if (Buffer.compare(old, now) !== 0) err('pdf-lib output differs from the committed bytes');
      if (/\/(CreationDate|ModDate|ID)\b/.test(Buffer.from(old).toString('latin1'))) err('pdf-lib output has CreationDate, ModDate or /ID');
    }
    const [a, b] = [await pageTexts(old), await pageTexts(now)];
    if (a.length !== (m.spec.pages ?? 1)) err(`${a.length} pages, spec says ${m.spec.pages ?? 1}`);
    if (!isDeepStrictEqual(a, b)) err('extracted text differs from a fresh rendering');
    if (m.spec.variant !== 'type0-gid') {
      const words = new Set(a.join(' ').split(/[\s:·]+/));
      const p = m.printed;
      const printed = [
        p.title,
        ...p.seller,
        ...p.buyer,
        ...p.meta.flat(),
        ...p.totals.flat(),
        ...p.notes,
        ...p.payment.flat(),
        ...p.footer,
        ...(p.placed ?? []).map((t) => t.text),
      ];
      for (const g of [p.items, p.vat]) if (g) printed.push(...g.header, ...g.rows.flat());
      const lost = [...new Set(printed.flatMap((t) => t.split(/[\s:·]+/)).filter((w) => w && !words.has(w)))];
      if (lost.length) err(`printed words not in the text layer: ${lost.join(' | ')}`);
    }
    const truthPath = join(dir, 'truth', `${name}.json`);
    if (!m.truth) {
      if (existsSync(truthPath)) err('has a truth file but the spec is not an invoice');
      continue;
    }
    if (!existsSync(truthPath)) {
      err('truth file missing');
      continue;
    }
    const { sha256, ...committed } = JSON.parse(readFileSync(truthPath, 'utf8'));
    if (sha256 !== (await sha256Hex(old))) err('truth sha256 does not match the committed PDF');
    if (!isDeepStrictEqual(committed, m.truth)) err('truth differs from the key derived from the spec');
  }
  console.log(`${models.length} cases checked, ${errors.length} problems`);
} finally {
  rmSync(fresh, { recursive: true, force: true });
}
for (const e of errors) console.error(`- ${e}`);
process.exit(errors.length ? 1 : 0);
