/** Executable selector inventory. Every artifact-bearing route is an entry requiring independent evidence. */

import { FRANCE_RFE_SELECTORS } from './france-rfe.js';
import { NATIONAL_SELECTORS, resolveNationalSelector } from './national-selectors.js';
import { PINT_SPECIALIZATION_SELECTORS } from './pint-specializations.js';
import type { PlanDetection, ValidationSuite } from './plan.js';

export type SelectedPlan = Partial<Record<'schema' | 'semantic' | 'profile', string>>;
type Invoice = Extract<PlanDetection, { kind: 'invoice' }>;
export interface Selector {
  id: string;
  suites: readonly ValidationSuite[];
  /** Exclusive source contracts precede composable generic syntax/semantic routes. */
  exclusive?: boolean;
  matches: (detection: Invoice) => boolean;
  plan: SelectedPlan;
}
const DEFAULT = ['peppol-2026-05'] as const;
const UBL = [
  ['invoice', 'Invoice', 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2'],
  ['creditnote', 'CreditNote', 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2'],
] as const;
const ubl21 = (d: Invoice) => !d.probe?.values.ublVersionId || d.probe.values.ublVersionId === '2.1';
const knownUblEdition = (d: Invoice) => {
  if (d.probe?.values.ublVersionId === '2.1') return true;
  const id = d.probe?.values.ublCustomizationId ?? '';
  return (
    id === 'urn:cen.eu:en16931:2017' ||
    [
      'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0',
      'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0',
    ].some((base) => id === base || id.startsWith(`${base}#`)) ||
    id === 'urn:cen.eu:en16931:2017#compliant#urn:fdc:nen.nl:nlcius:v1.0'
  );
};
const contract = (d: Invoice) => d.probe?.values.ublCustomizationId;
const ciiId = (d: Invoice) => d.probe?.values.ciiGuidelineId;
const CII = (d: Invoice) =>
  d.probe?.rootName === 'CrossIndustryInvoice' && d.probe.rootNs === 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100';
const ciiSchema = (d: Invoice) =>
  (d.format.id === 'xrechnung-cii' &&
    d.details.version === '3.0' &&
    ['urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0'].some(
      (base) => ciiId(d) === base || ciiId(d)?.startsWith(`${base}#`),
    )) ||
  (d.format.id === 'nlcius-cii' && ciiId(d) === 'urn:cen.eu:en16931:2017#compliant#urn:fdc:nen.nl:nlcius:v1.0');
const NOT_EN = new Set([
  'fr-ctc-ubl',
  'fr-ctc-cii',
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
const en = (d: Invoice) => !NOT_EN.has(d.format.id) && d.format.id !== 'facturx';

const native: Selector[] = [];
for (const [kind, rootName, namespace] of UBL) {
  const root = (d: Invoice) => d.probe?.rootName === rootName && d.probe.rootNs === namespace;
  const exact = (id: string, format: string, source: string, plan: SelectedPlan, process?: string) =>
    native.push({
      id: `${id}-${kind}`,
      suites: DEFAULT,
      exclusive: true,
      matches: (d) =>
        root(d) && d.format.id === format && ubl21(d) && contract(d) === source && (!process || d.probe?.values.ublProfileId === process),
      plan,
    });
  exact('ublbe-1.31', 'ubl-be', 'urn:cen.eu:en16931:2017#conformant#urn:UBL.BE:1.0.0.20180214', {
    schema: 'xsd-ubl-2.1',
    profile: 'ublbe-1.31-rules',
  });
  if (kind === 'invoice')
    exact(
      'peppol-bis2-4a-3.7.0',
      'peppol-bis2',
      'urn:www.cenbii.eu:transaction:biitrns010:ver2.0:extended:urn:www.peppol.eu:bis:peppol4a:ver2.0',
      { schema: 'xsd-ubl-2.1', semantic: 'peppol-bis2-bii-invoice-3.7.0', profile: 'peppol-bis2-invoice-3.7.0' },
      'urn:www.cenbii.eu:profile:bii04:ver2.0',
    );
  if (kind === 'invoice')
    exact(
      'peppol-bis2-5a-3.7.0',
      'peppol-bis2',
      'urn:www.cenbii.eu:transaction:biitrns010:ver2.0:extended:urn:www.peppol.eu:bis:peppol5a:ver2.0',
      { schema: 'xsd-ubl-2.1', semantic: 'peppol-bis2-bii-invoice-3.7.0', profile: 'peppol-bis2-invoice-3.7.0' },
      'urn:www.cenbii.eu:profile:bii05:ver2.0',
    );
  if (kind === 'creditnote')
    exact(
      'peppol-bis2-5a-3.7.0',
      'peppol-bis2',
      'urn:www.cenbii.eu:transaction:biitrns014:ver2.0:extended:urn:www.peppol.eu:bis:peppol5a:ver2.0',
      { schema: 'xsd-ubl-2.1', semantic: 'peppol-bis2-bii-creditnote-3.7.0', profile: 'peppol-bis2-creditnote-3.7.0' },
      'urn:www.cenbii.eu:profile:bii05:ver2.0',
    );
  exact('cius-ro-1.0.1', 'cius-ro', 'urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1', {
    schema: 'xsd-ubl-2.1',
    profile: 'cius-ro-ubl-1.0.9',
  });
  exact('cius-pt-2.1.1', 'cius-pt', 'urn:cen.eu:en16931:2017#compliant#urn:feap.gov.pt:CIUS-PT:2.1.1', {
    schema: 'xsd-ubl-2.1',
    profile: 'cius-pt-ubl-2.1.1',
  });
  exact(
    'hr-cius-2025',
    'hr-cius',
    'urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.hr:cius-2025:1.0#conformant#urn:mfin.gov.hr:ext-2025:1.0',
    { schema: 'xsd-hr-cius-ubl-20260415', semantic: 'en16931-ubl-1.3.17', profile: 'hr-cius-ext-ubl-20260313' },
  );
  exact(
    'nlcius-gaccount-1.0',
    'nlcius-ubl',
    'urn:cen.eu:en16931:2017#compliant#urn:fdc:nen.nl:nlcius:v1.0#conformant#urn:fdc:nen.nl:gaccount:v1.0',
    { schema: 'xsd-ubl-2.1', profile: 'nlcius-gaccount-1.0.2.13-ubl' },
  );
  exact('selfbilling-3.0', 'peppol-bis3-selfbilling', 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:selfbilling:3.0', {
    schema: 'xsd-ubl-2.1',
    semantic: 'selfbilling-ubl-en16931-1.3.16',
    profile: 'peppol-selfbilling-3.0.2-ubl',
  });
  exact('oioubl-3.0', 'oioubl-3', `urn:fdc:oioubl.dk:trns:billing:${kind}:3.0`, {
    schema: 'xsd-ubl-2.1',
    semantic: `oioubl3-en16931-${kind}-3.2.4`,
    profile: `oioubl3-${kind}-3.2.4`,
  });
  exact('oioubl-2.1', 'oioubl-2', 'OIOUBL-2.1', { schema: 'xsd-ubl-2.1', profile: `oioubl2-${kind}-1.15.2` });
  native.push({
    id: `oioubl-2.02-${kind}`,
    suites: DEFAULT,
    exclusive: true,
    matches: (d) =>
      root(d) &&
      d.format.id === 'oioubl-2' &&
      contract(d) === 'OIOUBL-2.02' &&
      (!d.probe?.values.ublVersionId || d.probe.values.ublVersionId === '2.0'),
    plan: { schema: 'xsd-ubl-2.0', profile: `oioubl-2.02-${kind}-1.11.1` },
  });
  native.push({
    id: `pint-shared-${kind}`,
    suites: DEFAULT,
    exclusive: true,
    matches: (d) =>
      root(d) &&
      (d.format.id.startsWith('pint-') || d.format.id === 'peppol-pint') &&
      ubl21(d) &&
      /^urn:peppol:pint:billing-1(?:@[a-z0-9-]+)*$/.test(contract(d) ?? ''),
    plan: { schema: 'xsd-ubl-2.1', semantic: 'pint-shared-1.1.3' },
  });
  for (const suite of ['peppol-2026-05', 'legacy-peppol-3.0.20-en-1.3.17'] as const) {
    native.push({
      id: `peppol-${suite}-${kind}`,
      suites: [suite],
      matches: (d) => root(d) && d.format.id === 'peppol-bis3',
      plan: {
        semantic: suite === 'peppol-2026-05' ? 'en16931-ubl-1.3.16' : 'en16931-ubl-1.3.17',
        profile: suite === 'peppol-2026-05' ? 'peppol-bis3-3.0.21-ubl' : 'peppol-bis3-3.0.20-ubl',
      },
    });
  }
  native.push({
    id: `xrechnung-3.0-ubl-${kind}`,
    suites: DEFAULT,
    matches: (d) => root(d) && d.format.id === 'xrechnung-ubl' && d.details.version === '3.0',
    plan: { profile: 'xrechnung-3.0.2-ubl' },
  });
  native.push({
    id: `nlcius-1.0-ubl-${kind}`,
    suites: DEFAULT,
    matches: (d) =>
      root(d) && d.format.id === 'nlcius-ubl' && contract(d) === 'urn:cen.eu:en16931:2017#compliant#urn:fdc:nen.nl:nlcius:v1.0',
    plan: { semantic: 'en16931-ubl-1.3.16', profile: 'nlcius-ubl-2.0.3.13' },
  });
}
const facturx: Selector[] = [];
for (const [name, ids] of [
  ['basicwl', ['urn:factur-x.eu:1p0:basicwl', 'urn:zugferd.de:2p0:basicwl']],
  ['en16931', ['urn:cen.eu:en16931:2017']],
  [
    'extended',
    ['urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended', 'urn:cen.eu:en16931:2017#conformant#urn:zugferd.de:2p0:extended'],
  ],
] as const)
  for (const [index, id] of ids.entries())
    facturx.push({
      id: `facturx-1.09.2-${name}-${index + 1}`,
      suites: ['facturx-1.09.2'],
      exclusive: true,
      matches: (d) => CII(d) && ciiId(d) === id,
      plan: { schema: `xsd-facturx-1.09.2-${name}`, profile: `facturx-1.09.2-${name}` },
    });

/** Adding an entry here without independent selector evidence makes the coverage CLI fail. */
export const VALIDATION_SELECTORS: readonly Selector[] = [
  ...NATIONAL_SELECTORS.map(
    (selector): Selector => ({
      id: selector.id,
      suites: selector.suite ? [selector.suite] : DEFAULT,
      exclusive: true,
      matches: (d) => resolveNationalSelector(d, selector.suite)?.id === selector.id,
      plan: { schema: selector.schema, ...(selector.profile ? { profile: selector.profile } : {}) },
    }),
  ),
  ...facturx,
  ...FRANCE_RFE_SELECTORS,
  ...PINT_SPECIALIZATION_SELECTORS,
  ...native.filter((entry) => entry.exclusive),
  {
    id: 'svefaktura-1.0',
    suites: DEFAULT,
    exclusive: true,
    matches: (d) =>
      d.format.id === 'svefaktura-1' && d.probe?.rootName === 'Invoice' && d.probe.rootNs === 'urn:sfti:documents:BasicInvoice:1:0',
    plan: { schema: 'xsd-svefaktura-1.0-20081227', profile: 'svefaktura-1.0-rules-20161025' },
  },
  ...UBL.map(
    ([kind, name, namespace]): Selector => ({
      id: `ubl-2.1-${kind}`,
      suites: ['peppol-2026-05', 'legacy-peppol-3.0.20-en-1.3.17'],
      matches: (d) =>
        d.probe?.rootName === name && d.probe.rootNs === namespace && d.format.id !== 'oioubl-2' && ubl21(d) && knownUblEdition(d),
      plan: { schema: 'xsd-ubl-2.1' },
    }),
  ),
  ...['xrechnung-cii', 'nlcius-cii'].map(
    (formatId): Selector => ({
      id: `cii-d16b-${formatId}`,
      suites: DEFAULT,
      matches: (d) => CII(d) && d.format.id === formatId && ciiSchema(d),
      plan: { schema: 'xsd-cii-d16b' },
    }),
  ),
  ...UBL.map(
    ([kind, name, namespace]): Selector => ({
      id: `en16931-ubl-${kind}`,
      suites: DEFAULT,
      matches: (d) => d.probe?.rootName === name && d.probe.rootNs === namespace && en(d),
      plan: { semantic: 'en16931-ubl-1.3.17' },
    }),
  ),
  { id: 'en16931-cii', suites: DEFAULT, matches: (d) => CII(d) && en(d), plan: { semantic: 'en16931-cii-1.3.17' } },
  {
    id: 'cii-d16b-explicit-en16931',
    suites: ['cii-d16b'],
    matches: (d) => CII(d) && d.format.id === 'en16931-cii' && d.details.version === '2017',
    plan: { schema: 'xsd-cii-d16b', semantic: 'en16931-cii-1.3.17' },
  },
  {
    id: 'cii-d16b-explicit-unknown',
    suites: ['cii-d16b'],
    matches: (d) => CII(d) && d.format.id === 'cii-unknown',
    plan: { schema: 'xsd-cii-d16b' },
  },
  ...native.filter((entry) => !entry.exclusive),
  {
    id: 'xrechnung-3.0-cii',
    suites: DEFAULT,
    matches: (d) => CII(d) && d.format.id === 'xrechnung-cii' && d.details.version === '3.0',
    plan: { profile: 'xrechnung-3.0.2-cii' },
  },
  {
    id: 'nlcius-1.0-cii',
    suites: DEFAULT,
    matches: (d) => CII(d) && d.format.id === 'nlcius-cii' && ciiId(d) === 'urn:cen.eu:en16931:2017#compliant#urn:fdc:nen.nl:nlcius:v1.0',
    plan: { semantic: 'en16931-cii-1.3.16', profile: 'nlcius-cii-1.0.3.13' },
  },
];
export function selectValidationPlan(
  detection: PlanDetection,
  suite: ValidationSuite = 'peppol-2026-05',
): { plan: SelectedPlan; selectors: string[] } {
  if (
    ![
      'peppol-2026-05',
      'legacy-peppol-3.0.20-en-1.3.17',
      'facturx-1.09.2',
      'cii-d16b',
      'e-arve-1.2.EN',
      'e-arve-1.2',
      'france-rfe-1.4.0.04',
      'france-rfe-1.4.0.04-facturx',
    ].includes(suite)
  )
    throw new Error(`Unsupported validation suite: ${suite}`);
  if (detection.kind !== 'invoice') return { plan: {}, selectors: [] };
  if (suite === 'legacy-peppol-3.0.20-en-1.3.17' && detection.format.id !== 'peppol-bis3') return { plan: {}, selectors: [] };
  const plan: SelectedPlan = {};
  const selectors: string[] = [];
  for (const entry of VALIDATION_SELECTORS) {
    if (!entry.suites.includes(suite) || !entry.matches(detection)) continue;
    Object.assign(plan, entry.plan);
    selectors.push(entry.id);
    if (entry.exclusive) break;
  }
  return { plan, selectors };
}
