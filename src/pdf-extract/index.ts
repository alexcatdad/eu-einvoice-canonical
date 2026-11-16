/// <reference path="./layout/pdfjs-worker.d.ts" />
/**
 * Deterministic extraction of an invoice from the text layer of a PDF without embedded XML: no OCR, no language model,
 * no network. Used by `convert(..., { extractPdf: true })`, which loads this module on demand.
 *
 * Steps: layout model and text quality check (layout.ts), payment reminders as not an invoice, generic Swedish rules
 * (generic.ts), rule layers (rules/: generator profile, then issuer template), payment QR codes (qr.ts), then reconciliation (generic/build.ts):
 * only a complete, reconciling result is `ok`.
 */
import type { CanonicalInvoice, PdfRegion, SourceWarning } from '../canonical.js';
import { buildExtraction } from './generic/build.js';
import { readInvoice } from './generic.js';
import { extractLayout } from './layout.js';
import { applyPaymentQr, findQrCodes, qrPaymentFacts } from './qr.js';
import { applyRules, BUNDLED_PROFILES, loadPdfRuleSet, PdfRuleError, type PdfRuleSet } from './rules/index.js';

export interface PdfExtractOptions {
  /** SHA-256 (hex) of the received file, for `source.fileSha256`. */
  fileSha256: string;
  /** Name of the received file, for `source.filename`. */
  filename?: string;
  /**
   * Issuer templates (JSON following schemas/pdf-rule-set.v1.schema.json, kind `issuer-template`), applied after the
   * generic rules and the bundled generator profiles. An invalid template throws `PdfRuleError`.
   */
  templates?: readonly unknown[];
}

/**
 * The values read from a PDF that did not give a complete invoice: fields are missing, ambiguous or contradictory,
 * or the amounts do not reconcile. A draft is never a valid invoice; it is a starting point for a person to finish.
 */
export interface InvoiceDraft {
  /** Canonical JSON Pointer -> value as read and normalised (Decimal, IsoDate, identifier...), e.g. `'/totals/payable': '1250.00'`. */
  fields: Record<string, string>;
  /** Canonical JSON Pointer -> the region of the page the value was read from. Same keys as `fields`. */
  pdfProvenance: Record<string, PdfRegion>;
  /** Why the draft is not an invoice: missing, ambiguous or contradictory fields and failed reconciliation, with page and position when known. */
  problems: SourceWarning[];
}

/**
 * Payment facts decoded from a payment QR code (Swedish UsingQR) on a PDF whose text could not be read: amount due,
 * due date, currency and the Bankgiro, Plusgiro or IBAN account, keyed by the same canonical JSON Pointers as
 * {@link InvoiceDraft} fields, with the QR code's region as provenance. Nothing else is read from such a file.
 */
export type PdfPaymentFacts = Pick<InvoiceDraft, 'fields' | 'pdfProvenance'>;

/**
 * What an extractor returns for one PDF.
 * - `ok`: complete and reconciling. `invoice.source.format` is `'pdf-text'`, `invoice.source.pdfProvenance` records
 *   page and region per field, and non-blocking problems are in `invoice.source.warnings`.
 * - `draft`: incomplete or not reconciling; see {@link InvoiceDraft}.
 * - `unsupported`: no text layer (scan), garbled or unmapped text, annotations only, or a layout the rules do not cover.
 *   When the text cannot be read but the page carries a payment QR code, `payment` holds the QR code's payment facts
 *   only; the status stays `unsupported`.
 * - `not-an-invoice`: recognised as another document, e.g. a payment reminder.
 */
export type PdfExtraction =
  | { status: 'ok'; invoice: CanonicalInvoice }
  | { status: 'draft'; draft: InvoiceDraft }
  | { status: 'unsupported'; reason: string; payment?: PdfPaymentFacts }
  | { status: 'not-an-invoice'; reason: string };

/** Reads one PDF. Deterministic: the same bytes and library version always give the same result. Throws only on internal faults. */
export type PdfExtractor = (bytes: Uint8Array, options: PdfExtractOptions) => Promise<PdfExtraction>;

export const extractPdfInvoice: PdfExtractor = async (bytes, options) => {
  const templates = (options.templates ?? []).map(loadPdfRuleSet);
  const wrong = templates.find((t) => t.kind !== 'issuer-template');
  if (wrong) throw new PdfRuleError(wrong.id, ['/kind: callers pass issuer templates only']);
  try {
    const layout = await extractLayout(bytes);
    if (!layout.quality.supported) {
      const reason = `PDF text cannot be read: ${layout.quality.reasons.map((r) => r.detail).join('; ')}`;
      // The text stays unread; a payment QR code still gives payment facts (decoding is not OCR)
      const qr = layout.pages.length ? qrPaymentFacts(await findQrCodes(bytes)) : undefined;
      if (!qr) return { status: 'unsupported', reason };
      const payment: PdfPaymentFacts = { fields: {}, pdfProvenance: {} };
      for (const [k, { value, region }] of Object.entries(qr)) {
        payment.fields[k] = value;
        payment.pdfProvenance[k] = region;
      }
      return { status: 'unsupported', reason, payment };
    }
    const read = applyRules(layout, readInvoice(layout), BUNDLED_PROFILES, templates);
    const codes = read.notAnInvoice ? [] : await findQrCodes(bytes, read.pages);
    return buildExtraction(applyPaymentQr(read, codes), options);
  } catch (error) {
    // pdf.js reports a damaged file it opened (a page tree or object it cannot parse) with these exceptions
    if (error instanceof Error && PDFJS_PARSE_ERRORS.has(error.name))
      return { status: 'unsupported', reason: `The file is not a readable PDF: ${error.message}` };
    throw error;
  }
};

const PDFJS_PARSE_ERRORS = new Set(['UnknownErrorException', 'InvalidPDFException', 'FormatError']);

export { loadPdfRuleSet, PdfRuleError, type PdfRuleSet };
