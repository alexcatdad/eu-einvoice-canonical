/**
 * Benchmarks for the converter.
 *
 *   bun run bench                     everything: formats, wrappers, options, large inputs, peak memory, bundle sizes
 *                                     -> bench/results.json and bench/results.md
 *   bun bench/run.ts --quick --check  the CI gate: a subset (< 30 s) compared with bench/baseline.json
 *   bun bench/run.ts --quick --update-baseline
 *   bun bench/run.ts --mem <case id>  one case in this process, prints its peak RSS (used by the full run)
 *
 * Times are compared as ratios to a calibration loop measured in the same run, so a slow or noisy
 * machine does not trip the gate. Bundle sizes are read from dist/ (run `bun run build:site` first).
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bundleSizes, type ChunkSize } from './bundle.js';
import { buildCases } from './cases.js';
import { calibrate, type Measured, measure, ownPeakMB, peakMemoryMB } from './lib.js';
import { compare, renderComparison, renderResults } from './report.js';

export interface Results {
  generatedAt: string;
  runtime: string;
  platform: string;
  calibrationMs: number;
  quick: boolean;
  cases: Measured[];
  bundles: ChunkSize[];
}

const dir = import.meta.dir;
const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const cases = buildCases();

const memIdx = args.indexOf('--mem');
if (memIdx >= 0) {
  const c = cases.find((x) => x.id === args[memIdx + 1]);
  if (!c) throw new Error(`Unknown case ${args[memIdx + 1]}`);
  await c.run();
  console.log(`PEAK_RSS_MB=${ownPeakMB().toFixed(1)}`);
  process.exit(0);
}

const quick = flag('--quick');
const selected = cases.filter((c) => !quick || c.quick);
const calibrationMs = calibrate();
console.error(`calibration loop: ${calibrationMs.toFixed(2)} ms; ${selected.length} cases`);

const measured: Measured[] = [];
for (const c of selected) {
  const m = await measure(c, calibrationMs);
  if (!quick) m.peakMB = peakMemoryMB(c.id);
  measured.push(m);
  console.error(`${c.id.padEnd(52)} ${m.docsPerSec.toFixed(1).padStart(9)} docs/s${m.peakMB ? `  ${m.peakMB.toFixed(0)} MB` : ''}`);
}

const results: Results = {
  generatedAt: new Date().toISOString(),
  runtime: `bun ${Bun.version}`,
  platform: `${process.platform}-${process.arch}`,
  calibrationMs,
  quick,
  cases: measured,
  bundles: bundleSizes(),
};

if (flag('--update-baseline')) {
  writeFileSync(join(dir, 'baseline.json'), `${JSON.stringify(results, null, 2)}\n`);
  console.error('wrote bench/baseline.json');
} else if (flag('--check')) {
  const baselinePath = join(dir, 'baseline.json');
  if (!existsSync(baselinePath)) throw new Error('bench/baseline.json is missing; run with --update-baseline');
  // Kept as a CI artifact, so the baseline can be refreshed with numbers from the runner itself.
  writeFileSync(join(dir, 'last-quick.json'), `${JSON.stringify(results, null, 2)}\n`);
  const cmp = compare(JSON.parse(readFileSync(baselinePath, 'utf8')) as Results, results);
  const md = renderComparison(cmp);
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  if (cmp.failures.length) {
    console.error(`\nFAILED:\n- ${cmp.failures.join('\n- ')}`);
    process.exit(1);
  }
} else {
  writeFileSync(join(dir, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
  const md = renderResults(results);
  writeFileSync(join(dir, 'results.md'), md);
  console.log(md);
}
