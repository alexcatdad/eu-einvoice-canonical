/**
 * Checks validation/bundles/: every manifest is complete, every listed file matches its size and
 * SHA-256, and nothing unlisted sits in a bundle directory. Exits 1 on any problem.
 *   bun run verify:bundles
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { sha256Hex } from '../src/hash.js';

const dir = join(import.meta.dir, '../validation/bundles');
const problems: string[] = [];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function walk(d: string): string[] {
  return readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const ids = readdirSync(dir)
  .filter((n) => statSync(join(dir, n)).isDirectory())
  .sort();
if (!ids.length) problems.push('no bundles found');
for (const id of ids) {
  const bdir = join(dir, id);
  let m: any;
  try {
    m = JSON.parse(readFileSync(join(bdir, 'manifest.json'), 'utf8'));
  } catch (e) {
    problems.push(`${id}: manifest.json unreadable (${(e as Error).message})`);
    continue;
  }
  if (m.id !== id) problems.push(`${id}: manifest id is ${m.id}`);
  for (const k of ['title', 'layer', 'syntax', 'version', 'releaseDate', 'effectiveFrom', 'license', 'upstream', 'format'])
    if (typeof m[k] !== 'string' || !m[k]) problems.push(`${id}: manifest.${k} missing`);
  if (!['schema', 'semantic', 'profile'].includes(m.layer)) problems.push(`${id}: bad layer ${m.layer}`);
  for (const k of ['releaseDate', 'effectiveFrom']) if (!DATE.test(m[k] ?? '')) problems.push(`${id}: ${k} is not YYYY-MM-DD`);
  if (!('effectiveUntil' in m) || (m.effectiveUntil !== null && !DATE.test(m.effectiveUntil)))
    problems.push(`${id}: effectiveUntil must be a date or null`);
  else if (m.effectiveUntil !== null && m.effectiveUntil < m.effectiveFrom) problems.push(`${id}: effectiveUntil before effectiveFrom`);
  if (!Array.isArray(m.files) || !m.files.length) {
    problems.push(`${id}: no files listed`);
    continue;
  }
  const listed = new Set<string>();
  for (const f of m.files) {
    listed.add(f.path);
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(readFileSync(join(bdir, f.path)));
    } catch {
      problems.push(`${id}: ${f.path} is listed but missing`);
      continue;
    }
    if (bytes.byteLength !== f.bytes) problems.push(`${id}: ${f.path} is ${bytes.byteLength} bytes, manifest says ${f.bytes}`);
    const sha = await sha256Hex(bytes);
    if (sha !== f.sha256) problems.push(`${id}: ${f.path} sha256 ${sha} does not match manifest ${f.sha256}`);
  }
  for (const p of walk(bdir)) {
    const rel = relative(bdir, p);
    if (rel !== 'manifest.json' && !listed.has(rel)) problems.push(`${id}: ${rel} is not in the manifest`);
  }
  const entries: string[] = m.format === 'xsd' ? Object.values(m.entries ?? {}) : [m.entry];
  for (const e of entries) if (!listed.has(e)) problems.push(`${id}: entry ${e} is not a listed file`);
}

if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join('\n'));
  process.exit(1);
}
console.log(`${ids.length} validation bundles verified: ${ids.join(', ')}`);
