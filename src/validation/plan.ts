/**
 * Which validator bundle covers which layer of a detected invoice. Kept free of the heavy
 * validator code so the plain converter can use it to report 'unavailable' when the validators
 * cannot be loaded.
 */
import type { CheckStatus, ValidationSummary } from '../canonical.js';
import type { Detection } from '../detect.js';

export type Layer = 'schema' | 'semantic' | 'profile';
type Plan = Partial<Record<Layer, string>>;

/**
 * Formats whose EN 16931 conformance is not claimed by the format itself, so the EN rules would judge them unfairly.
 * PINT and ZATCA get the UBL XSD only: the PINT Schematron is not bundled (OpenPEPPOL's copyright statement does not
 * permit redistribution) and neither is ZATCA's; see validation/NOTICE.
 */
const NOT_EN16931 = new Set([
  'oioubl-2',
  'oioubl-3',
  'ubl-unknown',
  'cii-unknown',
  'ubl-be',
  'peppol-bis2',
  'peppol-pint',
  'pint-sg',
  'pint-aunz',
  'pint-jp',
  'pint-my',
  'pint-ae',
  'pint-om',
  'pint-eu',
  'zatca-ubl',
  'peppol-bis3-selfbilling',
  'zugferd-1',
]);
/** UBL 2.0 documents are not valid against the 2.1 schema. */
const NOT_UBL21 = new Set(['oioubl-2']);
const FACTURX_EN16931_PROFILES = new Set(['EN 16931']);

/**
 * The XSD bundle of a national format. Formats with several schema versions pick the bundle by the
 * root namespace; a namespace without a bundle (FA(1), Facturae 3.1, ebInterface 4.0-4.2) gets no
 * schema layer rather than a wrong one. Without a probe the newest bundle is named, which is what
 * the conformance checklist wants.
 */
const NATIONAL_XSD: Record<string, { latest: string; byNamespace?: Record<string, string> }> = {
  fatturapa: {
    latest: 'xsd-fatturapa-1.2.2',
    byNamespace: { 'http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2': 'xsd-fatturapa-1.2.2' },
  },
  'fatturapa-semplificata': {
    latest: 'xsd-fatturapa-semplificata-1.0',
    byNamespace: { 'http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.0': 'xsd-fatturapa-semplificata-1.0' },
  },
  ksef: {
    latest: 'xsd-ksef-fa3',
    byNamespace: {
      'http://crd.gov.pl/wzor/2023/06/29/12648/': 'xsd-ksef-fa2',
      'http://crd.gov.pl/wzor/2025/06/25/13775/': 'xsd-ksef-fa3',
      'http://crd.gov.pl/wzor/2026/03/06/14189/': 'xsd-ksef-fa-rr',
    },
  },
  facturae: {
    latest: 'xsd-facturae-3.2.2',
    byNamespace: {
      'http://www.facturae.es/Facturae/2009/v3.2/Facturae': 'xsd-facturae-3.2',
      'http://www.facturae.es/Facturae/2014/v3.2.1/Facturae': 'xsd-facturae-3.2.1',
      'http://www.facturae.gob.es/formato/Versiones/Facturaev3_2_2.xml': 'xsd-facturae-3.2.2',
    },
  },
  isdoc: { latest: 'xsd-isdoc-6.0.2', byNamespace: { 'http://isdoc.cz/namespace/2013': 'xsd-isdoc-6.0.2' } },
  ebinterface: {
    latest: 'xsd-ebinterface-6.1',
    byNamespace: {
      'http://www.ebinterface.at/schema/4p3/': 'xsd-ebinterface-4.3',
      'http://www.ebinterface.at/schema/5p0/': 'xsd-ebinterface-5.0',
      'http://www.ebinterface.at/schema/6p0/': 'xsd-ebinterface-6.0',
      'http://www.ebinterface.at/schema/6p1/': 'xsd-ebinterface-6.1',
    },
  },
  finvoice: { latest: 'xsd-finvoice-3.0', byNamespace: { '': 'xsd-finvoice-3.0' } },
  'e-arve': { latest: 'xsd-earve-1.2', byNamespace: { '': 'xsd-earve-1.2' } },
  'eslog-2': { latest: 'xsd-eslog-2.0', byNamespace: { 'urn:eslog:2.00': 'xsd-eslog-2.0' } },
};

function nationalSchema(detection: Extract<Detection, { kind: 'invoice' }>): string | undefined {
  const entry = NATIONAL_XSD[detection.format.id];
  if (!entry) return undefined;
  if (!detection.probe) return entry.latest;
  // The Italian namespaces are sometimes written with stray whitespace; the schema would reject that, so the lookup is exact.
  return entry.byNamespace?.[detection.probe.rootNs];
}

/** Which bundle covers which layer for this document. Layers without an entry do not apply and report 'not-run'. */
export function planFor(detection: Detection): Plan {
  if (detection.kind !== 'invoice') return {};
  const { format, details } = detection;
  const national = nationalSchema(detection);
  if (national) return { schema: national };
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
