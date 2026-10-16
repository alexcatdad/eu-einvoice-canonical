/**
 * The content of a rendered invoice as plain data, already formatted for one language: dates, amounts,
 * percentages, addresses, identifiers and free text. `renderHtml`, `renderPdf` and the React component all
 * draw from this, so they always show the same things. Nothing here is escaped; escaping is the job of the
 * output format.
 */

import type { Address, AllowanceCharge, CanonicalInvoice, Identifier, Line, Party, Period, VatInfo } from '../canonical.js';
import {
  countryName,
  formatAmount,
  formatDate,
  formatIban,
  formatMoney,
  formatPercent,
  formatQuantity,
  type Para,
  paragraphs,
  resolveLocale,
  schemeName,
} from './format.js';
import { isLabelKey, type LabelKey, labelsFor, safeLang } from './labels.js';

export type { Para } from './format.js';
export type Align = 'left' | 'right';

/**
 * A formatted value. `text` is always set; the renderers use the richer forms when present: `paras` for free
 * text, `lines` for a postal address, `iso` for a date (shown in the reader's locale, ISO kept in a tooltip),
 * `title` for a code behind a name.
 */
export interface Value {
  text: string;
  iso?: string;
  title?: string;
  lines?: string[];
  paras?: Para[];
  /** Shown in a monospace face: IBANs, account numbers, references. */
  code?: boolean;
}

export interface Field {
  label: string;
  value: Value;
}

export interface Column {
  label: string;
  align: Align;
}

export interface PartyView {
  role: 'seller' | 'buyer' | 'payee' | 'taxRepresentative' | 'delivery';
  heading: string;
  name?: string;
  tradingName?: string;
  address: string[];
  fields: Field[];
}

export interface LineView {
  id: string;
  name: string;
  description: Para[];
  /** Short facts under the description: item numbers, attributes, period, order line. */
  details: string[];
  /** Line allowances and charges, already signed. */
  adjustments: string[];
  quantity: Value;
  unitPrice: string;
  /** "per 100 pcs" when the price is for more than one unit. */
  priceBasis?: string;
  vat: Value;
  /** The VAT category code (S, Z, E, AE...), for outputs without tooltips. */
  vatCategory?: string;
  net: string;
}

export interface AdjustmentView {
  reason: string;
  vat: Value;
  /** The VAT category code (S, Z, E, AE...), for outputs without tooltips. */
  vatCategory?: string;
  amount: string;
}

export interface VatRowView {
  category: Value;
  rate: string;
  taxable: string;
  tax: string;
  exemption: string;
}

export type TotalKind = 'normal' | 'subtotal' | 'due';
export interface TotalRow {
  key: keyof CanonicalInvoice['totals'];
  label: string;
  value: string;
  kind: TotalKind;
}

export interface PaymentMethodView {
  heading: string;
  fields: Field[];
}

export interface InstallmentView {
  due: Value;
  amount: string;
  description: string;
}

export interface NoteView {
  subject?: string;
  paras: Para[];
}

export interface InvoiceView {
  /** The `lang` attribute: the tag as given when it is a safe one, else `en`. */
  lang: string;
  /** The locale used for numbers and dates. */
  locale: string;
  credit: boolean;
  /** "Invoice" or "Credit note". */
  docLabel: string;
  number: string;
  title: string;
  /** Document type, currency and source format. */
  meta: Field[];
  /** Issue date, due date and the like, for the header. */
  facts: Field[];
  /** The amount due (or credited), formatted with its currency. */
  due: Field;
  currency: string;
  headings: Record<
    'references' | 'lines' | 'allowances' | 'charges' | 'vat' | 'totals' | 'payment' | 'terms' | 'schedule' | 'notes' | 'attachments',
    string
  >;
  parties: PartyView[];
  references: Field[];
  lines: { columns: Column[]; rows: LineView[]; empty?: string };
  adjustmentColumns: Column[];
  allowances: AdjustmentView[];
  charges: AdjustmentView[];
  /** The exemption column is left out when no row has an exemption. */
  vat: { columns: Column[]; rows: VatRowView[] };
  totals: TotalRow[];
  payment: { terms: Para[]; methods: PaymentMethodView[] };
  schedule: { columns: Column[]; rows: InstallmentView[] };
  notes: NoteView[];
  attachments: string[];
}

export interface ViewOptions {
  /** How amounts with a currency show it: `symbol` (default, `€`) or `code` (`EUR`, for fonts without the symbol). */
  currencyDisplay?: 'symbol' | 'code';
}

