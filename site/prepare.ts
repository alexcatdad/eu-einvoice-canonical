/**
 * Everything the Astro build reads that is generated from the repository, written before `astro build`:
 *   bun site/prepare.ts            (part of `bun run build:site`)
 *
 *   src/content/docs/docs/   one Starlight page per README section, docs/*.md file and registry format (site/docs.ts)
 *   public/                  markdown twins, llms.txt, llms-full.txt, robots.txt, samples, JSON Schemas, the OpenAPI
 *                            spec (plus a self-contained copy for Scalar), the trusted-list snapshot, Scalar's bundle
 *   .generated/              the sidebar, the redirects from the old addresses, the conformance and corpus page bodies
 *
 * All three are build output (git ignores them). .generated/corpus-report.json is an input: scripts/fetch-corpus-report.sh
 * puts it there in CI, and the Real-world results page is a placeholder without it.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import pkg from '../package.json' with { type: 'json' };
import { type CorpusReport, describeReport, linkHtml, renderHtml } from '../scripts/corpus-lib.js';
import { ANNOTATION_ASSET_PATH, ANNOTATION_ASSETS } from './annotation-assets.js';
import { buildDocs, buildLlmsFull, buildLlmsTxt, robotsTxt, sidebar } from './docs.js';
import { MOVED } from './site.js';

const site = import.meta.dir;
const root = join(site, '..');
const content = join(site, 'src/content/docs/docs');
const pub = join(site, 'public');
const gen = join(site, '.generated');

/** The samples the converter offers; the same list as SAMPLES in src/converter/samples.ts. */
export const SAMPLE_FILES = [
  'peppol-bis3-invoice.xml',
  'peppol-bis3-creditnote.xml',
  'xrechnung-ubl.xml',
  'xrechnung-cii.xml',
  'facturx-en16931.pdf',
  'facturx-basic-creditnote.xml',
  'svefaktura-1.0.xml',
  'anaf-download.zip',
  'hr-cius.xml',
  'IT01234567890_FPR12.xml.p7m',
  'ksef-fa3.xml',
  'svefaktura-1.0-descriptors.xml',
  'pint-sg-invoice.xml',
  'pint-jp-invoice.xml',
  'zatca-simplified-signed.xml',
];

const write = (path: string, text: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};

// Clean the outputs, never the fetched corpus report. Astro's content cache goes too: it keeps rendered pages across
// config changes (code block plugins, for one).
rmSync(join(site, 'node_modules/.astro'), { recursive: true, force: true });
rmSync(content, { recursive: true, force: true });
rmSync(pub, { recursive: true, force: true });
mkdirSync(gen, { recursive: true });
for (const f of readdirSync(gen)) if (f !== 'corpus-report.json') rmSync(join(gen, f), { recursive: true, force: true });

// ---------------------------------------------------------------------------
// Docs, markdown twins, llms.txt
// ---------------------------------------------------------------------------

const extras: Record<string, string> = {};
for (const f of readdirSync(join(root, 'docs')).filter((f) => f.endsWith('.md'))) extras[f] = readFileSync(join(root, 'docs', f), 'utf8');
const docs = buildDocs({
  readme: readFileSync(join(root, 'README.md'), 'utf8'),
  extras,
  packageVersion: pkg.version,
  date: new Date().toISOString().slice(0, 10),
});

/** YAML frontmatter; every value is written as JSON, which YAML reads as it is. */
const frontmatter = (data: Record<string, unknown>) =>
  `---\n${Object.entries(data)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n')}\n---\n\n`;
const ldJson = (o: object) => JSON.stringify(o).replace(/</g, '\\u003c');

const redirects: Record<string, string> = { ...MOVED };
for (const p of docs.pages) {
  write(
    join(site, 'src/content/docs', p.file),
    frontmatter({
      title: p.title,
      description: p.description,
      editUrl: p.editUrl,
      head: p.jsonld.map((o) => ({ tag: 'script', attrs: { type: 'application/ld+json' }, content: ldJson(o) })),
      ...(p.kind === 'format' ? { sidebar: { order: p.order } } : {}),
    }) + p.body,
  );
  write(join(pub, p.file), p.markdown);
  // Old address of the page (docs/cli.html), unless it is an index page whose file name did not change.
  if (!p.route.endsWith('docs/') && !p.route.endsWith('formats/')) redirects[`${p.route.replace(/\/$/, '')}.html`] = p.route;
}
write(join(pub, 'llms.txt'), buildLlmsTxt(docs, pkg.version));
write(join(pub, 'llms-full.txt'), buildLlmsFull(docs));
write(join(pub, 'robots.txt'), robotsTxt());
write(join(gen, 'sidebar.json'), `${JSON.stringify(sidebar(docs), null, 2)}\n`);
write(join(gen, 'redirects.json'), `${JSON.stringify(redirects, null, 2)}\n`);

// ---------------------------------------------------------------------------
// Static files
// ---------------------------------------------------------------------------

for (const file of ANNOTATION_ASSETS) {
  const destination = join(pub, ANNOTATION_ASSET_PATH, file);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(join(root, ANNOTATION_ASSET_PATH, file), destination);
}

