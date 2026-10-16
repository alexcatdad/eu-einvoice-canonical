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
  // Chunks that share a name (`chunks/app`) are summed: their order by size can change between builds, which would
  // swap their identities and hide growth, while the total of the group cannot.
  const byName = new Map<string, ChunkSize>();
  for (const c of sized) {
    const hit = byName.get(c.name);
    if (hit) {
      hit.bytes += c.bytes;
      hit.gzipBytes += c.gzipBytes;
    } else byName.set(c.name, { ...c });
  }
  return [...byName.values()];
}
