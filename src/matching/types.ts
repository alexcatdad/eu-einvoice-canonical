/**
 * Types for purchase-order matching: the simple PO model, goods receipts, tolerances and the result.
 * Quantities and amounts are decimal strings, as everywhere else in the canonical model.
 */
import type { LineRole } from '../canonical.js';

export interface PoLine {
  /** Order line id, the value invoices carry in BT-132. */
  id: string;
  description?: string;
  sellerItemId?: string;
  buyerItemId?: string;
  /** Standard item id (GTIN...). */
  standardItemId?: { value: string; schemeId?: string };
  quantity: string;
  /** UN/ECE Rec 20/21 code (`H87`, `KGM`...) or free text. */
  unit?: string;
  /** Net price per `baseQuantity` units (default 1). */
  unitPrice: string;
  baseQuantity?: string;
  /** VAT category code (`S`, `Z`...) and rate in percent, when the order states them. */
  vat?: { categoryCode?: string; rate?: string };
  /** Quantity already invoiced on earlier invoices, so partial invoicing is not flagged as over-invoicing. */
  invoicedQuantity?: string;
}

export interface PurchaseOrder {
  /** Order number: what invoices carry in BT-13. */
  id: string;
  currency?: string;
  issueDate?: string;
  seller?: { name?: string; vatId?: string };
  buyer?: { name?: string };
  lines: PoLine[];
}

/** Goods received against one order. Lines name PO line ids. */
export interface Receipt {
  /** The order the receipt belongs to. May be omitted when only one order is matched. */
  poId?: string;
  lines: { lineId: string; quantity: string }[];
}

/** A limit on a difference. Both set means both must hold. Unset means zero tolerance. */
export interface Tolerance {
  /** Largest allowed absolute difference (in the unit of the measure: quantity, currency, VAT percentage points). */
  absolute?: string;
  /** Largest allowed difference as a percentage of the expected value. */
  percent?: string;
}

export interface Tolerances {
  quantity?: Tolerance;
  unitPrice?: Tolerance;
  /** Line net amount against PO unit price x invoiced quantity. */
  total?: Tolerance;
  /** VAT rate difference in percentage points. */
  vat?: Tolerance;
}

export type MatchMethod = 'reference' | 'item' | 'relation' | 'description';
export type MatchConfidence = 'high' | 'medium' | 'low';
export type VarianceStatus = 'exact' | 'within-tolerance' | 'exceeded';

export interface Variance {
  invoiced: string;
  expected: string;
  /** invoiced - expected */
  difference: string;
  /** difference as a percentage of expected; absent when expected is zero */
  percent?: string;
  status: VarianceStatus;
  /** Quantity only: fewer units invoiced than expected, which is normal partial invoicing and never `exceeded`. */
  partial?: boolean;
}

export interface VatVariance {
  invoiced?: { categoryCode?: string; rate?: string };
  expected: { categoryCode?: string; rate?: string };
  rateDifference?: string;
  categoryMismatch: boolean;
  status: VarianceStatus;
}

export interface PoLineRef {
  poId: string;
  lineId: string;
}

export type LineStatus = 'matched' | 'ignored' | 'unmatched';

export interface LineMatch {
  invoiceLineId: string;
  role: LineRole;
  status: LineStatus;
  method?: MatchMethod;
  confidence?: MatchConfidence;
  poLines: PoLineRef[];
  /** For a markup or discount line matched by relation: the invoice lines it applies to. */
  appliesTo?: string[];
  /** Description matches only: the similarity score (0..1). */
  similarity?: string;
  variances: { quantity?: Variance; unitPrice?: Variance; total?: Variance; vat?: VatVariance };
  /** Why the line was ignored or left unmatched, or what was observed while matching. */
  notes: string[];
}

export type FindingSeverity = 'info' | 'warning' | 'error';

export interface Finding {
  code: string;
  severity: FindingSeverity;
  message: string;
  invoiceLineId?: string;
  poId?: string;
}

export interface OverInvoiced {
  poId: string;
  lineId: string;
  ordered: string;
  received?: string;
  /** Quantity on earlier invoices plus this one (credit notes subtract). */
  invoiced: string;
  /** What the invoiced quantity is held against: the ordered or the received quantity. */
  limit: 'ordered' | 'received';
  excess: string;
}

export interface NotYetReceived {
  poId: string;
  lineId: string;
  ordered: string;
  received: string;
  outstanding: string;
}

export type Verdict = 'match' | 'within-tolerance' | 'needs-review';

export interface MatchResult {
  invoiceId: string;
  kind: 'invoice' | 'creditNote';
  /** Three-way when receipts were supplied. */
  threeWay: boolean;
  purchaseOrderIds: string[];
  lines: LineMatch[];
  unmatchedInvoiceLines: string[];
  overInvoiced: OverInvoiced[];
  /** Only filled when receipts were supplied. */
  notYetReceived: NotYetReceived[];
  findings: Finding[];
  verdict: Verdict;
}

export interface MatchOptions {
  tolerances?: Tolerances;
  receipts?: Receipt[];
  /** Smallest description similarity (0..1) accepted as a last-resort match. Default 0.6. */
  descriptionThreshold?: number;
}
