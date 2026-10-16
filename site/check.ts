/**
 * Checks the built site in dist/ (run by `bun run build:site` after `astro build`; fails the build on a problem):
 *
 *   - every README section (## and the ### that get their own page) has a page, and every docs/*.md file and registry format too;
 *   - every internal link on every page leads to a file of the site, and its #fragment exists on the target page;
 *   - every page that moved from the hand-built site has its redirect page;
 *   - no page loads a script from another origin (the site makes no outside requests of its own);
 *   - llms.txt links only files that exist, and robots.txt points at the sitemap.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import pkg from '../package.json' with { type: 'json' };
import { buildDocs } from './docs.js';
import { BASE, MOVED, SITE_URL } from './site.js';

export interface CheckResult {
  pages: number;
  links: number;
  problems: string[];
}

/** All files under dir, as paths relative to it. */
function walk(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(dir, prefix))) {
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(join(dir, rel)).isDirectory()) out.push(...walk(dir, rel));
    else out.push(rel);
  }
  return out;
}

const ID = /\sid="([^"]+)"/g;
/** Undoes the entity escapes Astro writes in attributes, in one pass so `&amp;quot;` stays `&quot;`. */
const ENTITIES: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&#39;': "'" };
const decode = (s: string) => s.replace(/&(?:amp|quot|#39);/g, (e) => ENTITIES[e] ?? e);

export function checkSite(dist: string, root: string): CheckResult {
  const problems: string[] = [];
  const files = new Set(walk(dist));
  const html = [...files].filter((f) => f.endsWith('.html'));
  const ids = new Map<string, Set<string>>();
  const text = new Map<string, string>();
  for (const f of html) {
    const t = readFileSync(join(dist, f), 'utf8');
    text.set(f, t);
    ids.set(f, new Set([...t.matchAll(ID)].map((m) => decode(m[1]!))));
  }

  /** The file a site path (after the base) resolves to, as GitHub Pages serves it. */
  const resolve = (path: string): string | undefined => {
    const p = decodeURIComponent(path);
    if (p === '' || p.endsWith('/')) return files.has(`${p}index.html`) ? `${p}index.html` : undefined;
    if (files.has(p)) return p;
    if (files.has(`${p}/index.html`)) return `${p}/index.html`;
    return undefined;
  };

  // README sections, docs/*.md and formats: each has its page.
  const extras: Record<string, string> = {};
  for (const f of readdirSync(join(root, 'docs')).filter((f) => f.endsWith('.md'))) extras[f] = readFileSync(join(root, 'docs', f), 'utf8');
  const docs = buildDocs({
    readme: readFileSync(join(root, 'README.md'), 'utf8'),
    extras,
    packageVersion: pkg.version,
    date: '2026-01-01',
  });
  for (const h of docs.headings) {
    const page = docs.pages.find((p) => p.route === (h.page === 'index' ? 'docs/' : `docs/${h.page}/`));
    if (!page || !resolve(page.route)) problems.push(`README section "${h.text}" has no page in dist/`);
  }
  for (const p of docs.pages) if (!resolve(p.route)) problems.push(`docs page ${p.route} (${p.source}) is missing from dist/`);

  // Internal links and their fragments.
  let links = 0;
  for (const [file, t] of text) {
    if (/<meta http-equiv="refresh"/.test(t)) continue;
    const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : '';
    for (const m of t.matchAll(/<a\s[^>]*?href="([^"]*)"/g)) {
      const href = decode(m[1]!);
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href) && !href.startsWith(SITE_URL)) continue;
      links++;
      const [path = '', frag] = href.split('#');
      let target: string | undefined;
      if (href.startsWith(SITE_URL)) target = resolve(path.slice(SITE_URL.length));
      else if (path === '') target = file;
      else if (path.startsWith(BASE)) target = resolve(path.slice(BASE.length));
      else if (path.startsWith('/')) {
        problems.push(`${file}: ${href} is outside the site's base path`);
        continue;
      } else target = resolve(new URL(path, `https://x/${dir}`).pathname.slice(1));
      if (!target) {
        problems.push(`${file}: broken link ${href}`);
        continue;
      }
      if (frag && target.endsWith('.html') && !ids.get(target)?.has(decodeURIComponent(frag)))
        problems.push(`${file}: ${href} (no #${frag} on ${target})`);
    }
    for (const m of t.matchAll(/<script\b[^>]*\ssrc="([^"]+)"/g))
      if (/^(?:https?:)?\/\//.test(m[1]!)) problems.push(`${file}: loads a script from another origin (${m[1]})`);
  }

  // Redirects from the hand-built site's addresses.
  for (const from of Object.keys(MOVED)) if (!files.has(from)) problems.push(`redirect page ${from} is missing`);
  for (const p of docs.pages.filter((p) => p.kind === 'section' && p.route !== 'docs/'))
    if (!files.has(`${p.route.replace(/\/$/, '')}.html`)) problems.push(`redirect page for ${p.route} is missing`);

  // llms.txt, robots.txt, sitemap.
  const llms = files.has('llms.txt') ? readFileSync(join(dist, 'llms.txt'), 'utf8') : '';
  if (!llms) problems.push('llms.txt is missing');
  if (!files.has('llms-full.txt')) problems.push('llms-full.txt is missing');
  for (const m of llms.matchAll(/\]\((https:[^)]+)\)/g)) {
    const url = m[1]!;
    if (url.startsWith(SITE_URL) && !resolve(url.slice(SITE_URL.length).split('#')[0]!))
      problems.push(`llms.txt links ${url}, which is not in dist/`);
  }
  const robots = files.has('robots.txt') ? readFileSync(join(dist, 'robots.txt'), 'utf8') : '';
  const sitemap = /Sitemap: (\S+)/.exec(robots)?.[1];
  if (!sitemap?.startsWith(SITE_URL) || !files.has(sitemap.slice(SITE_URL.length)))
    problems.push('robots.txt does not point at the sitemap');

  return { pages: html.length, links, problems };
}

if (import.meta.main) {
  const root = join(import.meta.dir, '..');
  const dist = join(root, 'dist');
  if (!existsSync(dist)) {
    console.error('dist/ is missing: build the site first');
    process.exit(1);
  }
  const r = checkSite(dist, root);
  for (const p of r.problems) console.error(p);
  console.log(
    `Checked ${r.pages} pages and ${r.links} internal links: ${r.problems.length ? `${r.problems.length} problems` : 'no problems'}.`,
  );
  if (r.problems.length) process.exit(1);
}
