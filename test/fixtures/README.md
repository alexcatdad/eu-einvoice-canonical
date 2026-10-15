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
| `ksef-fa3-vat-multirate.xml` | KSeF FA(3) VAT invoice: 23/8/5/0 KR/zw lines, Podmiot3 recipient and factor, two due dates, factor account, GLN, KRS/REGON footer, contract and order references |
| `ksef-fa3-kor-before-after.xml` | KSeF FA(3) KOR that reduces the amount, lines listed before (StanPrzed) and after, KSeF number of the corrected invoice |
| `ksef-fa3-kor-delta-increase.xml` | KSeF FA(3) KOR in EUR with difference lines that increases the amount, VAT in PLN (P_14_1W), Obciazenia/Odliczenia, payment term as text, corrected invoice issued outside KSeF |
| `ksef-fa3-zal.xml` | KSeF FA(3) ZAL advance invoice, already paid, with the Zamowienie it relates to |
| `ksef-fa-rr.xml` | KSeF FA_RR(1) flat-rate farmer purchase invoice, two lines at 7 % refund |

## From public sample collections

The remaining fixtures were assembled by the earlier version of this project from public samples, mainly [phive-rules](https://github.com/phax/phive-rules) and [Mustang](https://github.com/ZUGFeRD/mustangproject) (both Apache License 2.0), some trimmed or re-wrapped to exercise one envelope or encoding (UTF-16, SBDH, SOAP, ZIP, CAdES). The `.p7m` files are signed with a throwaway test certificate. The origin of each individual file was not re-verified when this repository was created.
