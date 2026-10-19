/**
 * Rebuilds validation/bundles/ from the pinned upstream releases:
 *   bun scripts/build-validation-bundles.ts [bundle-id ...]
 *
 * Needs network access, curl for upstream redirect recovery, and the xslt3 dev dependency (SaxonJS compiler, no Java). Approved bundles are
 * committed; --restore-held downloads the pinned, ignored local qualification inputs. Afterwards run
 * `bun run verify:bundles` and review the diff of validation/bundles/*\/manifest.json.
 *
 * Schematron is compiled ahead of time to SaxonJS SEF (gzipped); XSDs are copied as they are.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gzipSync, unzipSync } from 'fflate';
import { sha256Hex } from '../src/hash.js';
import { bis2Includes, bis2MimeMembership, combineBis2Core, inlineBis2Includes } from './bis2-source.js';
import { CFDI_XSD_SPECS } from './cfdi-validation-specs.js';
import { inlineFacturxCodeDb } from './facturx-artifacts.js';
import { fetchSource } from './fetch-source.js';
import { inlineHrSchematron } from './hr-schematron-source.js';
import { oioubl2SvrlWrapper } from './oioubl2-report.js';
import { oioubl202CompatibleSource } from './oioubl202-source.js';
import { combinePintEuSchematrons } from './pint-eu-source.js';
import { expandPtSchematron } from './pt-schematron-source.js';
import { expandRoSchematron } from './ro-schematron-source.js';
import { loadDistribution } from './validation-distribution.js';
import { addDistributionEvidence } from './validation-distribution-evidence.js';

const root = join(import.meta.dir, '..');
const licenseMetadata: Record<string, string> = JSON.parse(readFileSync(join(root, 'validation/licenses/metadata.json'), 'utf8'));
const bundlesDir = join(root, 'validation/bundles');
const xslt3 = join(root, 'node_modules/xslt3/xslt3.js');

// ISO Schematron reference implementation (MIT), pinned to a commit.
const SKELETON_COMMIT = '77dcd36c53d12ed786c144ece3b2af7694abdc56';
const SKELETON = (f: string) => `https://raw.githubusercontent.com/Schematron/schematron/${SKELETON_COMMIT}/trunk/schematron/code/${f}`;

interface Common {
  id: string;
  title: string;
  layer: 'schema' | 'semantic' | 'profile';
  /** 'ubl' / 'cii' for the EN 16931 syntaxes, the format family for national schemas. */
  syntax: string;
  version: string;
  releaseDate: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  license: string;
  upstream: string;
  note?: string;
}

interface XsdSpec extends Common {
  kind: 'xsd';
  archive?: string;
  archiveSha256?: string;
  nestedArchive?: { path: string; sha256: string };
  /** Archive path prefix -> files to copy, relative to that prefix. entry is relative to the bundle dir. */
  copy?: { from: string; to: string; files: string[] | 'all' }[];
  /** Single files, each downloaded as it is (or taken from a zip) and optionally patched to resolve imports offline. */
  fetch?: FetchFile[];
  /** Local import drivers; vendor schemas remain unchanged. */
  generated?: Record<string, string>;
  entries: Record<string, string>;
}

interface FetchFile {
  url: string;
  sha256?: string;
  /** Path inside the bundle. */
  to: string;
  /** The file inside the zip at `url`. */
  zipEntry?: string;
  /** Exact-string replacements; each must match. Used only to point remote schemaLocations at the vendored copy. */
  replace?: [from: string, to: string][];
}

interface SchematronSpec extends Common {
  kind: 'sef';
  /** An XSLT 2.0 stylesheet already compiled from the Schematron, or the .sch to compile here. */
  xslt?: {
    archive: string;
    path: string;
    archiveSha256?: string;
    sha256?: string;
    additionalFiles?: readonly { path: string; to: string }[];
    reportFormat?: 'oioubl2' | 'oioubl202';
  };
  xsltFile?: { url: string; sha256: string; codeDb: { url: string; sha256: string; filename: string }; derivedSha256: string };
  sch?: {
    url: string;
    sha256?: string;
    zipEntry?: string;
    phase?: string;
    patternNamespaces?: Record<string, string>;
    replace?: readonly (readonly [string, string])[];
    derivedSha256?: string;
    pintEuCombined?: boolean;
    bis2CoreEntry?: string;
    bis2Inline?: boolean;
    bis2MimeMembership?: boolean;
    selectContexts?: 'key';
  };
  entry: string;
}

const VC =
  'https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/download/v2026-08-31/xrechnung-3.0.2-validator-configuration-2026-08-31.zip';
const VC_PREFIX = 'resources/';
const EN = (syntax: string) =>
  `https://github.com/ConnectingEurope/eInvoicing-EN16931/releases/download/validation-1.3.17/en16931-${syntax}-1.3.17.zip`;
const XR = 'https://github.com/itplr-kosit/xrechnung-schematron/releases/download/v2.6.0/xrechnung-3.0.2-schematron-2.6.0.zip';
const PEPPOL = (f: string) => `https://raw.githubusercontent.com/OpenPEPPOL/peppol-bis-invoice-3/v3.0.20/rules/sch/${f}`;

const MAY_2026 = 'https://docs.peppol.eu/poacc/billing/3.0/upcoming/files/';

import facturxSpecs from './facturx-validation-specs.json' with { type: 'json' };
import { FRANCE_RFE_VALIDATION_SPECS } from './france-rfe-validation-specs.js';
import { LEGACY_XSD_SPECS } from './legacy-validation-specs.js';
import { OIOUBL_VALIDATION_SPECS } from './oioubl-validation-specs.js';
import { PINT_SPECIALIZATION_SPECS } from './pint-specialization-specs.js';
import { profileValidationSpecs } from './profile-validation-specs.js';
import { REMAINING_LEGACY_SEF_SPECS, REMAINING_LEGACY_XSD_SPECS } from './remaining-legacy-specs.js';

