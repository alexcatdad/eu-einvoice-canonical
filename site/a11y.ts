/**
 * The site's accessibility and privacy gate, run in CI on the built site (dist/), in Chromium:
 *
 *   - axe-core finds no violation, in the light and the dark theme, on the converter (every result tab, with the example
 *     sample converted) and on the docs and reference pages;
 *   - nothing scrolls sideways at 320 and 375 px;
 *   - every element the keyboard reaches on the converter shows a visible focus indicator;
 *   - the pages request nothing from other hosts except the fonts.
 *
 *   bunx playwright install chromium && bun a11y.ts
 */
import { join, normalize } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { type Browser, type BrowserContextOptions, chromium, type Page } from 'playwright';
import { BASE } from './site.js';

const dist = join(import.meta.dir, '..', 'dist');
const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url);
    const path = normalize(decodeURIComponent(url.pathname.slice(BASE.length - 1))).replace(/^(\.\.[/\\])+/, '');
    const file = Bun.file(join(dist, path.endsWith('/') ? `${path}index.html` : path));
    return (await file.exists()) ? new Response(file) : new Response('Not found', { status: 404 });
  },
});
const origin = `http://localhost:${server.port}`;
const at = (route: string) => `${origin}${BASE}${route}`;

const PAGES = [
  'docs/',
  'docs/cli/',
  'docs/rendering/',
  'docs/formats/',
  'docs/formats/peppol-bis3/',
  'docs/supply-chain/',
  'api/',
  'conformance/',
  'corpus/',
  'deliverables/',
  'eval/',
  'problems/',
  'api-reference/',
];
/** Fonts are the one outside request the site makes on its own. */
const ALLOWED_HOSTS = new Set(['localhost', 'fonts.googleapis.com', 'fonts.gstatic.com']);
const problems: string[] = [];

/** A page in a context of its own: axe-core's Playwright runner needs a page from browser.newContext(). */
async function open(browser: Browser, options: BrowserContextOptions): Promise<Page> {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.on('close', () => void context.close());
  return page;
}

async function axe(page: Page, label: string) {
  // Scalar's own reference markup is a third-party component; the page around it is checked. Scalar renders a <main>
  // of its own inside the page's, so the two landmark rules about <main> cannot pass there.
  let builder = new AxeBuilder({ page }).exclude('[data-scalar-client]');
  if (label.startsWith('api-reference/')) builder = builder.disableRules(['landmark-main-is-top-level', 'landmark-no-duplicate-main']);
  const result = await builder.analyze();
  for (const v of result.violations)
    problems.push(
      `${label}: ${v.id} (${v.impact}) ${v.help}: ${v.nodes
        .map((n) => n.target.join(' '))
        .slice(0, 5)
        .join(', ')}`,
    );
}

async function noSideways(page: Page, label: string) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (over > 0) problems.push(`${label}: scrolls sideways by ${over}px`);
  // The page clips sideways overflow (overflow-x: clip), so also look for anything that sticks out and is cut off,
  // leaving out what sits in a box that scrolls on its own (tables, code).
  const cut = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const inScroller = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement)
        if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX)) return true;
      return false;
    };
    return [...document.body.querySelectorAll('*')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.right > width + 1 && getComputedStyle(el).visibility !== 'hidden' && !inScroller(el);
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
  });
  if (cut.length) problems.push(`${label}: cut off at the right edge: ${cut.join(', ')}`);
}

function watchRequests(page: Page, label: string) {
  page.on('request', (r) => {
    const host = new URL(r.url()).hostname;
    if (r.url().startsWith('http') && !ALLOWED_HOSTS.has(host)) problems.push(`${label}: outside request to ${r.url()}`);
  });
}

async function converter(browser: Browser, scheme: 'light' | 'dark') {
  const page = await open(browser, { colorScheme: scheme, viewport: { width: 1440, height: 900 } });
  watchRequests(page, `converter (${scheme})`);
  await page.goto(at(''));
  await page.locator('.stamp').first().waitFor();
  for (const tab of ['Invoice', 'JSON', 'Checks', 'Lines']) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await page.waitForTimeout(100);
    await axe(page, `converter ${tab} tab (${scheme})`);
  }
  await page.close();
}

async function focusVisible(browser: Browser) {
  const page = await open(browser, { viewport: { width: 1440, height: 900 } });
  await page.goto(at(''));
  await page.locator('.stamp').first().waitFor();
  const seen = new Set<string>();
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return undefined;
      const s = getComputedStyle(el);
      // A file input hidden visually shows its focus on the drop zone around it, the paste box's textarea on the box.
      const frame = el.matches('.slot input') ? el.closest('.slot') : el.matches('.paste textarea') ? el.closest('.paste') : null;
      const shown = frame ? getComputedStyle(frame) : s;
      const ring = shown.outlineStyle !== 'none' && Number.parseFloat(shown.outlineWidth) > 0;
      const shadow = shown.boxShadow !== 'none';
      return {
        name: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${[...el.classList].join('.')} "${(el.textContent ?? '').trim().slice(0, 30)}"`,
        ok: ring || shadow,
      };
    });
    if (!r || seen.has(r.name)) continue;
    seen.add(r.name);
    if (!r.ok) problems.push(`converter: no visible focus on ${r.name}`);
  }
  await page.close();
}

const browser = await chromium.launch();
try {
  for (const scheme of ['light', 'dark'] as const) {
    await converter(browser, scheme);
    for (const route of PAGES) {
      const page = await open(browser, { colorScheme: scheme, viewport: { width: 1440, height: 900 } });
      watchRequests(page, `${route} (${scheme})`);
      await page.goto(at(route));
      await page.waitForLoadState('networkidle');
      await axe(page, `${route} (${scheme})`);
      await page.close();
    }
  }
  for (const width of [320, 375]) {
    for (const route of ['', ...PAGES]) {
      const page = await open(browser, { viewport: { width, height: 800 } });
      await page.goto(at(route));
      if (route === '') await page.locator('.stamp').first().waitFor();
      else await page.waitForLoadState('networkidle');
      await noSideways(page, `${route || 'converter'} at ${width}px`);
      if (route === '') await axe(page, `converter at ${width}px`);
      await page.close();
    }
  }
  await focusVisible(browser);
} finally {
  await browser.close();
  server.stop();
}

for (const p of problems) console.error(p);
console.log(problems.length ? `${problems.length} accessibility or privacy problems.` : 'No accessibility or privacy problems.');
if (problems.length) process.exit(1);
