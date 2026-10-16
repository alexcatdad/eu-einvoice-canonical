/**
 * The stylesheet shared by `renderHtml` (inlined) and the React component (shipped as
 * `src/react/invoice.css`, generated from this by `bun run build:react-css` and checked by a test).
 *
 * Every rule is a single class, so parts work on their own and are easy to override. Colours, fonts and
 * spacing come from custom properties with built-in defaults; set them on any ancestor to theme the invoice:
 *
 *   --einvoice-font, --einvoice-mono, --einvoice-size, --einvoice-ink, --einvoice-muted, --einvoice-rule,
 *   --einvoice-surface, --einvoice-subtle, --einvoice-accent, --einvoice-credit, --einvoice-radius,
 *   --einvoice-space-1 .. --einvoice-space-8 (the spacing scale: 4, 8, 12, 16, 24, 32, 48 and 64px)
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
  padding: var(--einvoice-space-6, 32px);
  box-sizing: border-box;
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}
.einvoice-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--einvoice-space-4, 16px) var(--einvoice-space-6, 32px);
  padding-bottom: var(--einvoice-space-5, 24px);
  border-bottom: 3px solid var(--einvoice-accent, #1f4fd1);
}
.einvoice--credit .einvoice-header {
  border-bottom-color: var(--einvoice-credit, #b42318);
}
.einvoice-badge {
  display: inline-block;
  margin: 0 0 var(--einvoice-space-2, 8px);
  padding: var(--einvoice-space-1, 4px) var(--einvoice-space-2, 8px);
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
.einvoice-number {
  display: inline-block;
  max-width: 100%;
}
.einvoice-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--einvoice-space-4, 16px);
  margin: var(--einvoice-space-2, 8px) 0 0;
  color: var(--einvoice-muted, #5b5b66);
  font-size: 0.85rem;
}
.einvoice-meta > div {
  display: flex;
  gap: var(--einvoice-space-1, 4px);
}
.einvoice-meta dd {
  margin: 0;
  color: var(--einvoice-ink, #1b1b1f);
}
.einvoice-facts {
  display: grid;
  grid-template-columns: auto auto;
  gap: var(--einvoice-space-1, 4px) var(--einvoice-space-4, 16px);
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
  padding-top: var(--einvoice-space-2, 8px);
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
  gap: var(--einvoice-space-4, 16px) var(--einvoice-space-6, 32px);
}
.einvoice-party {
  margin-top: var(--einvoice-space-6, 32px);
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
  margin: var(--einvoice-space-1, 4px) 0 var(--einvoice-space-2, 8px);
  font-style: normal;
}
.einvoice-section {
  margin-top: var(--einvoice-space-6, 32px);
  break-inside: auto;
}
.einvoice-h2 {
  margin: 0 0 var(--einvoice-space-2, 8px);
  padding-bottom: var(--einvoice-space-1, 4px);
  border-bottom: 1px solid var(--einvoice-rule, #d5d5dc);
  color: var(--einvoice-muted, #5b5b66);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  break-after: avoid;
}
.einvoice-h3 {
  margin: var(--einvoice-space-4, 16px) 0 var(--einvoice-space-1, 4px);
  font-size: 0.95rem;
  font-weight: 650;
}
.einvoice-fields {
  display: grid;
  grid-template-columns: minmax(6rem, 38%) minmax(0, 1fr);
  gap: var(--einvoice-space-1, 4px) var(--einvoice-space-4, 16px);
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
  margin-top: var(--einvoice-space-1, 4px);
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
  padding: var(--einvoice-space-2, 8px) var(--einvoice-space-3, 12px);
  border-bottom: 1px solid var(--einvoice-rule, #d5d5dc);
  text-align: left;
  vertical-align: top;
}
.einvoice-lines .einvoice-table th:first-child {
  white-space: nowrap;
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
  margin: var(--einvoice-space-1, 4px) 0 0;
}
.einvoice-table td > ul {
  padding-left: var(--einvoice-space-4, 16px);
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
  padding: var(--einvoice-space-1, 4px) 0;
}
.einvoice-total dt {
  color: var(--einvoice-muted, #5b5b66);
}
.einvoice-total dd {
  text-align: right;
  white-space: nowrap;
  padding-left: var(--einvoice-space-4, 16px);
}
.einvoice-total--subtotal dt,
.einvoice-total--subtotal dd {
  border-top: 1px solid var(--einvoice-rule, #d5d5dc);
  color: var(--einvoice-ink, #1b1b1f);
  font-weight: 600;
}
.einvoice-total--due dt,
.einvoice-total--due dd {
  margin-top: var(--einvoice-space-1, 4px);
  padding: var(--einvoice-space-2, 8px) 0;
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
  margin: 0 0 var(--einvoice-space-2, 8px);
}
.einvoice-method {
  padding: var(--einvoice-space-1, 4px) 0 var(--einvoice-space-2, 8px);
}
.einvoice-note {
  margin-bottom: var(--einvoice-space-3, 12px);
}
.einvoice-note-subject {
  color: var(--einvoice-muted, #5b5b66);
  font-size: 0.8rem;
  font-weight: 600;
}
.einvoice-list {
  margin: 0;
  padding-left: var(--einvoice-space-4, 16px);
}
@media (max-width: 40rem) {
  .einvoice {
    padding: var(--einvoice-space-4, 16px);
  }
  .einvoice-fields {
    grid-template-columns: 1fr;
  }
  .einvoice-fields dt {
    margin-top: var(--einvoice-space-1, 4px);
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
 * Page geometry for printing the standalone HTML page: A4 with 15 mm margins, and no extra user-agent body
 * margin on top. Kept out of the embeddable fragment and the React stylesheet, where these rules would apply
 * to the whole host document.
 */
export const PAGE_CSS = '@media print{@page{size:A4;margin:15mm}body{margin:0}}';

/** The contents of src/react/invoice.css. */
export function reactCss(): string {
  return `/* eu-einvoice-canonical/react: generated from src/render/style.ts by \`bun run build:react-css\`. Do not edit. */\n${INVOICE_CSS}`;
}