const SPECS: (XsdSpec | SchematronSpec)[] = [
  {
    kind: 'sef',
    id: 'pint-shared-1.1.3',
    title: 'PINT 1.1.3 shared billing rules',
    layer: 'semantic',
    syntax: 'ubl',
    version: '1.1.3',
    releaseDate: '2026-06-05',
    effectiveFrom: '2026-06-05',
    effectiveUntil: null,
    upstream: 'https://docs.peppol.eu/poac/pint/pint/',
    license: 'Technical artifact redistribution grant unresolved; local evaluation only',
    note: 'Shared billing rules only. Jurisdiction-specific and self-billing rule suites are not covered; full-source validation remains incomplete. Source archive has no separate license file; do not infer permission from availability.',
    xslt: {
      archive: 'https://docs.peppol.eu/poac/pint/pint/resources.zip',
      archiveSha256: '1c47f68d8ee9682862112a57c9ffe6b73c1afe668a2dd4bd2b937b848c2408f6',
      path: 'trn-invoice/schematron/PINT-UBL-validation-preprocessed.xslt',
      sha256: '1b239af213b29f1127099bc0af7335689cfe45c6e6b11144f1316c52a0fed381',
    },
    entry: 'PINT-SHARED.sef.json.gz',
  },
  ...profileValidationSpecs,
  ...LEGACY_XSD_SPECS,
  ...REMAINING_LEGACY_XSD_SPECS,
  ...REMAINING_LEGACY_SEF_SPECS,
  ...PINT_SPECIALIZATION_SPECS,
  ...FRANCE_RFE_VALIDATION_SPECS,
  ...CFDI_XSD_SPECS,
  ...OIOUBL_VALIDATION_SPECS,
  ...(facturxSpecs as (XsdSpec | SchematronSpec)[]),
  {
    kind: 'sef',
    id: 'isdoc-6.0.2-rules',
    title: 'ISDOC 6.0.2 native rules',
    layer: 'profile',
    syntax: 'isdoc',
    version: '6.0.2',
    releaseDate: '2022-03-23',
    effectiveFrom: '2022-03-23',
    effectiveUntil: null,
    upstream: 'https://isdoc.cz/6.0.2/doc/isdoc.html',
    license: 'ISDOC authority source; redistribution terms unresolved',
    sch: {
      url: 'https://isdoc.cz/6.0.2/sch/isdoc-6.0.2.sch',
      sha256: 'a992ae3de6432b01d8c27ca86a10ff33b20a2efe9b5f88c9948d2479f2972ce3',
      replace: [
        [" satisfied $va = 'false'", " satisfies $va = 'false'"],
        ['isdoc:StoreBatch/isdoc:Quantity) satisfies', 'isdoc:StoreBatch/isdoc:Quantity satisfies'],
      ],
      derivedSha256: '0f9680bfabfcd063099a3ef7edaac5d3a386dc6e3cf6601f13631c3f1ce39a8d',
    },
    entry: 'ISDOC-6.0.2.sef.json.gz',
    note: 'Derived from selected native rules published by ISDOC: repaired satisfied to satisfies and removed an unmatched parenthesis in a quantified XPath assertion. Original and derived SCH retained with hashes. Local evaluation; an explicit redistribution grant has not been established.',
  },
  {
    kind: 'sef',
    id: 'en16931-ubl-1.3.16',
    title: 'EN 16931 UBL rules distributed with Peppol May 2026',
    layer: 'semantic',
    syntax: 'ubl',
    version: '1.3.16',
    releaseDate: '2026-04-10',
    effectiveFrom: '2026-08-17',
    effectiveUntil: null,
    license: 'EUPL-1.2',
    upstream: 'https://docs.peppol.eu/poacc/billing/3.0/upcoming/release-notes/',
    xslt: {
      archive: 'https://github.com/ConnectingEurope/eInvoicing-EN16931/releases/download/validation-1.3.16/en16931-ubl-1.3.16.zip',
      path: 'xslt/EN16931-UBL-validation.xslt',
    },
    entry: 'EN16931-UBL-validation.sef.json.gz',
  },
  {
    kind: 'sef',
    id: 'peppol-bis3-3.0.21-ubl',
    title: 'Peppol BIS Billing May 2026 UBL rules',
    layer: 'profile',
    syntax: 'ubl',
    version: '3.0.21',
    releaseDate: '2026-05-20',
    effectiveFrom: '2026-08-17',
    effectiveUntil: null,
    license: 'CEN reproduction permission stated in source; native artifact redistribution grant unresolved',
    upstream: 'https://docs.peppol.eu/poacc/billing/3.0/upcoming/release-notes/',
    sch: { url: `${MAY_2026}PEPPOL-EN16931-UBL.sch`, sha256: '62e5b67892f12755352d78b06f63229a02cc2eccc748677c56efbc8dbcb336e3' },
    entry: 'PEPPOL-EN16931-UBL.sef.json.gz',
    note: 'Peppol-specific rules; paired with the EN 1.3.16 artifact from the same May 2026 publication. Source hash pins the otherwise mutable upstream URL.',
  },
  {
    kind: 'xsd',
    id: 'xsd-ubl-2.1',
    title: 'OASIS UBL 2.1 XSD (Invoice, CreditNote)',
    layer: 'schema',
    syntax: 'ubl',
    version: '2.1',
    releaseDate: '2013-11-04',
    effectiveFrom: '2013-11-04',
    effectiveUntil: null,
    license: 'OASIS IPR policy (copyright notice kept in each file)',
    upstream: 'https://docs.oasis-open.org/ubl/os-UBL-2.1/',
    note: 'Invoice and CreditNote maindocs plus the common modules, as repackaged in the KoSIT XRechnung validator configuration (Apache-2.0).',
    archive: VC,
    copy: [
      { from: `${VC_PREFIX}ubl/2.1/xsd/common/`, to: 'common/', files: 'all' },
      { from: `${VC_PREFIX}ubl/2.1/xsd/maindoc/`, to: 'maindoc/', files: ['UBL-Invoice-2.1.xsd', 'UBL-CreditNote-2.1.xsd'] },
    ],
    entries: { Invoice: 'maindoc/UBL-Invoice-2.1.xsd', CreditNote: 'maindoc/UBL-CreditNote-2.1.xsd' },
  },
  {
    kind: 'xsd',
    id: 'xsd-cii-d16b',
    title: 'UN/CEFACT CrossIndustryInvoice D16B XSD',
    layer: 'schema',
    syntax: 'cii',
    version: '100.D16B',
    releaseDate: '2016-10-10',
    effectiveFrom: '2016-10-10',
    effectiveUntil: null,
    license: 'UN/CEFACT copyright notice (copying and derivative works permitted, notice kept in each file)',
    upstream: 'https://unece.org/trade/uncefact/xml-schemas',
    note: 'As repackaged in the KoSIT XRechnung validator configuration (Apache-2.0).',
    archive: VC,
    copy: [{ from: `${VC_PREFIX}cii/16b/xsd/`, to: '', files: 'all' }],
    entries: { CrossIndustryInvoice: 'CrossIndustryInvoice_100pD16B.xsd' },
  },
  {
    kind: 'sef',
    id: 'en16931-ubl-1.3.17',
    title: 'EN 16931 Schematron, UBL',
    layer: 'semantic',
    syntax: 'ubl',
    version: '1.3.17',
    releaseDate: '2026-10-12',
    effectiveFrom: '2026-10-12',
    effectiveUntil: null,
    license: 'EUPL-1.2',
    upstream: 'https://github.com/ConnectingEurope/eInvoicing-EN16931/releases/tag/validation-1.3.17',
    xslt: { archive: EN('ubl'), path: 'xslt/EN16931-UBL-validation.xslt' },
    entry: 'EN16931-UBL-validation.sef.json.gz',
  },
  {
    kind: 'sef',
    id: 'en16931-cii-1.3.17',
    title: 'EN 16931 Schematron, CII',
    layer: 'semantic',
    syntax: 'cii',
    version: '1.3.17',
    releaseDate: '2026-10-12',
    effectiveFrom: '2026-10-12',
    effectiveUntil: null,
    license: 'EUPL-1.2',
    upstream: 'https://github.com/ConnectingEurope/eInvoicing-EN16931/releases/tag/validation-1.3.17',
    xslt: { archive: EN('cii'), path: 'xslt/EN16931-CII-validation.xslt' },
    entry: 'EN16931-CII-validation.sef.json.gz',
  },
  {
    kind: 'sef',
    id: 'peppol-bis3-3.0.20-ubl',
    title: 'Peppol BIS Billing 3.0 Schematron, UBL',
    layer: 'profile',
    syntax: 'ubl',
    version: '3.0.20',
    releaseDate: '2026-03-16',
    effectiveFrom: '2026-03-16',
    effectiveUntil: null,
    license: 'CEN reproduction permission stated in source; native artifact redistribution grant unresolved',
    upstream: 'https://github.com/OpenPEPPOL/peppol-bis-invoice-3/releases/tag/v3.0.20',
    note: 'Peppol-specific rules only (PEPPOL-EN16931-*); the EN 16931 rules come from the semantic bundle.',
    sch: { url: PEPPOL('PEPPOL-EN16931-UBL.sch') },
    entry: 'PEPPOL-EN16931-UBL.sef.json.gz',
  },
  {
    kind: 'sef',
    id: 'xrechnung-3.0.2-ubl',
    title: 'XRechnung 3.0.2 Schematron 2.6.0, UBL',
    layer: 'profile',
    syntax: 'ubl',
    version: '2.6.0',
    releaseDate: '2026-09-02',
    effectiveFrom: '2026-09-02',
    effectiveUntil: null,
    license: 'Apache-2.0',
    upstream: 'https://github.com/itplr-kosit/xrechnung-schematron/releases/tag/v2.6.0',
    note: 'BR-DE rules only; the EN 16931 rules come from the semantic bundle.',
    xslt: { archive: XR, path: 'schematron/ubl/XRechnung-UBL-validation.xsl' },
    entry: 'XRechnung-UBL-validation.sef.json.gz',
  },
  {
    kind: 'sef',
    id: 'xrechnung-3.0.2-cii',
    title: 'XRechnung 3.0.2 Schematron 2.6.0, CII',
    layer: 'profile',
    syntax: 'cii',
    version: '2.6.0',
    releaseDate: '2026-09-02',
    effectiveFrom: '2026-09-02',
    effectiveUntil: null,
    license: 'Apache-2.0',
    upstream: 'https://github.com/itplr-kosit/xrechnung-schematron/releases/tag/v2.6.0',
    note: 'BR-DE rules only; the EN 16931 rules come from the semantic bundle.',
    xslt: { archive: XR, path: 'schematron/cii/XRechnung-CII-validation.xsl' },
    entry: 'XRechnung-CII-validation.sef.json.gz',
  },
];

