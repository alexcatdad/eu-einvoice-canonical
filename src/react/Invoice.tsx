/**
 * React components for a canonical invoice. They render from the same view model as `renderHtml`
 * (src/render/model.ts) and produce the same markup, so the two cannot drift; a test compares them.
 *
 * Untrusted text only ever reaches the DOM as React children or attribute values, which React escapes.
 * No hooks besides useId, no effects, no browser globals: safe to render on the server.
 */

import { Fragment, type ReactNode, useId } from 'react';
import type { CanonicalInvoice } from '../canonical.js';
import type { RenderLanguage } from '../render/labels.js';
import {
  type AdjustmentView,
  buildInvoiceView,
  type Column,
  type Field,
  type InvoiceView,
  type Para,
  type PartyView,
  type TotalKind,
  type Value,
} from '../render/model.js';

interface CommonProps {
  /** Extra class names for the outermost element. */
  className?: string;
  /** Leaves out every built-in class name, so the bundled stylesheet does not apply. */
  unstyled?: boolean;
  /** Prefix for element ids (headings are linked to their sections by id). Defaults to a React `useId` value. */
  idPrefix?: string;
}

export type PartProps = CommonProps &
  (
    | {
        /** The canonical invoice, as `convert` or `parse` return it. */
        invoice: CanonicalInvoice;
        /** BCP 47 tag for labels. Labels exist for en, de, fr, it, es, nl, pl and ro. */
        lang?: RenderLanguage | (string & {});
        /** Formatting override. Defaults to the invoice's seller country. */
        locale?: string;
        view?: undefined;
      }
    | {
        /** A view built once with `buildInvoiceView(invoice, lang)`, to share between several parts. */
        view: InvoiceView;
        invoice?: undefined;
        lang?: undefined;
        locale?: undefined;
      }
  );

export type InvoiceProps = PartProps;

interface Ctx {
  v: InvoiceView;
  id: string;
  c: (name: string | undefined) => string | undefined;
}

function useCtx(props: PartProps): Ctx {
  const reactId = useId();
  const v = props.view ?? buildInvoiceView(props.invoice, props.lang, { locale: props.locale });
  const id = props.idPrefix ?? `einvoice${reactId.replace(/[^A-Za-z0-9_-]/g, '')}`;
  return { v, id, c: props.unstyled ? () => undefined : (name) => name };
}

/** Joins the built-in class with the caller's, leaving out whatever is empty. */
const rootClass = (ctx: Ctx, own: string, extra?: string) => [ctx.c(own), extra].filter(Boolean).join(' ') || undefined;

function Lines({ lines }: { lines: string[] }): ReactNode {
  return lines.map((l, i) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: static content, never reordered
    <Fragment key={i}>
      {i > 0 && <br />}
      {l}
    </Fragment>
  ));
}

function Paras({ paras }: { paras: Para[] }): ReactNode {
  return paras.map((p, i) =>
    p.kind === 'p' ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: static content, never reordered
      <p key={i}>
        <Lines lines={p.lines} />
      </p>
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: static content, never reordered
      <ul key={i}>
        {p.items.map((item, k) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static content, never reordered
          <li key={k}>{item}</li>
        ))}
      </ul>
    ),
  );
}

function ValueView({ v, ctx }: { v: Value; ctx: Ctx }): ReactNode {
  if (v.paras) return <Paras paras={v.paras} />;
  if (v.lines) return <Lines lines={v.lines} />;
  if (v.iso)
    return (
      <time dateTime={v.iso} title={v.title}>
        {v.text}
      </time>
    );
  if (v.code)
    return (
      <span className={ctx.c('einvoice-code')} title={v.title}>
        {v.text}
      </span>
    );
  if (v.title) return <span title={v.title}>{v.text}</span>;
  return v.text;
}