type T = (k: LabelKey) => string;

const present = (v: string | undefined | null): v is string => typeof v === 'string' && v.trim() !== '';
const text = (s: string, extra: Omit<Value, 'text'> = {}): Value => ({ text: s, ...extra });

/** Drops fields whose value is missing or blank. */
function fields(entries: [string, Value | string | undefined][]): Field[] {
  const out: Field[] = [];
  for (const [label, v] of entries) {
    if (v === undefined) continue;
    const value = typeof v === 'string' ? text(v) : v;
    if (present(value.text)) out.push({ label, value });
  }
  return out;
}

function dateValue(iso: string | undefined, locale: string): Value | undefined {
  if (!present(iso)) return undefined;
  const d = formatDate(iso, locale);
  return d.iso ? text(d.text, { iso: d.iso, title: d.iso }) : text(d.text);
}

function periodValue(p: Period | undefined, locale: string): Value | undefined {
  if (!p || (!present(p.start) && !present(p.end))) return undefined;
  const start = present(p.start) ? formatDate(p.start, locale).text : '…';
  const end = present(p.end) ? formatDate(p.end, locale).text : '…';
  return text(`${start} – ${end}`, { title: `${p.start ?? '..'}/${p.end ?? '..'}` });
}

/** An address as the lines of an envelope, with the country spelled out in the reader's language. */
function addressLines(a: Address | undefined, locale: string): string[] {
  if (!a) return [];
  const anglo =
    a.countryCode === 'GB' || a.countryCode === 'US' || a.countryCode === 'CA' || a.countryCode === 'AU' || a.countryCode === 'IE';
  const city = anglo
    ? [[a.city, a.countrySubdivision].filter(present).join(', '), a.postalCode].filter(present).join(' ')
    : [a.postalCode, a.city].filter(present).join(' ');
  const lines = [a.line1, a.line2, a.line3, city].filter(present);
  if (!anglo && present(a.countrySubdivision)) lines.push(a.countrySubdivision);
  if (present(a.countryCode)) lines.push(countryName(a.countryCode, locale));
  return lines;
}

/** An identifier with its scheme as the label: `GLN 7300010000002`, `Leitweg-ID 991-...`. */
function identField(fallback: string, i: Identifier | undefined): [string, Value | undefined] {
  if (!i || !present(i.value)) return [fallback, undefined];
  const scheme = schemeName(i.schemeId);
  return [scheme ? `${fallback} (${scheme})` : fallback, text(i.value, i.schemeId ? { title: i.schemeId } : {})];
}

function partyFields(t: T, p: Party): Field[] {
  return fields([
    [t('vatId'), p.vatId],
    identField(t('registration'), p.legalRegistrationId),
    ...p.identifiers.map((i) => identField(t('identifier'), i)),
    ...p.nationalTaxIds.map((i) => identField(t('identifier'), i)),
    identField(t('endpoint'), p.endpoint),
    [t('contact'), p.contact?.name],
    [t('phone'), p.contact?.phone],
    [t('email'), p.contact?.email],
  ]);
}

function party(role: PartyView['role'], heading: string, t: T, p: Party, locale: string, extra: Field[] = []): PartyView {
  return {
    role,
    heading,
    name: present(p.name) ? p.name : undefined,
    tradingName: present(p.tradingName) && p.tradingName !== p.name ? p.tradingName : undefined,
    address: addressLines(p.address, locale),
    fields: partyFields(t, p).concat(extra),
  };
}

function categoryName(t: T, code: string): string {
  const key = `cat${code}`;
  return isLabelKey(key) ? t(key) : code;
}

/** VAT on a line or an allowance: the rate, plus the category when it is not the standard one. */
function vatValue(t: T, v: VatInfo | undefined, locale: string): Value {
  if (!v) return text('');
  const name = categoryName(t, v.categoryCode);
  if (present(v.rate) && (v.categoryCode === 'S' || Number(v.rate) !== 0))
    return text(formatPercent(v.rate, locale), { title: `${v.categoryCode} – ${name}` });
  return text(name, { title: v.categoryCode });
}

