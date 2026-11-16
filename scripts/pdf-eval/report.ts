/**
 * Turns per-document scores into the counts-only PDF evaluation report, in the manner of the corpus report
 * (scripts/corpus-lib.ts): counts, normalised messages, problem codes, pointer patterns and opaque or
 * repository-relative file ids. No file content and no extracted or expected value ever reaches it.
 */
import { type Cluster, normaliseMessage } from '../corpus-lib.js';
import { type DocScore, type FieldCounts, VERDICTS } from './score.js';

export const DOC_STATUSES = ['ok', 'draft', 'unsupported', 'not-an-invoice', 'error', 'none'] as const;
type StatusCounts = Record<(typeof DOC_STATUSES)[number], number>;

export interface PdfEvalReport {
  generatedAt: string;
  mode: 'swedish' | 'paired';
  commit?: string;
  documents: StatusCounts & {
    total: number;
    /** `ok` documents with no missing or wrong field. */
    okAllCorrect: number;
    /** Ids of documents with at least one wrong value. */
    withWrong: string[];
  };
  /** Totals over all fields. `scored` = correct + missing + wrong: the denominator of the gate. */
  totals: FieldCounts & { scored: number };
  fields: Record<string, FieldCounts>;
  byDocType: Record<string, StatusCounts & { documents: number; correct: number; missing: number; wrong: number }>;
  expectedProblems: {
    identifierCheck: { expected: number; flagged: number; unflagged: number; corrected: number };
    notReconciling: { expected: number; flagged: number; unflagged: number; notExtracted: number };
  };
  problemCodes: { code: string; count: number }[];
  /** Draft pointer patterns and problem fields the harness does not read: a non-empty list means the field table needs updating. */
  unmappedPointers: { pointer: string; count: number }[];
  unsupported: Cluster[];
  errors: Cluster[];
  /** Paired mode: hybrid PDFs left out because their page and XML are known to disagree. */
  excluded: string[];
  /** Paired mode: PDFs that gave no invoice from embedded XML, so have no key. */
  noReference: number;
  gate: { wrong: number; passed: boolean };
}

const zeroFields = (): FieldCounts => Object.fromEntries(VERDICTS.map((v) => [v, 0])) as FieldCounts;
const zeroStatus = (): StatusCounts => Object.fromEntries(DOC_STATUSES.map((s) => [s, 0])) as StatusCounts;
const tally = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const ranked = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

function cluster(into: Map<string, Cluster>, raw: string, id: string) {
  const message = normaliseMessage(raw);
  const c = into.get(message) ?? { message, count: 0, examples: [] };
  c.count++;
  if (c.examples.length < 3) c.examples.push(id);
  into.set(message, c);
}

export function aggregate(
  scores: DocScore[],
  meta: { mode: PdfEvalReport['mode']; commit?: string; excluded?: string[]; noReference?: number; generatedAt?: string },
): PdfEvalReport {
  const documents = { total: 0, ...zeroStatus(), okAllCorrect: 0, withWrong: [] as string[] };
  const totals = zeroFields();
  const fields: Record<string, FieldCounts> = {};
  const byDocType: PdfEvalReport['byDocType'] = {};
  const ic = { expected: 0, flagged: 0, unflagged: 0, corrected: 0 };
  const nr = { expected: 0, flagged: 0, unflagged: 0, notExtracted: 0 };
  const codes = new Map<string, number>();
  const pointers = new Map<string, number>();
  const unsupported = new Map<string, Cluster>();
  const errors = new Map<string, Cluster>();

  for (const s of scores) {
    documents.total++;
    documents[s.status]++;
    byDocType[s.docType] ??= { documents: 0, ...zeroStatus(), correct: 0, missing: 0, wrong: 0 };
    const t = byDocType[s.docType];
    t.documents++;
    t[s.status]++;
    let missing = 0;
    let wrong = 0;
    for (const [key, c] of Object.entries(s.fields)) {
      fields[key] ??= zeroFields();
      const f = fields[key];
      for (const v of VERDICTS) {
        f[v] += c[v] ?? 0;
        totals[v] += c[v] ?? 0;
      }
      t.correct += c.correct ?? 0;
      missing += c.missing ?? 0;
      wrong += c.wrong ?? 0;
    }
    t.missing += missing;
    t.wrong += wrong;
    if (wrong) documents.withWrong.push(s.id);
    if (s.status === 'ok' && !missing && !wrong) documents.okAllCorrect++;
    for (const k of Object.keys(ic) as (keyof typeof ic)[]) ic[k] += s.identifierChecks[k];
    if (s.notReconciling) {
      nr.expected++;
      nr[s.notReconciling]++;
    }
    for (const c of s.problemCodes) tally(codes, c);
    for (const p of s.unmappedPointers) tally(pointers, p);
    if (s.message && (s.status === 'unsupported' || s.status === 'not-an-invoice')) cluster(unsupported, s.message, s.id);
    if (s.message && s.status === 'error') cluster(errors, s.message, s.id);
  }
  const top = (m: Map<string, Cluster>) => [...m.values()].sort((a, b) => b.count - a.count || a.message.localeCompare(b.message));
  return {
    generatedAt: meta.generatedAt ?? new Date().toISOString(),
    mode: meta.mode,
    commit: meta.commit,
    documents: { ...documents, withWrong: documents.withWrong.sort() },
    totals: { ...totals, scored: totals.correct + totals.missing + totals.wrong },
    fields: Object.fromEntries(Object.entries(fields).sort(([a], [b]) => a.localeCompare(b))),
    byDocType,
    expectedProblems: { identifierCheck: ic, notReconciling: nr },
    problemCodes: ranked(codes).map(([code, count]) => ({ code, count })),
    unmappedPointers: ranked(pointers).map(([pointer, count]) => ({ pointer, count })),
    unsupported: top(unsupported),
    errors: top(errors),
    excluded: [...(meta.excluded ?? [])].sort(),
    noReference: meta.noReference ?? 0,
    gate: { wrong: totals.wrong, passed: totals.wrong === 0 },
  };
}

