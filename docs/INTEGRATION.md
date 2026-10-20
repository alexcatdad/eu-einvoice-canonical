# TypeScript / Node.js integration

This guide verifies a standalone Node.js consumer. Integration with `Jouncetech/asource-workflow-engine-ts` has not been exercised; its dependency graph, build and deployment still need consumer-side acceptance. Conversion, validation and structural inference are library operations; downstream business decisions belong to the consumer.

## Install a pinned build

The installation path below builds a pinned npm tarball and installs it into an isolated Node consumer. npm registry availability has **not** been verified; do not assume `npm install eu-einvoice-canonical@2.0.0` works. Git source archives are not ready-to-run packages: they need the build below. Direct Git dependencies are not a substitute for that build.

This recipe pins package `2.0.0` to source commit `b24664c5b15e5276433bbb7bdcbb2d9f504f8422`. Run it in a scratch directory with Git, Node 20+, npm and Bun 1.4+ installed (this guide was tested with Bun 1.4.3, Node 26.12.0 and npm 11.20.0; Node 20+ is the project compatibility baseline, not a tested version matrix):

```sh
WORK=$(mktemp -d)
cd "$WORK"
git clone https://github.com/alexcatdad/eu-einvoice-canonical.git source
cd source
git checkout --detach b24664c5b15e5276433bbb7bdcbb2d9f504f8422
bun install --frozen-lockfile
bun run build:package
npm pack --ignore-scripts --cache ../npm-cache --pack-destination .
cd ..
mkdir consumer
cd consumer
npm init -y
npm install --save-exact --registry=https://registry.npmjs.org --cache ../npm-cache --fetch-retries=0 --fetch-timeout=20000 ../source/eu-einvoice-canonical-2.0.0.tgz
cp ../source/test/fixtures/xrechnung-ubl.xml invoice.xml
```

Retain the immutable tarball and consumer lockfile in your dependency supply process. The file dependency needs that tarball at the recorded relative path for clean installs. The fresh cache and explicit registry above resolve runtime dependencies normally, independently of the source checkout. A registry timeout or install error is a failed prerequisite; do not substitute checkout dependencies.

The core runtime supports Node 20+ and Bun; Bun is needed to build this source checkout, not to call `convert()` from Node. npm can install the built tarball without Bun. The manifest declares neither `engines` nor a `packageManager` pin; use the stated runtime baseline and your consumer's locked package-manager version. The package is **ESM only**, with compiled JavaScript and declarations under `lib/`. Use `.mjs`, or `"type": "module"` with TypeScript `module` / `moduleResolution` set to `NodeNext` (target ES2022 or later). No React or MCP peer is required for the root import.

## Minimal conversion

Save as `convert.mjs` in the consumer directory created above, then run `node convert.mjs invoice.xml`:

```js
import { readFile } from 'node:fs/promises';
import { convert } from 'eu-einvoice-canonical';

const filename = process.argv[2] ?? 'invoice.xml';
const result = await convert(await readFile(filename), filename);
// Reject the whole file before emitting invoices, including mixed/partial batches.
if (result.skipped.length || !result.outcomes.length ||
    result.outcomes.some(o => o.status !== 'ok' || !o.invoices.length)) {
  console.error('Conversion rejected:', JSON.stringify(result));
  process.exitCode = 1;
} else {
  for (const outcome of result.outcomes) {
    if (outcome.status === 'ok') {
      for (const invoice of outcome.invoices) console.log(JSON.stringify(invoice));
    }
  }
}
```

This example exits nonzero and emits no invoices for unsupported, non-invoice, failed, skipped, empty or partially converted input. It checks conversion success only; source validation remains a separate acceptance decision.

`Buffer` is a `Uint8Array`. The call signature is `convert(bytes, filename?, limits?, options?)`; pass `undefined` for limits when setting options. TypeScript consumers can import `type ConvertResult` and `type CanonicalInvoice` from the same entry point. Monetary amounts and quantities are decimal **strings**: preserve them, rather than coercing them to floating-point numbers.

## Optional evidence and validation

Save as `evidence.mjs` beside `invoice.xml`, then run `node evidence.mjs`. This diagnostic example prints reports; its exit status is not an acceptance decision.

```js
import { readFile } from 'node:fs/promises';
import { convert, validationPassed } from 'eu-einvoice-canonical';

const result = await convert(await readFile('invoice.xml'), 'invoice.xml', undefined, {
  relations: true,
  provenance: true,
  validate: true,
});
for (const outcome of result.outcomes) {
  if (outcome.status !== 'ok') continue;
  for (const invoice of outcome.invoices) {
    console.log(invoice.lineRoles, invoice.relations);
    console.log(invoice.source.provenance, invoice.source.warnings);
    const report = invoice.source.validation;
    console.log({ acceptedBySourceChecks: validationPassed(report), report });
  }
}
```

