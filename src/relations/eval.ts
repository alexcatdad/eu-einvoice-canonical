/** Scores line roles and relations against hand labels: used by the browser evaluation page and the tests. */
import type { CanonicalInvoice, LineRelation, LineRole } from '../canonical.js';
import { LABELLED_CASES, toLines, type LabelledCase } from './labelled.js';
import { applyModelLabels, type ModelLabeller } from './model.js';
import { analyseLines } from './rules.js';

export interface CaseScore {
  name: string;
  rolesCorrect: number;
  rolesTotal: number;
  relationsTrue: number;
  relationsFound: number;
  relationsExpected: number;
  /** Relations found with `confidence: 'proven'` that are not in the labels: should be 0. */
  provenWrong: number;
  ms: number;
  error?: string;
}

export interface EvalScore {
  cases: CaseScore[];
  roleAccuracy: number;
  relationPrecision: number;
  relationRecall: number;
  provenWrong: number;
  ms: number;
}

const relKey = (r: { from: string; to: string[]; type: string }) => `${r.type}:${r.from}>${[...r.to].sort().join(',')}`;

export function scoreCase(c: LabelledCase, roles: Record<string, LineRole>, relations: LineRelation[]): Omit<CaseScore, 'name' | 'ms'> {
  const expected = new Set(c.relations.map(relKey));
  const found = new Set(relations.map(relKey));
  const types = new Set(c.relations.map((r) => r.type));
  // Only judge the relation types the labels cover for this case.
  const judged = relations.filter((r) => types.has(r.type) || r.confidence === 'proven');
  return {
    rolesCorrect: c.lines.filter((l) => roles[l.id] === c.roles[l.id]).length,
    rolesTotal: c.lines.length,
    relationsTrue: [...expected].filter((k) => found.has(k)).length,
    relationsFound: new Set(judged.map(relKey)).size,
    relationsExpected: expected.size,
    provenWrong: relations.filter((r) => r.confidence === 'proven' && !expected.has(relKey(r))).length,
  };
}

/** Rules only when no labeller is given; rules plus the model's labels otherwise. */
export async function evaluate(labeller?: ModelLabeller, cases: LabelledCase[] = LABELLED_CASES): Promise<EvalScore> {
  const scores: CaseScore[] = [];
  const t0 = performance.now();
  for (const c of cases) {
    const start = performance.now();
    const lines = toLines(c);
    const inv = { lines, source: { warnings: [], derived: [] } } as unknown as CanonicalInvoice;
    const a = analyseLines(inv);
    inv.lineRoles = a.lineRoles;
    inv.relations = a.relations;
    // applyModelLabels never throws: a failing model becomes a LINE-MODEL-FAILED warning.
    if (labeller) await applyModelLabels(inv, labeller);
    const error = inv.source.warnings.find((w) => w.code === 'LINE-MODEL-FAILED')?.message;
    scores.push({ name: c.name, ...scoreCase(c, inv.lineRoles ?? {}, inv.relations ?? []), ms: performance.now() - start, error });
  }
  const sum = (f: (s: CaseScore) => number) => scores.reduce((n, s) => n + f(s), 0);
  const ratio = (a: number, b: number) => (b === 0 ? 1 : a / b);
  return {
    cases: scores,
    roleAccuracy: ratio(sum((s) => s.rolesCorrect), sum((s) => s.rolesTotal)),
    relationPrecision: ratio(sum((s) => s.relationsTrue), sum((s) => s.relationsFound)),
    relationRecall: ratio(sum((s) => s.relationsTrue), sum((s) => s.relationsExpected)),
    provenWrong: sum((s) => s.provenWrong),
    ms: performance.now() - t0,
  };
}
