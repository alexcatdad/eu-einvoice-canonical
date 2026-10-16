/**
 * Two-way (invoice against purchase order) and three-way (plus goods receipts) matching.
 *
 * Per invoice line, in this order: order-line reference, item identifiers, line relations (a markup or
 * discount follows the lines it applies to) and, as a last resort, description similarity. Nothing is
 * guessed silently: every match carries its method and confidence, and a match that rests on description
 * similarity, a weak relation or conflicting identifiers always ends in `needs-review`.
 *
 * Tolerances: a limit set in both `absolute` and `percent` must hold in both (as ERP three-way match does);
 * no limit means no tolerance. Under-invoicing a quantity is partial invoicing, not a variance error.
 * The canonical invoice is never modified.
 */
import type { CanonicalInvoice, Line, LineRelation, LineRole } from '../canonical.js';
import { analyseLines, isDescriptor } from '../relations/rules.js';
import { abs, add, cmp, div, isZero, mul, round, sign, sub } from '../values.js';
import { MatchInputError } from './po.js';
import type {
  Finding,
  LineMatch,
  MatchConfidence,
  MatchMethod,
  MatchOptions,
  MatchResult,
  NotYetReceived,
  OverInvoiced,
  PoLine,
  PoLineRef,
  PurchaseOrder,
  Tolerance,
  Variance,
  VarianceStatus,
  VatVariance,
  Verdict,
} from './types.js';

const norm = (s: string | undefined) => s?.trim().toLowerCase() || undefined;
const normId = (s: string | undefined) => norm(s)?.replace(/\s+/g, '');
const normGtin = (s: string | undefined) => normId(s)?.replace(/^0+(?=\d)/, '');

const PIECE = new Set(['C62', 'EA', 'H87', 'PCE', 'NAR', 'PC', 'PCS', 'ST', 'STK', 'PIECE', 'UNIT']);
const normUnit = (u: string | undefined) => {
  const x = u?.trim().toUpperCase();
  if (!x) return undefined;
  return PIECE.has(x) ? 'PIECE' : x;
};

/** Dice coefficient on the word sets of two texts, accents and case ignored. */
export function similarity(a: string, b: string): number {
  const words = (t: string) =>
    new Set(
      t
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean),
    );
  const x = words(a);
  const y = words(b);
  if (x.size === 0 || y.size === 0) return 0;
  let common = 0;
  for (const w of x) if (y.has(w)) common++;
  return (2 * common) / (x.size + y.size);
}

function classify(diff: string, expected: string, tol?: Tolerance): VarianceStatus {
  if (isZero(diff)) return 'exact';
  if (!tol || (tol.absolute === undefined && tol.percent === undefined)) return 'exceeded';
  const d = abs(diff);
  if (tol.absolute !== undefined && cmp(d, tol.absolute) > 0) return 'exceeded';
  if (tol.percent !== undefined && cmp(mul(d, '100'), mul(tol.percent, abs(expected))) > 0) return 'exceeded';
  return 'within-tolerance';
}

function variance(invoiced: string, expected: string, tol?: Tolerance): Variance {
  const difference = sub(invoiced, expected);
  const v: Variance = { invoiced, expected, difference, status: classify(difference, expected, tol) };
  if (!isZero(expected)) v.percent = div(mul(difference, '100'), abs(expected), 4);
  return v;
}

const perUnit = (price: string, base?: string) => (base === undefined || cmp(base, '1') === 0 ? price : div(price, base, 6));

const key = (poId: string, lineId: string) => `${poId}\u0000${lineId}`;

interface Candidate {
  po: PurchaseOrder;
  line: PoLine;
}

interface Found {
  method: MatchMethod;
  confidence: MatchConfidence;
  target: Candidate;
  similarity?: string;
  notes: string[];
}

