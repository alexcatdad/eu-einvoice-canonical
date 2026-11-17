/**
 * Rule sets for PDF extraction: declarative JSON that refines the generic rules for one invoicing program's layouts
 * (generator profile) or one issuer's layout (issuer template). Published as schemas/pdf-rule-set.v1.schema.json.
 *
 * Layers apply in order generic -> generator profile -> issuer template; a later layer replaces an earlier layer's
 * value field by field. Labels, keywords and fingerprints are literal texts, compared after normalisation (Unicode
 * NFC, Swedish lower case, whitespace folded, a trailing colon ignored); no regular expressions.
 */

/** A canonical field a rule can read, as a JSON Pointer into the canonical invoice. Payment accounts use `/payments/0/{bankgiro,plusgiro,iban,bic}`. */
export type PdfRuleField =
  | '/id'
  | '/issueDate'
  | '/dueDate'
  | '/seller/name'
  | '/seller/vatId'
  | '/seller/legalRegistrationId/value'
  | '/seller/taxRegistrationId'
  | '/seller/address/line1'
  | '/seller/address/line2'
  | '/seller/address/postalCode'
  | '/seller/address/city'
  | '/buyer/name'
  | '/buyer/address/line1'
  | '/buyer/address/line2'
  | '/buyer/address/postalCode'
  | '/buyer/address/city'
  | '/payments/0/remittanceInformation'
  | '/payments/0/bankgiro'
  | '/payments/0/plusgiro'
  | '/payments/0/iban'
  | '/payments/0/bic'
  | '/totals/lineNetTotal'
  | '/totals/allowanceTotal'
  | '/totals/chargeTotal'
  | '/totals/taxExclusive'
  | '/totals/vatTotal'
  | '/totals/taxInclusive'
  | '/totals/prepaid'
  | '/totals/rounding'
  | '/totals/payable';

/** A rectangle in PDF points, x to the right and y down (the layout model's coordinates). */
export interface PdfRuleRegion {
  x: number;
  y: number;
  /** @exclusiveMinimum 0 */
  width: number;
  /** @exclusiveMinimum 0 */
  height: number;
}

/**
 * Where one field's value is printed. With `label`: the value is right of the label on its line (`right`, the
 * default), directly under it (`below`), in the same text after it (`inline`, as in "Fakturanr: 123"), or inside a
 * region relative to the label's top-left corner. Without `label`: inside `region` on page `page`.
 * The value is parsed as the field's type (date, amount, identifier with check digits, text); every occurrence must
 * give the same value. When it cannot be read, the field gets a problem and no value.
 */
export interface PdfFieldRule {
  /** Literal label text. */
  label?: PdfRuleText;
  /** How the label is compared: the whole text (default) or its start, for labels followed by varying text such as "Förfallodatum (30 dagar netto)". */
  labelMatch?: 'whole' | 'start';
  /** Where the value stands relative to the label. */
  value?: 'right' | 'below' | 'inline';
  /** Region relative to the label's top-left corner, or in page coordinates when there is no label. */
  region?: PdfRuleRegion;
  /**
   * Page (1-based) of a region in page coordinates; default 1.
   * @asType integer
   * @minimum 1
   */
  page?: number;
  /** When the label is not printed, keep what the earlier layers read instead of reporting a problem. */
  optional?: boolean;
}

/**
 * A party's address block: the first line is under the label, or the one text in `region` relative to the label's
 * top-left corner; each next line is directly under the previous one, down to the postal line "NNN NN City".
 * Replaces the party's address (and name, with `name`) read by earlier layers.
 */
export interface PdfAddressRule {
  label: PdfRuleText;
  labelMatch?: 'whole' | 'start';
  region?: PdfRuleRegion;
  /**
   * `true`: the first line is the party's name. `auto`: it is the name when it equals the name read by an earlier
   * layer, or when three lines stand above the postal line and the first ends in a company form (AB, HB, ...);
   * otherwise, with no name read earlier, the block is ambiguous and reported. Absent or `false`: no name line.
   */
  name?: boolean | 'auto';
  /** When the label is not printed, keep what earlier layers read instead of reporting a problem. */
  optional?: boolean;
}

