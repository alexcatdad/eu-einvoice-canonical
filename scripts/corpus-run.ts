/**
 * Converts every sample file under a corpora directory and writes the real-world report.
 *
 *   bun scripts/corpus-run.ts test/corpus/repos --out dist/corpus-report.json \
 *       [--details dist/corpus-details.ndjson] [--md dist/corpus-report.md] [--pins corpus-pins.txt] \
 *       [--jobs 4] [--timeout 60]
 *
 * Each file goes to one of a few child processes (scripts/corpus-worker.ts) with
 * { validate: true, relations: true, provenance: false } and the default unwrap limits. A child that does not
 * answer within the time limit is killed and replaced, and the file is reported as a timeout, so one pathological
 * file cannot hang the run. It reports; it does not fail on bad files.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { sweepFiles } from '../src/sweep.js';
import { aggregate, type FileResult, renderMarkdown } from './corpus-lib.js';

const MARK = '@@RESULT ';
const args = process.argv.slice(2);
const opt = (name: string, fallback?: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const valueIdx = new Set(args.flatMap((a, i) => (a.startsWith('--') ? [i + 1] : [])));
const roots = args.filter((a, i) => !a.startsWith('--') && !valueIdx.has(i));
const out = opt('--out', 'dist/corpus-report.json') as string;
const detailsPath = opt('--details');
const mdPath = opt('--md');
const pinsPath = opt('--pins');
const jobs = Number(opt('--jobs', '4'));
const timeoutMs = Number(opt('--timeout', '60')) * 1000;
const RECYCLE_AFTER = 300;

type Answer = { kind: 'ok'; result: Omit<FileResult, 'file' | 'corpus'> } | { kind: 'timeout' } | { kind: 'crash'; error: string };

class Child {
  private proc = Bun.spawn([process.execPath, resolve(import.meta.dir, 'corpus-worker.ts')], {
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'ignore',
  });
  private pending?: (a: Answer) => void;

  constructor() {
    void this.pump();
    void this.proc.exited.then((code) => {
      const p = this.pending;
      this.pending = undefined;
      p?.({ kind: 'crash', error: `child exited with code ${code}` });
    });
  }

  private async pump() {
    const decoder = new TextDecoder();
    let buf = '';
    for await (const chunk of this.proc.stdout) {
      buf += decoder.decode(chunk, { stream: true });
      for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (!line.startsWith(MARK)) continue;
        const p = this.pending;
        this.pending = undefined;
        p?.({ kind: 'ok', result: JSON.parse(line.slice(MARK.length)) });
      }
    }
  }

  run(path: string): Promise<Answer> {
    return new Promise((resolveAnswer) => {
      const timer = setTimeout(() => {
        this.pending = undefined;
        resolveAnswer({ kind: 'timeout' });
      }, timeoutMs);
      this.pending = (a) => {
        clearTimeout(timer);
        resolveAnswer(a);
      };
      this.proc.stdin.write(`${JSON.stringify(path)}\n`);
      void this.proc.stdin.flush();
    });
  }

  kill() {
    this.proc.kill('SIGKILL');
  }
}

if (roots.length === 0) {
  console.error(
    'usage: bun scripts/corpus-run.ts <corpora dir> [--out file] [--details file] [--md file] [--pins file] [--jobs n] [--timeout seconds]',
  );
  process.exit(2);
}
const files = roots.flatMap((root) => [...sweepFiles(root)].map((f) => ({ path: f, root }))).sort((a, b) => a.path.localeCompare(b.path));
console.log(`${files.length} files, ${jobs} children, ${timeoutMs / 1000} s per file`);
if (detailsPath) {
  mkdirSync(dirname(detailsPath), { recursive: true });
  writeFileSync(detailsPath, '');
}

const results: FileResult[] = [];
let next = 0;
const started = performance.now();

async function slot() {
  let child = new Child();
  let served = 0;
  for (let i = next++; i < files.length; i = next++) {
    const { path, root } = files[i] as (typeof files)[number];
    const rel = relative(root, path);
    const base = { file: rel, corpus: rel.split('/')[0] as string };
    const answer = await child.run(path);
    let result: FileResult;
    if (answer.kind === 'ok') result = { ...base, ...answer.result };
    else
      result = {
        ...base,
        bytes: 0,
        ms: answer.kind === 'timeout' ? timeoutMs : 0,
        outcome: answer.kind,
        error: answer.kind === 'crash' ? answer.error : `no answer within ${timeoutMs / 1000} s`,
        skipped: [],
        docs: [],
      };
    results.push(result);
    if (detailsPath) appendFileSync(detailsPath, `${JSON.stringify(result)}\n`);
    if (results.length % 250 === 0)
      console.log(`${results.length}/${files.length} (${((performance.now() - started) / 1000).toFixed(0)} s)`);
    // A killed or crashed child is gone; a healthy one is replaced now and then to cap memory growth.
    if (answer.kind !== 'ok' || ++served % RECYCLE_AFTER === 0) {
      child.kill();
      child = new Child();
    }
  }
  child.kill();
}

await Promise.all(Array.from({ length: Math.max(1, jobs) }, slot));
const seconds = (performance.now() - started) / 1000;

const pins = pinsPath && existsSync(pinsPath) ? readFileSync(pinsPath, 'utf8').split('\n').filter(Boolean) : [];
const report = aggregate(results, {
  seconds,
  pins,
  commit: process.env.GITHUB_SHA,
  options: { validate: true, relations: true, provenance: false, timeoutSeconds: timeoutMs / 1000 },
});
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
const md = renderMarkdown(report);
if (mdPath) writeFileSync(mdPath, md);
console.log(md);
process.exit(0);
