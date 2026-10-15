/**
 * Duplicate and re-sent invoice detection across a set of converted documents.
 *
 * Four levels, strongest first:
 *  1. `identical-payload`: same XML payload (payloadSha256 and position in the file). The same invoice in a
 *     different wrapper (PDF, p7m, zip, SBDH), re-signed or re-sent.
 *  2. `same-invoice`: same seller, same normalised invoice number, same issue date and same payable amount.
 *  3. `conflicting-resend`: same seller and number, but a different date or amount. A correction sent under
 *     the old number, or a conflicting re-send.
 *  4. `likely-duplicate`: same seller, same payable amount, issue dates within `windowDays` and similar
 *     lines, but a different number.
 *
 * Credit notes are never duplicates of invoices: documents of a different kind are not compared at levels
 * 2 to 4, and a document that names the other in its preceding-invoice references (BG-3) is a correction
 * of it, not a copy. Those pairs are reported by `pairings()`.
 *
 * The index is incremental (`add` returns the groups the new invoice joined) and persists as JSON. Only
 * compact per-invoice records are stored; links are rebuilt on load.
 */
import type { CanonicalInvoice } from '../canonical.js';
import type { ConvertResult } from '../index.js';

export type DuplicateLevel = 'identical-payload' | 'same-invoice' | 'conflicting-resend' | 'likely-duplicate';

const LEVEL_RANK: Record<DuplicateLevel, number> = {
  'identical-payload': 1,
  'same-invoice': 2,
  'conflicting-resend': 3,
  'likely-duplicate': 4,
};

export interface DuplicateOptions {
  /** Level 4: largest distance in days between issue dates. Default 7. */
  windowDays?: number;
  /** Level 4: smallest line similarity (0 to 1). Default 0.8. */
  minLineSimilarity?: number;
}

const DEFAULTS: Required<DuplicateOptions> = { windowDays: 7, minLineSimilarity: 0.8 };

export type Evidence =
  | { kind: 'same-payload'; sha256: string; fragment: string }
  | { kind: 'same-seller'; key: string; via: SellerKeyKind }
  | {
      kind: 'same-number';
      normalised: string;
      /** Number as written, per document, and the normalisation steps that changed anything. */
      raw: { ref: string; number: string }[];
      steps: NumberStep[];
    }
  | { kind: 'same-date'; date: string }
  | { kind: 'date-within'; days: number; maxDays: number }
  | { kind: 'same-amount'; amount: string; currency: string }
  | { kind: 'similar-lines'; similarity: number; minSimilarity: number }
  | { kind: 'different-date'; dates: string[] }
  | { kind: 'different-amount'; amounts: string[] };

export interface Difference {
  field: string;
  values: { ref: string; value: string }[];
}

export interface DuplicateMember {
  ref: string;
  number: string;
  issueDate: string;
  payable: string;
  currency: string;
  kind: 'invoice' | 'creditNote';
  format: string;
  envelope: string;
  payloadSha256: string;
}

export interface DuplicateGroup {
  level: DuplicateLevel;
  /** 1 to 4, strongest first. */
  rank: number;
  members: DuplicateMember[];
  evidence: Evidence[];
  /** Fields that are not the same in every member. */
  differences: Difference[];
}

export interface CreditPairing {
  /** The document carrying the reference (usually the credit note). */
  ref: string;
  /** The document it refers to through BG-3. */
  refersTo: string;
  number: string;
}

export type SellerKeyKind = 'vat' | 'registration' | 'national-tax-id' | 'endpoint';
export type NumberStep = 'case' | 'whitespace' | 'separators' | 'leading-zeros';

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

export interface NormalisedNumber {
  raw: string;
  normalised: string;
  /** Which steps changed the value. */
  steps: NumberStep[];
}

/**
 * Invoice number key: upper case, whitespace and the usual separators ( - _ / \ . : # ) ignored, leading zeros
 * of digit runs dropped, letters and digits split ("INV0012", "inv-12" and "INV 12" are all "INV-12").
 */
export function normaliseInvoiceNumber(raw: string): NormalisedNumber {
  const steps: NumberStep[] = [];
  let s = raw.normalize('NFKC');
  const trimmed = s.trim().replace(/\s+/g, ' ');
  if (trimmed !== s) steps.push('whitespace');
  s = trimmed;
  const upper = s.toUpperCase();
  if (upper !== s) steps.push('case');
  s = upper;
  const tokens = s.match(/\p{N}+|\p{L}+/gu) ?? [];
  if (/[^\p{L}\p{N}\s]|\s/u.test(s)) steps.push('separators');
  const stripped = tokens.map((t) => (/^\p{N}+$/u.test(t) ? t.replace(/^0+(?=.)/u, '') : t));
  if (stripped.some((t, i) => t !== tokens[i])) steps.push('leading-zeros');
  return { raw, normalised: stripped.join('-'), steps };
}