/** Column kinds of an item table. */
export type PdfTableColumn =
  | 'desc'
  | 'pos'
  | 'vat'
  | 'artnr'
  | 'qty'
  | 'qtyUnit'
  | 'unit'
  | 'price'
  | 'rate'
  | 'discount'
  | 'amount'
  | 'date';

/**
 * The item table, by its header: every cell of the header line, by its literal text, and the column it names.
 * Must name a `desc` and an `amount` column. The table's lines replace the lines read by earlier layers.
 */
export interface PdfTableRule {
  columns: Record<string, PdfTableColumn>;
  /** When no such header is printed, keep the lines read by earlier layers instead of reporting a problem. */
  optional?: boolean;
}

/** Values used when no layer read the field; recorded as derived, never as printed. */
export interface PdfRuleDefaults {
  /**
   * ISO 4217 code, e.g. "SEK".
   * @pattern ^[A-Z]{3}$
   */
  currency?: string;
  /**
   * UNTDID 4461 payment means code, e.g. "30".
   * @pattern ^\d{1,3}$
   */
  paymentMeansCode?: string;
}

/** One layout of the rule set, chosen by its fingerprint. */
export interface PdfRuleLayout {
  /** Short name, reported with problems. */
  name: PdfRuleText;
  /** Texts that must all be printed on the read pages for this layout to apply. Empty or absent: always applies. */
  fingerprint?: PdfRuleText[];
  fields?: Partial<Record<PdfRuleField, PdfFieldRule>>;
  /** Address blocks of the seller and the buyer. */
  addresses?: { seller?: PdfAddressRule; buyer?: PdfAddressRule };
  lines?: PdfTableRule;
  defaults?: PdfRuleDefaults;
}

/**
 * Selects a rule set. A generator profile is selected when the PDF's Producer or Creator contains one of the given
 * texts (case-insensitive); with neither given, by its layouts' fingerprints alone (each layout then needs one). An issuer template is selected when one of the issuer's identifiers is printed on the
 * page (and the seller identifiers the generic rules read, if any, are among them), or when every keyword is printed.
 */
export interface PdfRuleMatch {
  producer?: PdfRuleTexts;
  creator?: PdfRuleTexts;
  sellerVatId?: PdfRuleTexts;
  orgNumber?: PdfRuleTexts;
  bankgiro?: PdfRuleTexts;
  plusgiro?: PdfRuleTexts;
  iban?: PdfRuleTexts;
  keywords?: PdfRuleTexts;
}

/**
 * A non-empty list of non-empty texts.
 * @minItems 1
 */
export type PdfRuleTexts = PdfRuleText[];

/**
 * A non-empty text.
 * @minLength 1
 */
export type PdfRuleText = string;

/** A generator profile or issuer template. */
export interface PdfRuleSet {
  /** URL of the JSON Schema, for editors. */
  $schema?: string;
  kind: 'generator-profile' | 'issuer-template';
  /**
   * Lower-case letters, digits and hyphens.
   * @pattern ^[a-z0-9]+(?:-[a-z0-9]+)*$
   */
  id: string;
  /**
   * The rule set's own version, a positive integer raised on each change.
   * @asType integer
   * @minimum 1
   */
  version: number;
  /**
   * Exact pdfjs-dist version the rules were written and tested against. A rule set for another version is not applied; the result reports it.
   * @pattern ^\d+\.\d+\.\d+$
   */
  pdfjsVersion: string;
  description?: string;
  match: PdfRuleMatch;
  /**
   * Layouts. The one whose fingerprint matches applies; when none matches, the rule set is not applied; when several match, none applies and the result reports it.
   * @minItems 1
   */
  layouts: PdfRuleLayout[];
}
