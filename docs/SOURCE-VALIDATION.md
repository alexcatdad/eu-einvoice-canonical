# Source validation

Source validation checks the received XML against pinned schemas and rule suites. Conversion, source conformance, canonical arithmetic, signature verification, signer trust and authority clearance answer different questions. Successful conversion does not establish source conformance; a local pass does not establish authority acceptance.

## Request and interpret checks

```ts
import { convert, validateSource, validationPassed } from 'eu-einvoice-canonical';

const result = await convert(bytes, 'invoice.xml', undefined, { validate: true });
const report = await validateSource({ xml }); // independently of canonical mapping
if (validationPassed(report)) {
  // Every required source layer completed and passed for this scope and suite.
}
```

`result` is `valid`, `invalid`, `incomplete`, or `not-requested`. `completeness` records whether all required checks finished, independently of whether they found errors. A document can be invalid and still have incomplete coverage. `required` names the source layers, and `reasons` distinguishes unsupported coverage, unavailable execution, size limits and inapplicable layers. Warnings and informational findings do not themselves cause failure.

The default scope is `full-source`. Native/profile obligations remain required when a format has only an XSD installed. `validateSource({ xml }, { scope: 'schema' })` explicitly requests schema-only validation; a pass in that scope says nothing about unexecuted business rules. Signature and clearance fields are separate from this source result.

Successful conversion places the report on `invoice.source.validation` and on the conversion outcome. A recognizable source that fails canonical mapping can still return `outcome.validation`. Invalid or unavailable results preserve findings, rule IDs and locations rather than discarding the canonical result.

| Entry point | Complete pass | Failed source check | Missing or skipped required check |
| --- | --- | --- | --- |
| Library | `valid` | `invalid` | `incomplete` |
| CLI `convert --validate` | Exit 0 | Exit 4 | Exit 6 |
| HTTP `?validate=true` | 200 | 422 | 503 |
| MCP `validate_invoice` | Report with result | Report with findings | Report with coverage reasons |

Malformed input, unsupported conversion and mixed document batches keep their separate error categories. `--quiet` only suppresses notes; it never disables checks or changes their result.

## Versions, evidence and replay

The receipt records the suite, policy, engine versions, execution limit, selected artifacts and manifest hashes. The default Peppol suite `peppol-2026-05` pairs EN 16931 1.3.16 with Peppol BIS 3.0.21. The option `suite: 'legacy-peppol-3.0.20-en-1.3.17'` replays the former mixed configuration; it is not described as an official historical suite. Other formats select their own pinned artifacts.

Declared versions and profiles govern selection. Unsupported versions must remain incomplete rather than silently receiving the latest national schema. Additional profile claims require their own coverage. The generated conformance page lists distributed bundles selected for actual checked-in fixture versions and profiles, plus missing required layers and excluded artifacts; those examples do not prove coverage of every document in a format family.

Generic CII identifiers do not distinguish D16B from D22B. Without an exact qualified profile binding or an explicit caller choice, the schema layer remains incomplete. A caller who knows the source edition can select `suite: 'cii-d16b'` for generic EN2017 CII; that choice does not cover an unknown profile or a future EN contract. Similarly, an unknown UBL contract needs an explicit supported `UBLVersionID` before a generic schema is selected. Known qualified contracts retain their pinned syntax binding.

The e-arve header value `1.2` is shared by ordinary 1.2 and the distinct 1.2.EN edition. Choose `suite: 'e-arve-1.2'` or `suite: 'e-arve-1.2.EN'` when the edition is known. Automatic selection leaves its schema coverage incomplete. Both options select an XSD, without claiming native business-rule coverage. The converter exposes these choices in its Validation rules selector. Wrong-format suite choices do not silently fall back to the automatic rules.

An arbitrary UBL extension may satisfy the generic schema's lax wildcard without its contents being checked. Such content keeps full-source coverage incomplete unless the selected local closure covers the extension. Findings from the base rules are preserved. Explicit schema-only validation continues to report the result of the selected XSD; it does not claim coverage of extension business rules.

