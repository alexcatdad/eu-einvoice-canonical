## Performance

Measured 2026-10-16 on bun 1.4.2, darwin-arm64. Calibration loop 5.61 ms.

### Per format

| Case | Input | docs/s | ms/doc | Peak memory |
|---|---:|---:|---:|---:|
| cfdi-33-ingreso-usd.xml | 2.0 KB | 8499 | 0.12 | 40 MB |
| cfdi-40-egreso-relacionado.xml | 2.2 KB | 8508 | 0.12 | 40 MB |
| cfdi-40-ieps.xml | 2.9 KB | 6906 | 0.14 | 41 MB |
| cfdi-40-ingreso-iva-retenciones.xml | 3.6 KB | 6047 | 0.17 | 40 MB |
| cfdi-40-pago.xml | 1.9 KB | 27939 | 0.04 | 38 MB |
| cii-unknown.xml | 3.7 KB | 4401 | 0.23 | 40 MB |
| cius-pt.xml | 3.5 KB | 4185 | 0.24 | 41 MB |
| e-arve-1.2-two-invoices.xml | 5.3 KB | 2395 | 0.42 | 42 MB |
| e-arve-two-invoices.xml | 0.6 KB | 14397 | 0.07 | 39 MB |
| ebinterface-4.3-creditmemo.xml | 2.8 KB | 4092 | 0.24 | 41 MB |
| ebinterface-6.1-invoice.xml | 5.4 KB | 2638 | 0.38 | 41 MB |
| ebinterface-61.xml | 0.3 KB | 22577 | 0.04 | 38 MB |
| en16931-2026.xml | 5.5 KB | 2840 | 0.35 | 42 MB |
| en16931-cii.xml | 3.7 KB | 4537 | 0.22 | 40 MB |
| eslog-1.xml | 0.4 KB | 35037 | 0.03 | 38 MB |
| eslog-2-credit.xml | 2.8 KB | 3271 | 0.31 | 41 MB |
| eslog-2-invoice.xml | 6.8 KB | 1431 | 0.70 | 43 MB |
| eslog2.xml | 0.2 KB | 18706 | 0.05 | 38 MB |
| facturae-322-batch.xml | 6.5 KB | 2213 | 0.45 | 42 MB |
| facturae-322-iva-irpf.xml | 8.4 KB | 1932 | 0.52 | 42 MB |
| facturae-322-recargo.xml | 6.7 KB | 2329 | 0.43 | 42 MB |
| facturae-322-rectificativa.xml | 3.9 KB | 3541 | 0.28 | 41 MB |
| facturx-basic-creditnote.xml | 5.2 KB | 3575 | 0.28 | 41 MB |
| facturx-minimum.xml | 2.0 KB | 7638 | 0.13 | 40 MB |
| fattura-semplificata.xml | 0.2 KB | 27972 | 0.04 | 38 MB |
| fatturapa-b2b.xml | 5.2 KB | 2795 | 0.36 | 42 MB |
| fatturapa-credit-note.xml | 3.0 KB | 4502 | 0.22 | 41 MB |
| fatturapa-fsm10.xml | 2.2 KB | 5835 | 0.17 | 40 MB |
| fatturapa-lot.xml | 5.1 KB | 2642 | 0.38 | 42 MB |
| fatturapa-ritenuta-cassa-bollo.xml | 4.6 KB | 3008 | 0.33 | 41 MB |
| fatturapa-split-payment.xml | 3.5 KB | 3958 | 0.25 | 41 MB |
| finvoice-credit.xml | 3.5 KB | 4167 | 0.24 | 41 MB |
| finvoice-invoice.xml | 9.1 KB | 1558 | 0.64 | 45 MB |
| finvoice-with-soap.xml | 17.9 KB | 882 | 1.13 | 48 MB |
| fr-ctc-cii.xml | 3.8 KB | 4523 | 0.22 | 41 MB |
| fr-ctc-ubl.xml | 3.4 KB | 4186 | 0.24 | 41 MB |
| hr-cius.xml | 5.6 KB | 3042 | 0.33 | 42 MB |
| isdoc-6.0.2-credit-eur.isdoc | 5.9 KB | 2647 | 0.38 | 42 MB |
| isdoc-6.0.2-invoice.isdoc | 9.3 KB | 1778 | 0.56 | 42 MB |
| ksef-fa-rr.xml | 1.7 KB | 5109 | 0.20 | 40 MB |
| ksef-fa3-kor-before-after.xml | 2.6 KB | 3151 | 0.32 | 41 MB |
| ksef-fa3-kor-delta-increase.xml | 2.5 KB | 3894 | 0.26 | 41 MB |
| ksef-fa3-vat-multirate.xml | 3.9 KB | 2394 | 0.42 | 42 MB |
| ksef-fa3-zal.xml | 2.1 KB | 4212 | 0.24 | 39 MB |
| ksef-fa3.xml | 1.0 KB | 5958 | 0.17 | 39 MB |
| mydata-two-invoices.xml | 4.7 KB | 2669 | 0.37 | 42 MB |
| mydata.xml | 0.3 KB | 13544 | 0.07 | 38 MB |
| nlcius-cii.xml | 3.8 KB | 4669 | 0.21 | 40 MB |
| nlcius-ubl.xml | 3.5 KB | 4274 | 0.23 | 40 MB |
| oioubl-2.xml | 3.3 KB | 4208 | 0.24 | 41 MB |
| oioubl-3.xml | 3.4 KB | 4246 | 0.24 | 40 MB |
| peppol-bis2.xml | 3.4 KB | 4187 | 0.24 | 41 MB |
| peppol-bis3-creditnote.xml | 4.0 KB | 3871 | 0.26 | 41 MB |
| peppol-bis3-invoice.xml | 11.6 KB | 1460 | 0.68 | 46 MB |
| peppol-bis3-selfbilling.xml | 3.4 KB | 4349 | 0.23 | 40 MB |
| peppol-in-sbdh.xml | 6.2 KB | 1294 | 0.77 | 46 MB |
| peppol-negative-invoice.xml | 3.1 KB | 4632 | 0.22 | 41 MB |
| peppol-utf16.xml | 11.2 KB | 2801 | 0.36 | 42 MB |
| pint-ae-invoice.xml | 4.3 KB | 3356 | 0.30 | 41 MB |
| pint-aunz-au-invoice.xml | 3.6 KB | 3813 | 0.26 | 41 MB |
| pint-aunz-nz-selfbilling-creditnote.xml | 3.8 KB | 3739 | 0.27 | 41 MB |
| pint-base.xml | 3.4 KB | 4170 | 0.24 | 40 MB |
| pint-eu-invoice.xml | 3.4 KB | 4147 | 0.24 | 40 MB |
| pint-jp-invoice.xml | 4.4 KB | 3112 | 0.32 | 40 MB |
| pint-jp-ntr-invoice.xml | 3.5 KB | 3800 | 0.26 | 41 MB |
| pint-my-invoice.xml | 4.8 KB | 3117 | 0.32 | 41 MB |
| pint-om-invoice.xml | 3.4 KB | 3972 | 0.25 | 40 MB |
| pint-sg-invoice.xml | 4.5 KB | 3178 | 0.31 | 41 MB |
| pl-pef.xml | 3.5 KB | 4208 | 0.24 | 40 MB |
| sdi-metadata.xml | 0.3 KB | 31746 | 0.03 | 38 MB |
| svefaktura-1.0-credit.xml | 1.7 KB | 7046 | 0.14 | 40 MB |
| svefaktura-1.0-descriptors.xml | 6.5 KB | 2425 | 0.41 | 42 MB |
| svefaktura-1.0.xml | 7.2 KB | 2246 | 0.45 | 42 MB |
| teappsxml-invoices.xml | 10.2 KB | 1430 | 0.70 | 43 MB |
| ubl-be.xml | 3.4 KB | 4274 | 0.23 | 40 MB |
| ubl-unknown.xml | 3.3 KB | 4306 | 0.23 | 41 MB |
| xrechnung-cii.xml | 8.5 KB | 2331 | 0.43 | 42 MB |
| xrechnung-ubl.xml | 4.1 KB | 3581 | 0.28 | 41 MB |
| zatca-simplified-signed.xml | 14.9 KB | 508 | 1.97 | 57 MB |
| zatca-standard-debit-signed.xml | 13.7 KB | 618 | 1.62 | 56 MB |
| zatca-standard-signed.xml | 13.4 KB | 659 | 1.52 | 56 MB |
| zugferd1-comfort.xml | 10.6 KB | 1951 | 0.51 | 45 MB |

