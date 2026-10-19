import type { PDFDocument, PDFFont, PDFPage } from 'pdf-lib';
import type { CanonicalInvoice } from '../index.js';
import { labelsFor, type RenderLanguage } from './labels.js';
import { buildInvoiceView, type Column, type Field, type InvoiceView, parasText, type Value, valueText } from './model.js';

export interface RenderPdfOptions {
  /** Language for labels, numbers and dates: `en`, `de`, `fr`, `it`, `es`, `nl`, `pl`, `ro`. Other languages use English labels. */
  lang?: RenderLanguage | (string & {});
}

export type Block =
  | { kind: 'kv'; heading: string; rows: [label: string, value: string][] }
  | { kind: 'totals'; heading: string; rows: [label: string, value: string][] }
  | { kind: 'table'; heading: string; columns: Column[]; rows: string[][] }
  | { kind: 'list'; heading: string; items: string[] };

/** VAT as the PDF shows it: the category code with the rate (`S 25%`), or with the category name when there is no rate. */
const vatText = (v: Value, category: string | undefined) => (category && v.text !== category ? `${category} ${v.text}` : v.text);

const kv = (fs: Field[]): [string, string][] => fs.map((f) => [f.label, valueText(f.value)]);

/** The view as the simple blocks the PDF writer draws: key/value lists, tables and bullet lists. @internal (exported for tests) */
export function pdfBlocks(v: InvoiceView, addressLabel: string): Block[] {
  const out: Block[] = [];
  for (const p of v.parties) {
    const head: [string, string][] = [];
    if (p.name) head.push([p.name, '']);
    const body = [p.tradingName, ...p.address].filter((s): s is string => !!s).join('\n');
    if (body) head.push([addressLabel, body]);
    out.push({ kind: 'kv', heading: p.heading, rows: head.concat(kv(p.fields)) });
  }
  if (v.references.length) out.push({ kind: 'kv', heading: v.headings.references, rows: kv(v.references) });
  if (v.lines.empty) out.push({ kind: 'list', heading: v.headings.lines, items: [v.lines.empty] });
  else
    out.push({
      kind: 'table',
      heading: v.headings.lines,
      columns: v.lines.columns,
      rows: v.lines.rows.map((l) => [
        l.id,
        [l.name, parasText(l.description), l.details.join(' · '), ...l.adjustments].filter(Boolean).join('\n'),
        l.quantity.text,
        l.priceBasis ? `${l.unitPrice}\n${l.priceBasis}` : l.unitPrice,
        vatText(l.vat, l.vatCategory),
        l.net,
      ]),
    });
  for (const key of ['allowances', 'charges'] as const) {
    if (v[key].length) {
      out.push({
        kind: 'table',
        heading: v.headings[key],
        columns: v.adjustmentColumns,
        rows: v[key].map((a) => [a.reason, vatText(a.vat, a.vatCategory), a.amount]),
      });
    }
  }
  if (v.vat.rows.length) {
    out.push({
      kind: 'table',
      heading: v.headings.vat,
      columns: v.vat.columns,
      rows: v.vat.rows.map((r) =>
        [`${r.category.text} (${r.category.title})`, r.rate, r.taxable, r.tax, r.exemption].slice(0, v.vat.columns.length),
      ),
    });
  }
  out.push({ kind: 'totals', heading: v.headings.totals, rows: v.totals.map((r) => [r.label, r.value]) });
  const pay: [string, string][] = [];
  for (const m of v.payment.methods) pay.push([m.heading, ''], ...kv(m.fields));
  if (v.payment.terms.length) pay.push([v.headings.terms, parasText(v.payment.terms)]);
  for (const s of v.schedule.rows)
    pay.push([v.headings.schedule, [s.due.text, s.amount && `${s.amount} ${v.currency}`, s.description].filter(Boolean).join(' – ')]);
  if (pay.length) out.push({ kind: 'kv', heading: v.headings.payment, rows: pay });
  if (v.notes.length)
    out.push({
      kind: 'list',
      heading: v.headings.notes,
      items: v.notes.map((n) => (n.subject ? `${n.subject}: ` : '') + parasText(n.paras)),
    });
  if (v.attachments.length) out.push({ kind: 'list', heading: v.headings.attachments, items: v.attachments });
  return out;
}

/** A4 in PDF points. */
export const PAGE = { width: 595.28, height: 841.89, margin: 40 } as const;

