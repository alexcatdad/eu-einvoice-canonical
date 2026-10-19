/**
 * Conformance validation for UBL 2.1 and UN/CEFACT CII invoices, one layer at a time:
 *
 *   schema    XSD through xmllint-wasm: UBL 2.1, CII D16B and the national formats (FatturaPA, KSeF, Facturae, ISDOC, ebInterface, Finvoice, e-arve, eSLOG 2.0)
 *   semantic  the EN 16931 Schematron, compiled ahead of time to SaxonJS SEF
 *   profile   the CIUS / network rules: Peppol BIS 3, XRechnung
 *
 * The validators are heavy (SaxonJS, libxml2 as WebAssembly), so this module is only loaded when
 * validation is asked for. The rule sets are pinned bundles under validation/bundles/.
 * 'unavailable' means a layer could not run; 'failed' means it ran and found errors.
 */
import { SaxesParser, type SaxesTagNS } from 'saxes';
import type { CheckStatus, ValidationSummary } from '../canonical.js';
import type { Detection } from '../detect.js';
import { BundleReaderFor, type BundleSource, defaultReader } from './bundles.js';
import { unsupportedCfdiExtension } from './cfdi.js';
import { emptySummary, finishSummary, type Layer, planFor, plannedSummary, type ValidationSuite } from './plan.js';
import type { Finding } from './types.js';
import { unsupportedUblExtension } from './ubl-extensions.js';

export type { BundleManifest, BundleReader, BundleSource } from './bundles.js';
export type { ValidationSuite } from './plan.js';
export { emptySummary, planFor, unavailableSummary, validationPassed } from './plan.js';

export interface ValidateOptions {
  scope?: 'full-source' | 'schema';
  /** Runtime adapters for local browser workers; default engines run in Node/Bun. */
  runners?: {
    /** Adapter-declared engine names and versions. Omitted identities stay absent from receipts. */
    engines?: { schema?: string; schematron?: string };
    schema: (bundles: BundleReaderFor, id: string, xml: string, rootName: string) => Promise<Finding[]>;
    schematron: (bundles: BundleReaderFor, id: string, layer: 'semantic' | 'profile', xml: string, scope: string) => Promise<Finding[]>;
  };
  /** Peppol defaults to its coherent May 2026 release; the legacy option replays the previous mixed configuration. */
  suite?: ValidationSuite;
  /** Where the bundles come from. Default: validation/bundles next to this package (a file read in Node and Bun, a fetch in browsers). */
  bundles?: BundleSource;
  /**
   * The Schematron layers (semantic, profile) are skipped, as 'not-run' with an info finding, for documents with more invoice
   * lines than this. The official rule sets run through SaxonJS take minutes on very large invoices (about 80 s for the EN 16931
   * rules on 26,813 lines, longer for Peppol); the schema layer always runs. Default 2000; `Infinity` never skips.
   */
  maxSchematronLines?: number;
}

export const DEFAULT_MAX_SCHEMATRON_LINES = 2000;

/** Line elements for formats with Schematron rules, matched by namespace. */
const LINE_ELEMENTS: Record<string, readonly string[]> = {
  'http://isdoc.cz/namespace/2013': ['InvoiceLine'],
  'urn:sfti:CommonAggregateComponents:1:0': ['InvoiceLine'],
  'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2': ['InvoiceLine', 'CreditNoteLine'],
  'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100': ['IncludedSupplyChainTradeLineItem'],
};

class Stop extends Error {}

/**
 * Counts line elements with a namespace-aware parse, so comments, CDATA and odd prefixes cannot inflate or hide the count.
 * Stops once `limit` is passed. A document that is not well-formed is counted up to the error (the schema layer reports it).
 */
export function countLines(xml: string, limit = Number.POSITIVE_INFINITY): number {
  const parser = new SaxesParser({ xmlns: true, position: false });
  let n = 0;
  parser.on('opentag', (tag: SaxesTagNS) => {
    if (LINE_ELEMENTS[tag.uri ?? '']?.includes(tag.local) && ++n > limit) throw new Stop();
  });
  try {
    parser.write(xml).close();
  } catch {
    // Stop, or not well-formed: n is what was counted so far.
  }
  return n;
}

