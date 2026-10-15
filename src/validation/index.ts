/**
 * Conformance validation for UBL 2.1 and UN/CEFACT CII invoices, one layer at a time:
 *
 *   schema    XSD (UBL 2.1, CII D16B) through xmllint-wasm
 *   semantic  the EN 16931 Schematron, compiled ahead of time to SaxonJS SEF
 *   profile   the CIUS / network rules: Peppol BIS 3, XRechnung
 *
 * The validators are heavy (SaxonJS, libxml2 as WebAssembly), so this module is only loaded when
 * validation is asked for. The rule sets are pinned bundles under validation/bundles/.
 * 'unavailable' means a layer could not run; 'failed' means it ran and found errors.
 */
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

  const runners: Record<Layer, (id: string) => Promise<Finding[]>> = {
    schema: (id) => runSchema(bundles, id, payload.xml, rootName),
    semantic: (id) => runSchematron(bundles, id, 'semantic', payload.xml, scope),
    profile: (id) => runSchematron(bundles, id, 'profile', payload.xml, scope),
  };
  const layers = Object.keys(plan) as Layer[];
  const results = await Promise.all(
    layers.map(async (layer): Promise<{ layer: Layer; status: CheckStatus; findings: Finding[] }> => {
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
