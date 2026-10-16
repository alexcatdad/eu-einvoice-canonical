/**
 * The shared frame of every page: head tags, header with the site navigation, footer, and the SEO tags
 * (canonical URL, Open Graph, JSON-LD). Used at build time by site/build.ts, scripts/conformance.ts and
 * scripts/corpus-lib.ts, so the generated pages and the hand-written ones cannot drift apart.
 * Nothing here runs in the browser.
 *
 * Pages that are translated (the converter, deliverables) get `data-i18n` attributes on the frame text; the
 * catalogue keys live in site/i18n/*.json. Every other page gets the English text.
 */
import en from './i18n/en.json' with { type: 'json' };

export const SITE_URL = 'https://alexcatdad.github.io/eu-einvoice-canonical/';
export const REPO_URL = 'https://github.com/alexcatdad/eu-einvoice-canonical';
export const SITE_NAME = 'E-invoice to JSON';

export const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const text = (key: string) => en[key as keyof typeof en] ?? key;

export type NavId = 'converter' | 'docs' | 'formats' | 'realworld' | 'api' | 'deliverables';

interface NavItem {
  id: NavId;
  key: string;
  href: string;
}
const NAV: NavItem[] = [
  { id: 'converter', key: 'nav.converter', href: 'index.html' },
  { id: 'docs', key: 'nav.docs', href: 'docs/index.html' },
  { id: 'formats', key: 'nav.formats', href: 'conformance.html' },
  { id: 'realworld', key: 'nav.realworld', href: 'corpus.html' },
  { id: 'api', key: 'nav.api', href: 'api.html' },
  { id: 'deliverables', key: 'nav.deliverables', href: 'deliverables.html' },
];

/** Prefix that leads from a page at `path` (relative to the site root) back to the root: '', '../', '../../'. */
export function rootOf(path: string): string {
  return '../'.repeat(Math.max(0, path.split('/').length - 1));
}

export const absolute = (path: string) => new URL(path.replace(/index\.html$/, ''), SITE_URL).href;

const FONTS = 'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..800&family=IBM+Plex+Mono:wght@400;500&display=swap';
const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect x='5' y='3' width='22' height='26' rx='2' fill='%23FBF1B8' stroke='%2326358C' stroke-width='2'/%3E%3Cpath d='M10 10h12M10 15h12M10 20h7' stroke='%2326358C' stroke-width='2'/%3E%3C/svg%3E";

const i18nAttr = (i18n: boolean | undefined, key: string) => (i18n ? ` data-i18n="${key}"` : '');

export function header(opts: {
  root: string;
  current?: NavId;
  i18n?: boolean;
  sticky?: boolean;
  skip?: { href: string; key: string };
}): string {
  const { root, current, i18n } = opts;
  const skip = opts.skip ?? { href: '#main', key: 'nav.skip' };
  const home = root || './';
  const items = NAV.map((n) => {
    const here = n.id === current ? ' aria-current="page"' : '';
    return `<li><a href="${root}${n.href}"${here}${i18nAttr(i18n, n.key)}>${esc(text(n.key))}</a></li>`;
  });
  items.push(`<li><a class="external" href="${REPO_URL}"${i18nAttr(i18n, 'nav.github')}>${esc(text('nav.github'))}</a></li>`);
  const lang = i18n
    ? `<div class="lang"><label for="lang-select" data-i18n="lang.label">${esc(text('lang.label'))}</label><select id="lang-select"></select></div>`
    : '';
  return `<a class="skip" href="${skip.href}"${i18nAttr(i18n, skip.key)}>${esc(text(skip.key))}</a>
<header class="site-header${opts.sticky ? ' sticky' : ''}">
  <div class="site-header-in">
    <a class="brand" href="${home}"${i18nAttr(i18n, 'nav.home')}>${esc(text('nav.home'))}</a>
    <nav aria-label="${esc(text('nav.label'))}"${i18n ? ' data-i18n-attr="aria-label:nav.label"' : ''}>
      <ul>${items.join('')}</ul>
    </nav>
    ${lang}
  </div>
</header>`;
}

