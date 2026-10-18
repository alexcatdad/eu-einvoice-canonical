/**
 * The documentation, generated from README.md (and docs/*.md) at build time. The README stays the single source of
 * truth: this file only decides which section lands on which page and writes the metadata for it. site/prepare.ts
 * writes the result as Starlight content (src/content/docs/docs/*.md), markdown twins, llms.txt and llms-full.txt.
 *
 *   - Every README section (## and the ### it names) maps to one page through PAGES. An unmapped section throws, so a
 *     new README section cannot silently drop out of the site (test/docs.test.ts checks the same).
 *   - One page per registry format (docs/formats/<id>/) is assembled from the registry plus the README table rows
 *     that mention the format id.
 *   - The same markdown feeds the Starlight pages, docs/<slug>.md, llms.txt and llms-full.txt.
 *
 * Nothing here ships to the browser.
 */
import { Lexer, Marked, type Token, type Tokens } from 'marked';
import { FORMATS } from '../src/formats.js';
import { converts } from './coverage.js';
import { absolute, REPO_URL, route, SITE_NAME, SITE_URL, siteHref } from './site.js';

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
      'The einvoice command line: detect, inspect, convert, export, render, write, match and find duplicates in e-invoices, with exit codes for scripts.',
    group: 'Use it',
    sections: ['Command line'],
  },
  {
    slug: 'mcp',
    title: 'MCP server for AI agents',
    description:
      'Run einvoice mcp, a Model Context Protocol server that lets an AI agent detect, convert, validate and match e-invoices without network access.',
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
    slug: 'matching',
    title: 'Matching invoices to purchase orders',
    description:
      'Match e-invoice lines to purchase orders (two-way) and goods receipts (three-way), with tolerances and a match, within-tolerance or needs-review verdict.',
    group: 'Use it',
    sections: ['Matching invoices to purchase orders'],
  },
  {
    slug: 'export',
    title: 'Bookkeeping export',
    description:
      'Turn a received e-invoice into a balanced journal entry and export it as SIE 4, JSON or CSV with your own account mapping.',
    group: 'Use it',
    sections: ['Bookkeeping export'],
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
      'Deterministic invoice line roles and relations, with canonical input export and separate validation of imported annotations.',
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
  /** Route from the site root, for example `docs/cli/`. */
  route: string;
  /** The Starlight content file, relative to src/content/docs: `docs/cli.md`. Also the markdown twin's path from the site root. */
  file: string;
  title: string;
  description: string;
  group: Group;
  kind: 'section' | 'format' | 'extra' | 'formats-index';
  /** The page as markdown with absolute links: published as the markdown twin and joined into llms-full.txt. */
  markdown: string;
  /** The page body for Starlight: markdown with root-relative links, no h1 (Starlight writes the title). */
  body: string;
  /** README headings that ended up on this page. */
  sections: string[];
  source: string;
  editUrl: string;
  /** Position in its sidebar group. */
  order: number;
  /** Structured data for the page: TechArticle and BreadcrumbList. */
  jsonld: object[];
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

/** GitHub's heading anchor rule (github-slugger), which Starlight uses too, so README anchors keep working. */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
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
  const intro = sectionToPage.get('');
  if (!intro) throw new Error('PAGES has no page for the README introduction');
  let cur: Block = { def: intro, heading: '', depth: 1, tokens: [] };
  blocks.push(cur);
  for (const tok of tokens) {
    if (tok.type === 'heading' && tok.depth === 1) continue;
    if (tok.type === 'heading' && (tok.depth === 2 || (tok.depth === 3 && sectionToPage.has(tok.text)))) {
      const def = sectionToPage.get(tok.text);
      if (!def) throw new Error(`README section "${tok.text}" is not mapped to a docs page: add it to PAGES in site/docs.ts`);
      cur = { def, heading: tok.text, depth: tok.depth, tokens: [] };
      blocks.push(cur);
      headings.push({ text: tok.text, depth: tok.depth, page: def.slug });
      continue;
    }
    if (tok.type === 'heading' && tok.depth >= 2) headings.push({ text: tok.text, depth: tok.depth, page: cur.def.slug });
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
  /** README anchor to the slug of the page it ended up on. */
  anchors: Map<string, string>;
  /** Anchors that are a page's own title: a link to them goes to the page, without a fragment. */
  pageAnchors: Set<string>;
  /** `docs/SUPPLY-CHAIN.md` to `docs/supply-chain.html`. */
  extras: Map<string, string>;
}

/** Where a link in the README points on the site; `abs` gives an absolute URL (markdown twins), else root-relative. */
function resolveHref(href: string, ctx: LinkContext, abs: boolean): string {
  const local = (path: string, frag = '') => (abs ? absolute(path) : siteHref(path)) + frag;
  if (href.startsWith('#')) {
    const anchor = href.slice(1);
    const target = ctx.anchors.get(anchor);
    if (!target) return href;
    return local(pagePath(target), ctx.pageAnchors.has(anchor) ? '' : href);
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

/** Rewrites markdown links, leaving code alone (fenced blocks and inline code spans). */
function rewriteLinks(md: string, ctx: LinkContext, abs: boolean): string {
  return md
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((part, i) => (i % 2 ? part : part.replace(/\]\(([^)\s]+)\)/g, (_m, href: string) => `](${resolveHref(href, ctx, abs)})`)))
    .join('');
}

/** Images become their alt text: the site makes no outside requests. */
const dropImages = (md: string) =>
  md
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((part, i) => (i % 2 ? part : part.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')))
    .join('');

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

const related = (items: { href: string; label: string }[] | undefined) =>
  items?.length ? `\n\n## Related\n\n${items.map((r) => `- [${r.label}](${SITE_URL}${r.href})`).join('\n')}\n` : '';

function jsonld(p: { route: string; title: string; description: string }, date: string, crumbs: { name: string; path: string }[]) {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: p.title,
      description: p.description,
      url: absolute(p.route),
      inLanguage: 'en',
      dateModified: date,
      author: { '@type': 'Person', name: 'alexcatdad', url: 'https://github.com/alexcatdad' },
      isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
      about: { '@type': 'SoftwareSourceCode', name: 'eu-einvoice-canonical', codeRepository: REPO_URL },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: absolute(c.path) })),
    },
  ];
}