// ---- National formats: the issuing authority's XSD, vendored unchanged except for offline imports ----
const XMLDSIG_W3C = 'http://www.w3.org/TR/2002/REC-xmldsig-core-20020212/xmldsig-core-schema.xsd';
const XMLDSIG_FETCH = 'https://www.w3.org/TR/2002/REC-xmldsig-core-20020212/xmldsig-core-schema.xsd';
const XMLDSIG_FACTURAE = 'http://www.w3.org/TR/xmldsig-core/xmldsig-core-schema.xsd';
const XMLDSIG_LOCAL = 'xmldsig-core-schema.xsd';
const xmldsig: FetchFile = { url: XMLDSIG_FETCH, to: XMLDSIG_LOCAL };
const VENDORED = '2026-10-16';
const OFFLINE = 'schemaLocation of imported schemas rewritten to the vendored copy so nothing is fetched at runtime';

const FATTURAPA = 'https://www.fatturapa.gov.it/export/documenti/fatturapa';
const SLAMDUNK =
  'https://raw.githubusercontent.com/Slamdunk/php-validatore-fattura-elettronica/da1986196bf8a9e993fcd33a059cf08aaca1bf36/xsd';
const ETD_BASE = 'http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/';
const ETD = (f: string) => `${ETD_BASE}${f}`;
const EBI = (v: string, f: string) =>
  `https://raw.githubusercontent.com/austriapro/ebinterface-standards/f7e4e4ec8778b7da2bc3468ed976a396fa8b6b29/schemas/ebInterface${v}/${f}`;
const FACTURAE = (v: string) => `https://www.facturae.gob.es/content/dam/facturae/formato/versiones/Facturaev${v}.xml`;

function national(
  id: string,
  title: string,
  family: string,
  version: string,
  date: string,
  upstream: string,
  license: string,
  note: string,
  fetch: FetchFile[],
  entries: Record<string, string>,
): XsdSpec {
  const patched = fetch.some((f) => f.replace?.length);
  return {
    kind: 'xsd',
    id,
    title,
    layer: 'schema',
    syntax: family,
    version,
    releaseDate: date,
    effectiveFrom: date,
    effectiveUntil: null,
    license,
    upstream,
    note: patched ? `${note} ${OFFLINE}.` : note,
    fetch,
    entries,
  };
}

const NO_LICENCE =
  'No licence text in the files; published by the issuing authority for implementers to validate against (see validation/NOTICE)';
const ksef = (id: string, title: string, ns: string, date: string, url: string) =>
  national(
    id,
    title,
    'ksef',
    ns,
    date,
    'https://www.gov.pl/web/finanse/krajowy-system-e-faktur',
    NO_LICENCE,
    'Ministry of Finance schema; releaseDate is the date in the schema namespace.',
    [
      { url, to: 'schemat.xsd', replace: [[ETD('StrukturyDanych_v10-0E.xsd'), 'StrukturyDanych_v10-0E.xsd']] },
      {
        url: ETD('StrukturyDanych_v10-0E.xsd'),
        to: 'StrukturyDanych_v10-0E.xsd',
        replace: [[ETD('ElementarneTypyDanych_v10-0E.xsd'), 'ElementarneTypyDanych_v10-0E.xsd']],
      },
      {
        url: ETD('ElementarneTypyDanych_v10-0E.xsd'),
        to: 'ElementarneTypyDanych_v10-0E.xsd',
        replace: [[ETD('KodyKrajow_v10-0E.xsd'), 'KodyKrajow_v10-0E.xsd']],
      },
      { url: ETD('KodyKrajow_v10-0E.xsd'), to: 'KodyKrajow_v10-0E.xsd' },
    ],
    { Faktura: 'schemat.xsd' },
  );
