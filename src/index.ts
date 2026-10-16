import type { CanonicalInvoice } from './canonical.js';
import { checkTotals } from './checks.js';
import { type Detection, detectXml } from './detect.js';
import { type Skipped, type UnwrapLimits, type UnwrapOptions, unwrap, type XmlPayload } from './envelope.js';
import { NotImplementedError, PARSERS, ParseError } from './parsers/index.js';
import { clearProbeCache } from './probe.js';
import { applyRelations } from './relations/rules.js';
import { signatureFindings, signatureStatus } from './signature/index.js';
import type { ValidateOptions } from './validation/index.js';
import { unavailableSummary } from './validation/plan.js';
import { ValueError } from './values.js';

export * from './canonical.js';
export { checkTotals, type Finding } from './checks.js';
export * from './codes.js';
export { type Detection, detectXml } from './detect.js';
export * from './duplicates/index.js';
export { DEFAULT_LIMITS, decodeXml, type Skipped, type UnwrapLimits, type UnwrapOptions, unwrap, type XmlPayload } from './envelope.js';
export * from './export/index.js';
export {
  describeFormats,
  FORMATS,
  FORMATS_BY_ID,
  type FormatDef,
  type FormatId,
  type FormatInfo,
  type FormatStatus,
  type ParserFamily,
} from './formats.js';
export * as matching from './matching/index.js';
export { IMPLEMENTED_FAMILIES, NotImplementedError, ParseError } from './parsers/index.js';
export {
  applyModelLabels,
  buildModelInput,
  buildPrompt,
  LABEL_SCHEMA,
  type ModelInput,
  type ModelLabeller,
  type ModelOutput,
  parseModelOutput,
} from './relations/model.js';
export { analyseLines, applyRelations, isDescriptor, type LineAnalysis, percentagesIn } from './relations/rules.js';
export { escapeHtml, type RenderHtmlOptions, renderHtml } from './render/html.js';
export { type RenderPdfOptions, renderPdf } from './render/pdf.js';
export {
  LOTL_URL,
  type LoadOptions,
  loadTrustLists,
  parseSnapshot,
  signatureStatus,
  type TrustAnchor,
  type TrustListInfo,
  type TrustService,
  type TrustSnapshot,
  trustAnchorsFromSnapshot,
} from './signature/index.js';
export type { ValidateOptions } from './validation/index.js';
export * as values from './values.js';

/**
 * Major version of the published JSON Schemas (`schemas/*.v1.schema.json`). Additive changes to the model keep it;
 * a breaking change to the output shape bumps it and publishes new schema files next to the old ones.
 */
