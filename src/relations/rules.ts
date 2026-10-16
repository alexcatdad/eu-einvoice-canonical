/**
 * Line roles and relations from rules and exact arithmetic only. Nothing here guesses: a
 * relation is either structural, stated in the invoice text, or proven by amounts that match
 * to the cent; everything else is reported in `source.warnings` or marked `review`.
 *
 * The canonical lines and totals are never changed.
 */
import type { CanonicalInvoice, Line, LineRelation, LineRole } from '../canonical.js';
import { add, cmp, isZero, neg, percentOf, round, sub, sum } from '../values.js';

export interface RelationWarning {
  code: string;
  message: string;
  path?: string;
}

export interface LineAnalysis {
  lineRoles: Record<string, LineRole>;
  relations: LineRelation[];
  warnings: RelationWarning[];
}

/** Bounds for the percentage search. */
export const SEARCH_LIMITS = { candidates: 12, subsetSize: 4 } as const;

/** Text-only line: no amount, no quantity, no price. */
export function isDescriptor(l: Line): boolean {
  if (!l.item.name.trim() && !l.item.description?.trim()) return false;
  if (!isZero(l.netAmount)) return false;
  if (l.quantity !== undefined && !isZero(l.quantity)) return false;
  if (l.price !== undefined && !isZero(l.price.net)) return false;
  return l.allowances.length === 0 && l.charges.length === 0 && !l.subLines?.length;
}

const lineText = (l: Line) => l.item.name.trim() || l.item.description?.trim() || '';

/** Reads "10%", "10 %", "10,5%" from the line text. Distinct rates in order of appearance. */
export function percentagesIn(text: string): string[] {
  const rates: string[] = [];
  for (const m of text.matchAll(/(?<![\d.,])(\d{1,3}(?:[.,]\d{1,4})?)\s*%/g)) {
    const rate = m[1].replace(',', '.');
    if (!rates.includes(rate)) rates.push(rate);
  }
  return rates;
}

/** Order reference a parser recorded on the line (`national.orderReference`), if any. */
function orderRef(l: Line): string | undefined {
  const v = l.national?.orderReference;
  return typeof v === 'string' && v ? v : undefined;
}

interface Group {
  descriptors: Line[];
  priced: Line[];
  order?: string;
}

/** A run of descriptors heads the priced lines after it, until the next run or another order reference. */
function groupLines(lines: Line[]): Group[] {
  const groups: Group[] = [];
  let cur: Group | undefined;
  let prevDescriptor = false;
  for (const l of lines) {
    const desc = isDescriptor(l);
    const ref = orderRef(l);
    const refChanged = !!cur && !!ref && !!cur.order && ref !== cur.order;
    if (!cur || refChanged || (desc && !prevDescriptor && cur.priced.length > 0)) {
      cur = { descriptors: [], priced: [], order: ref };
      groups.push(cur);
    }
    if (ref && !cur.order) cur.order = ref;
    (desc ? cur.descriptors : cur.priced).push(l);
    prevDescriptor = desc;
  }
  return groups;
}

interface Match {
  rate: string;
  ids: string[];
  role: 'surcharge' | 'discount';
}

const isRateLine = (l: Line) =>
  (l.quantity === undefined || cmp(l.quantity, '1') === 0) && (l.price === undefined || cmp(l.price.net, l.netAmount) === 0);

/** Every set of earlier lines whose net amounts times a rate in the text give this line's amount. */
function findPercentMatches(target: Line, rates: string[], earlier: Line[]): Match[] {
  const base = earlier.filter((l) => !isZero(l.netAmount)).slice(-SEARCH_LIMITS.candidates);
  const amount = round(target.netAmount);
  const negAmount = neg(amount);
  // `total` is the running sum of `set`, folded in the same order `sum` would, so it is the same string.
  const test = (set: Line[], total: string): Match[] => {
    const out: Match[] = [];
    for (const rate of rates) {
      const expected = round(percentOf(total, rate));
      if (cmp(expected, amount) === 0) out.push({ rate, ids: set.map((l) => l.id), role: 'surcharge' });
      else if (cmp(expected, negAmount) === 0) out.push({ rate, ids: set.map((l) => l.id), role: 'discount' });
    }
    return out;
  };

  // Contiguous runs first: the usual case is a markup on the line(s) right above.
  const contiguous: Match[] = [];
  for (let i = 0; i < base.length; i++) {
    let total: string = '0';
    for (let j = i; j < base.length; j++) {
      total = add(total, base[j].netAmount);
      contiguous.push(...test(base.slice(i, j + 1), total));
    }
  }
  if (contiguous.length > 0) return contiguous;

  // Then small subsets, bounded by the candidate cap and the subset size. One shared stack and a running sum
  // instead of a fresh array and a fresh sum per subset.
  const found: Match[] = [];
  const chosen: Line[] = [];
  const pick = (start: number, total: string) => {
    if (chosen.length > 0) found.push(...test(chosen, total));
    if (chosen.length === SEARCH_LIMITS.subsetSize) return;
    for (let i = start; i < base.length; i++) {
      chosen.push(base[i]);
      pick(i + 1, add(total, base[i].netAmount));
      chosen.pop();
    }
  };
  pick(0, '0');
  return found;
}