const facturae = (v: string, ver: string) =>
  national(
    `xsd-facturae-${ver}`,
    `Facturae ${ver} XSD`,
    'facturae',
    ver,
    VENDORED,
    'https://www.facturae.gob.es/formato/Paginas/version-3-2.aspx',
    NO_LICENCE,
    'releaseDate is the vendoring date: the schema carries no release date.',
    [{ url: FACTURAE(v), to: 'Facturae.xsd', replace: [[XMLDSIG_FACTURAE, XMLDSIG_LOCAL]] }, xmldsig],
    { Facturae: 'Facturae.xsd' },
  );
const ebinterface = (v: string, dots: string, ext: boolean) =>
  national(
    `xsd-ebinterface-${dots}`,
    `ebInterface ${dots} XSD`,
    'ebinterface',
    dots,
    VENDORED,
    'https://www.ebinterface.at/',
    NO_LICENCE,
    'AUSTRIAPRO development repository, pinned commit; releaseDate is the vendoring date.',
    ext
      ? [
          { url: EBI(v, 'Invoice.xsd'), to: 'Invoice.xsd', replace: [[XMLDSIG_W3C, XMLDSIG_LOCAL]] },
          { url: EBI(v, 'ebInterfaceExtension.xsd'), to: 'ebInterfaceExtension.xsd' },
          { url: EBI(v, 'ext/ebInterfaceExtension_SV.xsd'), to: 'ext/ebInterfaceExtension_SV.xsd' },
          xmldsig,
        ]
      : [{ url: EBI(v, 'Invoice.xsd'), to: 'Invoice.xsd' }],
    { Invoice: 'Invoice.xsd' },
  );

SPECS.push(
  national(
    'xsd-fatturapa-1.2.2',
    'FatturaPA 1.2.2 XSD (FPR12, FPA12)',
    'fatturapa',
    '1.2.2',
    '2022-08-02',
    'https://www.fatturapa.gov.it/it/norme-e-regole/documentazione-fattura-elettronica/formato-fatturapa/',
    NO_LICENCE,
    'Agenzia delle Entrate, Schema_VFPR12; releaseDate is the Last-Modified of the published file.',
    [
      { url: `${FATTURAPA}/v1.2.2/Schema_del_file_xml_FatturaPA_v1.2.2.xsd`, to: 'FatturaPA.xsd', replace: [[XMLDSIG_W3C, XMLDSIG_LOCAL]] },
      xmldsig,
    ],
    { FatturaElettronica: 'FatturaPA.xsd' },
  ),
  national(
    'xsd-fatturapa-semplificata-1.0',
    'FatturaPA semplificata 1.0 XSD (FSM10)',
    'fatturapa',
    '1.0',
    VENDORED,
    'https://www.fatturapa.gov.it/it/norme-e-regole/documentazione-fattura-elettronica/formato-fatturapa/',
    NO_LICENCE,
    'Agenzia delle Entrate, Schema_VFSM10. The authority no longer serves the file at a stable URL; this is the copy kept in the MIT-licensed Slamdunk/php-validatore-fattura-elettronica at a pinned commit. releaseDate is the vendoring date.',
    [{ url: `${SLAMDUNK}/Schema_VFSM10.xsd`, to: 'FatturaPASemplificata.xsd', replace: [[XMLDSIG_W3C, XMLDSIG_LOCAL]] }, xmldsig],
    { FatturaElettronicaSemplificata: 'FatturaPASemplificata.xsd' },
  ),
  ksef('xsd-ksef-fa2', 'KSeF FA(2) XSD', 'FA (2)', '2023-06-29', 'https://crd.gov.pl/wzor/2023/06/29/12648/schemat.xsd'),
  ksef('xsd-ksef-fa3', 'KSeF FA(3) XSD', 'FA (3)', '2025-06-25', 'https://crd.gov.pl/wzor/2025/06/25/13775/schemat.xsd'),
  ksef('xsd-ksef-fa-rr', 'KSeF FA_RR (1) XSD', 'FA_RR (1)', '2026-03-06', 'https://crd.gov.pl/wzor/2026/03/06/14189/schemat.xsd'),
  facturae('3_2', '3.2'),
  facturae('3_2_1', '3.2.1'),
  facturae('3_2_2', '3.2.2'),
  national(
    'xsd-isdoc-6.0.2',
    'ISDOC 6.0.2 XSD',
    'isdoc',
    '6.0.2',
    VENDORED,
    'https://isdoc.org/',
    'Permissive notice in the schema: use, copy, modify and distribute without fee, notice kept (SPIS, ICT UNIE, MVČR)',
    'Covers the 6.x line: the namespace and structure are shared. releaseDate is the vendoring date.',
    [{ url: 'https://isdoc.cz/6.0.2/xsd/isdoc-invoice-6.0.2.xsd', to: 'isdoc-invoice-6.0.2.xsd' }],
    { Invoice: 'isdoc-invoice-6.0.2.xsd' },
  ),
  ebinterface('4p3', '4.3', true),
  ebinterface('5p0', '5.0', false),
  ebinterface('6p0', '6.0', false),
  ebinterface('6p1', '6.1', false),
  national(
    'xsd-finvoice-3.0',
    'Finvoice 3.0 XSD',
    'finvoice',
    '3.0',
    '2020-12-17',
    'https://www.finanssiala.fi/en/topics/finvoice-standard',
    NO_LICENCE,
    'Finance Finland; releaseDate is the modification date in the file header.',
    [{ url: 'https://file.finanssiala.fi/finvoice/Finvoice3.0.xsd', to: 'Finvoice3.0.xsd' }],
    { Finvoice: 'Finvoice3.0.xsd' },
  ),
  national(
    'xsd-earve-1.2',
    'Estonian e-invoice (e-arve) 1.2.EN XSD',
    'earve',
    '1.2',
    '2018-08-28',
    'https://itl.ee/en/estonian-ict-cluster/real-time-economy/e-invoice-specification/',
    'Header of the file: "License rules: no"',
    'Estonian ICT Cluster. Schema 1.2.EN covers 1.2 documents (Header/Version stays 1.2). releaseDate is the schema date in the file header.',
    [{ url: 'https://wp.itl.ee/files/IoB/uued/e-invoice_ver1.2.EN.xsd', to: 'e-invoice_ver1.2.EN.xsd' }],
    { E_Invoice: 'e-invoice_ver1.2.EN.xsd' },
  ),
  national(
    'xsd-eslog-2.0',
    'eSLOG 2.0 INVOIC XSD',
    'eslog',
    '2.0',
    '2019-08-05',
    'https://www.epos.si/eslog',
    NO_LICENCE,
    'GZS / epos.si, package e-SLOG-2.0-08-2020-EN; releaseDate is the date of the schema inside the package. Includes the package xmldsig-core-schema.xsd.',
    [
      { url: 'https://epos.si/assets/docs/e-SLOG-2.0-08-2020-EN.zip', zipEntry: 'eSLOG20_INVOIC_v200.xsd', to: 'eSLOG20_INVOIC_v200.xsd' },
      { url: 'https://epos.si/assets/docs/e-SLOG-2.0-08-2020-EN.zip', zipEntry: 'xmldsig-core-schema.xsd', to: 'xmldsig-core-schema.xsd' },
    ],
    { Invoice: 'eSLOG20_INVOIC_v200.xsd' },
  ),
);

