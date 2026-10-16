/**
 * Builds the static GitHub Pages site into dist/:
 *   bun run site/build.ts
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pkg from '../package.json' with { type: 'json' };
import { PROBLEM_BASE, PROBLEMS } from '../src/problems.js';
import en from './i18n/en.json' with { type: 'json' };

const root = join(import.meta.dir, '..');
const out = join(root, 'dist');
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const SAMPLES = [
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

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'samples'), { recursive: true });

const build = await Bun.build({
  entrypoints: [join(root, 'site/app.ts'), join(root, 'site/eval.ts'), join(root, 'site/deliverables.ts')],
  outdir: out,
  target: 'browser',
  minify: true,
  sourcemap: 'linked',
  splitting: true,
  naming: { entry: '[name].js', chunk: 'chunks/[name]-[hash].js', asset: '[name]-[hash].[ext]' },
});
if (!build.success) {
  for (const log of build.logs) console.error(log);
  process.exit(1);
}
cpSync(join(root, 'site/index.html'), join(out, 'index.html'));
cpSync(join(root, 'site/eval.html'), join(out, 'eval.html'));
cpSync(join(root, 'site/style.css'), join(out, 'style.css'));
cpSync(join(root, 'site/api.html'), join(out, 'api.html'));
// Snapshot of the EU trusted lists for the opt-in signer check (refreshed by the trust-lists workflow).
if (existsSync(join(root, 'trust/eu-trust-snapshot.json')))
  cpSync(join(root, 'trust/eu-trust-snapshot.json'), join(out, 'eu-trust-snapshot.json'));
// JSON Schemas, published at /schemas/ (their $id points there). Regenerate with `bun run build:schemas`.
mkdirSync(join(out, 'schemas'), { recursive: true });
for (const file of readdirSync(join(root, 'schemas')).filter((f) => f.endsWith('.schema.json') || f === 'formats.json'))
  cpSync(join(root, 'schemas', file), join(out, 'schemas', file));
// The OpenAPI spec sits next to schemas/ so its relative references (../schemas/...) resolve on the site as in the repository.
mkdirSync(join(out, 'openapi'), { recursive: true });
for (const file of ['openapi.yaml', 'openapi.json']) cpSync(join(root, 'openapi', file), join(out, 'openapi', file));
writeBundledSpec();
writeDeliverables();
writeProblems();
buildTypeDoc();
for (const s of SAMPLES) cpSync(join(root, 'test/fixtures', s), join(out, 'samples', s));
console.log(`Built ${out} (${build.outputs.map((o) => `${o.path.split('/').pop()} ${(o.size / 1024).toFixed(0)} KB`).join(', ')})`);

/** The deliverables page: versions and the schema table come from the files, so the page cannot go stale. */
function writeDeliverables() {
  const spec = JSON.parse(readFileSync(join(root, 'openapi/openapi.json'), 'utf8'));
  // Message keys in site/i18n/*.json; the English text is written into the page, the browser swaps in the reader's language.
  const described: Record<string, string> = {
    'canonical-invoice': 'deliv.schemaCanonical',
    'convert-result': 'deliv.schemaConvert',
    'inspect-result': 'deliv.schemaInspect',
  };
  const cell = (key: string | undefined) => (key ? `<td data-i18n-html="${key}">${en[key as keyof typeof en]}</td>` : '<td></td>');
  const rows = readdirSync(join(root, 'schemas'))
    .filter((f) => f.endsWith('.schema.json'))
    .map((f) => {
      const m = /^(.+)\.(v\d+)\.schema\.json$/.exec(f);
      const name = m?.[1] ?? f;
      return `<tr><td><code>${esc(name)}</code></td>${cell(described[name])}<td><code>${esc(m?.[2] ?? '')}</code></td><td><a href="schemas/${esc(f)}">${esc(f)}</a></td></tr>`;
    });
  rows.push(
    `<tr><td><code>formats</code></td>${cell('deliv.schemaFormats')}<td><code>v1</code></td><td><a href="schemas/formats.json">formats.json</a></td></tr>`,
  );
  const page = readFileSync(join(root, 'site/deliverables.html'), 'utf8')
    .replaceAll('{{PACKAGE_VERSION}}', esc(pkg.version))
    .replaceAll('{{SCHEMA_VERSION}}', 'v1')
    .replaceAll('{{SPEC_VERSION}}', esc(spec.info.version))
    .replace('{{SCHEMA_ROWS}}', rows.join('\n        '));
  writeFileSync(join(out, 'deliverables.html'), page);
}

/** One page for the problem type URIs (`<base>#<slug>`), from the same catalogue the server uses. */
function writeProblems() {
  const items = Object.entries(PROBLEMS)
    .map(
      ([slug, p]) => `<li id="${slug}"><h3>${esc(p.title)} <code>${slug}</code></h3>
        <p>${esc(p.summary)}</p>
        <p>HTTP ${p.statuses.join(' or ')} · CLI exit code ${p.exitCode} · <code>${esc(PROBLEM_BASE)}#${slug}</code></p></li>`,
    )
    .join('\n      ');
  const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Error types · E-invoice to JSON</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..800&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../style.css">
</head>
<body class="doc-page">
  <nav class="sitenav" aria-label="Site">
    <a class="sitenav-home" href="../">E-invoice to JSON</a>
    <a href="../api.html">API reference</a>
    <a href="../deliverables.html">Deliverables</a>
  </nav>
  <main class="doc-main" style="max-width:80rem;margin-inline:auto;padding-inline:1rem">
    <h2>Error types</h2>
    <p>Every error of the conversion API is an <a href="https://www.rfc-editor.org/rfc/rfc9457">RFC 9457</a> problem. The <code>type</code> is one of these URIs. They are the command line's exit codes 2 to 7, so a script and a service client see the same categories. Requests over a size or count limit answer 413 with the first type.</p>
    <ul class="problem-list">
      ${items}
    </ul>
  </main>
</body>
</html>
`;
  mkdirSync(join(out, 'problems'), { recursive: true });
  writeFileSync(join(out, 'problems/index.html'), page);
}

/** TypeDoc needs the JavaScript TypeScript compiler, so it lives in its own package (typedoc/). Skipped when not installed. */
function buildTypeDoc() {
  const bin = join(root, 'typedoc/node_modules/.bin/typedoc');
  if (!existsSync(bin)) {
    console.warn('typedoc/node_modules is missing: skipping dist/api (run "bun install" in typedoc/)');
    return;
  }
  const run = Bun.spawnSync([bin, '--options', join(root, 'typedoc/typedoc.json')], {
    cwd: join(root, 'typedoc'),
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (run.exitCode !== 0) {
    console.error('typedoc failed');
    process.exit(1);
  }
}

/**
 * A self-contained copy of the spec for readers that do not follow references to other files (the Scalar page, some code
 * generators). Each schema file becomes components.schemas.<Title>, its $defs become <Title>_<Name>. Generated into dist/ only:
 * the schemas stay single-sourced in schemas/.
 */
function writeBundledSpec() {
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
  const files = readdirSync(join(root, 'schemas')).filter((f) => f.endsWith('.schema.json'));
  for (const f of files) {
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
  writeFileSync(join(out, 'openapi/openapi.bundled.json'), `${JSON.stringify(rewrite(spec), null, 2)}\n`);
}