export function buildDocs(src: DocSources): DocSite {
  const lexer = new Marked({ gfm: true });
  const lexed = lexer.lexer(src.readme);
  const { blocks, headings } = splitReadme(lexed);

  // Anchors of README headings, so [text](#heading) keeps working across pages.
  const anchors = new Map<string, string>();
  const pageAnchors = new Set<string>();
  for (const h of headings) {
    const own = sectionToPage.get(h.text);
    anchors.set(slugify(h.text), own?.slug ?? h.page);
    if (own && own.sections[0] === h.text) pageAnchors.add(slugify(h.text));
  }
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
  const ctx: LinkContext = { anchors, pageAnchors, extras };

  const pages: DocPage[] = [];
  const add = (
    p: Omit<DocPage, 'markdown' | 'body' | 'jsonld' | 'route' | 'file'> & { slug: string },
    md: string,
    crumbs: { name: string; path: string }[],
  ) => {
    const r = route(`docs/${p.slug}.html`);
    const file = `docs/${p.slug}.md`;
    const clean = dropImages(md).trim();
    const { slug: _slug, ...rest } = p;
    pages.push({
      ...rest,
      route: r,
      file,
      body: `${rewriteLinks(clean, ctx, false)}\n`,
      markdown: `# ${p.title}\n\n${rewriteLinks(clean, ctx, true)}\n`,
      jsonld: jsonld({ route: r, title: p.title, description: p.description }, src.date, crumbs),
    });
  };

  PAGES.forEach((def, order) => {
    const mine = blocks.filter((b) => b.def === def);
    if (!mine.length) throw new Error(`No README content for docs page "${def.slug}"`);
    const tokens: Token[] = [];
    mine.forEach((b, n) => {
      if (n > 0) tokens.push({ type: 'heading', raw: '', depth: 2, text: b.heading, tokens: Lexer.lexInline(b.heading) } as Tokens.Heading);
      tokens.push(...shiftedTokens(b, n === 0).filter((t) => !isBadgeRow(t)));
    });
    const md = tokens.map((t) => (t.type === 'heading' ? headingRaw(t as Tokens.Heading) : t.raw)).join('') + related(def.related);
    add(
      {
        slug: def.slug,
        title: def.title,
        description: def.description,
        group: def.group,
        kind: 'section',
        sections: def.sections.filter(Boolean),
        source: 'README.md',
        editUrl: `${REPO_URL}/blob/main/README.md`,
        order,
      },
      md,
      def.slug === 'index'
        ? [{ name: 'Docs', path: 'docs/index.html' }]
        : [
            { name: 'Docs', path: 'docs/index.html' },
            { name: def.title, path: pagePath(def.slug) },
          ],
    );
  });

  extraDefs.forEach((e, n) => {
    const body = lexer
      .lexer(e.content)
      .filter((t) => !(t.type === 'heading' && t.depth === 1))
      .map((t) => (t.type === 'heading' ? ({ ...t, depth: Math.max(2, t.depth) } as Tokens.Heading) : t));
    add(
      {
        slug: e.slug,
        title: e.title,
        description: e.description,
        group: 'Project',
        kind: 'extra',
        sections: [],
        source: `docs/${e.file}`,
        editUrl: `${REPO_URL}/blob/main/docs/${e.file}`,
        order: PAGES.length + n,
      },
      body.map((t) => (t.type === 'heading' ? headingRaw(t as Tokens.Heading) : t.raw)).join(''),
      [
        { name: 'Docs', path: 'docs/index.html' },
        { name: e.title, path: pagePath(e.slug) },
      ],
    );
  });

  // One page per registry format. The `-unknown` ids are fallbacks, not formats anyone sends.
  const formats = FORMATS.filter((f) => !f.id.endsWith('-unknown'));
  formats.forEach((f, n) => {
    const { md, description } = formatMarkdown(f, lexed);
    add(
      {
        slug: `formats/${f.id}`,
        title: f.name,
        description,
        group: 'Formats',
        kind: 'format',
        sections: [],
        source: 'README.md',
        editUrl: `${REPO_URL}/blob/main/src/formats.ts`,
        order: n,
      },
      md +
        related([
          { href: 'docs/formats/', label: 'All supported formats' },
          { href: 'conformance.html', label: 'Conformance checklist' },
        ]),
      [
        { name: 'Docs', path: 'docs/index.html' },
        { name: 'Formats', path: 'docs/formats/index.html' },
        { name: f.name, path: `docs/formats/${f.id}.html` },
      ],
    );
  });

  // The formats index.
  add(
    {
      slug: 'formats/index',
      title: 'Supported e-invoice formats',
      description: `The ${formats.length} e-invoice formats eu-einvoice-canonical detects and converts: Peppol BIS 3, XRechnung, Factur-X, FatturaPA, KSeF, Facturae and more, by country.`,
      group: 'Formats',
      kind: 'formats-index',
      sections: [],
      source: 'src/formats.ts',
      editUrl: `${REPO_URL}/blob/main/src/formats.ts`,
      order: -1,
    },
    [
      'Every format in the registry, with the countries that send it. Each page says how the format is detected and what the converter maps; the conformance checklist shows how well each one is tested.',
      '',
      '| Format | Id | Countries | Status |',
      '|---|---|---|---|',
      ...formats.map(
        (f) => `| [${f.name}](${SITE_URL}docs/formats/${f.id}.html) | \`${f.id}\` | ${f.countries.join(', ')} | ${f.status} |`,
      ),
    ].join('\n') + related([{ href: 'conformance.html', label: 'Conformance checklist' }]),
    [
      { name: 'Docs', path: 'docs/index.html' },
      { name: 'Formats', path: 'docs/formats/index.html' },
    ],
  );

  // The landing page lists every page with its description, so each is one click from the docs root.
  const index = pages.find((p) => p.route === 'docs/');
  if (index) {
    const cards = GROUPS.map((g) => {
      const items = pages.filter((p) => p.group === g && p.kind !== 'format' && p !== index);
      return items.length ? `### ${g}\n\n${items.map((p) => `- [${p.title}](${SITE_URL}${p.route}): ${p.description}`).join('\n')}\n` : '';
    })
      .filter(Boolean)
      .join('\n');
    const all = `\n## All documentation pages\n\n${cards}`;
    index.body += rewriteLinks(all, ctx, false);
    index.markdown += rewriteLinks(all, ctx, true);
  }

  return { pages, headings };
}

