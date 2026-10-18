# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This file was reconstructed from the git history. Numbers in brackets are pull requests.

## [Unreleased]

### Added

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

- The site is an Astro build: Starlight docs generated from the README (with Pagefind search, the TypeScript API from starlight-typedoc and the HTTP API from a self-hosted Scalar), the converter as a React island on the library's `<Invoice>` component and shadcn/ui, old page addresses redirected, and an accessibility gate in CI

- Supply-chain hardening: pinned actions, least-privilege permissions, attestations, SBOM and OpenSSF Scorecard [#37]
- Dependency updates for GitHub Actions and the Docker base image [#38, #40]
- Performance speed-ups found by the benchmarks [#36]

### Fixed

- Finvoice derivation paths use canonical line positions after informational rows are omitted.
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
