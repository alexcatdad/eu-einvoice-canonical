/** Browser front end: everything runs locally through the same `convert()` the library exports. */
import { convert, type CanonicalInvoice, type ConvertOutcome, type ConvertResult } from '../src/index.js';

const SAMPLES: { file: string; label: string }[] = [
  { file: 'peppol-bis3-invoice.xml', label: 'Peppol BIS 3 invoice (Sweden, Bankgiro)' },
  { file: 'peppol-bis3-creditnote.xml', label: 'Peppol BIS 3 credit note' },
  { file: 'xrechnung-ubl.xml', label: 'XRechnung 3.0, UBL (Germany)' },
  { file: 'xrechnung-cii.xml', label: 'XRechnung 3.0, CII (Germany)' },
  { file: 'facturx-en16931.pdf', label: 'Factur-X PDF with embedded XML' },
  { file: 'facturx-basic-creditnote.xml', label: 'Factur-X BASIC credit note (France)' },
  { file: 'svefaktura-1.0.xml', label: 'Svefaktura 1.0, ISO-8859-1 (Sweden)' },
  { file: 'anaf-download.zip', label: 'RO e-Factura ZIP from ANAF (Romania)' },
  { file: 'hr-cius.xml', label: 'HR-CIUS (Croatia)' },
  { file: 'IT01234567890_FPR12.xml.p7m', label: 'FatturaPA signed .p7m (Italy, detection only)' },
  { file: 'ksef-fa3.xml', label: 'KSeF FA(3) (Poland, detection only)' },
];

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const fileInput = $<HTMLInputElement>('#file');
const slot = $<HTMLLabelElement>('#slot');
const sampleSelect = $<HTMLSelectElement>('#sample');
const pasted = $<HTMLTextAreaElement>('#pasted');
const resultEl = $<HTMLElement>('#result');

for (const s of SAMPLES) sampleSelect.add(new Option(s.label, s.file));

