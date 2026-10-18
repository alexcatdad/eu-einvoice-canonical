# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This file was reconstructed from the git history. Numbers in brackets are pull requests.

## [Unreleased]

Validation additions below describe local qualification. The distributed subset is explicitly controlled by `validation/distribution.json`.

### Added

- Local France RFE 1.4.0.04 strict UBL, CII and Factur-X suites, PINT billing specializations for seven jurisdictions and distinct self-billing chains for five. Exact process and customization controls prevent unsupported contracts from receiving a complete pass.
- Additional historical validation artifacts for ebInterface 3.0/3.02, ISDOC releases and ordinary e-arve 1.2. Schema-only coverage remains explicitly incomplete for full-source validation; ordinary e-arve requires a caller-selected edition.
- Historical Peppol BIS 2 and UBL.BE 1.31 validation with pinned publisher rule chains, exact source contracts and independent positive, negative and warning controls.
- Local OIOUBL 2.02 validation with UBL 2.0 and pinned historical authority rules 1.11.1.35666 for invoices and credit notes, preserving warning/fatal severities and keeping generation-specific rule selection.
- Source validation reports required coverage, incomplete results and versioned receipts; standalone `validateSource` retains findings independently of canonical mapping. Adds native Svefaktura and NLCIUS rules and a coherent Peppol May 2026 suite.
- Inferred heading relations now carry `confidence: 'review'`, with their targets and review indicator visible in the converter. Missing confidence no longer implies certainty in the documentation or display.
- Browser converter: export selected canonical annotation input and validate imported annotations separately, with an unreviewed download, a synthetic example and eight-language controls. Replaces the converter's in-browser model panel.
- Optional canonical value-origin metadata and canonical field references on warnings, preserved by the line-annotation consumer. Traced text-only lines distinguish substituted zero amounts from source-supplied values.
- Writers: canonical JSON back to Peppol BIS 3 UBL 2.1 and EN 16931 CII D16B (`toUbl`, `toCii`) [#42]
- Human-readable rendering: `renderHtml`, `renderPdf` and `einvoice render` [#39]
- Site internationalisation: English, German, French, Italian, Spanish, Dutch, Polish and Romanian [#41]
- Conversion API: OpenAPI 3.1 spec, reference server, contract tests, API docs and a Deliverables page [#34]
- Bookkeeping export: journal entries, SIE 4I, CSV and JSON, CLI and site download [#27]
- MCP server for AI agents (`einvoice mcp`) [#35]
- Real-world corpus run with a published report and a "Real-world results" page [#31]
- Fuzzing that checks hostile input never crashes or hangs the converter [#33]
- Benchmarks and a performance gate in CI [#36]
- Peppol PINT variants and Saudi ZATCA on top of the UBL parser [#30]
- Real public samples with known-answer tests, and a corpus parse check [#29]
- Detection of duplicate and re-sent invoices [#23]
- Opt-in checking of signers against the EU trusted lists [#26]
- Schema validation layer for the national formats [#28]
- Two-way and three-way matching of invoices to purchase orders [#25]
- CFDI 3.3/4.0 parser (Mexico); Pagos documents are detected as another document type [#24]
- Versioned JSON Schemas for `CanonicalInvoice` and `ConvertResult` [#22]

### Changed

- Distribute 43 validation bundles with reviewed permission evidence, source closures and notices; retain 64 others only for local qualification. Native Peppol/PINT, Svefaktura and several previously bundled national schemas are excluded. Their absence leaves source validation incomplete while conversion remains available. Git, npm, compiled CLI, Docker and Pages enforce the same inventory.

- The site is an Astro build: Starlight docs generated from the README (with Pagefind search, the TypeScript API from starlight-typedoc and the HTTP API from a self-hosted Scalar), the converter as a React island on the library's `<Invoice>` component and shadcn/ui, old page addresses redirected, and an accessibility gate in CI

- Supply-chain hardening: pinned actions, least-privilege permissions, attestations, SBOM and OpenSSF Scorecard [#37]
- Dependency updates for GitHub Actions and the Docker base image [#38, #40]
- Performance speed-ups found by the benchmarks [#36]

### Fixed

- Restrict ebInterface 4.0 schema import localization to `schemaLocation` attributes so rebuilding preserves XML namespace identifiers.
- Remove stale CLI sidecar files from reused release directories before packaging.

- Execute attribute-context rules in the compiled BIS 2 and CIUS-RO suites using the compiler's supported key selection. Invalid MIME, identifier-scheme, currency and unit attributes now reach their original assertions.
- Send compiled stylesheets to browser workers as JSON text, avoiding Chromium's structured-clone failure on deeply nested stylesheet objects. A hash-constrained, equivalent BIS 2 MIME membership expression avoids WebKit's checksum stack overflow.

- Validation selects finite source contracts and keeps ambiguous editions, future declarations and unchecked extensions incomplete. The library and converter offer explicit CII D16B and e-arve 1.2.EN choices. The coverage gate requires independent evidence for each registered route, including routes that reuse bundles.
- CLI `--validate` now executes source validation, including in quiet mode. HTTP rejects incomplete required checks, and MCP retains validation reports when canonical mapping fails. Coverage reports use observed source versions and distinguish detection-only formats.
- Finvoice, KSeF and TEAPPSXML derivation paths use canonical line positions rather than source row numbers, including after informational rows are omitted.
- CodeQL high alerts: linear `<think>` stripping and JSON span, single-run whitespace in `NOTE_LINE`, stable comment stripping [#32]

## [1.2.0] - 2026-10-15

### Added

- Line roles and relations: descriptors, markups and optional model labels [#19]
- Conformance checklist per format, with validation layers derived from the plan and recorded mapping sources; fixtures for 15 more formats [#20]
- CI coverage gate and the per-format conformance checklist [#15]
- Biome lint and formatting [#18]
- Finvoice, e-arve and eSLOG 2.0 parsers [#12]
- ZUGFeRD 1.0, TEAPPSXML and myDATA parsers [#14]
- Opt-in XSD and Schematron validation for UBL and CII [#13]
- ISDOC and ebInterface parsers [#11]
- KSeF parser (FA(2), FA(3), FA_RR) [#10]
- Facturae 3.2.x parser [#7]
- FatturaPA parser (FPR12, FPA12 and FSM10) [#6]
- Verification of CAdES, XAdES/XMLDSig and ANAF detached signatures [#5]
- Field provenance (`source.provenance`) for UBL, CII and Svefaktura [#8]
- `einvoice` CLI and release binaries [#3]
- Browser converter page redesigned around the rebuilt invoice [#4]
- Initial release: EU e-invoice canonical model, detection, UBL, CII and Svefaktura parsers and the browser converter

### Changed

- Relicensed under 0BSD: no attribution, no warranty, no liability [#16]
- Release workflow actions and runner aligned with CI [#21]
- Fixture provenance confirmed against public corpora; unverified detection rules documented; weekly corpus workflow [#9]
- Raised coverage of `c14n.ts` and `trust.ts` with W3C C14N cases [#17]
- Lazy-load `pdf-lib` and `pkijs`; CI actions on Node 24 [#1]

### Documentation

- EN 16931-1:2026 research gap documented; 2026 identifiers pinned by tests [#2]

[Unreleased]: https://github.com/alexcatdad/eu-einvoice-canonical/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/alexcatdad/eu-einvoice-canonical/releases/tag/v1.2.0