export function footer(opts: { root: string; i18n?: boolean }): string {
  const { root, i18n } = opts;
  const link = (href: string, key: string) => `<li><a href="${href}"${i18nAttr(i18n, key)}>${esc(text(key))}</a></li>`;
  return `<footer class="site-footer">
  <div class="site-footer-in">
    <p class="colophon-text"${i18n ? ' data-i18n-html="footer.colophon"' : ''}>${text('footer.colophon')}</p>
    <ul class="footer-links">
      ${link(`${root}index.html`, 'nav.converter')}
      ${link(`${root}docs/index.html`, 'nav.docs')}
      ${link(`${root}docs/line-roles-and-relations.html`, 'footer.relations')}
      ${link(`${root}eval.html`, 'footer.eval')}
      ${link(`${root}conformance.html`, 'nav.formats')}
      ${link(`${root}corpus.html`, 'nav.realworld')}
      ${link(`${root}api.html`, 'nav.api')}
      ${link(`${root}api/`, 'nav.typescript')}
      ${link(`${root}deliverables.html`, 'nav.deliverables')}
      ${link(`${root}llms.txt`, 'footer.llms')}
      ${link(REPO_URL, 'nav.github')}
    </ul>
  </div>
</footer>`;
}

/** Canonical URL, Open Graph, Twitter card and JSON-LD for a page. `path` is relative to the site root. */
export function seoTags(o: { title: string; description: string; path: string; type?: 'website' | 'article'; jsonld?: object[] }): string {
  const url = absolute(o.path);
  const tags = [
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:site_name" content="${esc(SITE_NAME)}">`,
    `<meta property="og:type" content="${o.type ?? 'website'}">`,
    `<meta property="og:title" content="${esc(o.title)}">`,
    `<meta property="og:description" content="${esc(o.description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    '<meta property="og:locale" content="en">',
    '<meta name="twitter:card" content="summary">',
    '<meta name="color-scheme" content="light dark">',
  ];
  for (const ld of o.jsonld ?? []) tags.push(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`);
  return tags.join('\n');
}

export function breadcrumbs(trail: { name: string; path: string }[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: absolute(c.path) })),
  };
}

export interface PageOptions {
  title: string;
  description: string;
  /** Path of the page relative to the site root, for example `docs/cli.html`. */
  path: string;
  /** The content of <main>. */
  body: string;
  current?: NavId;
  i18n?: boolean;
  bodyClass?: string;
  type?: 'website' | 'article';
  jsonld?: object[];
}

/** A complete page: head, header, <main id="main">, footer. */
export function page(o: PageOptions): string {
  const root = rootOf(o.path);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
${seoTags({ title: o.title, description: o.description, path: o.path, type: o.type, jsonld: o.jsonld })}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${FONTS}" rel="stylesheet">
<link rel="stylesheet" href="${root}style.css">
<link rel="icon" href="${FAVICON}">
</head>
<body${o.bodyClass ? ` class="${o.bodyClass}"` : ''}>
${header({ root, current: o.current, i18n: o.i18n })}
<main id="main">
${o.body}
</main>
${footer({ root, i18n: o.i18n })}
</body>
</html>
`;
}

/**
 * Fills the markers of a hand-written page: `<!--site-header-->`, `<!--site-footer-->` and `<!--site-seo-->`.
 * Title and description are read from the page itself so they are written once.
 */
export function fill(
  html: string,
  o: {
    path: string;
    current?: NavId;
    i18n?: boolean;
    sticky?: boolean;
    footer?: boolean;
    skip?: { href: string; key: string };
    type?: 'website' | 'article';
    jsonld?: object[];
  },
): string {
  const root = rootOf(o.path);
  const title = /<title[^>]*>([^<]*)<\/title>/.exec(html)?.[1] ?? SITE_NAME;
  const description = /<meta name="description"[^>]*content="([^"]*)"/.exec(html)?.[1] ?? '';
  return html
    .replace('<!--site-seo-->', seoTags({ title, description, path: o.path, type: o.type, jsonld: o.jsonld }))
    .replace('<!--site-header-->', header({ root, current: o.current, i18n: o.i18n, sticky: o.sticky, skip: o.skip }))
    .replace('<!--site-footer-->', o.footer === false ? '' : footer({ root, i18n: o.i18n }));
}
