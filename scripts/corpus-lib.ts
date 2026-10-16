/**
 * Shared pieces of the real-world corpus run: what one converted file is reduced to, how many of
 * those become a report, and how the report is shown (markdown job summary, site page).
 *
 * The runner (scripts/corpus-run.ts) and its per-file child (scripts/corpus-worker.ts) write and read
 * `FileResult`s; scripts/corpus-page.ts renders a downloaded `CorpusReport`. Nothing here reads file
 * content into the report: it holds counts, normalised messages and repository-relative paths.
 */
import type { CheckStatus, ConvertResult } from '../src/index.js';

export const LAYERS = ['parse', 'schema', 'semantic', 'profile', 'signature'] as const;
export type Layer = (typeof LAYERS)[number];
export const STATUSES = ['ok', 'unsupported', 'error', 'not-an-invoice'] as const;
export type DocStatus = (typeof STATUSES)[number];

export interface DocResult {
  status: DocStatus;
  /** Format id for invoices, 'other' for recognised non-invoices, 'unknown' for unrecognised XML. */
  format: string;
  /** Invoices the document produced (ok only; a batch file holds several). */
  invoices: number;
  /** The error, or the reason it is unsupported. */
  message?: string;
  /** Warning codes over all invoices of the document. */
  warnings: string[];
  /** Validation status per layer of the first invoice (only when the document converted). */
  validation?: Partial<Record<Layer, CheckStatus>>;
  /** Rule ids that failed (fatal findings), deduplicated. */
  failedRules: string[];
  signatures: { type: string; verified?: boolean; trust?: string }[];
}

export interface FileResult {
  file: string;
  corpus: string;
  bytes: number;
  ms: number;
  /** 'timeout' and 'crash' mean the child was killed before it answered. */
  outcome: 'done' | 'timeout' | 'crash';
  error?: string;
  /** Reasons for everything in the file that did not become a document. */
  skipped: string[];
  docs: DocResult[];
}

/** Reduces a conversion to what the report needs. */
export function summarise(r: ConvertResult): { skipped: string[]; docs: DocResult[] } {
  const docs = r.outcomes.map((o): DocResult => {
    const format = o.detection.kind === 'invoice' ? o.detection.format.id : o.detection.kind === 'other-document' ? 'other' : 'unknown';
    const base: DocResult = { status: o.status, format, invoices: 0, warnings: [], failedRules: [], signatures: [] };
    if (o.status === 'unsupported') base.message = o.reason;
    if (o.status === 'error') base.message = o.error;
    if (o.status === 'ok') {
      base.invoices = o.invoices.length;
      const rules = new Set<string>();
      for (const inv of o.invoices) {
        for (const w of inv.source.warnings) base.warnings.push(w.code);
        for (const f of inv.source.validation?.findings ?? []) if (f.severity === 'fatal' && f.ruleId) rules.add(f.ruleId);
      }
      base.failedRules = [...rules].slice(0, 20);
      const first = o.invoices[0];
      if (first?.source.validation) {
        const v = first.source.validation;
        base.validation = { parse: v.parse, schema: v.schema, semantic: v.semantic, profile: v.profile, signature: v.signature };
      }
      for (const s of first?.source.signatures ?? []) base.signatures.push({ type: s.type, verified: s.verified, trust: s.trust });
    }
    return base;
  });
  return { skipped: r.skipped.map((s) => s.reason), docs };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export interface Counts {
  files: number;
  documents: number;
  invoices: number;
  ok: number;
  unsupported: number;
  error: number;
  notAnInvoice: number;
}

export interface Cluster {
  message: string;
  count: number;
  /** A few repository-relative paths, in the order first seen. */
  examples: string[];
}

export interface CorpusReport {
  generatedAt: string;
  /** Commit of this repository the run used. */
  commit?: string;
  /** `name sha files` lines from the fetch step. */
  pins: string[];
  options: { validate: boolean; relations: boolean; provenance: boolean; timeoutSeconds: number };
  totals: Counts & {
    /** Files that produced no document at all (nothing but skipped entries). */
    noDocument: number;
    timeouts: number;
    crashes: number;
    seconds: number;
    filesPerSecond: number;
    msP50: number;
    msP95: number;
  };
  corpora: Record<string, Counts>;
  formats: Record<string, Counts & { validation: Record<Layer, Partial<Record<CheckStatus, number>>> }>;
  warnings: { okDocuments: number; withWarning: number; withBrCo: number; brCoRate: number; top: { code: string; count: number }[] };
  validation: Record<Layer, Partial<Record<CheckStatus, number>>>;
  failedRules: { rule: string; count: number }[];
  signatures: {
    documents: number;
    byType: Record<string, { valid: number; invalid: number; unchecked: number }>;
    trust: Record<string, number>;
  };
  errors: Cluster[];
  unsupported: Cluster[];
  skipped: Cluster[];
  slowest: { file: string; ms: number }[];
  hung: { file: string; outcome: string; error?: string }[];
}

const emptyCounts = (): Counts => ({ files: 0, documents: 0, invoices: 0, ok: 0, unsupported: 0, error: 0, notAnInvoice: 0 });
const emptyLayers = (): Record<Layer, Partial<Record<CheckStatus, number>>> => ({
  parse: {},
  schema: {},
  semantic: {},
  profile: {},
  signature: {},
});
const bump = <K extends string>(m: Partial<Record<K, number>>, k: K) => {
  m[k] = (m[k] ?? 0) + 1;
};

function addDoc(c: Counts, d: DocResult) {
  c.documents++;
  c.invoices += d.invoices;
  if (d.status === 'ok') c.ok++;
  else if (d.status === 'unsupported') c.unsupported++;
  else if (d.status === 'error') c.error++;
  else c.notAnInvoice++;
}

/** Makes messages from different files comparable: quoted values, numbers and long ids become placeholders. */
export function normaliseMessage(m: string): string {
  return m
    .replace(/\s+/g, ' ')
    .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, "'…'")
    .replace(/\b[0-9a-f]{8,}\b/gi, '<hex>')
    .replace(/\d+(?:[.,]\d+)*/g, 'N')
    .trim()
    .slice(0, 200);
}

