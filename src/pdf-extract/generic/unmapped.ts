/**
 * Text coverage of the invoice pages: every text run ends in exactly one place. A run inside the region of a value (or of
 * a further text joined to a value, recorded by a `joined-text` warning) is in a field; a run of layout text (a label,
 * column or section heading, title, page number, separator, or a value printed again) is consumed; every other run is
 * unmapped and kept verbatim in `unmappedText` (canonical result only), with one `unmapped-text` warning per block.
 * Problems and warnings never cover text: a value they report as not kept stays as unmapped text.
 */
import type { PdfRegion, PdfUnmappedText, SourceWarning } from '../../canonical.js';
import { cmp, isZero } from '../../values.js';
import type { GenericRead } from '../generic.js';
import type { LayoutDocument, Segment as LayoutSegment, TextRun } from '../layout.js';
import { matchLabel, normalize } from '../se/index.js';
import { fieldLabel, inlinePair, parseAmount, parseRate } from './fields.js';
import { appendText, isFreeTextLabel } from './free-text.js';
import { columnOf, merge } from './items.js';

const DATED = /^(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?) +\p{L}/u;
/** Document titles and page numbers. */
const TITLE = /^(?:faktura|kreditfaktura|invoice|sida \d+(?: \(\d+\)| av \d+)?|\d+ ?\(\d+\))$/u;
/** Section headings and titles in capitals ("SKATTESAMMANRÄKNING", "FAKTURA"); never a text with a digit ("REF-2026-01"). */
const HEADING = /^[^\p{Ll}\d]*\p{Lu}{3}[^\p{Ll}\d]*$/u;
const letters = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const compact = (s: string) => normalize(s).replace(/[\s.:-]/gu, '');
/** A document-level discount or fee total as Peppol viewers print it ("Summa rabatter (huvudnivå):"). */
const LEVEL_TOTAL = /^summa (rabatter|avgifter) \(huvudnivå\):?$/u;
/** A sentence on payment terms printed outside the labelled terms: late-payment interest, or the seller's general terms. */
const TERMS = /dröjsmålsränta|efter förfallo(?:dagen|datum)\b.*\bränta\b|\ballmänna (?:avtals|leverans)?villkor\b/u;

/** Whether at least half of `a` lies in `b`, on the same page. */
export const inside = (a: PdfRegion, b: PdfRegion) => {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return a.page === b.page && w > 0 && h > 0 && w * h >= 0.5 * a.width * a.height;
};

type Segment = PdfRegion & { text: string };

/** One heading, or two or three headings printed so close that they form one segment ("À-pris Rabatt"). */
const heading = (t: string) => !!columnOf(t) || !!fieldLabel(t) || !!matchLabel(t);
function headings(text: string, parts = 3): boolean {
  const words = text.split(' ');
  if (heading(text)) return true;
  if (parts === 1 || words.length < 2) return false;
  return words.slice(1).some((_, i) => heading(words.slice(0, i + 1).join(' ')) && headings(words.slice(i + 1).join(' '), parts - 1));
}

export type TextCoverage = 'field' | 'consumed' | 'unmapped';

/** One text segment of an invoice page and where each of its runs ended, in the order of `segment.runs`. */
export interface CoveredSegment {
  page: number;
  segment: LayoutSegment;
  kinds: TextCoverage[];
}

const box = (page: number, b: { x: number; y: number; width: number; height: number }): PdfRegion => ({
  page,
  x: b.x,
  y: b.y,
  width: b.width,
  height: b.height,
});

/**
 * How the field at `pointer` holding `value` holds the printed `run`: whole when the value holds the run (after a
 * label: "Telefon: 010-000 00 00"), by digits for a value held normalised ("1 250,00 kr", "20.03.2026") or as the name
 * printed with a code ("(Standard)" after the VAT category "S"); in part when the run holds the value (a footer line
 * with several values).
 */
