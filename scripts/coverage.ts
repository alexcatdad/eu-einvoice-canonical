/**
 * Coverage gate for CI. Reads the lcov report written by `bun test --coverage`,
 * prints a per-file table (and appends it to the GitHub job summary when running in
 * Actions), and fails when coverage drops below the floors in coverage-floors.json.
 *
 *   bun test --coverage --coverage-reporter=lcov && bun scripts/coverage.ts
 *
 * Floors are a ratchet, not a target: raise them when coverage goes up, and never lower
 * them to make a PR pass. Files listed in `exclude` are covered by other means (for
 * example the CLI and the sweep module, whose tests run them as subprocesses that Bun's
 * coverage cannot see).
 *
 * With `--cobertura <path>` it also writes the gated files as Cobertura XML, the format
 * GitHub's code-coverage upload (actions/upload-code-coverage) and the "Restrict code
 * coverage" ruleset read, so GitHub's line coverage is computed over the same files as this gate.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

interface Floors {
  /** Minimum line coverage over all of src/, in percent. */
  totalLines: number;
  /** Minimum function coverage over all of src/, in percent. */
  totalFunctions: number;
  /** Minimum line coverage for any single file in src/, in percent. */
  perFileLines: number;
  /** Paths relative to the repo root that are reported but not gated. */
  exclude: string[];
  /** Why each excluded path is excluded; shown in the report so an exclusion is never silent. */
  excludeReasons?: Record<string, string>;
}

interface FileCov {
  file: string;
  lf: number;
  lh: number;
  fnf: number;
  fnh: number;
  lines: [number, number][];
}

const root = join(import.meta.dir, '..');
const lcovPath = join(root, 'coverage', 'lcov.info');
const floors = JSON.parse(readFileSync(join(root, 'coverage-floors.json'), 'utf8')) as Floors;

if (!existsSync(lcovPath)) {
  console.error(`No coverage report at ${relative(root, lcovPath)}. Run: bun test --coverage --coverage-reporter=lcov`);
  process.exit(1);
}

const files: FileCov[] = [];
let cur: FileCov | undefined;
for (const line of readFileSync(lcovPath, 'utf8').split('\n')) {
  const [tag, value = ''] = line.split(/:(.*)/s);
  if (tag === 'SF')
    cur = { file: relative(root, value.startsWith('/') ? value : join(root, value)), lf: 0, lh: 0, fnf: 0, fnh: 0, lines: [] };
  else if (!cur) continue;
  else if (tag === 'LF') cur.lf = Number(value);
  else if (tag === 'LH') cur.lh = Number(value);
  else if (tag === 'FNF') cur.fnf = Number(value);
  else if (tag === 'FNH') cur.fnh = Number(value);
  else if (tag === 'DA') {
    const [n, hits] = value.split(',');
    cur.lines.push([Number(n), Number(hits)]);
  } else if (tag === 'end_of_record') {
    files.push(cur);
    cur = undefined;
  }
}

const src = files.filter((f) => f.file.startsWith('src/')).sort((a, b) => a.file.localeCompare(b.file));
const gated = src.filter((f) => !floors.exclude.includes(f.file));
const pct = (hit: number, found: number) => (found === 0 ? 100 : (hit / found) * 100);
const fmt = (n: number) => `${n.toFixed(1)}%`;
const sum = (fs: FileCov[], k: 'lf' | 'lh' | 'fnf' | 'fnh') => fs.reduce((n, f) => n + f[k], 0);

const totalLines = pct(sum(gated, 'lh'), sum(gated, 'lf'));
const totalFunctions = pct(sum(gated, 'fnh'), sum(gated, 'fnf'));
const failures: string[] = [];
if (totalLines < floors.totalLines) failures.push(`total line coverage ${fmt(totalLines)} is below the floor of ${floors.totalLines}%`);
if (totalFunctions < floors.totalFunctions)
  failures.push(`total function coverage ${fmt(totalFunctions)} is below the floor of ${floors.totalFunctions}%`);
for (const f of gated) {
  const l = pct(f.lh, f.lf);
  if (l < floors.perFileLines) failures.push(`${f.file}: line coverage ${fmt(l)} is below the per-file floor of ${floors.perFileLines}%`);
}

const rows = src.map((f) => {
  const l = pct(f.lh, f.lf);
  const excluded = floors.exclude.includes(f.file);
  const flag = excluded
    ? `not gated: ${floors.excludeReasons?.[f.file] ?? 'no reason recorded'}`
    : l < floors.perFileLines
      ? 'below floor'
      : '';
  return `| \`${f.file}\` | ${fmt(l)} (${f.lh}/${f.lf}) | ${fmt(pct(f.fnh, f.fnf))} (${f.fnh}/${f.fnf}) | ${flag} |`;
});
const report = [
  '## Code coverage',
  '',
  `Gated files: **${fmt(totalLines)} of lines**, **${fmt(totalFunctions)} of functions**. Floors: ${floors.totalLines}% lines and ${floors.totalFunctions}% functions in total, ${floors.perFileLines}% lines per file.`,
  '',
  '| File | Lines | Functions | |',
  '|---|---|---|---|',
  ...rows,
  '',
  failures.length ? `**Coverage gate failed:**\n${failures.map((f) => `- ${f}`).join('\n')}` : 'Coverage gate passed.',
  '',
].join('\n');

console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);

const coberturaIdx = process.argv.indexOf('--cobertura');
if (coberturaIdx >= 0) {
  const out = process.argv[coberturaIdx + 1];
  if (!out) {
    console.error('--cobertura needs an output path');
    process.exit(1);
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, cobertura(gated));
  console.log(`Wrote Cobertura report for ${gated.length} files to ${out}`);
}

process.exit(failures.length ? 1 : 0);

/** Cobertura XML with one package per directory; branch data is not collected by Bun, so branch rates are 0/0. */
function cobertura(fs: FileCov[]): string {
  const rate = (hit: number, found: number) => (found === 0 ? '1' : (hit / found).toFixed(4));
  const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const byDir = new Map<string, FileCov[]>();
  for (const f of fs) byDir.set(dirname(f.file), [...(byDir.get(dirname(f.file)) ?? []), f]);
  const lh = sum(fs, 'lh');
  const lf = sum(fs, 'lf');
  const packages = [...byDir]
    .map(([dir, list]) => {
      const classes = list
        .map((f) => {
          const lines = [...f.lines]
            .sort((a, b) => a[0] - b[0])
            .map(([n, hits]) => `<line number="${n}" hits="${hits}" branch="false"/>`)
            .join('');
          return `<class name="${attr(f.file.slice(dir.length + 1))}" filename="${attr(f.file)}" line-rate="${rate(f.lh, f.lf)}" branch-rate="0" complexity="0"><methods/><lines>${lines}</lines></class>`;
        })
        .join('\n');
      return `<package name="${attr(dir)}" line-rate="${rate(sum(list, 'lh'), sum(list, 'lf'))}" branch-rate="0" complexity="0"><classes>\n${classes}\n</classes></package>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<coverage line-rate="${rate(lh, lf)}" branch-rate="0" lines-covered="${lh}" lines-valid="${lf}" branches-covered="0" branches-valid="0" complexity="0" version="1" timestamp="${Date.now()}">
<sources><source>.</source></sources>
<packages>
${packages}
</packages>
</coverage>
`;
}