const row = (cells: (string | number)[]) => `| ${cells.join(' | ')} |`;

/** `countsOnly` leaves out file ids and message text (for logs of private corpora); statuses stay counted in the table. */
export function renderMarkdown(r: PdfEvalReport, countsOnly = false): string {
  const d = r.documents;
  const out = [
    `## PDF extraction evaluation (${r.mode === 'swedish' ? 'Swedish answer key' : 'paired public corpus'})`,
    '',
    `Gate: **${r.gate.passed ? 'passed' : 'failed'}**, ${r.gate.wrong} wrong of ${r.totals.scored} scored values.`,
    '',
    row(['Documents', ...DOC_STATUSES, 'ok, all correct']),
    row(Array(DOC_STATUSES.length + 2).fill('---')),
    row([d.total, ...DOC_STATUSES.map((s) => d[s]), d.okAllCorrect]),
    '',
    row(['Field', 'correct', 'missing', 'reported', 'wrong', 'extra (key absent)', 'not extracted', 'unaligned', 'not scored']),
    row(Array(9).fill('---')),
    ...Object.entries(r.fields).map(([k, c]) =>
      row([k, c.correct, c.missing, c.missingReported, c.wrong, c.extraOnAbsent, c.notExtracted, c.unaligned, c.notScored]),
    ),
    '',
    row(['Document type', 'documents', 'ok', 'draft', 'unsupported', 'correct', 'missing', 'wrong']),
    row(Array(8).fill('---')),
    ...Object.entries(r.byDocType).map(([k, t]) => row([k, t.documents, t.ok, t.draft, t.unsupported, t.correct, t.missing, t.wrong])),
  ];
  const { identifierCheck: ic, notReconciling: nr } = r.expectedProblems;
  if (ic.expected || nr.expected)
    out.push(
      '',
      `Expected problems: identifier checks ${ic.expected} (flagged ${ic.flagged}, unflagged ${ic.unflagged}, corrected ${ic.corrected}); ` +
        `not reconciling ${nr.expected} (draft ${nr.flagged}, presented as complete ${nr.unflagged}, not extracted ${nr.notExtracted}).`,
    );
  const list = (title: string, items: string[]) => (items.length ? out.push('', `${title}:`, ...items.map((i) => `- ${i}`)) : 0);
  if (!countsOnly) {
    list(
      'Unsupported or not an invoice',
      r.unsupported.map((c) => `${c.count}× ${c.message}`),
    );
    list(
      'Errors',
      r.errors.map((c) => `${c.count}× ${c.message}`),
    );
  }
  list(
    'Problem codes',
    r.problemCodes.slice(0, 20).map((c) => `${c.count}× ${c.code}`),
  );
  list(
    'Unmapped draft pointers',
    r.unmappedPointers.map((p) => `${p.count}× \`${p.pointer}\``),
  );
  if (countsOnly) out.push('', `Documents with wrong values: ${d.withWrong.length}.`);
  else list('Documents with wrong values', d.withWrong);
  if (r.mode === 'paired')
    out.push('', `PDFs without an XML invoice: ${r.noReference}. Excluded (page and XML disagree): ${r.excluded.length}.`);
  list('Excluded', r.excluded);
  return `${out.join('\n')}\n`;
}