const SFTI_ARCHIVE = 'https://sfti.se/download/18.3a0a1c2218723106f76484f0/1680520279996/Svefaktura1_Arkiv%202023-02-23.zip';
const SFTI_HASH = '0c4cc8c519d3aa4111694cdd99f0fb1745c985ebbc0b10a8463aecd75e637bd1';
SPECS.push(
  {
    kind: 'xsd',
    id: 'xsd-svefaktura-1.0-20081227',
    title: 'SFTI Svefaktura 1.0 XSD',
    layer: 'schema',
    version: '1.0 (2008-12-27)',
    releaseDate: '2008-12-27',
    effectiveFrom: '2008-12-27',
    syntax: 'svefaktura',
    effectiveUntil: null,
    license:
      'SFTI-specific redistribution terms unresolved; OASIS notices retained; local evaluation only pending clarification (see validation/NOTICE)',
    upstream: 'https://sfti.se/download/18.3a0a1c2218723106f76484f0/1680520279996/Svefaktura1_Arkiv%202023-02-23.zip',
    note: 'Official SFTI legacy artifacts; redistribution grant unresolved. Source dates are artifact dates, not a claim of current tax-law coverage.',
    archive: SFTI_ARCHIVE,
    archiveSha256: SFTI_HASH,
    nestedArchive: { path: 'XML-Schema fr Svefaktura 1.0.zip', sha256: '7a40265edfb858b4f7959ce95a9853e21dffc515d39cf61fa31bb2f879439694' },
    copy: [
      { from: 'Svefaktura_xsd_20081227/common/', to: 'common/', files: 'all' },
      { from: 'Svefaktura_xsd_20081227/codelist/', to: 'codelist/', files: 'all' },
      { from: 'Svefaktura_xsd_20081227/maindoc/', to: 'maindoc/', files: ['SFTI-BasicInvoice-1.0.xsd'] },
    ],
    entries: { Invoice: 'maindoc/SFTI-BasicInvoice-1.0.xsd' },
  },
  {
    kind: 'sef',
    id: 'svefaktura-1.0-rules-20161025',
    title: 'SFTI Svefaktura 1.0 native rules (2016-10-25)',
    layer: 'profile',
    version: '2016-10-25',
    releaseDate: '2016-10-25',
    effectiveFrom: '2016-10-25',
    syntax: 'svefaktura',
    effectiveUntil: null,
    license:
      'SFTI-specific redistribution terms unresolved; OASIS notices retained; local evaluation only pending clarification (see validation/NOTICE)',
    upstream: 'https://sfti.se/download/18.3a0a1c2218723106f76484f0/1680520279996/Svefaktura1_Arkiv%202023-02-23.zip',
    note: 'Official SFTI legacy artifacts; redistribution grant unresolved. Source dates are artifact dates, not a claim of current tax-law coverage.',
    xslt: {
      archive: SFTI_ARCHIVE,
      archiveSha256: SFTI_HASH,
      path: 'Schematronregler fr Svefaktura 1.0 2016-10-25.xml',
      sha256: 'eba45f29bc6aff8b7339cd4368ef57a2ac549eae005290ad488d416dffb26b21',
    },
    entry: 'Svefaktura-1.0.sef.json.gz',
  },
);

SPECS.push(
  ...([
    {
      kind: 'sef',
      layer: 'profile',
      releaseDate: '2026-10-18',
      effectiveFrom: '2026-10-18',
      effectiveUntil: null,
      upstream: 'https://github.com/peppolautoriteit-nl/validation/tree/4e93ae8681f413fef627a338ad84ce465a153ee8',
      note: "Native-only NLCIUS pattern wrapped in a namespace-declaring Schematron schema without changing rules. EN core is separately paired at the publisher's pinned 1.3.16. Date is vendoring date; no exact release date established.",
      id: 'nlcius-ubl-2.0.3.13',
      title: 'NLCIUS SI-UBL 2.0.3.13 native rules',
      syntax: 'ubl',
      version: '2.0.3.13',
      license: 'MIT (Stichting Simplerinvoicing); see validation/NOTICE',
      sch: {
        url: 'https://raw.githubusercontent.com/peppolautoriteit-nl/validation/4e93ae8681f413fef627a338ad84ce465a153ee8/schematron/si-ubl-2.0/si-ubl-2.0-nlcius.sch',
        sha256: '218d3ddc898915506f71d44bb3fe3977acbb953ec93143b27e56fc0eae68cda5',
        patternNamespaces: {
          qdt: 'urn:un:unece:uncefact:data:standard:QualifiedDataType:100',
          xs: 'http://www.w3.org/2001/XMLSchema',
          cn: 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
          ubl: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
          cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
          cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
        },
      },
      entry: 'NLCIUS-UBL.sef.json.gz',
    },
    {
      kind: 'sef',
      layer: 'profile',
      releaseDate: '2026-10-18',
      effectiveFrom: '2026-10-18',
      effectiveUntil: null,
      upstream: 'https://github.com/peppolautoriteit-nl/validation/tree/4e93ae8681f413fef627a338ad84ce465a153ee8',
      note: "Native-only NLCIUS pattern wrapped in a namespace-declaring Schematron schema without changing rules. EN core is separately paired at the publisher's pinned 1.3.16. Date is vendoring date; no exact release date established.",
      id: 'nlcius-cii-1.0.3.13',
      title: 'NLCIUS CII 1.0.3.13 native rules',
      syntax: 'cii',
      version: '1.0.3.13',
      license: 'EUPL-1.2 (explicit native CII source notice); repository MIT notice also retained',
      sch: {
        url: 'https://raw.githubusercontent.com/peppolautoriteit-nl/validation/4e93ae8681f413fef627a338ad84ce465a153ee8/schematron/nlcius-cii/NLCIUS-CII-validation.sch',
        sha256: '283be2f95249204badd8a408615613c52acce8806ce6cf8370371779226f14fc',
        patternNamespaces: {
          qdt: 'urn:un:unece:uncefact:data:standard:QualifiedDataType:100',
          xs: 'http://www.w3.org/2001/XMLSchema',
          cn: 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
          ubl: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
          ram: 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
          rsm: 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
          udt: 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100',
        },
      },
      entry: 'NLCIUS-CII.sef.json.gz',
    },
    {
      kind: 'sef',
      id: 'en16931-cii-1.3.16',
      title: 'EN 16931 CII core paired with NLCIUS',
      layer: 'semantic',
      syntax: 'cii',
      version: '1.3.16',
      releaseDate: '2026-04-10',
      effectiveFrom: '2026-04-10',
      effectiveUntil: null,
      license: 'EUPL-1.2',
      upstream: 'https://github.com/ConnectingEurope/eInvoicing-EN16931/releases/tag/validation-1.3.16',
      xslt: {
        archive: 'https://github.com/ConnectingEurope/eInvoicing-EN16931/releases/download/validation-1.3.16/en16931-cii-1.3.16.zip',
        path: 'xslt/EN16931-CII-validation.xslt',
      },
      entry: 'EN16931-CII-validation.sef.json.gz',
    },
  ] as (XsdSpec | SchematronSpec)[]),
);

