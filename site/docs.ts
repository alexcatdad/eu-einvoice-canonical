/**
 * Static documentation pages, generated from README.md (and docs/*.md) at build time. The README stays the single
 * source of truth: this file only decides which section lands on which page and writes the metadata for it.
 *
 *   - Every README section (## and the ### it names) maps to one page through PAGES. An unmapped section throws, so a
 *     new README section cannot silently drop out of the site (test/docs.test.ts checks the same).
 *   - One page per registry format (docs/formats/<id>.html) is assembled from the registry plus the README table rows
 *     that mention the format id.
 *   - The same markdown feeds the HTML pages, docs/<slug>.md, llms.txt and llms-full.txt.
 *
 * Nothing here ships to the browser; the pages are plain HTML with no script.
 */
import { Lexer, Marked, type Token, type Tokens } from 'marked';
import { FORMATS } from '../src/formats.js';
import { absolute, breadcrumbs, esc, page, REPO_URL, rootOf, SITE_URL } from './chrome.js';
import { converts } from './coverage.js';

export const GROUPS = ['Start', 'Use it', 'Model and contracts', 'Formats', 'Project'] as const;
type Group = (typeof GROUPS)[number];

interface PageDef {
  slug: string;
  title: string;
  description: string;
  group: Group;
  /** README headings (## or ###) whose content belongs on this page, in README order. '' is the text before the first ##. */
  sections: string[];
  /** Pages worth a link at the bottom. */
  related?: { href: string; label: string }[];
}

