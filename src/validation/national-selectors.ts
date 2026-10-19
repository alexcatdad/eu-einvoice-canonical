/** Finite source contracts; namespace aliases and shared editions are never guessed. */
import type { MatchDetails } from '../formats.js';
import type { XmlProbe } from '../probe.js';

export interface NationalSelector {
  id: string;
  formatId: string;
  rootName: string;
  namespace: string;
  schema: string;
  profile?: string;
  version?: string;
  suite?: 'e-arve-1.2.EN' | 'e-arve-1.2';
  form?: { code: string; systemCode: string; schemaVersion: string; variant: string };
}

export const NATIONAL_SELECTORS: readonly NationalSelector[] = [
  {
    id: 'isdoc-5.1',
    formatId: 'isdoc',
    rootName: 'Invoice',
    namespace: 'http://isdoc.cz/namespace/invoice',
    version: '5.1',
    schema: 'xsd-isdoc-5.1',
  },
  {
    id: 'isdoc-5.2',
    formatId: 'isdoc',
    rootName: 'Invoice',
    namespace: 'http://isdoc.cz/namespace/invoice',
    version: '5.2',
    schema: 'xsd-isdoc-5.2',
  },
  {
    id: 'isdoc-5.2.1',
    formatId: 'isdoc',
    rootName: 'Invoice',
    namespace: 'http://isdoc.cz/namespace/invoice',
    version: '5.2.1',
    schema: 'xsd-isdoc-5.2.1',
  },
  {
    id: 'isdoc-5.2.2',
    formatId: 'isdoc',
    rootName: 'Invoice',
    namespace: 'http://isdoc.cz/namespace/invoice',
    version: '5.2.2',
    schema: 'xsd-isdoc-5.2.2',
  },
  {
    id: 'isdoc-5.2.3',
    formatId: 'isdoc',
    rootName: 'Invoice',
    namespace: 'http://isdoc.cz/namespace/invoice',
    schema: 'xsd-isdoc-5.2.3',
    version: '5.2.3',
  },
  {
    id: 'isdoc-5.3',
    formatId: 'isdoc',
    rootName: 'Invoice',
    namespace: 'http://isdoc.cz/namespace/invoice',
    schema: 'xsd-isdoc-5.3',
    version: '5.3',
  },
  {
    id: 'isdoc-5.3.1',
    formatId: 'isdoc',
    rootName: 'Invoice',
    namespace: 'http://isdoc.cz/namespace/invoice',
    schema: 'xsd-isdoc-5.3.1',
    version: '5.3.1',
  },
  {
    id: 'isdoc-6.0.1',
    formatId: 'isdoc',
    rootName: 'Invoice',
    namespace: 'http://isdoc.cz/namespace/2013',
    schema: 'xsd-isdoc-6.0.1',
    profile: 'isdoc-6.0.1-rules',
    version: '6.0.1',
  },
  {
    id: 'e-arve-1.2',
    formatId: 'e-arve',
    rootName: 'E_Invoice',
    namespace: '',
    schema: 'xsd-e-arve-1.2',
    version: '1.2',
    suite: 'e-arve-1.2',
  },
  {
    id: 'ebinterface-3.02',
    formatId: 'ebinterface',
    rootName: 'Invoice',
    namespace: 'http://www.ebinterface.at/schema/3p02/',
    schema: 'xsd-ebinterface-3.02',
    version: '3.02',
  },
  {
    id: 'ebinterface-3.0',
    formatId: 'ebinterface',
    rootName: 'Invoice',
    namespace: 'http://www.ebinterface.at/schema/3p0/',
    schema: 'xsd-ebinterface-3.0',
    version: '3.0',
  },
  {
    id: 'fatturapa-FPR12',
    formatId: 'fatturapa',
    rootName: 'FatturaElettronica',
    namespace: 'http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2',
    schema: 'xsd-fatturapa-1.2.2',
    version: 'FPR12',
  },
  {
    id: 'fatturapa-FPA12',
    formatId: 'fatturapa',
    rootName: 'FatturaElettronica',
    namespace: 'http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2',
    schema: 'xsd-fatturapa-1.2.2',
    version: 'FPA12',
  },
  {
    id: 'fatturapa-FSM10',
    formatId: 'fatturapa-semplificata',
    rootName: 'FatturaElettronicaSemplificata',
    namespace: 'http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.0',
    schema: 'xsd-fatturapa-semplificata-1.0',
    version: 'FSM10',
  },
  {
    id: 'ksef-fa2',
    formatId: 'ksef',
    rootName: 'Faktura',
    namespace: 'http://crd.gov.pl/wzor/2023/06/29/12648/',
    schema: 'xsd-ksef-fa2',
    form: { code: 'FA', systemCode: 'FA (2)', schemaVersion: '1-0E', variant: '2' },
  },
  {
    id: 'ksef-fa3',
    formatId: 'ksef',
    rootName: 'Faktura',
    namespace: 'http://crd.gov.pl/wzor/2025/06/25/13775/',
    schema: 'xsd-ksef-fa3',
    form: { code: 'FA', systemCode: 'FA (3)', schemaVersion: '1-0E', variant: '3' },
  },
  {
    id: 'ksef-fa-rr',
    formatId: 'ksef',
    rootName: 'Faktura',
    namespace: 'http://crd.gov.pl/wzor/2026/03/06/14189/',
    schema: 'xsd-ksef-fa-rr',
    form: { code: 'FA_RR', systemCode: 'FA_RR (1)', schemaVersion: '1-1E', variant: '1' },
  },
  {
    id: 'facturae-3.0',
    formatId: 'facturae',
    rootName: 'Facturae',
    namespace: 'http://www.facturae.es/Facturae/2007/v3.0/Facturae',
    schema: 'xsd-facturae-3.0',
    version: '3.0',
  },
  {
    id: 'facturae-3.1',
    formatId: 'facturae',
    rootName: 'Facturae',
    namespace: 'http://www.facturae.es/Facturae/2007/v3.1/Facturae',
    schema: 'xsd-facturae-3.1',
    version: '3.1',
  },
  {
    id: 'facturae-3.2',
    formatId: 'facturae',
    rootName: 'Facturae',
    namespace: 'http://www.facturae.es/Facturae/2009/v3.2/Facturae',
    schema: 'xsd-facturae-3.2',
    version: '3.2',
  },
  {
    id: 'facturae-3.2.1',
    formatId: 'facturae',
    rootName: 'Facturae',
    namespace: 'http://www.facturae.es/Facturae/2014/v3.2.1/Facturae',
    schema: 'xsd-facturae-3.2.1',
    version: '3.2.1',
  },
  {
    id: 'facturae-3.2.2',
    formatId: 'facturae',
    rootName: 'Facturae',
    namespace: 'http://www.facturae.gob.es/formato/Versiones/Facturaev3_2_2.xml',
    schema: 'xsd-facturae-3.2.2',
    version: '3.2.2',
  },
  {
    id: 'isdoc-6.0.2',
    formatId: 'isdoc',
    rootName: 'Invoice',
    namespace: 'http://isdoc.cz/namespace/2013',
    schema: 'xsd-isdoc-6.0.2',
    profile: 'isdoc-6.0.2-rules',
    version: '6.0.2',
  },
  ...['4.0', '4.1', '4.2', '4.3', '5.0', '6.0', '6.1'].map((version) => ({
    id: `ebinterface-${version}`,
    formatId: 'ebinterface',
    rootName: 'Invoice',
    namespace: `http://www.ebinterface.at/schema/${version.replace('.', 'p')}/`,
    schema: `xsd-ebinterface-${version}`,
    version,
  })),
  ...['1.3', '2.0', '2.01', '3.0'].map((version) => ({
    id: `finvoice-${version}`,
    formatId: 'finvoice',
    rootName: 'Finvoice',
    namespace: '',
    schema: `xsd-finvoice-${version}`,
    version,
  })),
  { id: 'teappsxml-3.0', formatId: 'teappsxml', rootName: 'INVOICE_CENTER', namespace: '', schema: 'xsd-teappsxml-3.0', version: '3.0' },
  {
    id: 'e-arve-1.2.EN',
    formatId: 'e-arve',
    rootName: 'E_Invoice',
    namespace: '',
    schema: 'xsd-earve-1.2',
    version: '1.2',
    suite: 'e-arve-1.2.EN',
  },
  { id: 'eslog-2.00', formatId: 'eslog-2', rootName: 'Invoice', namespace: 'urn:eslog:2.00', schema: 'xsd-eslog-2.0', version: '2.00' },
  {
    id: 'cfdi-3.3',
    formatId: 'mx-cfdi',
    rootName: 'Comprobante',
    namespace: 'http://www.sat.gob.mx/cfd/3',
    schema: 'xsd-cfdi-3.3',
    version: '3.3',
  },
  {
    id: 'cfdi-4.0',
    formatId: 'mx-cfdi',
    rootName: 'Comprobante',
    namespace: 'http://www.sat.gob.mx/cfd/4',
    schema: 'xsd-cfdi-4.0',
    version: '4.0',
  },
];