const normDecimal = (v: string): string => {
  const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(v.trim());
  if (!m) return v.trim();
  const int = (m[2] || '0').replace(/^0+(?=.)/, '');
  const frac = (m[3] ?? '').replace(/0+$/, '');
  const neg = m[1] === '-' && (int !== '0' || frac !== '');
  return `${neg ? '-' : ''}${int}${frac ? `.${frac}` : ''}`;
};

const isZero = (v: string) => /^-?0*(\.0*)?$/.test(v);

const alnum = (s: string) => s.toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');

function sellerKey(inv: CanonicalInvoice): { key: string; via: SellerKeyKind } | null {
  const s = inv.seller;
  if (s.vatId && alnum(s.vatId)) return { key: `vat:${alnum(s.vatId)}`, via: 'vat' };
  const reg = s.legalRegistrationId;
  if (reg?.value && alnum(reg.value)) return { key: `reg:${reg.schemeId ?? ''}:${alnum(reg.value)}`, via: 'registration' };
  const tax = s.nationalTaxIds.find((t) => alnum(t.value));
  if (tax) return { key: `tax:${tax.schemeId ?? ''}:${alnum(tax.value)}`, via: 'national-tax-id' };
  const ep = s.endpoint;
  if (ep?.value && alnum(ep.value)) return { key: `ep:${ep.schemeId ?? ''}:${alnum(ep.value)}`, via: 'endpoint' };
  return null;
}

const lineKey = (l: CanonicalInvoice['lines'][number]) =>
  `${l.item.name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()}|${l.quantity ? normDecimal(l.quantity) : ''}|${normDecimal(l.netAmount)}`;

/** Multiset Jaccard similarity of two line-key lists. */
function similarity(a: string[], b: string[]): number {
  const count = (xs: string[]) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
    return m;
  };
  const ca = count(a);
  const cb = count(b);
  let inter = 0;
  let union = 0;
  for (const k of new Set([...ca.keys(), ...cb.keys()])) {
    const x = ca.get(k) ?? 0;
    const y = cb.get(k) ?? 0;
    inter += Math.min(x, y);
    union += Math.max(x, y);
  }
  return union === 0 ? 0 : inter / union;
}

const dayNumber = (d: string) => Math.floor(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000);

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

/** What the index keeps per invoice. */
export interface IndexEntry {
  ref: string;
  payloadSha256: string;
  /** Position of the invoice inside its payload, so two invoices of one lot are not "identical". */
  fragment: string;
  seller: string | null;
  sellerVia: SellerKeyKind | null;
  number: string;
  numberKey: string;
  numberSteps: NumberStep[];
  issueDate: string;
  payable: string;
  currency: string;
  kind: 'invoice' | 'creditNote';
  typeCode: string;
  format: string;
  envelope: string;
  buyer: string;
  dueDate: string;
  /** Normalised keys of the invoices this one refers to (BG-3). */
  precedingKeys: string[];
  lines: string[];
}

interface Link {
  a: number;
  b: number;
  level: DuplicateLevel;
  evidence: Evidence[];
}

export interface PersistedIndex {
  version: 1;
  options: Required<DuplicateOptions>;
  entries: IndexEntry[];
}

const refOf = (inv: CanonicalInvoice) => {
  const s = inv.source;
  return `${s.filename ?? s.fileSha256.slice(0, 12)}${s.indexInFile !== undefined ? `#${s.indexInFile + 1}` : ''}`;
};

export function entryOf(inv: CanonicalInvoice, ref?: string): IndexEntry {
  const sk = sellerKey(inv);
  const n = normaliseInvoiceNumber(inv.id);
  const s = inv.source;
  return {
    ref: ref ?? refOf(inv),
    payloadSha256: s.payloadSha256,
    fragment: s.fragmentPath ?? String(s.indexInFile ?? 0),
    seller: sk?.key ?? null,
    sellerVia: sk?.via ?? null,
    number: inv.id,
    numberKey: n.normalised,
    numberSteps: n.steps,
    issueDate: inv.issueDate,
    payable: normDecimal(inv.totals.payable),
    currency: inv.currency,
    kind: inv.kind,
    typeCode: String(inv.typeCode),
    format: s.format,
    envelope: s.envelope.map((e) => e.kind).join('>'),
    buyer: inv.buyer.vatId ?? inv.buyer.name ?? '',
    dueDate: inv.dueDate ?? '',
    precedingKeys: inv.precedingInvoices.map((p) => normaliseInvoiceNumber(p.id).normalised),
    lines: inv.lines.map(lineKey),
  };
}