function cluster(into: Map<string, Cluster>, raw: string, file: string) {
  const message = normaliseMessage(raw);
  const c = into.get(message) ?? { message, count: 0, examples: [] };
  c.count++;
  if (c.examples.length < 3 && !c.examples.includes(file)) c.examples.push(file);
  into.set(message, c);
}

const top = (m: Map<string, Cluster>, n: number) =>
  [...m.values()].sort((a, b) => b.count - a.count || a.message.localeCompare(b.message)).slice(0, n);
const percentile = (sorted: number[], p: number) =>
  sorted.length ? (sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0) : 0;

export function aggregate(
  results: FileResult[],
  meta: { seconds: number; pins: string[]; commit?: string; options: CorpusReport['options']; generatedAt?: string },
): CorpusReport {
  const totals = emptyCounts();
  const corpora: CorpusReport['corpora'] = {};
  const formats: CorpusReport['formats'] = {};
  const validation = emptyLayers();
  const warnCodes = new Map<string, number>();
  const rules = new Map<string, number>();
  const errors = new Map<string, Cluster>();
  const unsupported = new Map<string, Cluster>();
  const skipped = new Map<string, Cluster>();
  const sig: CorpusReport['signatures'] = { documents: 0, byType: {}, trust: {} };
  let noDocument = 0;
  let timeouts = 0;
  let crashes = 0;
  let okDocs = 0;
  let withWarning = 0;
  let withBrCo = 0;

  for (const r of results) {
    totals.files++;
    corpora[r.corpus] ??= emptyCounts();
    const corpus = corpora[r.corpus] as Counts;
    corpus.files++;
    if (r.outcome === 'timeout') timeouts++;
    if (r.outcome === 'crash') crashes++;
    if (r.outcome !== 'done') continue;
    if (r.docs.length === 0) noDocument++;
    for (const s of r.skipped) cluster(skipped, s, r.file);
    const formatsInFile = new Set<string>();
    for (const d of r.docs) {
      addDoc(totals, d);
      addDoc(corpus, d);
      formats[d.format] ??= { ...emptyCounts(), validation: emptyLayers() };
      const f = formats[d.format] as CorpusReport['formats'][string];
      if (!formatsInFile.has(d.format)) f.files++;
      formatsInFile.add(d.format);
      addDoc(f, d);
      if (d.status === 'unsupported') cluster(unsupported, d.message ?? '(no reason)', r.file);
      if (d.status === 'error') cluster(errors, d.message ?? '(no message)', r.file);
      if (d.status !== 'ok') continue;
      okDocs++;
      if (d.warnings.length) withWarning++;
      if (d.warnings.some((c) => c.startsWith('BR-CO'))) withBrCo++;
      for (const c of d.warnings) warnCodes.set(c, (warnCodes.get(c) ?? 0) + 1);
      for (const rule of d.failedRules) rules.set(rule, (rules.get(rule) ?? 0) + 1);
      for (const layer of LAYERS) {
        const status = d.validation?.[layer];
        if (!status) continue;
        bump(validation[layer], status);
        bump(f.validation[layer], status);
      }
      if (d.signatures.length) {
        sig.documents++;
        for (const s of d.signatures) {
          sig.byType[s.type] ??= { valid: 0, invalid: 0, unchecked: 0 };
          const t = sig.byType[s.type] as { valid: number; invalid: number; unchecked: number };
          if (s.verified === true) t.valid++;
          else if (s.verified === false) t.invalid++;
          else t.unchecked++;
          const trust = s.trust ?? 'not-checked';
          sig.trust[trust] = (sig.trust[trust] ?? 0) + 1;
        }
      }
    }
    // A file's corpus counts the file once per corpus; documents are summed above.
  }
  // Files per corpus were counted for every file, including timeouts; formats' files only for converted ones.
  const ms = results
    .filter((r) => r.outcome === 'done')
    .map((r) => r.ms)
    .sort((a, b) => a - b);
  const sortedCodes = [...warnCodes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return {
    generatedAt: meta.generatedAt ?? new Date().toISOString(),
    commit: meta.commit,
    pins: meta.pins,
    options: meta.options,
    totals: {
      ...totals,
      files: results.length,
      noDocument,
      timeouts,
      crashes,
      seconds: Math.round(meta.seconds * 10) / 10,
      filesPerSecond: meta.seconds > 0 ? Math.round((results.length / meta.seconds) * 100) / 100 : 0,
      msP50: percentile(ms, 0.5),
      msP95: percentile(ms, 0.95),
    },
    corpora,
    formats,
    warnings: {
      okDocuments: okDocs,
      withWarning,
      withBrCo,
      brCoRate: okDocs ? Math.round((withBrCo / okDocs) * 10000) / 10000 : 0,
      top: sortedCodes.slice(0, 15).map(([code, count]) => ({ code, count })),
    },
    validation,
    failedRules: [...rules]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 20)
      .map(([rule, count]) => ({ rule, count })),
    signatures: sig,
    errors: top(errors, 20),
    unsupported: top(unsupported, 10),
    skipped: top(skipped, 10),
    slowest: results
      .filter((r) => r.outcome === 'done')
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 10)
      .map((r) => ({ file: r.file, ms: r.ms })),
    hung: results.filter((r) => r.outcome !== 'done').map((r) => ({ file: r.file, outcome: r.outcome, error: r.error })),
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)} %` : '—');
const layerLine = (m: Partial<Record<CheckStatus, number>>) => {
  const ran = (m.passed ?? 0) + (m.failed ?? 0);
  return {
    passed: m.passed ?? 0,
    failed: m.failed ?? 0,
    notRun: (m['not-run'] ?? 0) + (m.unavailable ?? 0),
    rate: pct(m.passed ?? 0, ran),
  };
};
const mdCell = (s: string) => s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const countsRow = (name: string, c: Counts) =>
  `| ${name} | ${c.files} | ${c.documents} | ${c.ok} | ${c.unsupported} | ${c.error} | ${c.notAnInvoice} |`;

export function renderMarkdown(r: CorpusReport): string {
  const t = r.totals;
  const out: string[] = [];
  out.push('## Real-world results', '');
  out.push(
    `${t.files} files from ${Object.keys(r.corpora).length} public corpora, ${t.documents} documents (${t.invoices} invoices), converted with \`validate: ${r.options.validate}, relations: ${r.options.relations}, provenance: ${r.options.provenance}\`.`,
    `${t.seconds} s, **${t.filesPerSecond} files/s** (median ${t.msP50} ms, p95 ${t.msP95} ms per file, ${r.options.timeoutSeconds} s limit). ${t.timeouts} timed out, ${t.crashes} crashed, ${t.noDocument} held no XML document.`,
    '',
  );
  out.push(
    '### Per corpus',
    '',
    '| Corpus | Files | Documents | ok | unsupported | error | not an invoice |',
    '|---|---:|---:|---:|---:|---:|---:|',
  );
  for (const [name, c] of Object.entries(r.corpora).sort()) out.push(countsRow(name, c));
  out.push(
    '',
    '### Per format',
    '',
    '| Format | Files | Documents | ok | unsupported | error | not an invoice |',
    '|---|---:|---:|---:|---:|---:|---:|',
  );
  for (const [name, c] of Object.entries(r.formats).sort((a, b) => b[1].documents - a[1].documents)) out.push(countsRow(`\`${name}\``, c));
  out.push(
    '',
    '### Warnings',
    '',
    `${r.warnings.withBrCo} of ${r.warnings.okDocuments} converted documents (${pct(r.warnings.withBrCo, r.warnings.okDocuments)}) carry a BR-CO arithmetic warning; ${r.warnings.withWarning} (${pct(r.warnings.withWarning, r.warnings.okDocuments)}) carry any warning.`,
    '',
    '| Code | Documents |',
    '|---|---:|',
    ...r.warnings.top.map((w) => `| ${mdCell(w.code)} | ${w.count} |`),
  );
  out.push(
    '',
    '### Validation per layer (converted documents)',
    '',
    '| Layer | Passed | Failed | Not run / unavailable | Pass rate where run |',
    '|---|---:|---:|---:|---:|',
  );
  for (const layer of LAYERS) {
    const l = layerLine(r.validation[layer]);
    out.push(`| ${layer} | ${l.passed} | ${l.failed} | ${l.notRun} | ${l.rate} |`);
  }
  if (r.failedRules.length)
    out.push('', `Most frequent failed rules: ${r.failedRules.map((x) => `\`${x.rule}\` (${x.count})`).join(', ')}`);
  out.push('', '### Signatures', '');
  const types = Object.entries(r.signatures.byType);
  if (types.length) {
    out.push(
      `${r.signatures.documents} documents carry a signature.`,
      '',
      '| Type | Valid | Invalid | Not checked |',
      '|---|---:|---:|---:|',
    );
    for (const [type, s] of types) out.push(`| ${type} | ${s.valid} | ${s.invalid} | ${s.unchecked} |`);
  } else out.push('No signatures found.');
  const clusterTable = (title: string, list: Cluster[]) => {
    if (!list.length) return;
    out.push('', title, '', '| # | Message (normalised) | Count | Examples |', '|---:|---|---:|---|');
    for (const [i, c] of list.entries())
      out.push(`| ${i + 1} | ${mdCell(c.message)} | ${c.count} | ${c.examples.map((e) => `\`${e}\``).join('<br>')} |`);
  };
  clusterTable('### Top 20 error messages', r.errors);
  clusterTable('### Unsupported (top 10)', r.unsupported);
  clusterTable('### Skipped entries (top 10)', r.skipped);
  if (r.hung.length)
    out.push(
      '',
      '### Timed out or crashed',
      '',
      ...r.hung.slice(0, 20).map((h) => `- \`${h.file}\`: ${h.outcome}${h.error ? ` (${mdCell(h.error)})` : ''}`),
    );
  out.push('', '### Slowest files', '', ...r.slowest.map((s) => `- \`${s.file}\`: ${s.ms} ms`));
  out.push('', '### Pinned commits', '', '```', ...r.pins, '```', '');
  return out.join('\n');
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

