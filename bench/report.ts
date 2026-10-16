import type { Results } from './run.js';

/** A case fails when it is more than this many times slower (relative to calibration) than the baseline. */
export const MAX_SLOWDOWN = 2;
/** If the typical case is this much slower, something is wrong with everything (or the machine differs wildly). */
export const MAX_GLOBAL_SLOWDOWN = 3;
/** A chunk fails when it is more than this much larger than the baseline. */
export const MAX_BUNDLE_GROWTH = 1.15;

export interface Comparison {
  rows: { id: string; baseRatio: number; ratio: number; factor: number; docsPerSec: number; fail: boolean }[];
  bundles: { name: string; base?: number; now?: number; growth?: number; fail: boolean }[];
  failures: string[];
  calibration: { base: number; now: number };
  /** Median slowdown over all cases: how much slower this machine is than the one that made the baseline, beyond the calibration loop. */
  machineFactor: number;
}

export function compare(base: Results, now: Results): Comparison {
  const failures: string[] = [];
  const baseCases = new Map(base.cases.map((c) => [c.id, c]));
  // Different hardware shifts the ratios of everything together (memory, crypto and WASM speed relative to the
  // calibration loop), so each case is judged against the median shift; one case getting slower stands out from it.
  const raw = now.cases.flatMap((c) => {
    const b = baseCases.get(c.id);
    return b ? [{ c, b, factor: c.ratio / b.ratio }] : [];
  });
  const sorted = raw.map((r) => r.factor).sort((a, b) => a - b);
  const machineFactor = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 1;
  if (machineFactor > MAX_GLOBAL_SLOWDOWN)
    failures.push(`the typical case is ${machineFactor.toFixed(2)}x slower than the baseline (limit ${MAX_GLOBAL_SLOWDOWN}x)`);
  const rows: Comparison['rows'] = [];
  for (const { c, b, factor: absolute } of raw) {
    const factor = absolute / machineFactor;
    const fail = factor > MAX_SLOWDOWN;
    if (fail)
      failures.push(`${c.id} is ${factor.toFixed(2)}x slower than the baseline, relative to the other cases (limit ${MAX_SLOWDOWN}x)`);
    rows.push({ id: c.id, baseRatio: b.ratio, ratio: c.ratio, factor, docsPerSec: c.docsPerSec, fail });
  }
  const baseBundles = new Map(base.bundles.map((c) => [c.name, c]));
  const nowBundles = new Map(now.bundles.map((c) => [c.name, c]));
  const bundles: Comparison['bundles'] = [];
  for (const name of new Set([...baseBundles.keys(), ...nowBundles.keys()])) {
    const b = baseBundles.get(name)?.bytes;
    const n = nowBundles.get(name)?.bytes;
    const growth = b && n ? n / b : undefined;
    const fail = growth !== undefined && growth > MAX_BUNDLE_GROWTH;
    if (fail) failures.push(`bundle ${name} grew ${((growth - 1) * 100).toFixed(1)}% (limit ${(MAX_BUNDLE_GROWTH - 1) * 100}%)`);
    bundles.push({ name, base: b, now: n, growth, fail });
  }
  return { rows, bundles, failures, calibration: { base: base.calibrationMs, now: now.calibrationMs }, machineFactor };
}

const kb = (n?: number) => (n === undefined ? '—' : `${(n / 1024).toFixed(1)} KB`);
const pct = (g?: number) => (g === undefined ? 'new/removed' : `${g >= 1 ? '+' : ''}${((g - 1) * 100).toFixed(1)}%`);

export function renderComparison(c: Comparison): string {
  return [
    '## Performance gate',
    '',
    c.failures.length ? `**${c.failures.length} regression(s):**\n${c.failures.map((f) => `- ${f}`).join('\n')}\n` : 'No regressions.',
    `Calibration loop: ${c.calibration.now.toFixed(2)} ms now, ${c.calibration.base.toFixed(2)} ms in the baseline. Times are ratios to it. This machine runs the cases ${c.machineFactor.toFixed(2)}x (median) slower than the baseline machine did; a case fails when it is more than ${MAX_SLOWDOWN}x slower than that, or when the median itself passes ${MAX_GLOBAL_SLOWDOWN}x.`,
    '',
    '| Case | docs/s | vs baseline (after the median) | |',
    '|---|---:|---:|---|',
    ...c.rows.map((r) => `| ${r.id} | ${r.docsPerSec.toFixed(1)} | ${r.factor.toFixed(2)}x | ${r.fail ? 'FAIL' : ''} |`),
    '',
    '| Chunk | Baseline | Now | Change | |',
    '|---|---:|---:|---:|---|',
    ...c.bundles.map((b) => `| ${b.name} | ${kb(b.base)} | ${kb(b.now)} | ${pct(b.growth)} | ${b.fail ? 'FAIL' : ''} |`),
    '',
  ].join('\n');
}

