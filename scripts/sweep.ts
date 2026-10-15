/**
 * Runs detection over every file under the given directories.
 *
 *   bun scripts/sweep.ts <dir> [dir...]                  counts per format (coverage)
 *   bun scripts/sweep.ts <dir> --expect answers.json     known-answer check (correctness)
 *
 * Without --expect it only shows what was detected: a file counted as "invoice X" may still
 * be the wrong X. With --expect, every file listed in the JSON must produce exactly the listed
 * format ids, one per XML document, in order ('other' = recognised non-invoice, 'unknown');
 * the process exits with status 1 on any mismatch or missing file. Paths in the JSON are
 * relative to the JSON file's directory.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { inspect } from '../src/index.js';

const EXT = /\.(xml|pdf|p7m|isdoc|isdocx|zip|xsig|ubl|cii)$/i;
const SKIP = /\.(xsd|sch|xsl|xslt)$/i;

function* files(dir: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    if (e === '.git' || e === 'node_modules') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (EXT.test(p) && !SKIP.test(p)) yield p;
  }
}

async function labels(path: string): Promise<{ ids: string[]; display: string[] }> {
  const r = await inspect(new Uint8Array(readFileSync(path)), path);
  const ids: string[] = [];
  const display: string[] = [];
  for (const d of r.documents) {
    const det = d.detection;
    const env = d.payload.envelope.map((s) => s.kind).filter((k) => k !== 'xml').join('>');
    const via = env ? `  (via ${env})` : '';
    if (det.kind === 'invoice') {
      ids.push(det.format.id);
      display.push(`invoice ${det.format.id}${det.details.profile ? ` [${det.details.profile.slice(0, 40)}]` : ''}${via}`);
    } else if (det.kind === 'other-document') {
      ids.push('other');
      display.push(`other   ${det.label.slice(0, 70)}${via}`);
    } else {
      ids.push('unknown');
      display.push(`UNKNOWN ${det.reason.slice(0, 80)}${via}`);
    }
  }
  if (r.documents.length === 0) for (const s of r.skipped) display.push(`skipped ${s.reason}`);
  return { ids, display };
}

const args = process.argv.slice(2);
const expectIdx = args.indexOf('--expect');
const expectFile = expectIdx >= 0 ? args[expectIdx + 1] : undefined;
const roots = args.filter((_, i) => i !== expectIdx && i !== expectIdx + 1);

if (expectFile) {
  const answers = JSON.parse(readFileSync(expectFile, 'utf8')) as Record<string, string[]>;
  const base = dirname(resolve(expectFile));
  let bad = 0;
  for (const [rel, expected] of Object.entries(answers)) {
    const path = join(base, rel);
    let got: string[];
    try { got = (await labels(path)).ids; } catch (e) { console.log(`MISSING  ${rel}: ${(e as Error).message}`); bad++; continue; }
    const ok = got.length === expected.length && got.every((g, i) => g === expected[i]);
    if (!ok) { bad++; console.log(`MISMATCH ${rel}: expected [${expected.join(', ')}], got [${got.join(', ')}]`); }
  }
  // Files under the roots that the answers do not cover are listed, so the manifest stays complete.
  const covered = new Set(Object.keys(answers).map((r) => resolve(base, r)));
  const uncovered = roots.flatMap((root) => [...files(root)]).filter((f) => !covered.has(resolve(f)));
  for (const f of uncovered) console.log(`NO ANSWER ${relative(base, f)}`);
  const total = Object.keys(answers).length;
  console.log(`\n${total - bad}/${total} files match their expected formats${uncovered.length ? `; ${uncovered.length} file(s) without an answer` : ''}`);
  process.exit(bad || uncovered.length ? 1 : 0);
}

const counts = new Map<string, number>();
const examples = new Map<string, string>();
let total = 0;
for (const root of roots) {
  for (const f of files(root)) {
    total++;
    const group = (/phive-rules-([\w-]+)/.exec(f)?.[1] ?? relative(root, f).split('/')[0]).padEnd(18);
    let r;
    try { r = await labels(f); } catch (e) { bump(`${group} ERROR ${(e as Error).message.slice(0, 60)}`, f); continue; }
    for (const label of r.display) bump(`${group} ${label}`, f);
  }
}
function bump(k: string, f: string) { counts.set(k, (counts.get(k) ?? 0) + 1); if (!examples.has(k)) examples.set(k, f); }

for (const [k, n] of [...counts].sort()) console.log(String(n).padStart(5), k);
console.log(`\n${total} files`);
const unknown = [...counts.keys()].filter((k) => /UNKNOWN|ERROR/.test(k));
if (unknown.length) { console.log('\nExamples of unknown/error:'); for (const k of unknown) console.log(' ', examples.get(k)); }
console.log('\nThis counts what was detected, not whether it is right. Use --expect for a known-answer check.');
