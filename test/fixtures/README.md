# Test fixtures

`expected.json` lists the format every fixture must be detected as; `bun run sweep:fixtures` checks it.

## Written for this project

Synthetic documents with fictitious parties. Their numbers are consistent (the EN 16931 BR-CO rules hold), so the parser tests can assert exact values.

| File | What it covers |
|---|---|
| `peppol-bis3-invoice.xml` | Peppol BIS 3 invoice: two VAT rates, document allowance and charge, prepayment, rounding, price base quantity ≠ 1, Bankgiro, embedded attachment, `#AAI#` note |
| `peppol-bis3-creditnote.xml` | Peppol CreditNote: due date in PaymentMeans, project reference as document type 50 |
| `peppol-negative-invoice.xml` | 380 invoice with negative amounts (the other way Peppol credits) |
| `xrechnung-ubl.xml`, `xrechnung-cii.xml` | XRechnung 3.0 in both syntaxes, Leitweg-ID, IBAN |
| `facturx-basic-creditnote.xml` | Factur-X BASIC with TypeCode 381 on the CII root |
| `facturx-minimum.xml` | Factur-X MINIMUM: no lines |
| `svefaktura-1.0.xml` | Svefaktura 1.0 in ISO-8859-1: Bankgiro + OCR, F-skatt, round-off, free-text units, a line without quantity, lines without VAT category, invoicing fee |
| `svefaktura-1.0-credit.xml` | Svefaktura 381 credit without VAT breakdown or currency code |
| `finvoice-invoice.xml` | Finvoice 3.0 INV01 behind a SOAP envelope, ISO-8859-15: comma decimals, Y-tunnus and OVT codes, two VAT rates, unit price in cents (`snt/kWh`), a print-only `SubInvoiceRow` row, EPI account and RF reference |
| `finvoice-credit.xml` | Finvoice INV02 credit in UTF-8: no EpiDetails (payable and means code derived), account from SellerAccountDetails, original invoice number |
| `e-arve-1.2-two-invoices.xml` | e-arve 1.2 file with a factored DEB invoice (two lines, one zero-rate) and a CRE credit |
| `eslog-2-invoice.xml` | eSLOG 2.0 invoice: two VAT rates (22 % and 9.5 %), document charge with VAT, line allowance, GLN/GTIN, prepaid amount, bank (FII), period |
| `eslog-2-credit.xml` | eSLOG 2.0 credit note (381) with a preceding-invoice reference |

The eSLOG fixtures follow the segment layout of EDIFACT INVOIC D.01B as eSLOG 2.0 uses it (S_ segments, G_SGn groups). They were written from the published mapping rather than copied from a real file, so group numbers around parties, payment (PAI/FII) and the RFF qualifiers BO (BT-10) and PQ (BT-83) should be checked against a real sender's file when one is available.

## From public sample collections

The remaining fixtures were assembled by the earlier version of this project from public samples, mainly [phive-rules](https://github.com/phax/phive-rules) and [Mustang](https://github.com/ZUGFeRD/mustangproject) (both Apache License 2.0), some trimmed or re-wrapped to exercise one envelope or encoding (UTF-16, SBDH, SOAP, ZIP, CAdES). The `.p7m` files are signed with a throwaway test certificate. The origin of each individual file was not re-verified when this repository was created.