export class DuplicateIndex {
  readonly options: Required<DuplicateOptions>;
  private entries: IndexEntry[] = [];
  private links: Link[] = [];
  private adjacency = new Map<number, Link[]>();
  private byPayload = new Map<string, number[]>();
  private bySeller = new Map<string, number[]>();
  private seen = new Map<string, number>();

  constructor(options: DuplicateOptions = {}) {
    this.options = {
      windowDays: options.windowDays ?? DEFAULTS.windowDays,
      minLineSimilarity: options.minLineSimilarity ?? DEFAULTS.minLineSimilarity,
    };
  }

  get size(): number {
    return this.entries.length;
  }

  /**
   * Adds one invoice and returns the duplicate groups it now belongs to (empty if it stands alone).
   * Adding the same document again (same ref, payload and position) changes nothing.
   */
  add(inv: CanonicalInvoice, ref?: string): DuplicateGroup[] {
    return this.groupOf(this.insert(entryOf(inv, ref)));
  }

  /** Adds every invoice of a conversion result, labelling them by `ref` (default: the filename). */
  addResult(result: ConvertResult, ref?: string): DuplicateGroup[] {
    const invoices = result.outcomes.flatMap((o) => (o.status === 'ok' ? o.invoices : []));
    const ids = invoices.map((inv, i) =>
      this.insert(entryOf(inv, ref === undefined ? undefined : `${ref}${invoices.length > 1 ? `#${i + 1}` : ''}`)),
    );
    const done = new Set<number>();
    const out: DuplicateGroup[] = [];
    for (const id of ids) {
      if (done.has(id)) continue;
      const comp = this.component(id);
      for (const n of comp) done.add(n);
      if (comp.length > 1) out.push(this.build(comp));
    }
    return out;
  }

  private insert(e: IndexEntry): number {
    const dedupe = `${e.ref}\u0000${e.payloadSha256}\u0000${e.fragment}`;
    const existing = this.seen.get(dedupe);
    if (existing !== undefined) return existing;
    const id = this.entries.length;
    this.entries.push(e);
    this.seen.set(dedupe, id);

    const candidates = new Set<number>();
    for (const i of this.byPayload.get(e.payloadSha256) ?? []) candidates.add(i);
    if (e.seller) for (const i of this.bySeller.get(e.seller) ?? []) candidates.add(i);
    for (const i of [...candidates].sort((x, y) => x - y)) {
      const link = this.compare(i, id);
      if (!link) continue;
      this.links.push(link);
      for (const k of [link.a, link.b]) {
        const l = this.adjacency.get(k);
        if (l) l.push(link);
        else this.adjacency.set(k, [link]);
      }
    }
    push(this.byPayload, e.payloadSha256, id);
    if (e.seller) push(this.bySeller, e.seller, id);
    return id;
  }

  private compare(ia: number, ib: number): Link | null {
    const a = this.entries[ia]!;
    const b = this.entries[ib]!;
    if (a.payloadSha256 === b.payloadSha256 && a.fragment === b.fragment) {
      return {
        a: ia,
        b: ib,
        level: 'identical-payload',
        evidence: [{ kind: 'same-payload', sha256: a.payloadSha256, fragment: a.fragment }],
      };
    }
    if (!a.seller || a.seller !== b.seller) return null;
    // Different directions (invoice vs credit note) are corrections of each other, not copies.
    if (a.kind !== b.kind) return null;
    if (a.precedingKeys.includes(b.numberKey) || b.precedingKeys.includes(a.numberKey)) return null;
    const seller: Evidence = { kind: 'same-seller', key: a.seller, via: a.sellerVia! };
    const sameCurrency = a.currency === b.currency;
    const sameAmount = sameCurrency && a.payable === b.payable;

    if (a.numberKey === b.numberKey) {
      const number: Evidence = {
        kind: 'same-number',
        normalised: a.numberKey,
        raw: [
          { ref: a.ref, number: a.number },
          { ref: b.ref, number: b.number },
        ],
        steps: [...new Set([...a.numberSteps, ...b.numberSteps])],
      };
      const sameDate = a.issueDate === b.issueDate;
      if (sameDate && sameAmount) {
        return {
          a: ia,
          b: ib,
          level: 'same-invoice',
          evidence: [
            seller,
            number,
            { kind: 'same-date', date: a.issueDate },
            { kind: 'same-amount', amount: a.payable, currency: a.currency },
          ],
        };
      }
      const ev: Evidence[] = [seller, number];
      if (!sameDate) ev.push({ kind: 'different-date', dates: [a.issueDate, b.issueDate] });
      else ev.push({ kind: 'same-date', date: a.issueDate });
      if (!sameAmount) ev.push({ kind: 'different-amount', amounts: [`${a.payable} ${a.currency}`, `${b.payable} ${b.currency}`] });
      else ev.push({ kind: 'same-amount', amount: a.payable, currency: a.currency });
      return { a: ia, b: ib, level: 'conflicting-resend', evidence: ev };
    }

    if (!sameAmount || isZero(a.payable)) return null;
    const days = Math.abs(dayNumber(a.issueDate) - dayNumber(b.issueDate));
    if (!(days <= this.options.windowDays)) return null;
    if (a.lines.length === 0 || b.lines.length === 0) return null;
    const sim = similarity(a.lines, b.lines);
    if (sim < this.options.minLineSimilarity) return null;
    return {
      a: ia,
      b: ib,
      level: 'likely-duplicate',
      evidence: [
        seller,
        { kind: 'same-amount', amount: a.payable, currency: a.currency },
        { kind: 'date-within', days, maxDays: this.options.windowDays },
        { kind: 'similar-lines', similarity: Math.round(sim * 1000) / 1000, minSimilarity: this.options.minLineSimilarity },
      ],
    };
  }

  private component(start: number): number[] {
    const seen = new Set([start]);
    const queue = [start];
    for (let q = 0; q < queue.length; q++) {
      for (const l of this.adjacency.get(queue[q]!) ?? []) {
        for (const n of [l.a, l.b]) if (!seen.has(n)) seen.add(n), queue.push(n);
      }
    }
    return [...seen].sort((x, y) => x - y);
  }

  private build(ids: number[]): DuplicateGroup {
    const set = new Set(ids);
    const links = this.links.filter((l) => set.has(l.a) && set.has(l.b));
    const level = links.reduce<DuplicateLevel>((best, l) => (LEVEL_RANK[l.level] < LEVEL_RANK[best] ? l.level : best), 'likely-duplicate');
    const evidence: Evidence[] = [];
    const keys = new Set<string>();
    for (const l of links.slice().sort((x, y) => LEVEL_RANK[x.level] - LEVEL_RANK[y.level])) {
      for (const ev of l.evidence) {
        const k = JSON.stringify(ev);
        if (!keys.has(k)) keys.add(k), evidence.push(ev);
      }
    }
    const members = ids.map((i) => {
      const e = this.entries[i]!;
      return {
        ref: e.ref,
        number: e.number,
        issueDate: e.issueDate,
        payable: e.payable,
        currency: e.currency,
        kind: e.kind,
        format: e.format,
        envelope: e.envelope,
        payloadSha256: e.payloadSha256,
      };
    });
    return { level, rank: LEVEL_RANK[level], members, evidence, differences: differencesOf(ids.map((i) => this.entries[i]!)) };
  }

  private groupOf(id: number): DuplicateGroup[] {
    const ids = this.component(id);
    return ids.length > 1 ? [this.build(ids)] : [];
  }

  /** All duplicate groups, strongest level first. */
  groups(): DuplicateGroup[] {
    const done = new Set<number>();
    const out: DuplicateGroup[] = [];
    for (let i = 0; i < this.entries.length; i++) {
      if (done.has(i) || !this.adjacency.has(i)) continue;
      const ids = this.component(i);
      for (const n of ids) done.add(n);
      out.push(this.build(ids));
    }
    return out.sort((a, b) => a.rank - b.rank);
  }

  /** Credit notes (or any document) that name another indexed document in BG-3, same seller. */
  pairings(): CreditPairing[] {
    const out: CreditPairing[] = [];
    for (const e of this.entries) {
      if (!e.seller || e.precedingKeys.length === 0) continue;
      for (const i of this.bySeller.get(e.seller) ?? []) {
        const other = this.entries[i]!;
        if (other !== e && e.precedingKeys.includes(other.numberKey)) out.push({ ref: e.ref, refersTo: other.ref, number: other.number });
      }
    }
    return out;
  }

  toJSON(): PersistedIndex {
    return { version: 1, options: this.options, entries: this.entries };
  }

  static fromJSON(data: PersistedIndex | string, options?: DuplicateOptions): DuplicateIndex {
    const p: PersistedIndex = typeof data === 'string' ? JSON.parse(data) : data;
    if (!p || p.version !== 1 || !Array.isArray(p.entries)) throw new Error('Not a duplicate index (expected version 1)');
    const idx = new DuplicateIndex({
      windowDays: options?.windowDays ?? p.options.windowDays,
      minLineSimilarity: options?.minLineSimilarity ?? p.options.minLineSimilarity,
    });
    for (const e of p.entries) idx.insert(e);
    return idx;
  }
}

function push(m: Map<string, number[]>, key: string, id: number) {
  const l = m.get(key);
  if (l) l.push(id);
  else m.set(key, [id]);
}

function differencesOf(entries: IndexEntry[]): Difference[] {
  const fields: [string, (e: IndexEntry) => string][] = [
    ['number', (e) => e.number],
    ['issueDate', (e) => e.issueDate],
    ['payable', (e) => `${e.payable} ${e.currency}`],
    ['dueDate', (e) => e.dueDate],
    ['buyer', (e) => e.buyer],
    ['type', (e) => e.typeCode],
    ['lineCount', (e) => String(e.lines.length)],
    ['format', (e) => e.format],
    ['envelope', (e) => e.envelope],
    ['payloadSha256', (e) => e.payloadSha256],
  ];
  const out: Difference[] = [];
  for (const [field, get] of fields) {
    const values = entries.map((e) => ({ ref: e.ref, value: get(e) }));
    if (new Set(values.map((v) => v.value)).size > 1) out.push({ field, values });
  }
  return out;
}

/** One-shot: index the invoices and return the groups. */
export function findDuplicates(invoices: CanonicalInvoice[], options?: DuplicateOptions): DuplicateGroup[] {
  const idx = new DuplicateIndex(options);
  for (const inv of invoices) idx.add(inv);
  return idx.groups();
}

/** Plain-text report, one block per group. */
export function formatReport(groups: DuplicateGroup[], pairings: CreditPairing[] = []): string {
  const lines: string[] = [];
  for (const g of groups) {
    lines.push(`[${g.rank}] ${g.level}: ${g.members.length} documents`);
    for (const m of g.members)
      lines.push(
        `    ${m.ref}  ${m.number}  ${m.issueDate}  ${m.payable} ${m.currency}  (${m.format}${m.envelope ? `, ${m.envelope}` : ''})`,
      );
    for (const ev of g.evidence) lines.push(`    evidence: ${describe(ev)}`);
    for (const d of g.differences.filter((x) => x.field !== 'payloadSha256' && x.field !== 'envelope' && x.field !== 'format'))
      lines.push(`    differs: ${d.field}: ${d.values.map((v) => `${v.value || '-'}`).join(' | ')}`);
  }
  for (const p of pairings) lines.push(`credit/correction: ${p.ref} refers to ${p.refersTo} (${p.number}); not a duplicate`);
  return lines.join('\n');
}

function describe(ev: Evidence): string {
  switch (ev.kind) {
    case 'same-payload':
      return `same payload sha256 ${ev.sha256.slice(0, 12)}…`;
    case 'same-seller':
      return `same seller (${ev.via}) ${ev.key}`;
    case 'same-number':
      return `same number "${ev.normalised}" (${ev.raw.map((r) => `"${r.number}"`).join(', ')}${ev.steps.length ? `; normalised: ${ev.steps.join(', ')}` : ''})`;
    case 'same-date':
      return `same issue date ${ev.date}`;
    case 'date-within':
      return `issue dates ${ev.days} day(s) apart (limit ${ev.maxDays})`;
    case 'same-amount':
      return `same payable amount ${ev.amount} ${ev.currency}`;
    case 'similar-lines':
      return `line similarity ${ev.similarity} (minimum ${ev.minSimilarity})`;
    case 'different-date':
      return `different issue dates ${ev.dates.join(' / ')}`;
    case 'different-amount':
      return `different payable amounts ${ev.amounts.join(' / ')}`;
  }
}
