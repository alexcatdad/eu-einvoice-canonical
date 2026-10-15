/**
 * Regenerates test/corpus/expected.json, the known-answer manifest for the public sample corpora
 * that .github/workflows/corpus.yml clones.
 *
 *   bun scripts/corpus-manifest.ts <dir holding the clones> [out.json]
 *
 * The expected format of each file comes from where it sits (folder or file-name convention of
 * the upstream repository), NOT from running detection. As a guard against folder conventions
 * that are not as clear as they look, a file is only listed when its own CustomizationID /
 * GuidelineID also matches `id`, a second, independent regex. Files that disagree are printed
 * and left out, so they can be looked at by hand rather than silently becoming "expected".
 * Paths in the output are relative to the output file, so the clones must live under
 * test/corpus/repos/ (the workflow does that).
 *
 * Group order matters: the first group that claims a file wins.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

interface Group {
  /** Repository directory name and sub-path to walk. */
  dir: string;
  /** Matched against the path relative to `dir`. */
  path: RegExp;
  /** Expected format id. */
  expect: string;
  /** The file's own customization / guideline identifier must match this. */
  id: RegExp | null;
  /** At most this many files per group, spread evenly, to keep the sweep fast. */
  max: number;
}

const R = 'phive-rules';
const GROUPS: Group[] = [
  // OpenPEPPOL BIS 3 examples: every invoice or credit note in the folder is Peppol BIS 3.
  {
    dir: 'peppol-bis-invoice-3/rules/examples',
    path: /(base|Allowance|Vat-category).*\.xml$/i,
    expect: 'peppol-bis3',
    id: /poacc:billing:3\.0/,
    max: 20,
  },
  // KoSIT XRechnung test suite: *_ubl.xml / *_uncefact.xml are the two syntaxes of every business case.
  { dir: 'xrechnung-testsuite/src/test/business-cases', path: /_ubl\.xml$/, expect: 'xrechnung-ubl', id: /xrechnung/i, max: 40 },
  { dir: 'xrechnung-testsuite/src/test/business-cases', path: /_uncefact\.xml$/, expect: 'xrechnung-cii', id: /xrechnung/i, max: 40 },
  // FNFE-MPE France_RFE examples: the folder names the French profile.
  {
    dir: 'France_RFE/FNFE_RFE_INVOICE/Z.example/TEST/UBL/EXTENDED-CTC-FR',
    path: /\.xml$/,
    expect: 'fr-ctc-ubl',
    id: /extended-ctc-fr/,
    max: 10,
  },
  {
    dir: 'France_RFE/FNFE_RFE_INVOICE/Z.example/TEST/CII/EXTENDED-CTC-FR',
    path: /\.xml$/,
    expect: 'fr-ctc-cii',
    id: /extended-ctc-fr/,
    max: 10,
  },
  {
    dir: 'France_RFE/FNFE_RFE_INVOICE/Z.example/TEST/UBL/EN16931',
    path: /\.xml$/,
    expect: 'en16931-ubl',
    id: /^urn:cen\.eu:en16931:2017$/,
    max: 10,
  },
  {
    dir: 'France_RFE/FNFE_RFE_INVOICE/Z.example/TEST/CII/EN16931',
    path: /\.xml$/,
    expect: 'en16931-cii',
    id: /^urn:cen\.eu:en16931:2017$/,
    max: 10,
  },
  {
    dir: 'France_RFE/FNFE_RFE_INVOICE/Z.example/TEST/FX',
    path: /(BASICWL|EXTENDED).*\.xml$/,
    expect: 'facturx',
    id: /factur-x\.eu/,
    max: 10,
  },
  // phive-rules test files, one module per national format.
  { dir: `${R}/phive-rules-cius-ro`, path: /test-files\/.*\.xml$/, expect: 'cius-ro', id: /CIUS-RO/i, max: 20 },
  { dir: `${R}/phive-rules-cius-pt`, path: /test-files\/.*\.xml$/, expect: 'cius-pt', id: /CIUS-PT/i, max: 20 },
  { dir: `${R}/phive-rules-isdoc`, path: /test-files\/.*\.isdoc$/, expect: 'isdoc', id: null, max: 10 },
  { dir: `${R}/phive-rules-svefaktura`, path: /test-files\/.*\.xml$/, expect: 'svefaktura-1', id: null, max: 10 },
  { dir: `${R}/phive-rules-oioubl`, path: /test-files\/.*\.xml$/, expect: 'oioubl-2', id: /^OIOUBL-2/i, max: 20 },
  { dir: `${R}/phive-rules-ublbe`, path: /test-files\/.*\.xml$/, expect: 'ubl-be', id: /UBL\.BE/i, max: 30 },
  {
    dir: `${R}/phive-rules-peppol-pint`,
    path: /test-files\/pint-ae\/.*\.xml$/,
    expect: 'pint-ae',
    id: /^urn:peppol:pint:[a-z]+-1@ae-/,
    max: 8,
  },
  {
    dir: `${R}/phive-rules-peppol-pint`,
    path: /test-files\/pint-aunz\/.*\.xml$/,
    expect: 'pint-aunz',
    id: /^urn:peppol:pint:[a-z]+-1@aunz-/,
    max: 8,
  },
  {
    dir: `${R}/phive-rules-peppol-pint`,
    path: /test-files\/pint-eu\/.*\.xml$/,
    expect: 'pint-eu',
    id: /^urn:peppol:pint:[a-z]+-1@eu-/,
    max: 8,
  },
  {
    dir: `${R}/phive-rules-peppol-pint`,
    path: /test-files\/pint-jp(-ntr)?\/.*\.xml$/,
    expect: 'pint-jp',
    id: /^urn:peppol:pint:[a-z]+-1@jp-/,
    max: 8,
  },
  {
    dir: `${R}/phive-rules-peppol-pint`,
    path: /test-files\/pint-my\/.*\.xml$/,
    expect: 'pint-my',
    id: /^urn:peppol:pint:[a-z]+-1@my-/,
    max: 8,
  },
  {
    dir: `${R}/phive-rules-peppol-pint`,
    path: /test-files\/pint-om\/.*\.xml$/,
    expect: 'pint-om',
    id: /^urn:peppol:pint:[a-z]+-1@om-/,
    max: 8,
  },
  {
    dir: `${R}/phive-rules-peppol-pint`,
    path: /test-files\/pint-sg\/.*\.xml$/,
    expect: 'pint-sg',
    id: /^urn:peppol:pint:[a-z]+-1@sg-/,
    max: 8,
  },
  { dir: `${R}/phive-rules-ehf`, path: /test-files\/.*\.xml$/, expect: 'peppol-bis3', id: /poacc:billing:3\.0/, max: 20 },
  { dir: `${R}/phive-rules-simplerinvoicing`, path: /NLCIUS-CII.*\.xml$/i, expect: 'nlcius-cii', id: /nlcius/i, max: 20 },
  { dir: `${R}/phive-rules-simplerinvoicing`, path: /SI-UBL-2\.0.*\.xml$/i, expect: 'nlcius-ubl', id: /nlcius/i, max: 20 },
  {
    dir: 'mustangproject/library/src/test/resources',
    path: /^XRECHNUNG_[^/]*\.ubl\.xml$/,
    expect: 'xrechnung-ubl',
    id: /xrechnung/i,
    max: 10,
  },
  {
    dir: 'mustangproject/library/src/test/resources',
    path: /^(factur-x-extended|Extended_fremdwaehrung)\.xml$/,
    expect: 'facturx',
    id: /factur-x\.eu|zugferd\.de/,
    max: 5,
  },
  {
    dir: `${R}/phive-rules-zugferd`,
    path: /test-files\/.*\/(basic|basicwl|extended|minimum)\/.*\.xml$/i,
    expect: 'facturx',
    id: /factur-x\.eu|zugferd\.de/,
    max: 30,
  },
  {
    dir: `${R}/phive-rules-zugferd`,
    path: /test-files\/.*\/en16931\/.*\.xml$/i,
    expect: 'en16931-cii',
    id: /^urn:cen\.eu:en16931:2017$/,
    max: 20,
  },
];

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir).sort()) {
    if (e === '.git') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** First CustomizationID / GuidelineSpecifiedDocumentContextParameter ID, by regex: independent of src/probe.ts. */
function identifier(text: string): string | undefined {
  const m =
    /<(?:\w+:)?CustomizationID[^>]*>\s*([^<]*?)\s*</.exec(text) ??
    /GuidelineSpecifiedDocumentContextParameter[^>]*>\s*<(?:\w+:)?ID[^>]*>\s*([^<]*?)\s*</.exec(text);
  return m?.[1];
}

const root = resolve(process.argv[2] ?? 'test/corpus/repos');
const out = resolve(process.argv[3] ?? 'test/corpus/expected.json');
const answers: Record<string, string[]> = {};
const claimed = new Set<string>();

for (const g of GROUPS) {
  const base = join(root, g.dir);
  let all: string[];
  try {
    all = [...walk(base)];
  } catch {
    console.log(`missing ${g.dir}`);
    continue;
  }
  const hits: string[] = [];
  for (const f of all) {
    const rel = relative(base, f);
    if (!g.path.test(rel) || claimed.has(f)) continue;
    const head = readFileSync(f, 'utf8').slice(0, 200_000);
    const id = identifier(head);
    // Only invoices: skip other UBL/CII document types that happen to sit in the same folder.
    if (
      !/<(?:\w+:)?(Invoice|CreditNote|CrossIndustryInvoice|CrossIndustryDocument|Faktura)\b/.test(
        head.replace(/<\?xml[^>]*\?>|<!--[\s\S]*?-->/g, ''),
      )
    )
      continue;
    if (g.id && !g.id.test(id ?? '')) {
      console.log(`skip ${relative(root, f)}: identifier ${JSON.stringify(id)} does not look like ${g.expect}`);
      continue;
    }
    hits.push(f);
  }
  const step = Math.max(1, hits.length / g.max);
  const picked = new Set<string>();
  for (let i = 0; i < hits.length && picked.size < g.max; i += step) picked.add(hits[Math.floor(i)]);
  for (const f of picked) {
    claimed.add(f);
    answers[relative(dirname(out), f)] = [g.expect];
  }
  console.log(`${g.expect.padEnd(14)} ${picked.size}/${hits.length}  ${g.dir}`);
}

writeFileSync(out, `${JSON.stringify(answers, null, 2)}\n`);
console.log(`\n${Object.keys(answers).length} files -> ${relative(process.cwd(), out)}`);