export const PAGES: PageDef[] = [
  {
    slug: 'index',
    title: 'eu-einvoice-canonical documentation',
    description:
      'Documentation for eu-einvoice-canonical, which reads XML e-invoices from the EU (Peppol BIS 3, XRechnung, Factur-X, FatturaPA, KSeF) and converts them to JSON.',
    group: 'Start',
    sections: ['', 'Layout'],
  },
  {
    slug: 'getting-started',
    title: 'Getting started',
    description:
      'Install and use eu-einvoice-canonical: convert(bytes) in TypeScript, opt-in field provenance, and how a parser reads the source XML.',
    group: 'Start',
    sections: ['Getting started'],
  },
  {
    slug: 'languages',
    title: 'Site languages',
    description:
      'The browser converter speaks English, German, French, Italian, Spanish, Dutch, Polish and Romanian. How the language is chosen and how to correct a translation.',
    group: 'Start',
    sections: ['Site languages'],
  },
  {
    slug: 'cli',
    title: 'Command line',
    description:
      'The einvoice command line: detect, inspect, convert, render, write, sweep and serve e-invoices, with exit codes for scripts.',
    group: 'Use it',
    sections: ['Command line'],
  },
  {
    slug: 'mcp',
    title: 'MCP server for AI agents',
    description:
      'Run einvoice mcp, a Model Context Protocol server that lets an AI agent detect, convert and validate e-invoices without network access.',
    group: 'Use it',
    sections: ['MCP server for AI agents'],
  },
  {
    slug: 'http-api',
    title: 'Conversion API (HTTP)',
    description:
      'The einvoice serve HTTP API (OpenAPI 3.1): convert, inspect, detect, list formats and fetch schemas, with RFC 9457 errors and a Docker image.',
    group: 'Use it',
    sections: ['Conversion API (HTTP)'],
    related: [{ href: 'api.html', label: 'Interactive API reference' }],
  },
  {
    slug: 'trusted-lists',
    title: 'EU trusted lists',
    description:
      'Check e-invoice signers against the EU List of Trusted Lists with signed snapshots, from the library, the CLI and the browser.',
    group: 'Use it',
    sections: ['EU trusted lists'],
  },
  {
    slug: 'rendering',
    title: 'Human-readable rendering',
    description:
      'renderHtml and renderPdf turn a canonical e-invoice into a self-contained HTML page or an A4 PDF that a person can read, print or archive.',
    group: 'Use it',
    sections: ['Human-readable rendering'],
  },
  {
    slug: 'writers',
    title: 'Writing UBL and CII',
    description:
      'Write a canonical invoice back to Peppol BIS 3 UBL 2.1 or EN 16931 CII D16B with toUbl and toCii: deterministic, escaped and round-trip tested.',
    group: 'Use it',
    sections: ['Writing UBL and CII'],
  },
  {
    slug: 'canonical-model',
    title: 'The canonical model',
    description:
      'The canonical invoice model: the EN 16931 core, EU-wide additions, clearance data, country extensions and where every value came from.',
    group: 'Model and contracts',
    sections: ['The canonical model'],
  },
  {
    slug: 'line-roles-and-relations',
    title: 'Line roles and relations',
    description:
      'How the converter tells items from headings and surcharge lines and links them with proven arithmetic, plus an optional in-browser language model for the rest.',
    group: 'Model and contracts',
    sections: ['Line roles and relations'],
    related: [
      { href: 'eval.html', label: 'Line labelling evaluation: rules against language models' },
      { href: 'index.html', label: 'Try it in the converter' },
    ],
  },
  {
    slug: 'json-schema',
    title: 'JSON Schema',
    description:
      'The published JSON Schemas (draft 2020-12) for the canonical invoice, the convert result and the inspect result, and how they are versioned.',
    group: 'Model and contracts',
    sections: ['JSON Schema'],
  },
  {
    slug: 'deliverables-and-versioning',
    title: 'Deliverables and versioning',
    description:
      'What the project publishes (library, JSON Schemas, OpenAPI spec, CLI binaries, browser converter) and the compatibility promise between v1 and v2.',
    group: 'Model and contracts',
    sections: ['Deliverables and versioning'],
    related: [{ href: 'deliverables.html', label: 'Deliverables page' }],
  },
  {
    slug: 'eu-coverage',
    title: 'EU coverage',
    description: 'Which e-invoice formats you will receive from each of the 27 EU member states, with mandate dates and notes.',
    group: 'Formats',
    sections: ['EU coverage'],
    related: [
      { href: 'docs/formats/index.html', label: 'Every supported format' },
      { href: 'conformance.html', label: 'Conformance checklist' },
    ],
  },
  {
    slug: 'beyond-the-eu',
    title: 'Beyond the EU',
    description:
      'Peppol PINT (Singapore, Australia, New Zealand, Japan, Malaysia, UAE) and Saudi ZATCA invoices, mapped on top of the UBL parser.',
    group: 'Formats',
    sections: ['Beyond the EU'],
  },
  {
    slug: 'build-order',
    title: 'Build order and mapping notes',
    description: 'The parser families in the order they were built, with the mapping notes for each national e-invoice format.',
    group: 'Formats',
    sections: ['Build order'],
  },
  {
    slug: 'mexico-cfdi',
    title: 'Mexico: CFDI',
    description:
      'How a Mexican CFDI 3.3 or 4.0 invoice maps to the canonical model: taxes, withholdings, payments, the SAT stamp, and what the model cannot say.',
    group: 'Formats',
    sections: ['Mexico: CFDI (`mx-cfdi`)'],
  },
  {
    slug: 'what-was-tested',
    title: 'What was tested',
    description:
      'The test suite behind the converter: detection, parsers, hostile input, decimal values, the known-answer sweep and the real-sample runs.',
    group: 'Project',
    sections: ['What was tested'],
    related: [
      { href: 'conformance.html', label: 'Conformance checklist' },
      { href: 'corpus.html', label: 'Real-world results' },
    ],
  },
  {
    slug: 'security',
    title: 'Security',
    description:
      'How the converter treats inbound e-invoices as hostile: DOCTYPE rejection, size and nesting limits, bounded ZIP and PDF decompression.',
    group: 'Project',
    sections: ['Security'],
  },
  {
    slug: 'decisions',
    title: 'Design decisions',
    description:
      'Why VAT stays EN-shaped, why kind is only the accounting direction, which fields are required and how extensions are typed.',
    group: 'Project',
    sections: ['Decisions'],
  },
  {
    slug: 'known-gaps',
    title: 'Known gaps',
    description:
      'What the converter does not do yet: unverified detection rules, EN 16931-1:2026, signature trust, national validation, PINT and ZATCA rules.',
    group: 'Project',
    sections: ['Known gaps'],
  },
  {
    slug: 'license',
    title: 'License',
    description: 'eu-einvoice-canonical is released under the 0BSD licence; third-party sample files keep their own licences.',
    group: 'Project',
    sections: ['License'],
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocPage {
  /** Path from the site root, for example `docs/cli.html`. */
  path: string;
  title: string;
  description: string;
  group: Group;
  kind: 'section' | 'format' | 'extra' | 'formats-index';
  /** The page as markdown, links absolute: also published as `<path without .html>.md` and joined into llms-full.txt. */
  markdown: string;
  /** The complete HTML document. */
  html: string;
  /** README headings that ended up on this page. */
  sections: string[];
  source: string;
}

export interface DocSources {
  readme: string;
  /** docs/*.md: file name (`SUPPLY-CHAIN.md`) to content. */
  extras: Record<string, string>;
  packageVersion: string;
  /** ISO date for dateModified in the JSON-LD. */
  date: string;
}

export interface DocSite {
  pages: DocPage[];
  /** Every README heading (## and ###) with the page it ended up on: what the coverage test reads. */
  headings: { text: string; depth: number; page: string }[];
}

// ---------------------------------------------------------------------------
// README splitting
// ---------------------------------------------------------------------------

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-');

const sectionToPage = new Map<string, PageDef>();
for (const p of PAGES) for (const s of p.sections) sectionToPage.set(s, p);

interface Block {
  def: PageDef;
  /** The README heading text, '' for the introduction. */
  heading: string;
  depth: number;
  tokens: Token[];
}

/** Splits the README into blocks: the intro, each ##, and each ### that PAGES names (carved out of its parent). */
function splitReadme(tokens: Token[]): { blocks: Block[]; headings: DocSite['headings'] } {
  const blocks: Block[] = [];
  const headings: DocSite['headings'] = [];
  let cur: Block | undefined;
  const intro = sectionToPage.get('');
  if (!intro) throw new Error('PAGES has no page for the README introduction');
  cur = { def: intro, heading: '', depth: 1, tokens: [] };
  blocks.push(cur);
  let parent = intro;
  for (const tok of tokens) {
    if (tok.type === 'heading' && tok.depth === 1) continue;
    if (tok.type === 'heading' && (tok.depth === 2 || (tok.depth === 3 && sectionToPage.has(tok.text)))) {
      const def = sectionToPage.get(tok.text);
      if (!def) throw new Error(`README section "${tok.text}" is not mapped to a docs page: add it to PAGES in site/docs.ts`);
      cur = { def, heading: tok.text, depth: tok.depth, tokens: [] };
      blocks.push(cur);
      headings.push({ text: tok.text, depth: tok.depth, page: def.slug });
      if (tok.depth === 2) parent = def;
      continue;
    }
    if (tok.type === 'heading' && tok.depth >= 2) headings.push({ text: tok.text, depth: tok.depth, page: cur?.def.slug ?? parent.slug });
    cur.tokens.push(tok);
  }
  for (const p of PAGES)
    for (const s of p.sections)
      if (s && !headings.some((h) => h.text === s)) throw new Error(`PAGES names "${s}", which is not a heading in the README`);
  return { blocks, headings };
}

/**
 * A paragraph of nothing but linked images: the README's status badges. The site makes no outside requests,
 * so they would show as a row of bare alt-text links; the docs pages leave them out.
 */
function isBadgeRow(t: Token): boolean {
  if (t.type !== 'paragraph') return false;
  const inline = (t as Tokens.Paragraph).tokens.filter((i) => !(i.type === 'text' && i.raw.trim() === '') && i.type !== 'br');
  return inline.length > 0 && inline.every((i) => i.type === 'link' && (i as Tokens.Link).tokens.every((c) => c.type === 'image'));
}

/** The markdown of one block with headings moved so the page's own title is the only h1. */
function shiftedTokens(block: Block, first: boolean): Token[] {
  const shift = first ? block.depth - 1 : block.depth - 2;
  return block.tokens.map((t) => (t.type === 'heading' ? ({ ...t, depth: Math.max(2, t.depth - shift) } as Tokens.Heading) : t));
}

const headingRaw = (t: Tokens.Heading) => `${'#'.repeat(t.depth)} ${t.text}\n\n`;

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

interface LinkContext {
  /** Path of the page the link is on (for relative output), or undefined to produce absolute URLs. */
  from?: string;
  anchors: Map<string, string>;
  /** `docs/SUPPLY-CHAIN.md` to `docs/supply-chain.html`. */
  extras: Map<string, string>;
  /** The slug of the page being rendered, to keep same-page anchors as `#x`. */
  self: string;
}

function resolveHref(href: string, ctx: LinkContext): string {
  /** A site path (no leading slash), relative to the page when `from` is set, else absolute. */
  const local = (path: string, frag = '') => {
    if (!ctx.from) return absolute(path) + frag;
    if (path === ctx.from) return frag || './';
    return `${rootOf(ctx.from)}${path}`.replace(/(^|\/)index\.html$/, '$1') + frag || './';
  };
  if (href.startsWith('#')) {
    const target = ctx.anchors.get(href.slice(1));
    return target ? local(pagePath(target), href) : href;
  }
  if (href.startsWith(SITE_URL)) {
    const [path = '', frag = ''] = href.slice(SITE_URL.length).split(/(?=#)/);
    return local(path || 'index.html', frag);
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
  const [file = '', frag = ''] = href.split(/(?=#)/);
  const extra = ctx.extras.get(file);
  if (extra) return local(extra, frag);
  if (/^(openapi|schemas)\//.test(file) || /^docs\/[\w/-]+\.html$/.test(file)) return local(file, frag);
  return `${REPO_URL}/blob/main/${file}${frag}`;
}

const pagePath = (slug: string) => `docs/${slug}.html`;

/** Rewrites markdown links to absolute URLs, leaving code blocks alone. */
function absolutizeMarkdown(md: string, ctx: LinkContext): string {
  return md
    .split(/(```[\s\S]*?```)/g)
    .map((part, i) =>
      i % 2 ? part : part.replace(/\]\(([^)\s]+)\)/g, (_m, href: string) => `](${resolveHref(href, { ...ctx, from: undefined })})`),
    )
    .join('');
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderBody(
  tokens: Token[],
  ctx: LinkContext,
  links: Tokens.Generic['links'],
): { html: string; headings: { id: string; text: string; depth: number }[] } {
  const used = new Set<string>();
  const headings: { id: string; text: string; depth: number }[] = [];
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading(t: Tokens.Heading) {
        let id = slugify(t.text) || 'section';
        for (let n = 2; used.has(id); n++) id = `${slugify(t.text) || 'section'}-${n}`;
        used.add(id);
        const plain = t.text.replace(/`/g, '');
        headings.push({ id, text: plain, depth: t.depth });
        return `<h${t.depth} id="${id}">${this.parser.parseInline(t.tokens)}<a class="anchor" href="#${id}" aria-label="Link to ${esc(plain)}">#</a></h${t.depth}>\n`;
      },
      link(t: Tokens.Link) {
        const title = t.title ? ` title="${esc(t.title)}"` : '';
        return `<a href="${esc(resolveHref(t.href, ctx))}"${title}>${this.parser.parseInline(t.tokens)}</a>`;
      },
      // The README has a badge image; the site makes no outside requests, so an image renders as its alt text.
      image(t: Tokens.Image) {
        return esc(t.text);
      },
    },
  });
  const list = Object.assign([...tokens], { links }) as Token[] & { links: Tokens.Generic['links'] };
  const html = marked
    .parser(list)
    .replace(/<table>/g, '<div class="table-scroll" tabindex="0"><table>')
    .replace(/<\/table>/g, '</table></div>')
    .replace(/<pre>/g, '<pre tabindex="0">');
  return { html, headings };
}

function sidebar(pages: DocPage[], current: string): string {
  const root = rootOf(current);
  const rel = (p: string) => `${root}${p}`.replace(/index\.html$/, '');
  const groups = GROUPS.map((g) => {
    const items = pages.filter((p) => p.group === g && p.kind !== 'format');
    if (!items.length) return '';
    const lis = items
      .map((p) => `<li><a href="${rel(p.path)}"${p.path === current ? ' aria-current="page"' : ''}>${esc(shortTitle(p))}</a></li>`)
      .join('');
    return `<p class="side-h">${g}</p><ul>${lis}</ul>`;
  }).join('');
  return groups;
}

const shortTitle = (p: DocPage) => (p.path === 'docs/index.html' ? 'Overview' : p.title);

interface Shell {
  pages: DocPage[];
  version: string;
  date: string;
}

function shell(
  p: Omit<DocPage, 'html'>,
  bodyHtml: string,
  headings: { id: string; text: string; depth: number }[],
  ctx: Shell,
  extra: { related?: { href: string; label: string }[]; edit: string; crumbs: { name: string; path: string }[] },
): string {
  const root = rootOf(p.path);
  const side = sidebar(ctx.pages, p.path);
  const toc = headings.filter((h) => h.depth === 2);
  const tocHtml =
    toc.length >= 3
      ? `<nav class="toc" aria-label="On this page"><p>On this page</p><ul>${toc.map((h) => `<li><a href="#${h.id}">${esc(h.text)}</a></li>`).join('')}</ul></nav>`
      : '';
  const ordered = ctx.pages.filter((x) => x.kind === 'section' || x.kind === 'extra');
  const i = ordered.findIndex((x) => x.path === p.path);
  const prev = i > 0 ? ordered[i - 1] : undefined;
  const next = i >= 0 ? ordered[i + 1] : undefined;
  const pager = (x: DocPage | undefined, cls: string, label: string) =>
    x ? `<a class="${cls}" href="${root}${x.path}"><span>${label}</span>${esc(shortTitle(x))}</a>` : '<span></span>';
  const related = extra.related?.length
    ? `<section class="related" aria-labelledby="related-h"><h2 id="related-h">Related</h2><ul>${extra.related.map((r) => `<li><a href="${root}${r.href.replace(/index\.html$/, '')}">${esc(r.label)}</a></li>`).join('')}</ul></section>`
    : '';
  const crumbs = `<nav class="crumbs" aria-label="Breadcrumb"><ol>${extra.crumbs
    .map((c, n) =>
      n === extra.crumbs.length - 1
        ? `<li aria-current="page">${esc(c.name)}</li>`
        : `<li><a href="${root}${c.path.replace(/index\.html$/, '')}">${esc(c.name)}</a></li>`,
    )
    .join('')}</ol></nav>`;
  const h1Id = (p.kind === 'section' && p.path !== 'docs/index.html' ? slugify(p.sections[0] ?? p.title) : slugify(p.title)) || 'top';
  const body = `<div class="docs">
  <div class="docs-side"><nav aria-label="Documentation">${side}</nav></div>
  <details class="docs-menu"><summary>Documentation menu</summary><nav aria-label="Documentation menu">${side}</nav></details>
  <article class="prose">
    ${crumbs}
    <h1 id="${h1Id}">${esc(p.title)}</h1>
    ${tocHtml}
    ${bodyHtml}
    ${related}
    <nav class="pager" aria-label="Previous and next page">${pager(prev, 'prev', 'Previous')}${pager(next, 'next', 'Next')}</nav>
    <p class="edit"><a href="${esc(extra.edit)}">Edit this page on GitHub</a> (the documentation is generated from the README).</p>
  </article>
</div>`;
  const jsonld = [
    {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: p.title,
      description: p.description,
      url: absolute(p.path),
      inLanguage: 'en',
      dateModified: ctx.date,
      author: { '@type': 'Person', name: 'alexcatdad', url: 'https://github.com/alexcatdad' },
      isPartOf: { '@type': 'WebSite', name: 'E-invoice to JSON', url: SITE_URL },
      about: { '@type': 'SoftwareSourceCode', name: 'eu-einvoice-canonical', codeRepository: REPO_URL },
    },
    breadcrumbs(extra.crumbs),
  ];
  return page({
    title: p.title.includes('eu-einvoice-canonical') ? p.title : `${p.title} · eu-einvoice-canonical`,
    description: p.description,
    path: p.path,
    body,
    current: 'docs',
    type: 'article',
    bodyClass: 'doc-page',
    jsonld,
  });
}

// ---------------------------------------------------------------------------
// Format pages
// ---------------------------------------------------------------------------

type Row = string[];
interface Table {
  header: string[];
  rows: Row[];
}

function tableStartingWith(tokens: Token[], first: string): Table | undefined {
  for (const t of tokens) {
    if (t.type !== 'table') continue;
    const tb = t as Tokens.Table;
    if (tb.header[0]?.text === first) return { header: tb.header.map((c) => c.text), rows: tb.rows.map((r) => r.map((c) => c.text)) };
  }
  return undefined;
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const countryName = (cc: string) => (cc === 'EU' ? 'all EU countries' : (regionNames.of(cc) ?? cc));

/** `en16931-ubl` / `-cii` in a table cell means both ids; expand it so each format page finds its row. */
const expandIds = (cell: string) => cell.replace(/`([a-z0-9]+(?:-[a-z0-9]+)*)-ubl` \/ `-cii`/g, '`$1-ubl` `$1-cii`');
const mentions = (cell: string, id: string) => expandIds(cell).includes(`\`${id}\``);
const firstSentence = (s: string) => /^.*?[.!?](?=\s|$)/s.exec(s)?.[0] ?? s;
const clip = (s: string, n = 158) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…`);

function formatMarkdown(f: (typeof FORMATS)[number], readme: Token[]): { md: string; description: string } {
  const coverage = tableStartingWith(readme, 'Country');
  const beyond = tableStartingWith(readme, 'Format ID');
  const build = tableStartingWith(readme, 'Phase');
  const ok = converts(f);
  const countries = f.countries.map((c) => (c === 'EU' ? 'EU-wide' : `${countryName(c)} (${c})`)).join(', ');
  const status = {
    current: 'in active use',
    legacy: 'legacy: superseded but still sent',
    unverified: 'unverified: the detection rule is not confirmed against a real file',
  }[f.status];
  const lines: string[] = [
    `# ${f.name}`,
    '',
    `- Format id: \`${f.id}\``,
    `- Countries: ${countries}`,
    `- Status: ${status}`,
    `- Parser: \`${f.family}\` family, ${ok ? 'converts to canonical JSON' : 'identified only; this format is not mapped yet'}`,
    '',
    f.notes,
  ];
  const where = (coverage?.rows ?? []).filter((r) => mentions(r[1] ?? '', f.id));
  if (where.length) {
    lines.push('', '## Where you will receive it', '');
    for (const r of where) lines.push(`- **${r[0]}**: ${r[1]}${r[2] ? `. ${r[2]}` : ''}`);
  }
  const pint = (beyond?.rows ?? []).filter((r) => mentions(r[0] ?? '', f.id));
  if (pint.length) {
    lines.push('', '## What is mapped', '');
    for (const r of pint) lines.push(`- Identifier ${r[1]}: ${r[2]}`);
    lines.push('', 'See [Beyond the EU](#beyond-the-eu) for ZATCA and the validation limits of PINT.');
  }
  const fam = (build?.rows ?? []).filter((r) => mentions(r[1] ?? '', f.family) || (r[1] ?? '').includes(`\`${f.family}\``));
  if (fam.length) {
    lines.push('', `## Mapping notes for the \`${f.family}\` parser family`, '');
    for (const r of fam) lines.push(`- Phase ${r[0]}. Covers: ${r[2]}. ${r[3]}`);
    lines.push('', 'The same parser family handles the formats listed in [Build order and mapping notes](#build-order).');
  }
  if (f.id === 'mx-cfdi') lines.push('', 'The full field-by-field table is in [Mexico: CFDI](#mexico-cfdi-mx-cfdi).');
  lines.push(
    '',
    '## Check it',
    '',
    `- Drop a ${f.name} file into the [browser converter](${SITE_URL}) to get canonical JSON; nothing is uploaded.`,
    `- [Conformance checklist](${SITE_URL}conformance.html): fixtures, real samples, mapping source and validation for this format.`,
    `- Output shape: [canonical-invoice.v1.schema.json](${SITE_URL}schemas/canonical-invoice.v1.schema.json).`,
  );
  const where2 = where[0] ? ` Used in ${where.map((r) => r[0]).join(', ')}.` : '';
  const description = clip(`How ${f.name} e-invoices are detected and mapped to canonical JSON.${where2} ${firstSentence(f.notes)}`);
  return { md: lines.join('\n'), description };
}

// ---------------------------------------------------------------------------
// The site
// ---------------------------------------------------------------------------

export function buildDocs(src: DocSources): DocSite {
  const lexer = new Marked({ gfm: true });
  const lexed = lexer.lexer(src.readme);
  const links = (lexed as unknown as { links: Tokens.Generic['links'] }).links ?? {};
  const { blocks, headings } = splitReadme(lexed);

  // Anchors of README headings, so [text](#heading) keeps working across pages.
  const anchors = new Map<string, string>();
  for (const h of headings) anchors.set(slugify(h.text), sectionToPage.get(h.text)?.slug ?? h.page);
  // docs/*.md extras
  const extraDefs = Object.entries(src.extras).map(([file, content]) => {
    const slug = file.replace(/\.md$/, '').toLowerCase();
    const title = /^#\s+(.+)$/m.exec(content)?.[1]?.trim() ?? slug;
    const firstPara = content
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .find((p) => p && !p.startsWith('#') && !p.startsWith('```') && !p.startsWith('|'));
    return {
      file,
      slug,
      title,
      content,
      description: clip(
        (firstPara ?? title)
          .replace(/\s+/g, ' ')
          .replace(/[*_`[\]]/g, '')
          .replace(/\(([^)]*)\)/g, ''),
      ),
    };
  });
  const extras = new Map(extraDefs.map((e) => [`docs/${e.file}`, pagePath(e.slug)]));

  const pages: DocPage[] = [];
  const shellCtx: Shell = { pages, version: src.packageVersion, date: src.date };
  const pending: {
    page: Omit<DocPage, 'html'>;
    body: string;
    headings: { id: string; text: string; depth: number }[];
    related?: PageDef['related'];
    edit: string;
    crumbs: { name: string; path: string }[];
  }[] = [];

  const queue = (
    p: Omit<DocPage, 'html'>,
    tokens: Token[],
    ctxSelf: string,
    opts: { related?: PageDef['related']; edit: string; crumbs: { name: string; path: string }[] },
  ) => {
    const ctx: LinkContext = { from: p.path, anchors, extras, self: ctxSelf };
    const { html, headings: hs } = renderBody(tokens, ctx, links);
    pending.push({ page: p, body: html, headings: hs, ...opts });
  };

  for (const def of PAGES) {
    const mine = blocks.filter((b) => b.def === def);
    if (!mine.length) throw new Error(`No README content for docs page "${def.slug}"`);
    const tokens: Token[] = [];
    const md: string[] = [];
    mine.forEach((b, n) => {
      const body = shiftedTokens(b, n === 0);
      if (n > 0) tokens.push({ type: 'heading', raw: '', depth: 2, text: b.heading, tokens: Lexer.lexInline(b.heading) } as Tokens.Heading);
      tokens.push(...body.filter((t) => !isBadgeRow(t)));
    });
    const slugCtx = { from: undefined as string | undefined, anchors, extras, self: def.slug };
    for (const t of tokens) md.push(t.type === 'heading' ? headingRaw(t as Tokens.Heading) : t.raw);
    const markdown = `# ${def.title}\n\n${absolutizeMarkdown(md.join(''), slugCtx).trim()}\n`;
    const path = pagePath(def.slug);
    queue(
      {
        path,
        title: def.title,
        description: def.description,
        group: def.group,
        kind: 'section',
        markdown,
        sections: def.sections.filter(Boolean),
        source: 'README.md',
      },
      tokens,
      def.slug,
      {
        related: def.related,
        edit: `${REPO_URL}/blob/main/README.md`,
        crumbs:
          def.slug === 'index'
            ? [{ name: 'Docs', path: 'docs/index.html' }]
            : [
                { name: 'Docs', path: 'docs/index.html' },
                { name: def.title, path },
              ],
      },
    );
  }

  for (const e of extraDefs) {
    const lexedExtra = lexer.lexer(e.content);
    const body = lexedExtra
      .filter((t) => !(t.type === 'heading' && t.depth === 1))
      .map((t) => (t.type === 'heading' ? ({ ...t, depth: Math.max(2, t.depth) } as Tokens.Heading) : t));
    const md = body.map((t) => (t.type === 'heading' ? headingRaw(t as Tokens.Heading) : t.raw)).join('');
    const path = pagePath(e.slug);
    const slugCtx = { from: undefined as string | undefined, anchors, extras, self: e.slug };
    queue(
      {
        path,
        title: e.title,
        description: e.description,
        group: 'Project',
        kind: 'extra',
        markdown: `# ${e.title}\n\n${absolutizeMarkdown(md, slugCtx).trim()}\n`,
        sections: [],
        source: `docs/${e.file}`,
      },
      body,
      e.slug,
      {
        edit: `${REPO_URL}/blob/main/docs/${e.file}`,
        crumbs: [
          { name: 'Docs', path: 'docs/index.html' },
          { name: e.title, path },
        ],
      },
    );
  }

  // One page per registry format. The `-unknown` ids are fallbacks, not formats anyone sends.
  const formats = FORMATS.filter((f) => !f.id.endsWith('-unknown'));
  for (const f of formats) {
    const { md, description } = formatMarkdown(f, lexed);
    const tokens = lexer.lexer(md).filter((t) => !(t.type === 'heading' && t.depth === 1));
    const path = `docs/formats/${f.id}.html`;
    const slugCtx = { from: undefined as string | undefined, anchors, extras, self: '' };
    queue(
      {
        path,
        title: f.name,
        description,
        group: 'Formats',
        kind: 'format',
        markdown: absolutizeMarkdown(md, slugCtx),
        sections: [],
        source: 'README.md',
      },
      tokens,
      '',
      {
        related: [
          { href: 'docs/formats/index.html', label: 'All supported formats' },
          { href: 'conformance.html', label: 'Conformance checklist' },
        ],
        edit: `${REPO_URL}/blob/main/README.md`,
        crumbs: [
          { name: 'Docs', path: 'docs/index.html' },
          { name: 'Formats', path: 'docs/formats/index.html' },
          { name: f.name, path },
        ],
      },
    );
  }

  // The formats index.
  {
    const rows = formats.map((f) => `| [${f.name}](docs/formats/${f.id}.html) | \`${f.id}\` | ${f.countries.join(', ')} | ${f.status} |`);
    const md = [
      'Every format in the registry, with the countries that send it. Each page says how the format is detected and what the converter maps; the conformance checklist shows how well each one is tested.',
      '',
      '| Format | Id | Countries | Status |',
      '|---|---|---|---|',
      ...rows,
    ].join('\n');
    const path = 'docs/formats/index.html';
    const tokens = lexer.lexer(md);
    queue(
      {
        path,
        title: 'Supported e-invoice formats',
        description: `The ${formats.length} e-invoice formats eu-einvoice-canonical detects and converts: Peppol BIS 3, XRechnung, Factur-X, FatturaPA, KSeF, Facturae and more, by country.`,
        group: 'Formats',
        kind: 'formats-index',
        markdown: `# Supported e-invoice formats\n\n${absolutizeMarkdown(md, { from: undefined, anchors, extras, self: '' })}\n`,
        sections: [],
        source: 'src/formats.ts',
      },
      tokens,
      '',
      {
        related: [{ href: 'conformance.html', label: 'Conformance checklist' }],
        edit: `${REPO_URL}/blob/main/src/formats.ts`,
        crumbs: [
          { name: 'Docs', path: 'docs/index.html' },
          { name: 'Formats', path },
        ],
      },
    );
  }

  // The landing page lists every page with its description, so each is one click from the docs root.
  for (const q of pending) pages.push({ ...q.page, html: '' });
  const cards = GROUPS.map((g) => {
    const items = pages.filter((p) => p.group === g && p.kind !== 'format' && p.path !== 'docs/index.html');
    if (!items.length) return '';
    return `<section class="docs-group"><h2 id="${slugify(g)}-pages">${g}</h2><ul>${items
      .map((p) => `<li><a href="${p.path.replace('docs/', '')}">${esc(p.title)}</a><span>${esc(p.description)}</span></li>`)
      .join('')}</ul></section>`;
  }).join('');
  pending.forEach((q, n) => {
    const extraHtml =
      q.page.path === 'docs/index.html' ? `<h2 id="all-pages">All documentation pages</h2><div class="docs-groups">${cards}</div>` : '';
    const body = q.page.path === 'docs/index.html' ? q.body + extraHtml : q.body;
    const hs =
      q.page.path === 'docs/index.html' ? [...q.headings, { id: 'all-pages', text: 'All documentation pages', depth: 2 }] : q.headings;
    pages[n] = { ...q.page, html: shell(q.page, body, hs, shellCtx, { related: q.related, edit: q.edit, crumbs: q.crumbs }) };
  });

  return { pages, headings };
}

// ---------------------------------------------------------------------------
// llms.txt, llms-full.txt, sitemap.xml, robots.txt
// ---------------------------------------------------------------------------

const mdPath = (p: DocPage) => p.path.replace(/\.html$/, '.md');

export function buildLlmsTxt(site: DocSite, version: string): string {
  const link = (p: DocPage) => `- [${p.title}](${absolute(mdPath(p))}): ${p.description}`;
  const section = (title: string, group: Group) =>
    `## ${title}\n\n${site.pages
      .filter((p) => p.group === group && p.kind !== 'format')
      .map(link)
      .join('\n')}`;
  const formats = site.pages.filter((p) => p.kind === 'format');
  return `# E-invoice to JSON (eu-einvoice-canonical)

> TypeScript library, command line, HTTP API, MCP server and browser converter that read any XML e-invoice sent in the EU (Peppol BIS 3, XRechnung, Factur-X/ZUGFeRD, FatturaPA, KSeF, Facturae and many national formats, ${formats.length} in all) and map it to one canonical JSON model built on EN 16931. Version ${version}, licence 0BSD. The browser converter runs entirely client-side: files are never uploaded.

Machine interfaces:
- MCP server: run \`einvoice mcp\` (stdio) to give an agent the tools detect_invoice_format, convert_invoice, validate_invoice, explain_finding and list_formats. See [MCP server for AI agents](${absolute('docs/mcp.md')}).
- OpenAPI 3.1 spec: ${absolute('openapi/openapi.yaml')} (JSON: ${absolute('openapi/openapi.json')}), served by \`einvoice serve\`.
- JSON Schemas: ${absolute('schemas/canonical-invoice.v1.schema.json')}, ${absolute('schemas/convert-result.v1.schema.json')}, ${absolute('schemas/inspect-result.v1.schema.json')}.
- Complete documentation as one text file: ${absolute('llms-full.txt')}.

${section('Start', 'Start')}

${section('Use it', 'Use it')}

${section('Model and contracts', 'Model and contracts')}

${section('Project', 'Project')}

## Formats

${site.pages
  .filter((p) => p.group === 'Formats' && p.kind !== 'format')
  .map(link)
  .join('\n')}
${formats.map(link).join('\n')}

## Optional

- [Browser converter](${absolute('index.html')}): drop an invoice, get canonical JSON.
- [Conformance checklist](${absolute('conformance.html')}): fixtures, parser, real samples, mapping source and validation per format.
- [Real-world results](${absolute('corpus.html')}): the converter run over public sample collections.
- [Line labelling evaluation](${absolute('eval.html')}): the rules and the optional language models scored on a labelled set.
- [API reference](${absolute('api.html')}) and [TypeScript API](${absolute('api/')}).
- [Source code](${REPO_URL})
`;
}

/** Moves every heading outside code fences one level down, so each page's title sits under the file's own h1. */
const demote = (md: string) =>
  md
    .split(/(```[\s\S]*?```)/g)
    .map((part, i) => (i % 2 ? part : part.replace(/^(#{1,5}) /gm, '$1# ')))
    .join('');

export function buildLlmsFull(site: DocSite): string {
  const head = `# E-invoice to JSON (eu-einvoice-canonical): full documentation\n\nThe complete documentation, generated from the repository README and docs/ folder. Index: ${absolute('llms.txt')}. Interactive converter: ${SITE_URL}. OpenAPI spec: ${absolute('openapi/openapi.yaml')}.\n`;
  return head + site.pages.map((p) => `\n---\n\nSource: ${absolute(p.path)}\n\n${demote(p.markdown)}`).join('');
}

export function buildSitemap(paths: string[], date: string): string {
  const urls = paths.map((p) => `  <url><loc>${esc(absolute(p))}</loc><lastmod>${date}</lastmod></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export const robotsTxt = () => `User-agent: *\nAllow: /\n\nSitemap: ${absolute('sitemap.xml')}\n`;

/** SoftwareSourceCode and WebApplication for the home page. */
export function homeJsonLd(version: string, description: string): object[] {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareSourceCode',
      name: 'eu-einvoice-canonical',
      description,
      url: SITE_URL,
      codeRepository: REPO_URL,
      programmingLanguage: 'TypeScript',
      runtimePlatform: 'Bun, Node.js 20 and later, browsers',
      license: 'https://opensource.org/license/0bsd',
      version,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'E-invoice to JSON',
      url: SITE_URL,
      description,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Any (runs in the browser)',
      browserRequirements: 'Requires a current browser; files are processed locally and never uploaded.',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    },
  ];
}