### Per wrapper

| Case | Input | docs/s | ms/doc | Peak memory |
|---|---:|---:|---:|---:|
| pdf-a3 | 37.0 KB | 943 | 1.06 | 56 MB |
| cades-p7m | 5.2 KB | 526 | 1.90 | 55 MB |
| cades-p7m-base64 | 7.0 KB | 596 | 1.68 | 56 MB |
| zip | 23.9 KB | 879 | 1.14 | 54 MB |
| sbdh | 6.2 KB | 1284 | 0.78 | 46 MB |
| soap | 17.9 KB | 885 | 1.13 | 48 MB |
| xades-xsig | 0.6 KB | 8959 | 0.11 | 45 MB |

### Optional layers

| Case | Input | docs/s | ms/doc | Peak memory |
|---|---:|---:|---:|---:|
| ubl-relations | 11.6 KB | 1449 | 0.69 | 45 MB |
| ubl-provenance | 11.6 KB | 1249 | 0.80 | 46 MB |
| ubl-relations+provenance | 11.6 KB | 1242 | 0.81 | 46 MB |
| ubl-validate | 11.6 KB | 7.74 | 129 | 337 MB |
| cii-validate | 8.5 KB | 18 | 55 | 269 MB |

### Large inputs

| Case | Input | docs/s | ms/doc | Peak memory |
|---|---:|---:|---:|---:|
| 1000-lines-plain | 724.3 KB | 16 | 61 | 105 MB |
| 1000-lines-relations | 724.3 KB | 3.90 | 257 | 142 MB |
| 1000-lines-provenance | 724.3 KB | 15 | 68 | 122 MB |
| 1000-lines-relations+provenance | 724.3 KB | 3.29 | 304 | 160 MB |
| 10000-lines-plain | 7217.8 KB | 1.70 | 589 | 517 MB |
| 10000-lines-relations | 7217.8 KB | 0.25 | 4003 | 675 MB |
| 10000-lines-provenance | 7217.8 KB | 1.36 | 734 | 623 MB |
| 10000-lines-relations+provenance | 7217.8 KB | 0.26 | 3916 | 753 MB |
| attachment-20MB | 27677.9 KB | 6.29 | 159 | 303 MB |
| attachment-20MB-base64-file | 36903.8 KB | 4.80 | 208 | 348 MB |

### Browser bundle

| Chunk | Size | gzip |
|---|---:|---:|
| app.js | 19.5 KB | 8.1 KB |
| chunks/app#1.js | 395.7 KB | 132.9 KB |
| chunks/app#2.js | 382.2 KB | 82.2 KB |
| chunks/app#3.js | 9.0 KB | 3.5 KB |
| chunks/app#4.js | 4.0 KB | 1.8 KB |
| chunks/app#5.js | 0.2 KB | 0.2 KB |
| chunks/cades.js | 1.8 KB | 1.0 KB |
| chunks/envelope-cms.js | 0.8 KB | 0.5 KB |
| chunks/envelope-pdf.js | 430.5 KB | 176.4 KB |
| chunks/trust.js | 1.0 KB | 0.6 KB |
| chunks/tsl-load.js | 3.0 KB | 1.6 KB |
| chunks/xmldsig.js | 0.2 KB | 0.2 KB |
| eval.js | 7.3 KB | 3.0 KB |
