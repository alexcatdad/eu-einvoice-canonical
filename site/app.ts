/** Browser front end: everything runs locally through the same `convert()` the library exports. */

import {
  applyModelLabels,
  BAS_EXAMPLE_MAPPING,
  buildJournalEntry,
  type CanonicalInvoice,
  type ConvertOutcome,
  type ConvertResult,
  convert,
  FORMATS,
  type FormatDef,
  JournalError,
  type Line,
  type LineRelation,
  type LineRole,
  type Party,
  type SignatureInfo,
  type TrustSnapshot,
  toCii,
  toSie4,
  toUbl,
  WriterError,
} from '../src/index.js';
import { shortName } from './coverage.js';
import { currentLang, esc, initLanguage, initSwitcher, onLanguageChange, t } from './i18n.js';
import { ENGINES, type EngineSpec, geminiNanoAvailability, loadEngine } from './model.js';

const SAMPLES: { file: string; label: string }[] = [
  { file: 'peppol-bis3-invoice.xml', label: 'sample.peppolInvoice' },
  { file: 'peppol-bis3-creditnote.xml', label: 'sample.peppolCredit' },
  { file: 'xrechnung-ubl.xml', label: 'sample.xrechnungUbl' },
  { file: 'xrechnung-cii.xml', label: 'sample.xrechnungCii' },
  { file: 'facturx-en16931.pdf', label: 'sample.facturxPdf' },
  { file: 'facturx-basic-creditnote.xml', label: 'sample.facturxCredit' },
  { file: 'svefaktura-1.0.xml', label: 'sample.svefaktura' },
  { file: 'anaf-download.zip', label: 'sample.anaf' },
  { file: 'hr-cius.xml', label: 'sample.hrCius' },
  { file: 'IT01234567890_FPR12.xml.p7m', label: 'sample.fatturapa' },
  { file: 'ksef-fa3.xml', label: 'sample.ksef' },
  { file: 'svefaktura-1.0-descriptors.xml', label: 'sample.svefakturaDescriptors' },
  { file: 'pint-sg-invoice.xml', label: 'sample.pintSg' },
  { file: 'pint-jp-invoice.xml', label: 'sample.pintJp' },
  { file: 'zatca-simplified-signed.xml', label: 'sample.zatca' },
];
const EXAMPLE = SAMPLES[0];

/** Message keys for UNCL 4461 payment means codes; an unlisted code is shown as "Code n". */
const MEANS: Record<string, string> = {
  '1': 'means.1',
  '10': 'means.10',
  '20': 'means.20',
  '30': 'means.30',
  '31': 'means.31',
  '42': 'means.42',
  '48': 'means.48',
  '49': 'means.49',
  '54': 'means.54',
  '55': 'means.55',
  '57': 'means.57',
  '58': 'means.58',
  '59': 'means.59',
  '68': 'means.68',
  '97': 'means.97',
  ZZZ: 'means.ZZZ',
};

const ENVELOPE_LABEL: Record<string, string> = {
  'pdf-attachment': 'env.pdf-attachment',
  'cms-p7m': 'env.cms-p7m',
  base64: 'env.base64',
  zip: 'env.zip',
  sbdh: 'env.sbdh',
  soap: 'env.soap',
  xml: '',
};

const MAX_LINES = 12;

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const fileInput = $<HTMLInputElement>('#file');
const slot = $<HTMLLabelElement>('#slot');
const sampleSelect = $<HTMLSelectElement>('#sample');
const pasted = $<HTMLTextAreaElement>('#pasted');
const resultEl = $<HTMLElement>('#result');

fileInput.addEventListener('change', async () => {
  const f = fileInput.files?.[0];
  if (f) await run(new Uint8Array(await f.arrayBuffer()), f.name);
  fileInput.value = '';
});
sampleSelect.addEventListener('change', () => {
  if (sampleSelect.value) void loadSample(sampleSelect.value, false);
});

// Paste is a first-class input: a visible editor, and a paste anywhere on the page converts at once.
const MAC = /Mac|iPhone|iPad/.test(navigator.userAgent);
if (MAC) $('#paste-hint').setAttribute('data-i18n-params', '{"shortcut":"\u2318V"}');
const pasteSize = $<HTMLElement>('#paste-size');
const updatePasteSize = () => {
  pasteSize.textContent = pasted.value ? t('paste.size', { size: (new Blob([pasted.value]).size / 1024).toFixed(1) }) : '';
};
function convertPasted() {
  const text = pasted.value.trim();
  if (!text) {
    pasteSize.textContent = t('paste.empty');
    pasted.focus();
    return;
  }
  void run(new TextEncoder().encode(text), 'pasted.xml');
}
pasted.addEventListener('input', updatePasteSize);
// Pasting into the box converts straight away; typing and editing do not.
pasted.addEventListener('paste', () => {
  setTimeout(() => {
    updatePasteSize();
    if (pasted.value.trim()) convertPasted();
  }, 0);
});
$<HTMLButtonElement>('#convert-pasted').addEventListener('click', convertPasted);
$<HTMLButtonElement>('#clear-pasted').addEventListener('click', () => {
  pasted.value = '';
  updatePasteSize();
  pasted.focus();
});
document.addEventListener('paste', async (e) => {
  const target = e.target as HTMLElement | null;
  if (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target?.isContentEditable
  )
    return;
  const file = e.clipboardData?.files?.[0];
  if (file) {
    e.preventDefault();
    await run(new Uint8Array(await file.arrayBuffer()), file.name);
    return;
  }
  const text = e.clipboardData?.getData('text/plain')?.trim();
  if (text) {
    e.preventDefault();
    pasted.value = text;
    updatePasteSize();
    await run(new TextEncoder().encode(text), 'pasted.xml');
  }
});