function textHeld(pointer: string, value: string, run: string): 'whole' | 'part' | undefined {
  if (/\/(?:categoryCode|meansCode)$/u.test(pointer) && /^\([^()]+\)[,.]?$/u.test(run.trim())) return 'whole';
  const t = letters(run.replace(/^[^:]{1,40}:\s*/u, ''));
  const v = letters(value);
  const d = t.replace(/\D/gu, '');
  if ((!!t && v.includes(t)) || (!!d && t.length - d.length <= 3 && value.replace(/\D/gu, '').includes(d))) return 'whole';
  return v.length >= 2 && letters(run).includes(v) ? 'part' : undefined;
}

/**
 * Whether the fields whose regions hold a printed run hold its text: one holds it whole, or the values held in part
 * leave only labels, units and separators (no number of three digits or more: another fact in the same run).
 */
export function runInFields(fields: readonly { pointer: string; value: string }[], run: string): boolean {
  const parts: string[] = [];
  for (const f of fields) {
    const held = textHeld(f.pointer, f.value, run);
    if (held === 'whole') return true;
    if (held === 'part') parts.push(letters(f.value));
  }
  let rest = letters(run);
  for (const p of parts.sort((x, y) => y.length - x.length)) rest = rest.split(p).join('');
  return parts.length > 0 && !/\d{3}/u.test(rest);
}

/** Where every text run on the invoice pages (all pages, or the first `read.pages`) ended, segment by segment. */
export function textCoverage(layout: LayoutDocument, read: GenericRead): CoveredSegment[] {
  const v = read.values;
  // Each value's region, and the region of each further text joined to it, with the text the value holds
  const fields = [
    ...Object.entries(v).map(([pointer, x]) => ({ pointer, region: x.region, value: x.value })),
    ...read.warnings.flatMap((w) =>
      w.code === 'joined-text' && w.region && w.field && v[w.field]
        ? [{ pointer: w.field, region: w.region, value: v[w.field].value }]
        : [],
    ),
  ];
  const consumed = [...(read.consumed ?? [])];
  // A zero document-level discount or fee total, where none is read: it states what the result holds
  const none = (key: string) => !v[`/totals/${key}`] || isZero(v[`/totals/${key}`].value);
  for (const p of layout.pages)
    for (const l of p.lines) {
      const [label, amount, ...rest] = l.segments;
      const kind = LEVEL_TOTAL.exec(normalize(label?.text ?? ''))?.[1];
      const a = amount && parseAmount(amount.text);
      if (kind && !rest.length && a && isZero(a) && none(kind === 'rabatter' ? 'allowanceTotal' : 'chargeTotal'))
        consumed.push(...[label, amount].map((s) => box(p.number, s)));
    }
  const postal = (p: string) =>
    v[`${p}/address/postalCode`] ? [`${v[`${p}/address/postalCode`].value} ${v[`${p}/address/city`]?.value ?? ''}`] : [];
  const texts = new Set(
    [...Object.values(v).map((x) => x.value), ...postal('/seller'), ...postal('/buyer')].flatMap((t) =>
      compact(t).length >= 2 ? [compact(t)] : [],
    ),
  );
  // Part of a value printed again elsewhere, split differently: a name over two lines, terms repeated on every page
  const partOf = (t: string) => {
    const c = compact(t);
    return c.length >= 5 && [...texts].some((v) => v.length > c.length && v.includes(c));
  };
  const amounts = Object.values(v).flatMap((x) => (parseAmount(x.value) ? [{ a: parseAmount(x.value)!, page: x.region.page }] : []));
  const exact = new Set(amounts.map((x) => x.a));
  // On another page, an amount or rate with decimals compares by value ("25,00" printed for the rate 25)
  const isAmount = (t: string, page: number) => {
    const a = parseAmount(t) ?? parseRate(t);
    return !!a && (exact.has(a) || (/\d[,.]\d{2}$/u.test(t) && amounts.some((x) => x.page !== page && cmp(a, x.a) === 0)));
  };
  // A quantity with its unit printed again on another page ("1 st" for "1.00 EA")
  const quantities = Object.entries(v).flatMap(([k, x]) => (/^\/lines\/\d+\/quantity$/u.test(k) ? [x] : []));
  const isQuantity = (t: string, page: number) => {
    const m = /^(-?\d[\d ]*(?:[,.]\d+)?) ?\p{L}{1,6}\.?$/u.exec(t);
    const q = m && parseAmount(m[1]);
    return !!q && quantities.some((x) => x.region.page !== page && cmp(q, x.value) === 0);
  };
  // A label or column heading on its own
  const label = (text: string) => !!fieldLabel(text) || !!matchLabel(text) || !!columnOf(text) || isFreeTextLabel(text);
  // Layout text: no letter or digit, a label or column heading, a section heading, or a value read elsewhere ("Label: value" too)
  const known = (printed: string, page: number): boolean => {
    // "Organisationsnummer: 5560000001 [0007]": the scheme suffix aside
    const text = printed.replace(/\s*\[[0-9A-Z]{2,4}\]$/u, '');
    const pair = /^([^:]{2,40}):\s*(\S.*)$/u.exec(text);
    return (
      !/[\p{L}\p{N}]/u.test(text) ||
      texts.has(compact(text)) ||
      isAmount(text, page) ||
      isQuantity(text, page) ||
      label(text) ||
      HEADING.test(text) ||
      TITLE.test(normalize(text)) ||
      texts.has(compact(inlinePair(text)?.value ?? pair?.[2] ?? '')) ||
      partOf(text) ||
      headings(text)
    );
  };
  return layout.pages.slice(0, read.pages ?? layout.pages.length).flatMap((p) =>
    p.lines.flatMap((l) =>
      l.segments.map((segment) => {
        const layoutText = known(segment.text.trim(), p.number);
        const kinds = segment.runs.map((r): TextCoverage => {
          const at = box(p.number, r);
          // In a field: in the field's region, and the field holds the run's text
          if (
            runInFields(
              fields.filter((f) => inside(at, f.region)),
              r.text,
            )
          )
            return 'field';
          // Layout text: the segment, or a label printed as a run of it ("Anteckning:" before a note's text)
          return layoutText || label(r.text.trim()) || consumed.some((c) => inside(at, c)) ? 'consumed' : 'unmapped';
        });
        return { page: p.number, segment, kinds };
      }),
    ),
  );
}

