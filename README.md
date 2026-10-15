# eu-einvoice-canonical

One TypeScript model for every XML e-invoice you can receive from the 27 EU member states, plus the layer that gets you from a received file to "this is format X, version Y": unwrapping (PDF/A-3, `.p7m`, ZIP, SBDH, SOAP, legacy encodings), detection, and parsing into canonical JSON.

**Try it in the browser:** [alexcatdad.github.io/eu-einvoice-canonical](https://alexcatdad.github.io/eu-einvoice-canonical/). Drop an invoice and get the JSON. The page runs the same code as the library, entirely client-side; files are never uploaded.

**Status:**
- Done and tested: the canonical type, unwrapping, detection of 36 formats, and parsers for the `ubl`, `cii` and `svefaktura` families. Those cover Peppol BIS 3 (and self-billing, PINT), XRechnung UBL/CII, Factur-X/ZUGFeRD 2 in every profile, NLCIUS, CIUS-RO, CIUS-PT, HR-CIUS, OIOUBL, plain EN 16931 and Svefaktura 1.0.
- Still stubs: the national parsers (FatturaPA, KSeF, Facturae, ISDOC, ebInterface, Finvoice, e-arve, eSLOG, myDATA...). `convert()` returns them as `unsupported`, with the detection result. Build order below.

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
| `src/formats.ts` | Registry of 36 formats with detection rules, parser family, countries, status and build phase. |
| `src/probe.ts` | Streaming header read (root, namespaces, CustomizationID, guideline ID, KSeF form code...). |
| `src/envelope.ts` | Unwrapping: PDF attachments, CMS signed data, base64, ZIP, SBDH, SOAP, encoding. Rejects DOCTYPEs and enforces size/count limits. |
| `src/detect.ts` | `detectXml()`: invoice format, known non-invoice, or unknown. |
| `src/parsers/` | `ubl.ts`, `cii.ts`, `svefaktura.ts`, the shared DOM reader (`context.ts`) and the family registry with stubs for the rest. |
| `src/values.ts` | `toDecimal()` / `toIsoDate()` constructors and exact BigInt arithmetic. No value passes through a JS `number`. |
| `src/checks.ts` | EN 16931 calculation rules BR-CO-10/13/14/15/16, run after every parse. Mismatches become warnings; values are never rewritten. |
| `src/index.ts` | `inspect(bytes)` (unwrap + detect) and `convert(bytes)` (unwrap + detect + parse). Both return everything that was skipped, with the reason. |
| `test/` | Detection, parser, hostile-input and value tests (about 160), plus `fixtures/expected.json` for the known-answer sweep. |
| `scripts/sweep.ts` | Runs detection over a directory tree. Without `--expect` it counts formats; with `--expect answers.json` it checks each file against a known answer and exits 1 on a mismatch. |
| `site/` | The browser converter published to GitHub Pages (`bun run build:site` builds it into `dist/`). |

Development uses [Bun](https://bun.sh) 1.4+. The library itself has no Bun or Node dependency: it runs in Node 20+, Bun and browsers.

```bash
bun install
bun run typecheck
bun test
bun run sweep:fixtures                               # known-answer check of every fixture
bun scripts/sweep.ts /path/to/inbound/files          # what you actually receive
bun scripts/sweep.ts /path/to/files --expect answers.json
bun run build:site && bun run serve:site             # the browser converter on http://localhost:4173
```

```ts
import { convert } from 'eu-einvoice-canonical';

const { fileSha256, outcomes, skipped } = await convert(bytes, 'invoice.xml');
for (const o of outcomes) {
  if (o.status === 'ok') console.log(o.invoices);          // CanonicalInvoice[]
  else console.log(o.status, o.detection);                 // 'unsupported' | 'not-an-invoice' | 'error'
}
console.log(skipped);                                      // DOCTYPE, size limits, detached signatures...
```

## Command line

`src/cli.ts` is exposed as the `einvoice` bin (`bun src/cli.ts ...` in a checkout; tagged releases attach standalone binaries for linux-x64, darwin-arm64 and windows-x64). A file argument of `-` reads stdin.

```
einvoice detect  <file...>                 format id, version and profile per document (tab separated)
einvoice inspect <file...>                 the unwrap and detect result as JSON
einvoice convert <file...> [--out <dir>]   canonical JSON array on stdout, or one <invoice-id>.json per invoice in <dir>
einvoice sweep   <dir...> [--expect answers.json]   detection coverage / known-answer check
```

Flags: `--pretty` indents JSON; `--quiet` silences notes and warnings (errors are still printed); `--limits '{"maxEntries":10}'` overrides `UnwrapLimits`; `--validate` is accepted by `convert` and is a no-op with a message until the validation module lands.
JSON goes to stdout only; every error is one line on stderr.

| Exit | Meaning |
| ---- | ------- |
| 0 | all converted |
| 1 | usage error (and, for `sweep`, any mismatch or unanswered file) |
| 2 | unsafe or malformed input (DOCTYPE, limits, not XML) |
| 3 | unsupported format or profile (including well-formed non-invoice XML) |
| 4 | validation failed |
| 5 | partially converted (some documents failed) |
| 6 | validator unavailable |
| 7 | internal error (including unreadable files) |

With several failures and no success the code of the first failure is used; with at least one success it is 5.

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

## EU coverage

What you will receive from each country, inbound. Format IDs refer to `src/formats.ts`. Every country also sends Peppol BIS 3 (`peppol-bis3`) cross-border.

| Country | Formats you will see | Notes |
|---|---|---|
| AT | `ebinterface` 4.3–6.1, `peppol-bis3` | ebInterface 7.0 announced for Q4 2026. |
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

## Build order

| Phase | Parser family | Formats it covers | Mapping notes |
|---|---|---|---|
| 1 | `ubl` | Peppol BIS 3 + self-billing, XRechnung UBL, NLCIUS, CIUS-RO, CIUS-PT, HR-CIUS, OIOUBL 3, UBL.BE, PINT, BIS 2 (best-effort), OIOUBL 2 | One parser, profile-specific rules on top. Invoice vs CreditNote element names differ (`InvoicedQuantity`/`CreditedQuantity`). UBL 2.1 CreditNote has no root `cbc:DueDate`: read `cac:PaymentMeans/cbc:PaymentDueDate`, and accept a root `cbc:DueDate` only as a fallback with a warning (it appears in some XRechnung test files). |
| 1 | `cii` | Factur-X/ZUGFeRD 2.x all profiles, XRechnung CII, NLCIUS CII, France CII | D16B and D22B share the root namespace. MINIMUM/BASIC WL have no lines. |
| 2 | `fatturapa` | FatturaPA, semplificata | Child elements are unqualified (no namespace). Several `FatturaElettronicaBody` per file. Natura → VAT category, RT0x → withholdings, cassa previdenziale → charge + `extensions.it`. SdI ID from the separate metadata file. |
| 2 | `ksef` | FA(2), FA(3), FA_RR | `P_12` rate codes (`23`, `zw`, `oo`, `np I`, `0 WDT`...) → VAT category. `P_14_xW` = VAT in PLN. `StanPrzed` → `correctionState`. `Podmiot3` + `Rola` → `additionalParties`. KSeF number from download metadata. |
| 2 | `facturae` | Facturae 3.2–3.2.2 | Batches (`Modality L`). `TaxesWithheld` → withholdings, recargo → `otherTaxes`. XAdES signature inside. |
| 2 | `isdoc`, `ebinterface`, `finvoice`, `e-arve`, `eslog` | National formats in active B2B use | ISDOC symbols → `extensions.cz`; ebInterface varies by version; Finvoice: SOAP + ISO-8859-15; e-arve: several invoices per file; eSLOG uses EDIFACT segment names (`S_BGM`, `G_SG26`...). |
| 3 | `svefaktura`, `zugferd1`, `teappsxml`, `mydata` | Legacy and low-volume | Svefaktura follows SFTI's "Mapping of Svefaktura 1.0 onto EN 16931-1" (see `src/parsers/svefaktura.ts`). |

Done: `ubl`, `cii` and `svefaktura`. Corrective documents whose direction depends on the amounts (KSeF KOR, Facturae rectificativa, ISDOC) must set `kind` from the sign of the correction total; see `effectiveSign()` in `src/canonical.ts`.

Run `scripts/sweep.ts` over a few months of your real inbound files before building phase 2. It shows which formats you actually receive.

## What was tested

CI (`.github/workflows/ci.yml`) runs all of this on every push and pull request, and deploys the browser converter only when everything passes.

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

## Decisions

- **VAT stays EN-shaped.** Every EU format is VAT-based, so `vatBreakdown` and line `vat` stay as in EN 16931, with `otherTaxes` and `withholdings` beside them. A generic multi-scheme tax model only pays off for non-EU fiscal formats (CFDI, NF-e).
- **`kind` is only the accounting direction** (`invoice` / `creditNote`). Debit notes, corrected, prepayment and self-billed invoices are UNCL 1001 `typeCode`s plus `selfBilled`, `nationalType` and `correction`, which combine freely; a single wider enum could not express a self-billed corrective credit note.
- **`id` and `issueDate` are required.** Every EU format mandates them; a document without them is a parse error, not a partial invoice.
- **Extensions are typed per country**, not a free-form list, so a parser cannot silently write a field nobody reads.

## Known gaps

- **Unverified detection rules:** `fr-ctc-*` (exact EXTENDED-CTC-FR identifier), `pl-pef`, `eslog-1` root name and `gr-mydata`. They are marked `unverified` in the registry. The Croatian spec spells its own identifier inconsistently, so `hr-cius` only checks for `urn:mfin.gov.`.
- **EN 16931-1:2026** was published in March 2026. Detection accepts the `urn:cen.eu:en16931:2026` identifier, but the model only contains the 2017 business terms. Add the new terms once Peppol BIS adopts the revision.
- **Signatures** are detected and recorded, not verified.
- **No schema or Schematron validation yet.** `source.validation` exists in the model but nothing fills it. The BR-CO arithmetic checks are the only rules run. Use phive or the KoSIT validator for conformance.
- **National parsers** are still stubs (see the build order). So is the Peppol PINT-specific mapping beyond what plain UBL gives.
- **Non-XML formats** (EDIFACT INVOIC, PDFs without embedded XML) are out of scope.