// Drag and drop anywhere on the page; the slot shows where it lands.
let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  slot.classList.add('dragging');
});
window.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    slot.classList.remove('dragging');
  }
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  slot.classList.remove('dragging');
  const f = e.dataTransfer?.files?.[0];
  if (f) await run(new Uint8Array(await f.arrayBuffer()), f.name);
});

async function loadSample(name: string, isExample: boolean) {
  try {
    const res = await fetch(`samples/${name}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await run(new Uint8Array(await res.arrayBuffer()), name, isExample);
  } catch (e) {
    if (!isExample) showNotice(t('notice.sampleFailedTitle'), t('notice.sampleFailedDetail', { name, reason: (e as Error).message }));
  }
}

// ---------------------------------------------------------------------------
// Conversion and rendering
// ---------------------------------------------------------------------------

interface Item {
  tab: string;
  outcome: ConvertOutcome;
  invoice?: CanonicalInvoice;
}
let shownIndex = 0;
let current: { result: ConvertResult; filename: string; items: Item[]; isExample: boolean } | undefined;

// EU trusted lists: opt-in, loaded the first time the box is ticked.
let euTrust: TrustSnapshot | undefined;
let lastInput: { bytes: Uint8Array; filename: string; isExample: boolean } | undefined;
/** What the trust status line shows once the box has been ticked, so a language change can redraw it. */
let trustStatus: (() => string) | undefined;
const euBox = $<HTMLInputElement>('#eu-trust');
const euStatus = $<HTMLElement>('#eu-trust-status');
euBox.addEventListener('change', async () => {
  if (!euBox.checked) {
    euTrust = undefined;
    trustStatus = undefined;
    euStatus.setAttribute('data-i18n', 'trust.off');
    euStatus.textContent = t('trust.off');
  } else {
    euBox.disabled = true;
    euStatus.removeAttribute('data-i18n');
    euStatus.textContent = t('trust.loading');
    try {
      const { loadSiteTrust } = await import('./trust.js');
      const site = await loadSiteTrust();
      euTrust = site.snapshot;
      const ok = site.snapshot.lists.filter((l) => l.status === 'loaded').length;
      trustStatus = () =>
        t('trust.status', {
          source: t(site.source === 'live' ? 'trust.live' : 'trust.published'),
          date: site.snapshot.fetchedAt.slice(0, 10),
          ok,
          total: site.snapshot.lists.length,
        }) + (site.note ? ` ${site.note}.` : '');
      euStatus.textContent = trustStatus();
    } catch (e) {
      euBox.checked = false;
      euStatus.setAttribute('data-i18n', 'trust.off');
      euStatus.textContent = (e as Error).message;
    }
    euBox.disabled = false;
  }
  if (lastInput) await run(lastInput.bytes, lastInput.filename, lastInput.isExample);
});

async function run(bytes: Uint8Array, filename: string, isExample = false) {
  lastInput = { bytes, filename, isExample };
  if (!isExample) {
    resultEl.innerHTML = `<p class="empty">${esc(t('result.reading', { name: filename }))}</p>`;
    announce(t('result.reading', { name: filename }));
  }
  try {
    const result = await convert(bytes, filename, undefined, { relations: true, euTrust });
    const items = result.outcomes.flatMap((o, i): Item[] =>
      o.status === 'ok'
        ? o.invoices.map((inv) => ({
            tab: t(inv.kind === 'creditNote' ? 'tab.creditNote' : 'tab.invoice', { id: inv.id }),
            outcome: o,
            invoice: inv,
          }))
        : [{ tab: t('tab.document', { n: i + 1 }), outcome: o }],
    );
    current = { result, filename, items, isExample };
    activeView = 'invoice';
    render(0);
    const first = items[0];
    if (first) {
      const st = stampFor(first);
      announce(t('sr.done', { name: filename, summary: `${st.title}${st.note ? `, ${st.note}` : ''}` }));
    }
    if (!isExample)
      resultEl.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  } catch (e) {
    showNotice(t('notice.readFailedTitle'), (e as Error).message);
  }
}

function showNotice(title: string, detail: string) {
  resultEl.innerHTML = `<div class="notice"><p><strong>${esc(title)}</strong></p><p>${esc(detail)}</p></div>`;
}

type View = 'invoice' | 'json' | 'checks' | 'lines';
let activeView: View = 'invoice';
const VIEW_KEY: Record<View, string> = { invoice: 'view.invoice', json: 'view.json', checks: 'view.checks', lines: 'view.lines' };
const liveEl = $<HTMLElement>('#live');
/** Tells screen readers what just happened; the visible result is not a live region. */
const announce = (text: string) => {
  liveEl.textContent = '';
  setTimeout(() => {
    liveEl.textContent = text;
  }, 50);
};

function render(index: number) {
  if (!current) return;
  shownIndex = index;
  const { result, filename, items, isExample } = current;
  const head = `<div class="result-head"><h2 id="result-title">${esc(t('result.heading'))}</h2>
    <p class="sheet-sub">${esc(t('result.sub'))}</p>
    <p class="file-name">${esc(filename)}${isExample ? ` <span class="example">${esc(t('result.example'))}</span>` : ''}</p>
    <p class="file-meta">${esc(t('result.meta', { hash: result.fileSha256.slice(0, 12), count: items.length }))}</p></div>`;

  if (items.length === 0) {
    const reasons =
      result.skipped.map((s) => `<p>${s.name ? `${esc(s.name)}: ` : ''}${esc(s.reason)}</p>`).join('') ||
      `<p>${esc(t('result.noXml'))}</p>`;
    resultEl.innerHTML = `${head}<div class="notice"><p><strong>${esc(t('result.noInvoice'))}</strong></p>${reasons}</div>`;
    return;
  }
  const item = items[index];
  const views: View[] = item.invoice ? ['invoice', 'json', 'checks', 'lines'] : ['invoice', 'json', 'checks'];
  if (!views.includes(activeView)) activeView = 'invoice';
  const docTabs =
    items.length > 1
      ? `<div class="doc-tabs" role="tablist" aria-label="${esc(t('result.heading'))}">${items.map((it, i) => `<button role="tab" type="button" data-tab="${i}" aria-selected="${i === index}">${esc(it.tab)}</button>`).join('')}</div>`
      : '';
  const panels: Record<View, string> = {
    invoice: sheet(item),
    json: jsonPanel(item),
    checks: checksPanel(item, result),
    lines: item.invoice ? linesPanel(item.invoice) : '',
  };
  const tabs = `<div class="view-tabs" role="tablist" aria-label="${esc(t('view.label'))}">${views
    .map(
      (v) =>
        `<button type="button" role="tab" class="view-tab t-${v}" id="tab-${v}" aria-controls="panel-${v}" aria-selected="${v === activeView}" tabindex="${v === activeView ? 0 : -1}" data-view-tab="${v}">${esc(t(VIEW_KEY[v]))}</button>`,
    )
    .join('')}</div>`;
  const body = views
    .map(
      (v) =>
        `<div role="tabpanel" class="panel p-${v}" id="panel-${v}" aria-labelledby="tab-${v}" tabindex="0"${v === activeView ? '' : ' hidden'}>${panels[v]}</div>`,
    )
    .join('');
  resultEl.innerHTML = `${head}${docTabs}<div class="sheets">${tabs}${body}</div>`;
  resultEl.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => {
    b.addEventListener('click', () => render(Number(b.dataset.tab)));
  });
  wireViewTabs();
  wireJson(item, result);
  wireModel();
  if (!isExample) resultEl.querySelector('.stamp')?.classList.add('fresh');
}

function setView(v: View, focus = false) {
  activeView = v;
  for (const b of resultEl.querySelectorAll<HTMLButtonElement>('[data-view-tab]')) {
    const on = b.dataset.viewTab === v;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
    if (on && focus) b.focus();
  }
  for (const p of resultEl.querySelectorAll<HTMLElement>('[role="tabpanel"]')) p.hidden = p.id !== `panel-${v}`;
}

function wireViewTabs() {
  const tabs = [...resultEl.querySelectorAll<HTMLButtonElement>('[data-view-tab]')];
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => setView(b.dataset.viewTab as View));
    b.addEventListener('keydown', (e) => {
      const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      setView(tabs[(to + tabs.length) % tabs.length]!.dataset.viewTab as View, true);
    });
  });
}

// ---------------------------------------------------------------------------
// Line roles and relations
// ---------------------------------------------------------------------------

const ROLE_LABEL: Partial<Record<LineRole, string>> = {
  surcharge: 'role.surcharge',
  discount: 'role.discount',
  freight: 'role.freight',
  labour: 'role.labour',
  other: 'role.other',
};
/** Message keys for relations seen from the line that holds them ("on line 3"). Percentage types also have a variant with the rate. */
const RELATION_ON: Record<string, [plain: string, withRate?: string]> = {
  markup: ['rel.markupOn', 'rel.markupRateOn'],
  discount: ['rel.discountOn', 'rel.discountRateOn'],
  'allowance-base': ['rel.allowanceBaseOn'],
  'note-reference': ['rel.noteReferenceOn'],
  'same-item': ['rel.sameItemOn'],
  'same-order-line': ['rel.sameOrderLineOn'],
};
const review = () => `<span class="review" title="${esc(t('rel.reviewTitle'))}">${esc(t('rel.review'))}</span>`;

/** Table rows for the lines: descriptors indented under their heading, adjustments shown beside the lines they apply to. */
function lineRows(inv: CanonicalInvoice, lines: Line[]): string {
  const roles = inv.lineRoles ?? {};
  const rels = inv.relations ?? [];
  const under = new Set(rels.filter((r) => r.type === 'heading').flatMap((r) => r.to));
  // Structural rules (no confidence) are certain; everything else short of 'proven' is a hint.
  const needsReview = (r: LineRelation) => r.method === 'model' || (r.confidence !== undefined && r.confidence !== 'proven');
  return lines
    .map((l) => {
      const role = roles[l.id];
      const descriptor = role === 'heading' || role === 'description';
      const notes: string[] = [];
      for (const r of rels) {
        if (r.type === 'heading') continue;
        const flag = needsReview(r) ? ` ${review()}` : '';
        if (r.from === l.id) {
          const [plain, withRate] = RELATION_ON[r.type] ?? ['rel.sameItemOn'];
          const key = r.rate !== undefined && withRate ? withRate : plain;
          notes.push(`${esc(t(key, { rate: r.rate ?? '', to: r.to.join(', ') }))}${flag}`);
        } else if (r.to.includes(l.id) && (r.type === 'markup' || r.type === 'discount')) {
          const key = `rel.${r.type}${r.rate !== undefined ? 'Rate' : ''}In`;
          notes.push(`${esc(t(key, { rate: r.rate ?? '', from: r.from }))}${flag}`);
        }
      }
      const tag =
        role && ROLE_LABEL[role] && !notes.length
          ? `<span class="sub">${esc(t(ROLE_LABEL[role]))}${inv.source.derived.some((d) => d.field === `/lineRoles/${l.id}`) ? ` ${review()}` : ''}</span>`
          : '';
      const byModel =
        inv.source.derived.some((d) => d.field === `/lineRoles/${l.id}`) ||
        rels.some((r) => r.method === 'model' && (r.from === l.id || r.to.includes(l.id)));
      const cls = [
        byModel ? 'by-model' : '',
        descriptor ? 'descriptor' : '',
        role === 'description' || under.has(l.id) ? 'under' : '',
        role === 'surcharge' || role === 'discount' ? 'adjusts' : '',
      ]
        .filter(Boolean)
        .join(' ');
      const vat = l.vat
        ? `<span class="sub">${esc(l.vat.rate !== undefined ? t('line.vatRate', { code: l.vat.categoryCode, rate: l.vat.rate }) : t('line.vat', { code: l.vat.categoryCode }))}</span>`
        : '';
      return `<tr class="${cls}">
        <td class="hide-narrow">${esc(l.id)}</td>
        <td class="item">${esc(l.item.name || l.item.description || t('line.noName'))}${descriptor ? '' : vat}${notes.map((n) => `<span class="sub relation">${n}</span>`).join('')}${tag}</td>
        <td class="num">${descriptor ? '' : l.quantity !== undefined ? `${esc(l.quantity)} ${esc(l.unitText ?? l.unitCode ?? '')}` : `<span class="sub">${esc(t('line.notStated'))}</span>`}</td>
        <td class="num hide-narrow">${!descriptor && l.price ? `${esc(l.price.net)}${l.price.baseQuantity && l.price.baseQuantity !== '1' ? `<span class="sub">${esc(t('line.per', { qty: l.price.baseQuantity }))}</span>` : ''}` : ''}</td>
        <td class="num">${descriptor ? '' : esc(l.netAmount)}</td></tr>`;
    })
    .join('');
}

/** Approximate download sizes of the WebLLM models, shown before anything is fetched. */
const ENGINE_SIZE: Record<string, string> = { 'qwen3-0.6b': '0.5 GB', 'qwen3-1.7b': '1 GB', 'qwen3-4b': '2.5 GB' };

interface ModelUi {
  inv: CanonicalInvoice;
  phase: 'idle' | 'busy' | 'done' | 'error';
  text: string;
  fraction?: number;
  /** Puts the invoice back as it was before the model ran. */
  undo?: () => void;
}
let modelUi: ModelUi | undefined;
let chosenEngine = 'qwen3-1.7b';
let nanoStatus: string | undefined;

function engineOption(e: EngineSpec, busy: boolean): string {
  const unavailable = e.kind === 'gemini-nano' && nanoStatus === 'unavailable';
  const note =
    e.kind === 'gemini-nano'
      ? t(unavailable ? 'model.unavailable' : 'model.optBuiltin')
      : t('model.optSize', { size: ENGINE_SIZE[e.id] ?? '' });
  return `<label class="engine"><input type="radio" name="model-engine" value="${esc(e.id)}"${e.id === chosenEngine ? ' checked' : ''}${busy || unavailable ? ' disabled' : ''}>
    <span><strong>${esc(e.label)}</strong><small>${esc(note)}</small></span></label>`;
}

function labelControl(inv: CanonicalInvoice): string {
  const ui = modelUi?.inv === inv ? modelUi : undefined;
  const busy = ui?.phase === 'busy';
  if (nanoStatus === undefined) {
    nanoStatus = 'checking';
    void geminiNanoAvailability().then((a) => {
      nanoStatus = a;
      if (a === 'unavailable') refreshModelPanel();
    });
  }
  const progress = busy
    ? `<progress id="model-progress" max="1"${ui?.fraction !== undefined ? ` value="${ui.fraction}"` : ''} aria-label="${esc(t('model.progressLabel'))}"></progress>`
    : '';
  const dismiss = ui?.undo ? `<button type="button" class="btn ghost" id="model-dismiss">${esc(t('model.dismiss'))}</button>` : '';
  return `<section class="model" aria-labelledby="model-title">
    <div class="model-head"><h3 id="model-title">${esc(t('model.title'))}</h3>
      <span class="model-tag">${esc(t('model.badge'))}</span><span class="model-tag local">${esc(t('model.local'))}</span></div>
    <p>${esc(t('model.explain'))}</p>
    <fieldset${busy ? ' disabled' : ''}><legend>${esc(t('model.engine'))}</legend>${ENGINES.map((e) => engineOption(e, busy)).join('')}</fieldset>
    <div class="model-actions">
      <button type="button" class="btn" id="model-run"${busy ? ' disabled' : ''}>${esc(t('model.run'))}</button>${progress}
      <span class="model-status${ui?.phase === 'error' ? ' error' : ''}" id="model-status" role="status">${esc(ui?.text ?? '')}</span>${dismiss}
    </div>
    <p class="model-learn">${t('model.learn')}</p></section>`;
}

/** Redraws only the panel (progress and status change while the lines stay put). */
function refreshModelPanel() {
  const inv = current?.items[shownIndex]?.invoice;
  const el = document.querySelector('.model');
  if (!inv || !el) return;
  el.outerHTML = labelControl(inv);
  wireModel();
}

const snapshotOf = (inv: CanonicalInvoice) =>
  structuredClone({ lineRoles: inv.lineRoles, relations: inv.relations, derived: inv.source.derived, warnings: inv.source.warnings });

async function runModel(inv: CanonicalInvoice, spec: EngineSpec) {
  const started = performance.now();
  const before = snapshotOf(inv);
  const restore = () => {
    inv.lineRoles = before.lineRoles;
    inv.relations = before.relations;
    inv.source.derived = before.derived;
    inv.source.warnings = before.warnings;
  };
  const ui: ModelUi = { inv, phase: 'busy', text: t('model.loading', { model: spec.label }) };
  modelUi = ui;
  refreshModelPanel();
  const paint = () => {
    if (modelUi !== ui) return;
    const status = document.querySelector<HTMLElement>('#model-status');
    const bar = document.querySelector<HTMLProgressElement>('#model-progress');
    if (status) status.textContent = ui.text;
    if (bar) {
      if (ui.fraction === undefined) bar.removeAttribute('value');
      else bar.value = ui.fraction;
    }
  };
  const fail = (reason: string) => {
    restore();
    modelUi = { inv, phase: 'error', text: t('model.failed', { reason }) };
    refreshModelPanel();
  };
  try {
    const engine = await loadEngine(spec, (text, fraction) => {
      ui.text = text;
      ui.fraction = fraction;
      paint();
    });
    ui.text = t('model.labelling');
    ui.fraction = undefined;
    paint();
    await applyModelLabels(inv, engine.labeller);
    await engine.dispose();
    const failed = inv.source.warnings.find(
      (w) => w.code === 'LINE-MODEL-FAILED' && !before.warnings.some((b) => b.code === w.code && b.message === w.message),
    );
    if (failed) return fail(failed.message.replace(/^The language model failed: /, ''));
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    const labels = Object.keys(inv.lineRoles ?? {}).filter((id) => inv.lineRoles?.[id] !== before.lineRoles?.[id]).length;
    const links = (inv.relations?.length ?? 0) - (before.relations?.length ?? 0);
    modelUi = {
      inv,
      phase: 'done',
      text: labels || links ? t('model.done', { seconds, labels, links }) : t('model.nothing', { seconds }),
      undo: labels || links ? restore : undefined,
    };
    if (current?.items[shownIndex]?.invoice === inv) render(shownIndex);
  } catch (e) {
    fail((e as Error).message);
  }
}

function wireModel() {
  const el = document.querySelector('.model');
  if (!el || !current) return;
  for (const r of el.querySelectorAll<HTMLInputElement>('input[name="model-engine"]'))
    r.addEventListener('change', () => {
      chosenEngine = r.value;
    });
  el.querySelector('#model-run')?.addEventListener('click', () => {
    const spec = ENGINES.find((e) => e.id === chosenEngine);
    const inv = current?.items[shownIndex]?.invoice;
    if (spec && inv) void runModel(inv, spec);
  });
  el.querySelector('#model-dismiss')?.addEventListener('click', () => {
    const inv = current?.items[shownIndex]?.invoice;
    if (!inv || modelUi?.inv !== inv) return;
    modelUi.undo?.();
    modelUi = { inv, phase: 'idle', text: t('model.removed') };
    render(shownIndex);
  });
}

function stampFor(item: Item): { cls: string; title: string; note: string } {
  const o = item.outcome;
  const det = o.detection;
  const title = det.kind === 'invoice' ? det.format.name : t(det.kind === 'other-document' ? 'stamp.notInvoice' : 'stamp.unknown');
  if (o.status === 'ok') {
    const n = item.invoice!.source.warnings.length;
    return { cls: n ? 'warn' : '', title, note: n ? t('stamp.convertedWarnings', { count: n }) : t('stamp.converted') };
  }
  if (o.status === 'unsupported') return { cls: 'warn', title, note: t(det.kind === 'invoice' ? 'stamp.noParser' : 'stamp.notRecognised') };
  if (o.status === 'not-an-invoice') return { cls: 'warn', title, note: det.kind === 'other-document' ? det.label.split(':')[0] : '' };
  return { cls: 'bad', title, note: t('stamp.failed') };
}

function sheet(item: Item): string {
  const o = item.outcome;
  const inv = item.invoice;
  const s = stampFor(item);
  const stamp = `<div class="stamp ${s.cls}">${esc(s.title)}${s.note ? `<small>${esc(s.note)}</small>` : ''}</div>`;

  if (!inv) {
    const reason =
      o.status === 'error'
        ? o.error
        : o.status === 'unsupported'
          ? o.reason
          : o.status === 'not-an-invoice' && o.detection.kind === 'other-document'
            ? o.detection.label
            : '';
    return `<article class="sheet">
      <div class="sheet-top"><div><h3 class="doc-title">${esc(t(o.status === 'error' ? 'doc.notConverted' : o.status === 'unsupported' ? 'doc.identified' : 'doc.notInvoice'))}</h3></div>${stamp}</div>
      ${reason ? `<p class="reason">${esc(reason)}</p>` : ''}
    </article>`;
  }

  const cur = inv.currency;
  const dates: [string, string | undefined][] = [
    [t('date.issued'), inv.issueDate],
    [t('date.due'), inv.dueDate],
    [
      t('date.period'),
      inv.invoicePeriod ? t('date.periodRange', { start: inv.invoicePeriod.start ?? '…', end: inv.invoicePeriod.end ?? '…' }) : undefined,
    ],
    [t('date.delivered'), inv.delivery?.actualDate],
    [t('date.buyerReference'), inv.buyerReference],
    [t('date.order'), inv.purchaseOrderRef],
  ];
  const tot = inv.totals;
  const totals: [string, string | undefined, string?][] = [
    [t('total.lines'), tot.lineNetTotal],
    [t('total.allowances'), tot.allowanceTotal && `−${tot.allowanceTotal}`],
    [t('total.charges'), tot.chargeTotal],
    [t('total.withoutVat'), tot.taxExclusive],
    ...inv.vatBreakdown.map((v): [string, string] => [
      v.rate !== undefined
        ? t('total.vatRate', { code: v.categoryCode, rate: v.rate, amount: v.taxableAmount })
        : t('total.vat', { code: v.categoryCode, amount: v.taxableAmount }),
      v.taxAmount,
    ]),
    [t('total.withVat'), tot.taxInclusive],
    [t('total.withheld'), tot.withholdingTotal && `−${tot.withholdingTotal}`],
    [t('total.prepaid'), tot.prepaid && `−${tot.prepaid}`],
    [t('total.rounding'), tot.rounding],
  ];
  const pay = inv.payments[0];

  return `<article class="sheet">
    <div class="sheet-top">
      <div>
        <h3 class="doc-title">${esc(t(inv.kind === 'creditNote' ? 'doc.creditNote' : 'doc.invoice'))}</h3>
        <p class="doc-number">${esc(inv.id)} <span class="label">${esc(t('doc.type', { code: inv.typeCode }))}${inv.selfBilled ? esc(t('doc.selfBilled')) : ''}</span></p>
      </div>
      ${stamp}
    </div>
    <dl class="dates">${dates
      .filter(([, v]) => v)
      .map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v!)}</dd></div>`)
      .join('')}</dl>
    <div class="parties">${party(t('party.from'), inv.seller)}${party(t('party.to'), inv.buyer)}</div>
    ${linesTable(inv, MAX_LINES)}
    <div class="sums">
      <div class="payment">${
        pay
          ? `<span class="label">${esc(t('pay.label'))}</span>
        <p>${esc(MEANS[pay.meansCode] ? t(MEANS[pay.meansCode]) : t('pay.code', { code: pay.meansCode }))}${pay.meansText ? ` (${esc(pay.meansText)})` : ''}</p>
        ${pay.creditTransfers.map((c) => `<p>${esc(c.accountId)}${c.serviceProviderId ? `, ${esc(c.serviceProviderId)}` : ''}</p>`).join('')}
        ${pay.remittanceInformation ? `<p>${esc(t('pay.reference', { ref: pay.remittanceInformation }))}</p>` : ''}`
          : ''
      }
        ${inv.paymentTerms ? `<span class="label" style="margin-top:.5rem">${esc(t('pay.terms'))}</span><p>${esc(inv.paymentTerms)}</p>` : ''}
      </div>
      <dl class="totals">
        ${totals
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v!)}</dd></div>`)
          .join('')}
        <div class="grand"><dt>${esc(t('total.due'))}</dt><dd>${esc(tot.payable)} ${esc(cur)}</dd></div>
      </dl>
    </div>
  </article>`;
}

function linesTable(inv: CanonicalInvoice, limit: number): string {
  const shown = inv.lines.slice(0, limit);
  return shown.length
    ? `<div class="table-scroll" tabindex="0"><table class="lines">
      <thead><tr><th scope="col" class="hide-narrow">#</th><th scope="col">${esc(t('line.item'))}</th><th scope="col" class="num">${esc(t('line.qty'))}</th><th scope="col" class="num hide-narrow">${esc(t('line.price'))}</th><th scope="col" class="num">${esc(t('line.net'))}</th></tr></thead>
      <tbody>${lineRows(inv, shown)}</tbody>
    </table></div>${inv.lines.length > limit ? `<p class="more-lines">${esc(t('line.more', { count: inv.lines.length - limit }))}</p>` : ''}`
    : `<p class="more-lines">${esc(t('line.none'))}</p>`;
}

function linesPanel(inv: CanonicalInvoice): string {
  return `<div class="lines-view"><h3>${esc(t('view.lines'))}</h3>${linesTable(inv, 200)}${inv.lines.length ? labelControl(inv) : ''}</div>`;
}

const LAYERS = ['parse', 'schema', 'semantic', 'profile', 'signature', 'clearance'] as const;

function checksPanel(item: Item, result: ConvertResult): string {
  const v = item.invoice?.source.validation;
  const layers = v
    ? `<section class="layers"><h3>${esc(t('val.title'))}</h3><ul>${LAYERS.map((l) => `<li class="${v[l]}"><span>${esc(t(`val.${l}`))}</span><strong>${esc(t(`val.${v[l]}`))}</strong></li>`).join('')}</ul></section>`
    : '';
  return `<div class="checks">${layers}${provenance(item)}${penNotes(item, result)}</div>`;
}

function party(label: string, p: Party): string {
  const a = p.address;
  const place = a ? [[a.postalCode, a.city].filter(Boolean).join(' '), a.countryCode].filter(Boolean).join(', ') : '';
  const ids = [
    p.vatId && t('party.vat', { id: p.vatId }),
    p.legalRegistrationId && t('party.reg', { id: p.legalRegistrationId.value }),
    p.endpoint && t('party.address', { id: p.endpoint.value }),
  ].filter(Boolean);
  return `<div class="party"><span class="label">${label}</span>
    <p class="name">${esc(p.name ?? p.tradingName ?? t('party.noName'))}</p>
    ${a?.line1 ? `<p>${esc(a.line1)}</p>` : ''}${a?.line2 ? `<p>${esc(a.line2)}</p>` : ''}${place ? `<p>${esc(place)}</p>` : ''}
    ${ids.length ? `<p class="ids">${ids.map((i) => esc(i!)).join('<br>')}</p>` : ''}
  </div>`;
}

function euNote(s: SignatureInfo): string {
  const e = s.euTrust;
  if (!e) return '';
  const stale = e.snapshot.stale ? t('sig.euStale', { date: e.snapshot.nextUpdate?.slice(0, 10) ?? '' }) : '';
  if (e.qualified) return t('sig.euQualified', { name: e.service?.name ?? '', territory: e.service?.territory ?? '', stale });
  return (e.reason ? t('sig.euReason', { reason: e.reason }) : t('sig.euNotQualified')) + stale;
}

function provenance(item: Item): string {
  const o = item.outcome;
  const rows: [string, string][] = [];
  if (o.detection.kind === 'invoice') {
    const d = o.detection.details;
    const v = [d.version && t('prov.version', { version: d.version }), d.profile && t('prov.profile', { profile: d.profile })]
      .filter(Boolean)
      .join(', ');
    rows.push([t('prov.format'), `${o.detection.format.name}${v ? `, ${v}` : ''}`]);
  }
  const env = o.payload.envelope.map((s) => (ENVELOPE_LABEL[s.kind] ? t(ENVELOPE_LABEL[s.kind]) : '')).filter(Boolean);
  if (env.length) rows.push([t('prov.unwrapped'), env.join(', ')]);
  rows.push([t('prov.encoding'), o.payload.encoding]);
  if (o.payload.signatures.length)
    rows.push([
      t('prov.signatures'),
      o.payload.signatures
        .map(
          (s) =>
            `${s.type}${s.signer ? ` (${s.signer})` : ''}${s.verified === undefined ? t('sig.notVerified') : s.verified ? t('sig.verified') : t('sig.invalid')}${euNote(s)}`,
        )
        .join('; '),
    ]);
  return `<dl class="provenance">${rows.map(([k, v]) => `<div><dt class="label">${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
}

function penNotes(item: Item, result: ConvertResult): string {
  const inv = item.invoice;
  const blocks: string[] = [];
  const block = (title: string, rows: { code?: string; message: string }[], quiet = false) =>
    `<section class="${quiet ? 'quiet' : ''}"><h3>${esc(title)}</h3><ul>${rows.map((r) => `<li>${r.code ? `<span class="code">${esc(r.code)}</span> ` : ''}${esc(r.message)}</li>`).join('')}</ul></section>`;
  if (inv?.source.warnings.length)
    blocks.push(
      block(
        t('pen.check'),
        inv.source.warnings.map((w) => ({ code: w.code, message: w.message })),
      ),
    );
  if (inv?.source.derived.length)
    blocks.push(
      block(
        t('pen.derived'),
        inv.source.derived.map((d) => ({ code: d.field, message: d.rule })),
        true,
      ),
    );
  if (result.skipped.length)
    blocks.push(
      block(
        t('pen.skipped'),
        result.skipped.map((s) => ({ code: s.name, message: s.reason })),
        true,
      ),
    );
  return blocks.length ? `<div class="pen">${blocks.join('')}</div>` : '';
}

function jsonPanel(item: Item): string {
  const views = item.invoice
    ? `<button type="button" data-view="invoice" aria-pressed="true">${esc(t('json.viewInvoice'))}</button><button type="button" data-view="full" aria-pressed="false">${esc(t('json.viewFull'))}</button>`
    : `<button type="button" data-view="full" aria-pressed="true">${esc(t('json.viewDetection'))}</button>`;
  return `<div class="json-panel">
    <div class="json-bar"><div class="views">${views}</div>
      <div class="actions"><button type="button" class="btn secondary" data-act="copy">${esc(t('json.copy'))}</button><button type="button" class="btn" data-act="download">${esc(t('json.download'))}</button>${item.invoice ? `<button type="button" class="btn ghost" data-act="journal">${esc(t('json.journal'))}</button><button type="button" class="btn ghost" data-act="write-ubl">${esc(t('json.writeUbl'))}</button><button type="button" class="btn ghost" data-act="write-cii">${esc(t('json.writeCii'))}</button>` : ''}</div></div>
    ${item.invoice ? `<p class="journal-note">${t('json.journalNote')}</p>` : ''}
    <pre class="json" tabindex="0" role="group" aria-label="${esc(t('json.output'))}"></pre>
  </div>`;
}

function wireJson(item: Item, result: ConvertResult) {
  const pre = resultEl.querySelector<HTMLPreElement>('pre.json')!;
  const full = { fileSha256: result.fileSha256, ...item.outcome, skipped: result.skipped };
  let view: 'invoice' | 'full' = item.invoice ? 'invoice' : 'full';
  const data = () => (view === 'invoice' ? item.invoice : full);
  const show = () => {
    pre.innerHTML = highlight(JSON.stringify(data(), shortenForDisplay, 2));
  };
  show();
  resultEl.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => {
    b.addEventListener('click', () => {
      view = b.dataset.view as typeof view;
      resultEl.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((x) => {
        x.setAttribute('aria-pressed', String(x === b));
      });
      show();
    });
  });
  resultEl.querySelector<HTMLButtonElement>('[data-act="copy"]')!.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data(), null, 2));
      toast(t('toast.copied'));
    } catch {
      toast(t('toast.copyBlocked'));
    }
  });
  resultEl.querySelector<HTMLButtonElement>('[data-act="download"]')!.addEventListener('click', () => {
    const base = item.invoice ? item.invoice.id.replace(/[^\w.-]+/g, '_') : (current?.filename ?? 'result').replace(/\.[^.]+$/, '');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data(), null, 2)], { type: 'application/json' }));
    a.download = `${base}${view === 'full' ? '.result' : ''}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(t('toast.downloaded'));
  });
  for (const target of ['ubl', 'cii'] as const) {
    resultEl.querySelector<HTMLButtonElement>(`[data-act="write-${target}"]`)?.addEventListener('click', () => {
      const inv = item.invoice;
      if (!inv) return;
      try {
        const xml = target === 'ubl' ? toUbl(inv) : toCii(inv);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
        a.download = `${inv.id.replace(/[^\w.-]+/g, '_')}.${target}.xml`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        toast(t('toast.written', { format: target.toUpperCase() }));
      } catch (e) {
        if (!(e instanceof WriterError)) throw e;
        showNotice(t('notice.noWriteTitle', { format: target.toUpperCase() }), e.message);
      }
    });
  }
  resultEl.querySelector<HTMLButtonElement>('[data-act="journal"]')?.addEventListener('click', () => {
    const inv = item.invoice;
    if (!inv) return;
    try {
      const sie = toSie4([buildJournalEntry(inv, BAS_EXAMPLE_MAPPING)], { currency: inv.currency });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([sie.bytes as BlobPart], { type: 'application/octet-stream' }));
      a.download = `${inv.id.replace(/[^\w.-]+/g, '_')}.se`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast(t('toast.journal'));
    } catch (e) {
      if (!(e instanceof JournalError)) throw e;
      showNotice(t('notice.noJournalTitle'), e.message);
    }
  });
}