function lineView(t: T, l: Line, cur: string, locale: string): LineView {
  const details: string[] = [];
  if (present(l.item.sellerId)) details.push(`${t('sellerItemId')}: ${l.item.sellerId}`);
  if (present(l.item.buyerId)) details.push(`${t('buyerItemId')}: ${l.item.buyerId}`);
  if (l.item.standardId && present(l.item.standardId.value)) {
    details.push(`${schemeName(l.item.standardId.schemeId) ?? t('identifier')}: ${l.item.standardId.value}`);
  }
  for (const a of l.item.attributes) details.push(`${a.name}: ${a.value}`);
  if (present(l.item.originCountry)) details.push(`${t('origin')}: ${countryName(l.item.originCountry, locale)}`);
  const period = periodValue(l.period, locale);
  if (period) details.push(period.text);
  if (present(l.orderLineRef)) details.push(`${t('orderLineRef')}: ${l.orderLineRef}`);

  const adjustments = [
    ...l.allowances.map((a) => `${t('allowance')}${present(a.reason) ? ` (${a.reason})` : ''}: −${formatMoney(a.amount, cur, locale)}`),
    ...l.charges.map((c) => `${t('charge')}${present(c.reason) ? ` (${c.reason})` : ''}: +${formatMoney(c.amount, cur, locale)}`),
  ];

  const word = (w: Parameters<T>[0]) => t(w);
  const p = l.price;
  const basis =
    p && present(p.baseQuantity) && Number(p.baseQuantity) !== 1
      ? `${t('per')} ${formatQuantity(p.baseQuantity, p.baseQuantityUnit, undefined, locale, word)}`
      : undefined;
  return {
    id: l.id,
    name: l.item.name,
    description: [...paragraphs(l.item.description), ...paragraphs(l.note)],
    details,
    adjustments,
    quantity: text(formatQuantity(l.quantity, l.unitCode, l.unitText, locale, word), l.unitCode ? { title: l.unitCode } : {}),
    unitPrice: p ? formatAmount(p.net, cur, locale) : '',
    priceBasis: basis,
    vat: vatValue(t, l.vat, locale),
    vatCategory: l.vat?.categoryCode,
    net: formatAmount(l.netAmount, cur, locale),
  };
}

function adjustment(a: AllowanceCharge, t: T, cur: string, locale: string): AdjustmentView {
  const pct = present(a.percentage)
    ? present(a.baseAmount)
      ? `${formatPercent(a.percentage, locale)} × ${formatAmount(a.baseAmount, cur, locale)}`
      : formatPercent(a.percentage, locale)
    : undefined;
  const reason = [a.reason, present(a.reasonCode) ? `(${a.reasonCode})` : undefined].filter(present).join(' ');
  return {
    reason: [reason, pct].filter(present).join(' · '),
    vat: vatValue(t, a.vat, locale),
    vatCategory: a.vat?.categoryCode,
    amount: formatAmount(a.amount, cur, locale),
  };
}

function paymentMeans(t: T, code: string, meansText: string | undefined): string {
  const key = `pm${code}`;
  const name = isLabelKey(key) ? t(key) : undefined;
  if (present(meansText) && name && meansText.toLowerCase() !== name.toLowerCase()) return `${name} (${meansText})`;
  return (present(meansText) ? meansText : name) ?? code;
}

function account(t: T, id: string): [string, Value] {
  const iban = formatIban(id);
  return iban ? [t('iban'), text(iban, { code: true })] : [t('account'), text(id, { code: true })];
}

