# Validation fixtures

Kept out of `test/fixtures/` because the detection sweep requires an expected answer for every file there; these are inputs for `test/validation.test.ts`, which also derives mutated copies in memory.

| File | Notes |
|---|---|
| `peppol-valid-invoice.xml` | Synthetic Peppol BIS 3 invoice, fictitious parties, consistent totals. Passes the UBL XSD, the EN 16931 Schematron and the Peppol Schematron. |

The test suite also validates `test/fixtures/xrechnung-ubl.xml`, `xrechnung-cii.xml` and `peppol-bis3-creditnote.xml`.