export function resolveNationalSelector(
  detection: { format: { id: string }; details: MatchDetails; probe?: XmlProbe },
  suite?: string,
): NationalSelector | undefined {
  const probe = detection.probe;
  if (!probe) return undefined;
  return NATIONAL_SELECTORS.find((selector) => {
    if (selector.formatId !== detection.format.id || selector.rootName !== probe.rootName || selector.namespace !== probe.rootNs)
      return false;
    if (selector.suite && suite !== selector.suite) return false;
    if ((suite === 'e-arve-1.2.EN' || suite === 'e-arve-1.2') && selector.suite !== suite) return false;
    if (selector.version && selector.version !== detection.details.version) return false;
    if (selector.form) {
      const attributes = probe.valueAttrs.ksefFormCode ?? {};
      if (probe.values.ksefVariant !== undefined && probe.values.ksefVariant !== selector.form.variant) return false;
      // An omitted mandatory field is left to the selected XSD; an incompatible declared revision is unsupported.
      if (probe.values.ksefFormCode !== undefined && probe.values.ksefFormCode !== selector.form.code) return false;
      if (attributes.kodSystemowy !== undefined && attributes.kodSystemowy !== selector.form.systemCode) return false;
      if (attributes.wersjaSchemy !== undefined && attributes.wersjaSchemy !== selector.form.schemaVersion) return false;
    }
    return true;
  });
}
