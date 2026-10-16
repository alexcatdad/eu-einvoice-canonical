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
import { emptySummary, type Layer, planFor } from './plan.js';
import { NotApplicable, runSchema } from './schema.js';
import { runSchematron } from './schematron.js';
import type { Finding } from './types.js';

export type { BundleManifest, BundleReader, BundleSource } from './bundles.js';
export { emptySummary, planFor, unavailableSummary } from './plan.js';

export interface ValidateOptions {
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

/** Line elements, by namespace: UBL InvoiceLine and CreditNoteLine, CII IncludedSupplyChainTradeLineItem. */
const LINE_ELEMENTS: Record<string, readonly string[]> = {
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
  const summary = emptySummary();
  summary.parse = detection.kind === 'unknown' && !detection.probe ? 'failed' : 'passed';
  if (summary.parse === 'failed') {
    summary.findings.push({
      layer: 'parse',
      severity: 'fatal',
      message: detection.kind === 'unknown' ? detection.reason : 'Not well-formed XML',
    });
    return summary;
  }
  const plan = planFor(detection);
  const rootName = detection.probe?.rootName ?? '';
  const { bundles, scope } = readerFor(options.bundles);

  const maxLines = options.maxSchematronLines ?? DEFAULT_MAX_SCHEMATRON_LINES;
  const lines = Number.isFinite(maxLines) ? countLines(payload.xml, maxLines) : 0;
  const tooLarge = lines > maxLines;

  const runners: Record<Layer, (id: string) => Promise<Finding[]>> = {
    schema: (id) => runSchema(bundles, id, payload.xml, rootName),
    semantic: (id) => runSchematron(bundles, id, 'semantic', payload.xml, scope),
    profile: (id) => runSchematron(bundles, id, 'profile', payload.xml, scope),
  };
  const layers = Object.keys(plan) as Layer[];
  const results = await Promise.all(
    layers.map(async (layer): Promise<{ layer: Layer; status: CheckStatus; findings: Finding[] }> => {
      if (tooLarge && layer !== 'schema')
        return {
          layer,
          status: 'not-run',
          findings: [
            {
              layer,
              severity: 'info',
              message: `Skipped: more than ${maxLines} invoice lines (maxSchematronLines). The Schematron rules would take minutes here; validate with a native Schematron processor or raise the limit.`,
            },
          ],
        };
      try {
        const findings = await runners[layer](plan[layer]!);
        return { layer, status: findings.some((f) => f.severity === 'fatal') ? 'failed' : 'passed', findings };
      } catch (e) {
        if (e instanceof NotApplicable) return { layer, status: 'not-run', findings: [{ layer, severity: 'info', message: e.message }] };
        const reason = e instanceof Error ? e.message : String(e);
        return { layer, status: 'unavailable', findings: [{ layer, severity: 'info', message: `Validator unavailable: ${reason}` }] };
      }
    }),
  );
  for (const r of results) {
    summary[r.layer] = r.status;
    if (r.status !== 'not-run') summary.bundles[r.layer] = plan[r.layer];
    summary.findings.push(...r.findings);
  }
  return summary;
}
