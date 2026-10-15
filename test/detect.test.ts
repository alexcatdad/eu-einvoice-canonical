import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { detectXml, inspect } from '../src/index.js';
import { FORMATS } from '../src/formats.js';
import { CBC, PEPPOL, ciiHeader, fixture, ublHeader, NSI } from './helpers.js';

// ---------------------------------------------------------------------------
// Fixtures: unwrap + detect
// ---------------------------------------------------------------------------

interface Expect {
  file: string;
  /** Expected detection per XML document found, in order. 'other' = recognised non-invoice. */
  formats: string[];
  /** Envelope kinds expected on the first document (in order). */
  envelope?: string[];
  signature?: string;
  version?: string;
  profile?: string;
  skipped?: number;
}

const CASES: Expect[] = [
  // Own synthetic fixtures
  { file: 'peppol-bis3-invoice.xml', formats: ['peppol-bis3'], version: '2017' },
  { file: 'peppol-bis3-creditnote.xml', formats: ['peppol-bis3'] },
  { file: 'peppol-negative-invoice.xml', formats: ['peppol-bis3'] },
  { file: 'xrechnung-ubl.xml', formats: ['xrechnung-ubl'], version: '3.0' },
  { file: 'xrechnung-cii.xml', formats: ['xrechnung-cii'], version: '3.0' },
  { file: 'facturx-basic-creditnote.xml', formats: ['facturx'], profile: 'BASIC' },
  { file: 'facturx-minimum.xml', formats: ['facturx'], profile: 'MINIMUM' },
  { file: 'svefaktura-1.0.xml', formats: ['svefaktura-1'], version: '1.0' },
  { file: 'svefaktura-1.0-credit.xml', formats: ['svefaktura-1'] },
  // Fixtures built from public samples (phive-rules, Mustang; see test/fixtures/README.md)
  { file: 'peppol-in-sbdh.xml', formats: ['peppol-pint'], envelope: ['sbdh', 'xml'], profile: 'aunz' },
  { file: 'peppol-utf16.xml', formats: ['peppol-pint'] },
  { file: 'hr-cius.xml', formats: ['hr-cius'] },
  { file: 'en16931-2026.xml', formats: ['en16931-ubl'], version: '2026' },
  { file: 'anaf-download.zip', formats: ['cius-ro'], envelope: ['zip', 'xml'], signature: 'detached', skipped: 1 },
  { file: 'finvoice-with-soap.xml', formats: ['finvoice'], envelope: ['soap', 'xml'], version: '3.0' },
  { file: 'invoice.isdocx', formats: ['isdoc'], envelope: ['zip', 'xml'], skipped: 1 },
  { file: 'ksef-fa3.xml', formats: ['ksef'], version: 'FA (3)' },
  { file: 'eslog2.xml', formats: ['eslog-2'] },
  { file: 'e-arve-two-invoices.xml', formats: ['e-arve'], version: '1.2' },
  { file: 'facturae-322-signed.xsig', formats: ['facturae'], version: '3.2.2', signature: 'XAdES' },
  { file: 'ebinterface-61.xml', formats: ['ebinterface'], version: '6.1' },
  { file: 'fattura-semplificata.xml', formats: ['fatturapa-semplificata'], version: 'FSM10' },
  { file: 'mydata.xml', formats: ['gr-mydata'], profile: '1.1' },
  { file: 'sdi-metadata.xml', formats: ['other'] },
  { file: 'IT01234567890_FPR12.xml.p7m', formats: ['fatturapa'], envelope: ['cms-p7m', 'xml'], signature: 'CAdES', version: 'FPR12' },
  { file: 'IT01234567890_FPR12.base64.xml.p7m', formats: ['fatturapa'], envelope: ['base64', 'cms-p7m', 'xml'], signature: 'CAdES' },
  { file: 'facturx-en16931.pdf', formats: ['facturx'], envelope: ['pdf-attachment', 'xml'], profile: 'EN 16931' },
];

