/** Browser page that scores the rules and the optional language models on the labelled set. */
import { type EvalScore, evaluate } from '../src/relations/eval.js';
import { ENGINES, type EngineSpec, geminiNanoAvailability, loadEngine } from './model.js';

interface Row {
  engine: string;
  score?: EvalScore;
  loadMs?: number;
  runMs?: number;
  downloadBytes?: number;
  heapBytes?: number;
  stats?: string;
  error?: string;
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const statusEl = $('#status');
const rows: Row[] = [];

const enginesEl = $('#engines');
for (const e of ENGINES) {
  const label = document.createElement('label');
  label.innerHTML = `<input type="checkbox" value="${e.id}"${e.id === 'qwen3-1.7b' ? ' checked' : ''}> ${e.label} <span class="note" data-note="${e.id}"></span>`;
  enginesEl.append(label);
}
void geminiNanoAvailability().then((a) => {
  $('[data-note="gemini-nano"]').textContent = `(Prompt API: ${a})`;
});

const pct = (x: number) => `${(x * 100).toFixed(0)} %`;
const mb = (b?: number) => (b === undefined ? 'n/a' : `${(b / 1048576).toFixed(0)} MB`);
const sec = (ms?: number) => (ms === undefined ? 'n/a' : `${(ms / 1000).toFixed(1)} s`);
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

async function usage(): Promise<number | undefined> {
  try {
    return (await navigator.storage.estimate()).usage;
  } catch {
    return undefined;
  }
}
const heap = () => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;

async function runEngine(spec: EngineSpec): Promise<Row> {
  const row: Row = { engine: spec.label };
  try {
    const before = await usage();
    const t0 = performance.now();
    const engine = await loadEngine(spec, (text) => {
      statusEl.textContent = `${spec.label}: ${text}`;
    });
    row.loadMs = performance.now() - t0;
    const after = await usage();
    row.downloadBytes = before !== undefined && after !== undefined ? Math.max(0, after - before) : undefined;
    statusEl.textContent = `${spec.label}: labelling…`;
    const t1 = performance.now();
    row.score = await evaluate(engine.labeller);
    row.runMs = performance.now() - t1;
    row.heapBytes = heap();
    row.stats = await engine.stats?.();
    await engine.dispose();
  } catch (e) {
    row.error = e instanceof Error ? e.message : String(e);
  }
  return row;
}

function show() {
  $('#summary').hidden = false;
  $('#detail').hidden = false;
  $('#summary tbody').innerHTML = rows
    .map((r) =>
      r.score
        ? `<tr><td>${esc(r.engine)}</td><td class="num">${pct(r.score.roleAccuracy)}</td><td class="num">${pct(r.score.relationPrecision)}</td><td class="num">${pct(r.score.relationRecall)}</td><td class="num">${r.score.provenWrong}</td><td class="num">${sec(r.loadMs)}</td><td class="num">${sec(r.runMs)}</td><td class="num">${mb(r.downloadBytes)}</td><td class="num">${mb(r.heapBytes)}</td></tr>`
        : `<tr><td>${esc(r.engine)}</td><td colspan="8">${esc(r.error ?? 'no result')}</td></tr>`,
    )
    .join('');
  $('#detail-body').textContent = JSON.stringify(rows, null, 2);
  $<HTMLButtonElement>('#copy').disabled = false;
}

$<HTMLButtonElement>('#run').addEventListener('click', async () => {
  const button = $<HTMLButtonElement>('#run');
  button.disabled = true;
  rows.length = 0;
  statusEl.textContent = 'Rules only…';
  const t0 = performance.now();
  rows.push({ engine: 'Rules only', score: await evaluate(), runMs: performance.now() - t0 });
  show();
  const picked = [...document.querySelectorAll<HTMLInputElement>('#engines input:checked')].map((i) => i.value);
  for (const spec of ENGINES.filter((e) => picked.includes(e.id))) {
    rows.push(await runEngine(spec));
    show();
  }
  statusEl.textContent = `Done. ${navigator.userAgent}`;
  button.disabled = false;
});

$<HTMLButtonElement>('#copy').addEventListener('click', () => {
  void navigator.clipboard.writeText(
    JSON.stringify(
      { userAgent: navigator.userAgent, deviceMemoryGb: (navigator as unknown as { deviceMemory?: number }).deviceMemory, rows },
      null,
      2,
    ),
  );
});
