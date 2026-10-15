/**
 * Code lists used by the canonical model.
 *
 * Every list is an *open* union: the literals give autocomplete and document the
 * common values, but any string is accepted. Peppol and the national authorities
 * change code lists on their own release cycles, so a closed union would turn a
 * code-list update into a parse failure. Validate against the full lists in a
 * separate step if you need to.
 */

/** Keeps literal autocomplete while accepting any string. */
export type Open<T extends string> = T | (string & {});

/** ISO 4217 currency code. */
export type CurrencyCode = Open<'EUR' | 'SEK' | 'DKK' | 'PLN' | 'CZK' | 'HUF' | 'RON' | 'BGN' | 'NOK' | 'CHF' | 'GBP' | 'USD'>;

/** ISO 3166-1 alpha-2. EU member states listed; Greece is 'GR' (EL is the VAT prefix only). */
export type CountryCode = Open<
  | 'AT'
  | 'BE'
  | 'BG'
  | 'HR'
  | 'CY'
  | 'CZ'
  | 'DK'
  | 'EE'
  | 'FI'
  | 'FR'
  | 'DE'
  | 'GR'
  | 'HU'
  | 'IE'
  | 'IT'
  | 'LV'
  | 'LT'
  | 'LU'
  | 'MT'
  | 'NL'
  | 'PL'
  | 'PT'
  | 'RO'
  | 'SK'
  | 'SI'
  | 'ES'
  | 'SE'
>;

export const EU_COUNTRIES = [
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
] as const;
export type EuCountry = (typeof EU_COUNTRIES)[number];

/** UNCL 1001 document type codes used for invoices (BT-3). */
export type InvoiceTypeCode = Open<
  | '380' // commercial invoice
  | '383' // debit note
  | '384' // corrected invoice
  | '386' // prepayment invoice
  | '389' // self-billed invoice
  | '326' // partial invoice
  | '388' // tax invoice
  | '393' // factored invoice
  | '875'
  | '876'
  | '877' // partial construction / final construction invoices
>;

/** UNCL 1001 document type codes used for credit notes (BT-3). */
export type CreditNoteTypeCode = Open<'381' | '396' | '261' | '262' | '81' | '83' | '532'>;

/** UNCL 5305 VAT category (BT-118, BT-151). */
export type VatCategoryCode = Open<
  | 'S' // standard rate
  | 'Z' // zero rated
  | 'E' // exempt
  | 'AE' // reverse charge
  | 'K' // intra-community supply
  | 'G' // export outside the EU
  | 'O' // outside the scope of VAT
  | 'L' // Canary Islands IGIC
  | 'M' // Ceuta and Melilla IPSI
  | 'B' // transferred VAT (Italy)
>;

/** UNCL 4461 payment means (BT-81). */
export type PaymentMeansCode = Open<
  '1' | '10' | '20' | '30' | '31' | '42' | '48' | '49' | '54' | '55' | '57' | '58' | '59' | '68' | '97' | 'ZZZ'
>;

/** UNCL 5189 (allowances) and UNCL 7161 (charges). */
export type AllowanceChargeReasonCode = Open<
  | '41'
  | '42'
  | '60'
  | '62'
  | '63'
  | '64'
  | '65'
  | '66'
  | '67'
  | '68'
  | '70'
  | '71'
  | '88'
  | '95'
  | '100'
  | '102'
  | '103'
  | '104'
  | '105'
  | 'AA'
  | 'AAA'
  | 'ABL'
  | 'ADR'
  | 'ADT'
  | 'FC'
  | 'FI'
  | 'LA'
  | 'ZZZ'
>;

/** UN/ECE Recommendation 20 / 21 unit codes (BT-130). */
export type UnitCode = Open<
  | 'C62'
  | 'H87'
  | 'EA'
  | 'XPP'
  | 'HUR'
  | 'DAY'
  | 'MON'
  | 'ANN'
  | 'KGM'
  | 'TNE'
  | 'LTR'
  | 'MTR'
  | 'MTK'
  | 'MTQ'
  | 'KWH'
  | 'KMT'
  | 'SET'
  | 'LS'
>;

/**
 * Identifier schemes: ISO/IEC 6523 ICD codes (party, item and location IDs) and
 * Peppol EAS codes (electronic addresses, BT-34/BT-49). Only codes whose meaning
 * is certain are listed. Check the current EAS list before relying on a code:
 * Peppol BIS 3.0.21 removed 14 EAS codes.
 */
export type SchemeId = Open<
  | '0002' // FR SIRENE
  | '0007' // SE organisation number
  | '0009' // FR SIRET
  | '0060' // DUNS
  | '0088' // GS1 GLN
  | '0096' // DK P-number
  | '0106' // NL KvK
  | '0160' // GS1 GTIN (items)
  | '0184' // DK CVR
  | '0190' // NL OIN
  | '0192' // NO organisation number
  | '0201' // IT IPA code (public administration)
  | '0204' // DE Leitweg-ID
  | '0208' // BE enterprise number
  | '0210' // IT codice fiscale
  | '0211' // IT partita IVA
  | '0216' // FI OVT
  | '9914' // AT VAT
  | '9920' // ES VAT
  | '9925' // BE VAT
  | '9926' // BG VAT
  | '9928' // CY VAT
  | '9929' // CZ VAT
  | '9930' // DE VAT
  | '9931' // EE VAT
  | '9933' // GR VAT
  | '9934' // HR VAT (OIB)
  | '9935' // IE VAT
  | '9937' // LT VAT
  | '9938' // LU VAT
  | '9939' // LV VAT
  | '9943' // MT VAT
  | '9944' // NL VAT
  | '9945' // PL VAT
  | '9946' // PT VAT
  | '9947' // RO VAT
  | '9949' // SI VAT
  | '9950' // SK VAT
  | '9957' // FR VAT
  | 'EM' // e-mail address (endpoints only)
  /** Not ISO 6523: scheme labels for national IDs that have no ICD code. */
  | 'PL:NIP'
  | 'IT:CF'
  | 'ES:NIF'
  | 'CZ:ICO'
  | 'HR:OIB'
  | 'GR:AFM'
  | 'PT:NIF'
  | 'RO:CIF'
  | 'HU:ADOSZAM'
  | 'EE:REGCODE'
  | 'SI:DAVCNA'
>;

/** Peppol EAS code for each EU country's VAT number. Used to derive missing endpoints. */
export const VAT_EAS_BY_COUNTRY: Partial<Record<EuCountry, string>> = {
  AT: '9914',
  BE: '9925',
  BG: '9926',
  CY: '9928',
  CZ: '9929',
  DE: '9930',
  EE: '9931',
  ES: '9920',
  FR: '9957',
  GR: '9933',
  HR: '9934',
  IE: '9935',
  IT: '0211',
  LT: '9937',
  LU: '9938',
  LV: '9939',
  MT: '9943',
  NL: '9944',
  PL: '9945',
  PT: '9946',
  RO: '9947',
  SI: '9949',
  SK: '9950',
};
