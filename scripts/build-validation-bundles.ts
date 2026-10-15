/**
 * Rebuilds validation/bundles/ from the pinned upstream releases:
 *   bun scripts/build-validation-bundles.ts [bundle-id ...]
 *
 * Needs network access and the xslt3 dev dependency (SaxonJS compiler, no Java). The bundles are
 * committed, so this only runs when a bundle is added or bumped. Afterwards run
 * `bun run verify:bundles` and review the diff of validation/bundles/*\/manifest.json.
 *
 * Schematron is compiled ahead of time to SaxonJS SEF (gzipped); XSDs are copied as they are.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gzipSync, unzipSync } from 'fflate';
import { sha256Hex } from '../src/hash.js';

const root = join(import.meta.dir, '..');
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
  /** Archive path prefix -> files to copy, relative to that prefix. entry is relative to the bundle dir. */
  copy?: { from: string; to: string; files: string[] | 'all' }[];
  /** Single files, each downloaded as it is (or taken from a zip) and optionally patched to resolve imports offline. */
  fetch?: FetchFile[];
  entries: Record<string, string>;
}

interface FetchFile {
  url: string;
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
  xslt?: { archive: string; path: string };
  sch?: { url: string };
  entry: string;
}

const VC =
  'https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/download/v2026-08-31/xrechnung-3.0.2-validator-configuration-2026-08-31.zip';
const VC_PREFIX = 'resources/';
const EN = (syntax: string) =>
  `https://github.com/ConnectingEurope/eInvoicing-EN16931/releases/download/validation-1.3.17/en16931-${syntax}-1.3.17.zip`;
const XR = 'https://github.com/itplr-kosit/xrechnung-schematron/releases/download/v2.6.0/xrechnung-3.0.2-schematron-2.6.0.zip';
const PEPPOL = (f: string) => `https://raw.githubusercontent.com/OpenPEPPOL/peppol-bis-invoice-3/v3.0.20/rules/sch/${f}`;

const SPECS: (XsdSpec | SchematronSpec)[] = [
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
    license: 'EUPL-1.2',
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

const sources = new Map<string, Promise<{ bytes: Uint8Array; sha256: string }>>();
function download(url: string) {
  let p = sources.get(url);
  if (!p) {
    p = (async () => {
      let res = await fetch(url);
      // crd.gov.pl answers 503 now and then.
      for (let i = 0; i < 6 && res.status >= 500; i++) {
        await Bun.sleep(3000);
        res = await fetch(url);
      }
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      return { bytes, sha256: await sha256Hex(bytes) };
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
  const r = Bun.spawnSync(['bun', xslt3, ...args], { stdout: 'pipe', stderr: 'pipe' });
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
  let xsltPath: string;
  if (spec.xslt) {
    const files = await archive(spec.xslt.archive);
    const bytes = files[spec.xslt.path];
    if (!bytes) throw new Error(`${spec.xslt.path} not in ${spec.xslt.archive}`);
    source.push({ url: spec.xslt.archive, sha256: (await download(spec.xslt.archive)).sha256 });
    xsltPath = join(tmp, 'in.xslt');
    writeFileSync(xsltPath, bytes);
  } else {
    const sch = await download(spec.sch!.url);
    source.push({ url: spec.sch!.url, sha256: sch.sha256 });
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
    writeFileSync(join(tmp, '0.sch'), sch.bytes);
    run([`-xsl:${skel}/iso_dsdl_include.xsl`, `-s:${tmp}/0.sch`, `-o:${tmp}/1.sch`]);
    run([`-xsl:${skel}/iso_abstract_expand.xsl`, `-s:${tmp}/1.sch`, `-o:${tmp}/2.sch`]);
    xsltPath = join(tmp, 'in.xslt');
    run([`-xsl:${skel}/iso_svrl_for_xslt2.xsl`, `-s:${tmp}/2.sch`, `-o:${xsltPath}`, 'allow-foreign=true']);
  }
  return { files: { [spec.entry]: await compileSef(xsltPath, join(tmp, 'out.sef.json')) }, source };
}

async function buildXsd(spec: XsdSpec): Promise<{ files: Record<string, Uint8Array>; source: { url: string; sha256: string }[] }> {
  const files: Record<string, Uint8Array> = {};
  const source: { url: string; sha256: string }[] = [];
  const seen = (url: string, sha256: string) => {
    if (!source.some((s) => s.url === url)) source.push({ url, sha256 });
  };
  if (spec.archive) {
    const arc = await archive(spec.archive);
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
  return { files, source };
}

const only = new Set(process.argv.slice(2));
for (const spec of SPECS) {
  if (only.size && !only.has(spec.id)) continue;
  const tmp = mkdtempSync(join(tmpdir(), 'bundle-'));
  try {
    console.log(`Building ${spec.id}`);
    const { files, source } = spec.kind === 'xsd' ? await buildXsd(spec) : await buildSchematron(spec, tmp);
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
      copy: _c,
      fetch: fetched,
      xslt: _x,
      sch: _s,
      entries,
      entry,
      ...meta
    } = spec as unknown as Record<string, any>;
    const modified = ((fetched ?? []) as FetchFile[]).filter((f) => f.replace?.length).map((f) => f.to);
    const manifest = {
      ...meta,
      format: kind,
      ...(kind === 'xsd' ? { entries } : { entry }),
      ...(modified.length ? { modifiedFiles: modified } : {}),
      source,
      files: listed,
    };
    writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`  ${listed.length} files, ${listed.reduce((n, f) => n + f.bytes, 0)} bytes`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
