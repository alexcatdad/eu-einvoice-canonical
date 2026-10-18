/** Independent source examples/negative controls for each reviewed national selection contract. */
export interface NationalSelectorCase {
  selectorId: string;
  fixture: string;
  schema: string;
  suite?: 'e-arve-1.2.EN';
  prepare?: readonly [string, string][];
  wrong: readonly [string, string];
  future: readonly [string, string];
}
const national = 'test/validation-fixtures/national/';
const legacy = 'test/validation-fixtures/legacy/';
export const NATIONAL_SELECTOR_CASES: readonly NationalSelectorCase[] = [
  {
    selectorId: 'fatturapa-FPR12',
    fixture: `${national}fatturapa.xml`,
    schema: 'xsd-fatturapa-1.2.2',
    wrong: ['versione="FPR12"', 'versione="FPR11"'],
    future: ['versione="FPR12"', 'versione="FPR99"'],
  },
  {
    selectorId: 'fatturapa-FPA12',
    fixture: `${national}fatturapa.xml`,
    schema: 'xsd-fatturapa-1.2.2',
    prepare: [
      ['versione="FPR12"', 'versione="FPA12"'],
      ['<FormatoTrasmissione>FPR12</FormatoTrasmissione>', '<FormatoTrasmissione>FPA12</FormatoTrasmissione>'],
    ],
    wrong: ['versione="FPA12"', 'versione="FPA11"'],
    future: ['versione="FPA12"', 'versione="FPA99"'],
  },
  {
    selectorId: 'fatturapa-FSM10',
    fixture: `${national}fatturapa-semplificata.xml`,
    schema: 'xsd-fatturapa-semplificata-1.0',
    wrong: ['versione="FSM10"', 'versione="FSM09"'],
    future: ['versione="FSM10"', 'versione="FSM99"'],
  },
  {
    selectorId: 'ksef-fa2',
    fixture: `${national}ksef-fa2.xml`,
    schema: 'xsd-ksef-fa2',
    wrong: ['kodSystemowy="FA (2)"', 'kodSystemowy="FA (1)"'],
    future: ['wersjaSchemy="1-0E"', 'wersjaSchemy="9-9E"'],
  },
  {
    selectorId: 'ksef-fa3',
    fixture: `${national}ksef-fa3.xml`,
    schema: 'xsd-ksef-fa3',
    wrong: ['kodSystemowy="FA (3)"', 'kodSystemowy="FA (2)"'],
    future: ['wersjaSchemy="1-0E"', 'wersjaSchemy="9-9E"'],
  },
  {
    selectorId: 'ksef-fa-rr',
    fixture: `${national}ksef-fa-rr.xml`,
    schema: 'xsd-ksef-fa-rr',
    wrong: ['kodSystemowy="FA_RR (1)"', 'kodSystemowy="FA (3)"'],
    future: ['wersjaSchemy="1-1E"', 'wersjaSchemy="9-9E"'],
  },
  {
    selectorId: 'facturae-3.0',
    fixture: `${legacy}facturae-3.0.xml`,
    schema: 'xsd-facturae-3.0',
    wrong: ['<SchemaVersion>3.0</SchemaVersion>', '<SchemaVersion>3.1</SchemaVersion>'],
    future: ['<SchemaVersion>3.0</SchemaVersion>', '<SchemaVersion>9.9</SchemaVersion>'],
  },
  {
    selectorId: 'facturae-3.1',
    fixture: `${legacy}facturae-3.1.xml`,
    schema: 'xsd-facturae-3.1',
    wrong: ['<SchemaVersion>3.1</SchemaVersion>', '<SchemaVersion>3.0</SchemaVersion>'],
    future: ['<SchemaVersion>3.1</SchemaVersion>', '<SchemaVersion>9.9</SchemaVersion>'],
  },
  {
    selectorId: 'facturae-3.2',
    fixture: `${national}facturae-3.2.xml`,
    schema: 'xsd-facturae-3.2',
    wrong: ['<SchemaVersion>3.2</SchemaVersion>', '<SchemaVersion>3.1</SchemaVersion>'],
    future: ['<SchemaVersion>3.2</SchemaVersion>', '<SchemaVersion>9.9</SchemaVersion>'],
  },
  {
    selectorId: 'facturae-3.2.1',
    fixture: `${national}facturae-3.2.1.xml`,
    schema: 'xsd-facturae-3.2.1',
    wrong: ['<SchemaVersion>3.2.1</SchemaVersion>', '<SchemaVersion>3.2</SchemaVersion>'],
    future: ['<SchemaVersion>3.2.1</SchemaVersion>', '<SchemaVersion>9.9</SchemaVersion>'],
  },
  {
    selectorId: 'facturae-3.2.2',
    fixture: `${national}facturae-3.2.2.xml`,
    schema: 'xsd-facturae-3.2.2',
    wrong: ['<SchemaVersion>3.2.2</SchemaVersion>', '<SchemaVersion>3.2.1</SchemaVersion>'],
    future: ['<SchemaVersion>3.2.2</SchemaVersion>', '<SchemaVersion>9.9</SchemaVersion>'],
  },
  {
    selectorId: 'isdoc-6.0.2',
    fixture: `${national}isdoc.isdoc`,
    schema: 'xsd-isdoc-6.0.2',
    wrong: ['version="6.0.2"', 'version="6.0.1"'],
    future: ['version="6.0.2"', 'version="9.9.9"'],
  },
  ...['4.0', '4.1', '4.2', '4.3', '5.0', '6.0', '6.1'].map((version) => ({
    selectorId: `ebinterface-${version}`,
    fixture: `${['4.0', '4.1', '4.2'].includes(version) ? legacy : national}ebinterface-${version}.xml`,
    schema: `xsd-ebinterface-${version}`,
    wrong: [`http://www.ebinterface.at/schema/${version.replace('.', 'p')}/`, 'http://www.ebinterface.at/schema/3p0/'] as const,
    future: [`http://www.ebinterface.at/schema/${version.replace('.', 'p')}/`, 'http://www.ebinterface.at/schema/9p9/'] as const,
  })),
  ...['1.3', '2.0', '2.01', '3.0'].map((version) => ({
    selectorId: `finvoice-${version}`,
    fixture: version === '3.0' ? `${national}finvoice.xml` : `${legacy}finvoice-${version}.xml`,
    schema: `xsd-finvoice-${version}`,
    wrong: [`Version="${version}"`, 'Version="1.2"'] as const,
    future: [`Version="${version}"`, 'Version="9.9"'] as const,
  })),
  {
    selectorId: 'teappsxml-3.0',
    fixture: 'test/validation-fixtures/teappsxml-valid.xml',
    schema: 'xsd-teappsxml-3.0',
    wrong: ['<FORMAT_VERSION>3.0</FORMAT_VERSION>', '<FORMAT_VERSION>2.7</FORMAT_VERSION>'],
    future: ['<FORMAT_VERSION>3.0</FORMAT_VERSION>', '<FORMAT_VERSION>9.9</FORMAT_VERSION>'],
  },
  {
    selectorId: 'e-arve-1.2.EN',
    fixture: `${national}e-arve.xml`,
    schema: 'xsd-earve-1.2',
    suite: 'e-arve-1.2.EN',
    wrong: ['<Version>1.2</Version>', '<Version>1.1</Version>'],
    future: ['<Version>1.2</Version>', '<Version>9.9</Version>'],
  },
  {
    selectorId: 'eslog-2.00',
    fixture: `${national}eslog-2.xml`,
    schema: 'xsd-eslog-2.0',
    wrong: ['urn:eslog:2.00', 'urn:eslog:1.60'],
    future: ['urn:eslog:2.00', 'urn:eslog:9.99'],
  },
  {
    selectorId: 'cfdi-3.3',
    fixture: `${legacy}cfdi-33.xml`,
    schema: 'xsd-cfdi-3.3',
    wrong: ['Version="3.3"', 'Version="3.2"'],
    future: ['Version="3.3"', 'Version="9.9"'],
  },
  {
    selectorId: 'cfdi-4.0',
    fixture: `${legacy}cfdi-40.xml`,
    schema: 'xsd-cfdi-4.0',
    wrong: ['Version="4.0"', 'Version="3.3"'],
    future: ['Version="4.0"', 'Version="9.9"'],
  },
];