/** Joins runs of one segment with a space where they do not touch, as the layout model does. */
const joinRuns = (runs: TextRun[]) =>
  runs
    .map((r, i) => (i && r.x - (runs[i - 1].x + runs[i - 1].width) > 0.2 * r.fontSize ? ' ' : '') + r.text)
    .join('')
    .trim();

/** The text segments (or their runs) on the invoice pages that map to no field and are not layout text, in reading order. */
export function unmappedSegments(layout: LayoutDocument, read: GenericRead): Segment[] {
  return textCoverage(layout, read)
    .flatMap(({ page, segment, kinds }) => {
      const runs = segment.runs.filter((_, i) => kinds[i] === 'unmapped');
      if (!runs.length) return [];
      const text = runs.length === segment.runs.length ? segment.text.trim() : joinRuns(runs);
      return [{ ...box(page, runs.length === segment.runs.length ? segment : merge(runs.map((r) => box(page, r)))), text }];
    })
    .sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
}

/**
 * A dated remark printed right under the amount due ("2026-03-20 ab"): when the text that maps to no field there, down to
 * the first wide gap, is one line of a date followed by text, it is an invoice note (BT-22). Joined to a note already
 * read, as Peppol allows one invoice note.
 */
export function remarkNote(layout: LayoutDocument, read: GenericRead): GenericRead {
  const due = read.values['/totals/payable']?.region;
  if (!due) return read;
  const page = layout.pages.find((p) => p.number === due.page);
  const free = new Set(unmappedSegments(layout, read).map((s) => `${s.page}:${s.x}:${s.y}`));
  const lines: Segment[] = [];
  let bottom = due.y + due.height;
  for (const line of page?.lines ?? []) {
    if (line.y < bottom - 1) continue;
    if (line.y - bottom > 1.6 * Math.max(line.height, 8)) break;
    bottom = line.y + line.height;
    for (const s of line.segments)
      if (free.has(`${due.page}:${s.x}:${s.y}`))
        lines.push({ page: due.page, x: s.x, y: s.y, width: s.width, height: s.height, text: s.text.trim() });
  }
  // One line: a date and the text after it, as a sign-off ("2026-03-20 ab")
  if (lines.length !== 1 || !DATED.test(lines[0].text)) return read;
  const field = '/notes/0/text';
  const values = { ...read.values };
  const note = { value: lines.map((l) => l.text).join('\n'), region: merge(lines) };
  if (values[field]) {
    values[field] = { ...values[field], value: `${values[field].value}\n${note.value}` };
    return {
      ...read,
      values,
      warnings: [
        ...read.warnings,
        {
          code: 'joined-text',
          field,
          message: 'Another printed text for this field is kept after the first, on a new line',
          region: note.region,
        },
      ],
    };
  }
  values[field] = note;
  return { ...read, values };
}

