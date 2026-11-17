/**
 * VAT breakdown (BG-23), from the first source that has one, in this order:
 * 1. a VAT table: a header with a rate column ("Moms %") and a VAT base or amount column, one row per rate;
 * 2. labels that carry a rate ("Momspl belopp 25 %", "Moms kr 25 %");
 * 3. one rate printed for the whole invoice, with the labelled VAT total and base.
 * Interest rates (dröjsmålsränta) are never read as VAT.
 */
import type { PdfRegion, SourceWarning } from '../../canonical.js';
import type { ReadValue } from '../generic.js';
import { classifyRates, findLabels, matchLabel, normalize } from '../se/index.js';
import { type Cell, overlapX, regionOf } from './cells.js';
import { type FieldKey, fieldLabel, type Parsed, parseAmount, parseCategoryRate, parseRate } from './fields.js';
import type { Item } from './items.js';

export type VatRow = Partial<Record<'rate' | 'categoryCode' | 'taxableAmount' | 'taxAmount' | 'exemptionReason', ReadValue>>;
type Hit = { parsed: Parsed; value: Cell | { region: PdfRegion }; label: Cell; rate?: string };

const hitValue = (h: Hit) => ('value' in h.parsed ? h.parsed.value : undefined);
const regionOfHit = (h: Hit) => ('region' in h.value ? h.value.region : regionOf(h.value));
const category = (rate: ReadValue): ReadValue => ({ value: Number(rate.value) > 0 ? 'S' : 'Z', region: rate.region });

export function vatBreakdown(
  rows: Cell[][],
  found: Map<FieldKey, Hit[]>,
  items: Item[],
  values: Record<string, ReadValue>,
  problems: SourceWarning[],
): VatRow[] {
  let out = vatTable(rows);
  if (!out.length) out = ratedLabels(found, problems);
  if (!out.length) {
    const rates = new Map<string, PdfRegion>();
    for (const h of found.get('vatRate') ?? [])
      if (classifyRates(`${h.label.text} ${hitValue(h)} %`)[0]?.kind !== 'interest') rates.set(hitValue(h)!, regionOfHit(h));
    for (const i of items) if (i.rate && !rates.has(i.rate.value)) rates.set(i.rate.value, i.rate.region);
    if (rates.size === 1) {
      const [[value, region]] = [...rates];
      const base = (found.get('vatBase') ?? []).filter((h) => !h.rate);
      const row: VatRow = { rate: { value, region }, taxAmount: values['/totals/vatTotal'] };
      if (values['/totals/taxExclusive']) row.taxableAmount = values['/totals/taxExclusive'];
      else if (base.length && new Set(base.map(hitValue)).size === 1)
        row.taxableAmount = { value: hitValue(base[0])!, region: regionOfHit(base[0]) };
      out = [row];
    } else if (rates.size > 1)
      problems.push({
        code: 'vat-breakdown',
        field: '/vatBreakdown',
        message: `Several VAT rates (${[...rates.keys()].join(', ')}) without a readable breakdown`,
      });
  }
  for (const row of out) if (row.rate && !row.categoryCode) row.categoryCode = category(row.rate);
  // Momsfritt: a statement that the sale is exempt turns rows without VAT into category E, with the statement as reason
  const exempt = rows.flat().filter((c) => findLabels(c.text).some((l) => l.label === 'vatExempt'));
  const statements = [...new Set(exempt.filter((c) => normalize(c.text).split(' ').length > 2).map((c) => c.text))];
  const reason = statements.length === 1 ? exempt.find((c) => c.text === statements[0]) : undefined;
  const noVat = (v?: ReadValue) => !v || Number(v.value) === 0;
  if (!out.length && reason && noVat(values['/totals/vatTotal'])) {
    const base = values['/totals/taxExclusive'] ?? values['/totals/lineNetTotal'];
    out = [{ categoryCode: { value: 'E', region: regionOf(reason) }, ...(base ? { taxableAmount: base } : {}) }];
  }
  for (const row of out)
    if (exempt.length && (row.categoryCode?.value === 'E' || (row.rate && Number(row.rate.value) === 0 && noVat(row.taxAmount)))) {
      row.categoryCode = { value: 'E', region: row.rate?.region ?? row.categoryCode!.region };
      delete row.rate;
      if (reason) row.exemptionReason = { value: reason.text, region: regionOf(reason) };
      else problems.push({ code: 'missing', field: '/vatBreakdown', message: 'VAT-exempt sale without a readable exemption statement' });
    }
  // Reverse charge: the statement that the buyer accounts for the VAT ("Omvänd betalningsskyldighet") and one amount outside
  // the scope of VAT ("Ej momspl.") give one AE row, with the statement as exemption reason
  const reverse = rows.flat().filter((c) => matchLabel(c.text) === 'reverseCharge');
  const outside = found.get('exemptBase') ?? [];
  if (
    !out.length &&
    new Set(reverse.map((c) => c.text)).size === 1 &&
    noVat(values['/totals/vatTotal']) &&
    outside.length &&
    new Set(outside.map(hitValue)).size === 1
  )
    out = [
      {
        categoryCode: { value: 'AE', region: regionOf(reverse[0]) },
        taxableAmount: { value: hitValue(outside[0])!, region: regionOfHit(outside[0]) },
        exemptionReason: { value: reverse[0].text, region: regionOf(reverse[0]) },
      },
    ];
  const known = new Set(out.map((r) => (r.categoryCode?.value === 'E' || r.categoryCode?.value === 'AE' ? '0' : r.rate?.value)));
  for (const i of items)
    if (i.rate && !known.has(i.rate.value))
      problems.push({
        code: 'not-reconciling',
        field: '/vatBreakdown',
        message: `Line VAT rate ${i.rate.value} % is not in the VAT breakdown`,
        region: i.rate.region,
      });
  if (out.length === 1 && !values['/totals/vatTotal'] && out[0].taxAmount) values['/totals/vatTotal'] = out[0].taxAmount;
  return out;
}

