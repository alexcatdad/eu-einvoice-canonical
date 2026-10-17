/** Optional model annotations, separate from the canonical invoice and legacy relation rules. */
import { z } from 'zod';
import type { CanonicalInvoice, SourceMeta } from '../canonical.js';

export const ANNOTATION_KINDS = [
  'goods',
  'labour',
  'freight',
  'other_item',
  'item_unknown',
  'descriptor',
  'adjustment',
  'unknown',
] as const;
// Keep optional annotation validation out of bundles that only import the converter.
const annotationSchema = /* @__PURE__ */ (() =>
  z.strictObject({
    id: z.string(),
    lines: z.array(z.strictObject({ id: z.string(), kind: z.enum(ANNOTATION_KINDS), targets: z.array(z.string()).nullable() })),
  }))();
export type LineAnnotations = z.infer<typeof annotationSchema>;
export interface AnnotationIssue {
  path: string;
  message: string;
}
export type AnnotationValidation = { ok: true; value: LineAnnotations } | { ok: false; issues: AnnotationIssue[] };
/** Provider schema; cross-field checks still require validateLineAnnotations. */
export const LINE_ANNOTATION_SCHEMA = /* @__PURE__ */ z.toJSONSchema(annotationSchema, { target: 'draft-7' });

const INPUT_FIELDS = [
  'id',
  'kind',
  'typeCode',
  'selfBilled',
  'currency',
  'issueDate',
  'dueDate',
  'notes',
  'purchaseOrderRef',
  'salesOrderRef',
  'contractRef',
  'projectRef',
  'invoicePeriod',
  'precedingInvoices',
  'lines',
  'allowances',
  'charges',
  'totals',
  'vatBreakdown',
] as const satisfies readonly (keyof CanonicalInvoice)[];
export type LineAnnotationInput = Pick<CanonicalInvoice, (typeof INPUT_FIELDS)[number]> & {
  source: { derived: SourceMeta['derived']; warnings: { code: string; message: string }[] };
};

/** Scope errors are explicit; no IDs, amounts or source structure are repaired. */
export class AnnotationInputError extends Error {
  constructor(public readonly issues: AnnotationIssue[]) {
    super(issues.map((i) => `${i.path}: ${i.message}`).join('; '));
    this.name = 'AnnotationInputError';
  }
}

export interface LineAnnotationIdentity {
  id: string;
  lines: readonly { id: string }[];
}

function identityIssues(input: LineAnnotationIdentity): AnnotationIssue[] {
  const issues: AnnotationIssue[] = [];
  if (!input.id.trim()) issues.push({ path: '/id', message: 'An invoice ID is required.' });
  if (!input.lines.length) issues.push({ path: '/lines', message: 'At least one line is required.' });
  const ids = new Set<string>();
  input.lines.forEach((line, i) => {
    if (!line.id.trim() || line.id === 'invoice' || ids.has(line.id))
      issues.push({
        path: `/lines/${i}/id`,
        message: 'Line IDs must be nonempty, unique and different from the reserved target "invoice".',
      });
    ids.add(line.id);
  });
  return issues;
}

/**
 * Select canonical fields without inventing values or applying role heuristics.
 * Takes a validated CanonicalInvoice (e.g. convert output); JSON callers validate the canonical schema first.
 * Initial scope: ordinary invoices with flat, uniquely identified lines.
 */
export function buildLineAnnotationInput(invoice: CanonicalInvoice): LineAnnotationInput {
  const issues = identityIssues(invoice);
  const unsupported = (path: string, message: string) => issues.push({ path, message });
  if (invoice.kind !== 'invoice' || invoice.typeCode !== '380' || invoice.correction || invoice.precedingInvoices.length)
    unsupported('/kind', 'This reference supports ordinary invoices (380), not credit notes or corrective documents.');
  if (Object.keys(invoice.extensions).length || invoice.otherTaxes.length || invoice.withholdings.length)
    unsupported('/extensions', 'National extensions, other taxes and withholdings need a dedicated interpretation policy.');
  invoice.lines.forEach((line, i) => {
    if (
      line.subLines?.length ||
      line.correctionState ||
      Object.keys(line.national ?? {}).length ||
      line.otherTaxes?.length ||
      line.withholdings?.length ||
      line.subjectToWithholding
    )
      unsupported(`/lines/${i}`, 'Nested, corrective and nationally extended lines are outside this reference scope.');
  });
  if (invoice.source.warnings.some((w) => w.code === 'TEXT_LINE'))
    unsupported(
      '/source/warnings',
      'A text-only source line received a synthetic zero amount; explicit value-origin handling is required.',
    );
  if (issues.length) throw new AnnotationInputError(issues);

  const fields = Object.fromEntries(INPUT_FIELDS.filter((key) => invoice[key] !== undefined).map((key) => [key, invoice[key]]));
  const selected = new Set<string>(INPUT_FIELDS);
  // Preserve derivation evidence for selected canonical paths, without raw XML or XPath maps.
  const derived = invoice.source.derived.filter((d) => selected.has(d.field.split('/')[1]));
  const warnings = invoice.source.warnings.filter((w) => !w.code.startsWith('LINE-')).map(({ code, message }) => ({ code, message }));
  return structuredClone({ ...fields, source: { derived, warnings } }) as LineAnnotationInput;
}

/** Validate atomically, without filtering or repair. Success is structural validity, not commercial correctness. */
export function validateLineAnnotations(raw: unknown, input: LineAnnotationIdentity): AnnotationValidation {
  const issues = identityIssues(input);
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, issues: [{ path: '/', message: 'Expected one complete standard JSON value.' }] };
    }
  }
  const parsed = annotationSchema.safeParse(value);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((i) => ({ path: `/${i.path.join('/')}`, message: i.message })) };
  const out = parsed.data;
  if (out.id !== input.id) issues.push({ path: '/id', message: 'Invoice ID must match the input exactly.' });
  if (out.lines.length !== input.lines.length) issues.push({ path: '/lines', message: 'Every input line must appear exactly once.' });
  const ids = new Set(input.lines.map((line) => line.id));
  const seen = new Set<string>();
  out.lines.forEach((line, i) => {
    const path = `/lines/${i}`;
    if (line.id !== input.lines[i]?.id || seen.has(line.id))
      issues.push({ path: `${path}/id`, message: 'Preserve all source line IDs exactly once and in input order.' });
    seen.add(line.id);
    if (line.targets === null) return;
    if (new Set(line.targets).size !== line.targets.length) issues.push({ path: `${path}/targets`, message: 'Targets must not repeat.' });
    if (line.targets.includes('invoice') && line.targets.length !== 1)
      issues.push({ path: `${path}/targets`, message: 'Whole-invoice scope cannot be mixed with line targets.' });
    if (line.targets.some((id) => id === line.id || (id !== 'invoice' && !ids.has(id))))
      issues.push({ path: `${path}/targets`, message: 'Targets must identify other input lines or the whole invoice.' });
    if (['descriptor', 'adjustment'].includes(line.kind) && !line.targets.length)
      issues.push({
        path: `${path}/targets`,
        message: 'Descriptors and adjustments need known targets or null for an unresolved subject.',
      });
  });
  return issues.length ? { ok: false, issues } : { ok: true, value: out };
}
