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
import { currentLang, esc, initLanguage, initSwitcher, onLanguageChange, t } from './i18n.js';
import { ENGINES, loadEngine } from './model.js';

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

/** Country names come from the browser's own locale data, in the reader's language. */
function regionName(cc: string): string {
  try {
    return new Intl.DisplayNames([currentLang()], { type: 'region' }).of(cc) ?? cc;
  } catch {
    return cc;
  }
}

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
  if (!isExample) resultEl.innerHTML = `<p class="file-meta">${esc(t('result.reading', { name: filename }))}</p>`;
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
    render(0);
    if (!isExample)
      resultEl.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  } catch (e) {
    showNotice(t('notice.readFailedTitle'), (e as Error).message);
  }
}

function showNotice(title: string, detail: string) {
  resultEl.innerHTML = `<div class="notice"><p><strong>${esc(title)}</strong></p><p>${esc(detail)}</p></div>`;
}

function render(index: number) {
  if (!current) return;
  shownIndex = index;
  const { result, filename, items, isExample } = current;
  const head = `<div class="result-head"><h2>${esc(filename)}${isExample ? ` <span class="example">${esc(t('result.example'))}</span>` : ''}</h2>
    <span class="file-meta">${esc(t('result.meta', { hash: result.fileSha256.slice(0, 12), count: items.length }))}</span></div>`;

  if (items.length === 0) {
    const reasons =
      result.skipped.map((s) => `<p>${s.name ? `${esc(s.name)}: ` : ''}${esc(s.reason)}</p>`).join('') ||
      `<p>${esc(t('result.noXml'))}</p>`;
    resultEl.innerHTML = `${head}<div class="notice"><p><strong>${esc(t('result.noInvoice'))}</strong></p>${reasons}</div>`;
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
      const cls = [
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

function labelControl(): string {
  return `<details class="model"><summary>${esc(t('model.summary'))}</summary>
    <p>${t('model.intro')}</p>
    <label class="field"><span>${esc(t('model.engine'))}</span><select id="model-engine">${ENGINES.map((e) => `<option value="${e.id}">${esc(e.label)}</option>`).join('')}</select></label>
    <button type="button" class="btn" id="model-run">${esc(t('model.run'))}</button> <span class="model-status" id="model-status" role="status"></span>
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
      status.textContent = t('model.labelling');
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
  const title = det.kind === 'invoice' ? det.format.name : t(det.kind === 'other-document' ? 'stamp.notInvoice' : 'stamp.unknown');
  if (o.status === 'ok') {
    const n = item.invoice!.source.warnings.length;
    return { cls: n ? 'warn' : '', title, note: n ? t('stamp.convertedWarnings', { count: n }) : t('stamp.converted') };
  }
  if (o.status === 'unsupported') return { cls: 'warn', title, note: t(det.kind === 'invoice' ? 'stamp.noParser' : 'stamp.notRecognised') };
  if (o.status === 'not-an-invoice') return { cls: 'warn', title, note: det.kind === 'other-document' ? det.label.split(':')[0] : '' };
  return { cls: 'bad', title, note: t('stamp.failed') };
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
      <div class="sheet-top"><div><h3 class="doc-title">${esc(t(o.status === 'error' ? 'doc.notConverted' : o.status === 'unsupported' ? 'doc.identified' : 'doc.notInvoice'))}</h3></div>${stamp}</div>
      ${reason ? `<p class="reason">${esc(reason)}</p>` : ''}
      ${provenance(item)}
      ${penNotes(item, result)}
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
  const shown = inv.lines.slice(0, MAX_LINES);
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
    ${
      shown.length
        ? `<table class="lines">
      <thead><tr><th scope="col" class="hide-narrow">#</th><th scope="col">${esc(t('line.item'))}</th><th scope="col" class="num">${esc(t('line.qty'))}</th><th scope="col" class="num hide-narrow">${esc(t('line.price'))}</th><th scope="col" class="num">${esc(t('line.net'))}</th></tr></thead>
      <tbody>${lineRows(inv, shown)}</tbody>
    </table>${inv.lines.length > MAX_LINES ? `<p class="more-lines">${esc(t('line.more', { count: inv.lines.length - MAX_LINES }))}</p>` : ''}`
        : `<p class="more-lines">${esc(t('line.none'))}</p>`
    }
    ${inv.lines.length ? labelControl() : ''}
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
    ${provenance(item)}
    ${penNotes(item, result)}
  </article>`;
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
  if (env.length) rows.push([t('prov.unwrapped'), env.join(' → ')]);
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
  return `<section class="json-panel" aria-label="${esc(t('json.panel'))}">
    <div class="json-bar"><div class="views">${views}</div>
      <div class="actions"><button type="button" class="btn quiet" data-act="copy">${esc(t('json.copy'))}</button><button type="button" class="btn" data-act="download">${esc(t('json.download'))}</button>${item.invoice ? `<button type="button" class="btn quiet" data-act="journal">${esc(t('json.journal'))}</button>` : ''}</div></div>
    ${item.invoice ? `<p class="journal-note">${t('json.journalNote')}</p>` : ''}
    <pre class="json" tabindex="0" aria-label="${esc(t('json.output'))}"></pre>
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
// Coverage grid, generated from the format registry
// ---------------------------------------------------------------------------

/** Countries outside the EU that the registry covers; the names come from the browser's locale data. */
const WORLD_COUNTRIES = ['AE', 'AU', 'JP', 'MY', 'NZ', 'OM', 'SA', 'SG'];

function renderCoverage() {
  const implemented = new Set<string>(IMPLEMENTED_FAMILIES);
  const chip = (f: FormatDef) => {
    const ok = implemented.has(f.family);
    return `<li class="fmt ${ok ? 'converts' : 'identifies'}" title="${esc(f.notes)}">${esc(shortName(f))}<span class="visually-hidden">${esc(t(ok ? 'coverage.srConverted' : 'coverage.srIdentified'))}</span></li>`;
  };
  const eu = new Set<string>(EU_COUNTRIES);
  const world = (FORMATS as readonly FormatDef[]).filter((f) => f.countries.every((cc) => cc !== 'EU' && !eu.has(cc)));
  const byName = (a: string, b: string) => regionName(a).localeCompare(regionName(b), currentLang());
  $<HTMLOListElement>('#countries-world').innerHTML = [...WORLD_COUNTRIES]
    .sort(byName)
    .map((cc) => {
      const formats = world.filter((f) => f.countries.includes(cc));
      return `<li class="country"><h3><span class="cc">${cc}</span>${esc(regionName(cc))}</h3><ul>${formats.map(chip).join('')}</ul></li>`;
    })
    .join('');
  const national = (FORMATS as readonly FormatDef[]).filter((f) => !f.countries.includes('EU'));
  const list = $<HTMLOListElement>('#countries');
  list.innerHTML = [...EU_COUNTRIES]
    .sort(byName)
    .map((cc) => {
      const formats = national.filter((f) => f.countries.includes(cc));
      const chips = formats.length ? formats.map(chip).join('') : '<li class="fmt converts">Peppol BIS 3</li>';
      return `<li class="country"><h3><span class="cc">${cc}</span>${esc(regionName(cc))}</h3><ul>${chips}</ul></li>`;
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
  'peppol-pint': 'PINT',
  'pint-sg': 'PINT SG',
  'pint-aunz': 'PINT A-NZ',
  'pint-jp': 'PINT JP',
  'pint-my': 'PINT MY',
  'pint-ae': 'PINT AE',
  'pint-om': 'PINT OM',
  'pint-eu': 'PINT EU',
  'zatca-ubl': 'ZATCA UBL',
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

// Start-up runs last, so every table above is initialised.
function fillSamples() {
  const chosen = sampleSelect.value;
  while (sampleSelect.options.length > 1) sampleSelect.remove(1);
  for (const s of SAMPLES) sampleSelect.add(new Option(t(s.label), s.file));
  sampleSelect.value = chosen;
}
initLanguage();
initSwitcher();
fillSamples();
renderCoverage();
onLanguageChange(() => {
  fillSamples();
  renderCoverage();
  if (trustStatus) euStatus.textContent = trustStatus();
  if (current) render(shownIndex);
});
void loadSample(EXAMPLE.file, true);
