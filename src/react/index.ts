/**
 * `eu-einvoice-canonical/react`: React components for a canonical invoice.
 *
 *   import { Invoice } from 'eu-einvoice-canonical/react';
 *   import 'eu-einvoice-canonical/react/invoice.css';
 *
 *   <Invoice invoice={canonicalInvoice} lang="de" />
 *
 * React (and react-dom, for server rendering) are optional peer dependencies of the package; only this
 * entry point imports React, never the main one.
 */

export type { CanonicalInvoice } from '../canonical.js';
export { RENDER_LANGUAGES, type RenderLanguage } from '../render/labels.js';
export { buildInvoiceView, type InvoiceView } from '../render/model.js';
export {
  Invoice,
  InvoiceAdjustments,
  InvoiceHeader,
  InvoiceLines,
  InvoiceNotes,
  InvoiceParties,
  type InvoiceProps,
  InvoiceReferences,
  InvoiceTotals,
  type PartProps,
  PaymentDetails,
  VatBreakdown,
} from './Invoice.js';