/** TEAPPS batches may carry a separate declaration in every frame; the header probe keeps only the first. */
function supportedTeappsFrames(xml: string): boolean {
  const parser = new SaxesParser({ xmlns: true, position: false });
  const stack: { local: string; uri: string }[] = [];
  let text: string | null = null;
  let supported = true;
  const path = ['INVOICE_CENTER', 'CONTENT_FRAME', 'BLOCK_RULES', 'FORMAT_VERSION'];
  parser.on('opentag', (tag: SaxesTagNS) => {
    stack.push({ local: tag.local, uri: tag.uri ?? '' });
    if (stack.length === path.length && stack.every((entry, i) => entry.local === path[i] && entry.uri === '')) text = '';
  });
  parser.on('text', (value) => {
    if (text !== null) text += value;
  });
  parser.on('cdata', (value) => {
    if (text !== null) text += value;
  });
  parser.on('closetag', () => {
    if (text !== null && stack.length === path.length) {
      supported = text.trim() === '3.0';
      text = null;
      if (!supported) throw new Stop();
    }
    stack.pop();
  });
  try {
    parser.write(xml).close();
  } catch {
    /* Malformed XML is diagnosed by XSD; a mismatched version stops early. */
  }
  return supported;
}

let scopes = 0;
const scopeOf = new WeakMap<object, string>();

function readerFor(source: BundleSource | undefined): { bundles: BundleReaderFor; scope: string } {
  if (!source?.read && !source?.baseUrl) return { bundles: new BundleReaderFor(defaultReader(), 'default'), scope: 'default' };
  const key = source.read ?? source;
  let scope = scopeOf.get(key);
  if (!scope) {
    scope = `custom-${++scopes}`;
    scopeOf.set(key, scope);
  }
  return { bundles: new BundleReaderFor(source.read ?? defaultReader(source.baseUrl), scope), scope };
}

/**
 * Validates one XML document. Never throws: a layer that cannot run is 'unavailable', a layer
 * that does not apply to this format is 'not-run', and a layer that ran is 'passed' or 'failed'
 * (warnings alone do not fail a layer). `signature` and `clearance` are left 'not-run'; they
 * belong to other checks.
 */