export function renderResults(r: Results): string {
  const groups = ['format', 'wrapper', 'options', 'large'] as const;
  const title = { format: 'Per format', wrapper: 'Per wrapper', options: 'Optional layers', large: 'Large inputs' };
  const out = [
    '## Performance',
    '',
    `Measured ${r.generatedAt.slice(0, 10)} on ${r.runtime}, ${r.platform}. Calibration loop ${r.calibrationMs.toFixed(2)} ms.`,
    '',
  ];
  for (const g of groups) {
    const rows = r.cases.filter((c) => c.group === g);
    if (!rows.length) continue;
    out.push(`### ${title[g]}`, '', '| Case | Input | docs/s | ms/doc | Peak memory |', '|---|---:|---:|---:|---:|');
    for (const c of rows)
      out.push(
        `| ${c.id.replace(`${g}/`, '')} | ${kb(c.bytes)} | ${c.docsPerSec.toFixed(c.docsPerSec < 10 ? 2 : 0)} | ${c.medianMs.toFixed(c.medianMs < 10 ? 2 : 0)} | ${c.peakMB ? `${c.peakMB.toFixed(0)} MB` : '—'} |`,
      );
    out.push('');
  }
  out.push('### Browser bundle', '', '| Chunk | Size | gzip |', '|---|---:|---:|');
  for (const b of r.bundles) out.push(`| ${b.name} | ${kb(b.bytes)} | ${kb(b.gzipBytes)} |`);
  out.push('');
  return out.join('\n');
}

/** Cases the site shows: one per family of work, so the section stays small. */
const SITE_CASES: [string, string][] = [
  ['format/peppol-bis3-invoice.xml', 'Peppol BIS 3 invoice (UBL)'],
  ['format/xrechnung-cii.xml', 'XRechnung (CII)'],
  ['format/fatturapa-b2b.xml', 'FatturaPA'],
  ['format/ksef-fa3.xml', 'KSeF FA(3)'],
  ['wrapper/pdf-a3', 'Factur-X PDF/A-3'],
  ['wrapper/cades-p7m', 'FatturaPA in CAdES .p7m'],
  ['wrapper/zip', 'ZIP archive'],
  ['options/ubl-relations+provenance', 'UBL with relations and provenance'],
  ['options/ubl-validate', 'UBL with XSD and Schematron validation'],
  ['large/1000-lines-plain', 'Generated invoice, 1,000 lines'],
  ['large/10000-lines-plain', 'Generated invoice, 10,000 lines'],
  ['large/attachment-20MB', 'Invoice with a 20 MB attachment'],
];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The "Performance" section of the conformance page, from bench/results.json. */
export function renderPerformanceHtml(r: Results): string {
  const byId = new Map(r.cases.map((c) => [c.id, c]));
  const rows = SITE_CASES.flatMap(([id, label]) => {
    const c = byId.get(id);
    return c
      ? [
          `<tr><th scope="row">${esc(label)}</th><td class="num">${kb(c.bytes)}</td><td class="num">${c.docsPerSec.toFixed(c.docsPerSec < 10 ? 2 : 0)}</td><td class="num">${c.peakMB ? `${c.peakMB.toFixed(0)} MB` : '—'}</td></tr>`,
        ]
      : [];
  });
  const total = r.bundles.reduce((n, b) => n + b.bytes, 0);
  const initial = r.bundles.find((b) => b.name === 'app.js');
  return `<section class="performance">
  <h2>Performance</h2>
  <p class="wrappers">Documents converted per second by <code>convert()</code> on ${esc(r.runtime)} (${esc(r.platform)}), measured ${esc(r.generatedAt.slice(0, 10))}; peak memory is the resident set of a fresh process that converts the file once. Numbers depend on the machine; the CI gate compares ratios to a calibration loop, not these figures.</p>
  <div class="table-scroll">
  <table class="conformance">
    <thead><tr><th scope="col">Case</th><th scope="col" class="num">Input</th><th scope="col" class="num">Documents/s</th><th scope="col" class="num">Peak memory</th></tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>
  </div>
  <p class="wrappers">Browser bundle: ${kb(initial?.bytes)} loaded up front, ${kb(total)} in ${r.bundles.length} chunks in total (the PDF and CMS chunks load only when a file needs them). Full results: <code>bench/results.md</code>.</p>
</section>`;
}
