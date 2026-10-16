/**
 * Size of the site's browser JavaScript, read from dist/ after `bun run build:site` (Astro writes it to dist/_astro/).
 *
 *   converter/initial.js   what the converter page loads before anything is dropped: its page scripts and the static
 *                          import closure of the React island (component and renderer)
 *   converter/all.js       everything the converter page can load, the lazy chunks included (PDF, CMS, trusted lists,
 *                          the other seven languages)
 *   _astro/<name>.js       each chunk, with the content hash stripped so the names are stable
 *
 * The two converter totals are what the gate is really about: their names never change, while Vite may regroup chunks.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

export interface ChunkSize {
  name: string;
  bytes: number;
  gzipBytes: number;
}

export const INITIAL = 'converter/initial.js';
export const ALL = 'converter/all.js';

/** Hash-free chunk name: `_astro/Converter.D0uJd6ry.js` becomes `_astro/Converter.js`. */
const stableName = (file: string) => `_astro/${file.replace(/\.[A-Za-z0-9_-]{8}(?=\.js$)/, '')}`;

/** The chunks a chunk imports: `static` ones load with it, `lazy` ones on demand (`import()`). */
export function importsOf(code: string): { static: string[]; lazy: string[] } {
  const local = (spec: string) => spec.replace(/^\.\//, '').replace(/^.*\/_astro\//, '');
  const stat = [...code.matchAll(/(?:\bfrom\s*|\bimport\s*)["'](\.\/[^"']+\.js)["']/g)].map((m) => local(m[1]!));
  const lazy = [
    ...[...code.matchAll(/\bimport\(\s*["'](\.\/[^"']+\.js)["']\s*\)/g)].map((m) => local(m[1]!)),
    // Vite's preload helper lists the chunks of a dynamic import as "_astro/x.js" strings.
    ...[...code.matchAll(/["'](?:\/[^"']*)?_astro\/([^"'/]+\.js)["']/g)].map((m) => m[1]!),
  ];
  return { static: [...new Set(stat)], lazy: [...new Set(lazy)] };
}

/** The converter page's own entry chunks: the island's component and renderer, and its module scripts. */
export function converterEntries(html: string): string[] {
  const urls = [
    ...[...html.matchAll(/\b(?:component-url|renderer-url)="([^"]+)"/g)].map((m) => m[1]!),
    ...[...html.matchAll(/<script\b[^>]*type="module"[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]!),
    ...[...html.matchAll(/<script\b[^>]*\ssrc="([^"]+)"[^>]*type="module"/g)].map((m) => m[1]!),
  ];
  return [...new Set(urls.filter((u) => u.includes('/_astro/')).map((u) => u.replace(/^.*\/_astro\//, '')))];
}

export function bundleSizes(dist = join(import.meta.dir, '..', 'dist')): ChunkSize[] {
  const dir = join(dist, '_astro');
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  const code = new Map(files.map((f) => [f, readFileSync(join(dir, f))]));
  const size = (f: string) => {
    const buf = code.get(f);
    return buf ? { bytes: buf.length, gzipBytes: gzipSync(buf).length } : { bytes: 0, gzipBytes: 0 };
  };
  const closure = (entries: string[], withLazy: boolean) => {
    const seen = new Set<string>();
    const todo = [...entries];
    while (todo.length) {
      const f = todo.pop()!;
      if (seen.has(f) || !code.has(f)) continue;
      seen.add(f);
      const deps = importsOf(code.get(f)!.toString('utf8'));
      todo.push(...deps.static, ...(withLazy ? deps.lazy : []));
    }
    return seen;
  };
  const total = (name: string, set: Set<string>): ChunkSize => {
    let bytes = 0;
    let gzipBytes = 0;
    for (const f of set) {
      const s = size(f);
      bytes += s.bytes;
      gzipBytes += s.gzipBytes;
    }
    return { name, bytes, gzipBytes };
  };

  const out: ChunkSize[] = [];
  const index = join(dist, 'index.html');
  if (existsSync(index)) {
    const entries = converterEntries(readFileSync(index, 'utf8'));
    out.push(total(INITIAL, closure(entries, false)), total(ALL, closure(entries, true)));
  }
  // Chunks that share a name are summed: their order by size can change between builds, which would swap their
  // identities and hide growth, while the total of the group cannot.
  const byName = new Map<string, ChunkSize>();
  for (const f of files) {
    const name = stableName(f);
    const s = size(f);
    const hit = byName.get(name);
    if (hit) {
      hit.bytes += s.bytes;
      hit.gzipBytes += s.gzipBytes;
    } else byName.set(name, { name, ...s });
  }
  out.push(...[...byName.values()].sort((a, b) => a.name.localeCompare(b.name)));
  return out;
}
