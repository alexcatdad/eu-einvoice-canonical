/**
 * Canonical e-invoice model for inbound invoices from all 27 EU member states.
 *
 * Design
 * - The core is the EN 16931-1 semantic model. Fields carry their business term
 *   (BT-x) or group (BG-x) in the comment. Every EN-based syntax (Peppol BIS 3,
 *   XRechnung, Factur-X/ZUGFeRD, CIUS-RO, CIUS-PT, NLCIUS, HR-CIUS, OIOUBL 3)
 *   maps onto it directly.
 * - National formats that predate or sit beside EN 16931 (FatturaPA, KSeF,
 *   Facturae, ISDOC, ebInterface, Finvoice, TEAPPSXML, e-arve, eSLOG, Svefaktura,
 *   myDATA) carry concepts EN has no term for. Those go in four places, in this
 *   order of preference:
 *     1. generic EU-wide additions to the core (withholdings, other taxes,
 *        payment schedules, extra party roles, national tax IDs, national type
 *        codes, sub-lines, correction line states),
 *     2. `clearance` for tax-authority IDs, signatures and QR payloads,
 *     3. typed per-country `extensions`,
 *     4. `source.unmapped` for anything still left, keyed by XPath.
 * - Amounts are decimal strings, never JS numbers. Dates are YYYY-MM-DD strings.
 * - Credit notes keep their source signs: a 381 with positive amounts and a 380
 *   with negative amounts both credit. Use `effectiveSign()` downstream.
 * - Optional fields are optional because some national format can omit them, even
 *   where EN 16931 requires them. `assertEn16931Complete()` (not in this file)
 *   decides whether to reject or enrich such documents.
 */

import type {
  AllowanceChargeReasonCode,
  CountryCode,
  CreditNoteTypeCode,
  CurrencyCode,
  InvoiceTypeCode,
  PaymentMeansCode,
  SchemeId,
  UnitCode,
  VatCategoryCode,
} from './codes.js';
import type { FormatId } from './formats.js';

// ---------------------------------------------------------------------------
// Primitive types
// ---------------------------------------------------------------------------

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

/** Plain decimal string: optional sign, digits, optional fraction. No exponent, no grouping. */
export type Decimal = Brand<string, 'Decimal'>;
/** Monetary amount. EN 16931 allows at most 2 decimals at document level; lines may carry more in some national formats. */
export type Amount = Decimal;
export type UnitPrice = Decimal;
export type Quantity = Decimal;
export type Percentage = Decimal;
/** YYYY-MM-DD, no time zone. */
export type IsoDate = Brand<string, 'IsoDate'>;
/** hh:mm:ss, optionally with offset (e.g. Croatian HR-BT-2 issue time, Italian/Polish timestamps). */
export type IsoTime = Brand<string, 'IsoTime'>;

export interface Identifier {
  value: string;
  /** ICD / EAS code, or a national label such as 'PL:NIP'. */
  schemeId?: SchemeId;
}

// ---------------------------------------------------------------------------
// Parties
// ---------------------------------------------------------------------------

export interface Address {
  // BG-5 / BG-8 / BG-12 / BG-15
  line1?: string; // BT-35
  line2?: string; // BT-36
  line3?: string; // BT-162
  city?: string; // BT-37
  postalCode?: string; // BT-38 (string: keeps leading zeros)
  countrySubdivision?: string; // BT-39 (e.g. RO-B, IT province 'MI')
  countryCode?: CountryCode; // BT-40 (EN-mandatory; some national formats omit it)
}

export interface Contact {
  // BG-6 / BG-9
  name?: string;
  phone?: string;
  email?: string;
}

export interface Party {
  name?: string; // BT-27 / BT-44 legal name
  tradingName?: string; // BT-28 / BT-45
  identifiers: Identifier[]; // BT-29 / BT-46
  legalRegistrationId?: Identifier; // BT-30 / BT-47
  vatId?: string; // BT-31 / BT-48, with country prefix (EL for Greece)
  /**
   * National tax ID that is not the VAT number and not the company register ID:
   * IT codice fiscale, PL NIP (when no VAT prefix), ES NIF, HR OIB, GR AFM, CZ IČO.
   * Several national formats identify parties only by this.
   */
  nationalTaxIds: Identifier[];
  endpoint?: Identifier; // BT-34 / BT-49 electronic address
  address?: Address;
  contact?: Contact;
}

export interface Seller extends Party {
  taxRegistrationId?: string; // BT-32 (e.g. SE "Godkänd för F-skatt")
  additionalLegalInfo?: string; // BT-33 (share capital, register court, liquidation status...)
}

export interface Payee {
  // BG-10
  name: string;
  identifier?: Identifier;
  legalRegistrationId?: Identifier;
}

export interface TaxRepresentative {
  // BG-11
  name: string;
  vatId: string;
  address: Address;
}

