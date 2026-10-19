/**
 * Per-format conformance checklist, generated from the code and the fixtures so it
 * cannot drift from what the project actually does.
 *
 *   bun scripts/conformance.ts                       markdown to stdout (and the GitHub job summary)
 *   bun scripts/conformance.ts --html site/.generated/conformance.html   the page body for the site (site/prepare.ts)
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
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderPerformanceHtml } from '../bench/report.js';
import type { Results } from '../bench/run.js';
import { converts, coverageHtml } from '../site/coverage.js';
import { BASE } from '../site/site.js';
import { convert, FORMATS, type FormatDef } from '../src/index.js';
import { type Layer, plannedSummary } from '../src/validation/plan.js';
import { loadDistribution } from './validation-distribution.js';

interface Notes {
  publicSamples: string[];
  mappingSource: Record<string, string>;
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
  validationGaps: string[];
}

const root = join(import.meta.dir, '..');
const distribution = loadDistribution(root);
const fixtures = join(root, 'test', 'fixtures');
const notes = JSON.parse(readFileSync(join(root, 'conformance', 'notes.json'), 'utf8')) as Notes;
const expected = JSON.parse(readFileSync(join(fixtures, 'expected.json'), 'utf8')) as Record<string, string[]>;
const publicSamples = new Set(notes.publicSamples);

const detected = new Map<string, number>();
for (const ids of Object.values(expected)) for (const id of new Set(ids)) detected.set(id, (detected.get(id) ?? 0) + 1);

const converted = new Map<string, number>();
const convertedPublic = new Map<string, number>();
const coveredLayers = new Map<string, Set<string>>();
const coverageGaps = new Map<string, Set<string>>();
for (const file of Object.keys(expected)) {
  const r = await convert(new Uint8Array(readFileSync(join(fixtures, file))), file);
  for (const outcome of r.outcomes) {
    if (outcome.detection.kind !== 'invoice') continue;
    const id = outcome.detection.format.id;
    const coverage = plannedSummary(outcome.detection);
    const layers = coveredLayers.get(id) ?? new Set<string>();
    const gaps = coverageGaps.get(id) ?? new Set<string>();
    for (const layer of ['schema', 'semantic', 'profile'] as Layer[]) {
      const bundle = coverage.bundles[layer];
      if (bundle) {
        if (distribution.bundles[bundle]?.publish) layers.add(`${layer} (${bundle})`);
        else gaps.add(`${layer} (${bundle}: selected but not distributed)`);
      }
      if (coverage.reasons?.[layer] === 'unsupported') gaps.add(layer);
    }
    coveredLayers.set(id, layers);
    coverageGaps.set(id, gaps);
  }
  const ok = new Set(
    r.outcomes
      .filter((o) => o.status === 'ok' && o.detection.kind === 'invoice')
      .map((o) => (o.detection.kind === 'invoice' ? o.detection.format.id : '')),
  );
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
  parser: converts(f),
  fixturesConverted: converted.get(f.id) ?? 0,
  publicSamplesConverted: convertedPublic.get(f.id) ?? 0,
  mappingSource: notes.mappingSource[f.id] ?? notes.mappingSource[f.family],
  validation: [...(coveredLayers.get(f.id) ?? [])].sort(),
  validationGaps: [...(coverageGaps.get(f.id) ?? [])].sort(),
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
  `${totals.unverified} detection rules are unverified. ${totals.validated} formats select at least one distributed validation bundle for the checked-in source fixtures.`,
  'Validation lists distributed bundles selected for observed fixture versions and profiles, not all versions of a format. Required layers with unsupported selectors or undistributed artifacts are reported separately. Selection is not proof that a fixture passes validation.',
];

const args = process.argv.slice(2);
const argValue = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

// Markdown (stdout and job summary)
const yes = (b: boolean) => (b ? 'yes' : '—');
const md = [
  '## Conformance checklist',
  '',
  ...summaryLines.map((l) => `- ${l}`),
  '',
  '| Format | Countries | Detection | Fixtures detected | Parser | Fixtures converted | Real samples converted | Mapping source | Validation |',
  '|---|---|---|---|---|---|---|---|---|',
  ...rows.map(
    (r) =>
      `| ${r.name} (\`${r.id}\`) | ${r.countries} | ${r.detection} | ${r.fixturesDetected} | ${yes(r.parser)} | ${r.fixturesConverted} | ${r.publicSamplesConverted} | ${r.mappingSource ?? (r.parser ? '**not recorded**' : '—')} | ${r.validation.join(', ') || 'No selected bundle'}${r.validationGaps.length ? `; missing required: ${r.validationGaps.join(', ')}` : ''} |`,
  ),
  '',
].join('\n');
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);

const jsonOut = argValue('--json');
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ generatedAt: new Date().toISOString(), totals, rows }, null, 2));

const htmlOut = argValue('--html');
if (htmlOut) writeFileSync(htmlOut, html());

/** The latest benchmark summary, when bench/results.json is committed. */
function performanceSection() {
  const path = join(root, 'bench', 'results.json');
  return existsSync(path) ? renderPerformanceHtml(JSON.parse(readFileSync(path, 'utf8')) as Results) : '';
}

