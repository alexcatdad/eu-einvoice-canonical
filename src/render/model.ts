/**
 * The content of a rendered invoice as plain data: headings, key/value rows, tables and lists of strings.
 * The HTML and PDF renderers both draw from this, so they always show the same things. Nothing here is
 * escaped; escaping is the job of the output format.
 */

import type { Address, AllowanceCharge, CanonicalInvoice, Identifier, Line, Party, Period } from '../canonical.js';
import { type LabelKey, labelsFor } from './labels.js';

export type Align = 'left' | 'right';

export type Block =
  | { kind: 'kv'; heading: string; rows: [label: string, value: string][]; half?: boolean }
  | { kind: 'totals'; heading: string; rows: [label: string, value: string][] }
  | { kind: 'table'; heading: string; columns: { label: string; align: Align }[]; rows: string[][]; note?: string }
  | { kind: 'list'; heading: string; items: string[] };

export interface RenderModel {
  title: string;
  /** A short line under the title: type code, currency, format. */
  subtitle: string;
  blocks: Block[];
}

const present = (v: string | undefined | null): v is string => typeof v === 'string' && v.trim() !== '';

const ident = (i: Identifier | undefined): string | undefined =>
  i && present(i.value) ? (i.schemeId ? `${i.value} (${i.schemeId})` : i.value) : undefined;

function addressText(a: Address | undefined): string | undefined {
  if (!a) return undefined;
  const cityLine = [a.postalCode, a.city].filter(present).join(' ');
  const parts = [a.line1, a.line2, a.line3, cityLine, a.countrySubdivision, a.countryCode].filter(present);
  return parts.length ? parts.join(', ') : undefined;
}

function periodText(p: Period | undefined): string | undefined {
  if (!p || (!p.start && !p.end)) return undefined;
  return `${p.start ?? '...'} - ${p.end ?? '...'}`;
}

/** Drops rows whose value is missing or blank. */
function rows(entries: [string, string | undefined][]): [string, string][] {
  return entries.filter((e): e is [string, string] => present(e[1]));
}

function partyRows(t: (k: LabelKey) => string, p: Party): [string, string][] {
  const contact = p.contact ? [p.contact.name, p.contact.phone, p.contact.email].filter(present).join(', ') : undefined;
  return rows([
    [t('name'), p.name],
    [t('tradingName'), p.tradingName],
    [t('address'), addressText(p.address)],
    [t('vatId'), p.vatId],
    [t('registration'), ident(p.legalRegistrationId)],
    ...p.identifiers.map((i): [string, string | undefined] => [t('identifiers'), ident(i)]),
    ...p.nationalTaxIds.map((i): [string, string | undefined] => [t('identifiers'), ident(i)]),
    [t('endpoint'), ident(p.endpoint)],
    [t('contact'), contact],
  ]);
}

function lineDescription(t: (k: LabelKey) => string, l: Line): string {
  const out: string[] = [l.item.name];
  if (present(l.item.description)) out.push(l.item.description);
  if (present(l.item.sellerId)) out.push(l.item.sellerId);
  if (present(l.note)) out.push(l.note);
  for (const a of l.item.attributes) out.push(`${a.name}: ${a.value}`);
  const period = periodText(l.period);
  if (period) out.push(period);
  for (const a of l.allowances) out.push(`${t('allowances')}: ${a.reason ?? ''} -${a.amount}`);
  for (const c of l.charges) out.push(`${t('charges')}: ${c.reason ?? ''} +${c.amount}`);
  return out.join('\n');
}

function vatText(v: { categoryCode: string; rate?: string } | undefined): string {
  if (!v) return '';
  return v.rate !== undefined ? `${v.categoryCode} ${v.rate}%` : v.categoryCode;
}

