/** The sample invoices the converter offers (copied to public/samples/ by site/prepare.ts, from SAMPLE_FILES). */
export const SAMPLES: { file: string; label: string }[] = [
  { file: 'peppol-bis3-invoice.xml', label: 'sample.peppolInvoice' },
  { file: 'peppol-bis3-creditnote.xml', label: 'sample.peppolCredit' },
  { file: 'xrechnung-ubl.xml', label: 'sample.xrechnungUbl' },
  { file: 'xrechnung-cii.xml', label: 'sample.xrechnungCii' },
  { file: 'facturx-en16931.pdf', label: 'sample.facturxPdf' },
  { file: 'facturx-basic-creditnote.xml', label: 'sample.facturxCredit' },
  { file: 'svefaktura-1.0.xml', label: 'sample.svefaktura' },
  { file: 'anaf-download.zip', label: 'sample.anaf' },
  { file: 'hr-cius.xml', label: 'sample.hrCius' },
  { file: 'IT01234567890_FPR12.xml.p7m', label: 'sample.fatturapa' },
  { file: 'ksef-fa3.xml', label: 'sample.ksef' },
  { file: 'svefaktura-1.0-descriptors.xml', label: 'sample.svefakturaDescriptors' },
  { file: 'pint-sg-invoice.xml', label: 'sample.pintSg' },
  { file: 'pint-jp-invoice.xml', label: 'sample.pintJp' },
  { file: 'zatca-simplified-signed.xml', label: 'sample.zatca' },
];

/** Converted when the page opens, so the result side is never empty. */
export const EXAMPLE = SAMPLES[0]!.file;

/** The samples worth a one-click button; the rest stay in the menu. */
export const CHIP_SAMPLES = [
  'peppol-bis3-invoice.xml',
  'xrechnung-ubl.xml',
  'facturx-en16931.pdf',
  'IT01234567890_FPR12.xml.p7m',
  'svefaktura-1.0-descriptors.xml',
];
