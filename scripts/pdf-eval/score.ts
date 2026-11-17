/**
 * Scores what the PDF extractor read from one document against an answer key, field by field.
 *
 * The answer key is either a Swedish truth file (format: `se-pdf/truth/SCHEMA.md` in the private cache repository)
 * or, for hybrid PDFs, the invoice converted from the embedded XML. Both become an {@link Expected}; the extractor's
 * result (an `ok` invoice or a `draft`) is read through the same field table, so `ok` and `draft` are scored alike.
 *
 * Verdicts per field:
 * - `correct`: the key has a value and the extractor gave an equal one.
 * - `missing`: the key has a value and the extractor gave none; `missingReported` when a problem names the field.
 * - `wrong`: the key has a value and the extractor gave only different ones. The release gate counts these.
 * - `extraOnAbsent`: the key records the field as absent or unreadable, the extractor gave a value. Not wrong:
 *   the key holds printed figures only, while the extractor may compute totals.
 * - `notScored`: absent or unreadable in the key, and nothing extracted; or not comparable (VAT-inclusive line amounts).
 * - `notExtracted`: the key has a value, the document was not extracted (unsupported, not an invoice, error).
 * - `unaligned`: line fields when the extractor found a different, non-zero number of lines (scored once as `lines.count`).
 */
import type { CanonicalInvoice, SourceWarning } from '../../src/canonical.js';
import type { PdfOutcome } from '../../src/index.js';

export type Missing = { status: 'absent' | 'unreadable'; note?: string };
export type Leaf = { value: string; page?: number; note?: string } | Missing;
/** Row cells are leaves, except `categoryCode`, which is a plain code. */
type Rows = { rows: Record<string, Leaf | string>[] } | Missing;

/** One Swedish truth file (schemaVersion 1). */
export interface Truth {
  schemaVersion: 1;
  file: string;
  sha256: string;
  documentType: string;
  typeCode: string;
  invoicePages: number[];
  pricesIncludeVat: boolean;
  fields: Record<string, Leaf>;
  vatBreakdown: Rows;
  lines: Rows;
  expectedProblems?: { path: string; kind: 'identifier-check' | 'not-reconciling'; detail: string }[];
  notes?: string;
}

/** An expected value is one or more acceptable values (an XML invoice can hold several accounts), or a missing status. */
export type ExpectedLeaf = { values: string[] } | Missing;
export interface Expected {
  /** Opaque or repository-relative id; never file content. */
  id: string;
  docType: string;
  fields: Record<string, ExpectedLeaf>;
  vatRows?: Record<string, ExpectedLeaf>[] | Missing;
  lineRows?: Record<string, ExpectedLeaf>[] | Missing;
  /** Line amounts include VAT: `netAmount` and `price.net` are not comparable with the canonical net amounts. */
  pricesIncludeVat: boolean;
  identifierChecks: string[];
  notReconciling: boolean;
  /** Swedish keys follow SCHEMA.md normalisation (digits only for giro numbers and OCR); paired keys compare as printed. */
  swedish: boolean;
}

export const VERDICTS = [
  'correct',
  'missing',
  'missingReported',
  'wrong',
  'extraOnAbsent',
  'notScored',
  'notExtracted',
  'unaligned',
] as const;
export type Verdict = Exclude<(typeof VERDICTS)[number], 'missingReported'>;
export type FieldCounts = Record<(typeof VERDICTS)[number], number>;

type Kind = 'text' | 'id' | 'digits' | 'upper' | 'decimal' | 'exact';
// biome-ignore lint/suspicious/noExplicitAny: reads a canonical invoice or a partial one rebuilt from draft pointers
type Doc = any;
type Field = { kind: Kind; get: (d: Doc) => unknown[]; flag: string[] };

const arr = (v: unknown): Doc[] => (Array.isArray(v) ? v : []);
const one = (v: unknown) => (v === undefined || v === null ? [] : [v]);
const idValue = (v: Doc) => (v && typeof v === 'object' ? v.value : v);
const transfers = (d: Doc) => arr(d.payments).flatMap((p) => arr(p?.creditTransfers));
const giro = (code: string) => (d: Doc) => transfers(d).flatMap((t) => (t?.serviceProviderId === code ? one(t.accountId) : []));
const ibanLike = (t: Doc) =>
  typeof t?.accountId === 'string' &&
  !String(t.serviceProviderId ?? '').startsWith('SE:') &&
  /^[A-Z]{2}\d{2}[A-Z0-9]{8,}$/.test(norm('upper', t.accountId));
