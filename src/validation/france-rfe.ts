/** Explicit current France RFE policy: publisher-paired profile rules followed by French fatal rules. */
import type { Selector } from './selectors.js';

const EXTENDED = 'urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr';
const STRICT = 'france-rfe-1.4.0.04';
const FACTURX = 'france-rfe-1.4.0.04-facturx';
export const FRANCE_RFE_SELECTORS: readonly Selector[] = [
  ...(['Invoice', 'CreditNote'] as const).flatMap((rootName) =>
    [
      { id: 'en16931', contract: 'urn:cen.eu:en16931:2017', semantic: 'france-rfe-en16931-ubl-1.3.16' },
      { id: 'extended-ctc-fr', contract: EXTENDED, semantic: 'france-rfe-extended-ubl-1.4.0.04' },
    ].map(
      ({ id, contract, semantic }): Selector => ({
        id: `france-rfe-1.4.0.04-ubl-${id}-${rootName.toLowerCase()}`,
        suites: [STRICT],
        exclusive: true,
        matches: (detection) =>
          detection.probe?.rootName === rootName &&
          detection.probe.rootNs === `urn:oasis:names:specification:ubl:schema:xsd:${rootName}-2` &&
          (!detection.probe.values.ublVersionId || detection.probe.values.ublVersionId === '2.1') &&
          detection.probe.values.ublCustomizationId === contract,
        plan: { schema: 'xsd-ubl-2.1', semantic, profile: 'france-rfe-ubl-1.4.0.04' },
      }),
    ),
  ),
  ...[
    { id: 'en16931', contract: 'urn:cen.eu:en16931:2017', semantic: 'en16931-cii-1.3.16' },
    { id: 'extended-ctc-fr', contract: EXTENDED, semantic: 'france-rfe-extended-cii-1.4.0.04' },
  ].map(
    ({ id, contract, semantic }): Selector => ({
      id: `france-rfe-1.4.0.04-cii-${id}`,
      suites: [STRICT],
      exclusive: true,
      matches: (detection) =>
        detection.probe?.rootName === 'CrossIndustryInvoice' &&
        detection.probe.rootNs === 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100' &&
        detection.probe.values.ciiGuidelineId === contract,
      plan: { schema: 'xsd-cii-d22b-france-rfe-1.4.0.04', semantic, profile: 'france-rfe-cii-1.4.0.04' },
    }),
  ),
  ...[
    { id: 'basicwl', contract: 'urn:factur-x.eu:1p0:basicwl', profile: 'basicwl' },
    { id: 'basicwl-zugferd', contract: 'urn:zugferd.de:2p0:basicwl', profile: 'basicwl' },
    { id: 'en16931', contract: 'urn:cen.eu:en16931:2017', profile: 'en16931' },
    { id: 'extended', contract: 'urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended', profile: 'extended' },
    { id: 'extended-zugferd', contract: 'urn:cen.eu:en16931:2017#conformant#urn:zugferd.de:2p0:extended', profile: 'extended' },
  ].map(
    ({ id, contract, profile }): Selector => ({
      id: `france-rfe-1.4.0.04-facturx-${id}`,
      suites: [FACTURX],
      exclusive: true,
      matches: (detection) =>
        detection.probe?.rootName === 'CrossIndustryInvoice' &&
        detection.probe.rootNs === 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100' &&
        detection.probe.values.ciiGuidelineId === contract,
      plan: { schema: `xsd-facturx-1.09.2-${profile}`, semantic: `facturx-1.09.2-${profile}`, profile: 'france-rfe-cii-1.4.0.04' },
    }),
  ),
];