/** Long base64 attachments are shortened on screen only; Copy and Download keep them whole. */
function shortenForDisplay(this: unknown, key: string, value: unknown) {
  if (key === 'base64' && typeof value === 'string' && value.length > 240)
    return `${value.slice(0, 120)}${t('json.shortened', { length: value.length })}`;
  return value;
}

function highlight(json: string) {
  const escd = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escd.replace(
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
    (m, str, colon, lit) => {
      if (str) return colon ? `<span class="k">${str}</span>${colon}` : `<span class="s">${str}</span>`;
      if (lit) return `<span class="l">${m}</span>`;
      return `<span class="n">${m}</span>`;
    },
  );
}

// ---------------------------------------------------------------------------

function toast(text: string) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = text;
  document.body.append(t);
  setTimeout(() => t.remove(), 1800);
}

// Start-up runs last, so every table above is initialised.
/** The samples worth a one-click button; the rest stay in the menu. */
const CHIP_SAMPLES = [
  'peppol-bis3-invoice.xml',
  'xrechnung-ubl.xml',
  'facturx-en16931.pdf',
  'IT01234567890_FPR12.xml.p7m',
  'svefaktura-1.0-descriptors.xml',
];
const STRIP = ['peppol-bis3', 'xrechnung-ubl', 'xrechnung-cii', 'facturx', 'fatturapa', 'ksef', 'facturae', 'hr-cius'];