/** Builds everything a reader sees, formatted for `lang` (a BCP 47 tag; unknown languages get English labels). */
export function buildInvoiceView(inv: CanonicalInvoice, lang?: string, options: ViewOptions = {}): InvoiceView {
  const safe = safeLang(lang);
  const locale = resolveLocale(safe);
  const t = labelsFor(safe);
  const cur = inv.currency;
  const money = (v: string) => formatMoney(v, cur, locale, options.currencyDisplay);
  const credit = inv.kind === 'creditNote';
  const docLabel = credit ? t('creditNote') : t('invoice');

  const parties: PartyView[] = [
    party(
      'seller',
      t('seller'),
      t,
      inv.seller,
      locale,
      fields([
        [t('taxRegistration'), inv.seller.taxRegistrationId],
        [
          t('legalInfo'),
          present(inv.seller.additionalLegalInfo)
            ? text(inv.seller.additionalLegalInfo, { paras: paragraphs(inv.seller.additionalLegalInfo) })
            : undefined,
        ],
      ]),
    ),
    party('buyer', t('buyer'), t, inv.buyer, locale),
  ];
  if (inv.payee) {
    parties.push({
      role: 'payee',
      heading: t('payee'),
      name: present(inv.payee.name) ? inv.payee.name : undefined,
      address: [],
      fields: fields([identField(t('identifier'), inv.payee.identifier), identField(t('registration'), inv.payee.legalRegistrationId)]),
    });
  }
  if (inv.taxRepresentative) {
    const r = inv.taxRepresentative;
    parties.push({
      role: 'taxRepresentative',
      heading: t('taxRepresentative'),
      name: present(r.name) ? r.name : undefined,
      address: addressLines(r.address, locale),
      fields: fields([[t('vatId'), r.vatId]]),
    });
  }
  if (inv.delivery) {
    const d = inv.delivery;
    parties.push({
      role: 'delivery',
      heading: t('delivery'),
      name: present(d.partyName) ? d.partyName : undefined,
      address: addressLines(d.address, locale),
      fields: fields([identField(t('location'), d.locationId), [t('deliveryDate'), dateValue(d.actualDate, locale)]]),
    });
  }

  const issue = dateValue(inv.issueDate, locale);
  const issueValue =
    issue && present(inv.issueTime)
      ? { ...issue, text: `${issue.text}, ${inv.issueTime.slice(0, 5)}`, title: `${inv.issueDate}T${inv.issueTime}` }
      : issue;
  const facts = fields([
    [t('issueDate'), issueValue],
    [t('dueDate'), dateValue(inv.dueDate, locale)],
    [t('taxPointDate'), dateValue(inv.taxPointDate, locale)],
    [t('invoicePeriod'), periodValue(inv.invoicePeriod, locale)],
  ]);

  const references = fields([
    [t('buyerReference'), inv.buyerReference],
    [t('purchaseOrderRef'), inv.purchaseOrderRef],
    [t('salesOrderRef'), inv.salesOrderRef],
    [t('contractRef'), inv.contractRef],
    [t('projectRef'), inv.projectRef],
    [t('despatchAdviceRef'), inv.despatchAdviceRef],
    [t('receivingAdviceRef'), inv.receivingAdviceRef],
    [t('tenderRef'), inv.tenderRef],
    [t('accountingRef'), inv.accountingRef],
    ...inv.precedingInvoices.map((p): [string, Value] => {
      const d = present(p.issueDate) ? formatDate(p.issueDate, locale) : undefined;
      return [t('precedingInvoice'), text(d ? `${p.id} (${d.text})` : p.id, d?.iso ? { title: d.iso } : {})];
    }),
  ]);

  const amountCol = (k: LabelKey): Column => ({ label: `${t(k)} (${cur})`, align: 'right' });

  const tot = inv.totals;
  const totalRows: [TotalRow['key'], LabelKey, TotalKind][] = [
    ['lineNetTotal', 'lineNetTotal', 'normal'],
    ['allowanceTotal', 'allowanceTotal', 'normal'],
    ['chargeTotal', 'chargeTotal', 'normal'],
    ['taxExclusive', 'taxExclusive', 'subtotal'],
    ['vatTotal', 'vatTotal', 'normal'],
    ['taxInclusive', 'taxInclusive', 'subtotal'],
    ['prepaid', 'prepaid', 'normal'],
    ['rounding', 'rounding', 'normal'],
    ['withholdingTotal', 'withholdingTotal', 'normal'],
    ['splitPaymentVat', 'splitPaymentVat', 'normal'],
    ['payable', credit ? 'credited' : 'payable', 'due'],
  ];
  const totals = totalRows
    .filter(([key]) => present(tot[key]))
    .map(([key, label, kind]): TotalRow => ({ key, label: t(label), value: money(tot[key]!), kind }));

  const methods: PaymentMethodView[] = inv.payments.map((p) => {
    const f: [string, Value | string | undefined][] = [];
    for (const c of p.creditTransfers) {
      f.push(account(t, c.accountId));
      f.push([t('accountHolder'), c.accountName]);
      // Only a BIC is called one; national clearing ids (SE:BANKGIRO, SE:PLUSGIRO) get the generic label.
      const bic = present(c.serviceProviderId) && /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(c.serviceProviderId);
      f.push([bic ? t('bic') : t('bank'), present(c.serviceProviderId) ? text(c.serviceProviderId, { code: true }) : undefined]);
    }
    if (p.card) {
      f.push([t('card'), [p.card.network, `…${p.card.primaryAccountNumber.slice(-4)}`].filter(present).join(' ')]);
      f.push([t('accountHolder'), p.card.holderName]);
    }
    if (p.directDebit) {
      const d = p.directDebit;
      f.push([t('mandate'), present(d.mandateId) ? text(d.mandateId, { code: true }) : undefined]);
      f.push([t('creditorId'), present(d.creditorId) ? text(d.creditorId, { code: true }) : undefined]);
      if (present(d.debitedAccountId)) {
        const [, v] = account(t, d.debitedAccountId);
        f.push([t('debitedAccount'), v]);
      }
    }
    f.push([t('remittance'), present(p.remittanceInformation) ? text(p.remittanceInformation, { code: true }) : undefined]);
    return { heading: paymentMeans(t, p.meansCode, p.meansText), fields: fields(f) };
  });

  return {
    lang: safe,
    locale,
    credit,
    docLabel,
    number: inv.id,
    title: `${docLabel} ${inv.id}`,
    meta: fields([
      [t('type'), present(inv.typeCode) ? text(inv.typeCode) : undefined],
      [t('currency'), cur],
      [t('format'), inv.source.format],
    ]),
    facts,
    due: { label: credit ? t('credited') : t('payable'), value: text(money(tot.payable)) },
    currency: cur,
    headings: {
      references: t('references'),
      lines: t('lines'),
      allowances: t('allowances'),
      charges: t('charges'),
      vat: t('vatBreakdown'),
      totals: t('totals'),
      payment: t('payment'),
      terms: t('paymentTerms'),
      schedule: t('schedule'),
      notes: t('notes'),
      attachments: t('attachments'),
    },
    parties: parties.filter((p) => p.name || p.address.length || p.fields.length),
    references,
    lines: {
      columns: [
        { label: t('position'), align: 'left' },
        { label: t('description'), align: 'left' },
        { label: t('quantity'), align: 'right' },
        amountCol('unitPrice'),
        { label: t('vatRate'), align: 'right' },
        amountCol('netAmount'),
      ],
      rows: inv.lines.map((l) => lineView(t, l, cur, locale)),
      empty: inv.lines.length === 0 ? t('noLines') : undefined,
    },
    adjustmentColumns: [{ label: t('reason'), align: 'left' }, { label: t('vatRate'), align: 'right' }, amountCol('amount')],
    allowances: inv.allowances.map((a) => adjustment(a, t, cur, locale)),
    charges: inv.charges.map((c) => adjustment(c, t, cur, locale)),
    vat: {
      columns: [
        { label: t('category'), align: 'left' },
        { label: t('vatRate'), align: 'right' },
        amountCol('taxableAmount'),
        amountCol('vatAmount'),
        ...(inv.vatBreakdown.some((v) => present(v.exemptionReason) || present(v.exemptionReasonCode))
          ? [{ label: t('exemption'), align: 'left' as const }]
          : []),
      ],
      rows: inv.vatBreakdown.map((v) => ({
        category: text(categoryName(t, v.categoryCode), { title: v.categoryCode }),
        rate: present(v.rate) ? formatPercent(v.rate, locale) : '',
        taxable: formatAmount(v.taxableAmount, cur, locale),
        tax: formatAmount(v.taxAmount, cur, locale),
        exemption: [v.exemptionReason, present(v.exemptionReasonCode) ? `(${v.exemptionReasonCode})` : undefined].filter(present).join(' '),
      })),
    },
    totals,
    payment: { terms: paragraphs(inv.paymentTerms), methods },
    schedule: {
      columns: [{ label: t('dueDate'), align: 'left' }, amountCol('amount'), { label: t('description'), align: 'left' }],
      rows: inv.paymentSchedule.map((s) => ({
        due: dateValue(s.dueDate, locale) ?? text(''),
        amount: present(s.amount) ? formatAmount(s.amount, cur, locale) : '',
        description: s.description ?? '',
      })),
    },
    notes: inv.notes
      .map((n) => ({ subject: present(n.subjectCode) ? n.subjectCode : undefined, paras: paragraphs(n.text) }))
      .filter((n) => n.paras.length > 0),
    attachments: inv.attachments.map((a) => {
      if (a.kind === 'embedded') return [a.filename, a.mimeCode && `(${a.mimeCode})`, a.description].filter(present).join(' ');
      if (a.kind === 'external') return [a.id, a.description, a.uri].filter(present).join(' – ');
      return [a.id, a.description, a.typeCode].filter(present).join(' – ');
    }),
  };
}

/** The plain text of a value, with free text and address lines on their own lines (for the PDF). */
export function valueText(v: Value): string {
  if (v.paras) return parasText(v.paras);
  if (v.lines) return v.lines.join('\n');
  return v.text;
}

export function parasText(paras: Para[]): string {
  return paras.map((p) => (p.kind === 'p' ? p.lines.join('\n') : p.items.map((i) => `• ${i}`).join('\n'))).join('\n');
}
