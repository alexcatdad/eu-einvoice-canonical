/**
 * Where the site lives and how its pages are addressed. Shared by the content generator (site/prepare.ts), the
 * Astro config and pages, and the tests. Nothing here runs in the browser.
 */

export const SITE_URL = 'https://alexcatdad.github.io/eu-einvoice-canonical/';
export const REPO_URL = 'https://github.com/alexcatdad/eu-einvoice-canonical';
export const SITE_NAME = 'E-invoice to JSON';
/** The path the site is served under on GitHub Pages. */
export const BASE = '/eu-einvoice-canonical/';

/**
 * Pages of the hand-built site that moved when the site became an Astro build. Each old address gets a small
 * redirect page, so links and bookmarks from before keep working.
 */
export const MOVED: Record<string, string> = {
  'conformance.html': 'conformance/',
  'corpus.html': 'corpus/',
  'deliverables.html': 'deliverables/',
  'eval.html': 'eval/',
  'api.html': 'api-reference/',
};

/**
 * The route of a site path written the old way (`docs/cli.html`, `conformance.html`, `index.html`), or a new
 * one (`docs/cli/`), relative to the site root: `docs/cli/`, `conformance/`, ''. Files (schemas, the spec,
 * markdown twins) are returned as they are.
 */
export function route(path: string): string {
  const p = path.replace(/^\.?\//, '');
  if (p === '' || p === 'index.html') return '';
  if (MOVED[p]) return MOVED[p];
  if (/\.html$/.test(p)) return p.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '/');
  return p;
}

/** Absolute URL of a site path: canonical links, the sitemap, llms.txt. */
export const absolute = (path: string) => new URL(route(path), SITE_URL).href;

/** Root-relative URL of a site path, for links inside the built pages. */
export const siteHref = (path: string) => `${BASE}${route(path)}`;