for (const s of SAMPLE_FILES) cpSync(join(root, 'test/fixtures', s), join(pub, 'samples', s));
cpSync(join(site, 'favicon.svg'), join(pub, 'favicon.svg'));
// Snapshot of the EU trusted lists for the opt-in signer check (refreshed by the trust-lists workflow).
if (existsSync(join(root, 'trust/eu-trust-snapshot.json')))
  cpSync(join(root, 'trust/eu-trust-snapshot.json'), join(pub, 'eu-trust-snapshot.json'));
// JSON Schemas, published at /schemas/ (their $id points there). Regenerate with `bun run build:schemas`.
for (const file of readdirSync(join(root, 'schemas')).filter((f) => f.endsWith('.schema.json') || f === 'formats.json'))
  cpSync(join(root, 'schemas', file), join(pub, 'schemas', file));
// The OpenAPI spec sits next to schemas/ so its relative references (../schemas/...) resolve on the site as in the repository.
for (const file of ['openapi.yaml', 'openapi.json']) cpSync(join(root, 'openapi', file), join(pub, 'openapi', file));
write(join(pub, 'openapi/openapi.bundled.json'), `${JSON.stringify(bundledSpec(), null, 2)}\n`);
// Scalar's standalone bundle, served from the site itself: the API reference page loads nothing from a CDN.
cpSync(join(site, 'node_modules/@scalar/api-reference/dist/browser/standalone.js'), join(pub, 'scalar/standalone.js'));

// ---------------------------------------------------------------------------
// Generated page bodies
// ---------------------------------------------------------------------------

const conformance = Bun.spawnSync(
  ['bun', join(root, 'scripts/conformance.ts'), '--html', join(gen, 'conformance.html'), '--json', join(pub, 'conformance.json')],
  { cwd: root, stdout: 'ignore', stderr: 'inherit' },
);
if (conformance.exitCode !== 0) {
  console.error('scripts/conformance.ts failed');
  process.exit(1);
}

const reportPath = join(gen, 'corpus-report.json');
if (existsSync(reportPath)) {
  try {
    const report = JSON.parse(readFileSync(reportPath, 'utf8')) as CorpusReport;
    write(join(gen, 'corpus.html'), renderHtml(report));
    write(join(gen, 'corpus.json'), JSON.stringify({ description: describeReport(report), link: linkHtml(report) }));
    cpSync(reportPath, join(pub, 'corpus-report.json'));
  } catch (e) {
    // The page stays the placeholder, so the navigation link never dead-ends.
    console.warn(`Could not render the corpus report: ${(e as Error).message}`);
  }
}

console.log(`Prepared ${docs.pages.length} docs pages, ${Object.keys(redirects).length} redirects and the static files.`);

/**
 * A self-contained copy of the spec for readers that do not follow references to other files (the Scalar page, some code
 * generators). Each schema file becomes components.schemas.<Title>, its $defs become <Title>_<Name>. Generated into the
 * site only: the schemas stay single-sourced in schemas/.
 */
function bundledSpec() {
  const spec = JSON.parse(readFileSync(join(root, 'openapi/openapi.json'), 'utf8'));
  const safe = (name: string) => name.replace(/[^A-Za-z0-9._-]/g, '_');
  const keyOf = (file: string) => {
    const doc = JSON.parse(readFileSync(join(root, 'schemas', file), 'utf8'));
    return { doc, key: safe(String(doc.title ?? file)) };
  };
  const retarget = (node: unknown, key: string): unknown => {
    if (Array.isArray(node)) return node.map((n) => retarget(n, key));
    if (!node || typeof node !== 'object') return node;
    return Object.fromEntries(
      Object.entries(node).map(([k, v]) => [
        k,
        k === '$ref' && typeof v === 'string' && v.startsWith('#/$defs/')
          ? `#/components/schemas/${key}_${safe(decodeURIComponent(v.slice(8)))}`
          : retarget(v, key),
      ]),
    );
  };
  spec.components.schemas ??= {};
  for (const f of readdirSync(join(root, 'schemas')).filter((f) => f.endsWith('.schema.json'))) {
    const { doc, key } = keyOf(f);
    const { $schema: _s, $id: _i, $defs, ...rest } = doc;
    spec.components.schemas[key] = retarget(rest, key);
    for (const [name, def] of Object.entries<unknown>($defs ?? {})) spec.components.schemas[`${key}_${safe(name)}`] = retarget(def, key);
  }
  const rewrite = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(rewrite);
    if (!node || typeof node !== 'object') return node;
    return Object.fromEntries(
      Object.entries(node).map(([k, v]) => {
        const m = k === '$ref' && typeof v === 'string' ? /^\.\.\/schemas\/([^#]+)(?:#\/\$defs\/(.+))?$/.exec(v) : null;
        if (!m) return [k, rewrite(v)];
        const { key } = keyOf(m[1]!);
        return [k, `#/components/schemas/${m[2] ? `${key}_${safe(decodeURIComponent(m[2]))}` : key}`];
      }),
    );
  };
  return rewrite(spec);
}
