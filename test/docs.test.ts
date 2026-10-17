import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pkg from '../package.json' with { type: 'json' };
import { ANNOTATION_ASSET_PATH, ANNOTATION_ASSETS } from '../site/annotation-assets.js';
import { converts, UNPARSED_FORMATS } from '../site/coverage.js';
import { buildDocs, buildLlmsFull, buildLlmsTxt, PAGES, robotsTxt, sidebar, slugify } from '../site/docs.js';
import { BASE, MOVED, route, SITE_URL } from '../site/site.js';
import { FORMATS } from '../src/formats.js';
import { NotImplementedError, PARSERS } from '../src/parsers/index.js';

const root = join(import.meta.dir, '..');
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const extras: Record<string, string> = {};
for (const f of readdirSync(join(root, 'docs')).filter((f) => f.endsWith('.md'))) extras[f] = readFileSync(join(root, 'docs', f), 'utf8');
const site = buildDocs({ readme, extras, packageVersion: pkg.version, date: '2026-01-01' });

/** Routes of the site that are not generated docs pages: the Astro pages, TypeDoc and the static files. */
const SITE_ROUTES = [
  '',
  'conformance/',
  'corpus/',
  'deliverables/',
  'api-reference/',
  'eval/',
  'problems/',
  'api/',
  'llms.txt',
  'llms-full.txt',
  ...ANNOTATION_ASSETS.map((file) => `${ANNOTATION_ASSET_PATH}/${file}`),
];

