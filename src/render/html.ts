import type { CanonicalInvoice } from '../canonical.js';
import type { RenderLanguage } from './labels.js';
import {
  type AdjustmentView,
  buildInvoiceView,
  type Column,
  type Field,
  type InvoiceView,
  type Para,
  type PartyView,
  type TotalKind,
  type Value,
} from './model.js';
import { INVOICE_CSS, PAGE_CSS } from './style.js';

export interface RenderHtmlOptions {
  /**
   * BCP 47 language tag for labels, number and date formats, and the `lang` attribute. Labels exist for
   * `en`, `de`, `fr`, `it`, `es`, `nl`, `pl` and `ro`; other languages use English labels with their own
   * number and date formats (`en-GB`, `de-CH`...).
   */
  lang?: RenderLanguage | (string & {});
  /** `true` (default): a complete HTML document. `false`: just the `<article>` with its `<style>`, to embed in another page. */
  standalone?: boolean;
}

/**
 * Escapes text for HTML element content and quoted attribute values. Control characters (other than tab and
 * newline) are dropped, since they have no use in an invoice and some browsers treat them oddly.
 */
export function escapeHtml(text: string): string {
  let kept = '';
  for (const ch of String(text)) {
    const cp = ch.codePointAt(0)!;
    if ((cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) || cp === 0x7f) continue;
    kept += ch;
  }
  // A plain replace chain (ampersand first), so static analysis recognises it as an HTML sanitiser.
  return kept
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/`/g, '&#96;');
}

/*
 * The markup below is the same, element for element and attribute for attribute, as the React component in
 * src/react/ produces with renderToStaticMarkup; a test holds the two together. Attributes are written in
 * the order class, id, then the rest.
 */

type Attrs = [name: string, value: string | undefined][];

function el(tag: string, attrs: Attrs, ...children: string[]): string {
  let a = '';
  for (const [k, v] of attrs) if (v !== undefined) a += ` ${k}="${escapeHtml(v)}"`;
  return `<${tag}${a}>${children.join('')}</${tag}>`;
}

const txt = escapeHtml;
const brLines = (lines: string[]) => lines.map(txt).join('<br/>');

function paras(ps: Para[]): string {
  return ps
    .map((p) => (p.kind === 'p' ? el('p', [], brLines(p.lines)) : el('ul', [], ...p.items.map((i) => el('li', [], txt(i))))))
    .join('');
}

function value(v: Value): string {
  if (v.paras) return paras(v.paras);
  if (v.lines) return brLines(v.lines);
  if (v.iso)
    return el(
      'time',
      [
        ['dateTime', v.iso],
        ['title', v.title],
      ],
      txt(v.text),
    );
  if (v.code)
    return el(
      'span',
      [
        ['class', 'einvoice-code'],
        ['title', v.title],
      ],
      txt(v.text),
    );
  if (v.title) return el('span', [['title', v.title]], txt(v.text));
  return txt(v.text);
}

const fieldList = (cls: string, fs: Field[]) =>
  el('dl', [['class', cls]], ...fs.map((f) => el('div', [], el('dt', [], txt(f.label)), el('dd', [], value(f.value)))));

function section(id: string, key: string, heading: string, ...body: string[]): string {
  const hid = `${id}-${key}`;
  return el(
    'section',
    [
      ['class', `einvoice-section einvoice-${key}`],
      ['aria-labelledby', hid],
    ],
    el(
      'h2',
      [
        ['class', 'einvoice-h2'],
        ['id', hid],
      ],
      txt(heading),
    ),
    ...body,
  );
}

const numClass = (c: Column | undefined) => (c?.align === 'right' ? 'einvoice-num' : undefined);

function table(columns: Column[], rows: string[][]): string {
  return el(
    'table',
    [['class', 'einvoice-table']],
    el(
      'thead',
      [],
      el(
        'tr',
        [],
        ...columns.map((c) =>
          el(
            'th',
            [
              ['class', numClass(c)],
              ['scope', 'col'],
            ],
            txt(c.label),
          ),
        ),
      ),
    ),
    el('tbody', [], ...rows.map((r) => el('tr', [], ...r.map((cell, i) => el('td', [['class', numClass(columns[i])]], cell))))),
  );
}

function header(v: InvoiceView, id: string): string {
  return el(
    'header',
    [['class', 'einvoice-header']],
    el(
      'div',
      [['class', 'einvoice-headline']],
      v.credit ? el('p', [['class', 'einvoice-badge']], txt(v.docLabel)) : '',
      el(
        'h1',
        [
          ['class', 'einvoice-title'],
          ['id', `${id}-title`],
        ],
        txt(v.title),
      ),
      v.meta.length ? fieldList('einvoice-meta', v.meta) : '',
    ),
    el(
      'dl',
      [['class', 'einvoice-facts']],
      ...v.facts.map((f) => el('div', [['class', 'einvoice-fact']], el('dt', [], txt(f.label)), el('dd', [], value(f.value)))),
      el('div', [['class', 'einvoice-due']], el('dt', [], txt(v.due.label)), el('dd', [], value(v.due.value))),
    ),
  );
}

function partyHtml(p: PartyView, id: string): string {
  const hid = `${id}-${p.role}`;
  return el(
    'section',
    [
      ['class', `einvoice-party einvoice-party--${p.role}`],
      ['aria-labelledby', hid],
    ],
    el(
      'h2',
      [
        ['class', 'einvoice-h2'],
        ['id', hid],
      ],
      txt(p.heading),
    ),
    p.name ? el('p', [['class', 'einvoice-party-name']], txt(p.name)) : '',
    p.tradingName ? el('p', [['class', 'einvoice-trading']], txt(p.tradingName)) : '',
    p.address.length ? el('address', [['class', 'einvoice-address']], brLines(p.address)) : '',
    p.fields.length ? fieldList('einvoice-fields', p.fields) : '',
  );
}

function linesHtml(v: InvoiceView, id: string): string {
  if (v.lines.empty) return section(id, 'lines', v.headings.lines, el('p', [['class', 'einvoice-empty']], txt(v.lines.empty)));
  const rows = v.lines.rows.map((l) => [
    txt(l.id),
    el('p', [['class', 'einvoice-item']], txt(l.name)) +
      paras(l.description) +
      (l.details.length ? el('p', [['class', 'einvoice-details']], txt(l.details.join(' · '))) : '') +
      (l.adjustments.length ? el('p', [['class', 'einvoice-adjustments']], brLines(l.adjustments)) : ''),
    value(l.quantity),
    txt(l.unitPrice) + (l.priceBasis ? `<br/>${el('span', [['class', 'einvoice-basis']], txt(l.priceBasis))}` : ''),
    value(l.vat),
    txt(l.net),
  ]);
  return section(id, 'lines', v.headings.lines, el('div', [['class', 'einvoice-scroll']], table(v.lines.columns, rows)));
}

function adjustmentsHtml(v: InvoiceView, id: string, key: 'allowances' | 'charges', items: AdjustmentView[]): string {
  if (items.length === 0) return '';
  return section(
    id,
    key,
    v.headings[key],
    table(
      v.adjustmentColumns,
      items.map((a) => [txt(a.reason), value(a.vat), txt(a.amount)]),
    ),
  );
}

function vatHtml(v: InvoiceView, id: string): string {
  if (v.vat.rows.length === 0) return '';
  const rows = v.vat.rows.map((r) =>
    [value(r.category), txt(r.rate), txt(r.taxable), txt(r.tax), txt(r.exemption)].slice(0, v.vat.columns.length),
  );
  return section(id, 'vat', v.headings.vat, table(v.vat.columns, rows));
}

const totalClass = (k: TotalKind) => (k === 'normal' ? 'einvoice-total' : `einvoice-total einvoice-total--${k}`);

function totalsHtml(v: InvoiceView, id: string): string {
  return section(
    id,
    'totals',
    v.headings.totals,
    el(
      'dl',
      [['class', 'einvoice-totals-list']],
      ...v.totals.map((r) => el('div', [['class', totalClass(r.kind)]], el('dt', [], txt(r.label)), el('dd', [], txt(r.value)))),
    ),
  );
}

function paymentHtml(v: InvoiceView, id: string): string {
  const { terms, methods } = v.payment;
  if (!terms.length && !methods.length && !v.schedule.rows.length) return '';
  return section(
    id,
    'payment',
    v.headings.payment,
    ...methods.map((m) =>
      el(
        'div',
        [['class', 'einvoice-method']],
        el('h3', [['class', 'einvoice-h3']], txt(m.heading)),
        m.fields.length ? fieldList('einvoice-fields', m.fields) : '',
      ),
    ),
    terms.length ? el('div', [['class', 'einvoice-terms']], el('h3', [['class', 'einvoice-h3']], txt(v.headings.terms)), paras(terms)) : '',
    v.schedule.rows.length
      ? el('h3', [['class', 'einvoice-h3']], txt(v.headings.schedule)) +
          table(
            v.schedule.columns,
            v.schedule.rows.map((s) => [value(s.due), txt(s.amount), txt(s.description)]),
          )
      : '',
  );
}

function notesHtml(v: InvoiceView, id: string): string {
  if (v.notes.length === 0) return '';
  return section(
    id,
    'notes',
    v.headings.notes,
    ...v.notes.map((n) =>
      el(
        'div',
        [['class', 'einvoice-note']],
        n.subject ? el('p', [['class', 'einvoice-note-subject']], txt(n.subject)) : '',
        paras(n.paras),
      ),
    ),
  );
}

function attachmentsHtml(v: InvoiceView, id: string): string {
  if (v.attachments.length === 0) return '';
  return section(
    id,
    'attachments',
    v.headings.attachments,
    el('ul', [['class', 'einvoice-list']], ...v.attachments.map((a) => el('li', [], txt(a)))),
  );
}

/** The `<article>` for a view, without the stylesheet. `id` prefixes every element id. */
export function articleHtml(v: InvoiceView, id = 'einvoice'): string {
  return el(
    'article',
    [
      ['class', v.credit ? 'einvoice einvoice--credit' : 'einvoice'],
      ['lang', v.lang],
      ['aria-labelledby', `${id}-title`],
    ],
    header(v, id),
    el('div', [['class', 'einvoice-parties']], ...v.parties.map((p) => partyHtml(p, id))),
    v.references.length ? section(id, 'references', v.headings.references, fieldList('einvoice-fields', v.references)) : '',
    linesHtml(v, id),
    adjustmentsHtml(v, id, 'allowances', v.allowances),
    adjustmentsHtml(v, id, 'charges', v.charges),
    vatHtml(v, id),
    totalsHtml(v, id),
    paymentHtml(v, id),
    notesHtml(v, id),
    attachmentsHtml(v, id),
  );
}

const minifiedCss = INVOICE_CSS.replace(/\n\s*/g, '').replace(/\s*([{}:;,>])\s*/g, '$1');

/**
 * Renders an invoice as a self-contained, print-friendly HTML page: inline CSS, no scripts, no external
 * resources, no links (external attachment URIs are shown as text). Every value is escaped, because the
 * invoice is untrusted input. The standalone page also carries a Content-Security-Policy that forbids
 * everything but its own inline style.
 */
export function renderHtml(invoice: CanonicalInvoice, options: RenderHtmlOptions = {}): string {
  const view = buildInvoiceView(invoice, options.lang);
  const article = `<style>${minifiedCss}</style>${articleHtml(view)}`;
  if (options.standalone === false) return article;
  return (
    `<!doctype html><html lang="${view.lang}"><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${PAGE_CSS}</style>` +
    `<title>${escapeHtml(view.title)}</title></head><body><main>${article}</main></body></html>\n`
  );
}
