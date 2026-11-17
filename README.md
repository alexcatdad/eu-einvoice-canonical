# eu-einvoice-canonical

[![CI](https://github.com/alexcatdad/eu-einvoice-canonical/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/alexcatdad/eu-einvoice-canonical/actions/workflows/ci.yml)
[![CodeQL](https://img.shields.io/badge/CodeQL-enabled-brightgreen)](https://github.com/alexcatdad/eu-einvoice-canonical/security/code-scanning)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/alexcatdad/eu-einvoice-canonical/badge)](https://scorecard.dev/viewer/?uri=github.com/alexcatdad/eu-einvoice-canonical)
[![License: 0BSD](https://img.shields.io/badge/license-0BSD-blue)](LICENSE)
[![Pages](https://img.shields.io/badge/demo-GitHub%20Pages-blue)](https://alexcatdad.github.io/eu-einvoice-canonical/)

[Contributing](CONTRIBUTING.md) | [Code of Conduct](CODE_OF_CONDUCT.md) | [Security](SECURITY.md) | [Changelog](CHANGELOG.md) | [Migrating to v2](docs/MIGRATION-V2.md)

One TypeScript model for every XML e-invoice you can receive from the 27 EU member states, plus the layer that gets you from a received file to "this is format X, version Y": unwrapping (PDF/A-3, `.p7m`, ZIP, SBDH, SOAP, legacy encodings), detection, and parsing into canonical JSON.

**Try it in the browser:** [alexcatdad.github.io/eu-einvoice-canonical](https://alexcatdad.github.io/eu-einvoice-canonical/). Drop an invoice and get the JSON. The page runs the same code as the library, entirely client-side; files are never uploaded.

**Status:**
- Every parser family is implemented: UBL (Peppol BIS 3 and self-billing, PINT, XRechnung, NLCIUS, CIUS-RO, CIUS-PT, HR-CIUS, OIOUBL, plain EN 16931), CII (Factur-X/ZUGFeRD 2 in every profile, XRechnung CII), Svefaktura 1.0, FatturaPA, KSeF FA(2)/FA(3)/FA_RR, Facturae, ISDOC, ebInterface, Finvoice, e-arve, eSLOG 2.0, ZUGFeRD 1.0, TEAPPSXML and myDATA.
- Also built: CAdES/XAdES signature verification, opt-in XSD and Schematron source validation, field-level provenance, the `einvoice` CLI, a coverage gate, and a per-format conformance checklist (the [conformance page](https://alexcatdad.github.io/eu-einvoice-canonical/conformance/) on the site).
- How well each format is covered (fixtures, real samples, mapping source, validation) is in the generated conformance checklist, not in this README, so it cannot drift.

```
received file ──► unwrap() ──► XML payload(s) ──► detectXml() ──► parser family ──► CanonicalInvoice[]
  .xml .pdf .p7m      PDF/A-3 attachment             format id, version,     ubl, cii, fatturapa,
  .zip .isdocx        CMS/PKCS#7, base64, ZIP,       profile, or "not an     ksef, facturae, ...
  .xsig               SBDH, SOAP, encoding           invoice"
```

## Layout

| File | What it is |
|---|---|
| `src/canonical.ts` | The canonical type. EN 16931 core + EU-wide additions + per-country extensions. |
| `src/codes.ts` | Code lists as open string unions (UNCL 1001/5305/4461/5189/7161, ISO 4217/3166, ICD/EAS). |
| `src/formats.ts` | Registry of 37 formats with detection rules, parser family, countries, status and build phase. |
| `src/probe.ts` | Streaming header read (root, namespaces, CustomizationID, guideline ID, KSeF form code...). |
| `src/envelope.ts` | Unwrapping: PDF attachments, CMS signed data, base64, ZIP, SBDH, SOAP, encoding. Rejects DOCTYPEs and enforces size/count limits. |
| `src/server.ts` | The reference HTTP server for `openapi/openapi.yaml` (`Bun.serve`, nothing else); `src/problems.ts` is the error catalogue. |
| `src/detect.ts` | `detectXml()`: invoice format, known non-invoice, or unknown. |
| `src/parsers/` | `ubl.ts`, `cii.ts`, `svefaktura.ts`, the shared DOM reader (`context.ts`) and the family registry with stubs for the rest. |
| `src/writers/` | `ubl.ts` and `cii.ts`: canonical invoice back to Peppol BIS 3 UBL 2.1 and EN 16931 CII D16B (`toUbl`, `toCii`); `shared.ts` is the XML builder, escaping and specification choice. |
| `src/values.ts` | `toDecimal()` / `toIsoDate()` constructors and exact BigInt arithmetic. No value passes through a JS `number`. |
| `src/checks.ts` | EN 16931 calculation rules BR-CO-10/13/14/15/16, run after every parse. Mismatches become warnings; values are never rewritten. |
| `src/index.ts` | `inspect(bytes)` (unwrap + detect) and `convert(bytes)` (unwrap + detect + parse). Both return everything that was skipped, with the reason. |
| `test/` | Detection, parser, hostile-input and value tests (about 160), plus `fixtures/expected.json` for the known-answer sweep. |
| `scripts/sweep.ts` | Runs detection over a directory tree. Without `--expect` it counts formats; with `--expect answers.json` it checks each file against a known answer and exits 1 on a mismatch. |
| `schemas/` | Generated JSON Schemas (draft 2020-12) for `CanonicalInvoice` and `ConvertResult`. `bun run build:schemas` regenerates them from `src/canonical.ts`; CI fails when they are stale. |
| `site/` | The GitHub Pages site, an Astro project with its own `package.json`: Starlight docs generated from this README (`site/docs.ts`), the browser converter as a React island, and the conformance, real-world results and API reference pages. `bun run build:site` builds it into `dist/`. |

## Site languages

The browser converter and the Deliverables page are available in English, German, French, Italian, Spanish, Dutch, Polish and Romanian. The language is taken from `?lang=`, then the saved choice (`localStorage`), then the browser's language list, then English; the switcher in the page header changes it. Messages live in `site/i18n/<lang>.json`, with `en.json` as the reference. Canonical JSON keys stay in English, and the error pages, API reference, conformance checklist and real-world results are still English only.

**The non-English strings are machine-assisted translations and have not had a native-speaker review.** Corrections are welcome: edit the catalogue and open a pull request, keeping every key and every `{placeholder}`. `test/i18n.test.ts` checks that all catalogues have the same keys as `en.json`, that no placeholder is lost, and that every key the site code uses exists.

## Getting started

Development uses [Bun](https://bun.sh) 1.4+. The library itself has no Bun or Node dependency: it runs in Node 20+, Bun and browsers.

```bash
bun install
bun run typecheck
bun run format                                       # Biome: format and apply safe lint fixes
bun run lint                                         # Biome lint only
bun test
bun run sweep:fixtures                               # known-answer check of every fixture
bun scripts/sweep.ts /path/to/inbound/files          # what you actually receive
bun scripts/sweep.ts /path/to/files --expect answers.json
(cd site && bun install --frozen-lockfile)          # once: the site's own dependencies (Astro, Starlight, TypeDoc)
bun run build:site && bun run serve:site             # the site on http://localhost:4173/eu-einvoice-canonical/
bun run check:lib                                   # all library CI gates, including coverage and generated files
bun run restore:local-validation                    # explicit pinned downloads for the full local test corpus
bun run check:site                                  # build, site typecheck, benchmark and bundle-size gates
(cd site && bunx playwright install --with-deps --only-shell chromium) # once: accessibility browser
bun run check:a11y                                  # accessibility/privacy gates against the built dist/
```

CI runs the library and site checks in parallel and requires both plus the Docker smoke test before deployment.
The optional `scripts/fetch-corpus-report.sh` downloads the latest corpus report before building the site; local
checks work without it. Accessibility checks print per-scenario timings; `A11Y_JOBS=1 bun run check:a11y` runs
them serially for profiling (the default is two isolated browser contexts at a time).

For pinned installation, Node/TypeScript examples, outcome handling, offline deployment and a fixture integration test, see the [integration guide](docs/INTEGRATION.md).

### Field provenance in a parser

Canonical output can also carry `source.valueOrigins`, a partial map of canonical field paths to `source`, `derived` or `defaulted`, without enabling XPath provenance. Missing entries mean unrecorded origins. `source.warnings[].field` can identify the affected canonical value. See [Canonical evidence metadata](docs/LINE-ANNOTATIONS.md#canonical-evidence-metadata) for coverage and how consumers distinguish an explicit zero from a substituted one.

XPaths use the qualified names as written in the document, with a positional predicate only where siblings share a name; attributes end in `/@name`. Values built from several nodes list them joined with ` | `. Values the mapper computed, defaulted or translated (code mappings, sums) have no entry and are listed in `source.derived` or `source.warnings` instead.

Parsers get this from `Ctx` in `src/parsers/context.ts`: construct it with `new Ctx(ns, input.provenance)`, take a scope for a canonical path (`const s = c.in('')`, `s.in('seller')`, `s.in('lines').in(i)`), and read through the scope with the field key as the last argument: `s.text(node, 'cbc:ID', 'id')`, `s.dec(m, 'cbc:PayableAmount', 'payable')`, `s.id(el, 'cbc:EndpointID', 'endpoint')` (records `/value` and `/schemeId`). Use `c.mark(path, el)` / `c.markAll(path, els)` for values assembled by hand, and `c.nonEmpty(els)` before mapping to arrays so indexes match the output. Entries for values that did not survive into the output are pruned by `finish()`.

## Command line

`src/cli.ts` is exposed as the `einvoice` bin (`bun src/cli.ts ...` in a checkout; tagged releases attach standalone binaries for linux-x64, darwin-arm64 and windows-x64). A file argument of `-` reads stdin.

```
einvoice detect  <file...>                 format id, version and profile per document (tab separated)
einvoice inspect <file...>                 the unwrap and detect result as JSON
einvoice convert <file...> [--out <dir>] [--extract-pdf]   canonical JSON array on stdout, or one <invoice-id>.json per invoice in <dir>
einvoice render  --as html|pdf <file...> [--lang en|de|fr|it|es|nl|pl|ro] [--out <file|dir>]   human-readable invoice
einvoice write   <file...> --to ubl|cii [--profile peppol-bis3|xrechnung|en16931] [--out <dir>]   write canonical JSON (or any invoice file) as UBL 2.1 or CII D16B
einvoice sweep   <dir...> [--expect answers.json]   detection coverage / known-answer check
einvoice serve   [--port 8080] [--host 127.0.0.1] [--cors[=<origin>]] [--eu-trust[=<snapshot.json>]]   the conversion API, see below
```

`convert --eu-trust[=<snapshot.json>]` checks signers against a trusted-list snapshot (see [EU trusted lists](#eu-trusted-lists)).

Flags: `--pretty` indents JSON; `--quiet` silences notes and warnings (errors are still printed); `--limits '{"maxEntries":10}'` overrides `UnwrapLimits`; `--extract-pdf` on `convert` reads invoices from PDFs without embedded XML (see [PDF text extraction](#pdf-text-extraction-opt-in)); `--validate` on `convert` runs the pinned source XSD and applicable Schematron suites. Exit 0 requires every required source layer to finish and pass; failed rules return 4, and missing or skipped required checks return 6. Canonical JSON remains available for inspection. `--quiet` does not disable validation.

JSON goes to stdout only; every error is one line on stderr.

| Exit | Meaning |
| ---- | ------- |
| 0 | all converted |
| 1 | usage error (and, for `sweep`, any mismatch or unanswered file) |
| 2 | unsafe or malformed input (DOCTYPE, limits, not XML) |
| 3 | unsupported format or profile (including well-formed non-invoice XML) |
| 4 | validation failed |
| 5 | partially converted (some documents failed) |
| 6 | requested validation incomplete or unavailable |
| 7 | internal error (including unreadable files) |

With several failures and no success the code of the first failure is used; with at least one success it is 5.

## PDF text extraction (opt-in)

`convert(bytes, filename, limits, { extractPdf: true })` reads an invoice from the text layer of a PDF that has no usable embedded XML. Without the option such PDFs are skipped as before ("PDF without a usable embedded XML"). Extraction is deterministic: no OCR, no language model and no network calls, so the same file and library version always give the same result. The rules cover Swedish invoices first.

```ts
import { convert } from 'eu-einvoice-canonical';

const r = await convert(bytes, 'invoice.pdf', undefined, { extractPdf: true });
for (const o of r.pdfOutcomes ?? []) {
  if (o.status === 'ok') send(o.invoices[0]);              // complete and reconciled; see Peppol below
  else if (o.status === 'draft') review(o.draft.problems); // never a valid invoice
  else console.log(o.status, 'reason' in o ? o.reason : o.error);
}
```

PDF results go to `ConvertResult.pdfOutcomes`, not `outcomes`, so existing `ConvertOutcome` handling is unchanged. There is one outcome for the received file, with `pdf: { filename, sha256, byteLength }`:

| Status | Meaning |
| ------ | ------- |
| `ok` | `invoices`: a complete invoice whose line, VAT and total amounts reconcile (BR-CO-10 to 16, VAT breakdown), with no problems |
| `draft` | `draft.fields` (printed values by canonical JSON Pointer), `draft.pdfProvenance` and `draft.problems` (code, message, field, page region). Missing, ambiguous, contradictory or non-reconciling values and check-digit failures make a draft. A draft is never presented as a valid invoice |
| `unsupported` | `reason`: the text cannot be read (scanned or image-only pages, garbled or unmapped fonts, Swedish words missing å/ä/ö, encrypted, older runtime), or no invoice fields were recognised, as in explainer documents with callouts only. `payment`, when present: payment facts from a Swedish payment QR code |
| `not-an-invoice` | `reason`: recognised as another document, such as a payment reminder (påminnelse) |
| `error` | `error`: internal error |

Field provenance: an `ok` invoice has `source.format: 'pdf-text'`, `source.syntaxDocumentType: 'PDF'`, `source.payloadSha256` of the PDF and `source.pdfProvenance`, a map of canonical path to `{ page, x, y, width, height }` (page from 1, PDF points, origin top left of the displayed page). It holds printed values only; values computed from them (totals not printed, a single VAT rate applied to lines, the seller endpoint from the organisation number or VAT number) are listed in `source.derived` and have the `derived` origin in `source.valueOrigins`.

Swedish mapping:

- ROT, RUT and grön teknik deductions: the invoice total stays the full amount, the deduction is the prepaid amount (BT-113), payable (BT-115) is total minus deduction, and a note names `ROT`, `RUT` or `GRON_TEKNIK`.
- Factoring (belåning): the payee (BG-10) is the finance company, with the payee's account. The generic rules do not read the payee yet, so such invoices are drafts with a `factoring` problem.
- Momsfritt: VAT category `E` with the printed exemption reason (BT-120).
- Omvänd betalningsskyldighet (reverse charge): with an amount printed as outside VAT ("Ej momspl.") and no VAT amount, VAT category `AE` at rate 0, with the printed statement as exemption reason (BT-120) and code `VATEX-EU-AE` (BT-121).
- Kreditfaktura: type code 381 (credit note).
- Payment reminders: `not-an-invoice`.
- Identifiers are checked: OCR reference, Bankgiro, Plusgiro and organisation number (Luhn), SE VAT number, IBAN (mod 97). A value that fails its check is kept as printed and reported. An OCR reference that is the invoice number itself is kept with a warning only. Personal identity numbers are never kept.
- Item rows without an amount: a row with a description and a unit price of 0,00 only is a heading line (quantity 0, amount 0, both listed in `source.derived`; `analyseLines` gives it the heading role), and a priced row with 0,00 has amount 0. A fee row under an item ("Avgift" with a unit price, no amount) whose price is included in that item's amount (quantity × price + fee) is the item's line charge (BG-28), not a separate line. The article number is the item's seller identifier (BT-155).
- Order numbers printed under each item, in the columns of a second header line ("Ordernr", "Arbetsorder"): when every one is the same, that number is the purchase order reference (BT-13), which satisfies Peppol R003; each line also keeps it in `national.orderReference`. Different numbers per line are each line's order line reference (BT-132).
- Contact and legal details: "Vår referens" is the seller's contact (BT-41), "Telefon" and "E-post" in the footer the seller's phone and e-mail (BT-42, BT-43), "Företagets säte" and "Besöksadress" the seller's additional legal information (BT-33, as "label: value"), "Er kontakt" the buyer's contact (BT-56), "Kundnr" the buyer identifier (BT-46). Contact blocks name their party: under "KÖPARENS KONTAKT" and "SÄLJARENS KONTAKT", "Kontakt:", "Telefon:", "E-mail:" and an e-mail address alone are the buyer's (BT-56 to BT-58) or the seller's (BT-41 to BT-43) contact; "Frågor ang. fakturan:" gives the seller's contact phone and e-mail. Different phone numbers (compared by their digits) or e-mail addresses printed for one party are all kept, in page order, one per line. The late-payment interest ("Dröjsmålsränta") is added to the payment terms (BT-20), never read as VAT, and so is text whose every sentence is on late-payment interest or the seller's general terms ("Efter förfallodagen debiteras ränta ...", "Våra allmänna villkor finns på ..."), after the labelled terms, unless the terms already contain it. A dated remark right under the amount due is the invoice note (BT-22). The bank's name ("Bank") has no field of its own and is added to the invoice note as "Bank: name".
- Page numbering and attached documents: when the first page prints "Sida 1 av N" (or "1 (N)") and pages 1 to N number themselves, only those pages are read; the later pages, such as supplier invoices behind re-invoiced costs, are embedded unchanged as one PDF attachment (BG-24, `application/pdf`), whatever their text quality, and are not read.
- Free text is kept verbatim, one printed line per line: text under an item is its line note (BT-127; unlabelled text there is also reported, as it may belong to the description), a labelled invoice note ("Anteckning", "Meddelande") is BT-22, and payment terms ("Betalningsvillkor") are BT-20. Texts printed differently on several pages are kept one after the other, with a `joined-text` warning at each further one.
- Peppol viewer renderings: "ID: value [scheme]" in a party block with an ISO 6523 scheme other than 0007 is a party identifier with its scheme (seller BT-29; buyer BT-46, which holds one, so a second is reported, not kept); a GLN (0088) must pass its check digit. A VAT number alone in a party block is that party's VAT number. "Faktureringsobjekt" is the invoiced object identifier (BT-18). Under "ÖVRIGA DOKUMENTREFERENSER", "Referens: id - description" is a supporting document reference without content (BG-24: BT-122, BT-123); when the attached file's type and name are printed, an `attachment-not-embedded` warning says the file is not in the PDF. In the payment table, "30 (Kontobaserad betalning)" in every row is the payment means code and text (BT-81, BT-82). "SE" printed alone under the postal line is read as the country code (BT-40), which is otherwise derived from the postal code format.
- No printed text is dropped silently: text that maps to no field is reported by region as `unmapped-text`, without copying the text. It does not stop an `ok` result (it is listed in `source.warnings`). Text used to read the layout is not reported: table headings, the unit-code name under a quantity ("(Kvantitetskod: styck)"), a document-level discount or fee total of zero where none is read ("Summa rabatter (huvudnivå): .00"), and values printed again on another page, amounts and rates compared by value.

Payment QR codes: Swedish UsingQR payment codes are decoded, both from embedded images and from codes drawn as vector paths, without OCR or page rendering. Their amount due, due date and Bankgiro, Plusgiro or IBAN fill payment fields the text does not give, with the code's region as provenance, and cross-check the printed ones: a disagreement is a `qr-conflict` problem and the printed value is kept. The OCR reference from a code (`iref`) is only compared with a printed OCR reference and never fills the field, because it often carries the invoice number instead. Swish and other payloads are ignored. A PDF with no usable text layer stays `unsupported`; when it carries a Swedish payment QR code, the outcome also has `payment` with only the facts decoded from the code, each with its region as provenance.

Rule layers: the generic rules read every layout; generator profiles then refine them for one invoicing program's layouts, selected by the PDF's Producer or Creator and a layout fingerprint, or by the fingerprint alone when the Producer names a general PDF library; issuer templates last refine them for one issuer's layout. A later layer replaces an earlier layer's value field by field. Two generator profiles are bundled: Visma Spcs/Spiris, and the Swedish rendering of a Peppol BIS Billing 3 invoice by e-invoice viewers (sections KÖPAREN, SÄLJAREN, SKATTESAMMANRÄKNING, BETALINSTRUKTION). No templates for real issuers are bundled; callers pass their own:

```ts
const r = await convert(bytes, 'invoice.pdf', undefined, { extractPdf: { templates: [myTemplate] } });
```

Templates and profiles are declarative JSON following [`schemas/pdf-rule-set.v1.schema.json`](schemas/pdf-rule-set.v1.schema.json) (types `PdfRuleSet` and related); callers pass `kind: 'issuer-template'` only. A template is selected when one of its seller VAT IDs, organisation numbers, Bankgiro, Plusgiro or IBAN numbers is printed (and any seller identifier the generic rules read is among them), or when all of its keywords are printed. It names fields by label or page region, address blocks and the item table header, and is applied only with the exact `pdfjsVersion` it names. When several rule sets of a layer match, none is applied and the result reports it. An invalid template makes `convert()` throw `PdfRuleError`; `loadPdfRuleSet` checks one in advance.

Peppol: the buyer reference (BT-10) and the buyer electronic address (BT-49) are usually not printed on PDFs. An `ok` invoice is complete EN 16931 but may lack them; supply both before sending it over Peppol (rules PEPPOL-EN16931-R003 and R010). Printed Peppol IDs ("Köparens PEPPOL-ID: 9999990113 [0007]", "Säljarens PEPPOL-ID", "Elektronisk adress") are read as BT-49 and BT-34 with their scheme; a value that fails its scheme's check digits (0007, 0088) or a scheme outside the Peppol EAS list is kept as printed and reported. Without a printed one, the seller electronic address (BT-34) is the printed organisation number or the organisation number taken from a seller SE VAT number that passes its checks (scheme 0007); it is then listed in `source.derived`.

Command line: `einvoice convert --extract-pdf <file...>` prints or writes `ok` invoices like converted XML. A draft prints its problems on stderr, is never written and exits 3, as do `unsupported` and `not-an-invoice`; `error` exits 7.

Limits: only a received PDF file is read, not PDFs inside a ZIP. Page and work limits bound extraction; a PDF over them is `unsupported` with the reason. The options are described on `ConvertOptions` ([TypeDoc](https://alexcatdad.github.io/eu-einvoice-canonical/api/)). The HTTP server and the MCP server do not offer the option.

Runtime: the text layer is read with the modern build of `pdfjs-dist`, loaded only when extraction is requested, so the rest of the library keeps its runtime support. Extraction is supported on Bun 1.4+ and current browsers only, not on Node: the modern build needs `Math.sumPrecise`, which V8 ships behind a flag, so no released Node version runs it. On other runtimes the file is `unsupported` (`unsupported-runtime`) with a reason naming the supported runtimes, instead of failing. The legacy build is not used because it loads a native canvas module in Node. `pdfjs-dist` lists `@napi-rs/canvas` as an optional dependency, so package managers download it unless optional dependencies are omitted (`npm install --omit=optional`, `bun install --omit optional`); extraction never loads it.

Evaluation: [`scripts/pdf-eval.ts`](scripts/pdf-eval.ts) scores extraction field by field (correct, missing, wrong) and writes a counts-only report. The weekly public corpora workflow runs its `paired` mode, which reads the visible page of the hybrid PDFs in the pinned public corpora with the embedded files ignored and compares it with the embedded XML; it fails on any wrong value.

Baseline: CI runs the synthetic Swedish set (`test/pdf-synth`, every PR) and the private Swedish answer key (internal PRs) with `--gate --baseline`. Each set has a committed baseline of aggregate counts only, [`baseline-synthetic.json`](scripts/pdf-eval/baseline-synthetic.json) and [`baseline-swedish.json`](scripts/pdf-eval/baseline-swedish.json): the minimum number of `ok` documents (`ok`), `ok` or `draft` documents (`okOrDraft`) and correct values (`correct`). The gate fails when a run drops below any of them, as well as on any wrong value or errored document. When results improve, raise the baseline in the same PR: run `bun scripts/pdf-eval.ts swedish <dir> --gate --counts-only`, and copy the `ok`, `ok` + `draft` and `correct` counts from the report into the set's file. Lower a baseline only for a deliberate change, such as a document moved from `ok` to `draft` on purpose, and say why in the PR.

## PDF invoice conversion skill

The repository-scoped [`pdf-invoice-to-xml` skill](.agents/skills/pdf-invoice-to-xml/SKILL.md) guides Codex through one-off transcription of born-digital invoice PDFs without usable embedded XML into UBL/CII, with source-fidelity, arithmetic, validation and round-trip checks. Invoke `$pdf-invoice-to-xml` in a fresh session in this checkout. [Setup and tool prerequisites](.agents/skills/pdf-invoice-to-xml/references/tools.md) also cover installation in another project. The skill uses the active model and local tools; it adds no PDF dependencies to canonical conversion. OCR is outside its initial scope.

## MCP server for AI agents

The MCP SDK (`@modelcontextprotocol/sdk@1.32.1`) is an optional peer dependency; development installs include it. Zod remains in the core for annotation contracts.

The optional `eu-einvoice-canonical/mcp` entry point and `einvoice mcp` run a [Model Context Protocol](https://modelcontextprotocol.io) server on stdio, so an AI agent can read and check e-invoices with the same code as the CLI.

| Tool | What it does |
|---|---|
| `detect_invoice_format` | Unwraps the file and names the format of each document |
| `convert_invoice` | Canonical JSON, optionally with validation, line relations and provenance |
| `validate_invoice` | Parse, schema, EN 16931, profile and signature results with every finding |
| `explain_finding` | Plain-language explanation of a totals rule (BR-CO-10 to BR-CO-16) |
| `list_formats` | The format registry |

Resources: `einvoice://formats` and the JSON Schemas (`einvoice://schemas/canonical-invoice.v1`, `einvoice://schemas/convert-result.v1`).

Safety: tools read files only inside the directories given with `--allow-dir` (symlinks resolved); without it they accept inline XML or base64 only. The server makes no network calls. Long base64 attachments and oversized results are shortened in what the model sees, and every tool that reads an invoice tells the model that invoice text is untrusted data.

Claude Desktop (`claude_desktop_config.json`) or Claude Code (`.mcp.json`):

```json
{
  "mcpServers": {
    "einvoice": {
      "command": "/path/to/einvoice",
      "args": ["mcp", "--allow-dir", "/Users/me/Invoices"]
    }
  }
}
```

## EU trusted lists

Verification is opt-in and works offline with a supplied snapshot. Snapshot acquisition is a separate maintenance operation: `loadTrustLists()` from `eu-einvoice-canonical/trust-lists` fetches the EU List of Trusted Lists (LOTL) and the national lists (ETSI TS 119 612), accepts a list only if its own XML signature verifies (the LOTL against pinned signer certificates, each national list against the certificates the LOTL publishes for it), and keeps the qualified CA/QC services with their certificates and dated status history. The result is a snapshot with its fetch date; `trust/eu-trust-snapshot.json` is one, refreshed weekly by a workflow that opens a pull request.

```ts
import { convert, parseSnapshot } from 'eu-einvoice-canonical';

const euTrust = parseSnapshot(fileText); // a previously acquired, reproducible snapshot
const result = await convert(bytes, 'invoice.xml', undefined, { euTrust });
result.outcomes[0].invoices[0].source.signatures[0].euTrust;
// { qualified: true, status: 'qualified', service: { name, provider, territory, statusAtSigning, currentStatus }, snapshot: { fetchedAt, nextUpdate, stale } }
```

Refresh snapshots separately from conversion with `einvoice-trust-lists update --out snapshot.json`, or call `loadTrustLists()` from the maintenance entry point. Conversion never refreshes a snapshot.

`qualified` means the signer chains to a CA/QC service whose status was granted at the signing time (a service withdrawn later still counts, one withdrawn before does not); `snapshot.stale` says the snapshot is older than its next-update date. `trustAnchorsFromSnapshot(snapshot, at?)` gives the service certificates as `trustAnchors` if you only want the chain check. The LOTL signer is pinned from `lotlSigners`, else from the `previous` snapshot, else trusted on first use (the snapshot says which, and the first update prints a note): pass the certificate from the Official Journal to pin it. Revocation of the signer's own certificate (CRL/OCSP) is not checked.

In the browser page the check is a checkbox that lazily loads the snapshot published with the site. The page never acquires or updates national trust lists.

## Human-readable rendering

`renderHtml(invoice, { lang?, locale?, standalone? })` and `renderPdf(invoice, { lang?, locale? })` from `eu-einvoice-canonical/render`, and the React component `<Invoice>` from `eu-einvoice-canonical/react`, turn a canonical invoice into something a person can read, print or archive. All three draw from one view model (`buildInvoiceView` in `src/render/model.ts`), so they show the same things: a header with the document type, number, key dates and the amount due; seller and buyer with postal addresses and labelled identifiers; references; the lines; allowances and charges; the VAT breakdown; the totals; payment instructions; notes; and attachments listed by name.

```ts
import { renderHtml, renderPdf } from 'eu-einvoice-canonical/render';

const html = renderHtml(invoice, { lang: 'de' });   // a complete HTML document (string)
const fragment = renderHtml(invoice, { standalone: false }); // just <style> + <article>, to embed
const pdf = await renderPdf(invoice, { lang: 'fr' }); // Uint8Array, A4
```

```
einvoice render --as html invoice.xml > invoice.html
einvoice render --as pdf  invoice.xml --out invoice.pdf --lang pl
einvoice render --as pdf  a.xml b.xml --out out/        # one <invoice-id>.pdf per invoice
```

**Formatting.** Dates, times, amounts, quantities and percentages default to the seller's address country. When that country is missing or unknown, a source format associated with exactly one country supplies the default; generic or multi-country formats fall back to `lang` (English by default). Country locales use CLDR's [likely subtags](https://unicode.org/reports/tr35/tr35.html#Likely_Subtags). `lang` selects labels independently; `locale` overrides value formatting, for example `renderHtml(invoice, { lang: 'en', locale: 'ro-RO' })`, `<Invoice invoice={invoice} lang="en" locale="ro-RO" />`, or `einvoice render --as html --locale ro-RO invoice.xml`. To retain the previous language-based formatting, set `locale` to the same value as `lang`.

- Amounts, quantities and percentages use the locale's separators and patterns (`€1,234.50`, `1.234,50 €`, `12,5 %`). Intl supplies only the symbols and the pattern; the digits are copied from the invoice's exact decimal string, so there is no floating-point rounding and extra decimals are kept (`€0.125`). Amounts are padded to the currency's minor unit, never cut.
- Dates are shown in the formatting locale (`15.10.2026`, `Oct 15, 2026`) inside `<time datetime>`, with the ISO date as a tooltip. Issue times use the locale's 12/24-hour clock without shifting the source wall-clock time; the original timestamp remains in the tooltip.
- Postal addresses follow each address's own country, even on cross-border invoices: postcode before city by default; separate city, county and postcode lines for GB/IE; city, region and postcode together for US/CA/AU; postcode, city and province together for Italy; city followed by postcode for Latvia; and city before street with postcode last for Hungary. Unknown countries keep the default layout and all supplied components. Country names use the label language. The layouts follow [Poste Italiane](https://www.poste.it/standard-di-confezionamento), [USPS](https://pe.usps.com/cpim/ftp/pubs/Pub28/pub28.pdf) and UPU country sheets for [Hungary](https://www.upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/hunEn.pdf), [Latvia](https://www.upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/lvaEn.pdf) and [Ireland](https://www.upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/irlEn.pdf); street text and postal codes are preserved.
- IBANs (with a valid check sum) are grouped in fours; VAT IDs, company registrations, GLNs, Leitweg-IDs and other identifiers carry a label naming their scheme.
- Quantities show their unit (UN/ECE Rec 20: `10 pcs`, `2 hr`, `10 Std.`, `2,5 m²`), with the code as a tooltip; a price for more than one unit says so (`per 100 pcs`).
- VAT categories and payment means are named (`Standard rate`, `Reverse charge`, `SEPA credit transfer`), with the code as a tooltip.
- Notes, descriptions and payment terms retain their wording and language. Blank lines split paragraphs, and runs of lines starting with `-`, `*`, `•` or `1.` become bullet lists. Dates, numbers and currency mentions embedded in prose are preserved rather than guessed or translated.
- Credit notes carry a "Credit note" badge, a red accent and "Amount credited" in place of "Amount due".
- **Languages:** labels exist for `en`, `de`, `fr`, `it`, `es`, `nl`, `pl` and `ro`; any other tag keeps English labels and is used for the `lang` attribute. Value formatting follows country or the explicit `locale` override independently.

- **HTML** is self-contained: inline CSS, print styles (the standalone page prints on A4 with 15 mm margins), no scripts, no links, no images and no external resources, and the standalone page carries a Content-Security-Policy (`default-src 'none'`) on top. It uses landmarks, labelled sections and `<th scope>` so screen readers can navigate it. Invoices are untrusted input: every value is escaped (ampersand, angle brackets, both quote characters and backtick; control characters dropped), attachments are listed by name only (never decoded or linked) and external URIs appear as plain text. `test/render.test.ts` injects `<script>` and attribute-breaking strings into every text field and checks that only the renderer's own tags and attributes come out.
- **PDF** is built with pdf-lib and the standard Helvetica fonts (nothing embedded), with amounts written with the currency code. Text wraps, long line lists continue on further pages with the table header repeated, and each page says "Page x of y". Output is deterministic (the PDF dates come from the invoice issue date). The standard fonts only cover the WinAnsi (Western European) character set: accented letters outside it lose the accent (`ș` as `s`, `ł` as `l`), and other characters, such as Cyrillic, Greek or CJK, are drawn as `?` in the PDF but are intact in the HTML.
- The browser converter shows the Invoice tab with the React component below.

### React component

`eu-einvoice-canonical/react` exports `<Invoice>`, which renders the same markup as `renderHtml` (a test compares the two, element for element, across several formats and languages):

```tsx
import { Invoice } from 'eu-einvoice-canonical/react';
import 'eu-einvoice-canonical/react/invoice.css';

export function InvoicePage({ invoice }) {
  return <Invoice invoice={invoice} lang="de" className="my-invoice" />;
}
```

The result is an A4-like sheet: the title and document number on the left with the issue date, due date and a large amount due on the right, under a coloured rule; seller, buyer and delivery side by side; then references, the lines table, allowances and charges, the VAT breakdown, the totals with subtotals ruled off and the amount due emphasised, and the payment instructions with the IBAN in a monospace face.

- **Parts.** Build your own layout from `InvoiceHeader`, `InvoiceParties`, `InvoiceReferences`, `InvoiceLines`, `InvoiceAdjustments`, `VatBreakdown`, `InvoiceTotals`, `PaymentDetails` and `InvoiceNotes`. Each takes `invoice`, `lang` and an optional `locale`, or a `view` from `buildInvoiceView(invoice, lang)` to format once and share:

  ```tsx
  const view = buildInvoiceView(invoice, 'fr');
  <><InvoiceHeader view={view} /><InvoiceLines view={view} /><InvoiceTotals view={view} className="right" /></>
  ```

- **Styling.** `invoice.css` is plain CSS with one class per rule and no dependencies. Theme it with custom properties on any ancestor: `--einvoice-font`, `--einvoice-mono`, `--einvoice-size`, `--einvoice-ink`, `--einvoice-muted`, `--einvoice-rule`, `--einvoice-surface`, `--einvoice-subtle`, `--einvoice-accent`, `--einvoice-credit`, `--einvoice-radius`. `className` is added to the outermost element; `unstyled` leaves out every built-in class so the stylesheet does not apply and you can style the semantic markup yourself. The stylesheet is generated from the one `renderHtml` inlines (`bun run build:react-css`).
- **shadcn/ui.** Add the class `einvoice-shadcn` to the invoice (or any ancestor) and the variables come from your shadcn theme: `--foreground`, `--muted-foreground`, `--border`, `--background`, `--muted`, `--primary`, `--destructive`, `--radius`, `--font-sans`, `--font-mono`, so it follows your colours and dark mode. Neither shadcn nor Tailwind is a dependency. The mapping expects complete colour tokens (shadcn on Tailwind v4); with the older HSL-triplet tokens, set the `--einvoice-*` variables yourself, e.g. `--einvoice-ink: hsl(var(--foreground))`.

  ```tsx
  <Invoice invoice={invoice} lang="de" className="einvoice-shadcn" />
  ```
- **Safe by construction.** Text reaches the DOM only as React children and attribute values, which React escapes; the components never use `dangerouslySetInnerHTML`, and `test/react.test.tsx` renders an invoice with `<script>` and attribute-breaking strings in every field. No effects and no browser globals, so it renders on the server (`renderToString`, React Server Components) as well as in the browser. Element ids come from `useId`, or from `idPrefix` when you need stable ones.
- **Dependencies.** `react` and `react-dom` (18 or later) are optional peer dependencies; the React entry has no other peer dependencies. Only the `/react` entry imports React: the main entry and the HTTP server never do, which a test checks by walking their import graphs.
- **Demo.** `bun examples/react/render.tsx invoice.xml de > invoice.html` server-renders any supported file with the component into a standalone page.

## Writing UBL and CII

The optional `eu-einvoice-canonical/writers` entry point is the inverse of the parsers: a canonical invoice becomes a Peppol BIS Billing 3.0 UBL 2.1 document (`Invoice`, or `CreditNote` for `kind: 'creditNote'`) or an EN 16931 CII D16B `CrossIndustryInvoice`.

```ts
import { toCii, toUbl } from 'eu-einvoice-canonical/writers';

const ubl = toUbl(invoice);                          // string; keeps an EN 16931 based specification id, else Peppol BIS 3
const xr = toUbl(invoice, { profile: 'xrechnung' }); // or 'peppol-bis3' | 'en16931': stamps BT-24 and BT-23
const cii = toCii(invoice);
```

```
einvoice write --to ubl invoice.xml            # any invoice file: converted first, then written
einvoice write --to cii canonical.json         # the JSON `einvoice convert` printed (one invoice or an array)
einvoice write --to ubl --out out/ lot.xml     # several invoices: one <invoice-id>.xml each
```

- **Deterministic and well-formed.** The same invoice gives the same bytes: two-space indentation, elements in the order of the UBL 2.1 and CII D16B schemas (not the parser's), a declaration and a trailing newline. Text and attributes are escaped, and characters XML 1.0 forbids (control characters, lone surrogates) are dropped.
- **Decimals stay strings.** Amounts, quantities and rates are written exactly as the model holds them (`"100.0000"` stays `100.0000`); a value that is not an `xsd:decimal` throws `WriterError`. The only arithmetic is the exact BigInt sum from `values.ts`, used once: when the model has a VAT breakdown but no VAT total (BT-110), the total is the sum of the breakdown, because both syntaxes require one.
- **Only EN 16931 is written.** Country extensions, clearance data, withholdings, other taxes, payment schedules, extra parties and national type codes have no place in either binding and are left out. A document from a national format therefore comes back as an EN 16931 invoice, not as the original.
- **Where the syntax cannot hold a value** it is dropped, never invented: UBL has no credit note due date outside `PaymentMeans`, no sales order reference without an order reference, and no gross price without a discount; CII has no issue time, card network or sub-lines, one preceding invoice, and keeps BT-7 and BT-8 on the VAT lines. A payment with several credit transfers becomes several payment means in both. The full list, with reasons, is the allow-list in `test/writers.test.ts`.
- **Round trip.** The tests parse every fixture, write it as UBL and as CII and parse the result again. For EN 16931 based fixtures the canonical invoices must be equal apart from `source` and the allow-listed differences; for national formats the EN 16931 core (parties, totals, VAT breakdown, line ids and amounts) must be equal. Fixtures that are valid as received are also validated as written with the XSD and EN 16931 Schematron layers (and the Peppol / XRechnung layer when the syntax is unchanged).
- **Specification identifiers stay inside their syntax.** An EN 16931 based identifier is kept when it exists in the target syntax (Peppol BIS for UBL, XRechnung and NLCIUS for both); a Peppol identifier on a CII document or a Factur-X one on a UBL document is replaced by the EN 16931 base (CII) or Peppol BIS 3 (UBL), and `profile` overrides it.
- CII has one remittance reference, one direct debit mandate and one creditor identifier per document, so they apply to every payment means when the document is read back; a bank identifier that is not a BIC (`SE:BANKGIRO`) is not written as `BICID`.
- The VAT point date code (BT-8) is UNTDID 2005 in UBL and UNTDID 2475 in CII, so the writers translate it (5, 29, 72 and 3, 35, 432).
- A credit note written to CII whose type code is not a credit code is written as 381, since CII reads the direction from the type code.

## The canonical model

The core is still EN 16931-1, field for field, so every EN-based format maps 1:1. National formats carry concepts EN has no term for. Those go, in order of preference:

1. **EU-wide additions to the core**, used by several countries:
   - `withholdings` + `totals.withholdingTotal` (IT ritenuta, ES IRPF, PT retenção). `payable = taxInclusive − prepaid + rounding − withholdingTotal − splitPaymentVat` (the last term is Italian split payment, `EsigibilitaIVA = S`).
   - `otherTaxes` for non-VAT taxes (ES recargo de equivalencia, IT stamp duty).
   - `payments[]` (several means/accounts) and a separate `paymentSchedule[]` (due dates and amounts, optionally pointing at a payment entry). FatturaPA, Facturae and KSeF allow several of each; EN allows one.
   - `additionalParties[]` with a role for parties EN has no slot for: KSeF `Podmiot3` (factor, issuer on the seller's behalf, payer, additional buyer...), FatturaPA third-party issuer, Facturae third party, e-arve factor.
   - `nationalTaxIds` on parties (codice fiscale, NIP, NIF, OIB, AFM, IČO), because several formats identify parties only that way.
   - `nationalType` next to the UNCL 1001 `typeCode` (FatturaPA `TD04`, KSeF `KOR`, Facturae `OR`...), and `correction` for corrective-invoice reasons and methods.
   - `nationalCode` on VAT categories (FatturaPA Natura `N6.2` → `AE`, KSeF `oo` → `AE`), so the mapping can be audited.
   - On lines: `correctionState` (`before`/`after`/`delta`) for KSeF corrections that list each line before and after (`StanPrzed`), `otherTaxes`/`withholdings` for Facturae lines with several taxes, and `subLines` (XRechnung extension, Factur-X EXTENDED, France EXTENDED-CTC-FR).
   - `issueTime`, `exchangeRate`, `unitText` for free-text units.
2. **`clearance[]`**: tax-authority IDs (SdI ID, KSeF number, ANAF index, myDATA MARK), status and QR payload. Signatures go in `source.signatures` (CAdES, XAdES, detached).
3. **`extensions.{it,pl,es,hr,gr,pt,fr,de,cz,at,fi,ee}`** for country-only fields: split payment (IT `EsigibilitaIVA=S`, PL `P_18A`), Italian pension funds, CUP/CIG codes, KSeF annotations, DIR3 units in Facturae, Croatian operator OIB, ISDOC symbols...
4. **`source.unmapped`** (XPath → value) for anything left. `source.derived` records every inferred value and `source.warnings` records every lossy mapping.

`source` also carries `fileSha256` and `payloadSha256` (one received file can hold several invoices, so deduplicate on file hash + `indexInFile`/`fragmentPath`, not on invoice number), optional field-level `provenance` (canonical path → source XPath), and a `validation` summary kept per layer (parse, schema, semantic, profile, signature, clearance), where `unavailable` (validator could not run) is distinct from `failed`.

Other design rules are unchanged from the PEPPOL/Svefaktura version: decimal strings for money, `YYYY-MM-DD` dates, open code-list unions, credit notes keep their source signs (`effectiveSign()`), and EN-mandatory fields are optional in the type with a separate completeness check.

### Line roles and relations

Many invoices mix real items with lines that only describe or adjust other lines (a heading, "Utförande enligt anbud 5150", "8% Materialpåslag"). With `convert(bytes, name, undefined, { relations: true })` every invoice gets two extra fields beside `lines`; the lines and totals are never changed:

```
lineRoles: { '1': 'heading', '2': 'description', '3': 'description', '4': 'item', '5': 'surcharge', '6': 'item' }
relations: [
  { from: '5', to: ['4'], type: 'markup', rate: '8', method: 'arithmetic', confidence: 'proven' },
  { from: '1', to: ['4', '5', '6'], type: 'heading', method: 'rule', confidence: 'review' },
]
```

- **Descriptors** have zero amount, quantity and price. The rule treats a run of them as a possible heading for the priced lines after it, until the next run or a change of order reference (`line.national.orderReference`, when a parser sets it). This grouping is inferred and always marked `confidence: 'review'`.
- **Percentage lines**: the rate is read from the text (`10%`, `10 %`, `10,5%`) and the earlier lines of the group are searched, with exact decimals, for the set whose net amounts times the rate equal the line's amount: contiguous runs first, then subsets of up to four of the twelve nearest lines. One match is `proven`. Several matches, or none, add `LINE-RELATION-AMBIGUOUS` or `LINE-RELATION-UNMATCHED` to `source.warnings` and record no relation.
- Also found: line allowances whose base amount is another line (`allowance-base`), notes naming another line (`note-reference`), and shared item ids or order-line references (`same-item`, `same-order-line`, always `review`).
- `method` says how a relation was found (`rule`, `arithmetic` or `model`), not whether it is correct. `confidence` is `proven`, `likely` or `review`; an absent value means unspecified confidence. Deterministic rules can still infer the wrong relationship, so heading relations require review.

The browser converter’s **Lines** tab exports selected canonical JSON for a model and validates pasted annotation responses. Imported annotations stay separate from the invoice and are marked unreviewed; the converter makes no model request. See [canonical line annotations](docs/LINE-ANNOTATIONS.md) for the prompt, settings, examples and schema.

The separate [evaluation page](https://alexcatdad.github.io/eu-einvoice-canonical/eval/) (`site/eval.ts`) retains the original browser-model integration (`site/model.ts`: WebLLM with Qwen3, or Chrome's Gemini Nano). It scores the rules and models on the labelled set in `src/relations/labelled.ts` and records accuracy, time, download size and memory. Its legacy `applyModelLabels(invoice, labeller)` merges output without overriding a rule and marks model relations `method: 'model'`, `confidence: 'review'`.

For a separate, provider-independent consumer example, see [canonical line annotations](docs/LINE-ANNOTATIONS.md). It uses HuJSON for human-edited assets, standard JSON for model requests, and strict validation of complete annotation responses. It preserves the source invoice and represents unresolved roles and subjects separately; it does not replace the existing relation rules.

## JSON Schema

Consumers that are not written in TypeScript can validate and generate code from the output with three JSON Schemas (draft 2020-12), generated from the types and published with the site:

- [`canonical-invoice.v1.schema.json`](https://alexcatdad.github.io/eu-einvoice-canonical/schemas/canonical-invoice.v1.schema.json): one `CanonicalInvoice`
- [`convert-result.v1.schema.json`](https://alexcatdad.github.io/eu-einvoice-canonical/schemas/convert-result.v1.schema.json): what `convert()` returns (`outcomes[].invoices[]` are `CanonicalInvoice`s)
- [`inspect-result.v1.schema.json`](https://alexcatdad.github.io/eu-einvoice-canonical/schemas/inspect-result.v1.schema.json): what `inspect()` returns, including the `Detection` type

Decimals, dates and times are strings with a `pattern`; open code lists (currency, country, VAT category, unit...) are plain strings whose common values are listed under `examples`; the BT/BG comments are the `description`s. Objects are open (`additionalProperties` is not false), so a payload from a newer minor release still validates. `bun run build:schemas` rewrites the files (and `schemas/formats.json` and `openapi/openapi.json`) and the CI `test` job runs `bun run check:schemas`, which fails when the committed files differ from the types. Every test fixture's converted output is validated against them in `test/schema.test.ts`.

### Schema versioning

The library exports `schemaVersion` (`'v1'`), the major version in the schema file names and `$id`s.

- **Additive changes keep v1**: new optional fields, new extension blocks, new code-list examples, new formats, new warning codes. Files are regenerated in place.
- **Breaking changes go to v2**: removing or renaming a field, changing a field's type or meaning, making an optional field required, or narrowing a pattern. `*.v2.schema.json` is published next to the v1 files, which stay available at their URLs.

## Conversion API (HTTP)

`einvoice serve` starts a small stateless server that implements [`openapi/openapi.yaml`](openapi/openapi.yaml) (OpenAPI 3.1) with the same `convert()`, `inspect()` and `detectXml()` as the library. The rendered reference is at [/api-reference/](https://alexcatdad.github.io/eu-einvoice-canonical/api-reference/) on the site.

```sh
einvoice serve --port 8080 --cors          # or: bun src/cli.ts serve
curl -X POST --data-binary @invoice.xml -H 'Content-Type: application/xml' 'http://localhost:8080/v1/convert?relations=true'
curl -X POST -F file=@invoice.pdf http://localhost:8080/v1/inspect
```

| Endpoint | Does |
| --- | --- |
| `POST /v1/convert` | File (multipart `file` or raw body) to `ConvertResult`. Query: `validate`, `relations`, `provenance`, `euTrust`, `filename`. |
| `POST /v1/inspect` | Unwrap and detect to `InspectResult`. |
| `POST /v1/detect` | Raw XML to a `Detection`. |
| `GET /v1/formats` | The format registry: id, name, family, countries, status. |
| `GET /v1/schemas/{name}` | `canonical-invoice`, `convert-result` or `inspect-result` JSON Schema. |
| `GET /health` | Liveness, package and schema versions. |

Errors are `application/problem+json` ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)) and use the CLI's exit-code categories as `type` URIs ([listed here](https://alexcatdad.github.io/eu-einvoice-canonical/problems/)): `unsafe-or-malformed` (400, and 413 for a limit), `unsupported`, `validation-failed` and `partial` (422, with the full result in `result`), `validator-unavailable` (503) and `internal` (500). `?euTrust=true` needs a trusted-list snapshot, so start the server with `--eu-trust`; `?validate=true` runs the XSD and Schematron layers. Missing, unsupported or size-limited required checks answer 503 even if another layer passes; failed checks answer 422. Conversion errors retain any independently obtained validation report on the outcome.

The server writes nothing to disk and keeps no state. The upload is read through a counting reader and refused with 413 as soon as it passes `maxFileBytes` (50 MiB; `--limits '{"maxFileBytes":10485760}'` lowers it, the other `UnwrapLimits` apply too). CORS is off unless you pass `--cors` (any origin) or `--cors=https://app.example`. It listens on 127.0.0.1 by default; there is no authentication, so put it behind your own gateway before exposing it.

The Docker image runs the same command from the Bun runtime image:

```sh
docker build -t einvoice-api .
docker run --rm --read-only -p 8080:8080 einvoice-api      # add --cors or --limits after the image name
```

Contract tests (`test/api-contract.test.ts`) start the server in-process, send every fixture through every endpoint and check status, headers and body of each response against `openapi.yaml`; the spec itself is validated as OpenAPI 3.1 and its references into `schemas/` are checked, so the spec and the generated schemas cannot drift.

## Deliverables and versioning

What the project publishes, all from the same TypeScript sources and listed on the [Deliverables page](https://alexcatdad.github.io/eu-einvoice-canonical/deliverables/):

| Deliverable | Where | Version |
| --- | --- | --- |
| TypeScript library and types | this package (`src/index.ts`), [TypeDoc](https://alexcatdad.github.io/eu-einvoice-canonical/api/) | package semver (`package.json`) |
| JSON Schemas | `schemas/*.v1.schema.json`, published at `/schemas/` | `v1` in the file names and `$id`s |
| Format registry | `schemas/formats.json`, `GET /v1/formats` | follows the package |
| HTTP API | `openapi/openapi.yaml` (and `.json`), `einvoice serve`, the Dockerfile | `/v1` path prefix; the spec carries its own `info.version` |
| Command line | `einvoice` binaries on each [GitHub release](https://github.com/alexcatdad/eu-einvoice-canonical/releases/latest) | package semver |
| Browser converter, conformance checklist, corpus results | the Pages site | built from `main` |

Version 2 removes downstream bookkeeping, purchase-order matching and duplicate detection, and moves optional rendering, XML writers and trust-list maintenance to separate entry points. See [Migrating to v2](docs/MIGRATION-V2.md). Canonical JSON schemas and HTTP responses remain on `v1`.

**Compatibility promise.** The JSON Schema major version and the API prefix move together: `v1` stays compatible for as long as it is published.

- *Additive changes keep `v1` (a minor or patch release):* new optional fields, new extension blocks, new formats and code-list values, new warning codes, new endpoints or query parameters. Objects are open and clients must ignore fields they do not know.
- *Breaking changes get `v2` (a major release):* removing or renaming a field, changing its type or meaning, making an optional field required, narrowing a pattern, removing an endpoint or changing a problem `type`. `*.v2.schema.json` and `/v2` are published next to v1, and the v1 files and endpoints stay available.
- *Package semver* follows the TypeScript API: a major release for breaking changes to exported functions and types, which also bumps the schema and API version when the output shape changed. The CLI's exit codes and the problem `type` URIs are part of the promise.
- Everything generated is checked in CI: the schemas, `formats.json` and `openapi.json` are rebuilt and compared (`bun run check:schemas`), and the contract tests fail when a response no longer matches the spec.

## EU coverage

What you will receive from each country, inbound. Format IDs refer to `src/formats.ts`. Every country also sends Peppol BIS 3 (`peppol-bis3`) cross-border.

| Country | Formats you will see | Notes |
|---|---|---|
| AT | `ebinterface` 3.0–6.1, `peppol-bis3`, legacy `ebinterface-2` (detected, not mapped) | The portal accepts 4.3–6.1; ebInterface 7.0 announced for Q4 2026. |
| BE | `peppol-bis3`, legacy `ubl-be` | B2B Peppol mandate since 1 Jan 2026. |
| BG | `en16931-ubl` / `-cii`, `peppol-bis3` | No exchange mandate yet; B2B proposed for 2028. |
| HR | `hr-cius`, `peppol-bis3` | Fiskalizacija 2.0: B2B and B2G since 1 Jan 2026. OIB = EAS 9934. |
| CY | `peppol-bis3` | B2G. |
| CZ | `isdoc` (`.isdoc`, `.isdocx`), `peppol-bis3` | No B2B mandate. |
| DK | `oioubl-2` (UBL 2.0), `oioubl-3`, `peppol-bis3` | OIOUBL 2.x still common. |
| EE | `e-arve`, `en16931-ubl`, `peppol-bis3` | Since Jul 2025 buyers can require e-invoices. e-arve files can hold several invoices. |
| FI | `finvoice`, `teappsxml`, `peppol-bis3` | Finvoice usually follows a SOAP envelope in the same file and is often ISO-8859-15. |
| FR | `facturx`, `fr-ctc-ubl`, `fr-ctc-cii`, `en16931-ubl` / `-cii` | All businesses must receive from 1 Sep 2026. Factur-X BASIC WL accepted until Sep 2027. CII D22B. |
| DE | `xrechnung-ubl`, `xrechnung-cii`, `facturx`, legacy `zugferd-1` | Receiving obligation since Jan 2025, sending from Jan 2027. MINIMUM/BASIC WL are not valid e-invoices. |
| GR | `gr-mydata`, EN 16931 (UBL/CII), `peppol-bis3` (B2G) | B2B phases from Feb 2026 (large) and Oct 2026 (others). MARK from myDATA. |
| HU | `peppol-bis3`, `en16931-*` | Online Számla is tax reporting, not an exchange format. |
| IE | `peppol-bis3` | B2G; B2B phased from Nov 2028. |
| IT | `fatturapa` (FPR12/FPA12), `fatturapa-semplificata` | All domestic invoices via SdI, often CAdES `.p7m`, sometimes lots. `peppol-bis3` with AGID extension for public-sector ordering. |
| LV | `peppol-bis3` | B2G since Jan 2026; B2B deferred to Jan 2028. |
| LT | `peppol-bis3`, `en16931-*` | B2G. |
| LU | `peppol-bis3` | B2G. |
| MT | `peppol-bis3` | B2G. |
| NL | `nlcius-ubl`, `nlcius-cii`, `peppol-bis3`, legacy `peppol-bis2` (SI-UBL 1.x) | |
| PL | `ksef` FA(3) (also FA(2), FA_RR), `pl-pef` (B2G) | KSeF mandatory since 1 Feb 2026 (large) / 1 Apr 2026 (others). The KSeF number is not in the XML. |
| PT | `cius-pt`, `peppol-bis3` | B2G. B2B is mostly PDF with ATCUD/QR. |
| RO | `cius-ro` | Mandatory via ANAF SPV; downloads are ZIPs with a detached signature. |
| SK | `peppol-bis3` | B2B and B2G planned from 1 Jan 2027. |
| SI | `eslog-2`, `peppol-bis3`, legacy `eslog-1` | B2B mandatory from 1 Jan 2028. |
| ES | `facturae` 3.2.x (`.xsig`), later UBL/CII | B2G via FACe. B2B Royal Decree approved 24 Mar 2026 (Facturae, UBL, CII, EDIFACT); start depends on the ministerial order. |
| SE | `peppol-bis3`, legacy `svefaktura-1` | |

## Beyond the EU

Peppol PINT and Saudi ZATCA are UBL documents, so they run through the UBL parser; each adds its own fields in `extensions`.

| Format ID | Identifier | What is mapped |
|---|---|---|
| `pint-sg` | `urn:peppol:pint:billing-1@sg-1` | GST is a VAT-like scheme (`vatId`), UEN from the endpoint, GST categories used: `extensions.sg` |
| `pint-aunz` | `urn:peppol:pint:{billing,selfbilling}-1@aunz-1` | ABN or NZBN, GST: `extensions.au` or `extensions.nz` by country; self-billing sets `selfBilled` |
| `pint-jp` | `urn:peppol:pint:{billing,selfbilling,nontaxinvoice}-1@jp-1` | Qualified invoice issuer number (`T` + 13 digits) in `extensions.jp`; the non-tax-registered variant has none |
| `pint-my` | `urn:peppol:pint:billing-1@my-1` | TIN (scheme GST) and SST (scheme VAT), MSIC code, FTA / certified exporter / customs references, LHDN UUID: `extensions.my` |
| `pint-ae` | `urn:peppol:pint:billing-1@ae-1` | The eight transaction-type flags, UUID, TIN, registration type and authority, exchange rate; line commodity and nature codes in `line.national`: `extensions.ae` |
| `pint-om`, `pint-eu` | `…@om-1`, `…@eu-1` | Detected and parsed as plain UBL |
| `peppol-pint` | `urn:peppol:pint:billing-1`, other `@xx-n`, older BIS Billing International | Plain UBL mapping |
| `zatca-ubl` | `ProfileID reporting:1.0` | See below |

Category codes of PINT SG and MY are not UNCL 5305; `categoryCode` keeps them as sent. PINT suites are qualified locally but excluded from distribution while artifact permissions remain unresolved (see `validation/distribution.json`). The UBL schema check alone leaves full-source validation incomplete.

**ZATCA (Saudi Arabia).** `InvoiceTypeCode/@name` (NNPNESB) gives the standard/simplified subtype and the third-party, nominal, exports, summary and self-billed flags. UUID, ICV, PIH, the invoice hash, the XAdES signature (the cryptographic stamp) and the QR code go into `clearance[0]` (authority `SA:ZATCA`) and `extensions.sa`; the QR TLV is decoded into fields and compared with the invoice. The invoice hash is recomputed with ZATCA's transforms (drop `UBLExtensions`, `cac:Signature` and the QR reference, canonicalize, SHA-256) and compared with the signature digest and QR tag 6: `extensions.sa.hashCheck` says `match`, `mismatch` or `not-checked`, and a mismatch is a warning, never an error. Credit notes (type 381 on an `Invoice` root) become `kind: 'creditNote'`. Hijri dates in date fields are converted with the tabular calendar (it can be a day off from Umm al-Qura), recorded in `extensions.sa.hijriDates` and `source.derived`.

## Build order

| Phase | Parser family | Formats it covers | Mapping notes |
|---|---|---|---|
| 1 | `ubl` | Peppol BIS 3 + self-billing, XRechnung UBL, NLCIUS, CIUS-RO, CIUS-PT, HR-CIUS, OIOUBL 3, UBL.BE, PINT, BIS 2 (best-effort), OIOUBL 2 | One parser, profile-specific rules on top. Invoice vs CreditNote element names differ (`InvoicedQuantity`/`CreditedQuantity`). UBL 2.1 CreditNote has no root `cbc:DueDate`: read `cac:PaymentMeans/cbc:PaymentDueDate`, and accept a root `cbc:DueDate` only as a fallback with a warning (it appears in some XRechnung test files). |
| 1 | `cii` | Factur-X/ZUGFeRD 2.x all profiles, XRechnung CII, NLCIUS CII, France CII | D16B and D22B share the root namespace. MINIMUM/BASIC WL have no lines. |
| 2 | `fatturapa` | FatturaPA, semplificata | Child elements are unqualified (no namespace). Several `FatturaElettronicaBody` per file. Natura → VAT category, RT0x → withholdings, cassa previdenziale → charge + `extensions.it`. SdI ID from the separate metadata file. Done: see `src/parsers/fatturapa.ts` (FPR12/FPA12 and FSM10; TD04/TD08 are credit notes; split payment → `totals.splitPaymentVat`; bollo → `otherTaxes` + `extensions.it.stampDuty`). |
| 2 | `ksef` | FA(2), FA(3), FA_RR | `P_12` rate codes (`23`, `zw`, `oo`, `np I`, `0 WDT`...) → VAT category. `P_14_xW` = VAT in PLN. `StanPrzed` → `correctionState`. `Podmiot3` + `Rola` → `additionalParties`. KSeF number from download metadata. |
| 2 | `facturae` | Facturae 3.2–3.2.2 | Batches (`Modality L`). `TaxesWithheld` → withholdings, recargo → `otherTaxes`. XAdES signature inside. |
| 2 | `isdoc`, `ebinterface`, `finvoice`, `e-arve`, `eslog` | National formats in active B2B use | ISDOC symbols → `extensions.cz`; ebInterface varies by version; Finvoice: SOAP + ISO-8859-15; e-arve: several invoices per file; eSLOG uses EDIFACT segment names (`S_BGM`, `G_SG26`...). |
| 3 | `svefaktura`, `zugferd1`, `teappsxml`, `mydata`, `cfdi` | Legacy and low-volume (`cfdi` is Mexican, see above) | Svefaktura follows SFTI's "Mapping of Svefaktura 1.0 onto EN 16931-1" (see `src/parsers/svefaktura.ts`). |

Done: `ubl`, `cii`, `svefaktura` and `fatturapa`. Corrective documents whose direction depends on the amounts (KSeF KOR, Facturae rectificativa, ISDOC) must set `kind` from the sign of the correction total; see `effectiveSign()` in `src/canonical.ts`.

### Mexico: CFDI (`mx-cfdi`)

Mexico is outside the EU; CFDI 4.0 (and 3.3 in older files) is supported because it is a clearance format with the same withholding and extra-tax concerns. `cfdi:Comprobante` with `TipoDeComprobante` I is an invoice and E (egreso) a credit note. T (traslado), P (pago, Pagos 1.0/2.0) and N (nómina) are not invoices: detection returns them as other documents with their own label, and `convert` reports `not-an-invoice`.

| CFDI | Canonical |
|---|---|
| Emisor / Receptor `Rfc` | `nationalTaxIds` with scheme `MX:RFC` (no `vatId`: Mexican IVA has no VAT number). `NumRegIdTrib` of a foreign receiver is a second national id |
| `RegimenFiscal`, `RegimenFiscalReceptor`, `DomicilioFiscalReceptor`, `UsoCFDI`, `ResidenciaFiscal`, `LugarExpedicion`, `Exportacion`, `MetodoPago`, `FormaPago`, `InformacionGlobal`, issuer `Sello` / `NoCertificado` | `extensions.mx`. The receiver's postal code is also `buyer.address.postalCode`; the issuer has no address in a CFDI |
| `Concepto` | `lines`: `ClaveProdServ` is an item classification (`MX:ClaveProdServ`), `ClaveUnidad` is `unitCode` (SAT's catalogue is UN/ECE Rec 20 plus a few SAT codes) and `Unidad` is `unitText`; `ObjetoImp` and `ClaveUnidad` are kept in `line.national`. `Descuento` is a line allowance and `netAmount` is `Importe - Descuento` |
| Traslado IVA (002) | `vatBreakdown` and `line.vat`: Tasa 0.16 is `S` with rate 16, Tasa 0 is `Z`, Exento is `E`. `ObjetoImp` 01 gives `O` |
| Traslado IEPS (003) and others | `otherTaxes` (`MX:IEPS`, `includedInTotal`) |
| Retenciones ISR (001), IVA (002), IEPS (003) | `withholdings` (`MX:ISR`, `MX:IVA`), `totals.withholdingTotal`; the line-level base and rate are on `line.withholdings` |
| `SubTotal`, `Descuento`, `Total` | `lineNetTotal = taxExclusive = SubTotal - Descuento`, `payable = Total`, `taxInclusive = Total + retenciones`. The original `SubTotal` and `Descuento` are in `extensions.mx` |
| `FormaPago` | `payments[]`: 01 cash (10), 02 cheque (20), 03 transfer (30), 04 credit card (54), 28 debit card (55); the rest are `ZZZ` with the SAT label |
| `CfdiRelacionados` | `precedingInvoices`: the UUID is `id` and `clearanceId`, `TipoRelacion` is `relationType` (01 credit note, 04 substitution...) |
| `TimbreFiscalDigital` | `clearance` with authority `MX:SAT`: UUID, `FechaTimbrado`, `NoCertificadoSAT`, `SelloSAT` (not verified), and the PAC (`RfcProvCertif`) as `intermediary` |

What the model cannot say, and where it goes:

- **No generic tax model.** Every CFDI tax fits `vatBreakdown`, `otherTaxes` or `withholdings`, but two things are lost in shape. IEPS as a fixed amount per unit (`TipoFactor` Cuota) has no rate: `otherTaxes[].rate` is left out and `MX-TAX-CUOTA` is warned (the amount and the quantity base are kept). Document-level retenciones state no base or rate in a CFDI, so `withholdings[].taxableAmount` and `rate` are empty there; the lines carry them.
- **Local taxes** (complement Impuestos Locales, for example the lodging tax) change `Total` but are not mapped, so the BR-CO-15 / 16 totals check will warn on such files; `MX-COMPLEMENT-UNMAPPED` names the complement. The same warning covers Comercio Exterior, Carta Porte, INE and every other complement except the stamp.
- IVA `Exento` has no `Importe`; the breakdown uses a tax amount of 0. CFDI 3.3 states no `Base` at document level, so it is summed from the lines (recorded in `source.derived`).
- `Fecha` has no time zone; the time goes to `issueTime` as written. Amounts are in `Moneda`; `TipoCambio` (conversion to MXN) is `exchangeRate`.
- The issuer's `Sello` is a digital seal over the original string, not an XML signature, and is not verified. The same holds for `SelloSAT`.
- `Addenda`, `Parte`, `ACuentaTerceros` and `ComplementoConcepto` are not mapped.

Run `scripts/sweep.ts` over a few months of your real inbound files before building phase 2. It shows which formats you actually receive.

## What was tested

CI (`.github/workflows/ci.yml`) runs all of this on every push and pull request, and deploys the browser converter only when everything passes. The site build checks that every README section has a page and that no internal link or `#fragment` is broken (`site/check.ts`), and `site/a11y.ts` runs axe-core in the light and dark themes on the converter (every result tab) and the docs, checks that nothing scrolls sideways at 320 and 375 px, that keyboard focus is visible and that no page requests anything from another host but the fonts.

- **Detection (every fixture plus header-only cases):** each of the 27 fixtures, envelopes, versions and profiles; every UBL and CII profile rule (Peppol, EHF extension, self-billing, XRechnung, NLCIUS, CIUS-RO/PT, HR-CIUS, OIOUBL 2/3, PINT, UBL.BE, EN 16931 2017/2026, BIS 2, Factur-X MINIMUM to EXTENDED, ZUGFeRD 2.0); probe edge cases (a 4,000-element UBLExtensions block, CDATA, a foreign-namespace CustomizationID, prefixed roots, whitespace in a namespace).
- **Parsers:** field-by-field assertions on synthetic fixtures written for this suite (see `test/fixtures/README.md`): a full Peppol BIS 3 invoice, a credit note, a negative 380 invoice, XRechnung UBL and CII, Factur-X BASIC (381) and MINIMUM, and Svefaktura 1.0 invoice and credit. The real samples (ANAF, HR-CIUS, PINT, Factur-X PDF) must parse with no BR-CO warnings. Also tested: a malformed amount gives an `error` that names the element, and tampered totals give BR-CO warnings with the values left untouched.
- **Hostile input:** DOCTYPE with internal entities and with an external DTD; file, entry, total-size, entry-count, payload-count and nesting limits; a ZIP whose header understates its size; a 64 MB PDF attachment bomb without a declared size (stopped at the limit); payload hashes equal across different wrappers.
- **Values:** decimal parsing (trailing zeros kept, commas and exponents rejected), dates (format 102, date-times, invalid calendar dates) and XPath-compatible rounding.
- **Known-answer sweep:** `bun run sweep:fixtures` checks every fixture against `test/fixtures/expected.json`. Run the same mode on a labelled sample of your own inbound files: a plain sweep only shows coverage, not whether the detected format is right.
- **Real-sample sweep (reported by the earlier version, detection only; not re-run for this repository):** 6,427 files from the phive-rules validation suites, KoSIT XRechnung tests, Mustang (ZUGFeRD/Factur-X PDFs) and OCA's FatturaPA tests. 4,840 invoices were detected across 27 format IDs and 1,543 non-invoices (orders, responses, catalogues, France CDAR status messages) were recognised as such. The 34 files left unknown are all non-invoices: Schematron rule files, HR-XML staffing messages and a deliberately invalid test file. One real Italian invoice had a space inside its namespace URI; detection now tolerates that.

## Security

Inbound files are treated as hostile. `unwrap()` rejects XML with a DOCTYPE (entity expansion, external DTDs) and caps file size (50 MB), per-entry and total uncompressed size (50 MB / 200 MB), ZIP entries (1,000), XML documents per file (500) and nesting depth (6). All limits are overridable per call.

No decompression runs unbounded:
- **ZIP:** an entry is checked against its declared size before it is inflated, and fflate never writes past that size. Entries whose compressed data is larger than deflate could produce for the declared size (a header that lies) are refused without inflating.
- **PDF:** the optional `/Params /Size` allows an early refusal, but it is not trusted. The attachment stream is inflated in 4 KB slices and stopped as soon as the output passes the limit. Only `FlateDecode` (zlib or raw) and unfiltered streams are accepted.

Skipped files and the reason are returned by both `inspect()` and `convert()`, so a rejected file is never just an empty result.

Release binaries come with `SHA256SUMS`, a CycloneDX SBOM and signed build provenance; verify a download with `gh attestation verify` (see [docs/SUPPLY-CHAIN.md](docs/SUPPLY-CHAIN.md)). To report a vulnerability, see [SECURITY.md](SECURITY.md).

## Decisions

- **VAT stays EN-shaped.** Every EU format is VAT-based, so `vatBreakdown` and line `vat` stay as in EN 16931, with `otherTaxes` and `withholdings` beside them. A generic multi-scheme tax model only pays off for non-EU fiscal formats (CFDI, NF-e).
- **`kind` is only the accounting direction** (`invoice` / `creditNote`). Debit notes, corrected, prepayment and self-billed invoices are UNCL 1001 `typeCode`s plus `selfBilled`, `nationalType` and `correction`, which combine freely; a single wider enum could not express a self-billed corrective credit note.
- **`id` and `issueDate` are required.** Every EU format mandates them; a document without them is a parse error, not a partial invoice.
- **Extensions are typed per country**, not a free-form list, so a parser cannot silently write a field nobody reads.

## Known gaps

- **Unverified detection rules:** `ubl-unknown` and `cii-unknown` are fallbacks, not confirmed formats. The Croatian spec spells its own identifier inconsistently, so `hr-cius` only checks for `urn:mfin.gov.`.
- **EN 16931-1:2026** (published March 2026; 164 to 216 business terms and 32 to 39 groups, per trade press) is not modelled beyond the identifier. Checked on 2026-10-16: the ConnectingEurope validation artefacts (v1.3.17, UBL 2.1 / CII D16B) and the KoSIT XRechnung Schematron (v2.6.0, XRechnung 3.0) contain no 2026 terms, and the EN 16931-1:2026 text and the updated CEN/TS 16931-3-x bindings are paywalled, so neither the exact BT/BG ids and names nor their UBL/CII paths are confirmed. Secondary sources mention multiple payment terms (BG-33), early-payment discounts (BG-35) and line-level delivery (BG-37) but disagree on detail, so nothing was added to `src/canonical.ts` or the parsers. Missing: the CEN/TS 16931-3-1 and 3-3 binding tables, or the 2026 Schematron/XSD once ConnectingEurope or Peppol BIS publish them. 2026-identified documents still parse, with the 2017 terms only.
- **Signature trust:** signatures are verified cryptographically; signers are checked only when you pass `trustAnchors` or an `euTrust` snapshot. The snapshot is only as current as its fetch date and drops services the lists identify by name or key id without a certificate, and no revocation check is made on the signer's own certificate.
- **Validation is conditional on the exact version and profile.** Default distributions contain 43 approved bundles, including UBL/CII and XRechnung/NLCIUS rules; the full local qualification corpus has 107. Native Peppol/PINT, Svefaktura and other unresolved artifacts are excluded by `validation/distribution.json`. Missing native/profile rules make full-source validation incomplete even when an XSD passes. Older Finvoice, ISDOC, e-arve and eSLOG versions are not checked against a newer schema. Schematron defaults to a 2,000-line limit: skipped required layers retain `not-run` with `reasons[layer]: "size-limit"` and an incomplete result. Raise or lift it with `validation: { maxSchematronLines }`. See [source validation](docs/SOURCE-VALIDATION.md) for result semantics, replay and browser limits.
- **Synthetic fixtures:** most national parsers were built from specifications and tested on synthetic files. Formats without a converted real sample are listed in the conformance checklist; run `sweep --expect` on your own inbound files before relying on them.
- **Peppol PINT and ZATCA validation:** PINT suites are qualified locally but excluded pending redistribution permission; ZATCA native suites remain unqualified (see `validation/NOTICE`). Default outputs run only the UBL XSD and full-source validation remains incomplete. PINT OM and EU are mapped as plain UBL. A Hijri date whose day does not exist in the Gregorian month of the same number (for example `1446-02-30`) is rejected as an invalid date before conversion.
- **Non-XML formats:** EDIFACT INVOIC is out of scope. PDFs without embedded XML are read only with `extractPdf`, from born-digital text (no OCR), with Swedish rules first (see [PDF text extraction](#pdf-text-extraction-opt-in)).

## License

[0BSD](LICENSE) (BSD Zero Clause): use, copy, change and distribute it for any purpose, with or without attribution. It comes with no warranty, and the author accepts no liability for its use.

Third-party sample files under `test/fixtures/` keep their own licences (Apache License 2.0 for the phive-rules and Mustang samples; see `test/fixtures/README.md`).
