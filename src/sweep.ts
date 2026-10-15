/**
 * Detection sweep over every file under the given directories.
 *
 * Without an answers file it counts what was detected per format (coverage). A file counted as
 * "invoice X" may still be the wrong X. With one, every file listed in the JSON must produce
 * exactly the listed format ids, one per XML document, in order ('other' = recognised
 * non-invoice, 'unknown'); any mismatch or missing file fails. Paths in the JSON are relative
 * to the JSON file's directory.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { inspect, type UnwrapLimits } from './index.js';

const EXT = /\.(xml|pdf|p7m|isdoc|isdocx|zip|xsig|ubl|cii)$/i;
const SKIP = /\.(xsd|sch|xsl|xslt)$/i;

export function* sweepFiles(dir: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    if (e === '.git' || e === 'node_modules') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* sweepFiles(p);
    else if (EXT.test(p) && !SKIP.test(p)) yield p;
  }
}

async function labels(path: string, limits?: Partial<UnwrapLimits>): Promise<{ ids: string[]; display: string[] }> {
  const r = await inspect(new Uint8Array(readFileSync(path)), path, limits);
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

export interface SweepOptions {
  /** Path of an answers JSON ({ "relative/path": ["format-id", ...] }); switches to the known-answer check. */
  expect?: string;
  limits?: Partial<UnwrapLimits>;
}

/** Runs the sweep, printing lines through `print`. Returns the process exit code: 0, or 1 on any mismatch, missing file or unanswered file. */
export async function runSweep(roots: string[], opts: SweepOptions, print: (line: string) => void): Promise<number> {
  if (opts.expect) {
    const answers = JSON.parse(readFileSync(opts.expect, 'utf8')) as Record<string, string[]>;
    const base = dirname(resolve(opts.expect));
    let bad = 0;
    for (const [rel, expected] of Object.entries(answers)) {
      const path = join(base, rel);
      let got: string[];
      try { got = (await labels(path, opts.limits)).ids; } catch (e) { print(`MISSING  ${rel}: ${(e as Error).message}`); bad++; continue; }
      const ok = got.length === expected.length && got.every((g, i) => g === expected[i]);
      if (!ok) { bad++; print(`MISMATCH ${rel}: expected [${expected.join(', ')}], got [${got.join(', ')}]`); }
    }
    // Files under the roots that the answers do not cover are listed, so the manifest stays complete.
    const covered = new Set(Object.keys(answers).map((r) => resolve(base, r)));
    const uncovered = roots.flatMap((root) => [...sweepFiles(root)]).filter((f) => !covered.has(resolve(f)));
    for (const f of uncovered) print(`NO ANSWER ${relative(base, f)}`);
    const total = Object.keys(answers).length;
    print(`\n${total - bad}/${total} files match their expected formats${uncovered.length ? `; ${uncovered.length} file(s) without an answer` : ''}`);
    return bad || uncovered.length ? 1 : 0;
  }

  const counts = new Map<string, number>();
  const examples = new Map<string, string>();
  const bump = (k: string, f: string) => { counts.set(k, (counts.get(k) ?? 0) + 1); if (!examples.has(k)) examples.set(k, f); };
  let total = 0;
  for (const root of roots) {
    for (const f of sweepFiles(root)) {
      total++;
      const group = (/phive-rules-([\w-]+)/.exec(f)?.[1] ?? relative(root, f).split('/')[0]).padEnd(18);
      let r;
      try { r = await labels(f, opts.limits); } catch (e) { bump(`${group} ERROR ${(e as Error).message.slice(0, 60)}`, f); continue; }
      for (const label of r.display) bump(`${group} ${label}`, f);
    }
  }
  for (const [k, n] of [...counts].sort()) print(`${String(n).padStart(5)} ${k}`);
  print(`\n${total} files`);
  const unknown = [...counts.keys()].filter((k) => /UNKNOWN|ERROR/.test(k));
  if (unknown.length) { print('\nExamples of unknown/error:'); for (const k of unknown) print(`  ${examples.get(k)}`); }
  print('\nThis counts what was detected, not whether it is right. Use --expect for a known-answer check.');
  return 0;
}