describe('fixtures: unwrap and detect', () => {
  for (const c of CASES) {
    test(c.file, async () => {
      const r = await inspect(fixture(c.file), c.file);
      const got = r.documents.map((d) => (d.detection.kind === 'invoice' ? d.detection.format.id : d.detection.kind === 'other-document' ? 'other' : 'unknown'));
      assert.deepEqual(got, c.formats);
      const first = r.documents[0];
      if (c.envelope) assert.deepEqual(first.payload.envelope.map((s) => s.kind), c.envelope);
      if (c.signature) assert.ok(first.payload.signatures.some((s) => s.type === c.signature), `signature ${c.signature}`);
      if (first.detection.kind === 'invoice') {
        if (c.version) assert.equal(first.detection.details.version, c.version);
        if (c.profile) assert.equal(first.detection.details.profile, c.profile);
      }
      if (c.skipped !== undefined) assert.equal(r.skipped.length, c.skipped);
    });
  }

  test('Finvoice ISO-8859-15 text survives decoding', async () => {
    const r = await inspect(fixture('finvoice-with-soap.xml'));
    assert.equal(r.documents[0].payload.encoding, 'iso-8859-15');
  });

  test('Svefaktura ISO-8859-1 is decoded with its declared encoding', async () => {
    const r = await inspect(fixture('svefaktura-1.0.xml'));
    assert.equal(r.documents[0].payload.encoding, 'iso-8859-1');
  });

  test('payload byteLength is the UTF-8 size, not the string length', async () => {
    const xml = ublHeader(PEPPOL).replace('<cbc:ID>', '<cbc:Note>' + 'ąę€'.repeat(50) + '</cbc:Note><cbc:ID>');
    const bytes = new TextEncoder().encode(xml);
    const r = await inspect(bytes);
    assert.equal(r.documents[0].payload.byteLength, bytes.length);
    assert.notEqual(bytes.length, xml.length);
  });
});

// ---------------------------------------------------------------------------
// Detection rules, header-only documents
// ---------------------------------------------------------------------------

const id = (xml: string, fromPdf = false) => {
  const d = detectXml(xml, { fromPdf });
  return d.kind === 'invoice' ? d.format.id : d.kind;
};
const details = (xml: string, fromPdf = false) => {
  const d = detectXml(xml, { fromPdf });
  assert.equal(d.kind, 'invoice');
  return d.kind === 'invoice' ? d.details : {};
};

describe('UBL profiles', () => {
  const RULES: [string, string][] = [
    [PEPPOL, 'peppol-bis3'],
    [`${PEPPOL}#conformant#urn:fdc:anskaffelser.no:2019:ehf:spec:3.0`, 'peppol-bis3'],
    ['urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:selfbilling:3.0', 'peppol-bis3-selfbilling'],
    ['urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0', 'xrechnung-ubl'],
    ['urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0#conformant#urn:xeinkauf.de:kosit:extension:xrechnung_3.0', 'xrechnung-ubl'],
    ['urn:cen.eu:en16931:2017#compliant#urn:fdc:nen.nl:nlcius:v1.0', 'nlcius-ubl'],
    ['urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1', 'cius-ro'],
    ['urn:cen.eu:en16931:2017#compliant#urn:feap.gov.pt:CIUS-PT:2.1.1', 'cius-pt'],
    ['urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.hr:cius-2025:1.0#conformant#urn:mfin.gov.hr:ext-2025:1.0', 'hr-cius'],
    ['urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr', 'fr-ctc-ubl'],
    ['urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0#extended#urn:fdc:www.efaktura.gov.pl:ver2.0', 'pl-pef'],
    ['urn:fdc:oioubl.dk:trns:billing:invoice:3.0', 'oioubl-3'],
    ['OIOUBL-2.01', 'oioubl-2'],
    ['urn:peppol:pint:billing-1@jp-1', 'peppol-pint'],
    ['urn:cen.eu:en16931:2017#conformant#urn:UBL.BE:1.0.0.20180214', 'ubl-be'],
    ['urn:cen.eu:en16931:2017', 'en16931-ubl'],
    ['urn:cen.eu:en16931:2026', 'en16931-ubl'],
    ['urn:www.cenbii.eu:transaction:biitrns010:ver2.0:extended:urn:www.peppol.eu:bis:peppol5a:ver2.0', 'peppol-bis2'],
    ['something-else', 'ubl-unknown'],
  ];
  for (const [cid, expected] of RULES) {
    test(`${expected} <- ${cid}`, () => assert.equal(id(ublHeader(cid)), expected));
  }

  test('CreditNote root is detected the same way', () => assert.equal(id(ublHeader(PEPPOL, { root: 'CreditNote' })), 'peppol-bis3'));
  test('UBL without CustomizationID is ubl-unknown', () => assert.equal(id(`<Invoice xmlns="${NSI}"/>`), 'ubl-unknown'));

  test('Peppol profile shows only the national extension', () => {
    assert.equal(details(ublHeader(PEPPOL)).profile, undefined);
    assert.equal(details(ublHeader(`${PEPPOL}#conformant#urn:fdc:anskaffelser.no:2019:ehf:spec:3.0`)).profile, 'urn:fdc:anskaffelser.no:2019:ehf:spec:3.0');
  });

  test('Poland PEF profile is the efaktura.gov.pl extension', () =>
    assert.equal(details(ublHeader('urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0#extended#urn:fdc:www.efaktura.gov.pl:ver2.0')).profile, 'urn:fdc:www.efaktura.gov.pl:ver2.0'));
});

