import type { CanonicalInvoice } from '../canonical.js';
import { safeLang } from './labels.js';
import { type Block, buildModel } from './model.js';

export interface RenderHtmlOptions {
  /** BCP 47 language tag for labels and the `lang` attribute. Labels exist for `en`, `de` and `fr`; other languages use English labels. */
  lang?: 'en' | 'de' | 'fr' | (string & {});
  /** `true` (default): a complete HTML document. `false`: just the `<article>` with its `<style>`, to embed in another page. */
  standalone?: boolean;
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

/**
 * Escapes text for HTML element content and quoted attribute values. Control characters (other than tab and
 * newline) are dropped, since they have no use in an invoice and some browsers treat them oddly.
 */
export function escapeHtml(text: string): string {
  let out = '';
  for (const ch of String(text)) {
    const cp = ch.codePointAt(0)!;
    if ((cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) || cp === 0x7f) continue;
    out += ESCAPES[ch] ?? ch;
  }
  return out;
}

const cell = (text: string) => escapeHtml(text).replace(/\n/g, '<br>');

const CSS = `
.einvoice{font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1b1b1f;background:#fff;max-width:56rem;margin:0 auto;padding:1.5rem;overflow-wrap:anywhere}
.einvoice h1{font-size:1.6rem;margin:0}
.einvoice h2{font-size:1.05rem;margin:1.6rem 0 .4rem;border-bottom:2px solid #1b1b1f;padding-bottom:.15rem}
.einvoice .sub{color:#4a4a55;margin:.2rem 0 0}
.einvoice .parties{display:grid;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr));gap:0 1.5rem}
.einvoice dl{margin:0;display:grid;grid-template-columns:minmax(8rem,12rem) 1fr;gap:.15rem .75rem}
.einvoice dt{color:#4a4a55}
.einvoice dd{margin:0}
.einvoice table{width:100%;border-collapse:collapse}
.einvoice th,.einvoice td{padding:.3rem .5rem;border-bottom:1px solid #c9c9d1;text-align:left;vertical-align:top}
.einvoice th{background:#f0f0f4}
.einvoice .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.einvoice tr{break-inside:avoid}
.einvoice .totals{margin-left:auto;max-width:28rem}
.einvoice .totals .due{font-weight:700;font-size:1.1rem}
.einvoice ul{margin:0;padding-left:1.2rem}
@media (max-width:40rem){.einvoice dl{grid-template-columns:1fr}.einvoice dt{margin-top:.4rem}}
@media print{.einvoice{max-width:none;padding:0;font-size:10pt}.einvoice h2{break-after:avoid}@page{size:A4;margin:15mm}}
`.replace(/\n/g, '');

function renderBlock(b: Block, i: number): string {
  const id = `h${i}`;
  const head = `<h2 id="${id}">${escapeHtml(b.heading)}</h2>`;
  switch (b.kind) {
    case 'kv':
    case 'totals': {
      const dl = `<dl>${b.rows.map(([k, v], n) => `<dt>${escapeHtml(k)}</dt><dd${b.kind === 'totals' && n === b.rows.length - 1 ? ' class="due"' : ''}>${cell(v)}</dd>`).join('')}</dl>`;
      return `<section aria-labelledby="${id}"${b.kind === 'totals' ? ' class="totals"' : ''}>${head}${dl}</section>`;
    }
    case 'table': {
      const cols = b.columns;
      const thead = `<tr>${cols.map((c) => `<th scope="col"${c.align === 'right' ? ' class="num"' : ''}>${escapeHtml(c.label)}</th>`).join('')}</tr>`;
      const tbody = b.rows
        .map((r) => `<tr>${r.map((v, n) => `<td${cols[n]?.align === 'right' ? ' class="num"' : ''}>${cell(v)}</td>`).join('')}</tr>`)
        .join('');
      return `<section aria-labelledby="${id}">${head}<table><thead>${thead}</thead><tbody>${tbody}</tbody></table></section>`;
    }
    case 'list':
      return `<section aria-labelledby="${id}">${head}<ul>${b.items.map((s) => `<li>${cell(s)}</li>`).join('')}</ul></section>`;
  }
}

/**
 * Renders an invoice as a self-contained, print-friendly HTML page: inline CSS, no scripts, no external
 * resources, no links (external attachment URIs are shown as text). Every value is escaped, because the
 * invoice is untrusted input. The standalone page also carries a Content-Security-Policy that forbids
 * everything but its own inline style.
 */
export function renderHtml(invoice: CanonicalInvoice, options: RenderHtmlOptions = {}): string {
  const lang = safeLang(options.lang);
  const model = buildModel(invoice, lang);
  const parties = model.blocks.filter((b) => b.kind === 'kv' && b.half);
  const rest = model.blocks.filter((b) => !(b.kind === 'kv' && b.half));
  let n = 0;
  const partyHtml = parties.length ? `<div class="parties">${parties.map((b) => renderBlock(b, n++)).join('')}</div>` : '';
  const restHtml = rest.map((b) => renderBlock(b, n++)).join('');
  const article =
    `<style>${CSS}</style><article class="einvoice" lang="${lang}">` +
    `<header><h1>${escapeHtml(model.title)}</h1><p class="sub">${escapeHtml(model.subtitle)}</p></header>` +
    `${partyHtml}${restHtml}</article>`;
  if (options.standalone === false) return article;
  return (
    `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${escapeHtml(model.title)}</title></head><body><main>${article}</main></body></html>\n`
  );
}