SPECS.push({
  kind: 'xsd',
  id: 'xsd-teappsxml-3.0',
  title: 'Tieto TEAPPSXML 3.0 invoice XSD',
  layer: 'schema',
  syntax: 'teappsxml',
  version: '3.0',
  releaseDate: '2019-09-30',
  effectiveFrom: '2019-09-30',
  effectiveUntil: null,
  license:
    'Copyright Tieto Finland Oy, Value Networks; redistribution terms unresolved, local evaluation only pending clarification (see validation/NOTICE)',
  upstream: 'https://www.tieto.com/en/campaign/2026/teappsxml/',
  note: 'Official standalone schema header: TEAPPSXML v.3.0 26.3.2018 updated 30.9.2019 ROUNDINGS pattern. No imports or includes. Source XSD only; no claim of EN16931 compliance or authority acceptance.',
  fetch: [
    {
      url: 'https://www.tieto.com/siteassets/04-indtech/teappsxml/teappsxmlv30_schema_invoices.xsd',
      to: 'teappsxml-3.0.xsd',
      sha256: '0175e0977828ab9d008ba65c5d04ac0b9577a60fe26cac69eb03feb5518d20cd',
    },
  ],
  entries: {
    INVOICE_CENTER: 'teappsxml-3.0.xsd',
  },
});

const sources = new Map<string, Promise<{ bytes: Uint8Array; sha256: string }>>();
const restoreHeld = process.argv.includes('--restore-held');
const sourcePins: Record<string, string> | undefined = restoreHeld
  ? JSON.parse(readFileSync(join(root, 'validation/local-source-pins.json'), 'utf8'))
  : undefined;
function download(url: string) {
  let p = sources.get(url);
  if (!p) {
    p = (async () => {
      let res = await fetchSource(url);
      // crd.gov.pl answers 503 now and then.
      for (let i = 0; i < 6 && res.status >= 500; i++) {
        await Bun.sleep(3000);
        res = await fetchSource(url);
      }
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const sha256 = await sha256Hex(bytes);
      if (sourcePins && sourcePins[url] !== sha256) throw new Error(`Local validation source is unpinned or changed: ${url}`);
      return { bytes, sha256 };
    })();
    sources.set(url, p);
  }
  return p;
}

const archives = new Map<string, Record<string, Uint8Array>>();
async function archive(url: string) {
  let files = archives.get(url);
  if (!files) {
    files = unzipSync((await download(url)).bytes);
    archives.set(url, files);
  }
  return files;
}

function run(args: string[]) {
  // Large official Schematron sources exceed Bun's compiler recursion depth.
  const r = Bun.spawnSync(['node', '--stack_size=32768', xslt3, ...args], { stdout: 'pipe', stderr: 'pipe' });
  if (r.exitCode !== 0) throw new Error(`xslt3 ${args.join(' ')}\n${r.stdout}${r.stderr}`);
}

async function compileSef(xsltPath: string, out: string) {
  run([`-xsl:${xsltPath}`, `-export:${out}`, '-t', '-nogo']);
  return gzipSync(readFileSync(out), { level: 9, mtime: 0 });
}