export async function validate(payload: { xml: string }, detection: Detection, options: ValidateOptions = {}): Promise<ValidationSummary> {
  if (
    options.suite !== undefined &&
    options.suite !== 'peppol-2026-05' &&
    options.suite !== 'legacy-peppol-3.0.20-en-1.3.17' &&
    options.suite !== 'facturx-1.09.2' &&
    options.suite !== 'cii-d16b' &&
    options.suite !== 'e-arve-1.2.EN' &&
    options.suite !== 'e-arve-1.2' &&
    options.suite !== 'france-rfe-1.4.0.04' &&
    options.suite !== 'france-rfe-1.4.0.04-facturx'
  ) {
    const rejected = emptySummary();
    rejected.parse = detection.kind === 'unknown' && !detection.probe ? 'failed' : 'passed';
    rejected.required = ['schema'];
    rejected.reasons = { schema: 'unsupported' };
    rejected.findings.push({ layer: 'schema', severity: 'info', message: `Unsupported validation suite: ${options.suite}` });
    return finishSummary(rejected);
  }
  const summary = plannedSummary(detection, options.suite, options.scope);
  const suite =
    options.suite ?? (detection.kind === 'invoice' && detection.format.id === 'peppol-bis3' ? 'peppol-2026-05' : 'source-pinned');
  summary.receipt = {
    suite,
    policy: 'source-conformance-v1',
    maxSchematronLines: Number.isFinite(options.maxSchematronLines ?? DEFAULT_MAX_SCHEMATRON_LINES)
      ? (options.maxSchematronLines ?? DEFAULT_MAX_SCHEMATRON_LINES)
      : 'unlimited',
    engines: options.runners ? { ...options.runners.engines } : { schema: 'xmllint-wasm@5.3.0', schematron: 'saxon-js@2.7.0' },
    artifacts: {},
  };
  summary.parse =
    (detection.kind === 'unknown' && !detection.probe) || detection.probe?.hasDoctype || detection.probe?.error ? 'failed' : 'passed';
  if (summary.parse === 'failed') {
    summary.findings.push({
      layer: 'parse',
      severity: 'fatal',
      message: detection.probe?.hasDoctype
        ? 'DOCTYPE is not allowed in source validation'
        : detection.kind === 'unknown'
          ? detection.reason
          : 'Not well-formed XML',
    });
    return finishSummary(summary);
  }
  const plan = planFor(detection, options.suite);
  if (detection.kind === 'invoice' && detection.format.id === 'teappsxml' && !supportedTeappsFrames(payload.xml)) {
    delete plan.schema;
    delete summary.bundles.schema;
    summary.reasons!.schema = 'unsupported';
    summary.findings.push({
      layer: 'schema',
      severity: 'info',
      message: 'Unsupported TEAPPSXML frame version; every frame must declare 3.0',
    });
  }
  if (detection.kind === 'invoice' && detection.format.id === 'mx-cfdi' && unsupportedCfdiExtension(payload.xml)) {
    delete plan.schema;
    delete summary.bundles.schema;
    summary.reasons!.schema = 'unsupported';
    summary.findings.push({
      layer: 'schema',
      severity: 'info',
      message: 'Unsupported CFDI complement or Addenda schema; the local closure covers only core 3.3/4.0 and TimbreFiscalDigital 1.1',
    });
  }
  if (
    options.scope !== 'schema' &&
    detection.kind === 'invoice' &&
    detection.format.family === 'ubl' &&
    unsupportedUblExtension(payload.xml, plan.schema)
  ) {
    if (!summary.required!.includes('profile')) summary.required!.push('profile');
    summary.reasons!.profile = 'unsupported';
    summary.findings.push({
      layer: 'profile',
      severity: 'info',
      message: 'UBL extension contract is not covered by the selected local schema and rule closure',
    });
  }
  if (options.scope === 'schema') {
    delete plan.semantic;
    delete plan.profile;
  }
  const rootName = detection.probe?.rootName ?? '';
  const { bundles, scope } = readerFor(options.bundles);

  const maxLines = options.maxSchematronLines ?? DEFAULT_MAX_SCHEMATRON_LINES;
  const lines = Number.isFinite(maxLines) ? countLines(payload.xml, maxLines) : 0;
  const tooLarge = lines > maxLines;

  const runners: Record<Layer, (id: string) => Promise<Finding[]>> = {
    schema: async (id) => (options.runners?.schema ?? (await import('./schema.js')).runSchema)(bundles, id, payload.xml, rootName),
    semantic: async (id) =>
      (options.runners?.schematron ?? (await import('./schematron.js')).runSchematron)(bundles, id, 'semantic', payload.xml, scope),
    profile: async (id) =>
      (options.runners?.schematron ?? (await import('./schematron.js')).runSchematron)(bundles, id, 'profile', payload.xml, scope),
  };
  const layers = Object.keys(plan) as Layer[];
  const results = await Promise.all(
    layers.map(
      async (
        layer,
      ): Promise<{ layer: Layer; status: CheckStatus; reason?: 'size-limit' | 'unsupported' | 'unavailable'; findings: Finding[] }> => {
        if (tooLarge && layer !== 'schema')
          return {
            layer,
            status: 'not-run',
            reason: 'size-limit',
            findings: [
              {
                layer,
                severity: 'info',
                message: `Skipped: more than ${maxLines} invoice lines (maxSchematronLines). The Schematron rules would take minutes here; validate with a native Schematron processor or raise the limit.`,
              },
            ],
          };
        try {
          const id = plan[layer]!;
          const manifest = await bundles.manifest(id);
          summary.receipt!.artifacts[layer] = {
            id,
            version: manifest.version,
            manifestSha256: await bundles.manifestSha256(id),
          };
          const findings = await runners[layer](id);
          return { layer, status: findings.some((f) => f.severity === 'fatal') ? 'failed' : 'passed', findings };
        } catch (e) {
          if (e instanceof Error && e.name === 'NotApplicable')
            return { layer, status: 'not-run', reason: 'unsupported', findings: [{ layer, severity: 'info', message: e.message }] };
          const reason = e instanceof Error ? e.message : String(e);
          return {
            layer,
            status: 'unavailable',
            reason: 'unavailable',
            findings: [{ layer, severity: 'info', message: `Validator unavailable: ${reason}` }],
          };
        }
      },
    ),
  );
  for (const r of results) {
    summary[r.layer] = r.status;
    if (r.reason) summary.reasons![r.layer] = r.reason;
    summary.findings.push(...r.findings);
  }
  return finishSummary(summary);
}
