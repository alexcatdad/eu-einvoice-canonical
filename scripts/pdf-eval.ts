/**
 * Evaluates PDF invoice extraction (`convert(..., { extractPdf: true })`) and writes a counts-only report.
 *
 *   bun scripts/pdf-eval.ts swedish <dir with PDFs and truth/> [--truth dir] [--out file] [--md file] [--gate]
 *   bun scripts/pdf-eval.ts paired <corpora dir> [--exclude file] [--out file] [--md file] [--gate]
 *
 * `swedish`: one truth file per PDF (format: se-pdf/truth/SCHEMA.md in the private cache repository); each PDF
 * is converted with `extractPdf` and scored field by field. File ids in the report are SHA-256 prefixes.
 *
 * `paired`: hybrid PDFs (ZUGFeRD, Factur-X, XRechnung) of the pinned public corpora (scripts/fetch-corpora.sh).
 * The visible page is read by the extractor with the embedded files ignored and scored against the invoice
 * converted from the embedded XML. PDFs whose page and XML are known to disagree are listed in the exclude file
 * (default scripts/pdf-eval/paired-exclude.txt, repository-relative paths) and left out; the report lists every
 * document with a wrong value so it can be checked against the page.
 *
 * The report holds counts, normalised messages, problem codes and file ids only; nothing read from a file is
 * printed. `--gate` exits 1 when any value is wrong.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { sha256Hex } from '../src/hash.js';
import { convert, type PdfOutcome } from '../src/index.js';
import { extractPdfInvoice } from '../src/pdf-extract/index.js';
import { sweepFiles } from '../src/sweep.js';
import { aggregate, type PdfEvalReport, renderMarkdown } from './pdf-eval/report.js';
import { type DocScore, type Expected, fromInvoice, fromTruth, score, type Truth } from './pdf-eval/score.js';

const TIMEOUT_MS = 120_000;

/** Runs one step with a time limit; a timeout or throw becomes an `error` outcome. */
async function guarded(
  run: () => Promise<PdfOutcome | undefined>,
  pdf: { sha256: string; byteLength: number },
): Promise<PdfOutcome | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<PdfOutcome>((ok) => {
        timer = setTimeout(() => ok({ status: 'error', pdf, error: `no answer within ${TIMEOUT_MS / 1000} s` }), TIMEOUT_MS);
      }),
    ]);
  } catch (e) {
    return { status: 'error', pdf, error: `Internal error: ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    clearTimeout(timer);
  }
}

/** Swedish answer key: every `truth/<name>.json` with its `<name>.pdf`. */
export async function evaluateSwedish(dir: string, truthDir = join(dir, 'truth')): Promise<PdfEvalReport> {
  const scores: DocScore[] = [];
  for (const name of readdirSync(truthDir)
    .filter((n) => n.endsWith('.json'))
    .sort()) {
    const truth = JSON.parse(readFileSync(join(truthDir, name), 'utf8')) as Truth;
    if (truth.schemaVersion !== 1 || typeof truth.file !== 'string') continue; // truth.schema.json and other non-key files
    const exp = fromTruth(truth);
    const path = join(dir, truth.file);
    const pdf = { sha256: truth.sha256, byteLength: 0 };
    let outcome: PdfOutcome | undefined;
    if (!existsSync(path)) outcome = { status: 'error', pdf, error: 'PDF named by the truth file not found' };
    else {
      const bytes = new Uint8Array(readFileSync(path));
      if ((await sha256Hex(bytes)) !== truth.sha256) outcome = { status: 'error', pdf, error: 'PDF does not match the truth file SHA-256' };
      else
        outcome = await guarded(async () => (await convert(bytes, basename(path), undefined, { extractPdf: true })).pdfOutcomes?.[0], pdf);
    }
    scores.push(score(exp, outcome));
  }
  return aggregate(scores, { mode: 'swedish', commit: process.env.GITHUB_SHA });
}

/** Paired public corpus: hybrid PDFs, page against embedded XML. */
export async function evaluatePaired(root: string, exclude: string[] = []): Promise<PdfEvalReport> {
  const scores: DocScore[] = [];
  const excluded: string[] = [];
  let noReference = 0;
  const pdfs = [...sweepFiles(root)].filter((p) => /\.pdf$/i.test(p)).sort();
  for (const path of pdfs) {
    const id = relative(root, path);
    const bytes = new Uint8Array(readFileSync(path));
    const r = await convert(bytes, basename(path)).catch(() => undefined);
    const ref = r?.outcomes.find((o) => o.status === 'ok' && o.payload.fromPdf);
    if (ref?.status !== 'ok' || !ref.invoices[0]) {
      noReference++;
      continue;
    }
    if (exclude.includes(id)) {
      excluded.push(id);
      continue;
    }
    const exp: Expected = fromInvoice(ref.invoices[0], id, ref.detection.kind === 'invoice' ? ref.detection.format.id : 'unknown');
    const pdf = { filename: basename(path), sha256: r?.fileSha256 ?? '', byteLength: bytes.length };
    // The extractor reads the page only; it never looks at the embedded files.
    const outcome = await guarded(async () => {
      const x = await extractPdfInvoice(bytes, { fileSha256: pdf.sha256, filename: pdf.filename });
      return x.status === 'ok' ? { status: 'ok', invoices: [x.invoice], pdf } : { ...x, pdf };
    }, pdf);
    scores.push(score(exp, outcome));
  }
  return aggregate(scores, { mode: 'paired', commit: process.env.GITHUB_SHA, excluded, noReference });
}

/** Repository-relative paths, one per line; `#` starts a comment. */
export const readExclude = (path: string) =>
  existsSync(path)
    ? readFileSync(path, 'utf8')
        .split('\n')
        .map((l) => l.replace(/#.*/, '').trim())
        .filter(Boolean)
    : [];

if (import.meta.main) {
  const args = process.argv.slice(2);
  const opt = (name: string, fallback?: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
  };
  const [mode, dir] = args;
  if ((mode !== 'swedish' && mode !== 'paired') || !dir) {
    console.error(
      'usage: bun scripts/pdf-eval.ts swedish <dir> [--truth dir] [--out file] [--md file] [--gate]\n' +
        '       bun scripts/pdf-eval.ts paired <corpora dir> [--exclude file] [--out file] [--md file] [--gate]',
    );
    process.exit(2);
  }
  const report =
    mode === 'swedish'
      ? await evaluateSwedish(dir, opt('--truth'))
      : await evaluatePaired(dir, readExclude(opt('--exclude', resolve(import.meta.dir, 'pdf-eval/paired-exclude.txt')) as string));
  const out = opt('--out', `dist/pdf-eval-${mode}.json`) as string;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  const md = renderMarkdown(report);
  const mdPath = opt('--md');
  if (mdPath) writeFileSync(mdPath, md);
  console.log(md);
  process.exit(args.includes('--gate') && !report.gate.passed ? 1 : 0);
}
