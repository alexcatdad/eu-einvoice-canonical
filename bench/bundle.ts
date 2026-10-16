/** Size of every browser chunk, read from dist/ after `bun run build:site`. Hashes are stripped so names are stable. */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

export interface ChunkSize {
  name: string;
  bytes: number;
  gzipBytes: number;
}

export function bundleSizes(dist = join(import.meta.dir, '..', 'dist')): ChunkSize[] {
  if (!existsSync(dist)) return [];
  const files: string[] = [];
  for (const dir of [dist, join(dist, 'chunks')]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) if (f.endsWith('.js') && statSync(join(dir, f)).isFile()) files.push(join(dir, f));
  }
  const sized = files
    .map((path) => {
      const buf = readFileSync(path);
      const name = path.slice(dist.length + 1).replace(/-[a-z0-9]{8}(?=\.js$)/, '');
      return { name, bytes: buf.length, gzipBytes: gzipSync(buf).length };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || b.bytes - a.bytes);
  // Several chunks share a name (`chunks/app`): number them largest first so the keys stay stable between builds.
  const seen = new Map<string, number>();
  const total = new Map<string, number>();
  for (const c of sized) total.set(c.name, (total.get(c.name) ?? 0) + 1);
  return sized.map((c) => {
    if ((total.get(c.name) ?? 0) < 2) return c;
    const n = (seen.get(c.name) ?? 0) + 1;
    seen.set(c.name, n);
    return { ...c, name: c.name.replace(/\.js$/, `#${n}.js`) };
  });
}
