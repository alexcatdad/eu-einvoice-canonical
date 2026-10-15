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
| `isdoc-6.0.2-invoice.isdoc` | ISDOC 6.0.2 invoice in CZK: IČO/DIČ, two VAT rates, taxed and untaxed deposits, rounding, variable/constant/specific symbols, alternate account, supplement |
| `isdoc-6.0.2-credit-eur.isdoc` | ISDOC DocumentType 2 with negative amounts in EUR (ForeignCurrencyCode, CurrRate), ParentDocumentID |
| `ebinterface-6.1-invoice.xml` | ebInterface 6.1 invoice: line and document reductions/surcharges, two VAT rates, GTIN, prepayment, bank transfer, early-payment discount |
| `ebinterface-4.3-creditmemo.xml` | ebInterface 4.3 CreditMemo (old Tax/VAT/VATItem structure, exempt line, delivery period, bank account without IBAN) |
| `ksef-fa3-vat-multirate.xml` | KSeF FA(3) VAT invoice: 23/8/5/0 KR/zw lines, Podmiot3 recipient and factor, two due dates, factor account, GLN, KRS/REGON footer, contract and order references |
| `ksef-fa3-kor-before-after.xml` | KSeF FA(3) KOR that reduces the amount, lines listed before (StanPrzed) and after, KSeF number of the corrected invoice |
| `ksef-fa3-kor-delta-increase.xml` | KSeF FA(3) KOR in EUR with difference lines that increases the amount, VAT in PLN (P_14_1W), Obciazenia/Odliczenia, payment term as text, corrected invoice issued outside KSeF |
| `ksef-fa3-zal.xml` | KSeF FA(3) ZAL advance invoice, already paid, with the Zamowienie it relates to |
| `ksef-fa-rr.xml` | KSeF FA_RR(1) flat-rate farmer purchase invoice, two lines at 7 % refund |
| `facturae-322-iva-irpf.xml` | Facturae 3.2.2 by an individual: IVA 21 % + IRPF 15 % (header and line), line discount, DIR3 administrative centres, series + number, operation date |
| `facturae-322-recargo.xml` | Facturae 3.2.2 with recargo de equivalencia at 5.2 % and 1.4 %, 8-decimal line amounts, direct debit, registry data |
| `facturae-322-batch.xml` | Facturae 3.2.2 batch (Modality L): two invoices, one with IVA, one with IGIC and two installments |
| `facturae-322-rectificativa.xml` | Facturae 3.2.2 rectificativa by differences with negative amounts (a reduction) |
| `fatturapa-b2b.xml` | FatturaPA FPR12 TD01: two VAT rates and a Natura N4 line, REA data, PEC routing, order/contract/DDT references, EAN code, embedded PDF, credit-transfer payment |
| `fatturapa-credit-note.xml` | FatturaPA TD04 credit note referencing the B2B invoice (DatiFattureCollegate) |
| `fatturapa-ritenuta-cassa-bollo.xml` | FatturaPA TD06 from a natural-person professional: RT01 ritenuta, TC22 cassa previdenziale, virtual stamp duty as an N1 line |
| `fatturapa-split-payment.xml` | FatturaPA FPA12 to a public body: EsigibilitaIVA S, 6-character office code, CUP/CIG |
| `fatturapa-lot.xml` | FatturaPA file with two FatturaElettronicaBody; the second has two instalments (TP01) |
| `fatturapa-fsm10.xml` | FatturaPA semplificata FSM10 (TD07): VAT-inclusive Importo blocks, one with Natura N4 |

## Provenance of the other fixtures

Re-checked against the public corpora (phive-rules `58e8c83`, mustangproject `68520f6`, FNFE France_RFE `97ba0f3`; all three are Apache License 2.0). "Derived" means the file differs from the named source only in the stated way. Where a file is not a copy of anything found, it is a hand-written header-only stub with fictitious values (written for this project, so no third-party licence applies).

| File | Origin | Licence |
|---|---|---|
| `facturx-en16931.pdf` | Byte-identical to Mustang `library/src/test/resources/EN16931_Einfach.pdf` | Apache-2.0 (mustangproject) |
| `invoice.isdocx` | `faktura.isdoc` inside is identical (line endings aside) to phive-rules `phive-rules-isdoc/.../test-files/6.0.1/doklad.isdoc`, the sample from the ISDOC specification (isdoc.cz); `priloha.txt` is a dummy attachment | phive-rules Apache-2.0; the ISDOC sample's own licence is not stated |
| `anaf-download.zip` | `4567890123.xml` inside is byte-identical to phive-rules `phive-rules-cius-ro/.../test-files/1.0.8/ubl_b2g_example1.xml` (CIUS-RO B2G example); `semnatura_4567890123.xml` is a placeholder signature file | phive-rules Apache-2.0; the CIUS-RO example's own licence is not stated |
| `peppol-utf16.xml` | Derived from the Peppol AU/NZ example `AU Credit_note.xml` (phive-rules `phive-rules-peppol/.../test-files/aunz-peppol/1.0.12/`): comment line changed, re-encoded as UTF-16 | phive-rules Apache-2.0; upstream is the Peppol AU/NZ authority's example set, licence not stated |
| `peppol-in-sbdh.xml` | The same credit note wrapped in a hand-written SBDH | as above |
| `hr-cius.xml` | The same credit note with CustomizationID replaced by the Croatian identifier | as above |
| `en16931-2026.xml` | The same credit note with CustomizationID `urn:cen.eu:en16931:2026` (the identifier is invented to test the 2026 revision) | as above |
| `IT01234567890_FPR12.xml.p7m`, `IT01234567890_FPR12.base64.xml.p7m` | The invoice inside (Società Alpha Srl to Beta Gamma) is the well-known Agenzia delle Entrate specimen FatturaPA; not found in the clones, so the exact source and licence are **not verified**. The CMS wrapper is generated here with a throwaway certificate | Specimen: unclear. Wrapper: this project |
| `finvoice-with-soap.xml` | Finvoice 3.0 sample (identifier `Inv900375418`, operators OPERAATTORI1/2) inside a hand-written SOAP/ebXML envelope. The Finvoice part resembles Finanssiala's published Finvoice 3.0 examples but was **not found** in the clones, so the source and licence are **not verified** | Unclear |
| `ksef-fa3.xml`, `eslog2.xml`, `e-arve-two-invoices.xml`, `ebinterface-61.xml`, `fattura-semplificata.xml`, `sdi-metadata.xml`, `mydata.xml`, `facturae-322-signed.xsig` | Hand-written header-only stubs, not found in any corpus | This project |

If you can name the original of a "not verified" file, say so in the table; do not delete the fixture, the tests depend on it.

The known-answer manifest for the public corpora themselves (`test/corpus/expected.json`) is described in `.github/workflows/corpus.yml` and `scripts/corpus-manifest.ts`; those files are fetched at run time and are not stored in this repository.
