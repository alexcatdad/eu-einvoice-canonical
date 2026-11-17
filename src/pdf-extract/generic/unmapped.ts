/**
 * Printed text that maps to no invoice field, so that none is dropped silently: every text segment on the pages read
 * that is neither inside the region of a value, problem or warning, nor the text of a value read elsewhere, nor a label
 * or heading. Vertically adjacent segments form one block; each block is one `unmapped-text` warning with its region.
 * The messages are generic: the text itself is not copied, as it may carry personal data.
 */
import type { PdfRegion, SourceWarning } from '../../canonical.js';
import { cmp, isZero } from '../../values.js';
import type { GenericRead } from '../generic.js';
import type { LayoutDocument } from '../layout.js';
import { matchLabel, normalize } from '../se/index.js';
import { fieldLabel, inlinePair, parseAmount, parseRate } from './fields.js';
import { appendText, isFreeTextLabel } from './free-text.js';
import { columnOf, merge } from './items.js';

const DATED = /^(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?) +\p{L}/u;
/** Document titles and page numbers. */
const TITLE = /^(?:faktura|kreditfaktura|invoice|sida \d+(?: \(\d+\)| av \d+)?|\d+ ?\(\d+\))$/u;
/** Section headings and titles in capitals ("SKATTESAMMANRÄKNING", "FAKTURA"). */
const HEADING = /^[^\p{Ll}]*\p{Lu}{3}[^\p{Ll}]*$/u;
const compact = (s: string) => normalize(s).replace(/[\s.:-]/gu, '');
/** A document-level discount or fee total as Peppol viewers print it ("Summa rabatter (huvudnivå):"). */
const LEVEL_TOTAL = /^summa (rabatter|avgifter) \(huvudnivå\):?$/u;
/** A sentence on payment terms printed outside the labelled terms: late-payment interest, or the seller's general terms. */
const TERMS = /dröjsmålsränta|efter förfallo(?:dagen|datum)\b.*\bränta\b|\ballmänna (?:avtals|leverans)?villkor\b/u;

const inside = (a: PdfRegion, b: PdfRegion) => {
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

/** The text segments on the pages read that map to no field, in reading order. */
export function unmappedSegments(layout: LayoutDocument, read: GenericRead): Segment[] {
  const used = [
    ...Object.values(read.values).map((v) => v.region),
    ...[...read.problems, ...read.warnings].map((p) => p.region),
    ...(read.consumed ?? []),
  ].filter((r): r is PdfRegion => !!r);
  const v = read.values;
  // A zero document-level discount or fee total, where none is read: it states what the result holds
  const none = (key: string) => !v[`/totals/${key}`] || isZero(v[`/totals/${key}`].value);
  for (const p of layout.pages)
    for (const l of p.lines) {
      const [label, amount, ...rest] = l.segments;
      const kind = LEVEL_TOTAL.exec(normalize(label?.text ?? ''))?.[1];
      const a = amount && parseAmount(amount.text);
      if (kind && !rest.length && a && isZero(a) && none(kind === 'rabatter' ? 'allowanceTotal' : 'chargeTotal'))
        used.push(...[label, amount].map((s) => ({ page: p.number, x: s.x, y: s.y, width: s.width, height: s.height })));
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
  // A whole text that is a label or column heading, a section heading, or a value read elsewhere ("Label: value" too)
  const known = (printed: string, page: number): boolean => {
    // "Organisationsnummer: 5560000001 [0007]": the scheme suffix aside
    const text = printed.replace(/\s*\[[0-9A-Z]{2,4}\]$/u, '');
    const pair = /^([^:]{2,40}):\s*(\S.*)$/u.exec(text);
    return (
      texts.has(compact(text)) ||
      isAmount(text, page) ||
      isQuantity(text, page) ||
      !!fieldLabel(text) ||
      !!matchLabel(text) ||
      !!columnOf(text) ||
      HEADING.test(text) ||
      TITLE.test(normalize(text)) ||
      isFreeTextLabel(text) ||
      texts.has(compact(inlinePair(text)?.value ?? pair?.[2] ?? '')) ||
      partOf(text) ||
      headings(text)
    );
  };
  return layout.pages
    .slice(0, read.pages ?? layout.pages.length)
    .flatMap((p) =>
      p.lines.flatMap((l) =>
        l.segments.map((s) => ({ page: p.number, x: s.x, y: s.y, width: s.width, height: s.height, text: s.text.trim() })),
      ),
    )
    .filter((s) => /[\p{L}\p{N}]/u.test(s.text) && !used.some((r) => inside(s, r)) && !known(s.text, s.page))
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

/** Adds one `unmapped-text` warning per block of vertically adjacent unmapped segments in a column. */
export function unmappedText(layout: LayoutDocument, read: GenericRead): GenericRead {
  const blocks: { region: PdfRegion; lines: number; last: Segment }[] = [];
  for (const s of unmappedSegments(layout, read)) {
    const block = [...blocks]
      .reverse()
      .find(
        (b) => b.last.page === s.page && s.y - (b.last.y + b.last.height) <= 1.6 * Math.max(s.height, 8) && Math.abs(s.x - b.region.x) <= 2,
      );
    if (block) {
      block.region = merge([block.region, s]);
      block.lines++;
      block.last = s;
    } else blocks.push({ region: merge([s]), lines: 1, last: s });
  }
  const warnings: SourceWarning[] = blocks.map((b) => ({
    code: 'unmapped-text',
    message: `Printed text that maps to no invoice field (${b.lines} text segment${b.lines > 1 ? 's' : ''})`,
    region: b.region,
  }));
  return { ...read, warnings: [...read.warnings, ...warnings] };
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
