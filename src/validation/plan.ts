/**
 * Which validator bundle covers which layer of a detected invoice. Kept free of the heavy
 * validator code so the plain converter can use it to report 'unavailable' when the validators
 * cannot be loaded.
 */
import type { CheckStatus, ValidationSummary } from '../canonical.js';
import type { Detection } from '../detect.js';

export type Layer = 'schema' | 'semantic' | 'profile';
type Plan = Partial<Record<Layer, string>>;

/** Formats whose EN 16931 conformance is not claimed by the format itself, so the EN rules would judge them unfairly. */
const NOT_EN16931 = new Set([
  'oioubl-2',
  'oioubl-3',
  'ubl-unknown',
  'cii-unknown',
  'ubl-be',
  'peppol-bis2',
  'peppol-pint',
  'peppol-bis3-selfbilling',
  'zugferd-1',
]);
/** UBL 2.0 documents are not valid against the 2.1 schema. */
const NOT_UBL21 = new Set(['oioubl-2']);
const FACTURX_EN16931_PROFILES = new Set(['EN 16931']);

/** Which bundle covers which layer for this document. Layers without an entry do not apply and report 'not-run'. */
export function planFor(detection: Detection): Plan {
  if (detection.kind !== 'invoice') return {};
  const { format, details } = detection;
  const syntax = format.family === 'ubl' ? 'ubl' : format.family === 'cii' ? 'cii' : null;
  if (!syntax) return {};
  const plan: Plan = {};
  if (!NOT_UBL21.has(format.id)) plan.schema = syntax === 'ubl' ? 'xsd-ubl-2.1' : 'xsd-cii-d16b';
  const en16931 = !NOT_EN16931.has(format.id) && (format.id !== 'facturx' || FACTURX_EN16931_PROFILES.has(details.profile ?? ''));
  if (en16931) plan.semantic = `en16931-${syntax}-1.3.17`;
  if (format.id === 'peppol-bis3' && syntax === 'ubl') plan.profile = 'peppol-bis3-3.0.20-ubl';
  else if (format.id === 'xrechnung-ubl' || format.id === 'xrechnung-cii') plan.profile = `xrechnung-3.0.2-${syntax}`;
  return plan;
}

export function emptySummary(status: CheckStatus = 'not-run'): ValidationSummary {
  return {
    parse: status,
    schema: status,
    semantic: status,
    profile: status,
    signature: 'not-run',
    clearance: 'not-run',
    bundles: {},
    findings: [],
  };
}

/** Every planned layer is reported 'unavailable'; used when the validator itself cannot be loaded. */
export function unavailableSummary(detection: Detection, reason: string): ValidationSummary {
  const s = emptySummary('not-run');
  s.parse = detection.kind === 'unknown' && !detection.probe ? 'failed' : 'passed';
  for (const [layer, id] of Object.entries(planFor(detection)) as [Layer, string][]) {
    s[layer] = 'unavailable';
    s.bundles[layer] = id;
    s.findings.push({ layer, severity: 'info', message: `Validator unavailable: ${reason}` });
  }
  return s;
}