const NOTE_LINE =
  /\b(?:line|row|rad|rader|position|pos\.?|zeile|ligne|riga|rivi|rida|linia|pozycja|řádek|riadok)\s*(?:no\.?|nr\.?|n°|#)?\s*(\d+)\b/gi;

export function analyseLines(inv: Pick<CanonicalInvoice, 'lines'>): LineAnalysis {
  const lineRoles: Record<string, LineRole> = {};
  const relations: LineRelation[] = [];
  const warnings: RelationWarning[] = [];
  const index = new Map<string, number>();
  inv.lines.forEach((l, i) => {
    if (!index.has(l.id)) index.set(l.id, i);
  });
  const pathOf = (l: Line) => `/lines/${index.get(l.id) ?? inv.lines.indexOf(l)}`;

  for (const g of groupLines(inv.lines)) {
    g.descriptors.forEach((d, i) => {
      lineRoles[d.id] = i === 0 ? 'heading' : 'description';
    });
    g.priced.forEach((l) => {
      lineRoles[l.id] = 'item';
    });

    g.priced.forEach((l, k) => {
      if (k === 0 || isZero(l.netAmount) || !isRateLine(l)) return;
      const rates = percentagesIn(lineText(l));
      if (rates.length === 0) return;
      const matches = findPercentMatches(l, rates, g.priced.slice(0, k));
      if (matches.length === 1) {
        const m = matches[0];
        lineRoles[l.id] = m.role;
        relations.push({
          from: l.id,
          to: m.ids,
          type: m.role === 'surcharge' ? 'markup' : 'discount',
          rate: m.rate as LineRelation['rate'],
          method: 'arithmetic',
          confidence: 'proven',
        });
      } else if (matches.length > 1) {
        const roles = new Set(matches.map((m) => m.role));
        if (roles.size === 1) lineRoles[l.id] = matches[0].role;
        const shown = matches
          .slice(0, 4)
          .map((m) => `${m.rate} % of line${m.ids.length > 1 ? 's' : ''} ${m.ids.join('+')}`)
          .join('; ');
        warnings.push({
          code: 'LINE-RELATION-AMBIGUOUS',
          path: pathOf(l),
          message: `Line ${l.id} states ${rates.join('/')} % and ${matches.length} sets of earlier lines fit its amount (${shown}${matches.length > 4 ? '; ...' : ''}); no relation recorded, review by hand`,
        });
      } else {
        warnings.push({
          code: 'LINE-RELATION-UNMATCHED',
          path: pathOf(l),
          message: `Line ${l.id} states ${rates.join('/')} % but no earlier line or set of lines in its group gives its amount ${l.netAmount}; review by hand`,
        });
      }
    });

    if (g.descriptors.length > 0 && g.priced.length > 0) {
      relations.push({ from: g.descriptors[0].id, to: g.priced.map((l) => l.id), type: 'heading', method: 'rule' });
    }
  }

  // Line allowances and charges with a base amount that is another line's net amount.
  for (const l of inv.lines) {
    for (const ac of [...l.allowances, ...l.charges]) {
      if (ac.baseAmount === undefined || isZero(ac.baseAmount)) continue;
      const own = add(sub(l.netAmount, sum(l.charges.map((c) => c.amount))), sum(l.allowances.map((a) => a.amount)));
      if (cmp(round(ac.baseAmount), round(own)) === 0 || cmp(round(ac.baseAmount), round(l.netAmount)) === 0) continue;
      const hits = inv.lines.filter((o) => o !== l && cmp(round(o.netAmount), round(ac.baseAmount!)) === 0);
      if (hits.length === 1)
        relations.push({ from: l.id, to: [hits[0].id], type: 'allowance-base', method: 'arithmetic', confidence: 'likely' });
    }
  }

  // Notes that name another line.
  for (const l of inv.lines) {
    const targets = new Set<string>();
    for (const m of (l.note ?? '').matchAll(NOTE_LINE)) if (m[1] !== l.id && index.has(m[1])) targets.add(m[1]);
    if (targets.size > 0) relations.push({ from: l.id, to: [...targets], type: 'note-reference', method: 'rule', confidence: 'likely' });
  }

  // Lines that share an item id or an order-line reference: only a hint.
  const shared = (type: 'same-item' | 'same-order-line', keyOf: (l: Line) => string | undefined) => {
    const byKey = new Map<string, Line[]>();
    for (const l of inv.lines) {
      const k = keyOf(l);
      if (k) byKey.set(k, [...(byKey.get(k) ?? []), l]);
    }
    for (const ls of byKey.values()) {
      if (ls.length > 1) relations.push({ from: ls[0].id, to: ls.slice(1).map((l) => l.id), type, method: 'rule', confidence: 'review' });
    }
  };
  shared(
    'same-item',
    (l) =>
      l.item.sellerId ??
      l.item.buyerId ??
      (l.item.standardId ? `${l.item.standardId.schemeId ?? ''}:${l.item.standardId.value}` : undefined),
  );
  shared('same-order-line', (l) => l.orderLineRef);

  return { lineRoles, relations, warnings };
}

/** Fills `lineRoles` and `relations` on the invoice and appends the warnings. The lines and totals are untouched. */
export function applyRelations(inv: CanonicalInvoice): void {
  const a = analyseLines(inv);
  inv.lineRoles = a.lineRoles;
  inv.relations = a.relations;
  inv.source.warnings.push(...a.warnings);
}
