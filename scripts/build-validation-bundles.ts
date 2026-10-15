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
  syntax: 'ubl' | 'cii';
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
  archive: string;
  /** Archive path prefix -> files to copy, relative to that prefix. entry is relative to the bundle dir. */
  copy: { from: string; to: string; files: string[] | 'all' }[];
  entries: Record<string, string>;
}

interface SchematronSpec extends Common {
  kind: 'sef';
  /** An XSLT 2.0 stylesheet already compiled from the Schematron, or the .sch to compile here. */
  xslt?: { archive: string; path: string };
  sch?: { url: string };
  entry: string;
}

const VC = 'https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/download/v2026-08-31/xrechnung-3.0.2-validator-configuration-2026-08-31.zip';
const VC_PREFIX = 'resources/';
const EN = (syntax: string) => `https://github.com/ConnectingEurope/eInvoicing-EN16931/releases/download/validation-1.3.17/en16931-${syntax}-1.3.17.zip`;
const XR = 'https://github.com/itplr-kosit/xrechnung-schematron/releases/download/v2.6.0/xrechnung-3.0.2-schematron-2.6.0.zip';
const PEPPOL = (f: string) => `https://raw.githubusercontent.com/OpenPEPPOL/peppol-bis-invoice-3/v3.0.20/rules/sch/${f}`;

const SPECS: (XsdSpec | SchematronSpec)[] = [
  {
    kind: 'xsd', id: 'xsd-ubl-2.1', title: 'OASIS UBL 2.1 XSD (Invoice, CreditNote)', layer: 'schema', syntax: 'ubl',
    version: '2.1', releaseDate: '2013-11-04', effectiveFrom: '2013-11-04', effectiveUntil: null,
    license: 'OASIS IPR policy (copyright notice kept in each file)', upstream: 'https://docs.oasis-open.org/ubl/os-UBL-2.1/',
    note: 'Invoice and CreditNote maindocs plus the common modules, as repackaged in the KoSIT XRechnung validator configuration (Apache-2.0).',
    archive: VC,
    copy: [
      { from: `${VC_PREFIX}ubl/2.1/xsd/common/`, to: 'common/', files: 'all' },
      { from: `${VC_PREFIX}ubl/2.1/xsd/maindoc/`, to: 'maindoc/', files: ['UBL-Invoice-2.1.xsd', 'UBL-CreditNote-2.1.xsd'] },
    ],
    entries: { Invoice: 'maindoc/UBL-Invoice-2.1.xsd', CreditNote: 'maindoc/UBL-CreditNote-2.1.xsd' },
  },
  {
    kind: 'xsd', id: 'xsd-cii-d16b', title: 'UN/CEFACT CrossIndustryInvoice D16B XSD', layer: 'schema', syntax: 'cii',
    version: '100.D16B', releaseDate: '2016-10-10', effectiveFrom: '2016-10-10', effectiveUntil: null,
    license: 'UN/CEFACT copyright notice (copying and derivative works permitted, notice kept in each file)', upstream: 'https://unece.org/trade/uncefact/xml-schemas',
    note: 'As repackaged in the KoSIT XRechnung validator configuration (Apache-2.0).',
    archive: VC, copy: [{ from: `${VC_PREFIX}cii/16b/xsd/`, to: '', files: 'all' }],
    entries: { CrossIndustryInvoice: 'CrossIndustryInvoice_100pD16B.xsd' },
  },
  {
    kind: 'sef', id: 'en16931-ubl-1.3.17', title: 'EN 16931 Schematron, UBL', layer: 'semantic', syntax: 'ubl',
    version: '1.3.17', releaseDate: '2026-10-12', effectiveFrom: '2026-10-12', effectiveUntil: null,
    license: 'EUPL-1.2', upstream: 'https://github.com/ConnectingEurope/eInvoicing-EN16931/releases/tag/validation-1.3.17',
    xslt: { archive: EN('ubl'), path: 'xslt/EN16931-UBL-validation.xslt' }, entry: 'EN16931-UBL-validation.sef.json.gz',
  },
  {
    kind: 'sef', id: 'en16931-cii-1.3.17', title: 'EN 16931 Schematron, CII', layer: 'semantic', syntax: 'cii',
    version: '1.3.17', releaseDate: '2026-10-12', effectiveFrom: '2026-10-12', effectiveUntil: null,
    license: 'EUPL-1.2', upstream: 'https://github.com/ConnectingEurope/eInvoicing-EN16931/releases/tag/validation-1.3.17',
    xslt: { archive: EN('cii'), path: 'xslt/EN16931-CII-validation.xslt' }, entry: 'EN16931-CII-validation.sef.json.gz',
  },
  {
    kind: 'sef', id: 'peppol-bis3-3.0.20-ubl', title: 'Peppol BIS Billing 3.0 Schematron, UBL', layer: 'profile', syntax: 'ubl',
    version: '3.0.20', releaseDate: '2026-03-16', effectiveFrom: '2026-03-16', effectiveUntil: null,
    license: 'EUPL-1.2', upstream: 'https://github.com/OpenPEPPOL/peppol-bis-invoice-3/releases/tag/v3.0.20',
    note: 'Peppol-specific rules only (PEPPOL-EN16931-*); the EN 16931 rules come from the semantic bundle.',
    sch: { url: PEPPOL('PEPPOL-EN16931-UBL.sch') }, entry: 'PEPPOL-EN16931-UBL.sef.json.gz',
  },
  {
    kind: 'sef', id: 'xrechnung-3.0.2-ubl', title: 'XRechnung 3.0.2 Schematron 2.6.0, UBL', layer: 'profile', syntax: 'ubl',
    version: '2.6.0', releaseDate: '2026-09-02', effectiveFrom: '2026-09-02', effectiveUntil: null,
    license: 'Apache-2.0', upstream: 'https://github.com/itplr-kosit/xrechnung-schematron/releases/tag/v2.6.0',
    note: 'BR-DE rules only; the EN 16931 rules come from the semantic bundle.',
    xslt: { archive: XR, path: 'schematron/ubl/XRechnung-UBL-validation.xsl' }, entry: 'XRechnung-UBL-validation.sef.json.gz',
  },
  {
    kind: 'sef', id: 'xrechnung-3.0.2-cii', title: 'XRechnung 3.0.2 Schematron 2.6.0, CII', layer: 'profile', syntax: 'cii',
    version: '2.6.0', releaseDate: '2026-09-02', effectiveFrom: '2026-09-02', effectiveUntil: null,
    license: 'Apache-2.0', upstream: 'https://github.com/itplr-kosit/xrechnung-schematron/releases/tag/v2.6.0',
    note: 'BR-DE rules only; the EN 16931 rules come from the semantic bundle.',
    xslt: { archive: XR, path: 'schematron/cii/XRechnung-CII-validation.xsl' }, entry: 'XRechnung-CII-validation.sef.json.gz',
  },
];

