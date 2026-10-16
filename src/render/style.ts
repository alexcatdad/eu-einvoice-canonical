/**
 * The stylesheet shared by `renderHtml` (inlined) and the React component (shipped as
 * `src/react/invoice.css`, generated from this by `bun run build:react-css` and checked by a test).
 *
 * Every rule is a single class, so parts work on their own and are easy to override. Colours, fonts and
 * spacing come from custom properties with built-in defaults; set them on any ancestor to theme the invoice:
 *
 *   --einvoice-font, --einvoice-mono, --einvoice-size, --einvoice-ink, --einvoice-muted, --einvoice-rule,
 *   --einvoice-surface, --einvoice-subtle, --einvoice-accent, --einvoice-credit, --einvoice-radius
 *
 * In a shadcn/ui app, add the class `einvoice-shadcn` (to the invoice or any ancestor) to take these from the
 * shadcn theme tokens (--foreground, --muted-foreground, --border, --background, --muted, --primary,
 * --destructive, --radius, --font-sans, --font-mono), dark mode included. It is opt-in because the tokens must
 * be complete colours (shadcn with Tailwind v4); with the older HSL-triplet tokens set --einvoice-* yourself.
 */
export const INVOICE_CSS = `.einvoice-shadcn {
  --einvoice-font: var(--font-sans, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
  --einvoice-mono: var(--font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace);
  --einvoice-ink: var(--foreground, #1b1b1f);
  --einvoice-muted: var(--muted-foreground, #5b5b66);
  --einvoice-rule: var(--border, #d5d5dc);
  --einvoice-surface: var(--background, #fff);
  --einvoice-subtle: var(--muted, #f4f4f7);
  --einvoice-accent: var(--primary, #1f4fd1);
  --einvoice-credit: var(--destructive, #b42318);
  --einvoice-radius: var(--radius, 6px);
}
.einvoice {
  font: var(--einvoice-size, 14px) / 1.5 var(--einvoice-font, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
  color: var(--einvoice-ink, #1b1b1f);
  background: var(--einvoice-surface, #fff);
  max-width: 60rem;
  margin: 0 auto;
  padding: 2rem;
  box-sizing: border-box;
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}
.einvoice-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 1rem 2rem;
  padding-bottom: 1.25rem;
  border-bottom: 3px solid var(--einvoice-accent, #1f4fd1);
}
.einvoice--credit .einvoice-header {
  border-bottom-color: var(--einvoice-credit, #b42318);
}
.einvoice-badge {
  display: inline-block;
  margin: 0 0 0.4rem;
  padding: 0.1rem 0.55rem;
  border-radius: var(--einvoice-radius, 6px);
  background: var(--einvoice-credit, #b42318);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.einvoice-title {
  margin: 0;
  font-size: 1.75rem;
  line-height: 1.2;
  font-weight: 700;
}
.einvoice-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0 1rem;
  margin: 0.4rem 0 0;
  color: var(--einvoice-muted, #5b5b66);
  font-size: 0.85rem;
}
.einvoice-meta > div {
  display: flex;
  gap: 0.3rem;
}
.einvoice-meta dd {
  margin: 0;
  color: var(--einvoice-ink, #1b1b1f);
}
.einvoice-facts {
  display: grid;
  grid-template-columns: auto auto;
  gap: 0.2rem 1rem;
  margin: 0;
  align-content: start;
}
.einvoice-fact,
.einvoice-due {
  display: contents;
}
.einvoice-fact dt,
.einvoice-due dt {
  color: var(--einvoice-muted, #5b5b66);
}
.einvoice-fact dd,
.einvoice-due dd {
  margin: 0;
  text-align: right;
}
.einvoice-due dt,
.einvoice-due dd {
  padding-top: 0.4rem;
  font-weight: 700;
  color: var(--einvoice-ink, #1b1b1f);
}
.einvoice-due dd {
  font-size: 1.35rem;
  line-height: 1.2;
  color: var(--einvoice-accent, #1f4fd1);
}
.einvoice--credit .einvoice-due dd {
  color: var(--einvoice-credit, #b42318);
}
.einvoice-parties {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: 1rem 2rem;
}
.einvoice-party {
  margin-top: 1.5rem;
}
.einvoice-party-name {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 650;
}
.einvoice-trading {
  margin: 0;
  color: var(--einvoice-muted, #5b5b66);
}
.einvoice-address {
  margin: 0.3rem 0 0.5rem;
  font-style: normal;
}
.einvoice-section {
  margin-top: 1.75rem;
  break-inside: auto;
}
.einvoice-h2 {
  margin: 0 0 0.5rem;
  padding-bottom: 0.2rem;
  border-bottom: 1px solid var(--einvoice-rule, #d5d5dc);
  color: var(--einvoice-muted, #5b5b66);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  break-after: avoid;
}
.einvoice-party .einvoice-h2 {
  margin-bottom: 0.4rem;
}
.einvoice-h3 {
  margin: 0.9rem 0 0.3rem;
  font-size: 0.95rem;
  font-weight: 650;
}
.einvoice-fields {
  display: grid;
  grid-template-columns: minmax(6rem, 38%) minmax(0, 1fr);
  gap: 0.15rem 0.9rem;
  margin: 0;
}
.einvoice-fields > div {
  display: contents;
}
.einvoice-fields dt {
  color: var(--einvoice-muted, #5b5b66);
}
.einvoice-fields dd {
  margin: 0;
}
.einvoice-party .einvoice-fields {
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
}
.einvoice-party .einvoice-fields dt {
  margin-top: 0.3rem;
  font-size: 0.8rem;
}
.einvoice-fields dd > p,
.einvoice-fields dd > ul {
  margin: 0;
}
.einvoice-code {
  font-family: var(--einvoice-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace);
  font-size: 0.92em;
  white-space: nowrap;
}
.einvoice-scroll {
  overflow-x: auto;
}
.einvoice-table {
  width: 100%;
  border-collapse: collapse;
}
.einvoice-table th,
.einvoice-table td {
  padding: 0.45rem 0.5rem;
  border-bottom: 1px solid var(--einvoice-rule, #d5d5dc);
  text-align: left;
  vertical-align: top;
}
.einvoice-table th {
  background: var(--einvoice-subtle, #f4f4f7);
  color: var(--einvoice-muted, #5b5b66);
  font-size: 0.8rem;
  font-weight: 600;
}
.einvoice-table tr {
  break-inside: avoid;
}
.einvoice-table td > p,
.einvoice-table td > ul {
  margin: 0.15rem 0 0;
}
.einvoice-table td > ul {
  padding-left: 1.1rem;
}
.einvoice-table .einvoice-num {
  text-align: right;
  white-space: nowrap;
}
.einvoice-item {
  font-weight: 600;
}
.einvoice-table td > .einvoice-item {
  margin-top: 0;
}
.einvoice-details,
.einvoice-adjustments,
.einvoice-basis {
  color: var(--einvoice-muted, #5b5b66);
  font-size: 0.85em;
}
.einvoice-empty {
  color: var(--einvoice-muted, #5b5b66);
  font-style: italic;
}
.einvoice-totals {
  max-width: 28rem;
  margin-left: auto;
}
.einvoice-totals-list {
  display: grid;
  grid-template-columns: 1fr auto;
  margin: 0;
}
.einvoice-total {
  display: contents;
}
.einvoice-total dt,
.einvoice-total dd {
  margin: 0;
  padding: 0.2rem 0;
}
.einvoice-total dt {
  color: var(--einvoice-muted, #5b5b66);
}
.einvoice-total dd {
  text-align: right;
  white-space: nowrap;
  padding-left: 1rem;
}
.einvoice-total--subtotal dt,
.einvoice-total--subtotal dd {
  border-top: 1px solid var(--einvoice-rule, #d5d5dc);
  color: var(--einvoice-ink, #1b1b1f);
  font-weight: 600;
}
.einvoice-total--due dt,
.einvoice-total--due dd {
  margin-top: 0.35rem;
  padding: 0.55rem 0;
  border-top: 2px solid var(--einvoice-ink, #1b1b1f);
  color: var(--einvoice-ink, #1b1b1f);
  font-size: 1.15rem;
  font-weight: 700;
}
.einvoice-total--due dd {
  color: var(--einvoice-accent, #1f4fd1);
}
.einvoice--credit .einvoice-total--due dd {
  color: var(--einvoice-credit, #b42318);
}
.einvoice-terms > p,
.einvoice-note > p,
.einvoice-terms > ul,
.einvoice-note > ul {
  margin: 0 0 0.4rem;
}
.einvoice-method {
  padding: 0.1rem 0 0.4rem;
}
.einvoice-note {
  margin-bottom: 0.75rem;
}
.einvoice-note-subject {
  color: var(--einvoice-muted, #5b5b66);
  font-size: 0.8rem;
  font-weight: 600;
}
.einvoice-list {
  margin: 0;
  padding-left: 1.2rem;
}
@media (max-width: 40rem) {
  .einvoice {
    padding: 1rem;
  }
  .einvoice-fields {
    grid-template-columns: 1fr;
  }
  .einvoice-fields dt {
    margin-top: 0.35rem;
  }
}
@media print {
  .einvoice {
    max-width: none;
    padding: 0;
    font-size: 10pt;
  }
  .einvoice-scroll {
    overflow: visible;
  }
}
`;

/**
 * Page geometry for printing the HTML rendering. Kept out of the React stylesheet, where a page rule would
 * apply to the whole host application.
 */
export const PAGE_CSS = '@media print{@page{size:A4;margin:15mm}}';

/** The contents of src/react/invoice.css. */
export function reactCss(): string {
  return `/* eu-einvoice-canonical/react: generated from src/render/style.ts by \`bun run build:react-css\`. Do not edit. */\n${INVOICE_CSS}`;
}