/** The body of the conformance page; the Astro page (site/src/pages/conformance.astro) puts it in the site frame. */
function html() {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const cell = (n: number, good: boolean) => `<td class="num ${good ? 'good' : 'gap'}">${n}</td>`;
  return `<p class="lede">Where every format in the registry stands, generated from the code and the test fixtures on each build. <a href="${BASE}">Back to the converter</a>.</p>
<div class="checklist">
  ${coverageHtml()}
  <h2 id="checklist-title">Checklist by format</h2>
  <ul class="checklist-summary">${summaryLines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
  <div class="table-scroll" tabindex="0">
  <table class="conformance">
    <thead><tr><th scope="col">Format</th><th scope="col">Countries</th><th scope="col">Detection rule</th><th scope="col" class="num">Fixtures detected</th><th scope="col">Parser</th><th scope="col" class="num">Fixtures converted</th><th scope="col" class="num">Real samples converted</th><th scope="col">Mapping source</th><th scope="col">Validation</th></tr></thead>
    <tbody>${rows
      .map(
        (r) => `<tr>
      <th scope="row">${esc(r.name)}<span class="sub">${esc(r.id)}</span></th>
      <td>${esc(r.countries)}</td>
      <td class="${r.detection === 'unverified' ? 'gap' : ''}">${r.detection}</td>
      ${cell(r.fixturesDetected, r.fixturesDetected > 0)}
      <td class="${r.parser ? 'good' : 'gap'}">${r.parser ? 'yes' : 'not yet'}</td>
      ${r.parser ? cell(r.fixturesConverted, r.fixturesConverted > 0) : '<td class="num">—</td>'}
      ${r.parser ? cell(r.publicSamplesConverted, r.publicSamplesConverted > 0) : '<td class="num">—</td>'}
      <td class="${r.parser && !r.mappingSource ? 'gap' : ''}">${r.mappingSource ? esc(r.mappingSource) : r.parser ? 'not recorded' : '—'}</td>
      <td class="${r.validationGaps.length ? 'gap' : ''}">${r.validation.length ? esc(r.validation.join(', ')) : 'No selected bundle'}${r.validationGaps.length ? `<span class="sub">Missing required: ${esc(r.validationGaps.join(', '))}</span>` : ''}</td>
    </tr>`,
      )
      .join('')}</tbody>
  </table>
  </div>
  <p class="wrappers">Generated ${new Date().toISOString().slice(0, 10)} by <code>scripts/conformance.ts</code>. Hand-maintained facts (which fixtures are real public samples, mapping sources) live in <code>conformance/notes.json</code>.</p>
  ${performanceSection()}
</div>`;
}