/**
 * Parties in roles EN 16931 does not model: KSeF Podmiot3 (factor, internal recipient,
 * additional buyer, issuer on behalf of the seller, payer, VAT-group member...),
 * FatturaPA TerzoIntermediarioOSoggettoEmittente, Facturae third party, e-arve FactorParty,
 * eSLOG NAD roles. Payee and tax representative stay in their EN fields.
 */
export interface AdditionalParty {
  role: string; // 'factor', 'issuer', 'payer', 'additional-buyer', 'recipient-unit'...
  /** Role code as written in the source, e.g. 'PL:Rola:5', 'IT:SoggettoEmittente:TZ'. */
  sourceRole?: string;
  party: Party;
}

export interface Delivery {
  // BG-13
  partyName?: string;
  locationId?: Identifier;
  actualDate?: IsoDate; // BT-72
  address?: Address;
}

export interface Period {
  // BG-14 / BG-26
  start?: IsoDate;
  end?: IsoDate;
}

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

export interface PrecedingInvoiceRef {
  // BG-3
  id: string; // BT-25
  issueDate?: IsoDate; // BT-26
  /** Clearance ID of the referenced invoice (KSeF number, SdI ID, CFDI UUID...). */
  clearanceId?: string;
  /** How this document relates to the referenced one, in the source code list (CFDI TipoRelacion '01' = credit note of the related document, '04' = substitution...). */
  relationType?: string;
}

/** Why and how a corrective document corrects (KSeF KOR, Facturae rectificativa, ISDOC 2/3...). */
export interface Correction {
  reason?: string;
  reasonCode?: string; // e.g. Facturae ReasonCode 01-85
  method?: string; // e.g. Facturae CorrectionMethod 01-04, KSeF TypKorekty 1-3
  period?: Period;
}

/** A document type in the source format's own code list, kept next to the mapped UNCL 1001 code. */
export interface NationalTypeCode {
  scheme: string; // 'IT:TipoDocumento', 'PL:RodzajFaktury', 'ES:InvoiceClass', 'CZ:DocumentType'...
  code: string; // 'TD04', 'KOR', 'OR', '2'...
  label?: string;
}

// ---------------------------------------------------------------------------
// Payment
// ---------------------------------------------------------------------------

export interface CreditTransfer {
  // BG-17
  accountId: string; // BT-84 IBAN, BBAN, Bankgiro, Plusgiro...
  accountName?: string; // BT-85
  serviceProviderId?: string; // BT-86 BIC, or 'SE:BANKGIRO' / 'SE:PLUSGIRO'
}

export interface PaymentInstructions {
  // BG-16
  meansCode: PaymentMeansCode; // BT-81
  meansText?: string; // BT-82
  /** Means code in the source code list (FatturaPA 'MP05', Facturae '04', KSeF '6'...). */
  nationalMeansCode?: string;
  remittanceInformation?: string; // BT-83 (OCR, structured creditor reference, variabilní symbol...)
  creditTransfers: CreditTransfer[];
  card?: { primaryAccountNumber: string; holderName?: string; network?: string }; // BG-18 (last digits only)
  directDebit?: { mandateId?: string; creditorId?: string; debitedAccountId?: string }; // BG-19
}

/**
 * One due date in a payment schedule. EN 16931 has a single due date (BT-9);
 * FatturaPA (DettaglioPagamento), Facturae (Installment) and KSeF (TerminPlatnosci)
 * can list several, with or without amounts and with or without their own account.
 */
export interface PaymentInstallment {
  dueDate?: IsoDate;
  amount?: Amount;
  description?: string;
  /** Index into `payments` when the installment names its own means/account. */
  paymentIndex?: number;
}

// ---------------------------------------------------------------------------
// Taxes, allowances and charges
// ---------------------------------------------------------------------------

export interface VatInfo {
  // BG-30 (line) / document-level allowance-charge VAT
  categoryCode: VatCategoryCode;
  rate?: Percentage;
  /** Source code that drove the category: 'IT:N6.2', 'PL:P_12:oo', 'ES:E2'... */
  nationalCode?: string;
  exemptionReason?: string; // not an EN term on lines; national formats often state it per line
}

export interface AllowanceCharge {
  // BG-20 / BG-21 / BG-27 / BG-28
  amount: Amount;
  baseAmount?: Amount;
  percentage?: Percentage;
  reason?: string;
  reasonCode?: AllowanceChargeReasonCode;
  vat?: VatInfo; // document level only
}

export interface VatBreakdown {
  // BG-23
  taxableAmount: Amount; // BT-116
  taxAmount: Amount; // BT-117
  categoryCode: VatCategoryCode; // BT-118
  rate?: Percentage; // BT-119
  exemptionReason?: string; // BT-120
  exemptionReasonCode?: string; // BT-121 (VATEX-...)
  /** Not EN: per-rate VAT in the tax currency (KSeF P_14_xW, Facturae TaxAmount/EquivalentInEuros). */
  taxAmountInTaxCurrency?: Amount;
  nationalCode?: string;
}

