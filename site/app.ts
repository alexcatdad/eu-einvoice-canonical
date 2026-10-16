/** Browser front end: everything runs locally through the same `convert()` the library exports. */

import {
  applyModelLabels,
  BAS_EXAMPLE_MAPPING,
  buildJournalEntry,
  type CanonicalInvoice,
  type ConvertOutcome,
  type ConvertResult,
  convert,
  EU_COUNTRIES,
  FORMATS,
  type FormatDef,
  IMPLEMENTED_FAMILIES,
  JournalError,
  type Line,
  type LineRelation,
  type LineRole,
  type Party,
  type SignatureInfo,
  type TrustSnapshot,
  toSie4,
} from '../src/index.js';
import { ENGINES, loadEngine } from './model.js';

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
  { file: 'IT01234567890_FPR12.xml.p7m', label: 'FatturaPA, signed .p7m (Italy)' },
  { file: 'ksef-fa3.xml', label: 'KSeF FA(3) (Poland)' },
  { file: 'svefaktura-1.0-descriptors.xml', label: 'Svefaktura 1.0 with headings and a 10 % markup (Sweden)' },
];
const EXAMPLE = SAMPLES[0];

const COUNTRY_NAMES: Record<string, string> = {
  AT: 'Austria',
  BE: 'Belgium',
  BG: 'Bulgaria',
  HR: 'Croatia',
  CY: 'Cyprus',
  CZ: 'Czechia',
  DK: 'Denmark',
  EE: 'Estonia',
  FI: 'Finland',
  FR: 'France',
  DE: 'Germany',
  GR: 'Greece',
  HU: 'Hungary',
  IE: 'Ireland',
  IT: 'Italy',
  LV: 'Latvia',
  LT: 'Lithuania',
  LU: 'Luxembourg',
  MT: 'Malta',
  NL: 'Netherlands',
  PL: 'Poland',
  PT: 'Portugal',
  RO: 'Romania',
  SK: 'Slovakia',
  SI: 'Slovenia',
  ES: 'Spain',
  SE: 'Sweden',
};

const MEANS: Record<string, string> = {
  '1': 'Not defined',
  '10': 'Cash',
  '20': 'Cheque',
  '30': 'Credit transfer',
  '31': 'Debit transfer',
  '42': 'Payment to bank account',
  '48': 'Bank card',
  '49': 'Direct debit',
  '54': 'Credit card',
  '55': 'Debit card',
  '57': 'Standing agreement',
  '58': 'SEPA credit transfer',
  '59': 'SEPA direct debit',
  '68': 'Online payment service',
  '97': 'Clearing between partners',
  ZZZ: 'Mutually defined',
};