const sources = new Map<string, Promise<{ bytes: Uint8Array; sha256: string }>>();
function download(url: string) {
  let p = sources.get(url);
  if (!p) {
    p = (async () => {
      const res = await fetch(url);
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

async function buildSchematron(spec: SchematronSpec, tmp: string): Promise<{ files: Record<string, Uint8Array>; source: { url: string; sha256: string }[] }> {
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
    for (const f of ['iso_dsdl_include.xsl', 'iso_abstract_expand.xsl', 'iso_schematron_skeleton_for_saxon.xsl', 'iso_svrl_for_xslt2.xsl']) {
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
  const arc = await archive(spec.archive);
  const files: Record<string, Uint8Array> = {};
  for (const c of spec.copy) {
    const names = Object.keys(arc).filter((n) => n.startsWith(c.from) && !n.endsWith('/') && !n.slice(c.from.length).includes('/'));
    for (const n of names) {
      const rel = n.slice(c.from.length);
      if (c.files === 'all' || c.files.includes(rel)) files[c.to + rel] = arc[n];
    }
    if (c.files !== 'all') for (const f of c.files) if (!files[c.to + f]) throw new Error(`${f} not found under ${c.from}`);
  }
  return { files, source: [{ url: spec.archive, sha256: (await download(spec.archive)).sha256 }] };
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
    const { kind, archive: _a, copy: _c, xslt: _x, sch: _s, entries, entry, ...meta } = spec as unknown as Record<string, any>;
    const manifest = {
      ...meta,
      format: kind,
      ...(kind === 'xsd' ? { entries } : { entry }),
      source,
      files: listed,
    };
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(`  ${listed.length} files, ${listed.reduce((n, f) => n + f.bytes, 0)} bytes`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