/**
 * Keeps each block of vertically adjacent unmapped segments in a column verbatim in `unmappedText` (one line per segment),
 * with one `unmapped-text` warning pointing at it. The warning message does not copy the text.
 */
export function unmappedText(layout: LayoutDocument, read: GenericRead): GenericRead {
  const blocks: { region: PdfRegion; lines: string[]; last: Segment }[] = [];
  for (const s of unmappedSegments(layout, read)) {
    const block = [...blocks]
      .reverse()
      .find(
        (b) => b.last.page === s.page && s.y - (b.last.y + b.last.height) <= 1.6 * Math.max(s.height, 8) && Math.abs(s.x - b.region.x) <= 2,
      );
    if (block) {
      block.region = merge([block.region, s]);
      block.lines.push(s.text);
      block.last = s;
    } else blocks.push({ region: merge([s]), lines: [s.text], last: s });
  }
  const kept: PdfUnmappedText[] = blocks.map((b) => ({ text: b.lines.join('\n'), region: b.region }));
  const warnings: SourceWarning[] = blocks.map((b, i) => ({
    code: 'unmapped-text',
    field: `/source/unmappedText/${i}`,
    message: `Printed text that maps to no invoice field (${b.lines.length} text segment${b.lines.length > 1 ? 's' : ''}), kept as printed`,
    region: b.region,
  }));
  // Text with no usable position: after the positioned blocks, without a region
  for (const p of layout.pages.slice(0, read.pages ?? layout.pages.length))
    for (const text of p.unplaced) {
      warnings.push({
        code: 'unmapped-text',
        field: `/source/unmappedText/${kept.length}`,
        message: `Text on page ${p.number} whose position cannot be read (a zero-size or damaged text transform), kept as drawn without a region; spacing between its characters may be lost`,
      });
      kept.push({ text });
    }
  return { ...read, warnings: [...read.warnings, ...warnings], ...(kept.length ? { unmappedText: kept } : {}) };
}

/**
 * Text whose every sentence is on payment terms, printed outside the labelled terms ("Efter förfallodagen debiteras
 * ränta ...", "Våra allmänna villkor finns på ..."), is part of the payment terms (BT-20): appended in page order after the terms read,
 * each with its own region. A sentence already contained in the terms is a repeat and adds nothing.
 */
export function termsSentences(layout: LayoutDocument, read: GenericRead): GenericRead {
  const values = { ...read.values };
  const warnings = [...read.warnings];
  for (const s of unmappedSegments(layout, read)) {
    // Every sentence of the text is on the terms, so that no other text goes with it
    const sentences = s.text.split(/(?<=[.!?])\s+(?=\p{Lu})/u);
    if (s.text.split(' ').length < 4 || !sentences.every((t) => TERMS.test(normalize(t)))) continue;
    if (compact(values['/paymentTerms']?.value ?? '').includes(compact(s.text))) continue;
    const { text, ...region } = s;
    appendText('/paymentTerms', { value: text, region }, values, warnings);
  }
  return { ...read, values, warnings };
}
