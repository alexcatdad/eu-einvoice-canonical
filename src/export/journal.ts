/**
 * Turns a received (supplier) invoice into a balanced journal entry.
 *
 * The caller supplies the chart of accounts as an `AccountMapping`; nothing here knows a particular
 * national chart. Postings follow the invoice from the buyer's side:
 *
 *   Dr expense (per line, or per VAT category when the source has no usable lines)
 *   Dr input VAT (per rate)
 *   Dr other taxes on top, rounding
 *   Cr withholding, split-payment VAT, prepaid amount
 *   Cr accounts payable (= `totals.payable`)
 *
 * A reverse-charge VAT category (AE by default) books input and output VAT at the buyer's own rate.
 * Credit notes reverse every posting (`effectiveSign`). All arithmetic is exact decimal arithmetic from
 * `values.ts`. The builder never emits an entry whose debits and credits differ: it throws a
 * `JournalError` that says by how much and which amounts were involved.
 */
import { type CanonicalInvoice, type Decimal, effectiveSign, type Identifier, type IsoDate, type Item } from '../canonical.js';
import { cmp, isZero, neg, percentOf, round, sign, sum, toDecimal } from '../values.js';

// ---------------------------------------------------------------------------
// Account mapping
// ---------------------------------------------------------------------------

export interface ExpenseMatch {
  /** Line id (BT-126). */
  lineId?: string | string[];
  /** VAT category code of the line (S, Z, E, AE, K, G, O, L, M). */
  vatCategory?: string | string[];
  /** VAT rate in percent, compared numerically ('25', '25.00'). */
  rate?: string | string[];
  /** Seller VAT number, national tax id or other identifier; spaces, dots and dashes are ignored. */
  seller?: string | string[];
  /** Item classification: `code` is a prefix, `listId` (when given) must equal the list id, ignoring case. */
  classification?: { code: string; listId?: string } | { code: string; listId?: string }[];
}

export interface ExpenseRule {
  account: string;
  /** Every stated criterion must match. A rule without `match` matches everything. */
  match?: ExpenseMatch;
}

export interface ReverseChargeAccounts {
  inputVat: string;
  outputVat: string;
  /**
   * The buyer's own VAT rate in percent. Invoices under reverse charge state no VAT, so the rate is not on the
   * document; it is used only when the invoice itself gives no rate for the category.
   */
  rate?: string;
  /** VAT categories booked as reverse charge. Default ['AE']. */
  categories?: string[];
}

export interface AccountMapping {
  /** Accounts payable. Credited with `totals.payable`. */
  payable: string;
  /** Input VAT: one account, or per rate with a default. */
  inputVat: string | { default: string; byRate?: Record<string, string> };
  /** Expense or cost accounts, first matching rule wins. */
  expense: ExpenseRule[];
  /** Used when no rule matches. */
  defaultExpense: string;
  /** Use the line's accounting reference (BT-133, or the invoice's BT-19) as the account when it is set. Off by default. */
  useAccountingRef?: boolean;
  /** Document-level allowances and charges. Without these they use the expense rules. */
  allowances?: string;
  charges?: string;
  reverseCharge?: ReverseChargeAccounts;
  /** Withholding tax deducted by the buyer: one account, or per scheme ('IT:RT01') with a 'default' key. */
  withholding?: string | Record<string, string>;
  /** VAT the buyer pays to the tax authority (split payment). */
  splitPaymentVat?: string;
  /** Rounding (BT-114) and, up to `roundingTolerance`, small residuals. */
  rounding?: string;
  /** Amounts already paid (BT-113). */
  prepaid?: string;
  /** Other taxes that sit on top of the total (ES recargo de equivalencia): one account, or per scheme with a 'default' key. */
  otherTaxes?: string | Record<string, string>;
  /** Difference between the amount to pay and the invoice total that the source explains with its own settlement (KSeF Rozliczenie). */
  settlement?: string;
  /** Names for the SIE `#KONTO` records and the CSV. */
  accountNames?: Record<string, string>;
}