function renderStrip() {
  const byId = (id: string) => (FORMATS as readonly FormatDef[]).find((f) => f.id === id);
  const chips = STRIP.map(byId)
    .filter((f): f is FormatDef => f !== undefined)
    .map((f) => `<li class="fmt converts"><a href="docs/formats/${esc(f.id)}.html">${esc(shortName(f))}</a></li>`)
    .join('');
  const count = (FORMATS as readonly FormatDef[]).filter((f) => !f.id.endsWith('-unknown')).length;
  $('#format-strip').innerHTML = `${chips}<li class="fmt more"><a href="conformance.html">${esc(t('strip.all', { count }))}</a></li>`;
}

function fillChips() {
  const box = $('#sample-chips');
  box.innerHTML = CHIP_SAMPLES.map((f) => {
    const sample = SAMPLES.find((s) => s.file === f);
    return sample ? `<button type="button" class="chip" data-sample="${esc(f)}">${esc(t(sample.label))}</button>` : '';
  }).join('');
  for (const b of box.querySelectorAll<HTMLButtonElement>('[data-sample]'))
    b.addEventListener('click', () => void loadSample(b.dataset.sample!, false));
}

function fillSamples() {
  fillChips();
  const chosen = sampleSelect.value;
  while (sampleSelect.options.length > 1) sampleSelect.remove(1);
  for (const s of SAMPLES) sampleSelect.add(new Option(t(s.label), s.file));
  sampleSelect.value = chosen;
}
initLanguage();
initSwitcher();
fillSamples();
renderStrip();
onLanguageChange(() => {
  fillSamples();
  renderStrip();
  if (trustStatus) euStatus.textContent = trustStatus();
  updatePasteSize();
  if (current) render(shownIndex);
});
void loadSample(EXAMPLE.file, true);
