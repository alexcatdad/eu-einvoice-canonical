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