const PREPAID_NOTES = /\b(ROT|RUT|GRON_TEKNIK)\b/g;

/** Truth key -> how to read it from a canonical invoice, how to normalise it, and which problem fields flag it. */
export const FIELDS: Record<string, Field> = {
  typeCode: { kind: 'exact', get: (d) => one(d.typeCode), flag: ['/typeCode'] },
  id: { kind: 'id', get: (d) => one(d.id), flag: ['/id'] },
  issueDate: { kind: 'exact', get: (d) => one(d.issueDate), flag: ['/issueDate'] },
  dueDate: { kind: 'exact', get: (d) => one(d.dueDate), flag: ['/dueDate'] },
  currency: { kind: 'upper', get: (d) => one(d.currency), flag: ['/currency'] },
  'seller.name': { kind: 'text', get: (d) => one(d.seller?.name), flag: ['/seller/name'] },
  'seller.legalRegistrationId': {
    kind: 'digits',
    get: (d) => one(idValue(d.seller?.legalRegistrationId)),
    flag: ['/seller/legalRegistrationId'],
  },
  'seller.vatId': { kind: 'upper', get: (d) => one(d.seller?.vatId), flag: ['/seller/vatId'] },
  'seller.taxRegistrationId': { kind: 'text', get: (d) => one(d.seller?.taxRegistrationId), flag: ['/seller/taxRegistrationId'] },
  'buyer.name': { kind: 'text', get: (d) => one(d.buyer?.name), flag: ['/buyer/name'] },
  'payee.name': { kind: 'text', get: (d) => one(d.payee?.name), flag: ['/payee'] },
  'payment.bankgiro': { kind: 'digits', get: giro('SE:BANKGIRO'), flag: ['/payments'] },
  'payment.plusgiro': { kind: 'digits', get: giro('SE:PLUSGIRO'), flag: ['/payments'] },
  'payment.iban': { kind: 'upper', get: (d) => transfers(d).flatMap((t) => (ibanLike(t) ? [t.accountId] : [])), flag: ['/payments'] },
  'payment.bic': {
    kind: 'upper',
    get: (d) => transfers(d).flatMap((t) => (ibanLike(t) ? one(t.serviceProviderId) : [])),
    flag: ['/payments'],
  },
  'payment.remittanceInformation': {
    kind: 'digits',
    get: (d) => arr(d.payments).flatMap((p) => one(p?.remittanceInformation)),
    flag: ['/payments'],
  },
  ...Object.fromEntries(
    ['lineNetTotal', 'allowanceTotal', 'chargeTotal', 'taxExclusive', 'vatTotal', 'taxInclusive', 'prepaid', 'rounding', 'payable'].map(
      (k) => [`totals.${k}`, { kind: 'decimal', get: (d: Doc) => one(d.totals?.[k]), flag: [`/totals/${k}`] } satisfies Field],
    ),
  ),
  'totals.prepaidNote': {
    kind: 'exact',
    get: (d) => arr(d.notes).flatMap((n) => [...String(n?.text ?? '').matchAll(PREPAID_NOTES)].map((m) => m[1])),
    flag: ['/notes', '/totals/prepaid'],
  },
};

export const VAT_FIELDS: Record<string, Field> = {
  taxableAmount: { kind: 'decimal', get: (r) => one(r?.taxableAmount), flag: ['/vatBreakdown'] },
  taxAmount: { kind: 'decimal', get: (r) => one(r?.taxAmount), flag: ['/vatBreakdown'] },
};

