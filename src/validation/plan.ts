/**
 * Which validator bundle covers which layer of a detected invoice. Kept free of the heavy
 * validator code so the plain converter can use it to report 'unavailable' when the validators
 * cannot be loaded.
 */
import type { CheckStatus, ValidationSummary } from '../canonical.js';
import type { Detection } from '../detect.js';
import { NATIONAL_SELECTORS } from './national-selectors.js';
import { unsupportedPintProcess } from './pint-specializations.js';
import { selectValidationPlan } from './selectors.js';

type InvoiceDetection = Omit<Extract<Detection, { kind: 'invoice' }>, 'probe'> & {
  probe?: Extract<Detection, { kind: 'invoice' }>['probe'];
};
export type PlanDetection = Exclude<Detection, { kind: 'invoice' }> | InvoiceDetection;

export type Layer = 'schema' | 'semantic' | 'profile';
/** Explicit replay of the old mixed configuration is not an official historical Peppol suite. */
export type ValidationSuite =
  | 'peppol-2026-05'
  | 'legacy-peppol-3.0.20-en-1.3.17'
  | 'facturx-1.09.2'
  | 'cii-d16b'
  | 'e-arve-1.2.EN'
  | 'e-arve-1.2'
  | 'france-rfe-1.4.0.04'
  | 'france-rfe-1.4.0.04-facturx';
type Plan = Partial<Record<Layer, string>>;

const NATIONAL_FORMATS = new Set(NATIONAL_SELECTORS.map((selector) => selector.formatId));

/** Select artifacts through the executable finite selector inventory. */
export function planFor(detection: PlanDetection, suite?: ValidationSuite): Plan {
  return selectValidationPlan(detection, suite).plan;
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

const UNBUNDLED_CIUS = new Set([
  'nlcius-ubl',
  'nlcius-cii',
  'cius-ro',
  'cius-pt',
  'hr-cius',
  'fr-ctc-ubl',
  'fr-ctc-cii',
  'pl-pef',
  'ubl-be',
]);

/** Required checks follow source claims independently of available artifacts. */
export function requiredLayers(detection: Detection, plan: Plan): Layer[] {
  const required: Layer[] = ['schema'];
  if (plan.semantic) required.push('semantic');
  if (detection.kind === 'invoice') {
    const { id } = detection.format;
    const declaredUnknown = id === 'ubl-unknown' || id === 'cii-unknown' || (/^en16931-/.test(id) && !!detection.details.profile);
    const unsupportedFacturx = id === 'facturx';
    if (
      plan.profile ||
      NATIONAL_FORMATS.has(id) ||
      id === 'mx-cfdi' ||
      UNBUNDLED_CIUS.has(id) ||
      /^(peppol-|pint-|zatca-|oioubl-|xrechnung-)/.test(id) ||
      declaredUnknown ||
      unsupportedFacturx
    )
      required.push('profile');
  }
  return required;
}

export function finishSummary(summary: ValidationSummary): ValidationSummary {
  const required = summary.required ?? [];
  const incomplete = required.some(
    (layer) => summary.reasons?.[layer] === 'unsupported' || (summary[layer] !== 'passed' && summary[layer] !== 'failed'),
  );
  const failed = summary.parse === 'failed' || required.some((layer) => summary[layer] === 'failed');
  summary.completeness = incomplete ? 'incomplete' : 'complete';
  summary.result = failed ? 'invalid' : incomplete ? 'incomplete' : 'valid';
  return summary;
}

/** Conservative acceptance for requested source validation; old or absent receipts cannot establish completeness. */
export function validationPassed(summary?: ValidationSummary): boolean {
  return summary?.result === 'valid' && summary.completeness === 'complete' && summary.receipt?.policy === 'source-conformance-v1';
}

export function plannedSummary(
  detection: Detection,
  suite?: ValidationSuite,
  scope: 'full-source' | 'schema' = 'full-source',
): ValidationSummary {
  const summary = emptySummary();
  const plan = planFor(detection, suite);
  if (scope === 'schema') {
    delete plan.semantic;
    delete plan.profile;
  }
  summary.scope = scope;
  summary.required = scope === 'schema' ? ['schema'] : requiredLayers(detection, plan);
  summary.bundles = { ...plan };
  summary.reasons = {};
  for (const layer of ['schema', 'semantic', 'profile'] as const) {
    if (!plan[layer]) summary.reasons[layer] = summary.required.includes(layer) ? 'unsupported' : 'not-applicable';
  }
  if (scope === 'full-source' && unsupportedPintProcess(detection)) summary.reasons.profile = 'unsupported';
  if (
    scope === 'full-source' &&
    detection.kind === 'invoice' &&
    /^en16931-/.test(detection.format.id) &&
    detection.details.version !== '2017'
  )
    summary.reasons.semantic = 'unsupported';
  if (scope === 'full-source' && detection.kind === 'invoice' && /^xrechnung-/.test(detection.format.id) && plan.profile) {
    const id = detection.probe.values[detection.format.family === 'ubl' ? 'ublCustomizationId' : 'ciiGuidelineId'];
    if (id !== 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0') summary.reasons.profile = 'unsupported';
  }
  if (
    scope === 'full-source' &&
    detection.kind === 'invoice' &&
    detection.format.id === 'peppol-bis3' &&
    detection.probe.values.ublCustomizationId !== 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0'
  )
    summary.reasons.profile = 'unsupported';
  return summary;
}

/** Every planned layer is reported 'unavailable'; used when the validator itself cannot be loaded. */
export function unavailableSummary(
  detection: Detection,
  reason: string,
  suite?: ValidationSuite,
  scope: 'full-source' | 'schema' = 'full-source',
): ValidationSummary {
  const s = plannedSummary(detection, suite, scope);
  s.parse =
    (detection.kind === 'unknown' && !detection.probe) || detection.probe?.hasDoctype || detection.probe?.error ? 'failed' : 'passed';
  for (const [layer, id] of Object.entries(s.bundles) as [Layer, string][]) {
    s[layer] = 'unavailable';
    s.reasons![layer] = 'unavailable';
    s.bundles[layer] = id;
    s.findings.push({ layer, severity: 'info', message: `Validator unavailable: ${reason}` });
  }
  return finishSummary(s);
}