/** The "Real-world results" page, in the site's style (same shell as the conformance checklist). */
export function renderHtml(r: CorpusReport): string {
  const t = r.totals;
  const date = r.generatedAt.slice(0, 10);
  const countsTable = (rows: [string, Counts][], label: string, code = false) => `<div class="table-scroll">
  <table class="conformance">
    <thead><tr><th scope="col">${label}</th><th scope="col" class="num">Files</th><th scope="col" class="num">Documents</th><th scope="col" class="num">ok</th><th scope="col" class="num">unsupported</th><th scope="col" class="num">error</th><th scope="col" class="num">not an invoice</th></tr></thead>
    <tbody>${rows
      .map(
        ([n, c]) =>
          `<tr><th scope="row">${code ? `<code>${esc(n)}</code>` : esc(n)}</th><td class="num">${c.files}</td><td class="num">${c.documents}</td><td class="num good">${c.ok}</td><td class="num">${c.unsupported}</td><td class="num ${c.error ? 'gap' : ''}">${c.error}</td><td class="num">${c.notAnInvoice}</td></tr>`,
      )
      .join('')}</tbody>
  </table>
  </div>`;
  const clusters = (list: Cluster[]) =>
    list.length
      ? `<div class="table-scroll"><table class="conformance"><thead><tr><th scope="col" class="num">Count</th><th scope="col">Message (normalised)</th><th scope="col">Examples</th></tr></thead><tbody>${list
          .map(
            (c) =>
              `<tr><td class="num">${c.count}</td><td>${esc(c.message)}</td><td>${c.examples.map((e) => `<code>${esc(e)}</code>`).join('<br>')}</td></tr>`,
          )
          .join('')}</tbody></table></div>`
      : '<p class="wrappers">None.</p>';
  const layerRows = LAYERS.map((layer) => {
    const l = layerLine(r.validation[layer]);
    return `<tr><th scope="row">${layer}</th><td class="num good">${l.passed}</td><td class="num ${l.failed ? 'gap' : ''}">${l.failed}</td><td class="num">${l.notRun}</td><td class="num">${l.rate}</td></tr>`;
  }).join('');
  const sigRows = Object.entries(r.signatures.byType)
    .map(
      ([type, s]) =>
        `<tr><th scope="row">${esc(type)}</th><td class="num good">${s.valid}</td><td class="num ${s.invalid ? 'gap' : ''}">${s.invalid}</td><td class="num">${s.unchecked}</td></tr>`,
    )
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Real-world results</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..800&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css">
</head>
<body>
<header class="masthead">
  <div class="masthead-text">
    <h1>Real-world results</h1>
    <p class="lede">What the converter does with ${t.files} files from public sample collections. Report of ${esc(date)}${r.commit ? `, commit <code>${esc(r.commit.slice(0, 7))}</code>` : ''}.</p>
  </div>
  <p class="privacy"><a href="./">Back to the converter</a></p>
</header>
<main class="checklist">
  <ul class="checklist-summary">
    <li>${t.documents} documents (${t.invoices} invoices) from ${Object.keys(r.corpora).length} corpora; ${t.ok} converted, ${t.unsupported} unsupported, ${t.error} errors, ${t.notAnInvoice} not invoices.</li>
    <li>${t.filesPerSecond} files per second with validation on (median ${t.msP50} ms, 95th percentile ${t.msP95} ms; ${t.timeouts} timeouts).</li>
    <li>${pct(r.warnings.withBrCo, r.warnings.okDocuments)} of converted documents carry a BR-CO arithmetic warning.</li>
  </ul>
  <h2>By format</h2>
  ${countsTable(
    Object.entries(r.formats).sort((a, b) => b[1].documents - a[1].documents),
    'Format',
    true,
  )}
  <h2>By corpus</h2>
  ${countsTable(Object.entries(r.corpora).sort(), 'Corpus')}
  <h2>Validation, converted documents</h2>
  <div class="table-scroll"><table class="conformance"><thead><tr><th scope="col">Layer</th><th scope="col" class="num">Passed</th><th scope="col" class="num">Failed</th><th scope="col" class="num">Not run</th><th scope="col" class="num">Pass rate where run</th></tr></thead><tbody>${layerRows}</tbody></table></div>
  <h2>Warnings</h2>
  <div class="table-scroll"><table class="conformance"><thead><tr><th scope="col">Code</th><th scope="col" class="num">Documents</th></tr></thead><tbody>${r.warnings.top.map((w) => `<tr><th scope="row"><code>${esc(w.code)}</code></th><td class="num">${w.count}</td></tr>`).join('')}</tbody></table></div>
  <h2>Signatures</h2>
  ${sigRows ? `<div class="table-scroll"><table class="conformance"><thead><tr><th scope="col">Type</th><th scope="col" class="num">Valid</th><th scope="col" class="num">Invalid</th><th scope="col" class="num">Not checked</th></tr></thead><tbody>${sigRows}</tbody></table></div>` : '<p class="wrappers">No signatures in the corpora.</p>'}
  <h2>Most common errors</h2>
  ${clusters(r.errors)}
  <p class="wrappers">Report generated ${esc(r.generatedAt)} by the weekly <code>Public corpora</code> workflow, from sample collections cloned at pinned commits (see <code>test/corpus/SOURCES.md</code> for the licences). The files themselves are never published.</p>
</main>
</body>
</html>`;
}

/** The coverage-section paragraph that links the page and shows the report date. */
export function linkHtml(r: CorpusReport): string {
  const t = r.totals;
  return `<p class="wrappers"><a href="corpus.html">See the real-world results</a>: ${t.files} files from public sample collections (report of ${esc(r.generatedAt.slice(0, 10))}).</p>`;
}