export const LINE_FIELDS: Record<string, Field> = {
  'item.name': { kind: 'text', get: (l) => one(l?.item?.name), flag: ['/lines'] },
  quantity: { kind: 'decimal', get: (l) => one(l?.quantity), flag: ['/lines'] },
  unitText: { kind: 'text', get: (l) => one(l?.unitText), flag: ['/lines'] },
  'price.net': { kind: 'decimal', get: (l) => one(l?.price?.net), flag: ['/lines'] },
  'vat.rate': { kind: 'decimal', get: (l) => one(l?.vat?.rate), flag: ['/lines'] },
  netAmount: { kind: 'decimal', get: (l) => one(l?.netAmount), flag: ['/lines'] },
};
const VAT_INCLUSIVE = new Set(['netAmount', 'price.net']);

/** Canonical decimal form: no sign on zero, no leading or trailing zeros. `null` when not a plain decimal. */
export function decimal(s: string): string | null {
  const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(s.trim());
  if (!m || (!m[2] && !m[3])) return null;
  const int = (m[2] ?? '').replace(/^0+/, '') || '0';
  const frac = (m[3] ?? '').replace(/0+$/, '');
  const abs = frac ? `${int}.${frac}` : int;
  return m[1] === '-' && abs !== '0' ? `-${abs}` : abs;
}

/** Normalises a value as SCHEMA.md does for the key; amounts compare as exact decimals, never as floats. */
export function norm(kind: Kind, v: unknown, swedish = true): string {
  const s = String(v);
  switch (kind) {
    case 'text':
      return s.replace(/\s+/g, ' ').trim();
    case 'id':
      return s.replace(/\s+/g, '');
    case 'digits':
      return swedish ? s.replace(/\D/g, '') : s.replace(/\s+/g, '').toUpperCase();
    case 'upper':
      return s.replace(/\s+/g, '').toUpperCase();
    case 'decimal':
      return decimal(s) ?? s.trim();
    default:
      return s.trim();
  }
}

/** Rebuilds a partial canonical object from draft JSON Pointers (`/payments/0/creditTransfers/0/accountId`). */
export function unflatten(fields: Record<string, string>): Doc {
  const root: Doc = {};
  for (const [pointer, value] of Object.entries(fields)) {
    const parts = pointer
      .split('/')
      .slice(1)
      .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
    let node = root;
    parts.forEach((p, i) => {
      if (i === parts.length - 1) node[p] = value;
      else node = node[p] ??= /^\d+$/.test(parts[i + 1] as string) ? [] : {};
    });
  }
  return root;
}

/** Draft pointers this harness reads; everything else is reported (as a pattern, never a value) so a mismatch with the extractor shows. */
const KNOWN_POINTERS = [
  /^\/(id|issueDate|dueDate|currency|typeCode)$/,
  /^\/seller\/(name|vatId|taxRegistrationId|legalRegistrationId(\/value)?)$/,
  /^\/(buyer|payee)\/name$/,
  /^\/payments\/N\/(remittanceInformation|creditTransfers\/N\/(accountId|serviceProviderId))$/,
  /^\/totals\/(lineNetTotal|allowanceTotal|chargeTotal|taxExclusive|vatTotal|taxInclusive|prepaid|rounding|payable)$/,
  /^\/notes\/N\/text$/,
  /^\/vatBreakdown\/N\/(categoryCode|rate|taxableAmount|taxAmount)$/,
  /^\/lines\/N\/(item\/name|quantity|unitText|price\/net|vat\/rate|netAmount)$/,
];
export const pointerPattern = (p: string) => p.replace(/\/\d+(?=\/|$)/g, '/N');
export const isKnownPointer = (p: string) => KNOWN_POINTERS.some((r) => r.test(pointerPattern(p)));

const leafOf = (l: Leaf | string): ExpectedLeaf => (typeof l === 'string' ? { values: [l] } : 'value' in l ? { values: [l.value] } : l);
const rowsOf = (r: Rows): Record<string, ExpectedLeaf>[] | Missing =>
  'rows' in r ? r.rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, leafOf(v)]))) : r;

/** Opaque id for a Swedish file: a SHA-256 prefix, since file names name the issuer. */
export const opaqueId = (sha256: string) => sha256.slice(0, 12);