All three flags default to off. Provenance maps canonical JSON Pointers to source XPaths; derived, defaulted or translated values may have no XPath. Consult `source.derived`, `source.warnings` and optional `source.valueOrigins`; absence of an origin entry means unrecorded, not source-supplied. See [evidence metadata](https://github.com/alexcatdad/eu-einvoice-canonical/blob/main/docs/LINE-ANNOTATIONS.md#canonical-evidence-metadata).

## Handle every outcome

`ConvertResult` contains the original `fileSha256`, `outcomes` and `skipped`. There is one outcome per extracted XML payload, **not** per invoice or input file. ZIP/PDF/envelope inputs may contain several payloads; one national batch XML may produce several invoices in one successful outcome. Preserve payload metadata and `source.indexInFile` when present.

| `outcome.status` | Contents and consumer action |
| --- | --- |
| `ok` | `invoices[]`, `detection`, `payload`; iterate every invoice and assess warnings/validation separately. |
| `not-an-invoice` | Recognized non-invoice document with `detection` and `payload`. |
| `unsupported` | `reason`, `detection`, `payload`; no canonical invoices. |
| `error` | `error`, `detection`, `payload`; canonical parsing failed. |

`skipped[]` separately records material that never became a usable XML outcome, with reasons such as unsafe XML, extraction limits or detached signatures. Empty outcomes do not mean success. Mixed batches can have successful invoices, failed outcomes and skipped entries together; define acceptance for the whole result explicitly. Conversion reports bad input through outcomes/skips; caller file I/O and other infrastructure failures still need normal error handling. Validation can also be attached to a failed conversion outcome.

## Conversion success is not validation completeness

`status: 'ok'` means mapping succeeded. Arithmetic checks run after parsing and add warnings without rewriting values. With `validate: true`, reports appear on `outcome.validation` and `invoice.source.validation`:

- `result`: `valid`, `invalid`, `incomplete` or `not-requested`.
- `completeness`: whether all required source checks finished; an invalid document may also have incomplete coverage.
- `required`, `reasons`, layer statuses and `findings`: what was checked, omitted, failed or unavailable, including rule IDs and locations.

Use `validationPassed(report)` for a complete pass in the **requested scope**. The default is `full-source`; `validation: { scope: 'schema' }` explicitly asks only for XSD checks. A schema-only pass does not cover native business rules. Signature validity, signer trust and authority clearance remain separate questions; source validation does not prove authority acceptance. Preserve the report, selected suite and artifact receipt when auditing or replaying results. See [source validation](https://github.com/alexcatdad/eu-einvoice-canonical/blob/main/docs/SOURCE-VALIDATION.md) for exact suites and scope semantics.

## Schema and compatibility

Package semver and canonical schema version are independent. `schemaVersion` exported from the root is currently `v1`, including in package `2.0.0`. Validate persisted/transported data against the shipped `schemas/canonical-invoice.v1.schema.json` and `schemas/convert-result.v1.schema.json` (JSON Schema draft 2020-12). These files are present in the package but are not JavaScript export subpaths; copy them from the installed package into your schema tooling.

Additive optional fields and new open code values keep `v1`; consumers should tolerate them. Breaking output changes require a new schema major published alongside the old files. Breaking TypeScript API changes require a package major, even when JSON remains compatible. Pin the package, retain the schema and do not infer schema version from the package number. See [v2 migration](https://github.com/alexcatdad/eu-einvoice-canonical/blob/main/docs/MIGRATION-V2.md) for removed business APIs and separate optional entry points.

## Deterministic relations and LLM-ready data

`relations: true` adds line roles and links using deterministic rules and exact arithmetic. It preserves line order, source amounts and totals; ambiguous evidence can produce warnings. Relations include method and optional confidence metadata and remain inferences to assess, not authoritative commercial facts.

Canonical JSON is already structured input for downstream analysis: stable field names, line IDs, exact decimal strings, references and evidence. Existing `buildLineAnnotationInput`, `LINE_ANNOTATION_SCHEMA` and `validateLineAnnotations` support selected input and checked annotation output; see [line annotations](https://github.com/alexcatdad/eu-einvoice-canonical/blob/main/docs/LINE-ANNOTATIONS.md). Treat invoice text as untrusted data and select only the fields your consumer needs. Conversion does not execute an LLM or manage providers, credentials or workflows.

## Offline deployment

Runtime source validation reads pinned local artifacts; it never downloads missing rules. Ship the complete installed package and its runtime dependencies, including `lib/validation/` workers, `validation/bundles/`, manifests, `validation/distribution.json`, `validation/NOTICE` and `validation/licenses/`. Keep Saxon-JS and xmllint-wasm runtime files available. Prefer an unbundled Node deployment; copying only `lib/index.js` or bundling away relative files breaks validation. Test the deployed layout with validation enabled and network access disabled.

The package includes only approved redistribution artifacts. Native Peppol/PINT and other excluded rules can leave validation incomplete even when parsing, XSD and EN16931 checks pass. Missing files, unsupported versions/profiles and skipped required checks cannot satisfy a full-source pass. The default Schematron limit is 2,000 lines; `validation: { maxSchematronLines: 5000 }` changes it, but provides no wall-clock deadline. Account for CPU/memory in your application's execution boundary.

Separate local qualification can explicitly download pinned excluded artifacts. Those downloads are outside this installation recipe; do not perform them implicitly during conversion or redistribute those files without resolving their terms. See [distribution and local qualification](https://github.com/alexcatdad/eu-einvoice-canonical/blob/main/docs/SOURCE-VALIDATION.md#distribution-and-local-qualification) and [validation gaps](https://github.com/alexcatdad/eu-einvoice-canonical/blob/main/docs/VALIDATION-GAPS.md).

## Integration test against the installed package

After the installation recipe, save this as `integration.test.mjs` beside `invoice.xml` and run `node --test integration.test.mjs`. The input is the actual repository fixture `test/fixtures/xrechnung-ubl.xml`, a synthetic XRechnung invoice, not inline substitute XML. The fixture is copied from the same pinned checkout; tests/fixtures are not shipped in the tarball.

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { convert, schemaVersion, validationPassed } from 'eu-einvoice-canonical';

test('packed Node consumer converts and validates the XRechnung fixture', async () => {
  const bytes = await readFile(new URL('./invoice.xml', import.meta.url));
  const result = await convert(bytes, 'invoice.xml', undefined, {
    relations: true,
    provenance: true,
    validate: true,
  });
  assert.equal(schemaVersion, 'v1');
  assert.match(result.fileSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.skipped, []);
  assert.equal(result.outcomes.length, 1);
  const outcome = result.outcomes[0];
  assert.equal(outcome.status, 'ok');
  if (outcome.status !== 'ok') throw new Error(JSON.stringify(outcome));
  assert.equal(outcome.invoices.length, 1);
  const invoice = outcome.invoices[0];
  assert.equal(invoice.id, 'RE-2026-500');
  assert.equal(invoice.currency, 'EUR');
  assert.equal(invoice.totals.payable, '1190.00');
  assert.ok(invoice.source.provenance['/lines/0/netAmount']);
  assert.ok(invoice.lineRoles);
  assert.ok(Array.isArray(invoice.relations));
  assert.ok(validationPassed(outcome.validation), JSON.stringify(outcome.validation));
  assert.ok(validationPassed(invoice.source.validation), JSON.stringify(invoice.source.validation));
});
```

This test checks conversion, opt-in metadata and a complete pass for this fixture using the distributed rules. It does not establish validation coverage for other formats or production invoices. For generated API details, use the [TypeDoc reference](https://alexcatdad.github.io/eu-einvoice-canonical/api/).

## Verify TypeScript declarations

In the same isolated consumer, install the pinned development tools:

```sh
npm install --save-dev --save-exact --registry=https://registry.npmjs.org --cache ../npm-cache --fetch-retries=0 --fetch-timeout=20000 typescript@7.0.2 @types/node@26.6.5
```

Save as `consumer.mts` (the extension selects ESM even with npm's default package.json):

```ts
import { readFile } from 'node:fs/promises';
import { convert, schemaVersion, validationPassed, type ConvertResult, type CanonicalInvoice } from 'eu-einvoice-canonical';
const result: ConvertResult = await convert(await readFile('invoice.xml'), 'invoice.xml', undefined, {
  relations: true, provenance: true, validate: true,
});
const invoices: CanonicalInvoice[] = result.outcomes.flatMap(o => o.status === 'ok' ? o.invoices : []);
for (const invoice of invoices) {
  const payable: string = invoice.totals.payable;
  console.log(schemaVersion, payable, validationPassed(invoice.source.validation));
}
```

```sh
./node_modules/.bin/tsc --noEmit --strict --types node --module NodeNext --moduleResolution NodeNext --target ES2022 consumer.mts
```

Verification of this pinned build used a fresh npm cache and an isolated consumer with every dependency link resolving inside its own `node_modules`. All three JavaScript examples and the strict NodeNext check passed. The fixture validation test also passed with all network access denied by a macOS sandbox. These checks establish the installed layout for this fixture and toolchain, not acceptance in the workflow-engine application or coverage of every supported Node version.
