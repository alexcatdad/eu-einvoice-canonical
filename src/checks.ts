/**
 * Arithmetic checks on a canonical invoice, after mapping. The sender's totals are
 * never trusted or overwritten: mismatches become warnings.
 *
 * Implements the EN 16931 calculation rules as Peppol's Schematron applies them
 * (sums rounded to 2 decimals before comparing):
 *   BR-CO-10  BT-106 = Σ BT-131
 *   BR-CO-13  BT-109 = BT-106 − BT-107 + BT-108
 *   BR-CO-14  BT-110 = Σ BT-117
 *   BR-CO-15  BT-112 = BT-109 + BT-110
 *   BR-CO-16  BT-115 = BT-112 − BT-113 + BT-114 (minus withholdings and split-payment VAT, which EN does not have)
 */
import type { CanonicalInvoice } from './canonical.js';
import { add, cmp, round, sub, sum } from './values.js';

export interface Finding { code: string; message: string; path?: string }

export function checkTotals(inv: CanonicalInvoice): Finding[] {
  const out: Finding[] = [];
  const t = inv.totals;
  const eq = (a: string, b: string) => cmp(round(a), round(b)) === 0;
  const check = (code: string, path: string, actual: string, expected: string, what: string) => {
    if (!eq(actual, expected)) out.push({ code, path, message: `${what}: invoice says ${actual}, calculated ${round(expected)}` });
  };

  const lineRows = inv.lines.filter((l) => l.correctionState === undefined || l.correctionState === 'delta');
  if (inv.lines.length > 0 && lineRows.length === inv.lines.length) {
    check('BR-CO-10', '/totals/lineNetTotal', t.lineNetTotal, sum(inv.lines.map((l) => l.netAmount)), 'Sum of line net amounts (BT-106)');
  }
  check('BR-CO-13', '/totals/taxExclusive', t.taxExclusive,
    add(sub(t.lineNetTotal, t.allowanceTotal ?? '0'), t.chargeTotal ?? '0'), 'Total without VAT (BT-109)');
  if (t.vatTotal !== undefined && inv.vatBreakdown.length > 0) {
    check('BR-CO-14', '/totals/vatTotal', t.vatTotal, sum(inv.vatBreakdown.map((v) => v.taxAmount)), 'Total VAT (BT-110)');
  }
  check('BR-CO-15', '/totals/taxInclusive', t.taxInclusive, add(t.taxExclusive, t.vatTotal ?? '0'), 'Total with VAT (BT-112)');
  const payable = sub(sub(add(sub(t.taxInclusive, t.prepaid ?? '0'), t.rounding ?? '0'), t.withholdingTotal ?? '0'), t.splitPaymentVat ?? '0');
  check('BR-CO-16', '/totals/payable', t.payable, payable, 'Amount due (BT-115)');
  return out;
}
