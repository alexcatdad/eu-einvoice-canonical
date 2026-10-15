/**
 * Per-format conformance checklist, generated from the code and the fixtures so it
 * cannot drift from what the project actually does.
 *
 *   bun scripts/conformance.ts                       markdown to stdout (and the GitHub job summary)
 *   bun scripts/conformance.ts --html dist/conformance.html
 *   bun scripts/conformance.ts --json conformance.json
 *
 * For every format in the registry it reports: the detection rule's status, how many
 * fixtures are detected as that format, whether a parser exists, how many fixtures it
 * converts (and how many of those are real public samples rather than files written for
 * the tests), the specification the mapping follows, and which validation layers run.
 * Facts that cannot be derived from code live in conformance/notes.json.
 *
 * It reports gaps; it does not fail the build.
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FORMATS, IMPLEMENTED_FAMILIES, convert, type FormatDef } from '../src/index.js';

interface Notes {
  publicSamples: string[];
  mappingSource: Record<string, string>;
  validation: Record<string, string[]>;
}

interface Row {
  id: string;
  name: string;
  family: string;
  countries: string;
  detection: 'current' | 'legacy' | 'unverified';
  fixturesDetected: number;
  parser: boolean;
  fixturesConverted: number;
  publicSamplesConverted: number;
  mappingSource?: string;
  validation: string[];
}

const root = join(import.meta.dir, '..');
const fixtures = join(root, 'test', 'fixtures');
const notes = JSON.parse(readFileSync(join(root, 'conformance', 'notes.json'), 'utf8')) as Notes;
const expected = JSON.parse(readFileSync(join(fixtures, 'expected.json'), 'utf8')) as Record<string, string[]>;
const implemented = new Set<string>(IMPLEMENTED_FAMILIES);
const publicSamples = new Set(notes.publicSamples);

const detected = new Map<string, number>();
for (const ids of Object.values(expected)) for (const id of new Set(ids)) detected.set(id, (detected.get(id) ?? 0) + 1);

const converted = new Map<string, number>();
const convertedPublic = new Map<string, number>();
for (const file of Object.keys(expected)) {
  const r = await convert(new Uint8Array(readFileSync(join(fixtures, file))), file);
  const ok = new Set(r.outcomes.filter((o) => o.status === 'ok' && o.detection.kind === 'invoice')
    .map((o) => (o.detection.kind === 'invoice' ? o.detection.format.id : '')));
  for (const id of ok) {
    converted.set(id, (converted.get(id) ?? 0) + 1);
    if (publicSamples.has(file)) convertedPublic.set(id, (convertedPublic.get(id) ?? 0) + 1);
  }
}

const rows: Row[] = (FORMATS as readonly FormatDef[]).map((f) => ({
  id: f.id,
  name: f.name,
  family: f.family,
  countries: f.countries.join(', '),
  detection: f.status,
  fixturesDetected: detected.get(f.id) ?? 0,
  parser: implemented.has(f.family),
  fixturesConverted: converted.get(f.id) ?? 0,
  publicSamplesConverted: convertedPublic.get(f.id) ?? 0,
  mappingSource: notes.mappingSource[f.id] ?? notes.mappingSource[f.family],
  validation: notes.validation[f.id] ?? notes.validation[f.family] ?? [],
}));

const totals = {
  formats: rows.length,
  withParser: rows.filter((r) => r.parser).length,
  converting: rows.filter((r) => r.fixturesConverted > 0).length,
  realSample: rows.filter((r) => r.publicSamplesConverted > 0).length,
  unverified: rows.filter((r) => r.detection === 'unverified').length,
  noFixture: rows.filter((r) => r.fixturesDetected === 0).length,
  untestedParser: rows.filter((r) => r.parser && r.fixturesConverted === 0).length,
  validated: rows.filter((r) => r.validation.length > 0).length,
};

const summaryLines = [
  `${totals.withParser} of ${totals.formats} formats have a parser; ${totals.converting} convert at least one fixture, ${totals.realSample} of them from a real public sample.`,
  `${totals.untestedParser} formats have a parser but no fixture that exercises it, and ${totals.noFixture} have no fixture at all.`,
  `${totals.unverified} detection rules are unverified. ${totals.validated} formats run schema or Schematron validation.`,
];

const args = process.argv.slice(2);
const argValue = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };

// Markdown (stdout and job summary)
const yes = (b: boolean) => (b ? 'yes' : '—');
const md = [
  '## Conformance checklist',
  '',
  ...summaryLines.map((l) => `- ${l}`),
  '',
  '| Format | Countries | Detection | Fixtures detected | Parser | Fixtures converted | Real samples converted | Mapping source | Validation |',
  '|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.name} (\`${r.id}\`) | ${r.countries} | ${r.detection} | ${r.fixturesDetected} | ${yes(r.parser)} | ${r.fixturesConverted} | ${r.publicSamplesConverted} | ${r.mappingSource ?? (r.parser ? '**not recorded**' : '—')} | ${r.validation.join(', ') || '—'} |`),
  '',
].join('\n');
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);

const jsonOut = argValue('--json');
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ generatedAt: new Date().toISOString(), totals, rows }, null, 2));

const htmlOut = argValue('--html');
if (htmlOut) writeFileSync(htmlOut, html());

function html() {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const cell = (n: number, good: boolean) => `<td class="num ${good ? 'good' : 'gap'}">${n}</td>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Conformance checklist</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..800&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css">
</head>
<body>
<header class="masthead">
  <div class="masthead-text">
    <h1>Conformance checklist</h1>
    <p class="lede">Where every format in the registry stands, generated from the code and the test fixtures on each build.</p>
  </div>
  <p class="privacy"><a href="./">Back to the converter</a></p>
</header>
<main class="checklist">
  <ul class="checklist-summary">${summaryLines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
  <div class="table-scroll">
  <table class="conformance">
    <thead><tr><th scope="col">Format</th><th scope="col">Countries</th><th scope="col">Detection rule</th><th scope="col" class="num">Fixtures detected</th><th scope="col">Parser</th><th scope="col" class="num">Fixtures converted</th><th scope="col" class="num">Real samples converted</th><th scope="col">Mapping source</th><th scope="col">Validation</th></tr></thead>
    <tbody>${rows.map((r) => `<tr>
      <th scope="row">${esc(r.name)}<span class="sub">${esc(r.id)}</span></th>
      <td>${esc(r.countries)}</td>
      <td class="${r.detection === 'unverified' ? 'gap' : ''}">${r.detection}</td>
      ${cell(r.fixturesDetected, r.fixturesDetected > 0)}
      <td class="${r.parser ? 'good' : 'gap'}">${r.parser ? 'yes' : 'not yet'}</td>
      ${r.parser ? cell(r.fixturesConverted, r.fixturesConverted > 0) : '<td class="num">—</td>'}
      ${r.parser ? cell(r.publicSamplesConverted, r.publicSamplesConverted > 0) : '<td class="num">—</td>'}
      <td class="${r.parser && !r.mappingSource ? 'gap' : ''}">${r.mappingSource ? esc(r.mappingSource) : r.parser ? 'not recorded' : '—'}</td>
      <td class="${r.validation.length ? 'good' : ''}">${r.validation.length ? esc(r.validation.join(', ')) : 'not yet'}</td>
    </tr>`).join('')}</tbody>
  </table>
  </div>
  <p class="wrappers">Generated ${new Date().toISOString().slice(0, 10)} by <code>scripts/conformance.ts</code>. Hand-maintained facts (which fixtures are real public samples, mapping sources, validation layers) live in <code>conformance/notes.json</code>.</p>
</main>
</body>
</html>`;
}