const ENVELOPE_LABEL: Record<string, string> = {
  'pdf-attachment': 'PDF attachment',
  'cms-p7m': 'CAdES signature (.p7m)',
  base64: 'base64 text',
  zip: 'ZIP archive',
  sbdh: 'Peppol SBDH',
  soap: 'SOAP envelope',
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
$<HTMLButtonElement>('#convert-pasted').addEventListener('click', () => {
  const text = pasted.value.trim();
  if (!text) {
    pasted.focus();
    return;
  }
  void run(new TextEncoder().encode(text), 'pasted.xml');
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
    if (!isExample) showNotice('The sample could not be loaded.', `${name}: ${(e as Error).message}. Reload the page and try again.`);
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
const euBox = $<HTMLInputElement>('#eu-trust');
const euStatus = $<HTMLElement>('#eu-trust-status');
euBox.addEventListener('change', async () => {
  if (!euBox.checked) {
    euTrust = undefined;
    euStatus.textContent = 'Off. Fetches the lists when switched on; the file is still never uploaded.';
  } else {
    euBox.disabled = true;
    euStatus.textContent = 'Loading the EU trusted lists…';
    try {
      const { loadSiteTrust } = await import('./trust.js');
      const t = await loadSiteTrust();
      euTrust = t.snapshot;
      const ok = t.snapshot.lists.filter((l) => l.status === 'loaded').length;
      euStatus.textContent = `${t.source === 'live' ? 'Live lists' : 'Snapshot published with this site'}, fetched ${t.snapshot.fetchedAt.slice(0, 10)} (${ok} of ${t.snapshot.lists.length} national lists).${t.note ? ` ${t.note}.` : ''}`;
    } catch (e) {
      euBox.checked = false;
      euStatus.textContent = (e as Error).message;
    }
    euBox.disabled = false;
  }
  if (lastInput) await run(lastInput.bytes, lastInput.filename, lastInput.isExample);
});

async function run(bytes: Uint8Array, filename: string, isExample = false) {
  lastInput = { bytes, filename, isExample };
  if (!isExample) resultEl.innerHTML = `<p class="file-meta">Reading ${esc(filename)}…</p>`;
  try {
    const result = await convert(bytes, filename, undefined, { relations: true, euTrust });
    const items = result.outcomes.flatMap((o, i): Item[] =>
      o.status === 'ok'
        ? o.invoices.map((inv) => ({ tab: `${inv.kind === 'creditNote' ? 'Credit note' : 'Invoice'} ${inv.id}`, outcome: o, invoice: inv }))
        : [{ tab: `Document ${i + 1}`, outcome: o }],
    );
    current = { result, filename, items, isExample };
    render(0);
    if (!isExample)
      resultEl.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  } catch (e) {
    showNotice('This file could not be read.', (e as Error).message);
  }
}

function showNotice(title: string, detail: string) {
  resultEl.innerHTML = `<div class="notice"><p><strong>${esc(title)}</strong></p><p>${esc(detail)}</p></div>`;
}

function render(index: number) {
  if (!current) return;
  shownIndex = index;
  const { result, filename, items, isExample } = current;
  const head = `<div class="result-head"><h2>${esc(filename)}${isExample ? ' <span class="example">(example: drop your own file above)</span>' : ''}</h2>
    <span class="file-meta">SHA-256 ${result.fileSha256.slice(0, 12)}…, ${items.length} document${items.length === 1 ? '' : 's'}</span></div>`;

  if (items.length === 0) {
    const reasons =
      result.skipped.map((s) => `<p>${s.name ? `${esc(s.name)}: ` : ''}${esc(s.reason)}</p>`).join('') ||
      '<p>The file holds no XML document.</p>';
    resultEl.innerHTML = `${head}<div class="notice"><p><strong>No invoice found in this file.</strong></p>${reasons}</div>`;
    return;
  }
  const tabs =
    items.length > 1
      ? `<div class="doc-tabs" role="tablist">${items.map((it, i) => `<button role="tab" type="button" data-tab="${i}" aria-selected="${i === index}">${esc(it.tab)}</button>`).join('')}</div>`
      : '';
  resultEl.innerHTML = `${head}${tabs}<div class="doc">${sheet(items[index], result)}${jsonPanel(items[index])}</div>`;
  resultEl.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => {
    b.addEventListener('click', () => render(Number(b.dataset.tab)));
  });
  wireJson(items[index], result);
  wireModel();
  if (!isExample) resultEl.querySelector('.stamp')?.classList.add('fresh');
}

// ---------------------------------------------------------------------------
// Line roles and relations
// ---------------------------------------------------------------------------

const ROLE_LABEL: Partial<Record<LineRole, string>> = {
  surcharge: 'markup',
  discount: 'discount',
  freight: 'freight',
  labour: 'labour',
  other: 'other',
};
const REVIEW = '<span class="review" title="Not proven by the invoice: check it by hand">review</span>';

/** Table rows for the lines: descriptors indented under their heading, adjustments shown beside the lines they apply to. */
function lineRows(inv: CanonicalInvoice, lines: Line[]): string {
  const roles = inv.lineRoles ?? {};
  const rels = inv.relations ?? [];
  const under = new Set(rels.filter((r) => r.type === 'heading').flatMap((r) => r.to));
  // Structural rules (no confidence) are certain; everything else short of 'proven' is a hint.
  const needsReview = (r: LineRelation) => r.method === 'model' || (r.confidence !== undefined && r.confidence !== 'proven');
  const rate = (r: LineRelation) => (r.rate !== undefined ? `${esc(r.rate)} % ` : '');
  return lines
    .map((l) => {
      const role = roles[l.id];
      const descriptor = role === 'heading' || role === 'description';
      const notes: string[] = [];
      for (const r of rels) {
        if (r.type === 'heading') continue;
        const flag = needsReview(r) ? ` ${REVIEW}` : '';
        if (r.from === l.id) {
          const what = r.type === 'markup' ? `${rate(r)}markup` : r.type === 'discount' ? `${rate(r)}discount` : r.type.replace(/-/g, ' ');
          notes.push(`${esc(what)} on line ${r.to.map(esc).join(', ')}${flag}`);
        } else if (r.to.includes(l.id) && (r.type === 'markup' || r.type === 'discount')) {
          notes.push(`+ ${rate(r)}${r.type} in line ${esc(r.from)}${flag}`);
        }
      }
      const tag =
        role && ROLE_LABEL[role] && !notes.length
          ? `<span class="sub">${ROLE_LABEL[role]}${inv.source.derived.some((d) => d.field === `/lineRoles/${l.id}`) ? ` ${REVIEW}` : ''}</span>`
          : '';
      const cls = [
        descriptor ? 'descriptor' : '',
        role === 'description' || under.has(l.id) ? 'under' : '',
        role === 'surcharge' || role === 'discount' ? 'adjusts' : '',
      ]
        .filter(Boolean)
        .join(' ');
      const vat = l.vat
        ? `<span class="sub">VAT ${esc(l.vat.categoryCode)}${l.vat.rate !== undefined ? ` ${esc(l.vat.rate)} %` : ''}</span>`
        : '';
      return `<tr class="${cls}">
        <td class="hide-narrow">${esc(l.id)}</td>
        <td class="item">${esc(l.item.name || l.item.description || '(no name)')}${descriptor ? '' : vat}${notes.map((n) => `<span class="sub relation">${n}</span>`).join('')}${tag}</td>
        <td class="num">${descriptor ? '' : l.quantity !== undefined ? `${esc(l.quantity)} ${esc(l.unitText ?? l.unitCode ?? '')}` : '<span class="sub">not stated</span>'}</td>
        <td class="num hide-narrow">${!descriptor && l.price ? `${esc(l.price.net)}${l.price.baseQuantity && l.price.baseQuantity !== '1' ? `<span class="sub">per ${esc(l.price.baseQuantity)}</span>` : ''}` : ''}</td>
        <td class="num">${descriptor ? '' : esc(l.netAmount)}</td></tr>`;
    })
    .join('');
}

function labelControl(): string {
  return `<details class="model"><summary>Label lines with a language model (experimental)</summary>
    <p>Optional. A small model that runs in this tab names the kind of each line (freight, labour, discount) and may link headings to items. Its answers are always marked <em>review</em>. The model is downloaded on first use (about 1 GB for Qwen3 1.7B) and nothing is sent anywhere.</p>
    <label class="field"><span>Model</span><select id="model-engine">${ENGINES.map((e) => `<option value="${e.id}">${esc(e.label)}</option>`).join('')}</select></label>
    <button type="button" class="btn" id="model-run">Label lines</button> <span class="model-status" id="model-status" role="status"></span>
  </details>`;
}

function wireModel() {
  const run = document.querySelector<HTMLButtonElement>('#model-run');
  if (!run || !current) return;
  run.addEventListener('click', async () => {
    const status = $('#model-status');
    const spec = ENGINES.find((e) => e.id === $<HTMLSelectElement>('#model-engine').value)!;
    const inv = current?.items[shownIndex]?.invoice;
    if (!inv) return;
    run.disabled = true;
    try {
      const engine = await loadEngine(spec, (text) => {
        status.textContent = text;
      });
      status.textContent = 'Labelling…';
      await applyModelLabels(inv, engine.labeller);
      await engine.dispose();
      render(shownIndex);
    } catch (e) {
      status.textContent = (e as Error).message;
      run.disabled = false;
    }
  });
}

function stampFor(item: Item): { cls: string; title: string; note: string } {
  const o = item.outcome;
  const det = o.detection;
  const title = det.kind === 'invoice' ? det.format.name : det.kind === 'other-document' ? 'Not an invoice' : 'Unknown format';
  if (o.status === 'ok') {
    const n = item.invoice!.source.warnings.length;
    return { cls: n ? 'warn' : '', title, note: n ? `Converted, ${n} warning${n === 1 ? '' : 's'}` : 'Converted' };
  }
  if (o.status === 'unsupported')
    return { cls: 'warn', title, note: det.kind === 'invoice' ? 'Identified, no parser yet' : 'Not recognised' };
  if (o.status === 'not-an-invoice') return { cls: 'warn', title, note: det.kind === 'other-document' ? det.label.split(':')[0] : '' };
  return { cls: 'bad', title, note: 'Could not convert' };
}

function sheet(item: Item, result: ConvertResult): string {
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
      <div class="sheet-top"><div><h3 class="doc-title">${o.status === 'error' ? 'Not converted' : o.status === 'unsupported' ? 'Identified' : 'Not an invoice'}</h3></div>${stamp}</div>
      ${reason ? `<p class="reason">${esc(reason)}</p>` : ''}
      ${provenance(item)}
      ${penNotes(item, result)}
    </article>`;
  }

  const cur = inv.currency;
  const dates: [string, string | undefined][] = [
    ['Issued', inv.issueDate],
    ['Due', inv.dueDate],
    ['Period', inv.invoicePeriod ? `${inv.invoicePeriod.start ?? '…'} to ${inv.invoicePeriod.end ?? '…'}` : undefined],
    ['Delivered', inv.delivery?.actualDate],
    ['Buyer reference', inv.buyerReference],
    ['Order', inv.purchaseOrderRef],
  ];
  const t = inv.totals;
  const totals: [string, string | undefined, string?][] = [
    ['Lines', t.lineNetTotal],
    ['Allowances', t.allowanceTotal && `−${t.allowanceTotal}`],
    ['Charges', t.chargeTotal],
    ['Without VAT', t.taxExclusive],
    ...inv.vatBreakdown.map((v): [string, string] => [
      `VAT ${v.categoryCode}${v.rate !== undefined ? ` ${v.rate} %` : ''} on ${v.taxableAmount}`,
      v.taxAmount,
    ]),
    ['With VAT', t.taxInclusive],
    ['Withheld', t.withholdingTotal && `−${t.withholdingTotal}`],
    ['Prepaid', t.prepaid && `−${t.prepaid}`],
    ['Rounding', t.rounding],
  ];
  const shown = inv.lines.slice(0, MAX_LINES);
  const pay = inv.payments[0];

  return `<article class="sheet">
    <div class="sheet-top">
      <div>
        <h3 class="doc-title">${inv.kind === 'creditNote' ? 'Credit note' : 'Invoice'}</h3>
        <p class="doc-number">${esc(inv.id)} <span class="label">type ${esc(inv.typeCode)}${inv.selfBilled ? ', self-billed' : ''}</span></p>
      </div>
      ${stamp}
    </div>
    <dl class="dates">${dates
      .filter(([, v]) => v)
      .map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v!)}</dd></div>`)
      .join('')}</dl>
    <div class="parties">${party('From', inv.seller)}${party('To', inv.buyer)}</div>
    ${
      shown.length
        ? `<table class="lines">
      <thead><tr><th scope="col" class="hide-narrow">#</th><th scope="col">Item</th><th scope="col" class="num">Qty</th><th scope="col" class="num hide-narrow">Price</th><th scope="col" class="num">Net</th></tr></thead>
      <tbody>${lineRows(inv, shown)}</tbody>
    </table>${inv.lines.length > MAX_LINES ? `<p class="more-lines">${inv.lines.length - MAX_LINES} more lines are in the JSON.</p>` : ''}`
        : '<p class="more-lines">This document has no lines.</p>'
    }
    ${inv.lines.length ? labelControl() : ''}
    <div class="sums">
      <div class="payment">${
        pay
          ? `<span class="label">Payment</span>
        <p>${esc(MEANS[pay.meansCode] ?? `Code ${pay.meansCode}`)}${pay.meansText ? ` (${esc(pay.meansText)})` : ''}</p>
        ${pay.creditTransfers.map((c) => `<p>${esc(c.accountId)}${c.serviceProviderId ? `, ${esc(c.serviceProviderId)}` : ''}</p>`).join('')}
        ${pay.remittanceInformation ? `<p>Reference ${esc(pay.remittanceInformation)}</p>` : ''}`
          : ''
      }
        ${inv.paymentTerms ? `<span class="label" style="margin-top:.5rem">Terms</span><p>${esc(inv.paymentTerms)}</p>` : ''}
      </div>
      <dl class="totals">
        ${totals
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v!)}</dd></div>`)
          .join('')}
        <div class="grand"><dt>Amount due</dt><dd>${esc(t.payable)} ${esc(cur)}</dd></div>
      </dl>
    </div>
    ${provenance(item)}
    ${penNotes(item, result)}
  </article>`;
}

function party(label: string, p: Party): string {
  const a = p.address;
  const place = a ? [[a.postalCode, a.city].filter(Boolean).join(' '), a.countryCode].filter(Boolean).join(', ') : '';
  const ids = [
    p.vatId && `VAT ${p.vatId}`,
    p.legalRegistrationId && `Reg. ${p.legalRegistrationId.value}`,
    p.endpoint && `Address ${p.endpoint.value}`,
  ].filter(Boolean);
  return `<div class="party"><span class="label">${label}</span>
    <p class="name">${esc(p.name ?? p.tradingName ?? 'Name not stated')}</p>
    ${a?.line1 ? `<p>${esc(a.line1)}</p>` : ''}${a?.line2 ? `<p>${esc(a.line2)}</p>` : ''}${place ? `<p>${esc(place)}</p>` : ''}
    ${ids.length ? `<p class="ids">${ids.map((i) => esc(i!)).join('<br>')}</p>` : ''}
  </div>`;
}

function euNote(s: SignatureInfo): string {
  const e = s.euTrust;
  if (!e) return '';
  const stale = e.snapshot.stale ? `; trusted lists older than their next update (${e.snapshot.nextUpdate?.slice(0, 10)})` : '';
  if (e.qualified) return `, signer chains to a qualified service (${e.service?.name}, ${e.service?.territory})${stale}`;
  return `, ${e.reason ?? 'not a qualified signer'}${stale}`;
}

function provenance(item: Item): string {
  const o = item.outcome;
  const rows: [string, string][] = [];
  if (o.detection.kind === 'invoice') {
    const d = o.detection.details;
    const v = [d.version && `version ${d.version}`, d.profile && `profile ${d.profile}`].filter(Boolean).join(', ');
    rows.push(['Format', `${o.detection.format.name}${v ? `, ${v}` : ''}`]);
  }
  const env = o.payload.envelope.map((s) => ENVELOPE_LABEL[s.kind]).filter(Boolean);
  if (env.length) rows.push(['Unwrapped from', env.join(', then ')]);
  rows.push(['Encoding', o.payload.encoding]);
  if (o.payload.signatures.length)
    rows.push([
      'Signatures',
      o.payload.signatures
        .map(
          (s) =>
            `${s.type}${s.signer ? ` (${s.signer})` : ''}${s.verified === undefined ? ', not verified' : s.verified ? ', verified' : ', INVALID'}${euNote(s)}`,
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
        'Check these',
        inv.source.warnings.map((w) => ({ code: w.code, message: w.message })),
      ),
    );
  if (inv?.source.derived.length)
    blocks.push(
      block(
        'Filled in by the converter',
        inv.source.derived.map((d) => ({ code: d.field, message: d.rule })),
        true,
      ),
    );
  if (result.skipped.length)
    blocks.push(
      block(
        'Skipped in this file',
        result.skipped.map((s) => ({ code: s.name, message: s.reason })),
        true,
      ),
    );
  return blocks.length ? `<div class="pen">${blocks.join('')}</div>` : '';
}

function jsonPanel(item: Item): string {
  const views = item.invoice
    ? `<button type="button" data-view="invoice" aria-pressed="true">Canonical invoice</button><button type="button" data-view="full" aria-pressed="false">Full result</button>`
    : `<button type="button" data-view="full" aria-pressed="true">Detection result</button>`;
  return `<section class="json-panel" aria-label="JSON">
    <div class="json-bar"><div class="views">${views}</div>
      <div class="actions"><button type="button" class="btn quiet" data-act="copy">Copy JSON</button><button type="button" class="btn" data-act="download">Download JSON</button>${item.invoice ? '<button type="button" class="btn quiet" data-act="journal">Download journal entry</button>' : ''}</div></div>
    ${item.invoice ? '<p class="journal-note">The journal entry is a SIE 4 file (type 4I) booked with an <strong>example</strong> mapping onto the Swedish BAS chart, in the invoice currency. It shows the shape of the export; map your own accounts with the library or the <code>einvoice export</code> command.</p>' : ''}
    <pre class="json" tabindex="0" aria-label="JSON output"></pre>
  </section>`;
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
      toast('JSON copied');
    } catch {
      toast('Copying is blocked here; use Download JSON');
    }
  });
  resultEl.querySelector<HTMLButtonElement>('[data-act="download"]')!.addEventListener('click', () => {
    const base = item.invoice ? item.invoice.id.replace(/[^\w.-]+/g, '_') : (current?.filename ?? 'result').replace(/\.[^.]+$/, '');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data(), null, 2)], { type: 'application/json' }));
    a.download = `${base}${view === 'full' ? '.result' : ''}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('JSON downloaded');
  });
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
      toast('Journal entry downloaded (example mapping)');
    } catch (e) {
      if (!(e instanceof JournalError)) throw e;
      showNotice('No journal entry for this invoice.', e.message);
    }
  });
}