export function fromTruth(t: Truth): Expected {
  return {
    id: opaqueId(t.sha256),
    docType: t.documentType,
    fields: { typeCode: { values: [t.typeCode] }, ...Object.fromEntries(Object.entries(t.fields).map(([k, v]) => [k, leafOf(v)])) },
    vatRows: rowsOf(t.vatBreakdown),
    lineRows: rowsOf(t.lines),
    pricesIncludeVat: t.pricesIncludeVat,
    identifierChecks: (t.expectedProblems ?? []).filter((p) => p.kind === 'identifier-check').map((p) => p.path.replace(/^fields\./, '')),
    notReconciling: (t.expectedProblems ?? []).some((p) => p.kind === 'not-reconciling'),
    swedish: true,
  };
}

const expectFrom = (fields: Record<string, Field>, d: Doc, swedish: boolean): Record<string, ExpectedLeaf> =>
  Object.fromEntries(
    Object.entries(fields).map(([k, f]) => {
      const values = [...new Set(f.get(d).map((v) => norm(f.kind, v, swedish)))].filter((v) => v !== '');
      return [k, values.length ? { values } : { status: 'absent' }];
    }),
  );

/** The answer key for a hybrid PDF: the invoice converted from its embedded XML. */
export function fromInvoice(inv: CanonicalInvoice, id: string, docType: string): Expected {
  const fields = expectFrom(FIELDS, inv, false);
  return {
    id,
    docType,
    fields,
    vatRows: inv.vatBreakdown.length
      ? inv.vatBreakdown.map((r) => ({
          ...expectFrom(VAT_FIELDS, r, false),
          categoryCode: { values: [r.categoryCode] },
          rate: r.rate === undefined ? { status: 'absent' } : { values: [norm('decimal', r.rate)] },
        }))
      : { status: 'absent' },
    lineRows: inv.lines.length ? inv.lines.map((l) => expectFrom(LINE_FIELDS, l, false)) : { status: 'absent' },
    pricesIncludeVat: false,
    identifierChecks: [],
    notReconciling: false,
    swedish: false,
  };
}

export interface DocScore {
  id: string;
  docType: string;
  status: PdfOutcome['status'] | 'none';
  /** Unsupported reason or error, for clustering. */
  message?: string;
  fields: Record<string, Partial<FieldCounts>>;
  identifierChecks: { expected: number; flagged: number; unflagged: number; corrected: number };
  notReconciling?: 'flagged' | 'unflagged' | 'notExtracted';
  /** Problem and warning codes of the extraction. */
  problemCodes: string[];
  /** Draft pointer patterns (`/lines/N/foo`) and problem fields this harness does not read. */
  unmappedPointers: string[];
}

const count = (into: DocScore['fields'], key: string, v: Verdict | 'missingReported') => {
  into[key] ??= {};
  const c = into[key];
  c[v] = (c[v] ?? 0) + 1;
};