Factur-X uses an explicit edition because its shared CII namespace and profile identifier do not identify the validation release:

```ts
const report = await validateSource({ xml }, { suite: 'facturx-1.09.2' });
```

The locally qualified edition covers BASICWL, EN16931 and EXTENDED with each profile's restricted D22B schema and rules. MINIMUM and BASIC remain unsupported in this suite. An unrelated or unknown profile cannot fall back to a generic complete pass. This validates XML, not the PDF/A envelope. The publisher's code database is pinned and embedded in the compiled stylesheet to avoid runtime network access; original and derived sources are retained with hashes.

France RFE is an explicit additional validation policy:

```ts
const frenchXml = await validateSource({ xml }, { suite: 'france-rfe-1.4.0.04' });
const frenchFacturX = await validateSource({ xml }, { suite: 'france-rfe-1.4.0.04-facturx' });
```

The first suite selects the publisher-paired UBL or CII D22B EN16931/EXTENDED-CTC-FR chain; the second selects the matching Factur-X 1.09.2 profile and French rules. These remain separate because the CII namespace and some profile identifiers overlap. The semantic layer reports the selected base business rules, which are not always generic EN16931. Both suites run the strict French rules, not the publisher's historical warning-only alternative. French Extended documents without an explicit compatible suite remain incomplete instead of receiving incompatible generic EN rules. Unknown UBL extension content still remains incomplete; the French Extended name does not qualify arbitrary extension namespaces. This coverage concerns invoice XML, not lifecycle messages, platform exchange or authority acceptance.

The G-account suite includes the Dutch authority's modified EN rules, NLCIUS and the extension. It runs as one profile layer; running generic EN rules as well would wrongly reject permitted multiple payment instructions. Self-Billing uses its dedicated CEN/native pair rather than ordinary Peppol Billing rules.

ISDOC 6.0.2 includes the publisher's selected native assertions with two disclosed XPath syntax repairs needed to compile the published source. Original and repaired Schematron files are retained and hashed. This is a derived executable validator, not an unmodified upstream binary or an exhaustive fiscal-law check.

ISDOC 6.0.1 uses its own schema and unmodified native Schematron. Releases 5.1, 5.2, 5.2.1, 5.2.2, 5.2.3, 5.3 and 5.3.1 use their exact historical XSD closures; these packages supply no native rule suite, so full-source validation remains incomplete. The two pinned 5.2 distributions have equivalent validation constraints: differences are confined to annotations, revision comments and insignificant whitespace, with identical dependency structure. The October snapshot therefore serves both without an additional edition selector. ebInterface 3.0 and 3.02 likewise select their own namespaces and schema snapshots, without inheriting a newer release's schema or claiming native business coverage.

UBL.BE 1.31 runs its historical integrated EN, Peppol and Belgian rules as one profile layer. Generic current EN rules are not added to that integrated suite. Its exact customization identifier selects the snapshot; passing it does not establish acceptance by today's Belgian network.

Peppol BIS 2 uses the Fall 2018 rules 3.7.0 and UBL 2.1 from the publisher's pinned build configuration. BII rules form the semantic layer; OPENPEPPOL and OPENPEPPOL CORE together form the profile layer. Exact process identifiers are checked in routing because the historical Schematron only checks their presence. The build adapter inlines the three pinned include fragments and appends the original CORE patterns unchanged. One exact code-list predicate in each BII suite is represented as XPath sequence membership instead of a chain of 917 equality alternatives, preserving its ordered values, rule context and diagnostic text. This hash-constrained transformation avoids a reproduced WebKit stack overflow during the vendor runtime’s checksum traversal; original and derived sources remain available for inspection. Standard ISO abstract expansion and SVRL compilation still run, with all profile patterns enabled. The supported `select-contexts=key` compiler option visits direct attribute contexts that the pinned skeleton’s default traversal skips; original match patterns and priorities remain intact. Original sources, included fragments and the derived source are retained with hashes. This historical validation does not imply current network acceptance.

