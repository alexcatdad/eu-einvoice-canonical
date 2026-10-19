# Validation fixtures

Kept out of `test/fixtures/` because the detection sweep requires an expected answer for every file there; these are inputs for `test/validation.test.ts`, which also derives mutated copies in memory.

| File | Notes |
|---|---|
| `peppol-valid-invoice.xml` | Synthetic Peppol BIS 3 invoice, fictitious parties, consistent totals. Passes the UBL XSD, the EN 16931 Schematron and the Peppol Schematron. |

The test suite also validates `test/fixtures/xrechnung-ubl.xml`, `xrechnung-cii.xml` and `peppol-bis3-creditnote.xml`.

## national/

One schema-valid document per national XSD bundle, for `test/validation-national.test.ts`. They are adapted from the
detection fixtures in `test/fixtures/` (fictitious parties) and corrected until the official schema accepts them,
which the detection fixtures do not need to be: they were written for the parsers and several are not schema-valid
(FatturaPA quantities without decimals, eSLOG dates as `20261015`, ebInterface 4.3 attributes without namespace,
e-arve `EmailAddress` instead of `E-mailAddress`). `ksef-fa2.xml`, `facturae-3.2.xml`, `facturae-3.2.1.xml` and
`ebinterface-5.0.xml` are derived from the FA(3), 3.2.2 and 6.1 documents.

## Source-validation controls

The additional fixtures exercise specific version, syntax, process and profile contracts. Their expected bundles and in-memory negative mutations are recorded in [the artifact controls](../../conformance/validation-cases.json), [selector controls](../../conformance/validation-selectors.json) and [unsupported-selector controls](../../conformance/validation-unsupported-selectors.json). A passing fixture establishes that bounded control, not exhaustive conformance or tax-authority acceptance.

| Files | Purpose and provenance evidence |
|---|---|
| `ciuspt-valid-invoice.xml`, `ciusro-valid-invoice.xml`, `hr-cius-valid-*.xml`, `nlcius-valid-*.xml`, `nlcius-gaccount-valid-invoice.xml`, `selfbilling-valid-*.xml` | National/profile controls using fictitious parties and the project's synthetic UBL/CII invoice structures. Identifiers and extensions select the stated profile. |
| `facturx-1.09.2-*.xml` | BASICWL, EN16931 and EXTENDED controls derived from the synthetic XRechnung CII fixture; their XML comments retain that origin. |
| `svefaktura-valid-*.xml`, `teappsxml-valid.xml` | Synthetic invoice/credit controls derived from the corresponding project fixtures described in [the fixture inventory](../fixtures/README.md). |
| `oioubl-202-*.xml` | OIOUBL 2.02 controls marked synthetic in their XML comments, with fictitious party names and addresses. |
| `legacy/` | CFDI, ebInterface, Facturae, Finvoice and OIOUBL historical-version controls. The files are modified validation inputs, not byte-identical publisher samples. The CFDI documents use the public SAT test RFCs described in the fixture inventory. |
| `remaining-legacy/` | e-arve, ebInterface, ISDOC, UBL.BE and Peppol BIS 2 historical-version controls. UBL.BE and BIS 2 comments identify synthetic regression inputs; historical schema versions and required elements differ from the parser fixtures. |
| `pint/` | Synthetic billing/self-billing invoice and credit-note controls for the jurisdiction contracts. Public code and identifier test vectors are retained where the rules require them; these files are not the withheld publisher rule artifacts. |
| `selectors/` | Credit-note variants of the corresponding synthetic positive controls, used to exercise each registered root/selector independently. |
| `france-rfe/` | Modified controls adapted from FNFE-MPE's fictitious France RFE examples. The UBL EN16931 comments identify UC1; the other comments identify publisher examples without an individual case number. Source collection: [`FNFE_RFE_INVOICE/Z.example/TEST`](https://github.com/fnfempe/France_RFE/tree/97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/FNFE_RFE_INVOICE/Z.example/TEST), commit `97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d`, repository [Apache-2.0 license](https://github.com/fnfempe/France_RFE/blob/97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/LICENSE). Public identifier/code test vectors are retained. These are adaptations, not unchanged public samples. |

Validator bundle distribution decisions concern schemas and rules, separately from the invoice fixtures. The original fixture inventory records the provenance of its public samples; the controls above must not be presented as unchanged copies of those samples.