describe('docs pages from the README', () => {
  test('every README section (## and ###) lands on a page', () => {
    const headings = [...readme.matchAll(/^(#{2,3}) (.+)$/gm)].map((m) => m[2] as string).filter((h, i, all) => all.indexOf(h) === i);
    // Skip headings inside fenced code blocks (shell comments in examples start with #).
    const prose = readme
      .split('```')
      .filter((_, i) => i % 2 === 0)
      .join('\n');
    const real = headings.filter((h) => new RegExp(`^#{2,3} ${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm').test(prose));
    const mapped = new Set(site.headings.map((h) => h.text));
    expect(real.filter((h) => !mapped.has(h))).toEqual([]);
    for (const h of site.headings)
      expect(site.pages.some((p) => p.route === (h.page === 'index' ? 'docs/' : `docs/${h.page}/`))).toBe(true);
  });

  test('every PAGES entry has README content and a page', () => {
    for (const def of PAGES) expect(site.pages.some((p) => p.route === route(`docs/${def.slug}.html`))).toBe(true);
  });

  test('there is a page for every registry format that is not a fallback', () => {
    for (const f of FORMATS.filter((f) => !f.id.endsWith('-unknown'))) {
      const page = site.pages.find((p) => p.route === `docs/formats/${f.id}/`);
      expect(page?.title).toBe(f.name);
      expect(page?.file).toBe(`docs/formats/${f.id}.md`);
    }
  });

  test('docs/*.md files get a page', () => {
    for (const file of Object.keys(extras))
      expect(site.pages.some((p) => p.route === `docs/${file.replace(/\.md$/, '').toLowerCase()}/`)).toBe(true);
  });

  test('titles and descriptions are unique and a sensible length', () => {
    const titles = site.pages.map((p) => p.title);
    expect(new Set(titles).size).toBe(titles.length);
    const descriptions = site.pages.map((p) => p.description);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    for (const p of site.pages) {
      expect(p.description.length).toBeGreaterThan(40);
      expect(p.description.length).toBeLessThanOrEqual(160);
    }
  });

  test('each page carries TechArticle and BreadcrumbList structured data with absolute URLs', () => {
    for (const p of site.pages) {
      const types = p.jsonld.map((o) => (o as { '@type': string })['@type']);
      expect(types).toEqual(['TechArticle', 'BreadcrumbList']);
      expect((p.jsonld[0] as { url: string }).url).toBe(`${SITE_URL}${p.route}`);
    }
  });

  test('the Starlight body has no h1 (Starlight writes the title) and no image', () => {
    for (const p of site.pages) {
      const prose = p.body
        .split('```')
        .filter((_, i) => i % 2 === 0)
        .join('');
      expect(prose).not.toMatch(/^# /m);
      expect(prose).not.toMatch(/!\[[^\]]*\]\(/);
      expect(prose.replace(/`[^`\n]*`/g, '')).not.toContain('<script');
    }
  });

  test('every internal link in a page body leads to a generated page or a site route', () => {
    const routes = new Set([...site.pages.map((p) => p.route), ...SITE_ROUTES]);
    const broken: string[] = [];
    for (const p of site.pages) {
      const prose = p.body
        .split('```')
        .filter((_, i) => i % 2 === 0)
        .join('');
      for (const m of prose.matchAll(/\]\(([^)\s]+)\)/g)) {
        const href = m[1] as string;
        if (href.startsWith('#') || /^https?:/.test(href)) continue;
        if (!href.startsWith(BASE)) {
          broken.push(`${p.route}: ${href} (not under ${BASE})`);
          continue;
        }
        const path = href.slice(BASE.length).split('#')[0] as string;
        const known = routes.has(path) || (/^(schemas|openapi)\//.test(path) && existsSync(join(root, path)));
        if (!known) broken.push(`${p.route}: ${href}`);
      }
    }
    expect(broken).toEqual([]);
  });

  test('a link to a README section that is a page title goes to the page without a fragment', () => {
    const page = site.pages.find((p) => p.route === 'docs/cli/');
    expect(page?.body).toContain(`](${BASE}docs/trusted-lists/)`);
  });

  test('the README badge row is left out, not shown as bare alt-text links', () => {
    const linkedImage = /\[!\[[^\]]*\]\([^)]*\)\]\(/;
    expect(site.pages.filter((p) => linkedImage.test(p.markdown) || linkedImage.test(p.body)).map((p) => p.route)).toEqual([]);
    expect(site.pages.every((p) => !p.body.includes('securityscorecards'))).toBe(true);
  });

  test('slugs follow the GitHub rule, so README anchors keep working', () => {
    expect(slugify('Mexico: CFDI (`mx-cfdi`)')).toBe('mexico-cfdi-mx-cfdi');
    expect(slugify('Conversion API (HTTP)')).toBe('conversion-api-http');
  });

  test('the sidebar lists every docs page once', () => {
    const links: string[] = [];
    const walk = (items: unknown[]) => {
      for (const i of items as { link?: string; items?: unknown[] }[]) {
        if (i.link) links.push(i.link);
        if (i.items) walk(i.items);
      }
    };
    walk(sidebar(site));
    expect(links.sort()).toEqual(site.pages.map((p) => `/${p.route}`).sort());
  });
});

describe('addresses', () => {
  test('old page addresses map to the new routes', () => {
    expect(route('index.html')).toBe('');
    expect(route('docs/cli.html')).toBe('docs/cli/');
    expect(route('docs/index.html')).toBe('docs/');
    expect(route('docs/formats/index.html')).toBe('docs/formats/');
    expect(route('conformance.html')).toBe('conformance/');
    expect(route('api.html')).toBe('api-reference/');
    expect(route('schemas/formats.json')).toBe('schemas/formats.json');
    expect(Object.values(MOVED).every((r) => SITE_ROUTES.includes(r))).toBe(true);
  });
});

describe('links to the repository and to generated pages', () => {
  const all = site.pages.flatMap((p) => [p.body, p.markdown]);

  test('every repository link in every page and markdown twin names a file that exists', () => {
    const missing = new Set<string>();
    for (const text of all)
      for (const m of text.matchAll(/https:\/\/github\.com\/alexcatdad\/eu-einvoice-canonical\/blob\/main\/([^"')\s#]+)/g))
        if (!existsSync(join(root, m[1] as string))) missing.add(m[1] as string);
    expect([...missing]).toEqual([]);
  });

  test('the formats index links every format page, not the repository', () => {
    const index = site.pages.find((p) => p.route === 'docs/formats/');
    for (const f of FORMATS.filter((f) => !f.id.endsWith('-unknown'))) {
      expect(index?.body).toContain(`](${BASE}docs/formats/${f.id}/)`);
      expect(index?.markdown).toContain(`${SITE_URL}docs/formats/${f.id}/`);
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
    expect(site.pages.find((p) => p.route === 'docs/formats/eslog-1/')?.markdown).toContain('not mapped yet');
    expect(site.pages.find((p) => p.route === 'docs/formats/eslog-2/')?.markdown).toContain('converts to canonical JSON');
  });
});

describe('llms.txt, llms-full.txt and robots.txt', () => {
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
    const md = new Set(site.pages.map((p) => `${SITE_URL}${p.file}`));
    for (const m of llms.matchAll(/\]\((https:[^)]+\.md)\)/g)) expect(md.has(m[1] as string)).toBe(true);
  });

  test('llms-full.txt holds the text of every page, with absolute links', () => {
    const full = buildLlmsFull(site);
    for (const p of site.pages) expect(full).toContain(`Source: ${SITE_URL}${p.route}`);
    expect(full).toContain('einvoice mcp');
    expect(full).not.toMatch(/\]\((?!https?:|#)[^)]*\)/);
  });

  test('robots.txt points at the sitemap index', () => {
    expect(robotsTxt()).toContain(`Sitemap: ${SITE_URL}sitemap-index.xml`);
  });
});