function allowanceChargeTable(t: (k: LabelKey) => string, heading: string, items: AllowanceCharge[], currency: string): Block | undefined {
  if (items.length === 0) return undefined;
  return {
    kind: 'table',
    heading,
    columns: [
      { label: t('reason'), align: 'left' },
      { label: t('vatRate'), align: 'left' },
      { label: `${t('amount')} (${currency})`, align: 'right' },
    ],
    rows: items.map((a) => [
      [a.reason, a.reasonCode].filter(present).join(' - ') + (a.percentage ? ` (${a.percentage}%)` : ''),
      vatText(a.vat),
      a.amount,
    ]),
  };
}

/** Builds the language-specific content of an invoice. `lang` is a BCP 47 tag; unknown languages use English. */
export function buildModel(inv: CanonicalInvoice, lang?: string): RenderModel {
  const t = labelsFor(lang);
  const cur = inv.currency;
  const blocks: Block[] = [];

  blocks.push({
    kind: 'kv',
    heading: t('seller'),
    half: true,
    rows: partyRows(t, inv.seller).concat(
      rows([
        [t('registration'), inv.seller.taxRegistrationId],
        [t('registration'), inv.seller.additionalLegalInfo],
      ]),
    ),
  });
  blocks.push({ kind: 'kv', heading: t('buyer'), half: true, rows: partyRows(t, inv.buyer) });
  if (inv.payee) {
    blocks.push({
      kind: 'kv',
      heading: t('payee'),
      half: true,
      rows: rows([
        [t('name'), inv.payee.name],
        [t('identifiers'), ident(inv.payee.identifier)],
        [t('registration'), ident(inv.payee.legalRegistrationId)],
      ]),
    });
  }
  if (inv.taxRepresentative) {
    const r = inv.taxRepresentative;
    blocks.push({
      kind: 'kv',
      heading: t('taxRepresentative'),
      half: true,
      rows: rows([
        [t('name'), r.name],
        [t('vatId'), r.vatId],
        [t('address'), addressText(r.address)],
      ]),
    });
  }
  if (inv.delivery) {
    const d = inv.delivery;
    blocks.push({
      kind: 'kv',
      heading: t('delivery'),
      half: true,
      rows: rows([
        [t('name'), d.partyName],
        [t('identifiers'), ident(d.locationId)],
        [t('deliveryDate'), d.actualDate],
        [t('address'), addressText(d.address)],
      ]),
    });
  }

  const refs = rows([
    [t('issueDate'), inv.issueDate + (inv.issueTime ? ` ${inv.issueTime}` : '')],
    [t('dueDate'), inv.dueDate],
    [t('taxPointDate'), inv.taxPointDate],
    [t('invoicePeriod'), periodText(inv.invoicePeriod)],
    [t('buyerReference'), inv.buyerReference],
    [t('projectRef'), inv.projectRef],
    [t('contractRef'), inv.contractRef],
    [t('purchaseOrderRef'), inv.purchaseOrderRef],
    [t('salesOrderRef'), inv.salesOrderRef],
    [t('despatchAdviceRef'), inv.despatchAdviceRef],
    [t('receivingAdviceRef'), inv.receivingAdviceRef],
    [t('tenderRef'), inv.tenderRef],
    [t('accountingRef'), inv.accountingRef],
    ...inv.precedingInvoices.map((p): [string, string | undefined] => [
      t('precedingInvoice'),
      p.issueDate ? `${p.id} (${p.issueDate})` : p.id,
    ]),
  ]);
  blocks.push({ kind: 'kv', heading: t('references'), rows: refs });

  if (inv.lines.length > 0) {
    blocks.push({
      kind: 'table',
      heading: t('lines'),
      columns: [
        { label: t('position'), align: 'left' },
        { label: t('description'), align: 'left' },
        { label: t('quantity'), align: 'right' },
        { label: `${t('unitPrice')} (${cur})`, align: 'right' },
        { label: t('vatRate'), align: 'left' },
        { label: `${t('netAmount')} (${cur})`, align: 'right' },
      ],
      rows: inv.lines.map((l) => [
        l.id,
        lineDescription(t, l),
        [l.quantity, l.unitCode ?? l.unitText].filter(present).join(' '),
        l.price?.net ?? '',
        vatText(l.vat),
        l.netAmount,
      ]),
    });
  } else blocks.push({ kind: 'list', heading: t('lines'), items: [t('noLines')] });

  const allowances = allowanceChargeTable(t, t('allowances'), inv.allowances, cur);
  if (allowances) blocks.push(allowances);
  const charges = allowanceChargeTable(t, t('charges'), inv.charges, cur);
  if (charges) blocks.push(charges);

  blocks.push({
    kind: 'table',
    heading: t('vatBreakdown'),
    columns: [
      { label: t('category'), align: 'left' },
      { label: t('vatRate'), align: 'right' },
      { label: `${t('taxableAmount')} (${cur})`, align: 'right' },
      { label: `${t('vatAmount')} (${cur})`, align: 'right' },
      { label: t('exemption'), align: 'left' },
    ],
    rows: inv.vatBreakdown.map((v) => [
      v.categoryCode,
      v.rate !== undefined ? `${v.rate}%` : '',
      v.taxableAmount,
      v.taxAmount,
      [v.exemptionReasonCode, v.exemptionReason].filter(present).join(' - '),
    ]),
  });

  const tot = inv.totals;
  blocks.push({
    kind: 'totals',
    heading: t('totals'),
    rows: rows([
      [t('lineNetTotal'), tot.lineNetTotal],
      [t('allowanceTotal'), tot.allowanceTotal],
      [t('chargeTotal'), tot.chargeTotal],
      [t('taxExclusive'), tot.taxExclusive],
      [t('vatTotal'), tot.vatTotal],
      [t('taxInclusive'), tot.taxInclusive],
      [t('prepaid'), tot.prepaid],
      [t('rounding'), tot.rounding],
      [t('payable'), tot.payable],
    ]).map(([l, v]) => [l, `${v} ${cur}`]),
  });

  const pay: [string, string | undefined][] = [[t('paymentTerms'), inv.paymentTerms]];
  for (const p of inv.payments) {
    pay.push([t('paymentMeans'), [p.meansText, p.meansCode].filter(present).join(' / ')]);
    pay.push([t('remittance'), p.remittanceInformation]);
    for (const c of p.creditTransfers) {
      pay.push([t('account'), c.accountId]);
      pay.push([t('accountHolder'), c.accountName]);
      pay.push([t('bank'), c.serviceProviderId]);
    }
    if (p.card) pay.push([t('paymentMeans'), [p.card.network, p.card.primaryAccountNumber, p.card.holderName].filter(present).join(' ')]);
    if (p.directDebit) {
      const d = p.directDebit;
      pay.push([t('mandate'), [d.mandateId, d.creditorId, d.debitedAccountId].filter(present).join(' / ')]);
    }
  }
  for (const s of inv.paymentSchedule) {
    pay.push([t('dueDate'), [s.dueDate, s.amount ? `${s.amount} ${cur}` : undefined, s.description].filter(present).join(' - ')]);
  }
  blocks.push({ kind: 'kv', heading: t('payment'), rows: rows(pay) });

  if (inv.notes.length > 0) {
    blocks.push({
      kind: 'list',
      heading: t('notes'),
      items: inv.notes.map((n) => (present(n.subjectCode) ? `${n.subjectCode}: ${n.text}` : n.text)),
    });
  }
  if (inv.attachments.length > 0) {
    blocks.push({
      kind: 'list',
      heading: t('attachments'),
      items: inv.attachments.map((a) => {
        if (a.kind === 'embedded') return [a.filename, a.mimeCode && `(${a.mimeCode})`, a.description].filter(present).join(' ');
        if (a.kind === 'external') return [a.id, a.description, a.uri].filter(present).join(' - ');
        return [a.id, a.description, a.typeCode].filter(present).join(' - ');
      }),
    });
  }

  return {
    title: `${inv.kind === 'creditNote' ? t('creditNote') : t('invoice')} ${inv.id}`,
    subtitle: [inv.typeCode, inv.currency, inv.source.format].filter(present).join(' | '),
    blocks: blocks.filter((b) => b.kind !== 'kv' || b.rows.length > 0),
  };
}