function FieldList({ fields, cls, ctx }: { fields: Field[]; cls: string; ctx: Ctx }): ReactNode {
  return (
    <dl className={ctx.c(cls)}>
      {fields.map((f, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: labels repeat (several identifiers), order is fixed
        <div key={i}>
          <dt>{f.label}</dt>
          <dd>
            <ValueView v={f.value} ctx={ctx} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Section({
  ctx,
  name,
  heading,
  className,
  children,
}: {
  ctx: Ctx;
  name: string;
  heading: string;
  className?: string;
  children: ReactNode;
}) {
  const hid = `${ctx.id}-${name}`;
  return (
    <section className={rootClass(ctx, `einvoice-section einvoice-${name}`, className)} aria-labelledby={hid}>
      <h2 className={ctx.c('einvoice-h2')} id={hid}>
        {heading}
      </h2>
      {children}
    </section>
  );
}

const numClass = (ctx: Ctx, col: Column | undefined) => ctx.c(col?.align === 'right' ? 'einvoice-num' : undefined);

function Table({ ctx, columns, rows }: { ctx: Ctx; columns: Column[]; rows: ReactNode[][] }) {
  return (
    <table className={ctx.c('einvoice-table')}>
      <thead>
        <tr>
          {columns.map((col, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed columns
            <th key={i} className={numClass(ctx, col)} scope="col">
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows keep the invoice's order
          <tr key={i}>
            {r.map((cell, k) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed columns
              <td key={k} className={numClass(ctx, columns[k])}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Title, document type, the key dates and the amount due. Credit notes carry a badge. */
export function InvoiceHeader(props: PartProps) {
  const ctx = useCtx(props);
  const { v } = ctx;
  return (
    <header className={rootClass(ctx, 'einvoice-header', props.className)}>
      <div className={ctx.c('einvoice-headline')}>
        {v.credit && <p className={ctx.c('einvoice-badge')}>{v.docLabel}</p>}
        <h1 className={ctx.c('einvoice-title')} id={`${ctx.id}-title`}>
          {`${v.docLabel} `}
          <span className={ctx.c('einvoice-number')}>{v.number}</span>
        </h1>
        {v.meta.length > 0 && <FieldList fields={v.meta} cls="einvoice-meta" ctx={ctx} />}
      </div>
      <dl className={ctx.c('einvoice-facts')}>
        {v.facts.map((f) => (
          <div key={f.label} className={ctx.c('einvoice-fact')}>
            <dt>{f.label}</dt>
            <dd>
              <ValueView v={f.value} ctx={ctx} />
            </dd>
          </div>
        ))}
        <div className={ctx.c('einvoice-due')}>
          <dt>{v.due.label}</dt>
          <dd>
            <ValueView v={v.due.value} ctx={ctx} />
          </dd>
        </div>
      </dl>
    </header>
  );
}

function Party({ p, ctx }: { p: PartyView; ctx: Ctx }) {
  const hid = `${ctx.id}-${p.role}`;
  return (
    <section className={ctx.c(`einvoice-party einvoice-party--${p.role}`)} aria-labelledby={hid}>
      <h2 className={ctx.c('einvoice-h2')} id={hid}>
        {p.heading}
      </h2>
      {p.name && <p className={ctx.c('einvoice-party-name')}>{p.name}</p>}
      {p.tradingName && <p className={ctx.c('einvoice-trading')}>{p.tradingName}</p>}
      {p.address.length > 0 && (
        <address className={ctx.c('einvoice-address')}>
          <Lines lines={p.address} />
        </address>
      )}
      {p.fields.length > 0 && <FieldList fields={p.fields} cls="einvoice-fields" ctx={ctx} />}
    </section>
  );
}

/** Seller and buyer, plus payee, tax representative and delivery when the invoice has them. */
export function InvoiceParties(props: PartProps) {
  const ctx = useCtx(props);
  return (
    <div className={rootClass(ctx, 'einvoice-parties', props.className)}>
      {ctx.v.parties.map((p) => (
        <Party key={p.role} p={p} ctx={ctx} />
      ))}
    </div>
  );
}

/** Order, contract, project and other references. Renders nothing when there are none. */
export function InvoiceReferences(props: PartProps) {
  const ctx = useCtx(props);
  if (ctx.v.references.length === 0) return null;
  return (
    <Section ctx={ctx} name="references" heading={ctx.v.headings.references} className={props.className}>
      <FieldList fields={ctx.v.references} cls="einvoice-fields" ctx={ctx} />
    </Section>
  );
}

/** The invoice lines: description with details, quantity with its unit, unit price, VAT and net amount. */
export function InvoiceLines(props: PartProps) {
  const ctx = useCtx(props);
  const { v } = ctx;
  if (v.lines.empty) {
    return (
      <Section ctx={ctx} name="lines" heading={v.headings.lines} className={props.className}>
        <p className={ctx.c('einvoice-empty')}>{v.lines.empty}</p>
      </Section>
    );
  }
  const rows = v.lines.rows.map((l) => [
    l.id,
    <>
      <p className={ctx.c('einvoice-item')}>{l.name}</p>
      <Paras paras={l.description} />
      {l.details.length > 0 && <p className={ctx.c('einvoice-details')}>{l.details.join(' · ')}</p>}
      {l.adjustments.length > 0 && (
        <p className={ctx.c('einvoice-adjustments')}>
          <Lines lines={l.adjustments} />
        </p>
      )}
    </>,
    <ValueView key="qty" v={l.quantity} ctx={ctx} />,
    <>
      {l.unitPrice}
      {l.priceBasis && (
        <>
          <br />
          <span className={ctx.c('einvoice-basis')}>{l.priceBasis}</span>
        </>
      )}
    </>,
    <ValueView key="vat" v={l.vat} ctx={ctx} />,
    l.net,
  ]);
  return (
    <Section ctx={ctx} name="lines" heading={v.headings.lines} className={props.className}>
      <div className={ctx.c('einvoice-scroll')}>
        <Table ctx={ctx} columns={v.lines.columns} rows={rows} />
      </div>
    </Section>
  );
}

function Adjustments({
  ctx,
  name,
  items,
  className,
}: {
  ctx: Ctx;
  name: 'allowances' | 'charges';
  items: AdjustmentView[];
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <Section ctx={ctx} name={name} heading={ctx.v.headings[name]} className={className}>
      <Table
        ctx={ctx}
        columns={ctx.v.adjustmentColumns}
        rows={items.map((a) => [a.reason, <ValueView key="vat" v={a.vat} ctx={ctx} />, a.amount])}
      />
    </Section>
  );
}

/** Document-level allowances and charges, each as its own table. Renders nothing when there are none. */
export function InvoiceAdjustments(props: PartProps) {
  const ctx = useCtx(props);
  return (
    <>
      <Adjustments ctx={ctx} name="allowances" items={ctx.v.allowances} className={props.className} />
      <Adjustments ctx={ctx} name="charges" items={ctx.v.charges} className={props.className} />
    </>
  );
}

/** One row per VAT category and rate, with the exemption reason when there is one. */
export function VatBreakdown(props: PartProps) {
  const ctx = useCtx(props);
  const { v } = ctx;
  if (v.vat.rows.length === 0) return null;
  const rows = v.vat.rows.map((r) =>
    [<ValueView key="cat" v={r.category} ctx={ctx} />, r.rate, r.taxable, r.tax, r.exemption].slice(0, v.vat.columns.length),
  );
  return (
    <Section ctx={ctx} name="vat" heading={v.headings.vat} className={props.className}>
      <Table ctx={ctx} columns={v.vat.columns} rows={rows} />
    </Section>
  );
}

const totalClass = (k: TotalKind) => (k === 'normal' ? 'einvoice-total' : `einvoice-total einvoice-total--${k}`);

/** Document totals from the line sum to the amount due, which is emphasised. */
export function InvoiceTotals(props: PartProps) {
  const ctx = useCtx(props);
  return (
    <Section ctx={ctx} name="totals" heading={ctx.v.headings.totals} className={props.className}>
      <dl className={ctx.c('einvoice-totals-list')}>
        {ctx.v.totals.map((r) => (
          <div key={r.key} className={ctx.c(totalClass(r.kind))}>
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

/** How to pay: means, account (IBAN in groups of four), payment reference, terms and any payment schedule. */
export function PaymentDetails(props: PartProps) {
  const ctx = useCtx(props);
  const { v } = ctx;
  const { terms, methods } = v.payment;
  if (!terms.length && !methods.length && !v.schedule.rows.length) return null;
  return (
    <Section ctx={ctx} name="payment" heading={v.headings.payment} className={props.className}>
      {methods.map((m, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: payment means keep the invoice's order
        <div key={i} className={ctx.c('einvoice-method')}>
          <h3 className={ctx.c('einvoice-h3')}>{m.heading}</h3>
          {m.fields.length > 0 && <FieldList fields={m.fields} cls="einvoice-fields" ctx={ctx} />}
        </div>
      ))}
      {terms.length > 0 && (
        <div className={ctx.c('einvoice-terms')}>
          <h3 className={ctx.c('einvoice-h3')}>{v.headings.terms}</h3>
          <Paras paras={terms} />
        </div>
      )}
      {v.schedule.rows.length > 0 && (
        <>
          <h3 className={ctx.c('einvoice-h3')}>{v.headings.schedule}</h3>
          <Table
            ctx={ctx}
            columns={v.schedule.columns}
            rows={v.schedule.rows.map((s) => [<ValueView key="due" v={s.due} ctx={ctx} />, s.amount, s.description])}
          />
        </>
      )}
    </Section>
  );
}

/** Notes (split into paragraphs and lists) and attachment names. Renders nothing when there are none. */
export function InvoiceNotes(props: PartProps) {
  const ctx = useCtx(props);
  const { v } = ctx;
  return (
    <>
      {v.notes.length > 0 && (
        <Section ctx={ctx} name="notes" heading={v.headings.notes} className={props.className}>
          {v.notes.map((n, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: notes keep the invoice's order
            <div key={i} className={ctx.c('einvoice-note')}>
              {n.subject && <p className={ctx.c('einvoice-note-subject')}>{n.subject}</p>}
              <Paras paras={n.paras} />
            </div>
          ))}
        </Section>
      )}
      {v.attachments.length > 0 && (
        <Section ctx={ctx} name="attachments" heading={v.headings.attachments} className={props.className}>
          <ul className={ctx.c('einvoice-list')}>
            {v.attachments.map((a, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: attachments keep the invoice's order
              <li key={i}>{a}</li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

/**
 * A whole invoice: header, parties, references, lines, allowances and charges, VAT breakdown, totals,
 * payment details, notes and attachments. Import `eu-einvoice-canonical/react/invoice.css` for the default
 * look, theme it with the `--einvoice-*` custom properties, or pass `unstyled` and style it yourself.
 */
export function Invoice(props: InvoiceProps) {
  const ctx = useCtx(props);
  const part = { view: ctx.v, idPrefix: ctx.id, unstyled: props.unstyled };
  return (
    <article
      className={rootClass(ctx, ctx.v.credit ? 'einvoice einvoice--credit' : 'einvoice', props.className)}
      lang={ctx.v.lang}
      aria-labelledby={`${ctx.id}-title`}
    >
      <InvoiceHeader {...part} />
      <InvoiceParties {...part} />
      <InvoiceReferences {...part} />
      <InvoiceLines {...part} />
      <InvoiceAdjustments {...part} />
      <VatBreakdown {...part} />
      <InvoiceTotals {...part} />
      <PaymentDetails {...part} />
      <InvoiceNotes {...part} />
    </article>
  );
}