describe('CII profiles', () => {
  const RULES: [string, string, string | undefined, boolean?][] = [
    ['urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0', 'xrechnung-cii', undefined],
    ['urn:cen.eu:en16931:2017#compliant#urn:fdc:nen.nl:nlcius:v1.0', 'nlcius-cii', undefined],
    ['urn:factur-x.eu:1p0:minimum', 'facturx', 'MINIMUM'],
    ['urn:factur-x.eu:1p0:basicwl', 'facturx', 'BASIC WL'],
    ['urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic', 'facturx', 'BASIC'],
    ['urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended', 'facturx', 'EXTENDED'],
    ['urn:cen.eu:en16931:2017#compliant#urn:zugferd.de:2p0:basic', 'facturx', 'BASIC'],
    ['urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr', 'fr-ctc-cii', undefined],
    ['urn:cen.eu:en16931:2017', 'facturx', 'EN 16931', true],
    ['urn:cen.eu:en16931:2017', 'en16931-cii', undefined, false],
    ['urn:example:unknown', 'cii-unknown', undefined],
  ];
  for (const [gid, expected, profile, fromPdf] of RULES) {
    test(`${expected}${profile ? ` ${profile}` : ''} <- ${gid}${fromPdf ? ' (from PDF)' : ''}`, () => {
      const xml = ciiHeader(gid);
      assert.equal(id(xml, fromPdf ?? false), expected);
      if (profile) assert.equal(details(xml, fromPdf ?? false).profile, profile);
    });
  }
});

describe('national header-only rules', () => {
  test('eSLOG 1.6 is the namespace-less IzdaniRacunEnostavni root', () => {
    assert.equal(id('<IzdaniRacunEnostavni><GlavaRacuna/></IzdaniRacunEnostavni>'), 'eslog-1');
    assert.equal(details('<IzdaniRacunEnostavni/>').version, '1.6');
    assert.equal(id('<IzdaniRacunEnostavni xmlns="urn:other"/>'), 'unknown');
  });

  test('myDATA is InvoicesDoc in the AADE v1.0 namespace', () => {
    const xml = '<InvoicesDoc xmlns="http://www.aade.gr/myDATA/invoice/v1.0"><invoice><invoiceHeader><invoiceType>1.1</invoiceType></invoiceHeader></invoice></InvoicesDoc>';
    assert.equal(id(xml), 'gr-mydata');
    assert.equal(details(xml).profile, '1.1');
  });

  test('every rule marked unverified is a fallback', () => {
    const unverified = FORMATS.filter((f) => f.status === 'unverified').map((f) => f.id).sort();
    assert.deepEqual(unverified, ['cii-unknown', 'ubl-unknown']);
  });
});

describe('header probe robustness', () => {
  test('a CustomizationID after a large UBLExtensions block is still found', () => {
    const ext = 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2';
    const big = `<ext:UBLExtensions xmlns:ext="${ext}"><ext:UBLExtension><ext:ExtensionContent><x:s xmlns:x="urn:x">${'<x:r><x:q/></x:r>'.repeat(2000)}</x:s></ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>`;
    assert.equal(id(ublHeader(PEPPOL, { before: big })), 'peppol-bis3');
  });

  test('a CDATA-wrapped CustomizationID is read', () => assert.equal(id(ublHeader(`<![CDATA[${PEPPOL}]]>`)), 'peppol-bis3'));

  test('a CustomizationID in a foreign namespace is ignored', () => {
    const xml = `<Invoice xmlns="${NSI}" xmlns:z="urn:z"><z:CustomizationID>${PEPPOL}</z:CustomizationID></Invoice>`;
    assert.equal(id(xml), 'ubl-unknown');
  });

  test('a prefixed root element is detected by namespace', () => {
    const xml = `<ubl:Invoice xmlns:ubl="${NSI}" xmlns:cbc="${CBC}"><cbc:CustomizationID>${PEPPOL}</cbc:CustomizationID></ubl:Invoice>`;
    assert.equal(id(xml), 'peppol-bis3');
  });

  test('stray whitespace in the FatturaPA namespace is tolerated', () => {
    const xml = `<p:FatturaElettronica xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2 " versione="FPR12"/>`;
    assert.equal(id(xml), 'fatturapa');
  });

  test('not well-formed input is unknown', () => assert.equal(id('not xml'), 'unknown'));
  test('an undeclared prefix on the root is unknown', () => assert.equal(id('<a:Invoice/>'), 'unknown'));
  test('an unrelated XML document is unknown', () => assert.equal(id('<html xmlns="http://www.w3.org/1999/xhtml"/>'), 'unknown'));
  test('a UBL Order is a recognised non-invoice', () =>
    assert.equal(id('<Order xmlns="urn:oasis:names:specification:ubl:schema:xsd:Order-2"/>'), 'other-document'));
});