/** Scores one extraction against its answer key. */
export function score(exp: Expected, outcome: PdfOutcome | undefined): DocScore {
  const doc: Doc | undefined =
    outcome?.status === 'ok' ? outcome.invoices[0] : outcome?.status === 'draft' ? unflatten(outcome.draft.fields) : undefined;
  const problems: SourceWarning[] =
    outcome?.status === 'ok' ? (outcome.invoices[0]?.source.warnings ?? []) : outcome?.status === 'draft' ? outcome.draft.problems : [];
  const flagged = (f: Field) => problems.some((p) => p.field !== undefined && f.flag.some((prefix) => p.field?.startsWith(prefix)));
  const s: DocScore = {
    id: exp.id,
    docType: exp.docType,
    status: outcome?.status ?? 'none',
    message:
      outcome?.status === 'unsupported' || outcome?.status === 'not-an-invoice'
        ? outcome.reason
        : outcome?.status === 'error'
          ? outcome.error
          : undefined,
    fields: {},
    identifierChecks: { expected: exp.identifierChecks.length, flagged: 0, unflagged: 0, corrected: 0 },
    problemCodes: problems.map((p) => p.code),
    unmappedPointers: [
      ...new Set([
        ...(outcome?.status === 'draft' ? Object.keys(outcome.draft.fields).filter((p) => !isKnownPointer(p)) : []),
        ...problems.flatMap((p) =>
          p.field && !isKnownPointer(p.field) && !/^\/(payments|payee|notes|vatBreakdown|lines|source)(\/|$)/.test(p.field)
            ? [p.field]
            : [],
        ),
      ]),
    ].map(pointerPattern),
  };

  const judge = (key: string, f: Field, want: ExpectedLeaf | undefined, from: Doc | undefined, skip = false): Verdict | undefined => {
    if (!want) return undefined;
    const has = 'values' in want;
    let v: Verdict;
    if (!doc) v = has ? 'notExtracted' : 'notScored';
    else {
      const got =
        from === undefined
          ? []
          : f
              .get(from)
              .map((x) => norm(f.kind, x, exp.swedish))
              .filter((x) => x !== '');
      if (skip) v = 'notScored';
      else if (!has) v = got.length ? 'extraOnAbsent' : 'notScored';
      else if (!got.length) v = 'missing';
      else v = got.some((g) => want.values.some((w) => norm(f.kind, w, exp.swedish) === g)) ? 'correct' : 'wrong';
    }
    count(s.fields, key, v);
    if (v === 'missing' && flagged(f)) count(s.fields, key, 'missingReported');
    return v;
  };

  for (const [key, f] of Object.entries(FIELDS)) {
    const v = judge(key, f, exp.fields[key], doc);
    if (!exp.identifierChecks.includes(key) || !doc) continue;
    if (v === 'wrong') s.identifierChecks.corrected++;
    else if (flagged(f)) s.identifierChecks.flagged++;
    else s.identifierChecks.unflagged++;
  }
  if (exp.notReconciling) s.notReconciling = !doc ? 'notExtracted' : outcome?.status === 'draft' ? 'flagged' : 'unflagged';

  // VAT breakdown: each key row takes the first unused extracted row with its category and rate (a missing rate is 0;
  // an unreadable rate in the key matches any). Extracted rows left over are wrong.
  const gotVat: Doc[] = doc ? arr(doc.vatBreakdown) : [];
  const rate = (r: unknown) => norm('decimal', r ?? '0');
  if (exp.vatRows && 'status' in exp.vatRows) {
    count(s.fields, 'vatBreakdown.rows', !doc ? 'notScored' : gotVat.length ? 'extraOnAbsent' : 'notScored');
  } else if (exp.vatRows) {
    const used = new Set<number>();
    for (const row of exp.vatRows) {
      const cat = row.categoryCode && 'values' in row.categoryCode ? row.categoryCode.values[0] : undefined;
      const want = row.rate && 'values' in row.rate ? rate(row.rate.values[0]) : undefined;
      const i = gotVat.findIndex((r, j) => !used.has(j) && r?.categoryCode === cat && (want === undefined || rate(r?.rate) === want));
      if (i >= 0) used.add(i);
      for (const [fk, f] of Object.entries(VAT_FIELDS)) judge(`vatBreakdown.${fk}`, f, row[fk], gotVat[i]);
    }
    if (doc) for (let j = 0; j < gotVat.length; j++) count(s.fields, 'vatBreakdown.rows', used.has(j) ? 'correct' : 'wrong');
  }

  // Lines: aligned by index only when the counts agree, so one missed line does not shift every later one.
  const gotLines: Doc[] = doc ? arr(doc.lines) : [];
  if (exp.lineRows && 'status' in exp.lineRows) {
    count(s.fields, 'lines.count', !doc ? 'notScored' : gotLines.length ? 'extraOnAbsent' : 'notScored');
  } else if (exp.lineRows) {
    const n = exp.lineRows.length;
    count(s.fields, 'lines.count', !doc ? 'notExtracted' : !gotLines.length ? 'missing' : gotLines.length === n ? 'correct' : 'wrong');
    exp.lineRows.forEach((row, i) => {
      for (const [fk, f] of Object.entries(LINE_FIELDS)) {
        if (doc && gotLines.length && gotLines.length !== n) {
          if (row[fk]) count(s.fields, `lines.${fk}`, 'unaligned');
        } else judge(`lines.${fk}`, f, row[fk], gotLines[i], exp.pricesIncludeVat && VAT_INCLUSIVE.has(fk));
      }
    });
  }
  return s;
}