const BODY = 9;
const LEAD = 12;
// pdf-lib is loaded on first use (see renderPdf), so importing the library does not pull it in.
type Rgb = readonly [number, number, number];
const GREY: Rgb = [0.29, 0.29, 0.33];
const INK: Rgb = [0.1, 0.1, 0.12];
const RULE: Rgb = [0.78, 0.78, 0.82];
const HEAD_FILL: Rgb = [0.94, 0.94, 0.96];
const ACCENT: Rgb = [0.12, 0.31, 0.82];
const CREDIT: Rgb = [0.71, 0.14, 0.09];
let lib: typeof import('pdf-lib');
const rgb = (c: Rgb) => lib.rgb(c[0], c[1], c[2]);
const FOOTER_Y = 22;
const LABEL_WIDTH = 140;
const CELL_PAD = 3;
/** Rows shorter than this many lines are never split across pages. */
const KEEP_TOGETHER = 40;
/** Characters measured at once when breaking an over-long word. */
const WINDOW = 600;

/**
 * Only the characters of the standard fonts' WinAnsi encoding can be drawn. Anything else (Cyrillic,
 * Greek, CJK, most symbols...) becomes "?" rather than failing the whole document; the HTML rendering has
 * no such limit.
 */
function makeSanitizer(font: PDFFont): (text: string) => string {
  const supported = new Set(font.getCharacterSet());
  return (text) => {
    let out = '';
    for (const ch of String(text)) {
      const cp = ch.codePointAt(0)!;
      if (ch === '\n') out += ch;
      else if (cp < 0x20 || cp === 0x7f || cp === 0xa0 || cp === 0xad || cp === 0x202f || cp === 0x2009) out += ' ';
      else if (supported.has(cp)) out += ch;
      else out += fallback(ch, supported);
    }
    return out;
  };
}

const NEAREST: Record<string, string> = { ł: 'l', Ł: 'L', đ: 'd', Đ: 'D', ı: 'i', '\u2212': '-', '\u2010': '-', '\u2011': '-' };

/** A drawable stand-in for a character the font lacks: the letter without its accent (ș as s, ł as l), else "?". */
function fallback(ch: string, supported: Set<number>): string {
  const near = NEAREST[ch] ?? ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return near && near !== ch && [...near].every((c) => supported.has(c.codePointAt(0)!)) ? near : '?';
}

class Writer {
  readonly pages: PDFPage[] = [];
  page!: PDFPage;
  y = 0;
  readonly clean: (t: string) => string;

  constructor(
    readonly doc: PDFDocument,
    readonly font: PDFFont,
    readonly bold: PDFFont,
  ) {
    this.clean = makeSanitizer(font);
    this.newPage();
  }

  get bottom() {
    return PAGE.margin + 14;
  }

  newPage() {
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.pages.push(this.page);
    this.y = PAGE.height - PAGE.margin;
  }

  /** Starts a new page unless `height` points still fit. Returns true when it did. */
  ensure(height: number): boolean {
    if (this.y - height >= this.bottom) return false;
    this.newPage();
    return true;
  }

