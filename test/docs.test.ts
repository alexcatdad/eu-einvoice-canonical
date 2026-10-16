import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import pkg from '../package.json' with { type: 'json' };
import { SITE_URL } from '../site/chrome.js';
import { converts, UNPARSED_FORMATS } from '../site/coverage.js';
import { buildDocs, buildLlmsFull, buildLlmsTxt, buildSitemap, PAGES, robotsTxt, slugify } from '../site/docs.js';
import { FORMATS } from '../src/formats.js';
import { NotImplementedError, PARSERS } from '../src/parsers/index.js';

const root = join(import.meta.dir, '..');
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const extras: Record<string, string> = {};
for (const f of readdirSync(join(root, 'docs')).filter((f) => f.endsWith('.md'))) extras[f] = readFileSync(join(root, 'docs', f), 'utf8');
const site = buildDocs({ readme, extras, packageVersion: pkg.version, date: '2026-01-01' });

/** Pages that exist next to the generated docs: hand-written, or produced by other build steps. */
const SITE_FILES = [
  'index.html',
  'conformance.html',
  'corpus.html',
  'deliverables.html',
  'api.html',
  'eval.html',
  'llms.txt',
  'llms-full.txt',
  'sitemap.xml',
];
const SITE_DIRS = ['problems/', 'api/'];