const RATE_HEADER = (k: FieldKey[]) => k.includes('vatRate');
const BASE_HEADER = (k: FieldKey[]) => k.includes('vatBase') || k.includes('taxExclusive');
const TAX_HEADER = (k: FieldKey[]) => k.includes('vatTotal');

/** Rows of the first VAT table: a header with a rate column and VAT base and amount columns. */
export function vatTable(rows: Cell[][]): VatRow[] {
  for (const [r, header] of rows.entries()) {
    const keys = header.map((c) => fieldLabel(c.text)?.keys ?? []);
    const rateCol = keys.findIndex(RATE_HEADER);
    if (rateCol < 0 || !keys.some(BASE_HEADER) || !keys.some(TAX_HEADER)) continue;
    const spans = header.map((c, k) => {
      const prev = header[k - 1];
      const next = header[k + 1];
      const x0 = prev ? (prev.x + prev.width + c.x) / 2 : c.x - 40;
      const x1 = next ? (c.x + c.width + next.x) / 2 : c.x + c.width + 40;
      return { x: x0, width: x1 - x0 };
    });
    const out: VatRow[] = [];
    let prev = header[0];
    for (const row of rows.slice(r + 1)) {
      if (row[0].page !== prev.page || row[0].line.y - (prev.line.y + prev.line.height) > 1.6 * Math.max(prev.height, 8)) break;
      const at = (k: number) => {
        const cells = row.filter((c) => {
          let best = -1;
          for (const [j, s] of spans.entries())
            if (overlapX(s, c) >= Math.min(c.width, s.width) / 2 && (best < 0 || overlapX(s, c) > overlapX(spans[best], c))) best = j;
          return best === k;
        });
        return cells.length === 1 ? cells[0] : undefined;
      };
      const rateCell = at(rateCol);
      // "Momsfri" in the rate column: an exempt row
      const exemptRow = rateCell && findLabels(rateCell.text).some((l) => l.label === 'vatExempt');
      const rate = rateCell && (exemptRow ? '0' : (parseRate(rateCell.text) ?? parseCategoryRate(rateCell.text)));
      if (!rateCell || !rate) break;
      const pick = (test: (k: FieldKey[]) => boolean): ReadValue | undefined => {
        const k = keys.findIndex(test);
        const c = k < 0 ? undefined : at(k);
        const a = c && parseAmount(c.text);
        return c && a ? { value: a, region: regionOf(c) } : undefined;
      };
      out.push({
        rate: { value: rate, region: regionOf(rateCell) },
        ...(exemptRow ? { categoryCode: { value: 'E', region: regionOf(rateCell) } } : {}),
        taxableAmount: pick(BASE_HEADER),
        taxAmount: pick(TAX_HEADER),
      });
      prev = row[0];
    }
    if (out.length) return out;
  }
  return [];
}

function ratedLabels(found: Map<FieldKey, Hit[]>, problems: SourceWarning[]): VatRow[] {
  const byRate = new Map<string, VatRow>();
  const clash = new Set<string>();
  let clashAt: PdfRegion | undefined;
  for (const [key, field] of [
    ['vatBase', 'taxableAmount'],
    ['vatTotal', 'taxAmount'],
  ] as const)
    for (const h of found.get(key) ?? []) {
      if (!h.rate || !hitValue(h)) continue;
      const row = byRate.get(h.rate) ?? { rate: { value: h.rate, region: regionOf(h.label) } };
      if (row[field] && row[field].value !== hitValue(h)) {
        clash.add(h.rate);
        clashAt ??= regionOfHit(h);
      }
      row[field] = { value: hitValue(h)!, region: regionOfHit(h) };
      byRate.set(h.rate, row);
    }
  if (!clash.size) return [...byRate.values()];
  problems.push({
    code: 'ambiguous',
    field: '/vatBreakdown',
    message: `Different VAT amounts printed for rate ${[...clash].join(', ')} %`,
    region: clashAt,
  });
  return [];
}