/** The sidebar of the docs, in the shape Starlight's `sidebar` option takes. */
export function sidebar(site: DocSite): object[] {
  const link = (p: DocPage) => ({ label: p.route === 'docs/' ? 'Overview' : p.title, link: `/${p.route}` });
  const byOrder = (a: DocPage, b: DocPage) => a.order - b.order;
  return GROUPS.map((g) => {
    const items: object[] = site.pages
      .filter((p) => p.group === g && p.kind !== 'format')
      .sort(byOrder)
      .map(link);
    if (g === 'Formats')
      items.push({
        label: 'Every format',
        collapsed: true,
        items: site.pages
          .filter((p) => p.kind === 'format')
          .sort(byOrder)
          .map(link),
      });
    return { label: g, items };
  });
}

// ---------------------------------------------------------------------------
// llms.txt, llms-full.txt, robots.txt
// ---------------------------------------------------------------------------

export function buildLlmsTxt(site: DocSite, version: string): string {
  const link = (p: DocPage) => `- [${p.title}](${SITE_URL}${p.file}): ${p.description}`;
  const section = (title: string, group: Group) =>
    `## ${title}\n\n${site.pages
      .filter((p) => p.group === group && p.kind !== 'format')
      .map(link)
      .join('\n')}`;
  const formats = site.pages.filter((p) => p.kind === 'format');
  return `# E-invoice to JSON (eu-einvoice-canonical)

> TypeScript library, command line, HTTP API, MCP server and browser converter that read any XML e-invoice sent in the EU (Peppol BIS 3, XRechnung, Factur-X/ZUGFeRD, FatturaPA, KSeF, Facturae and many national formats, ${formats.length} in all) and map it to one canonical JSON model built on EN 16931. Version ${version}, licence 0BSD. The browser converter runs entirely client-side: files are never uploaded.

Machine interfaces:
- MCP server: run \`einvoice mcp\` (stdio) to give an agent the tools detect_invoice_format, convert_invoice, validate_invoice, explain_finding, check_duplicates, match_purchase_order and list_formats. See [MCP server for AI agents](${SITE_URL}docs/mcp.md).
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
  const head = `# E-invoice to JSON (eu-einvoice-canonical): full documentation\n\nThe complete documentation, generated from the repository README and docs/ folder. Index: ${absolute('llms.txt')}. Interactive converter: ${SITE_URL}. OpenAPI spec: ${absolute('openapi/openapi.yaml')}. MCP server: \`einvoice mcp\`.\n`;
  return head + site.pages.map((p) => `\n---\n\nSource: ${absolute(p.route)}\n\n${demote(p.markdown)}`).join('');
}

export const robotsTxt = () => `User-agent: *\nAllow: /\n\nSitemap: ${absolute('sitemap-index.xml')}\n`;

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
      name: SITE_NAME,
      url: SITE_URL,
      description,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Any (runs in the browser)',
      browserRequirements: 'Requires a current browser; files are processed locally and never uploaded.',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    },
  ];
}
