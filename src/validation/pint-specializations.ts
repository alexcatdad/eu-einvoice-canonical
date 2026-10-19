/** Exact qualified PINT source contracts; unknown chains retain a jurisdiction coverage gap. */
import type { PlanDetection } from './plan.js';
import type { Selector } from './selectors.js';

interface PintContract {
  id: string;
  customization: string;
  process: string;
  semantic: string;
  profile: string;
  roots: readonly ('Invoice' | 'CreditNote')[];
}
export const PINT_CONTRACTS: readonly PintContract[] = [
  {
    id: 'pint-jp-ntr-1.1.3',
    customization: 'urn:peppol:pint:nontaxinvoice-1@jp-1',
    process: 'urn:peppol:bis:billing',
    semantic: 'pint-jp-ntr-shared-1.1.3',
    profile: 'pint-jp-ntr-1.1.3',
    roots: ['Invoice'],
  },
  {
    id: 'pint-om-sb-1.0.1',
    customization: 'urn:peppol:pint:selfbilling-1@om-1',
    process: 'urn:peppol:bis:selfbilling',
    semantic: 'pint-om-sb-shared-1.0.1',
    profile: 'pint-om-sb-1.0.1',
    roots: ['Invoice', 'CreditNote'],
  },
  {
    id: 'pint-jp-sb-1.1.3',
    customization: 'urn:peppol:pint:selfbilling-1@jp-1',
    process: 'urn:peppol:bis:selfbilling',
    semantic: 'pint-jp-sb-shared-1.1.3',
    profile: 'pint-jp-sb-1.1.3',
    roots: ['Invoice'],
  },
  {
    id: 'pint-ae-sb-1.0.4',
    customization: 'urn:peppol:pint:selfbilling-1@ae-1',
    process: 'urn:peppol:bis:selfbilling',
    semantic: 'pint-ae-sb-shared-1.0.4',
    profile: 'pint-ae-1.0.4',
    roots: ['Invoice', 'CreditNote'],
  },
  {
    id: 'pint-eu-1.1.1',
    customization: 'urn:peppol:pint:billing-1@eu-1',
    process: 'urn:peppol:bis:billing',
    semantic: 'pint-shared-1.1.3',
    profile: 'pint-eu-1.1.1',
    roots: ['Invoice', 'CreditNote'],
  },
  {
    id: 'pint-my-sb-1.3.1',
    customization: 'urn:peppol:pint:selfbilling-1@my-1',
    process: 'urn:peppol:bis:selfbilling',
    semantic: 'pint-my-sb-shared-1.3.1',
    profile: 'pint-my-sb-1.3.1',
    roots: ['Invoice', 'CreditNote'],
  },
  {
    id: 'pint-aunz-sb-1.1.3',
    customization: 'urn:peppol:pint:selfbilling-1@aunz-1',
    process: 'urn:peppol:bis:selfbilling',
    semantic: 'pint-aunz-sb-shared-1.1.3',
    profile: 'pint-aunz-sb-1.1.3',
    roots: ['Invoice', 'CreditNote'],
  },
  {
    id: 'pint-om-1.0.1',
    customization: 'urn:peppol:pint:billing-1@om-1',
    process: 'urn:peppol:bis:billing',
    semantic: 'pint-shared-1.1.3',
    profile: 'pint-om-1.0.1',
    roots: ['Invoice', 'CreditNote'],
  },
  {
    id: 'pint-ae-1.0.4',
    customization: 'urn:peppol:pint:billing-1@ae-1',
    process: 'urn:peppol:bis:billing',
    semantic: 'pint-ae-shared-1.0.4',
    profile: 'pint-ae-1.0.4',
    roots: ['Invoice', 'CreditNote'],
  },
  {
    id: 'pint-my-1.3.1',
    customization: 'urn:peppol:pint:billing-1@my-1',
    process: 'urn:peppol:bis:billing',
    semantic: 'pint-shared-1.1.3',
    profile: 'pint-my-1.3.1',
    roots: ['Invoice', 'CreditNote'],
  },
  {
    id: 'pint-jp-1.1.3',
    customization: 'urn:peppol:pint:billing-1@jp-1',
    process: 'urn:peppol:bis:billing',
    semantic: 'pint-shared-1.1.3',
    profile: 'pint-jp-1.1.3',
    roots: ['Invoice'],
  },
  {
    id: 'pint-aunz-1.1.3',
    customization: 'urn:peppol:pint:billing-1@aunz-1',
    process: 'urn:peppol:bis:billing',
    semantic: 'pint-shared-1.1.3',
    profile: 'pint-aunz-1.1.3',
    roots: ['Invoice', 'CreditNote'],
  },
  {
    id: 'pint-sg-1.4.1',
    customization: 'urn:peppol:pint:billing-1@sg-1',
    process: 'urn:peppol:bis:billing',
    semantic: 'pint-shared-1.1.3',
    profile: 'pint-sg-1.4.1',
    roots: ['Invoice', 'CreditNote'],
  },
];
export const PINT_SPECIALIZATION_SELECTORS: readonly Selector[] = PINT_CONTRACTS.flatMap((contract) =>
  contract.roots.map(
    (rootName): Selector => ({
      id: `${contract.id}-${rootName === 'Invoice' ? 'invoice' : 'creditnote'}`,
      suites: ['peppol-2026-05'],
      exclusive: true,
      matches: (detection) =>
        detection.probe?.rootName === rootName &&
        detection.probe.rootNs === `urn:oasis:names:specification:ubl:schema:xsd:${rootName}-2` &&
        (!detection.probe.values.ublVersionId || detection.probe.values.ublVersionId === '2.1') &&
        detection.probe.values.ublCustomizationId === contract.customization,
      plan: { schema: 'xsd-ubl-2.1', semantic: contract.semantic, profile: contract.profile },
    }),
  ),
);
/** A broad publisher process regex does not qualify unknown additional process obligations. */
export function unsupportedPintProcess(detection: PlanDetection): boolean {
  if (detection.kind !== 'invoice') return false;
  const contract = PINT_CONTRACTS.find((entry) => detection.probe?.values.ublCustomizationId === entry.customization);
  const process = detection.probe?.values.ublProfileId;
  return !!contract && !!process && process !== contract.process;
}