/** Long base64 attachments are shortened on screen only; Copy and Download keep them whole. */
function shortenForDisplay(this: unknown, key: string, value: unknown) {
  if (key === 'base64' && typeof value === 'string' && value.length > 240)
    return `${value.slice(0, 120)}… (${value.length} characters, kept whole in the download)`;
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
// Coverage grid, generated from the format registry
// ---------------------------------------------------------------------------

function renderCoverage() {
  const implemented = new Set<string>(IMPLEMENTED_FAMILIES);
  const national = (FORMATS as readonly FormatDef[]).filter((f) => !f.countries.includes('EU'));
  const list = $<HTMLOListElement>('#countries');
  list.innerHTML = [...EU_COUNTRIES]
    .sort((a, b) => COUNTRY_NAMES[a].localeCompare(COUNTRY_NAMES[b]))
    .map((cc) => {
      const formats = national.filter((f) => f.countries.includes(cc));
      const chips = formats.length
        ? formats
            .map((f) => {
              const ok = implemented.has(f.family);
              return `<li class="fmt ${ok ? 'converts' : 'identifies'}" title="${esc(f.notes)}">${esc(shortName(f))}<span class="visually-hidden">${ok ? ', converted' : ', identified only'}</span></li>`;
            })
            .join('')
        : '<li class="fmt converts">Peppol BIS 3</li>';
      return `<li class="country"><h3><span class="cc">${cc}</span>${esc(COUNTRY_NAMES[cc])}</h3><ul>${chips}</ul></li>`;
    })
    .join('');
}

/** Short chip labels; anything not listed falls back to the registry name without its parenthesis. */
const SHORT_NAMES: Record<string, string> = {
  'xrechnung-ubl': 'XRechnung UBL',
  'xrechnung-cii': 'XRechnung CII',
  'nlcius-ubl': 'NLCIUS UBL',
  'nlcius-cii': 'NLCIUS CII',
  'cius-ro': 'CIUS-RO',
  'cius-pt': 'CIUS-PT',
  'hr-cius': 'HR-CIUS',
  'fr-ctc-ubl': 'France CTC UBL',
  'fr-ctc-cii': 'France CTC CII',
  'oioubl-3': 'OIOUBL 3',
  'oioubl-2': 'OIOUBL 2',
  'pl-pef': 'PEF',
  ksef: 'KSeF',
  'ubl-be': 'UBL.BE',
  facturx: 'Factur-X / ZUGFeRD 2',
  'zugferd-1': 'ZUGFeRD 1',
  fatturapa: 'FatturaPA',
  'fatturapa-semplificata': 'FatturaPA simplified',
  facturae: 'Facturae',
  isdoc: 'ISDOC',
  ebinterface: 'ebInterface',
  finvoice: 'Finvoice',
  teappsxml: 'TEAPPSXML',
  'e-arve': 'e-arve',
  'eslog-2': 'eSLOG 2.0',
  'eslog-1': 'eSLOG 1.6',
  'svefaktura-1': 'Svefaktura 1.0',
  'gr-mydata': 'myDATA',
};

function shortName(f: FormatDef) {
  return SHORT_NAMES[f.id] ?? f.name.replace(/\s*\(.*?\)\s*/g, ' ').trim();
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

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

// Start-up runs last, so every table above is initialised.
for (const s of SAMPLES) sampleSelect.add(new Option(s.label, s.file));
renderCoverage();
void loadSample(EXAMPLE.file, true);