fileInput.addEventListener('change', async () => {
  const f = fileInput.files?.[0];
  if (f) await run(new Uint8Array(await f.arrayBuffer()), f.name);
  fileInput.value = '';
});
sampleSelect.addEventListener('change', async () => {
  const name = sampleSelect.value;
  if (!name) return;
  try {
    const res = await fetch(`samples/${name}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await run(new Uint8Array(await res.arrayBuffer()), name);
  } catch (e) {
    showMessage('The sample could not be loaded.', `${name}: ${(e as Error).message}. Reload the page and try again.`);
  }
});
$<HTMLButtonElement>('#convert-pasted').addEventListener('click', () => {
  const text = pasted.value.trim();
  if (!text) { pasted.focus(); return; }
  void run(new TextEncoder().encode(text), 'pasted.xml');
});

// Drag and drop anywhere on the page; the slot shows where it lands.
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; slot.classList.add('dragging'); });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; slot.classList.remove('dragging'); } });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  slot.classList.remove('dragging');
  const f = e.dataTransfer?.files?.[0];
  if (f) await run(new Uint8Array(await f.arrayBuffer()), f.name);
});

// ---------------------------------------------------------------------------

interface Item {
  tab: string;
  outcome: ConvertOutcome;
  invoice?: CanonicalInvoice;
}

let current: { result: ConvertResult; filename: string; items: Item[] } | undefined;

async function run(bytes: Uint8Array, filename: string) {
  resultEl.hidden = false;
  resultEl.innerHTML = `<p class="privacy">Reading ${esc(filename)}…</p>`;
  try {
    const result = await convert(bytes, filename);
    const items: Item[] = result.outcomes.flatMap((o, i): Item[] => {
      if (o.status === 'ok') return o.invoices.map((inv) => ({ tab: `${inv.kind === 'creditNote' ? 'Credit note' : 'Invoice'} ${inv.id}`, outcome: o, invoice: inv }));
      return [{ tab: `Document ${i + 1}`, outcome: o }];
    });
    current = { result, filename, items };
    render(0);
  } catch (e) {
    showMessage('This file could not be read.', (e as Error).message);
  }
}

function showMessage(title: string, detail: string) {
  resultEl.hidden = false;
  resultEl.innerHTML = `<div class="message-box"><p><strong>${esc(title)}</strong></p><p>${esc(detail)}</p></div>`;
}

function render(index: number) {
  if (!current) return;
  const { result, filename, items } = current;
  const parts: string[] = [];
  parts.push(`<div class="result-head"><h2>${esc(filename)}</h2><span class="file-meta">SHA-256 ${result.fileSha256.slice(0, 16)}…, ${items.length} document${items.length === 1 ? '' : 's'}</span></div>`);

  if (items.length === 0) {
    parts.push(`<div class="message-box"><p><strong>No invoice found in this file.</strong></p>${result.skipped.map((s) => `<p>${s.name ? `${esc(s.name)}: ` : ''}${esc(s.reason)}</p>`).join('') || '<p>The file holds no XML document.</p>'}</div>`);
    resultEl.innerHTML = parts.join('');
    return;
  }
  if (items.length > 1) {
    parts.push(`<div class="doc-tabs" role="tablist">${items.map((it, i) => `<button role="tab" type="button" data-tab="${i}" aria-selected="${i === index}">${esc(it.tab)}</button>`).join('')}</div>`);
  }
  parts.push(renderItem(items[index], result));
  resultEl.innerHTML = parts.join('');

  resultEl.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => render(Number(b.dataset.tab))));
  wireSheet(items[index], result);
  resultEl.querySelector('.stamp')?.classList.add('fresh');
}

function renderItem(item: Item, result: ConvertResult): string {
  const o = item.outcome;
  const det = o.detection;
  const formatName = det.kind === 'invoice' ? det.format.name : det.kind === 'other-document' ? 'Not an invoice' : 'Unknown format';
  let stampClass = '';
  let stampNote = '';
  if (o.status === 'ok') {
    const n = item.invoice!.source.warnings.length;
    stampNote = n ? `Converted, ${n} warning${n === 1 ? '' : 's'}` : 'Converted';
    if (n) stampClass = 'warn';
  } else if (o.status === 'unsupported') { stampClass = 'warn'; stampNote = det.kind === 'invoice' ? 'Identified, no parser yet' : 'Not recognised'; }
  else if (o.status === 'not-an-invoice') { stampClass = 'warn'; stampNote = det.kind === 'other-document' ? det.label : ''; }
  else { stampClass = 'bad'; stampNote = 'Could not convert'; }

  const boxes: [string, string, string?][] = [];
  const inv = item.invoice;
  if (inv) {
    boxes.push(['Invoice number', inv.id], [inv.kind === 'creditNote' ? 'Credit note' : 'Invoice', `Type ${inv.typeCode}${inv.selfBilled ? ', self-billed' : ''}`]);
    boxes.push(['Issue date', inv.issueDate], ['Due date', inv.dueDate ?? 'Not stated']);
    boxes.push(['Seller', partyLine(inv.seller), 'wide'], ['Buyer', partyLine(inv.buyer), 'wide']);
    boxes.push(['Amount due', `${inv.totals.payable} ${inv.currency}`, 'amount']);
    boxes.push(['VAT', inv.totals.vatTotal !== undefined ? `${inv.totals.vatTotal} ${inv.currency}` : 'Not stated'], ['Lines', String(inv.lines.length)]);
  }
  if (det.kind === 'invoice') {
    const v = [det.details.version && `version ${det.details.version}`, det.details.profile && `profile ${det.details.profile}`].filter(Boolean).join(', ');
    if (v) boxes.push(['Format details', v, 'wide']);
  }
  const env = o.payload.envelope.map((s) => ENVELOPE_LABEL[s.kind] ?? s.kind).filter(Boolean);
  if (env.length) boxes.push(['Unwrapped from', env.join(', then '), 'wide']);
  if (o.payload.signatures.length) boxes.push(['Signatures', o.payload.signatures.map((s) => `${s.type}${s.signer ? ` (${s.signer})` : ''}, not verified`).join('; '), 'wide']);

  const notes: string[] = [];
  if (o.status === 'error') notes.push(list('Why it failed', [{ message: o.error }]));
  if (o.status === 'unsupported') notes.push(list('Status', [{ message: o.reason }]));
  if (inv?.source.warnings.length) notes.push(list('Warnings', inv.source.warnings.map((w) => ({ code: w.code, message: w.message }))));
  if (inv?.source.derived.length) notes.push(list('Values filled in by the converter', inv.source.derived.map((d) => ({ code: d.field, message: d.rule }))));
  if (result.skipped.length) notes.push(list('Skipped in this file', result.skipped.map((s) => ({ code: s.name, message: s.reason }))));

  const form = `<article class="form">
    <div class="stamp ${stampClass}">${esc(formatName)}${stampNote ? `<small>${esc(stampNote)}</small>` : ''}</div>
    ${boxes.length ? `<dl class="boxes">${boxes.map(([k, v, cls]) => `<div class="${cls === 'wide' || cls === 'amount' ? 'wide' : ''}"><dt>${esc(k)}</dt><dd class="${cls === 'amount' ? 'amount' : ''}">${esc(v)}</dd></div>`).join('')}</dl>` : ''}
    ${notes.length ? `<div class="notes">${notes.join('')}</div>` : ''}
  </article>`;

  const views = inv
    ? `<button type="button" data-view="invoice" aria-pressed="true">Canonical invoice</button><button type="button" data-view="full" aria-pressed="false">Full result</button>`
    : `<button type="button" data-view="full" aria-pressed="true">Detection result</button>`;
  const sheet = `<section class="sheet" aria-label="JSON">
    <div class="sheet-bar"><div class="views">${views}</div>
      <div class="actions"><button type="button" class="btn secondary" data-act="copy">Copy JSON</button><button type="button" class="btn" data-act="download">Download JSON</button></div></div>
    <pre class="json" tabindex="0"></pre>
  </section>`;
  return `<div class="doc">${form}${sheet}</div>`;
}

const ENVELOPE_LABEL: Record<string, string> = {
  'pdf-attachment': 'PDF attachment', 'cms-p7m': 'CAdES signature (.p7m)', base64: 'base64 text', zip: 'ZIP archive',
  sbdh: 'Peppol SBDH', soap: 'SOAP envelope', xml: '',
};

function partyLine(p: CanonicalInvoice['seller']) {
  return [p.name ?? p.tradingName ?? 'Name not stated', p.vatId && `VAT ${p.vatId}`, p.address?.countryCode].filter(Boolean).join(', ');
}

function list(title: string, rows: { code?: string; message: string }[]) {
  return `<div><h3>${esc(title)}</h3><ul>${rows.map((r) => `<li>${r.code ? `<span class="code">${esc(r.code)}</span> ` : ''}<span class="message">${esc(r.message)}</span></li>`).join('')}</ul></div>`;
}

function wireSheet(item: Item, result: ConvertResult) {
  const pre = resultEl.querySelector<HTMLPreElement>('pre.json')!;
  const full = { fileSha256: result.fileSha256, ...item.outcome, skipped: result.skipped };
  let view: 'invoice' | 'full' = item.invoice ? 'invoice' : 'full';
  const data = () => (view === 'invoice' ? item.invoice : full);
  const show = () => { pre.innerHTML = highlight(JSON.stringify(data(), truncateForDisplay, 2)); };
  show();
  resultEl.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => b.addEventListener('click', () => {
    view = b.dataset.view as typeof view;
    resultEl.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    show();
  }));
  resultEl.querySelector<HTMLButtonElement>('[data-act="copy"]')!.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(data(), null, 2)); toast('JSON copied'); } catch { toast('Copying is blocked here; use Download JSON'); }
  });
  resultEl.querySelector<HTMLButtonElement>('[data-act="download"]')!.addEventListener('click', () => {
    const base = item.invoice ? item.invoice.id.replace(/[^\w.-]+/g, '_') : (current?.filename ?? 'result').replace(/\.[^.]+$/, '');
    const blob = new Blob([JSON.stringify(data(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${base}${view === 'full' ? '.result' : ''}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('JSON downloaded');
  });
}

/** Long base64 attachments are shortened on screen only; Copy and Download keep them whole. */
function truncateForDisplay(this: unknown, key: string, value: unknown) {
  if (typeof value === 'string' && value.length > 240 && key === 'base64') return `${value.slice(0, 120)}… (${value.length} characters, kept whole in the download)`;
  return value;
}

function highlight(json: string) {
  const escd = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escd.replace(/("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, (m, str, colon, lit) => {
    if (str) return colon ? `<span class="k">${str}</span>${colon}` : `<span class="s">${str}</span>`;
    if (lit) return `<span class="l">${m}</span>`;
    return `<span class="n">${m}</span>`;
  });
}

function toast(text: string) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = text;
  document.body.append(t);
  setTimeout(() => t.remove(), 1800);
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