export interface BuildOptions {
  /** 'account' (default) sums postings per account and role; 'line' keeps one posting per invoice line. */
  granularity?: 'account' | 'line';
  /** Residuals up to this amount are booked to `rounding`. Default '0': any difference is refused. */
  roundingTolerance?: string;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type PostingRole =
  | 'expense'
  | 'allowance'
  | 'charge'
  | 'other-tax'
  | 'input-vat'
  | 'reverse-charge-input-vat'
  | 'reverse-charge-output-vat'
  | 'rounding'
  | 'withholding'
  | 'split-payment-vat'
  | 'prepaid'
  | 'payable'
  | 'settlement';

export interface JournalLine {
  account: string;
  accountName?: string;
  /** Non-negative; exactly one of debit and credit is non-zero. */
  debit: Decimal;
  credit: Decimal;
  role: PostingRole;
  text: string;
  vatCategory?: string;
  vatRate?: string;
  /** Invoice line ids behind this posting. */
  lineIds?: string[];
}

export interface JournalEntry {
  invoiceId: string;
  format: string;
  kind: 'invoice' | 'creditNote';
  /** Booking date: the invoice issue date. */
  date: IsoDate;
  dueDate?: IsoDate;
  currency: string;
  supplier: { name?: string; vatId?: string };
  buyer: { name?: string; vatId?: string; identifiers: Identifier[] };
  text: string;
  lines: JournalLine[];
  totalDebit: Decimal;
  totalCredit: Decimal;
  /** What the builder had to decide on its own: reverse-charge rates taken from the mapping, residuals booked, sign handling. */
  notes: string[];
}

export class JournalError extends Error {
  constructor(
    readonly code: 'unbalanced' | 'missing-account' | 'invalid-mapping' | 'unsupported',
    message: string,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

interface Context {
  lineId?: string;
  vatCategory?: string;
  rate?: string;
  item?: Item;
  accountingRef?: string;
}

const list = <T>(v: T | T[] | undefined): T[] | undefined => (v === undefined ? undefined : Array.isArray(v) ? v : [v]);
const norm = (s: string) => s.replace(/[\s.-]/g, '').toUpperCase();

function sellerIds(inv: CanonicalInvoice): string[] {
  const s = inv.seller;
  return [s.vatId, ...s.identifiers.map((i) => i.value), s.legalRegistrationId?.value, ...s.nationalTaxIds.map((i) => i.value)]
    .filter((v): v is string => !!v)
    .map(norm);
}

function matches(m: ExpenseMatch, c: Context, seller: string[]): boolean {
  const lineIds = list(m.lineId);
  if (lineIds && !(c.lineId !== undefined && lineIds.includes(c.lineId))) return false;
  const cats = list(m.vatCategory);
  if (cats && !(c.vatCategory !== undefined && cats.includes(c.vatCategory))) return false;
  const rates = list(m.rate);
  if (rates && !(c.rate !== undefined && rates.some((r) => cmp(r, c.rate as string) === 0))) return false;
  const sellers = list(m.seller);
  if (sellers && !sellers.some((s) => seller.includes(norm(s)))) return false;
  const classes = list(m.classification);
  if (
    classes &&
    !classes.some((k) =>
      (c.item?.classifications ?? []).some(
        (x) => x.code.startsWith(k.code) && (k.listId === undefined || x.listId.toLowerCase() === k.listId.toLowerCase()),
      ),
    )
  )
    return false;
  return true;
}

function need(account: string | undefined, what: string): string {
  if (!account) throw new JournalError('missing-account', `The account mapping has no account for ${what}; add it to the mapping`);
  return account;
}

function byScheme(map: string | Record<string, string> | undefined, scheme: string, what: string): string {
  if (typeof map === 'string') return map;
  return need(map?.[scheme] ?? map?.default, `${what} (scheme ${scheme}; set a string or a "default" key)`);
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

interface Posting {
  account: string;
  /** Signed: debit positive, credit negative. */
  amount: Decimal;
  role: PostingRole;
  text: string;
  vatCategory?: string;
  vatRate?: string;
  lineIds?: string[];
}

const ZERO = '0.00' as Decimal;

/** Text of a posting that sums several, by role. */
const MERGED_TEXT: Record<PostingRole, string> = {
  expense: 'Expenses',
  allowance: 'Allowances',
  charge: 'Charges',
  'other-tax': 'Other taxes',
  'input-vat': 'Input VAT',
  'reverse-charge-input-vat': 'Reverse-charge input VAT',
  'reverse-charge-output-vat': 'Reverse-charge output VAT',
  rounding: 'Rounding',
  withholding: 'Withholding',
  'split-payment-vat': 'Split-payment VAT',
  prepaid: 'Prepaid amount',
  payable: 'Accounts payable',
  settlement: 'Settlement difference',
};
const clip = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Direction of the postings. `effectiveSign()` for every document except a credit note that keeps negative
 * source amounts (Finvoice INV02): its amounts already point the right way, so flipping them again would
 * book it as an invoice.
 */
function ledgerSign(inv: CanonicalInvoice, notes: string[]): 1 | -1 {
  const s = effectiveSign(inv);
  if (s === -1 && sign(inv.totals.taxInclusive) < 0) {
    notes.push('Credit note with negative source amounts: the amounts already reverse the invoice, so no further sign change was applied');
    return 1;
  }
  return s;
}

/** Sums postings per account and role. */
function aggregate(postings: Posting[]): Posting[] {
  const groups = new Map<string, Posting[]>();
  for (const p of postings) {
    const k = `${p.account}\u0000${p.role}`;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  return [...groups.values()].map((g) => ({
    ...g[0],
    amount: sum(g.map((p) => p.amount)),
    text: g.length === 1 ? g[0].text : `${MERGED_TEXT[g[0].role]} (${g.length})`,
    vatCategory: new Set(g.map((p) => p.vatCategory)).size === 1 ? g[0].vatCategory : undefined,
    vatRate: new Set(g.map((p) => p.vatRate)).size === 1 ? g[0].vatRate : undefined,
    lineIds: g.flatMap((p) => p.lineIds ?? []),
  }));
}

export function buildJournalEntry(inv: CanonicalInvoice, mapping: AccountMapping, options: BuildOptions = {}): JournalEntry {
  const notes: string[] = [];
  const s = ledgerSign(inv, notes);
  const signed = (v: string): Decimal => (s === 1 ? toDecimal(v) : neg(v));
  const credit = (v: string): Decimal => neg(signed(v));
  const t = inv.totals;
  const seller = sellerIds(inv);
  const postings: Posting[] = [];
  const push = (p: Posting) => {
    if (!isZero(p.amount)) postings.push(p);
  };

  const expenseAccount = (c: Context): string => {
    if (mapping.useAccountingRef) {
      const ref = c.accountingRef ?? inv.accountingRef;
      if (ref) return ref;
    }
    for (const rule of mapping.expense) if (!rule.match || matches(rule.match, c, seller)) return rule.account;
    return need(mapping.defaultExpense, 'expenses (defaultExpense)');
  };

  // Expenses: the lines, unless they cannot be summed (KSeF before/after corrections) or are absent (Factur-X MINIMUM).
  const lines = inv.lines.length > 0 && !inv.lines.some((l) => l.correctionState === 'before' || l.correctionState === 'after');
  if (lines) {
    for (const l of inv.lines)
      push({
        account: expenseAccount({
          lineId: l.id,
          vatCategory: l.vat?.categoryCode,
          rate: l.vat?.rate,
          item: l.item,
          accountingRef: l.accountingRef,
        }),
        amount: signed(l.netAmount),
        role: 'expense',
        text: clip(l.item.name || l.item.description || `Line ${l.id}`),
        vatCategory: l.vat?.categoryCode,
        vatRate: l.vat?.rate,
        lineIds: [l.id],
      });
    for (const [kind, acs] of [
      ['allowance', inv.allowances],
      ['charge', inv.charges],
    ] as const)
      for (const a of acs)
        push({
          account:
            (kind === 'allowance' ? mapping.allowances : mapping.charges) ??
            expenseAccount({ vatCategory: a.vat?.categoryCode, rate: a.vat?.rate }),
          amount: kind === 'allowance' ? credit(a.amount) : signed(a.amount),
          role: kind,
          text: clip(a.reason ?? (kind === 'allowance' ? 'Allowance' : 'Charge')),
          vatCategory: a.vat?.categoryCode,
          vatRate: a.vat?.rate,
        });
  } else {
    notes.push('Expenses are booked per VAT category: the invoice lines are absent or are before/after pairs that cannot be summed');
    if (inv.vatBreakdown.length === 0)
      push({ account: expenseAccount({}), amount: signed(t.taxExclusive), role: 'expense', text: 'Amount without VAT' });
    for (const v of inv.vatBreakdown)
      push({
        account: expenseAccount({ vatCategory: v.categoryCode, rate: v.rate }),
        amount: signed(v.taxableAmount),
        role: 'expense',
        text: `Amount without VAT, category ${v.categoryCode}${v.rate !== undefined ? ` ${v.rate} %` : ''}`,
        vatCategory: v.categoryCode,
        vatRate: v.rate,
      });
  }

  // Taxes that are not VAT and sit on top of the total (stamp duty booked as a line is already in the expenses).
  for (const o of inv.otherTaxes)
    if (o.includedInTotal && !o.inTaxExclusive)
      push({
        account: byScheme(mapping.otherTaxes, o.scheme, 'other taxes'),
        amount: signed(o.amount),
        role: 'other-tax',
        text: o.scheme,
      });

  // VAT per breakdown entry.
  const rcCategories = mapping.reverseCharge?.categories ?? ['AE'];
  for (const v of inv.vatBreakdown) {
    const label = `VAT ${v.categoryCode}${v.rate !== undefined ? ` ${v.rate} %` : ''}`;
    if (rcCategories.includes(v.categoryCode) && isZero(v.taxAmount)) {
      const rc = mapping.reverseCharge;
      if (!rc)
        throw new JournalError(
          'missing-account',
          `Invoice ${inv.id} is under reverse charge (${v.categoryCode}); the account mapping needs "reverseCharge" (inputVat, outputVat, rate)`,
        );
      const stated = v.rate !== undefined && !isZero(v.rate) ? v.rate : undefined;
      const rate = stated ?? rc.rate;
      if (rate === undefined)
        throw new JournalError(
          'missing-account',
          `Invoice ${inv.id} is under reverse charge (${v.categoryCode}) and states no VAT rate; set reverseCharge.rate in the account mapping to the rate you must apply`,
        );
      const rcLabel = `VAT ${v.categoryCode} ${rate} %`;
      if (!stated)
        notes.push(
          `Reverse charge ${v.categoryCode} on ${v.taxableAmount}: VAT calculated at ${rate} %, the rate from the account mapping`,
        );
      const vat = signed(round(percentOf(v.taxableAmount, rate)));
      push({
        account: need(rc.inputVat, 'reverse-charge input VAT'),
        amount: vat,
        role: 'reverse-charge-input-vat',
        text: `${rcLabel} (reverse charge, input)`,
        vatCategory: v.categoryCode,
        vatRate: rate,
      });
      push({
        account: need(rc.outputVat, 'reverse-charge output VAT'),
        amount: neg(vat),
        role: 'reverse-charge-output-vat',
        text: `${rcLabel} (reverse charge, output)`,
        vatCategory: v.categoryCode,
        vatRate: rate,
      });
      continue;
    }
    if (isZero(v.taxAmount)) continue;
    const iv = mapping.inputVat;
    const account =
      typeof iv === 'string'
        ? iv
        : ((v.rate !== undefined ? Object.entries(iv.byRate ?? {}).find(([r]) => cmp(r, v.rate as string) === 0)?.[1] : undefined) ??
          iv.default);
    push({
      account: need(account, 'input VAT'),
      amount: signed(v.taxAmount),
      role: 'input-vat',
      text: label,
      vatCategory: v.categoryCode,
      vatRate: v.rate,
    });
  }

  if (inv.vatBreakdown.length === 0 && t.vatTotal && !isZero(t.vatTotal)) {
    // Factur-X MINIMUM and BASIC WL state the VAT total only: no rate to choose an account by.
    notes.push('The invoice has no VAT breakdown: input VAT is booked from the VAT total on the default input VAT account');
    const iv = mapping.inputVat;
    push({ account: typeof iv === 'string' ? iv : iv.default, amount: signed(t.vatTotal), role: 'input-vat', text: 'VAT' });
  }

  if (t.rounding && !isZero(t.rounding))
    push({ account: need(mapping.rounding, 'rounding (BT-114)'), amount: signed(t.rounding), role: 'rounding', text: 'Rounding' });

  // Credits that reduce what is owed to the supplier.
  if (inv.withholdings.length > 0)
    for (const w of inv.withholdings)
      push({
        account: byScheme(mapping.withholding, w.scheme, 'withholding tax'),
        amount: credit(w.amount),
        role: 'withholding',
        text: `Withholding ${w.scheme}`,
      });
  else if (t.withholdingTotal && !isZero(t.withholdingTotal))
    push({
      account: byScheme(mapping.withholding, 'default', 'withholding tax'),
      amount: credit(t.withholdingTotal),
      role: 'withholding',
      text: 'Withholding',
    });
  if (t.splitPaymentVat && !isZero(t.splitPaymentVat))
    push({
      account: need(mapping.splitPaymentVat, 'split-payment VAT (splitPaymentVat)'),
      amount: credit(t.splitPaymentVat),
      role: 'split-payment-vat',
      text: 'Split-payment VAT to the tax authority',
    });
  if (t.prepaid && !isZero(t.prepaid))
    push({
      account: need(mapping.prepaid, 'prepaid amounts (BT-113)'),
      amount: credit(t.prepaid),
      role: 'prepaid',
      text: 'Prepaid amount',
    });
  const supplierName = inv.seller.name ?? inv.seller.tradingName ?? 'Unknown supplier';
  push({
    account: need(mapping.payable, 'accounts payable (payable)'),
    amount: credit(t.payable),
    role: 'payable',
    text: clip(`${supplierName} ${inv.id}`),
  });

  // The residual: the books must balance, or the entry is refused.
  let residual = sum(postings.map((p) => p.amount));
  if (!isZero(residual) && mapping.settlement && inv.source.warnings.some((w) => w.code === 'PL-SETTLEMENT')) {
    notes.push(
      `The amount to pay differs from the invoice total by ${neg(residual)} because of the source's own settlement (PL-SETTLEMENT); booked to the settlement account`,
    );
    push({ account: mapping.settlement, amount: neg(residual), role: 'settlement', text: 'Settlement difference stated by the invoice' });
    residual = sum(postings.map((p) => p.amount));
  }
  const tolerance = options.roundingTolerance ?? '0';
  if (!isZero(residual) && cmp(residual.replace('-', ''), tolerance) <= 0 && mapping.rounding) {
    notes.push(`Residual of ${neg(residual)} within the rounding tolerance ${tolerance}; booked to the rounding account`);
    push({ account: mapping.rounding, amount: neg(residual), role: 'rounding', text: 'Rounding difference' });
    residual = sum(postings.map((p) => p.amount));
  }
  if (!isZero(residual)) {
    const net = aggregate(postings);
    const dr = sum(net.filter((p) => sign(p.amount) > 0).map((p) => p.amount));
    const cr = neg(sum(net.filter((p) => sign(p.amount) < 0).map((p) => p.amount)));
    const hint =
      inv.source.warnings.some((w) => w.code === 'PL-SETTLEMENT') && !mapping.settlement
        ? ' The invoice carries its own settlement amounts (PL-SETTLEMENT): set "settlement" in the account mapping to book the difference.'
        : '';
    throw new JournalError(
      'unbalanced',
      `Invoice ${inv.id} does not balance: debits ${dr}, credits ${cr}, difference ${residual.replace('-', '')}. ` +
        `Sources: expenses+VAT ${sum(postings.filter((p) => ['expense', 'allowance', 'charge', 'other-tax', 'input-vat'].includes(p.role)).map((p) => p.amount))}, ` +
        `total ${t.taxInclusive}, prepaid ${t.prepaid ?? '0'}, rounding ${t.rounding ?? '0'}, withholding ${t.withholdingTotal ?? '0'}, split-payment VAT ${t.splitPaymentVat ?? '0'}, payable ${t.payable}. ` +
        `The invoice's own totals are inconsistent with its lines or VAT breakdown.${hint}`,
    );
  }

  // Aggregate, then convert to debit/credit columns.
  const merged = (options.granularity ?? 'account') === 'account' ? aggregate(postings) : postings;
  const out = merged
    .filter((p) => !isZero(p.amount))
    .map((p): JournalLine => {
      const dr = sign(p.amount) > 0;
      return {
        account: p.account,
        ...(mapping.accountNames?.[p.account] ? { accountName: mapping.accountNames[p.account] } : {}),
        debit: dr ? p.amount : ZERO,
        credit: dr ? ZERO : neg(p.amount),
        role: p.role,
        text: p.text,
        ...(p.vatCategory !== undefined ? { vatCategory: p.vatCategory } : {}),
        ...(p.vatRate !== undefined ? { vatRate: p.vatRate } : {}),
        ...(p.lineIds?.length ? { lineIds: p.lineIds } : {}),
      };
    });
  const totalDebit = sum(out.map((l) => l.debit));
  const totalCredit = sum(out.map((l) => l.credit));
  if (cmp(totalDebit, totalCredit) !== 0)
    throw new JournalError(
      'unbalanced',
      `Invoice ${inv.id}: aggregated entry does not balance (debits ${totalDebit}, credits ${totalCredit})`,
    );
  return {
    invoiceId: inv.id,
    format: inv.source.format,
    kind: inv.kind,
    date: inv.issueDate,
    ...(inv.dueDate ? { dueDate: inv.dueDate } : {}),
    currency: inv.currency,
    supplier: { name: inv.seller.name, vatId: inv.seller.vatId },
    buyer: {
      name: inv.buyer.name,
      vatId: inv.buyer.vatId,
      identifiers: [...(inv.buyer.legalRegistrationId ? [inv.buyer.legalRegistrationId] : []), ...inv.buyer.identifiers],
    },
    text: clip(`${supplierName} ${inv.kind === 'creditNote' ? 'credit note' : 'invoice'} ${inv.id}`, 100),
    lines: out,
    totalDebit,
    totalCredit,
    notes,
  };
}

/** Checks a mapping read from JSON (CLI, site) and returns it typed. */
export function parseAccountMapping(value: unknown): AccountMapping {
  const bad = (m: string): never => {
    throw new JournalError('invalid-mapping', `Account mapping: ${m}`);
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return bad('must be a JSON object');
  const m = value as Record<string, unknown>;
  const str = (k: string, required: boolean) => {
    if (m[k] === undefined) return required ? bad(`"${k}" is required`) : undefined;
    if (typeof m[k] !== 'string' || !m[k]) bad(`"${k}" must be an account number as a string`);
  };
  str('payable', true);
  str('defaultExpense', true);
  for (const k of ['allowances', 'charges', 'splitPaymentVat', 'rounding', 'prepaid', 'settlement']) str(k, false);
  const strOrMap = (k: string) => {
    const v = m[k];
    if (v === undefined || (typeof v === 'string' && v)) return;
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.values(v).some((x) => typeof x !== 'string'))
      bad(`"${k}" must be an account string or an object of account strings`);
  };
  if (m.inputVat === undefined) bad('"inputVat" is required');
  if (typeof m.inputVat === 'object' && m.inputVat !== null) {
    const iv = m.inputVat as Record<string, unknown>;
    if (typeof iv.default !== 'string') bad('"inputVat.default" must be an account string');
    if (
      iv.byRate !== undefined &&
      (typeof iv.byRate !== 'object' || iv.byRate === null || Object.values(iv.byRate).some((x) => typeof x !== 'string'))
    )
      bad('"inputVat.byRate" must map rates to account strings');
  } else str('inputVat', true);
  strOrMap('withholding');
  strOrMap('otherTaxes');
  strOrMap('accountNames');
  if (!Array.isArray(m.expense ?? [])) bad('"expense" must be an array of rules');
  for (const r of (m.expense ?? []) as unknown[]) {
    if (!r || typeof r !== 'object' || typeof (r as { account?: unknown }).account !== 'string')
      bad('each "expense" rule needs an "account" string');
  }
  const rc = m.reverseCharge as Record<string, unknown> | undefined;
  if (rc !== undefined && (typeof rc !== 'object' || rc === null || typeof rc.inputVat !== 'string' || typeof rc.outputVat !== 'string'))
    bad('"reverseCharge" needs "inputVat" and "outputVat" account strings');
  return { expense: [], ...m } as unknown as AccountMapping;
}
