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
| `isdoc-6.0.2-invoice.isdoc` | ISDOC 6.0.2 invoice in CZK: IČO/DIČ, two VAT rates, taxed and untaxed deposits, rounding, variable/constant/specific symbols, alternate account, supplement |
| `isdoc-6.0.2-credit-eur.isdoc` | ISDOC DocumentType 2 with negative amounts in EUR (ForeignCurrencyCode, CurrRate), ParentDocumentID |
| `ebinterface-6.1-invoice.xml` | ebInterface 6.1 invoice: line and document reductions/surcharges, two VAT rates, GTIN, prepayment, bank transfer, early-payment discount |
| `ebinterface-4.3-creditmemo.xml` | ebInterface 4.3 CreditMemo (old Tax/VAT/VATItem structure, exempt line, delivery period, bank account without IBAN) |

## From public sample collections

The remaining fixtures were assembled by the earlier version of this project from public samples, mainly [phive-rules](https://github.com/phax/phive-rules) and [Mustang](https://github.com/ZUGFeRD/mustangproject) (both Apache License 2.0), some trimmed or re-wrapped to exercise one envelope or encoding (UTF-16, SBDH, SOAP, ZIP, CAdES). The `.p7m` files are signed with a throwaway test certificate. The origin of each individual file was not re-verified when this repository was created.