  /** Splits text into lines no wider than `width`, honouring newlines and breaking words that are too long. */
  wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const para of this.clean(text).split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const attempt = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(attempt, size) <= width) {
          line = attempt;
          continue;
        }
        if (line) lines.push(line);
        line = '';
        // Break a word wider than the line. Measure only a bounded window per line (no glyph is narrower than
        // about a fifth of an em, so a line holds well under WINDOW of them) and walk forward by index, so
        // a multi-megabyte unbroken string costs time linear in its length.
        let pos = 0;
        for (;;) {
          const end = Math.min(word.length, pos + WINDOW);
          const head = word.slice(pos, end);
          if (end === word.length && font.widthOfTextAtSize(head, size) <= width) {
            line = head;
            break;
          }
          // Longest prefix that fits (at least one character, so a very narrow column still makes progress).
          let lo = 1;
          let hi = head.length;
          while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (font.widthOfTextAtSize(head.slice(0, mid), size) <= width) lo = mid;
            else hi = mid - 1;
          }
          lines.push(head.slice(0, lo));
          pos += lo;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  text(s: string, x: number, y: number, font: PDFFont, size: number, color: Rgb = INK, align: 'left' | 'right' = 'left', width = 0) {
    if (!s) return;
    const dx = align === 'right' ? width - font.widthOfTextAtSize(s, size) : 0;
    this.page.drawText(s, { x: x + dx, y, font, size, color: rgb(color) });
  }

  heading(s: string) {
    const lines = this.wrap(s, this.bold, 11, PAGE.width - 2 * PAGE.margin);
    // Keep the heading with at least the first two rows (or a table header and a row) that follow it.
    this.ensure(10 + lines.length * 15 + 5 + 2 * LEAD + 8);
    this.y -= 10;
    for (const l of lines) {
      this.text(l, PAGE.margin, this.y - 11, this.bold, 11);
      this.y -= 15;
    }
    this.page.drawLine({
      start: { x: PAGE.margin, y: this.y + 1 },
      end: { x: PAGE.width - PAGE.margin, y: this.y + 1 },
      thickness: 1,
      color: rgb(INK),
    });
    this.y -= 5;
  }

  keyValues(rows: [string, string][], emphasiseLast = false) {
    const valueX = PAGE.margin + LABEL_WIDTH;
    const valueWidth = PAGE.width - PAGE.margin - valueX;
    rows.forEach(([label, value], i) => {
      const last = emphasiseLast && i === rows.length - 1;
      const f = last ? this.bold : this.font;
      const labelLines = this.wrap(label, value ? this.font : this.bold, BODY, LABEL_WIDTH - 8);
      const valueLines = this.wrap(value, f, BODY, valueWidth);
      const n = Math.max(labelLines.length, valueLines.length);
      for (let k = 0; k < n; k++) {
        this.ensure(LEAD);
        this.text(labelLines[k] ?? '', PAGE.margin, this.y - BODY, value ? this.font : this.bold, BODY, value ? GREY : INK);
        this.text(valueLines[k] ?? '', valueX, this.y - BODY, f, BODY);
        this.y -= LEAD;
      }
    });
  }

  table(columns: { label: string; align: 'left' | 'right' }[], rows: string[][]) {
    const total = PAGE.width - 2 * PAGE.margin;
    const weight = columns.map((c, i) => {
      let w = Math.max(6, c.label.length);
      for (const r of rows) w = Math.max(w, Math.min(40, (r[i] ?? '').length));
      return Math.min(40, w);
    });
    const sum = weight.reduce((a, b) => a + b, 0);
    const widths = weight.map((w) => (w / sum) * total);
    const xs = widths.map((_, i) => PAGE.margin + widths.slice(0, i).reduce((a, b) => a + b, 0));

    const header = columns.map((c, i) => this.wrap(c.label, this.bold, BODY, widths[i]! - 2 * CELL_PAD));
    const drawHeader = () => {
      const n = Math.max(...header.map((h) => h.length));
      this.ensure(n * LEAD + 6);
      this.page.drawRectangle({
        x: PAGE.margin,
        y: this.y - n * LEAD - 4,
        width: total,
        height: n * LEAD + 4,
        color: rgb(HEAD_FILL),
      });
      for (let k = 0; k < n; k++) {
        columns.forEach((c, i) => {
          this.text(
            header[i]![k] ?? '',
            xs[i]! + CELL_PAD,
            this.y - BODY - 2 - k * LEAD,
            this.bold,
            BODY,
            INK,
            c.align,
            widths[i]! - 2 * CELL_PAD,
          );
        });
      }
      this.y -= n * LEAD + 4;
    };
    drawHeader();

    for (const row of rows) {
      const cells = columns.map((_, i) => this.wrap(row[i] ?? '', this.font, BODY, widths[i]! - 2 * CELL_PAD));
      const n = Math.max(...cells.map((c) => c.length));
      if (n <= KEEP_TOGETHER && this.ensure(n * LEAD + 4)) drawHeader();
      let done = 0;
      while (done < n) {
        let fit = Math.floor((this.y - this.bottom - 4) / LEAD);
        if (fit < 1) {
          this.newPage();
          drawHeader();
          fit = Math.floor((this.y - this.bottom - 4) / LEAD);
        }
        const chunk = Math.min(n - done, fit);
        for (let k = 0; k < chunk; k++) {
          columns.forEach((c, i) => {
            this.text(
              cells[i]![done + k] ?? '',
              xs[i]! + CELL_PAD,
              this.y - BODY - 2 - k * LEAD,
              this.font,
              BODY,
              INK,
              c.align,
              widths[i]! - 2 * CELL_PAD,
            );
          });
        }
        this.y -= chunk * LEAD + 4;
        this.page.drawLine({
          start: { x: PAGE.margin, y: this.y + 2 },
          end: { x: PAGE.width - PAGE.margin, y: this.y + 2 },
          thickness: 0.5,
          color: rgb(RULE),
        });
        done += chunk;
      }
    }
  }

  list(items: string[]) {
    for (const item of items) {
      const lines = this.wrap(item, this.font, BODY, PAGE.width - 2 * PAGE.margin - 12);
      lines.forEach((l, k) => {
        this.ensure(LEAD);
        if (k === 0) this.text('-', PAGE.margin + 2, this.y - BODY, this.font, BODY);
        this.text(l, PAGE.margin + 12, this.y - BODY, this.font, BODY);
        this.y -= LEAD;
      });
    }
  }

  block(b: Block) {
    this.heading(b.heading);
    if (b.kind === 'kv') this.keyValues(b.rows);
    else if (b.kind === 'totals') this.keyValues(b.rows, true);
    else if (b.kind === 'table') this.table(b.columns, b.rows);
    else this.list(b.items);
  }
}