/**
 * Taxes that are not VAT and not withholding, and that EN 16931 cannot express:
 * ES recargo de equivalencia, IT stamp duty (bollo), excise or environmental fees
 * stated as taxes, IGIC/IPSI when a source keeps them apart from VAT.
 */
export interface OtherTax {
  scheme: string; // 'ES:RE', 'IT:BOLLO', 'ES:IGIC'...
  taxableAmount?: Amount;
  rate?: Percentage;
  amount: Amount;
  /** True if the amount is already included in `totals.taxInclusive`. */
  includedInTotal: boolean;
  /**
   * True if the amount is also already inside `totals.taxExclusive`, because the source
   * charges it as a line or a charge (IT stamp duty as an N1 line). When false or absent,
   * an `includedInTotal` amount sits on top of BT-109 + BT-110 (ES recargo de equivalencia).
   */
  inTaxExclusive?: boolean;
}

/**
 * Withholding taxes deducted by the buyer: IT ritenuta d'acconto / previdenziale,
 * ES retención IRPF, PT retenção na fonte. EN 16931 has no term for these.
 */
export interface Withholding {
  scheme: string; // 'IT:RT01', 'IT:RT02', 'ES:IRPF', 'PT:IRS'...
  taxableAmount?: Amount;
  rate?: Percentage;
  amount: Amount;
  reasonCode?: string; // IT CausalePagamento, ES/PT reason
}