describe('docs pages from the README', () => {
  test('every README section (## and ###) lands on a page', () => {
    const headings = [...readme.matchAll(/^(#{2,3}) (.+)$/gm)].map((m) => m[2] as string).filter((h, i, all) => all.indexOf(h) === i);
    // Skip headings inside fenced code blocks (shell comments in examples start with #).
    const fences = readme.split('```');
    const prose = fences.filter((_, i) => i % 2 === 0).join('\n');
    const real = headings.filter((h) => new RegExp(`^#{2,3} ${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm').test(prose));
    const mapped = new Set(site.headings.map((h) => h.text));
    expect(real.filter((h) => !mapped.has(h))).toEqual([]);
    for (const h of site.headings) expect(site.pages.some((p) => p.path === `docs/${h.page}.html`)).toBe(true);
  });

  test('every PAGES entry has README content, and every page has a section', () => {
    for (const def of PAGES) expect(site.pages.some((p) => p.path === `docs/${def.slug}.html`)).toBe(true);
  });

  test('there is a page for every registry format that is not a fallback', () => {
    for (const f of FORMATS.filter((f) => !f.id.endsWith('-unknown'))) {
      const page = site.pages.find((p) => p.path === `docs/formats/${f.id}.html`);
      expect(page?.title).toBe(f.name);
    }
  });

  test('docs/*.md files get a page', () => {
    for (const file of Object.keys(extras))
      expect(site.pages.some((p) => p.path === `docs/${file.replace(/\.md$/, '').toLowerCase()}.html`)).toBe(true);
  });

  test('titles and descriptions are unique and a sensible length', () => {
    const titles = site.pages.map((p) => /<title>([^<]*)<\/title>/.exec(p.html)?.[1]);
    expect(new Set(titles).size).toBe(titles.length);
    const descriptions = site.pages.map((p) => p.description);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    for (const p of site.pages) {
      expect(p.description.length).toBeGreaterThan(40);
      expect(p.description.length).toBeLessThanOrEqual(160);
    }
  });

  test('each page has a canonical URL, Open Graph tags, JSON-LD and headings with ids', () => {
    for (const p of site.pages) {
      expect(p.html).toContain(`<link rel="canonical" href="${SITE_URL}${p.path.replace(/index\.html$/, '')}">`);
      expect(p.html).toContain('property="og:title"');
      expect(p.html).toContain('property="og:description"');
      expect(p.html).toContain('"@type":"TechArticle"');
      expect(p.html).toContain('"@type":"BreadcrumbList"');
      const content = p.html;
      expect(content).not.toMatch(/<h[1-6](?=[\s>])(?![^>]*\bid=)[^>]*>/);
      expect(p.html).not.toContain('<script src');
      expect(p.html).not.toContain('<img');
    }
  });

  test('ids are unique within a page', () => {
    for (const p of site.pages) {
      const ids = [...p.html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
      expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    }
  });

  test('internal links resolve to a page, a known site file or a repository file, and fragments exist', () => {
    const byPath = new Map(site.pages.map((p) => [p.path, p]));
    const broken: string[] = [];
    for (const p of site.pages) {
      for (const m of p.html.matchAll(/<a [^>]*href="([^"]*)"/g)) {
        const href = (m[1] as string).replace(/&amp;/g, '&');
        if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
        const [file = '', frag] = href.split('#');
        const target = file === '' ? p.path : normalize(join(dirname(p.path), file === './' || file === '' ? '.' : file));
        const asPage = byPath.get(target) ?? byPath.get(`${target}index.html`) ?? byPath.get(`${target}/index.html`);
        if (asPage) {
          if (frag && !asPage.html.includes(`id="${frag}"`)) broken.push(`${p.path}: ${href} (no #${frag})`);
          continue;
        }
        const clean = target.replace(/\/$/, '');
        const known =
          target === '.' ||
          target === './' ||
          SITE_FILES.includes(clean) ||
          SITE_DIRS.includes(target) ||
          (/^(schemas|openapi)\//.test(clean) && existsSync(join(root, clean))) ||
          target === 'style.css';
        if (!known) broken.push(`${p.path}: ${href}`);
      }
    }
    expect(broken).toEqual([]);
  });

  test('the README intro mentions no image request: the badge is not emitted as an <img>', () => {
    expect(site.pages.every((p) => !p.html.includes('securityscorecards'))).toBe(true);
  });

  test('the README badge row is left out, not shown as bare alt-text links', () => {
    expect(site.pages.every((p) => !p.html.includes('code-scanning') && !p.markdown.includes('img.shields.io'))).toBe(true);
  });

  test('slugs follow the GitHub rule, so README anchors keep working', () => {
    expect(slugify('Mexico: CFDI (`mx-cfdi`)')).toBe('mexico-cfdi-mx-cfdi');
    expect(slugify('Conversion API (HTTP)')).toBe('conversion-api-http');
  });
});

describe('links to the repository and to generated pages', () => {
  const blob = 'https://github.com/alexcatdad/eu-einvoice-canonical/blob/main/';
  const all = site.pages.flatMap((p) => [p.html, p.markdown]);

  test('every repository link in every page and markdown twin names a file that exists', () => {
    const missing = new Set<string>();
    for (const text of all)
      for (const m of text.matchAll(/https:\/\/github\.com\/alexcatdad\/eu-einvoice-canonical\/blob\/main\/([^"')\s#]+)/g))
        if (!existsSync(join(root, m[1] as string))) missing.add(m[1] as string);
    expect([...missing]).toEqual([]);
    expect(blob.length).toBeGreaterThan(0);
  });

  test('the formats index links every format page, not the repository', () => {
    const index = site.pages.find((p) => p.path === 'docs/formats/index.html');
    for (const f of FORMATS.filter((f) => !f.id.endsWith('-unknown'))) {
      expect(index?.html).toContain(`/docs/formats/${f.id}.html"`);
      expect(index?.markdown).toContain(`${SITE_URL}docs/formats/${f.id}.html`);
    }
  });
});

describe('which formats convert', () => {
  test('a format listed as unparsed is refused by its parser, and the others are not listed', () => {
    for (const id of UNPARSED_FORMATS) {
      const format = FORMATS.find((f) => f.id === id);
      expect(format).toBeDefined();
      // biome-ignore lint/suspicious/noExplicitAny: the parsers refuse before they read the payload
      expect(() => PARSERS[format!.family]({ payload: {} as any, format: format as never, details: {}, fileSha256: '' })).toThrow(
        NotImplementedError,
      );
      expect(converts(format!)).toBe(false);
    }
    expect(converts(FORMATS.find((f) => f.id === 'eslog-2')!)).toBe(true);
  });

  test('a format page says whether the format converts', () => {
    expect(site.pages.find((p) => p.path === 'docs/formats/eslog-1.html')?.markdown).toContain('not mapped yet');
    expect(site.pages.find((p) => p.path === 'docs/formats/eslog-2.html')?.markdown).toContain('converts to canonical JSON');
  });
});

describe('llms.txt, llms-full.txt and the sitemap', () => {
  const llms = buildLlmsTxt(site, pkg.version);
  test('llms.txt follows the llmstxt.org shape and names the MCP server and the OpenAPI spec', () => {
    const lines = llms.split('\n');
    expect(lines[0]).toMatch(/^# \S/);
    expect(lines[2]).toMatch(/^> \S/);
    expect(llms).toContain('einvoice mcp');
    expect(llms).toContain(`${SITE_URL}openapi/openapi.yaml`);
    expect(llms).toMatch(/^## Optional$/m);
    for (const m of llms.matchAll(/^- \[[^\]]+\]\(([^)]+)\)/gm)) expect(m[1]).toMatch(/^https:\/\//);
  });

  test('every markdown file llms.txt links to is generated', () => {
    const md = new Set(site.pages.map((p) => `${SITE_URL}${p.path.replace(/\.html$/, '.md')}`));
    for (const m of llms.matchAll(/\]\((https:[^)]+\.md)\)/g)) expect(md.has(m[1] as string)).toBe(true);
  });

  test('llms-full.txt holds the text of every page, with absolute links', () => {
    const full = buildLlmsFull(site);
    for (const p of site.pages) expect(full).toContain(`Source: ${SITE_URL}${p.path.replace(/index\.html$/, '')}`);
    expect(full).toContain('einvoice mcp');
    expect(full).not.toMatch(/\]\((?!https?:|#)[^)]*\)/);
  });

  test('the sitemap lists absolute URLs and robots.txt points at it', () => {
    const xml = buildSitemap(['index.html', ...site.pages.map((p) => p.path)], '2026-01-01');
    expect(xml).toContain(`<loc>${SITE_URL}</loc>`);
    expect(xml).toContain(`<loc>${SITE_URL}docs/cli.html</loc>`);
    expect(robotsTxt()).toContain(`Sitemap: ${SITE_URL}sitemap.xml`);
  });
});