/**
 * Renders an invoice as a simple A4 PDF with the same content as `renderHtml`: parties, references and
 * dates, lines, allowances and charges, the VAT breakdown, totals, payment details, notes and attachment
 * names. Uses the standard Helvetica fonts, so nothing is embedded and files stay small; characters outside
 * WinAnsi are drawn as "?". Text wraps, long tables continue on further pages with their header repeated,
 * and every page carries "Page x of y".
 */
export async function renderPdf(invoice: CanonicalInvoice, options: RenderPdfOptions = {}): Promise<Uint8Array> {
  const view = buildInvoiceView(invoice, options.lang, { currencyDisplay: 'code' });
  const lang = view.lang;
  const t = labelsFor(lang);
  lib = await import('pdf-lib');
  const doc = await lib.PDFDocument.create();
  const font = await doc.embedFont(lib.StandardFonts.Helvetica);
  const bold = await doc.embedFont(lib.StandardFonts.HelveticaBold);
  const w = new Writer(doc, font, bold);

  const created = new Date(`${invoice.issueDate}T00:00:00Z`);
  const stamp = Number.isNaN(created.getTime()) ? new Date(0) : created;
  doc.setTitle(w.clean(view.title).replace(/\n/g, ' '));
  doc.setProducer('eu-einvoice-canonical');
  doc.setCreator('eu-einvoice-canonical');
  doc.setCreationDate(stamp);
  doc.setModificationDate(stamp);
  doc.setLanguage(lang);

  const full = PAGE.width - 2 * PAGE.margin;
  if (view.credit) {
    w.text(w.clean(view.docLabel.toUpperCase()), PAGE.margin, w.y - BODY, bold, BODY, CREDIT);
    w.y -= LEAD + 2;
  }
  for (const l of w.wrap(view.title, bold, 18, full)) {
    w.ensure(24);
    w.text(l, PAGE.margin, w.y - 18, bold, 18);
    w.y -= 24;
  }
  for (const l of w.wrap(view.meta.map((f) => `${f.label}: ${f.value.text}`).join('   '), font, BODY, full)) {
    w.ensure(LEAD);
    w.text(l, PAGE.margin, w.y - BODY, font, BODY, GREY);
    w.y -= LEAD;
  }
  w.y -= 6;
  w.keyValues(view.facts.map((f) => [f.label, f.value.text]));
  w.ensure(22);
  w.text(w.clean(view.due.label), PAGE.margin, w.y - 13, bold, 11);
  w.text(w.clean(view.due.value.text), PAGE.margin + LABEL_WIDTH, w.y - 14, bold, 14, view.credit ? CREDIT : ACCENT);
  w.y -= 22;
  for (const b of pdfBlocks(view, t('address'))) w.block(b);

  const count = w.pages.length;
  const footerTitle = w.wrap(view.title, font, 8, PAGE.width - 2 * PAGE.margin - 100)[0] ?? '';
  w.pages.forEach((page, i) => {
    page.drawText(footerTitle, { x: PAGE.margin, y: FOOTER_Y, size: 8, font, color: rgb(GREY) });
    const label = `${t('page')} ${i + 1} ${t('of')} ${count}`;
    page.drawText(label, { x: PAGE.width - PAGE.margin - font.widthOfTextAtSize(label, 8), y: FOOTER_Y, size: 8, font, color: rgb(GREY) });
  });

  return doc.save();
}