export const schemaVersion = 'v1';

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
export async function inspect(
  bytes: Uint8Array,
  filename?: string,
  limits?: Partial<UnwrapLimits>,
  options?: UnwrapOptions,
): Promise<InspectResult> {
  const { fileSha256, payloads, skipped } = await unwrap(bytes, filename, limits, options);
  const documents = payloads.map(({ xml, ...payload }) => ({ payload, detection: detectXml(xml, { fromPdf: payload.fromPdf }) }));
  clearProbeCache();
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

export interface ConvertOptions extends UnwrapOptions {
  /** Fill `source.provenance` (canonical path -> source XPath) for every value read from the XML. Off by default: it roughly doubles the size of `source`. */
  provenance?: boolean;
  /**
   * Run the XSD, EN 16931 Schematron and CIUS/Peppol Schematron layers on UBL and CII invoices and
   * fill `source.validation`. Off by default: it loads the validators (SaxonJS, xmllint-wasm).
   */
  validate?: boolean;
  /**
   * Fill `lineRoles` and `relations`: which lines are headings or descriptions, which are items and which
   * adjust other lines (a 10 % markup, a discount). Rules and exact arithmetic only; ambiguous cases go to
   * `source.warnings`. The lines and totals never change. Off by default.
   */
  relations?: boolean;
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

/** The smallest document that is detected as Peppol BIS 3 UBL, so every validator layer has something to run on. */
const WARM_UP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
<cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
<cbc:ID>WARM-UP</cbc:ID>
</Invoice>`;

/**
 * Loads and compiles the validators (SaxonJS, xmllint-wasm, the UBL rule sets) ahead of the first document, by
 * validating a tiny invoice and discarding the result. The first `convert(..., { validate: true })` otherwise pays
 * this once (about 300 ms on a laptop). Resolves to false when the validators cannot be loaded; never throws.
 */
export async function warmUpValidation(options?: ValidateOptions): Promise<boolean> {
  try {
    const validation = await loadValidation();
    const detection = detectXml(WARM_UP_XML);
    const summary = await validation.validate({ xml: WARM_UP_XML }, detection, options);
    return summary.schema !== 'unavailable' && summary.semantic !== 'unavailable' && summary.profile !== 'unavailable';
  } catch {
    return false;
  }
}

/**
 * Unwraps, detects and parses. Never throws for bad input: every problem is an outcome or a skipped entry.
 *
 * Signatures are verified (cryptographic validity only) and reported on `source.signatures` and
 * `source.validation.signature`; a failed signature is a finding, never an error. Pass `options.trustAnchors`
 * to also check the signer against a trust list. With `options.validate`, the schema, semantic and
 * profile layers are filled in as well; the signature layer is kept.
 */
export async function convert(
  bytes: Uint8Array,
  filename?: string,
  limits?: Partial<UnwrapLimits>,
  options: ConvertOptions = {},
): Promise<ConvertResult> {
  const { fileSha256, payloads, skipped } = await unwrap(bytes, filename, limits, options);
  const outcomes = payloads.map(({ xml, ...meta }): ConvertOutcome => {
    const payload = { xml, ...meta };
    const detection = detectXml(xml, { fromPdf: meta.fromPdf });
    if (detection.kind === 'other-document') return { status: 'not-an-invoice', detection, payload: meta };
    if (detection.kind === 'unknown') return { status: 'unsupported', detection, payload: meta, reason: detection.reason };
    try {
      const invoices = PARSERS[detection.format.family]({
        payload,
        format: detection.format,
        details: detection.details,
        fileSha256,
        provenance: options.provenance,
      });
      invoices.forEach((inv, i) => {
        if (invoices.length > 1) inv.source.indexInFile = i;
        inv.source.warnings.push(...checkTotals(inv));
        if (options.relations) applyRelations(inv);
        const sigs = inv.source.signatures;
        inv.source.validation ??= {
          parse: 'passed',
          schema: 'not-run',
          semantic: 'not-run',
          profile: 'not-run',
          signature: 'not-run',
          clearance: 'not-run',
          bundles: {},
          findings: [],
        };
        const v = inv.source.validation;
        v.signature = signatureStatus(sigs);
        v.findings.push(...signatureFindings(sigs));
      });
      return { status: 'ok', invoices, detection, payload: meta };
    } catch (e) {
      if (e instanceof NotImplementedError) return { status: 'unsupported', detection, payload: meta, reason: e.message };
      if (e instanceof ParseError || e instanceof ValueError) return { status: 'error', detection, payload: meta, error: e.message };
      return { status: 'error', detection, payload: meta, error: `Internal error: ${(e as Error).message}` };
    }
  });
  clearProbeCache();
  if (options.validate) {
    let validation: typeof import('./validation/index.js') | undefined;
    let loadError = '';
    try {
      validation = await loadValidation();
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
    await Promise.all(
      outcomes.map(async (outcome, i) => {
        if (outcome.status !== 'ok') return;
        const summary = validation
          ? await validation.validate(payloads[i], outcome.detection, options.validation)
          : unavailableSummary(outcome.detection, loadError);
        for (const inv of outcome.invoices) {
          // Keep the signature layer and its findings, which the conversion already filled in.
          const before = inv.source.validation;
          const merged = structuredClone(summary);
          if (before) {
            merged.signature = before.signature;
            merged.findings.push(...before.findings.filter((f) => f.layer === 'signature'));
          }
          inv.source.validation = merged;
        }
      }),
    );
  }
  return { fileSha256, outcomes, skipped };
}
