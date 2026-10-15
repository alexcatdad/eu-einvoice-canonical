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
| `zugferd1-comfort.xml` | ZUGFeRD 1.0 COMFORT: two VAT rates, document allowance and charge, line discount, prepayment, GTIN, embedded attachment, BLZ (the test also wraps it in a PDF) |
| `teappsxml-invoices.xml` | TEAPPSXML 3.0 batch: a sales invoice (row discount, charge, advance payment, an INFO row, Finnish payment reference, e-invoice address) and a credit note with SIGN="-" amounts and no currency element |
| `mydata-two-invoices.xml` | myDATA InvoicesDoc with a 1.1 sales invoice (MARK, UID, line classifications, two VAT categories) and a 5.1 credit invoice (withholding, correlated MARK, no currency element) |

## From public sample collections

The remaining fixtures were assembled by the earlier version of this project from public samples, mainly [phive-rules](https://github.com/phax/phive-rules) and [Mustang](https://github.com/ZUGFeRD/mustangproject) (both Apache License 2.0), some trimmed or re-wrapped to exercise one envelope or encoding (UTF-16, SBDH, SOAP, ZIP, CAdES). The `.p7m` files are signed with a throwaway test certificate. The origin of each individual file was not re-verified when this repository was created.
