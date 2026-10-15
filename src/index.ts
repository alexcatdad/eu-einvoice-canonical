import type { CanonicalInvoice } from './canonical.js';
import { checkTotals } from './checks.js';
import { detectXml, type Detection } from './detect.js';
import { unwrap, type Skipped, type UnwrapLimits, type XmlPayload } from './envelope.js';
import { NotImplementedError, PARSERS, ParseError } from './parsers/index.js';
import { unavailableSummary } from './validation/plan.js';
import type { ValidateOptions } from './validation/index.js';

export * from './canonical.js';
export * from './codes.js';
export { FORMATS, FORMATS_BY_ID, type FormatDef, type FormatId, type ParserFamily } from './formats.js';
export { detectXml, type Detection } from './detect.js';
export { unwrap, decodeXml, DEFAULT_LIMITS, type Skipped, type UnwrapLimits, type XmlPayload } from './envelope.js';
export { checkTotals, type Finding } from './checks.js';
export { IMPLEMENTED_FAMILIES, NotImplementedError, ParseError } from './parsers/index.js';
export * as values from './values.js';
export type { ValidateOptions } from './validation/index.js';

export interface InspectedDocument {
  payload: Omit<XmlPayload, 'xml'>;
  detection: Detection;
}

export interface InspectResult {
  fileSha256: string;
  documents: InspectedDocument[];
  /** Everything in the file that did not become a document, with the reason (DOCTYPE, size limits, detached signatures...). */
  skipped: Skipped[];
}

/** Unwraps a received file and identifies every XML document in it, without parsing. */
export async function inspect(bytes: Uint8Array, filename?: string, limits?: Partial<UnwrapLimits>): Promise<InspectResult> {
  const { fileSha256, payloads, skipped } = await unwrap(bytes, filename, limits);
  const documents = payloads.map(({ xml, ...payload }) => ({ payload, detection: detectXml(xml, { fromPdf: payload.fromPdf }) }));
  return { fileSha256, documents, skipped };
}

export type ConvertOutcome =
  | { status: 'ok'; invoices: CanonicalInvoice[]; detection: Detection; payload: Omit<XmlPayload, 'xml'> }
  | { status: 'not-an-invoice'; detection: Detection; payload: Omit<XmlPayload, 'xml'> }
  | { status: 'unsupported'; detection: Detection; payload: Omit<XmlPayload, 'xml'>; reason: string }
  | { status: 'error'; detection: Detection; payload: Omit<XmlPayload, 'xml'>; error: string };

export interface ConvertResult {
  fileSha256: string;
  /** One outcome per XML document found in the file. Empty when nothing usable was found; see `skipped`. */
  outcomes: ConvertOutcome[];
  skipped: Skipped[];
}

export interface ConvertOptions {
  /**
   * Run the XSD, EN 16931 Schematron and CIUS/Peppol Schematron layers on UBL and CII invoices and
   * fill `source.validation`. Off by default: it loads the validators (SaxonJS, xmllint-wasm).
   */
  validate?: boolean;
  /** Where the validator bundles are read from. */
  validation?: ValidateOptions;
}

/**
 * Loaded on demand through a specifier the bundler cannot follow, so the validators never end up
 * in a bundle that only converts. If the validation/ directory is not next to the bundle the
 * import fails and every layer reports 'unavailable'.
 */
async function loadValidation(): Promise<typeof import('./validation/index.js')> {
  const specifier = ['.', 'validation', 'index.js'].join('/');
  return import(/* @vite-ignore */ specifier);
}

/** Unwraps, detects and parses. Never throws for bad input: every problem is an outcome or a skipped entry. */
export async function convert(bytes: Uint8Array, filename?: string, limits?: Partial<UnwrapLimits>, options: ConvertOptions = {}): Promise<ConvertResult> {
  const { fileSha256, payloads, skipped } = await unwrap(bytes, filename, limits);
  const outcomes = payloads.map(({ xml, ...meta }): ConvertOutcome => {
    const payload = { xml, ...meta };
    const detection = detectXml(xml, { fromPdf: meta.fromPdf });
    if (detection.kind === 'other-document') return { status: 'not-an-invoice', detection, payload: meta };
    if (detection.kind === 'unknown') return { status: 'unsupported', detection, payload: meta, reason: detection.reason };
    try {
      const invoices = PARSERS[detection.format.family]({ payload, format: detection.format, details: detection.details, fileSha256 });
      invoices.forEach((inv, i) => {
        if (invoices.length > 1) inv.source.indexInFile = i;
        inv.source.warnings.push(...checkTotals(inv));
      });
      return { status: 'ok', invoices, detection, payload: meta };
    } catch (e) {
      if (e instanceof NotImplementedError) return { status: 'unsupported', detection, payload: meta, reason: e.message };
      if (e instanceof ParseError) return { status: 'error', detection, payload: meta, error: e.message };
      return { status: 'error', detection, payload: meta, error: `Internal error: ${(e as Error).message}` };
    }
  });
  if (options.validate) {
    let validation: typeof import('./validation/index.js') | undefined;
    let loadError = '';
    try {
      validation = await loadValidation();
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
    await Promise.all(outcomes.map(async (outcome, i) => {
      if (outcome.status !== 'ok') return;
      const summary = validation
        ? await validation.validate(payloads[i], outcome.detection, options.validation)
        : unavailableSummary(outcome.detection, loadError);
      for (const inv of outcome.invoices) inv.source.validation = structuredClone(summary);
    }));
  }
  return { fileSha256, outcomes, skipped };
}
