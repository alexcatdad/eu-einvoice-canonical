/**
 * Printed text that maps to no invoice field, so that none is dropped silently: every text segment on the pages read
 * that is neither inside the region of a value, problem or warning, nor the text of a value read elsewhere, nor a label
 * or heading. Vertically adjacent segments form one block; each block is one `unmapped-text` warning with its region.
 * The messages are generic: the text itself is not copied, as it may carry personal data.
 */
import type { PdfRegion, SourceWarning } from '../../canonical.js';
import type { GenericRead } from '../generic.js';
import type { LayoutDocument } from '../layout.js';
import { matchLabel, normalize } from '../se/index.js';
import { fieldLabel, inlinePair, parseAmount, parseRate } from './fields.js';
import { isFreeTextLabel } from './free-text.js';
import { columnOf, merge } from './items.js';

/** Document titles and page numbers. */
const TITLE = /^(?:faktura|kreditfaktura|invoice|sida \d+(?: \(\d+\)| av \d+)?|\d+ ?\(\d+\))$/u;
/** Section headings and titles in capitals ("SKATTESAMMANRÄKNING", "FAKTURA"). */
const HEADING = /^[^\p{Ll}]*\p{Lu}{3}[^\p{Ll}]*$/u;
const compact = (s: string) => normalize(s).replace(/[\s.:-]/gu, '');

const inside = (a: PdfRegion, b: PdfRegion) => {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return a.page === b.page && w > 0 && h > 0 && w * h >= 0.5 * a.width * a.height;
};

type Segment = PdfRegion & { text: string };

/** The text segments on the pages read that map to no field, in reading order. */
export function unmappedSegments(layout: LayoutDocument, read: GenericRead): Segment[] {
  const used = [...Object.values(read.values).map((v) => v.region), ...[...read.problems, ...read.warnings].map((p) => p.region)].filter(
    (r): r is PdfRegion => !!r,
  );
  const v = read.values;
  const postal = (p: string) =>
    v[`${p}/address/postalCode`] ? [`${v[`${p}/address/postalCode`].value} ${v[`${p}/address/city`]?.value ?? ''}`] : [];
  const texts = new Set(
    [...Object.values(v).map((x) => x.value), ...postal('/seller'), ...postal('/buyer')].flatMap((t) =>
      compact(t).length >= 2 ? [compact(t)] : [],
    ),
  );
  const amounts = new Set<string>(Object.values(read.values).flatMap((v) => parseAmount(v.value) ?? []));
  // A whole text that is a label or column heading, a section heading, or a value read elsewhere ("Label: value" too)
  const known = (printed: string) => {
    // "Organisationsnummer: 5560000001 [0007]": the scheme suffix aside
    const text = printed.replace(/\s*\[[0-9A-Z]{2,4}\]$/u, '');
    const pair = /^([^:]{2,40}):\s*(\S.*)$/u.exec(text);
    return (
      texts.has(compact(text)) ||
      amounts.has(parseAmount(text) ?? parseRate(text) ?? '') ||
      !!fieldLabel(text) ||
      !!matchLabel(text) ||
      !!columnOf(text) ||
      HEADING.test(text) ||
      TITLE.test(normalize(text)) ||
      isFreeTextLabel(text) ||
      texts.has(compact(inlinePair(text)?.value ?? pair?.[2] ?? ''))
    );
  };
  return layout.pages
    .slice(0, read.pages ?? layout.pages.length)
    .flatMap((p) =>
      p.lines.flatMap((l) =>
        l.segments.map((s) => ({ page: p.number, x: s.x, y: s.y, width: s.width, height: s.height, text: s.text.trim() })),
      ),
    )
    .filter((s) => /[\p{L}\p{N}]/u.test(s.text) && !used.some((r) => inside(s, r)) && !known(s.text))
    .sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
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