async function buildSchematron(
  spec: SchematronSpec,
  tmp: string,
): Promise<{ files: Record<string, Uint8Array>; source: { url: string; sha256: string }[] }> {
  const source: { url: string; sha256: string }[] = [];
  const evidence: Record<string, Uint8Array> = {};
  let xsltPath: string;
  if (spec.xsltFile) {
    const original = await download(spec.xsltFile.url);
    const codes = await download(spec.xsltFile.codeDb.url);
    if (original.sha256 !== spec.xsltFile.sha256 || codes.sha256 !== spec.xsltFile.codeDb.sha256)
      throw new Error('Factur-X source hash mismatch');
    const derived = new TextEncoder().encode(
      inlineFacturxCodeDb(new TextDecoder().decode(original.bytes), new TextDecoder().decode(codes.bytes), spec.xsltFile.codeDb.filename),
    );
    if ((await sha256Hex(derived)) !== spec.xsltFile.derivedSha256) throw new Error('Factur-X derived source hash mismatch');
    source.push({ url: spec.xsltFile.url, sha256: original.sha256 }, { url: spec.xsltFile.codeDb.url, sha256: codes.sha256 });
    evidence['original-source.xslt'] = original.bytes;
    evidence['code-database.xml'] = codes.bytes;
    evidence['derived-source.xslt'] = derived;
    xsltPath = join(tmp, 'in.xslt');
    writeFileSync(xsltPath, derived);
  } else if (spec.xslt) {
    const original = await download(spec.xslt.archive);
    if (spec.xslt.archiveSha256 && original.sha256 !== spec.xslt.archiveSha256) throw new Error('SFTI archive hash mismatch');
    const files = await archive(spec.xslt.archive);
    const bytes = files[spec.xslt.path];
    if (!bytes) throw new Error(`${spec.xslt.path} not in ${spec.xslt.archive}`);
    for (const extra of spec.xslt.additionalFiles ?? []) {
      const content = files[extra.path];
      if (!content || extra.to.includes('..') || extra.to.includes('/') || extra.to.includes('\\'))
        throw new Error('Invalid extra source file');
      evidence[extra.to] = content;
    }
    if (spec.xslt.sha256 && (await sha256Hex(bytes)) !== spec.xslt.sha256) throw new Error('XSLT source hash mismatch');
    source.push({ url: `${spec.xslt.archive}#${encodeURIComponent(spec.xslt.path)}`, sha256: await sha256Hex(bytes) });
    source.push({ url: spec.xslt.archive, sha256: (await download(spec.xslt.archive)).sha256 });
    xsltPath = join(tmp, 'in.xslt');
    writeFileSync(xsltPath, bytes);
    if (spec.xslt.reportFormat === 'oioubl2' || spec.xslt.reportFormat === 'oioubl202') {
      const compatible = spec.xslt.reportFormat === 'oioubl202' ? oioubl202CompatibleSource(bytes) : undefined;
      const importFile = compatible ? 'oioubl2-compatible.xslt' : 'oioubl2-original.xslt';
      const wrapper = new TextEncoder().encode(
        oioubl2SvrlWrapper(importFile, spec.xslt.reportFormat === 'oioubl202' ? 'prefixed' : 'fatal'),
      );
      evidence['original-source.xslt'] = bytes;
      if (compatible) evidence['compatibility-source.xslt'] = compatible;
      evidence['derived-source.xslt'] = wrapper;
      writeFileSync(join(tmp, importFile), compatible ?? bytes);
      writeFileSync(xsltPath, wrapper);
    }
  } else {
    let sch = await download(spec.sch!.url);
    if (spec.sch!.sha256 && spec.sch!.sha256 !== sch.sha256) throw new Error(`Source changed: ${spec.sch!.url}`);
    source.push({ url: spec.sch!.url, sha256: sch.sha256 });
    let schPath = join(tmp, '0.sch');
    if (spec.sch!.zipEntry) {
      const closure = unzipSync(sch.bytes);
      const entry = spec.sch!.zipEntry!;
      const bytes = closure[entry];
      if (!bytes) throw new Error(`Schematron entry missing: ${entry}`);
      for (const [path, file] of Object.entries(closure)) {
        if (path.startsWith('/') || path.includes('\\') || path.split('/').includes('..'))
          throw new Error('Unsafe Schematron archive path');
        if (path.endsWith('/')) continue;
        const target = join(tmp, 'sch-source', path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, file);
      }
      schPath = join(tmp, 'sch-source', entry);
      sch = { bytes, sha256: await sha256Hex(bytes) };
      source.push({ url: `${spec.sch!.url}#${encodeURIComponent(entry)}`, sha256: sch.sha256 });
    }
    const skel = join(tmp, 'skel');
    mkdirSync(skel);
    for (const f of [
      'iso_dsdl_include.xsl',
      'iso_abstract_expand.xsl',
      'iso_schematron_skeleton_for_saxon.xsl',
      'iso_svrl_for_xslt2.xsl',
    ]) {
      const dl = await download(SKELETON(f));
      writeFileSync(join(skel, f), dl.bytes);
      source.push({ url: SKELETON(f), sha256: dl.sha256 });
    }
    const namespaces = spec.sch!.patternNamespaces;
    let schBytes = sch.bytes;
    if (spec.sch!.bis2CoreEntry) {
      const coreEntry = spec.sch!.bis2CoreEntry!;
      if (coreEntry.startsWith('/') || coreEntry.includes('\\') || coreEntry.split('/').includes('..'))
        throw new Error('Unsafe BIS2 core archive path');
      const core = new Uint8Array(readFileSync(join(tmp, 'sch-source', coreEntry)));
      schBytes = combineBis2Core(sch.bytes, core);
      evidence['original-source.sch'] = sch.bytes;
      evidence['original-core.sch'] = core;
      source.push({ url: `${spec.sch!.url}#${encodeURIComponent(coreEntry)}`, sha256: await sha256Hex(core) });
    }
    if (spec.sch!.bis2Inline) {
      const fragments: Record<string, Uint8Array> = {};
      for (const [index, fragment] of bis2Includes(schBytes).entries()) {
        const bytes = new Uint8Array(readFileSync(join(dirname(schPath), fragment.href)));
        fragments[fragment.href] = bytes;
        evidence[`original-include-${index}.sch`] = bytes;
        source.push({
          url: `${spec.sch!.url}#${encodeURIComponent(join(dirname(spec.sch!.zipEntry!), fragment.href))}`,
          sha256: await sha256Hex(bytes),
        });
      }
      schBytes = inlineBis2Includes(schBytes, fragments);
    }
    if (spec.sch!.bis2MimeMembership) schBytes = bis2MimeMembership(schBytes);
    if (spec.sch!.bis2CoreEntry || spec.sch!.bis2Inline) {
      if (!spec.sch!.derivedSha256 || (await sha256Hex(schBytes)) !== spec.sch!.derivedSha256)
        throw new Error('Derived BIS2 Schematron hash mismatch');
      evidence['original-source.sch'] = sch.bytes;
      evidence['derived-source.sch'] = schBytes;
    }
    if (spec.sch!.pintEuCombined) {
      const jurisdictionPath = join(dirname(schPath), 'PINT-jurisdiction-aligned-rules.sch');
      const jurisdiction = new Uint8Array(readFileSync(jurisdictionPath));
      schBytes = combinePintEuSchematrons(sch.bytes, jurisdiction);
      if (!spec.sch!.derivedSha256 || (await sha256Hex(schBytes)) !== spec.sch!.derivedSha256)
        throw new Error('Derived PINT EU Schematron hash mismatch');
      evidence['original-en-aligned.sch'] = sch.bytes;
      evidence['original-jurisdiction.sch'] = jurisdiction;
      evidence['derived-source.sch'] = schBytes;
      source.push({
        url: `${spec.sch!.url}#${encodeURIComponent('trn-invoice/schematron/PINT-jurisdiction-aligned-rules.sch')}`,
        sha256: await sha256Hex(jurisdiction),
      });
    }
    if (spec.sch!.replace?.length) {
      let corrected = new TextDecoder().decode(sch.bytes);
      for (const [from, to] of spec.sch!.replace!) {
        if (corrected.split(from).length !== 2) throw new Error('Schematron correction must match exactly once');
        corrected = corrected.replace(from, to);
      }
      schBytes = new TextEncoder().encode(corrected);
      if (!spec.sch!.derivedSha256 || (await sha256Hex(schBytes)) !== spec.sch!.derivedSha256)
        throw new Error('Derived Schematron hash mismatch');
      evidence['original-source.sch'] = sch.bytes;
      evidence['derived-source.sch'] = schBytes;
    }
    let input = namespaces
      ? new TextEncoder().encode(
          `<schema xmlns="http://purl.oclc.org/dsdl/schematron" queryBinding="xslt2">${Object.entries(namespaces)
            .map(([prefix, uri]) => `<ns prefix="${prefix}" uri="${uri}"/>`)
            .join('')}${new TextDecoder()
            .decode(schBytes)
            .replace(/^\uFEFF/, '')
            .replace(/^\s*<\?xml[^?]*\?>/, '')}</schema>`,
        )
      : schBytes;
    const hr = spec.id === 'hr-cius-ext-ubl-20260313';
    const pt = spec.id === 'cius-pt-ubl-2.1.1';
    const ro = spec.id === 'cius-ro-ubl-1.0.9';
    if (hr) {
      const codes = new Uint8Array(readFileSync(join(dirname(schPath), 'codelist/HR-CIUS-EXT-EN16931-UBL-codes.sch')));
      input = new TextEncoder().encode(inlineHrSchematron(new TextDecoder().decode(input), new TextDecoder().decode(codes)));
      evidence['original-source.sch'] = sch.bytes;
      evidence['original-codelist.sch'] = codes;
      evidence['derived-source.sch'] = input;
    }
    if (pt || ro) {
      input = new TextEncoder().encode(ro ? expandRoSchematron(schPath) : expandPtSchematron(schPath));
      evidence['original-source.sch'] = sch.bytes;
      evidence['derived-source.sch'] = input;
    }
    writeFileSync(schPath, input);
    if (!hr && !pt && !ro) {
      if (!spec.sch!.bis2Inline) run([`-xsl:${skel}/iso_dsdl_include.xsl`, `-s:${schPath}`, `-o:${tmp}/1.sch`]);
      run([`-xsl:${skel}/iso_abstract_expand.xsl`, `-s:${spec.sch!.bis2Inline ? schPath : `${tmp}/1.sch`}`, `-o:${tmp}/2.sch`]);
    }
    xsltPath = join(tmp, 'in.xslt');
    run([
      `-xsl:${skel}/iso_svrl_for_xslt2.xsl`,
      `-s:${hr || pt || ro ? schPath : `${tmp}/2.sch`}`,
      `-o:${xsltPath}`,
      'allow-foreign=true',
      ...(spec.sch!.selectContexts ? [`select-contexts=${spec.sch!.selectContexts}`] : []),
      ...(spec.sch!.phase ? [`phase=${spec.sch!.phase}`] : []),
    ]);
  }
  return { files: { ...evidence, [spec.entry]: await compileSef(xsltPath, join(tmp, 'out.sef.json')) }, source };
}

