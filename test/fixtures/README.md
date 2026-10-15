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
| `facturae-322-iva-irpf.xml` | Facturae 3.2.2 by an individual: IVA 21 % + IRPF 15 % (header and line), line discount, DIR3 administrative centres, series + number, operation date |
| `facturae-322-recargo.xml` | Facturae 3.2.2 with recargo de equivalencia at 5.2 % and 1.4 %, 8-decimal line amounts, direct debit, registry data |
| `facturae-322-batch.xml` | Facturae 3.2.2 batch (Modality L): two invoices, one with IVA, one with IGIC and two installments |
| `facturae-322-rectificativa.xml` | Facturae 3.2.2 rectificativa by differences with negative amounts (a reduction) |

## From public sample collections

The remaining fixtures were assembled by the earlier version of this project from public samples, mainly [phive-rules](https://github.com/phax/phive-rules) and [Mustang](https://github.com/ZUGFeRD/mustangproject) (both Apache License 2.0), some trimmed or re-wrapped to exercise one envelope or encoding (UTF-16, SBDH, SOAP, ZIP, CAdES). The `.p7m` files are signed with a throwaway test certificate. The origin of each individual file was not re-verified when this repository was created.