CIUS-PT and CIUS-RO execute their authority packages as integrated core/native suites. Narrow build adapters expand the pinned abstract patterns; source identity and derived hashes are retained. Romanian document CIUS1.0.1 and validator artifact1.0.9 are distinct identifiers.

CIUS-RO compilation uses the pinned ISO skeleton's `select-contexts=key` option to visit attribute rule contexts (`currencyID` and `unitCode`). This preserves each exact rule match pattern and avoids the skeleton's default child-only traversal, which silently omitted those assertions.

OIOUBL 2.02 selects UBL 2.0 and the authority's historical 1.11.1.35666 invoice or credit-note rules, whose headers are dated 2019-04-08. The source is pinned to [authority commit 244631323b2fb56eda3bf7475bc050e65ad84b38](https://git.erst.dk/openebusiness/common/-/tree/244631323b2fb56eda3bf7475bc050e65ad84b38/resources/Schematrons/OIOUBL). Original stylesheets are retained verbatim. A separate compilation source makes the XSLT 1.0 node-to-number conversion explicit in qualified `format-number` calls, avoiding a reproduced Saxon-JS 2.7 conversion defect. This transformation is restricted by original source hashes and exact call counts; the rule text and arithmetic expressions are preserved. An importing adapter preserves `W-` warnings and `F-` fatal errors, IDs and locations. Unknown severity prefixes and malformed reports fail execution instead of becoming empty passes.

This is conformance to that historical snapshot through a disclosed compatibility build, not a claim of current Danish production acceptance. The manifest's effective-from date identifies the source snapshot; legal activation was not independently established.

OIOUBL 2.1 retains its distinct 1.15.2 native suite and report adapter. OIOUBL 3 invoice and credit-note suites retain their respective matched core/native pairings. A document does not inherit another generation's rules merely because the XML namespaces overlap.

PINT qualification covers the pinned billing distributions for Singapore 1.4.1, Australia/New Zealand 1.1.3, Japan 1.1.3, Malaysia 1.3.1, UAE 1.0.4, Oman 1.0.1 and EU 1.1.1. Separate self-billing chains cover Australia/New Zealand, Japan, Malaysia, UAE and Oman. Japan's inspected distributions qualify Invoice only; the other listed routes also qualify CreditNote. Shared artifacts are reused only where the original distribution bytes match. UAE billing and each self-billing distribution select their own paired shared rules. The EU profile combines its EN-aligned and jurisdiction Schematrons, preserving both original sources and their assertions. Exact customization and process contracts govern coverage; unknown suffixes or unsupported roots cannot receive a complete pass. A shared-only PINT report retains its findings while missing jurisdiction rules keep full-source incomplete.

Japan non-tax-registered PINT 1.1.3 is also qualified for its exact Invoice contract. It has separate shared and jurisdiction artifacts; ordinary billing rules are not substituted. Its CreditNote and additional process/customization chains remain incomplete.