function itemAgreement(l: Line, p: PoLine): { agree: number; conflict: number; standard: boolean } {
  let agree = 0;
  let conflict = 0;
  let standard = false;
  const cmpId = (a: string | undefined, b: string | undefined, n: (s: string | undefined) => string | undefined, isStd = false) => {
    const x = n(a);
    const y = n(b);
    if (!x || !y) return;
    if (x === y) {
      agree++;
      if (isStd) standard = true;
    } else conflict++;
  };
  cmpId(l.item.sellerId, p.sellerItemId, normId);
  cmpId(l.item.buyerId, p.buyerItemId, normId);
  cmpId(l.item.standardId?.value, p.standardItemId?.value, normGtin, true);
  return { agree, conflict, standard };
}

export function matchInvoice(inv: CanonicalInvoice, purchaseOrders: PurchaseOrder[], options: MatchOptions = {}): MatchResult {
  const tolerances = options.tolerances ?? {};
  const threshold = options.descriptionThreshold ?? 0.6;
  const findings: Finding[] = [];
  const finding = (f: Finding) => {
    if (!findings.some((x) => x.code === f.code && x.invoiceLineId === f.invoiceLineId && x.poId === f.poId)) findings.push(f);
  };
  const credit = inv.kind === 'creditNote';

  const poByKey = new Map<string, PurchaseOrder>();
  for (const po of purchaseOrders) {
    const k = norm(po.id);
    if (!k) throw new MatchInputError('A purchase order has no id');
    if (poByKey.has(k)) throw new MatchInputError(`Two purchase orders share the id "${po.id}"`);
    poByKey.set(k, po);
  }

  // Receipts: summed per PO line.
  const threeWay = options.receipts !== undefined;
  const received = new Map<string, string>();
  for (const r of options.receipts ?? []) {
    const po = r.poId ? poByKey.get(norm(r.poId) ?? '') : purchaseOrders.length === 1 ? purchaseOrders[0] : undefined;
    if (!po) {
      finding({
        code: 'RECEIPT_UNASSIGNED',
        severity: 'warning',
        message: r.poId
          ? `A receipt names order "${r.poId}", which was not supplied`
          : 'A receipt has no poId and more than one order was supplied',
        poId: r.poId,
      });
      continue;
    }
    for (const l of r.lines) {
      if (!po.lines.some((p) => p.id === l.lineId)) {
        finding({
          code: 'RECEIPT_UNKNOWN_LINE',
          severity: 'warning',
          message: `A receipt names line ${l.lineId}, which order ${po.id} does not have`,
          poId: po.id,
        });
        continue;
      }
      const k = key(po.id, l.lineId);
      received.set(k, add(received.get(k) ?? '0', l.quantity));
    }
  }

  for (const po of purchaseOrders) {
    if (po.currency && norm(po.currency) !== norm(inv.currency))
      finding({
        code: 'CURRENCY_MISMATCH',
        severity: 'error',
        message: `Order ${po.id} is in ${po.currency}, the invoice in ${inv.currency}`,
        poId: po.id,
      });
  }

  const analysis = inv.lineRoles && inv.relations ? undefined : analyseLines(inv);
  const roles: Record<string, LineRole> = inv.lineRoles ?? analysis!.lineRoles;
  const relations: LineRelation[] = inv.relations ?? analysis!.relations;

  const scopeFor = (l: Line): { scope: Candidate[]; refPo?: PurchaseOrder } => {
    const lineRef = typeof l.national?.orderReference === 'string' ? l.national.orderReference : undefined;
    const ref = norm(lineRef) ?? norm(inv.purchaseOrderRef);
    if (ref) {
      const po = poByKey.get(ref);
      if (!po) {
        finding({
          code: 'PO_NOT_PROVIDED',
          severity: 'error',
          message: `The invoice refers to order "${lineRef ?? inv.purchaseOrderRef}", which was not supplied`,
          invoiceLineId: l.id,
          poId: lineRef ?? inv.purchaseOrderRef,
        });
        return { scope: [] };
      }
      return { scope: po.lines.map((line) => ({ po, line })), refPo: po };
    }
    return { scope: purchaseOrders.flatMap((po) => po.lines.map((line) => ({ po, line }))) };
  };

  const byReference = (l: Line, scope: Candidate[], refPo: PurchaseOrder | undefined, notes: string[]): Found | undefined => {
    const ref = l.orderLineRef?.trim();
    if (!ref) return undefined;
    const hits = scope.filter((c) => c.line.id === ref);
    if (hits.length === 0) {
      notes.push(`Order line reference ${ref} is not a line of ${refPo ? `order ${refPo.id}` : 'the supplied orders'}`);
      return undefined;
    }
    if (hits.length > 1) {
      notes.push(`Order line reference ${ref} exists on ${hits.length} orders and the invoice does not say which`);
      return undefined;
    }
    const target = hits[0]!;
    const { agree, conflict } = itemAgreement(l, target.line);
    if (conflict > 0 && agree === 0) {
      finding({
        code: 'REFERENCE_ITEM_CONFLICT',
        severity: 'warning',
        message: `Line ${l.id} refers to order line ${ref}, but its item identifiers differ from that order line's`,
        invoiceLineId: l.id,
        poId: target.po.id,
      });
      return { method: 'reference', confidence: 'low', target, notes: [...notes, 'Item identifiers contradict the order line reference'] };
    }
    return { method: 'reference', confidence: refPo ? 'high' : 'medium', target, notes: [] };
  };

  const byItem = (l: Line, scope: Candidate[], notes: string[]): Found | undefined => {
    const scored = scope
      .map((c) => ({ c, ...itemAgreement(l, c.line) }))
      .filter((x) => x.agree > 0 && x.conflict === 0)
      .sort((a, b) => b.agree - a.agree);
    if (scored.length === 0) return undefined;
    let best = scored.filter((x) => x.agree === scored[0]!.agree);
    let viaPrice = false;
    if (best.length > 1 && l.price) {
      const same = best.filter(
        (x) => cmp(perUnit(abs(l.price!.net), l.price!.baseQuantity), perUnit(x.c.line.unitPrice, x.c.line.baseQuantity)) === 0,
      );
      if (same.length >= 1 && same.length < best.length) {
        best = same;
        viaPrice = true;
      }
    }
    if (best.length > 1) {
      notes.push(`Item identifiers fit ${best.length} order lines (${best.map((x) => `${x.c.po.id}/${x.c.line.id}`).join(', ')})`);
      return undefined;
    }
    const top = best[0]!;
    const strong = top.agree >= 2 || top.standard;
    return {
      method: 'item',
      confidence: strong && !viaPrice ? 'high' : 'medium',
      target: top.c,
      notes: viaPrice ? ['Several order lines share the item id; the unit price decided'] : [],
    };
  };

  const byDescription = (l: Line, scope: Candidate[], notes: string[]): Found | undefined => {
    const text = `${l.item.name} ${l.item.description ?? ''}`;
    const scored = scope
      .filter((c) => c.line.description)
      .map((c) => ({ c, score: similarity(text, c.line.description!) }))
      .sort((a, b) => b.score - a.score);
    const top = scored[0];
    if (!top || top.score < threshold) return undefined;
    const second = scored[1];
    if (second && top.score - second.score < 0.1) {
      notes.push(
        `Description fits several order lines about equally (${top.c.po.id}/${top.c.line.id} and ${second.c.po.id}/${second.c.line.id})`,
      );
      return undefined;
    }
    const score = top.score.toFixed(2);
    return {
      method: 'description',
      confidence: 'low',
      target: top.c,
      similarity: score,
      notes: [`Matched on description similarity only (${score}); check it`],
    };
  };

  const results = new Map<string, LineMatch>();
  const deferred: { line: Line; rel: LineRelation }[] = [];

  const record = (l: Line, f: Found | undefined, notes: string[]): LineMatch => {
    const m: LineMatch = {
      invoiceLineId: l.id,
      role: roles[l.id] ?? 'item',
      status: f ? 'matched' : 'unmatched',
      poLines: f ? [{ poId: f.target.po.id, lineId: f.target.line.id }] : [],
      variances: {},
      notes: f ? [...notes, ...f.notes] : notes,
    };
    if (f) {
      m.method = f.method;
      m.confidence = f.confidence;
      if (f.similarity) m.similarity = f.similarity;
    }
    results.set(l.id, m);
    return m;
  };

  const matchLine = (l: Line, only?: 'reference') => {
    const notes: string[] = [];
    const { scope, refPo } = scopeFor(l);
    if (scope.length === 0) {
      notes.push('No order line to match against');
      return only ? undefined : record(l, undefined, notes);
    }
    const found = byReference(l, scope, refPo, notes) ?? (only ? undefined : (byItem(l, scope, notes) ?? byDescription(l, scope, notes)));
    if (only) return found ? record(l, found, notes) : undefined;
    if (!found) notes.push('No order line matched by reference, item identifier or description');
    return record(l, found, notes);
  };

  // Pass 1: everything except lines that adjust other lines.
  for (const l of inv.lines) {
    const role = roles[l.id] ?? 'item';
    if (role === 'heading' || role === 'description' || isDescriptor(l)) {
      results.set(l.id, {
        invoiceLineId: l.id,
        role,
        status: 'ignored',
        poLines: [],
        variances: {},
        notes: ['Text-only line; nothing to match'],
      });
      continue;
    }
    const rel = relations.find((r) => r.from === l.id && (r.type === 'markup' || r.type === 'discount'));
    if (rel) {
      deferred.push({ line: l, rel });
      continue;
    }
    matchLine(l);
  }

  // Pass 2: markups and discounts follow the lines they apply to, unless the order names them itself.
  for (const { line: l, rel } of deferred) {
    if (matchLine(l, 'reference')) continue;
    const targets = rel.to
      .map((id) => results.get(id))
      .filter((m): m is LineMatch => !!m && m.status === 'matched' && m.method !== 'relation');
    if (targets.length === 0) {
      matchLine(l);
      const m = results.get(l.id)!;
      if (m.status === 'unmatched') m.notes.push(`Its ${rel.type} relation points at lines that are not matched`);
      continue;
    }
    const poLines: PoLineRef[] = [];
    for (const t of targets)
      for (const p of t.poLines) if (!poLines.some((x) => x.poId === p.poId && x.lineId === p.lineId)) poLines.push(p);
    const confidence: MatchConfidence = rel.confidence === 'review' ? 'low' : rel.confidence === 'likely' ? 'medium' : 'high';
    const covered = rel.to.length === targets.length;
    results.set(l.id, {
      invoiceLineId: l.id,
      role: roles[l.id] ?? 'item',
      status: 'matched',
      method: 'relation',
      confidence: covered ? confidence : 'low',
      poLines,
      appliesTo: targets.map((t) => t.invoiceLineId),
      variances: {},
      notes: [
        `${rel.type === 'markup' ? 'Markup' : 'Discount'}${rel.rate ? ` of ${rel.rate} %` : ''} on line${targets.length > 1 ? 's' : ''} ${targets.map((t) => t.invoiceLineId).join(', ')}; the order has no line for it`,
        ...(covered ? [] : [`Not all lines it applies to are matched (${rel.to.join(', ')})`]),
      ],
    });
    finding({
      code: 'ADJUSTMENT_NOT_ON_ORDER',
      severity: 'info',
      message: `Line ${l.id} is a ${rel.type} on line${targets.length > 1 ? 's' : ''} ${targets.map((t) => t.invoiceLineId).join(', ')} and is not on the order`,
      invoiceLineId: l.id,
    });
  }

  const lines = inv.lines.map((l) => results.get(l.id)!);
  const invLine = new Map(inv.lines.map((l) => [l.id, l]));

  // Variances for lines matched on their own (not via a relation).
  const perPoLine = new Map<string, { line: Line; match: LineMatch }[]>();
  for (const m of lines) {
    if (m.status !== 'matched' || m.method === 'relation') continue;
    const k = key(m.poLines[0]!.poId, m.poLines[0]!.lineId);
    perPoLine.set(k, [...(perPoLine.get(k) ?? []), { line: invLine.get(m.invoiceLineId)!, match: m }]);
  }
  const poLineOf = (r: PoLineRef) => poByKey.get(norm(r.poId)!)!.lines.find((p) => p.id === r.lineId)!;
  const signedQty = (l: Line) => (l.quantity === undefined ? undefined : credit ? sub('0', abs(l.quantity)) : l.quantity);
  const prior = (p: PoLine) => p.invoicedQuantity;

  /** Expected quantity for an invoicing line (positive) or a crediting line (up to what was invoiced). */
  const expectedQty = (po: PurchaseOrder, p: PoLine, crediting: boolean): string => {
    if (crediting) return prior(p) ?? p.quantity;
    const base = threeWay ? (received.get(key(po.id, p.id)) ?? '0') : p.quantity;
    return sub(base, prior(p) ?? '0');
  };

  for (const [k, group] of perPoLine) {
    for (const { line: l, match: m } of group) {
      const ref = m.poLines[0]!;
      const po = poByKey.get(norm(ref.poId)!)!;
      const p = poLineOf(ref);
      const q = l.quantity;
      if (q === undefined) {
        m.notes.push('The invoice line has no quantity; quantity and total were not compared');
      } else {
        const crediting = credit || sign(q) < 0;
        const invoiced = abs(q);
        if (group.length === 1) {
          const expected = expectedQty(po, p, crediting);
          const v = variance(invoiced, expected, tolerances.quantity);
          if (cmp(invoiced, expected) < 0) {
            v.partial = true;
            if (v.status === 'exceeded') v.status = 'within-tolerance';
          }
          m.variances.quantity = v;
          if (threeWay && !crediting && !received.has(k)) m.notes.push('No receipt is recorded for this order line');
        }
        const iu = normUnit(l.unitCode ?? l.unitText);
        const pu = normUnit(p.unit);
        if (iu && pu && iu !== pu)
          finding({
            code: 'UNIT_MISMATCH',
            severity: 'warning',
            message: `Line ${l.id} is in ${l.unitCode ?? l.unitText}, order line ${p.id} in ${p.unit}; quantities are not comparable`,
            invoiceLineId: l.id,
            poId: po.id,
          });
        const expectedTotal = round(div(mul(p.unitPrice, invoiced), p.baseQuantity ?? '1', 8), 2);
        m.variances.total = variance(abs(l.netAmount), expectedTotal, tolerances.total);
      }
      if (l.price) {
        m.variances.unitPrice = variance(
          perUnit(abs(l.price.net), l.price.baseQuantity),
          perUnit(p.unitPrice, p.baseQuantity),
          tolerances.unitPrice,
        );
      } else {
        m.notes.push('The invoice line has no unit price; only the line total was compared');
      }
      if (p.vat && (p.vat.categoryCode || p.vat.rate !== undefined)) {
        if (!l.vat) m.notes.push('The invoice line has no VAT information to compare');
        else {
          const categoryMismatch = !!(l.vat.categoryCode && p.vat.categoryCode && norm(l.vat.categoryCode) !== norm(p.vat.categoryCode));
          const rateDifference = l.vat.rate !== undefined && p.vat.rate !== undefined ? sub(l.vat.rate, p.vat.rate) : undefined;
          const vv: VatVariance = {
            invoiced: { categoryCode: l.vat.categoryCode, rate: l.vat.rate },
            expected: { categoryCode: p.vat.categoryCode, rate: p.vat.rate },
            categoryMismatch,
            status: categoryMismatch
              ? 'exceeded'
              : rateDifference === undefined
                ? 'exact'
                : classify(rateDifference, p.vat.rate!, tolerances.vat),
          };
          if (rateDifference !== undefined) vv.rateDifference = rateDifference;
          m.variances.vat = vv;
        }
      }
    }
  }

  // Aggregates per PO line: over-invoiced against the order (or the receipt, if lower).
  const overInvoiced: OverInvoiced[] = [];
  for (const [k, group] of perPoLine) {
    const ref = group[0]!.match.poLines[0]!;
    const p = poLineOf(ref);
    const net = group.reduce((acc, g) => add(acc, signedQty(g.line) ?? '0'), '0');
    const total = add(prior(p) ?? '0', net);
    const rec = threeWay ? (received.get(k) ?? '0') : undefined;
    const useReceived = rec !== undefined && cmp(rec, p.quantity) < 0;
    const limit = useReceived ? rec! : p.quantity;
    if (cmp(total, limit) > 0) {
      const excess = sub(total, limit);
      const status = classify(excess, limit, tolerances.quantity);
      const entry: OverInvoiced = {
        poId: ref.poId,
        lineId: ref.lineId,
        ordered: p.quantity,
        invoiced: total,
        limit: useReceived ? 'received' : 'ordered',
        excess,
      };
      if (rec !== undefined) entry.received = rec;
      if (status === 'exceeded') overInvoiced.push(entry);
      else
        finding({
          code: 'OVER_INVOICED_WITHIN_TOLERANCE',
          severity: 'info',
          message: `Order line ${ref.poId}/${ref.lineId}: ${excess} more than ${entry.limit}, inside tolerance`,
          poId: ref.poId,
        });
    }
  }

  const involved = new Set([...perPoLine.values()].flatMap((g) => g.map((x) => x.match.poLines[0]!.poId)));
  const notYetReceived: NotYetReceived[] = [];
  if (threeWay) {
    for (const po of purchaseOrders) {
      if (involved.size > 0 && !involved.has(po.id)) continue;
      for (const p of po.lines) {
        const rec = received.get(key(po.id, p.id)) ?? '0';
        if (cmp(rec, p.quantity) < 0)
          notYetReceived.push({ poId: po.id, lineId: p.id, ordered: p.quantity, received: rec, outstanding: sub(p.quantity, rec) });
      }
    }
  }

  const unmatchedInvoiceLines = lines.filter((m) => m.status === 'unmatched').map((m) => m.invoiceLineId);
  if (!lines.some((m) => m.status !== 'ignored'))
    finding({ code: 'NO_LINES', severity: 'warning', message: 'The invoice has no priced lines to match' });
  for (const id of unmatchedInvoiceLines)
    finding({ code: 'LINE_UNMATCHED', severity: 'warning', message: `Invoice line ${id} matches no order line`, invoiceLineId: id });

  for (const m of lines) {
    if (m.status === 'matched' && (m.confidence === 'low' || m.method === 'description'))
      finding({
        code: 'LOW_CONFIDENCE_MATCH',
        severity: 'warning',
        message: `Invoice line ${m.invoiceLineId} was matched by ${m.method} with low confidence`,
        invoiceLineId: m.invoiceLineId,
      });
    for (const [name, v] of Object.entries(m.variances) as [string, Variance | VatVariance][]) {
      if (v.status === 'exceeded')
        finding({
          code: 'VARIANCE_EXCEEDED',
          severity: 'warning',
          message: `Invoice line ${m.invoiceLineId}: ${name} differs from the order beyond tolerance`,
          invoiceLineId: m.invoiceLineId,
        });
    }
  }
  for (const o of overInvoiced)
    finding({
      code: 'OVER_INVOICED',
      severity: 'warning',
      message: `Order line ${o.poId}/${o.lineId} is invoiced ${o.excess} above the ${o.limit} quantity`,
      poId: o.poId,
    });

  const statuses = lines.flatMap((m) => Object.values(m.variances).map((v) => v.status));
  const partial = lines.some((m) => m.variances.quantity?.partial);
  let verdict: Verdict = 'match';
  if (statuses.includes('within-tolerance') || partial || findings.some((f) => f.code === 'OVER_INVOICED_WITHIN_TOLERANCE'))
    verdict = 'within-tolerance';
  if (findings.some((f) => f.severity !== 'info') || statuses.includes('exceeded') || overInvoiced.length > 0) verdict = 'needs-review';

  return {
    invoiceId: inv.id,
    kind: inv.kind,
    threeWay,
    purchaseOrderIds: [...new Set(lines.flatMap((m) => m.poLines.map((p) => p.poId)))],
    lines,
    unmatchedInvoiceLines,
    overInvoiced,
    notYetReceived,
    findings,
    verdict,
  };
}