async function buildXsd(spec: XsdSpec): Promise<{ files: Record<string, Uint8Array>; source: { url: string; sha256: string }[] }> {
  const files: Record<string, Uint8Array> = {};
  const source: { url: string; sha256: string }[] = [];
  const seen = (url: string, sha256: string) => {
    if (!source.some((s) => s.url === url)) source.push({ url, sha256 });
  };
  if (spec.archive) {
    const original = await download(spec.archive);
    if (spec.archiveSha256 && original.sha256 !== spec.archiveSha256) throw new Error('Archive hash mismatch');
    let arc = await archive(spec.archive);
    if (spec.nestedArchive) {
      const bytes = arc[spec.nestedArchive.path];
      if (!bytes || (await sha256Hex(bytes)) !== spec.nestedArchive.sha256) throw new Error('Nested archive hash mismatch');
      source.push({ url: `${spec.archive}#${encodeURIComponent(spec.nestedArchive.path)}`, sha256: await sha256Hex(bytes) });
      arc = unzipSync(bytes);
    }
    for (const c of spec.copy ?? []) {
      const names = Object.keys(arc).filter((n) => n.startsWith(c.from) && !n.endsWith('/') && !n.slice(c.from.length).includes('/'));
      for (const n of names) {
        const rel = n.slice(c.from.length);
        if (c.files === 'all' || c.files.includes(rel)) files[c.to + rel] = arc[n];
      }
      if (c.files !== 'all') for (const f of c.files) if (!files[c.to + f]) throw new Error(`${f} not found under ${c.from}`);
    }
    seen(spec.archive, (await download(spec.archive)).sha256);
  }
  for (const f of spec.fetch ?? []) {
    const dl = await download(f.url);
    seen(f.url, dl.sha256);
    if (f.sha256 && f.sha256 !== dl.sha256) throw new Error(`Source changed: ${f.url}`);
    let bytes = dl.bytes;
    if (f.zipEntry) {
      const entry = (await archive(f.url))[f.zipEntry];
      if (!entry) throw new Error(`${f.zipEntry} not in ${f.url}`);
      bytes = entry;
    }
    if (f.replace?.length) {
      let text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
      for (const [from, to] of f.replace) {
        if (!text.includes(from)) throw new Error(`${f.to}: ${from} not found`);
        text = text.replaceAll(from, to);
      }
      bytes = new TextEncoder().encode(text);
    }
    files[f.to] = bytes;
  }
  for (const [path, content] of Object.entries(spec.generated ?? {})) {
    if (files[path]) throw new Error(`Generated schema collides with vendor file: ${path}`);
    files[path] = new TextEncoder().encode(content);
  }
  return { files, source };
}

if (restoreHeld && process.argv.length !== 3) throw new Error('--restore-held cannot be combined with bundle IDs');
const only = new Set(
  restoreHeld
    ? Object.entries(loadDistribution(root).bundles)
        .filter(([, decision]) => !decision.publish)
        .map(([id]) => id)
    : process.argv.slice(2),
);
for (const id of only) if (!SPECS.some((spec) => spec.id === id)) throw new Error(`Unknown bundle: ${id}`);
for (const spec of SPECS) {
  if (only.size && !only.has(spec.id)) continue;
  const tmp = mkdtempSync(join(tmpdir(), 'bundle-'));
  try {
    console.log(`Building ${spec.id}`);
    const { files, source } = spec.kind === 'xsd' ? await buildXsd(spec) : await buildSchematron(spec, tmp);
    await addDistributionEvidence(spec.id, files, source, { download, archive });
    const dir = join(bundlesDir, spec.id);
    rmSync(dir, { recursive: true, force: true });
    const listed: { path: string; sha256: string; bytes: number }[] = [];
    for (const path of Object.keys(files).sort()) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), files[path]);
      listed.push({ path, sha256: await sha256Hex(files[path]), bytes: files[path].byteLength });
    }
    const {
      kind,
      archive: _a,
      archiveSha256: _ah,
      nestedArchive: _na,
      copy: _c,
      fetch: fetched,
      generated: generatedFiles,
      xslt: _x,
      xsltFile: _xf,
      sch: _s,
      entries,
      entry,
      ...meta
    } = spec as unknown as Record<string, any>;
    const modified = ((fetched ?? []) as FetchFile[]).filter((f) => f.replace?.length).map((f) => f.to);
    const manifest = {
      ...meta,
      ...(licenseMetadata[spec.id] ? { license: licenseMetadata[spec.id] } : {}),
      format: kind,
      ...(kind === 'xsd' ? { entries } : { entry }),
      ...(modified.length ? { modifiedFiles: modified } : {}),
      ...(generatedFiles ? { generatedFiles: Object.keys(generatedFiles) } : {}),
      source,
      files: listed,
    };
    writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`  ${listed.length} files, ${listed.reduce((n, f) => n + f.bytes, 0)} bytes`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