CFDI3.3/4.0 includes core, catalogue, datatype and TimbreFiscalDigital1.1 schemas. Other complements and Addenda require their own schema closure; unsupported extension namespaces remain incomplete. Neither XSD validation nor the presence of a stamp proves signature trust or authority acceptance. Remaining acquisition, profile and rights gaps are recorded in [VALIDATION-GAPS.md](https://github.com/alexcatdad/eu-einvoice-canonical/blob/main/docs/VALIDATION-GAPS.md).

The default Schematron limit is 2,000 invoice lines. Skipped layers remain `not-run` with a `size-limit` reason and make required validation incomplete. The library accepts `maxSchematronLines` to change that limit; increasing it can substantially increase execution time. The Node library's line limit is not a wall-clock deadline.

## Browser execution

The converter loads validation on demand and runs it in disposable workers. It uses same-origin, pinned XSD, WASM and Schematron assets, with integrity checks. Source XML is processed locally. The converter exposes cancellation and an execution deadline; terminating a job terminates its workers. Failure to load assets or execute a required engine is an incomplete result.

The Saxon browser runtime is unmodified. Its worker DOM host is an experimental application adapter, not a vendor-supported worker integration; cross-browser fixture parity is the acceptance evidence for the supported rules.

Compiled stylesheets cross the worker boundary as JSON text and are parsed inside the engine worker. This avoids a reproduced Chromium structured-clone failure on deeply nested BIS 2 stylesheet objects; stylesheet contents and validation rules are unchanged.

The lightweight startup example does not automatically load the engines. User-loaded documents and selected examples request validation; changing the Validation rules selector reruns the current document. A browser pass has the same source scope as the library, not a broader compliance claim.

## Updating a suite

1. Identify the publisher's exact compatible schema and native/core rule releases, effective dates, profiles and redistribution terms. Record unresolved rights; do not infer permission from a third-party wrapper.
2. Pin source archives/files and hashes in `scripts/build-validation-bundles.ts`. Preserve notices and document every import-path adjustment or compilation wrapper.
3. Build artifacts, then run `bun run verify:bundles`. A checksum match establishes artifact integrity, not semantic correctness.
4. Add synthetic positive invoices and credit notes where applicable, plus schema, business-rule, profile and unsupported-version negative controls through public conversion or validation APIs. Preserve rule IDs, locations and severities.
5. Check the CLI, HTTP and MCP results and the built browser assets. Compare browser findings with the library, and test unavailable/corrupt assets, cancellation and limits.
6. Regenerate schemas and conformance documentation. Publish only qualified artifacts after the repository's review and publication gates.

`bun run check:validation-coverage` executes the controls in `conformance/validation-cases.json` through the public source-validation API. Every locally qualified bundle must have passing positive and failing negative evidence, exact selected bundle identities, and a negative for every claimed layer. Native negatives must remain schema-valid. A missing artifact, changed pairing, non-matching mutation, or newly shipped bundle without evidence fails the library gate.

Routing uses the executable inventory in `src/validation/selectors.ts`. The independent `conformance/validation-selectors.json` inventory must exercise each route with positive and negative controls, including aliases and invoice/credit-note variants that reuse artifacts. Adding a route without its own evidence fails the same gate even if all its bundles were already tested. `conformance/validation-unsupported-selectors.json` separately checks unknown versions and additional profile claims. These controls qualify the listed contracts; they do not prove every possible document or every assertion inside a rule suite.

Svefaktura's official artifacts are retained only as ignored local qualification inputs. Their redistribution scope remains unresolved; they are excluded from all default outputs.

## Distribution and local qualification

The default Git, npm, compiled CLI, Docker and Pages outputs include **43 approved bundles**. The local qualification corpus contains **107 bundles**. These are separate inventories: running a validator locally does not establish redistribution permission.

`validation/distribution.json` records every bundle decision, publisher evidence and approved manifest hashes. Distribution builders verify every approved file, retained source, license and notice; unknown or changed assets fail the build. The other **64 bundles are excluded**, including native Peppol/PINT, Svefaktura, historical OIOUBL 2 and several national schemas. Conversion remains available; a selected artifact that is absent produces unavailable/incomplete validation and cannot satisfy `validationPassed`. In particular, ordinary Peppol documents retain UBL and EN16931 checks but cannot receive a full-source pass without their native profile rules.

The generated conformance report distinguishes distributed selections from excluded artifacts. `docs/VALIDATION-GAPS.md` covers both missing technical qualification and unresolved distribution scope. Complete third-party notices and corresponding source are shipped with approved bundles; the library's 0BSD license does not replace those terms.

For development, `bun run restore:local-validation` retrieves excluded artifacts directly from publisher sources, verifies `validation/local-source-pins.json` before compilation, and writes ignored local copies. This explicit command needs network access; runtime validation never downloads missing rules. An upstream revision or missing source fails restoration rather than silently substituting a release. Run `VALIDATION_ASSETS=local bun run build:site` only for local qualification. Normal `bun run build:site` always rebuilds the approved subset. CI runs both qualification and published-subset acceptance, and uploads only the latter.

Use `bun scripts/check-validation-distribution.ts` before publication. Changing an approval, manifest, license, or source closure requires reviewing and updating the distribution inventory. Existing published Git history is not rewritten by these exclusions.