export interface Totals {
  // BG-22
  lineNetTotal: Amount; // BT-106
  allowanceTotal?: Amount; // BT-107
  chargeTotal?: Amount; // BT-108
  taxExclusive: Amount; // BT-109
  vatTotal?: Amount; // BT-110
  vatTotalInTaxCurrency?: Amount; // BT-111
  taxInclusive: Amount; // BT-112
  prepaid?: Amount; // BT-113
  rounding?: Amount; // BT-114
  /** Not EN: sum of `withholdings`. */
  withholdingTotal?: Amount;
  /**
   * Not EN: VAT the buyer pays to the tax authority instead of the seller
   * (IT split payment, EsigibilitaIVA = S). The VAT stays in `vatTotal`.
   */
  splitPaymentVat?: Amount;
  /**
   * BT-115: amount the buyer has to pay.
   * payable = taxInclusive - prepaid + rounding - withholdingTotal - splitPaymentVat
   * (the last two are 0 for every EN-based source).
   */
  payable: Amount;
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export type Attachment =
  // BG-24
  | { kind: 'embedded'; id: string; description?: string; mimeCode: string; filename: string; base64: string }
  | { kind: 'external'; id: string; description?: string; uri: string }
  /** Reference without content, e.g. a Svefaktura ObjectEnvelope or a file shipped next to the invoice. */
  | { kind: 'reference'; id: string; description?: string; typeCode?: string; schemeId?: string };

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

export interface Item {
  // BG-31
  name: string; // BT-153
  description?: string; // BT-154
  sellerId?: string; // BT-155
  buyerId?: string; // BT-156
  standardId?: Identifier; // BT-157
  classifications: { code: string; listId: string; listVersion?: string }[]; // BT-158 (CPV, UNSPSC, HR KPD, PL PKWiU/CN...)
  originCountry?: CountryCode; // BT-159
  attributes: { name: string; value: string }[]; // BG-32
}

export interface Price {
  // BG-29
  net: UnitPrice; // BT-146
  discount?: UnitPrice; // BT-147
  gross?: UnitPrice; // BT-148
  baseQuantity?: Quantity; // BT-149
  baseQuantityUnit?: UnitCode; // BT-150
}

export interface Line {
  // BG-25
  id: string; // BT-126
  note?: string; // BT-127
  objectId?: Identifier; // BT-128
  quantity?: Quantity; // BT-129
  unitCode?: UnitCode; // BT-130 (mapped to Rec 20/21)
  /** Unit as written in the source when it was free text ('st', 'kpl', 'szt.', 'ks'). */
  unitText?: string;
  netAmount: Amount; // BT-131
  orderLineRef?: string; // BT-132
  accountingRef?: string; // BT-133
  period?: Period; // BG-26
  allowances: AllowanceCharge[]; // BG-27
  charges: AllowanceCharge[]; // BG-28
  price?: Price; // BG-29
  vat?: VatInfo; // BG-30
  item: Item; // BG-31
  /** Not EN: line is subject to withholding (FatturaPA Ritenuta = SI). */
  subjectToWithholding?: boolean;
  /** Non-VAT taxes stated per line (Facturae lines can carry IVA + recargo de equivalencia). */
  otherTaxes?: OtherTax[];
  /** Withholdings stated per line (Facturae TaxesWithheld on InvoiceLine). */
  withholdings?: Withholding[];
  /**
   * How a corrective document expresses this line. KSeF corrections either list
   * differences, or list each line twice: the state before (StanPrzed = 1) and after.
   * Undefined for ordinary invoices.
   */
  correctionState?: 'delta' | 'before' | 'after';
  /** Sub-lines (XRechnung extension, Factur-X EXTENDED, France EXTENDED-CTC-FR, ISDOC). Totals come from the parent. */
  subLines?: Line[];
  /** Line-level national data (PL GTU codes and procedure, IT AltriDatiGestionali...). */
  national?: Record<string, string | string[]>;
}

// ---------------------------------------------------------------------------
// Clearance and tax-authority metadata
// ---------------------------------------------------------------------------

export type ClearanceAuthority =
  | 'IT:SDI' // Sistema di Interscambio
  | 'PL:KSEF' // Krajowy System e-Faktur
  | 'RO:SPV' // ANAF RO e-Factura
  | 'HR:FISK' // Croatian fiscalisation 2.0
  | 'GR:MYDATA' // AADE myDATA
  | 'FR:PPF' // French public invoicing platform / PDP lifecycle
  | 'PT:AT' // Portuguese tax authority (ATCUD)
  | 'ES:VERIFACTU' // Spanish invoice-issuing software records
  | 'HU:NAV' // Hungarian online invoice data reporting
  | (string & {});

export interface ClearanceInfo {
  authority: ClearanceAuthority;
  /** Authority-issued ID: SdI IdentificativoSdI, KSeF number, ANAF index, MARK... */
  documentId?: string;
  /** Second ID if the authority issues two (ANAF upload index vs download ID, myDATA UID vs MARK). */
  secondaryId?: string;
  receivedAt?: string; // ISO 8601 date-time from the authority
  status?: string; // e.g. ANAF 'ok', SdI 'RC' (ricevuta di consegna)
  /** QR code payload or URL printed on the visual (PT, GR, PL, ES, SA: base64 TLV). */
  qrPayload?: string;
  /** Invoice counter in the issuer's chain (SA ICV). */
  counter?: string;
  /** Hash of the previous invoice in the issuer's chain (SA PIH), as carried. */
  previousHash?: string;
  /** Hash of this invoice as carried in the document (SA invoice hash), not recomputed. */
  hash?: string;
  /** Number of the authority's certificate that stamped the document (CFDI NoCertificadoSAT). */
  certificateNumber?: string;
  /** The stamp as written: the authority's stamp over the document (CFDI SelloSAT, not verified) or the signature value on the invoice (SA, base64). */
  stamp?: string;
  /** Authorised intermediary that submitted the document to the authority (CFDI PAC, RfcProvCertif). */
  intermediary?: string;
}

export interface SignatureInfo {
  type: 'CAdES' | 'XAdES' | 'XMLDSig' | 'PAdES' | 'detached';
  /**
   * Cryptographic validity only: the signature value matches the signed content and the signer
   * certificate's key. true = valid, false = invalid (see `reason`), undefined = could not be checked.
   * This says nothing about who the signer is; see `trust`.
   */
  verified?: boolean;
  /** Common name of the signer certificate. */
  signer?: string;
  /** Signer certificate details, as carried in the signature. */
  certificate?: { subject: string; issuer: string; serial: string; notBefore: string; notAfter: string };
  /** Signing time (ISO 8601) from signed attributes / XAdES SigningTime, when the signature protects it. */
  signedAt?: string;
  /** Why `verified` is false, or why it could not be determined. */
  reason?: string;
  /** 'not-checked' unless trust anchors were configured: a valid signature is not a trusted signer. */
  trust?: 'not-checked' | 'trusted' | 'untrusted';
  trustReason?: string;
  /** Present when an EU trusted-list snapshot was passed (`euTrust` option): the qualified-service check of the signer. */
  euTrust?: {
    /** The signer chains to a CA/QC service whose status was granted at the signing time. */
    qualified: boolean;
    status: 'qualified' | 'not-qualified' | 'not-listed';
    /** The instant the service status was evaluated at: the signing time, or now when the signature carries none. */
    evaluatedAt: string;
    signingTimeKnown: boolean;
    service?: { provider: string; name: string; territory: string; statusAtSigning: string; currentStatus: string; statusFrom: string };
    /** `stale`: the snapshot is past its earliest next-update date, so the lists may have changed since. */
    snapshot: { fetchedAt: string; nextUpdate?: string; stale: boolean };
    reason?: string;
  };
}

// ---------------------------------------------------------------------------
// Per-country extensions
// ---------------------------------------------------------------------------

/** Italy, FatturaPA. Fields that have no EN or generic equivalent. */
export interface ItExtension {
  transmissionFormat?: 'FPA12' | 'FPR12' | 'FSM10' | (string & {});
  recipientCode?: string; // CodiceDestinatario (7 chars B2B, 6 chars PA)
  recipientPec?: string; // PECDestinatario
  transmissionSequence?: string; // ProgressivoInvio
  taxRegime?: string; // RegimeFiscale RF01-RF19 (seller)
  vatChargeability?: 'I' | 'D' | 'S' | (string & {}); // EsigibilitaIVA: S = split payment (scissione dei pagamenti)
  stampDuty?: { virtual: boolean; amount?: Amount }; // DatiBollo
  pensionFunds?: {
    // DatiCassaPrevidenziale
    type: string;
    rate?: Percentage;
    amount: Amount;
    taxableAmount?: Amount;
    vatRate?: Percentage;
    subjectToWithholding?: boolean;
    nature?: string;
  }[];
  cup?: string; // public works project code
  cig?: string; // tender code
  reasons?: string[]; // Causale
  art73?: boolean;
}

/** Poland, KSeF FA(2)/FA(3). */
export interface PlExtension {
  invoiceKind?: 'VAT' | 'KOR' | 'ZAL' | 'ROZ' | 'UPR' | 'KOR_ZAL' | 'KOR_ROZ' | (string & {});
  schemaVariant?: string; // 'FA (3)' / 'FA (2)' / 'FA_RR (1)'
  splitPayment?: boolean; // P_18A mechanizm podzielonej płatności
  cashAccounting?: boolean; // P_16 metoda kasowa
  selfBilling?: boolean; // P_17 samofakturowanie
  reverseCharge?: boolean; // P_18 odwrotne obciążenie
  exemptionBasis?: string; // P_19A/B/C podstawa zwolnienia
  marginScheme?: string; // procedura marży
  buyerIsLocalGovernmentUnit?: boolean; // JST
  buyerIsVatGroupMember?: boolean; // GV
  paid?: boolean; // Zaplacono
  paidDate?: IsoDate; // DataZaplaty
}

/** Spain, Facturae. */
export interface EsExtension {
  facturaeVersion?: string; // '3.2.2'
  invoiceClass?: 'OO' | 'OR' | 'OC' | 'CO' | 'CR' | 'CC' | (string & {});
  invoiceDocumentType?: 'FC' | 'FA' | 'AF' | (string & {});
  batchId?: string; // FileHeader/Batch/BatchIdentifier
  /** DIR3 administrative centres (public sector routing): role 01 oficina contable, 02 órgano gestor, 03 unidad tramitadora. */
  administrativeCentres?: { roleCode: string; code: string; name?: string }[];
}

/** Croatia, HR-CIUS with HR extensions. */
export interface HrExtension {
  issueTime?: IsoTime; // HR-BT-2
  copyIndicator?: boolean; // HR-BT-1
  operatorName?: string; // HR-BT-4
  operatorOib?: string; // HR-BT-5
}

/** Greece, myDATA. */
export interface GrExtension {
  invoiceType?: string; // myDATA invoiceType, e.g. '1.1'
  classifications?: { type: string; category: string; amount: Amount }[]; // income/expense classifications
}

/** Portugal. */
export interface PtExtension {
  atcud?: string;
  documentHash?: string;
  invoiceType?: 'FT' | 'FS' | 'FR' | 'NC' | 'ND' | (string & {});
}

/** France, 2026 reform (XP Z12-012). */
export interface FrExtension {
  profile?: 'EN16931' | 'EXTENDED-CTC-FR' | 'BASICWL' | 'EXTENDED' | (string & {});
  billingFramework?: string; // cadre de facturation (BT-23 values such as B1, S1, M1)
  operationCategory?: 'goods' | 'services' | 'mixed' | (string & {});
}

/** Germany: XRechnung / ZUGFeRD. Leitweg-ID itself is BT-10 (`buyerReference`). */
export interface DeExtension {
  xrechnungVersion?: string;
  zugferdProfile?: 'MINIMUM' | 'BASIC WL' | 'BASIC' | 'EN 16931' | 'EXTENDED' | 'XRECHNUNG' | (string & {});
}

/** Czechia, ISDOC. */
export interface CzExtension {
  documentType?: string; // 1-7
  variableSymbol?: string; // variabilní symbol (also mapped to BT-83)
  constantSymbol?: string;
  specificSymbol?: string;
}

/** Austria, ebInterface. */
export interface AtExtension {
  ebInterfaceVersion?: string;
  documentType?: string; // Invoice, CreditMemo, FinalSettlement, InvoiceForAdvancePayment...
  orderReferenceRequiredByFederalGovernment?: string;
}

/** Finland, Finvoice / TEAPPSXML. */
export interface FiExtension {
  invoiceTypeCode?: string; // INV01, INV02 (credit)...
  epiReference?: string; // EpiRemittanceInfoIdentifier (RF or national reference)
}

/** Estonia, e-arve. */
export interface EeExtension {
  invoiceType?: 'DEB' | 'CRE' | (string & {});
  factoring?: boolean;
}

/**
 * Peppol PINT (non-EU). GST is carried as a VAT-like scheme: `vatId` of a party holds the GST (or, in
 * Japan, qualified-invoice) registration number, and the extension repeats it under its national name.
 * Category codes in `vatBreakdown` stay as sent; the codes used are listed here for the jurisdictions
 * (SG, MY) whose code lists are not UNCL 5305.
 */
export interface SgExtension {
  sellerUen?: string; // EAS 0195
  buyerUen?: string;
  gstRegistrationNumber?: string;
  buyerGstRegistrationNumber?: string;
  gstCategories: string[];
}

/** Australia and New Zealand (PINT A-NZ, one specification for both; stored under `au` or `nz` by seller country). */
export interface AuNzExtension {
  abn?: string; // EAS 0151
  nzbn?: string; // EAS 0088
  gstRegistrationNumber?: string;
  buyerAbn?: string;
  buyerNzbn?: string;
  buyerGstRegistrationNumber?: string;
  gstCategories: string[];
}

/** Japan (PINT JP, Peppol e-invoice for the qualified invoice system). */
export interface JpExtension {
  /** Seller's qualified invoice issuer registration number: 'T' + 13 digits. */
  qualifiedInvoiceIssuerNumber?: string;
  buyerRegistrationNumber?: string;
}

/** Malaysia (PINT MY, MyInvois). TIN travels in a PartyTaxScheme with scheme GST; SST registration in the VAT scheme. */
export interface MyExtension {
  tin?: string;
  buyerTin?: string;
  sstRegistrationNumber?: string;
  buyerSstRegistrationNumber?: string;
  businessRegistrationNumber?: string; // BRN
  msicCode?: string; // seller's industry classification
  msicDescription?: string;
  freeTradeAgreement?: string;
  certifiedExporterNumber?: string;
  customsForm2?: string;
  customsImportForms: string[];
  /** LHDN unique identifier of the document this one corrects. */
  originalDocumentUuid?: string;
  taxCategories: string[];
}

/** United Arab Emirates (PINT AE). */
export interface AeExtension {
  /** The eight transaction-type flags as sent (ProfileExecutionID), e.g. '00001000'. */
  transactionTypeCode?: string;
  /** Names of the flags that are set: freeTradeZone, deemedSupply, profitMarginScheme, summaryInvoice, continuousSupply, agentBilling, ecommerce, exports. */
  transactionTypes: string[];
  uuid?: string;
  sellerTin?: string;
  buyerTin?: string;
  /** Legal registration identifier type and issuing authority (TL trade licence, EID Emirates ID, PAS passport, CD cabinet decision). */
  sellerRegistrationType?: string;
  sellerRegistrationAuthority?: string;
  buyerRegistrationType?: string;
  buyerRegistrationAuthority?: string;
  taxExchangeRate?: { sourceCurrency: string; targetCurrency: string; rate: Decimal };
  /** Frequency of billing (InvoicePeriod description). */
  billingFrequency?: string;
}

/** Saudi Arabia, ZATCA (KSA UBL profile, FATOORA). */
export interface SaExtension {
  invoiceSubtype?: 'standard' | 'simplified';
  /** InvoiceTypeCode/@name as sent: NNPNESB. */
  transactionCode?: string;
  thirdParty?: boolean;
  nominal?: boolean;
  exports?: boolean;
  summary?: boolean;
  selfBilled?: boolean;
  uuid?: string;
  counter?: string; // ICV
  previousInvoiceHash?: string; // PIH, as carried
  /** Digest of the signed invoice as carried in the XAdES signature (reference 'invoiceSignedData'). */
  invoiceHash?: string;
  stamp?: { signatureValue?: string; certificate?: string; signedAt?: string };
  qr?: SaQr;
  /** Our own recomputation of the invoice hash against what the document carries. Never fails the conversion. */
  hashCheck?: {
    status: 'match' | 'mismatch' | 'not-checked';
    computed: string;
    carried?: string;
    qr?: string;
    reason?: string;
  };
  sellerAddress?: SaAddress;
  buyerAddress?: SaAddress;
  /** Dates sent in the Hijri calendar and the Gregorian date they were converted to (tabular calendar, may be off by a day). */
  hijriDates: { field: string; hijri: string; gregorian: IsoDate }[];
}

export interface SaAddress {
  buildingNumber?: string;
  plotIdentification?: string;
  district?: string;
}

/** The ZATCA QR code (TLV, tags 1-9). Tags 1-5 are text, 6 is the base64 invoice hash, 7-9 are base64 of binary values. */
export interface SaQr {
  sellerName?: string;
  vatNumber?: string;
  timestamp?: string;
  total?: Decimal; // with VAT
  vatTotal?: Decimal;
  invoiceHash?: string;
  signature?: string;
  publicKey?: string;
  certificateSignature?: string;
}

/** Mexico, CFDI 3.3 / 4.0. Fields with no EN or generic equivalent; codes are SAT catalogue keys. */
export interface MxExtension {
  cfdiVersion?: string; // '4.0', '3.3'
  series?: string; // Serie
  folio?: string; // Folio
  /** Postal code of the place of issue (LugarExpedicion). The issuer's own address is not in a CFDI. */
  placeOfIssue?: string;
  exportation?: string; // c_Exportacion (4.0)
  confirmation?: string; // Confirmacion
  /** MetodoPago: 'PUE' paid in one payment, 'PPD' in instalments or deferred. */
  paymentMethod?: string;
  paymentForm?: string; // FormaPago (c_FormaPago), also mapped to payments[].nationalMeansCode
  issuer?: { taxRegime?: string; sealCertificateNumber?: string; seal?: string }; // RegimenFiscal, NoCertificado, Sello
  receiver?: {
    taxRegime?: string; // RegimenFiscalReceptor (4.0)
    fiscalPostalCode?: string; // DomicilioFiscalReceptor (4.0)
    cfdiUse?: string; // UsoCFDI
    taxResidence?: string; // ResidenciaFiscal (c_Pais, alpha-3), foreign receivers only
  };
  /** InformacionGlobal: invoice summarising sales to the general public. */
  globalInformation?: { periodicity?: string; months?: string; year?: string };
  /** Sum of the line discounts and the pre-discount subtotal as the CFDI states them (SubTotal, Descuento). */
  subTotal?: Amount;
  discount?: Amount;
}

export interface CountryExtensions {
  it?: ItExtension;
  pl?: PlExtension;
  es?: EsExtension;
  hr?: HrExtension;
  gr?: GrExtension;
  pt?: PtExtension;
  fr?: FrExtension;
  de?: DeExtension;
  cz?: CzExtension;
  at?: AtExtension;
  fi?: FiExtension;
  ee?: EeExtension;
  sg?: SgExtension;
  au?: AuNzExtension;
  nz?: AuNzExtension;
  jp?: JpExtension;
  my?: MyExtension;
  ae?: AeExtension;
  sa?: SaExtension;
  mx?: MxExtension;
}

// ---------------------------------------------------------------------------
// Source metadata
// ---------------------------------------------------------------------------

/** One unwrapping step between the received file and the parsed XML. */
export interface EnvelopeStep {
  kind: 'zip' | 'pdf-attachment' | 'cms-p7m' | 'base64' | 'sbdh' | 'soap' | 'xml';
  /** Entry name, attachment name or other locator. */
  name?: string;
}

export type CheckStatus = 'passed' | 'failed' | 'not-run' | 'unavailable';

/**
 * Validation results, kept per layer so a failure in one never reads as a pass in another
 * (a valid signature says nothing about the schema, and the reverse). 'unavailable' means
 * the validator could not run, which is not the same as the document failing.
 */
export interface ValidationSummary {
  parse: CheckStatus;
  schema: CheckStatus; // XSD
  semantic: CheckStatus; // EN 16931 Schematron or the national format's own rules
  profile: CheckStatus; // CIUS / Peppol / national rules
  signature: CheckStatus;
  clearance: CheckStatus; // authority acceptance (SdI receipt, KSeF number, ANAF status...)
  /** Validator bundle used per layer, e.g. { profile: 'peppol-billing-3.0.21' }. */
  bundles: Partial<Record<'schema' | 'semantic' | 'profile', string>>;
  findings: { layer: string; ruleId?: string; severity: 'fatal' | 'warning' | 'info'; message: string; path?: string }[];
}

export interface SourceMeta {
  format: FormatId;
  formatVersion?: string; // '1.2', '3.2.2', 'FA (3)', '6.1'...
  syntaxDocumentType: string; // root local name: 'Invoice', 'CreditNote', 'CrossIndustryInvoice', 'FatturaElettronica'...
  rootNamespace: string;
  specificationId?: string; // CustomizationID / guideline ID as received
  profileId?: string;
  /** Path from the received file to this XML, e.g. [{kind:'zip'}, {kind:'cms-p7m'}]. */
  envelope: EnvelopeStep[];
  /** SHA-256 of the file as received, and of the XML payload this invoice came from. */
  fileSha256: string;
  payloadSha256: string;
  /** Position and path inside a multi-invoice file (FatturaPA lot, Facturae batch, e-arve). */
  indexInFile?: number;
  fragmentPath?: string; // e.g. '/FatturaElettronica/FatturaElettronicaBody[2]'
  encoding?: string;
  filename?: string;
  signatures: SignatureInfo[];
  unmapped: Record<string, string>; // XPath -> value
  derived: { field: string; rule: string }[]; // values the mapper inferred
  /** Optional field-level provenance: canonical path -> source XPath (e.g. '/totals/payable' -> '/Invoice/cac:LegalMonetaryTotal/cbc:PayableAmount'). */
  provenance?: Record<string, string>;
  validation?: ValidationSummary;
  warnings: { code: string; message: string; path?: string }[];
}

// ---------------------------------------------------------------------------
// Line roles and relations (opt-in, see `convert(..., { relations: true })`)
// ---------------------------------------------------------------------------

/**
 * What a line is for. `item` is anything sold; `heading` and `description` carry text only
 * (zero quantity, price and amount); the rest adjust or add to other lines.
 */
export type LineRole = 'item' | 'heading' | 'description' | 'surcharge' | 'discount' | 'freight' | 'labour' | 'other';

export type LineRelationType =
  | 'heading' // a text-only line that introduces the priced lines after it
  | 'markup' // percentage surcharge on other lines
  | 'discount' // percentage reduction of other lines
  | 'allowance-base' // a line allowance/charge whose base amount equals another line
  | 'note-reference' // the line's note names another line
  | 'same-item' // same seller, buyer or standard item id
  | 'same-order-line'; // same order-line reference

export interface LineRelation {
  /** Line id (BT-126) of the line that heads, adjusts or refers to the others. */
  from: string;
  to: string[];
  type: LineRelationType;
  /** Percentage stated in the line text, for `markup` and `discount`. */
  rate?: Percentage;
  /** How it was found. Only `model` is a guess by a language model; `rule` and `arithmetic` are deterministic. */
  method: 'rule' | 'arithmetic' | 'model';
  /**
   * `proven`: the arithmetic matches exactly and uniquely. `likely`: stated in the text or structure of the
   * invoice. `review`: only a hint (shared ids, model output); do not act on it without a human.
   * Absent for structural rules that cannot be wrong, such as a heading over the lines that follow it.
   */
  confidence?: 'proven' | 'likely' | 'review';
}

// ---------------------------------------------------------------------------
// The canonical invoice
// ---------------------------------------------------------------------------

interface CanonicalBase {
  id: string; // BT-1
  issueDate: IsoDate; // BT-2
  issueTime?: IsoTime; // not EN (HR, IT, PL timestamps)
  nationalType?: NationalTypeCode;
  selfBilled: boolean; // 389/261 or national self-billing flag
  currency: CurrencyCode; // BT-5
  taxCurrency?: CurrencyCode; // BT-6
  /** Not EN as a single term: exchange rate the source used to state VAT in the tax currency. */
  exchangeRate?: { rate: Decimal; date?: IsoDate };
  taxPointDate?: IsoDate; // BT-7
  vatPointDateCode?: string; // BT-8
  dueDate?: IsoDate; // BT-9
  buyerReference?: string; // BT-10 (DE Leitweg-ID, NL/BE PO numbers)
  projectRef?: string; // BT-11
  contractRef?: string; // BT-12
  purchaseOrderRef?: string; // BT-13
  salesOrderRef?: string; // BT-14
  receivingAdviceRef?: string; // BT-15
  despatchAdviceRef?: string; // BT-16
  tenderRef?: string; // BT-17
  invoicedObjectId?: Identifier; // BT-18
  accountingRef?: string; // BT-19
  paymentTerms?: string; // BT-20
  notes: { subjectCode?: string; text: string }[]; // BG-1 (BT-21, BT-22)
  businessProcess?: string; // BT-23
  specificationId: string; // BT-24 (synthesised for non-EN sources; see source.format)
  precedingInvoices: PrecedingInvoiceRef[]; // BG-3
  correction?: Correction;
  invoicePeriod?: Period; // BG-14
  seller: Seller; // BG-4
  buyer: Party; // BG-7
  payee?: Payee; // BG-10
  taxRepresentative?: TaxRepresentative; // BG-11
  additionalParties: AdditionalParty[];
  delivery?: Delivery; // BG-13
  payments: PaymentInstructions[]; // BG-16 (EN allows one means; national formats allow several)
  paymentSchedule: PaymentInstallment[]; // empty unless the source lists several due dates or amounts
  allowances: AllowanceCharge[]; // BG-20
  charges: AllowanceCharge[]; // BG-21
  totals: Totals; // BG-22
  vatBreakdown: VatBreakdown[]; // BG-23
  otherTaxes: OtherTax[];
  withholdings: Withholding[];
  attachments: Attachment[]; // BG-24
  lines: Line[]; // BG-25 (empty for Factur-X MINIMUM / BASIC WL)
  /** Line id -> role. Only with `convert(..., { relations: true })`. Never changes `lines` or `totals`. */
  lineRoles?: Record<string, LineRole>;
  relations?: LineRelation[];
  clearance: ClearanceInfo[];
  extensions: CountryExtensions;
  source: SourceMeta;
}

export type CanonicalInvoice =
  | (CanonicalBase & { kind: 'invoice'; typeCode: InvoiceTypeCode })
  | (CanonicalBase & { kind: 'creditNote'; typeCode: CreditNoteTypeCode });

/**
 * +1 for invoices, -1 for credit notes. Multiply source amounts by this for ledger postings.
 *
 * `kind` is the accounting direction, not the document type. For corrective documents
 * whose direction depends on the amounts (KSeF KOR, Facturae rectificativa, ISDOC
 * corrective documents), parsers set `kind` from the sign of the correction total, so
 * an increase is an 'invoice' and a reduction a 'creditNote'. Lines marked
 * `correctionState: 'before' | 'after'` must not be summed directly; totals are differences.
 */
export function effectiveSign(doc: Pick<CanonicalInvoice, 'kind'>): 1 | -1 {
  return doc.kind === 'creditNote' ? -1 : 1;
}
