/**
 * Reading purchase orders and receipts from JSON. The accepted shapes are documented in the README
 * ("Matching invoices to purchase orders"); anything else is rejected with a message naming the field.
 */
import { toDecimal } from '../values.js';
import type { PoLine, PurchaseOrder, Receipt } from './types.js';

export class MatchInputError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function str(v: unknown, where: string, required = false): string | undefined {
  if (v === undefined || v === null || v === '') {
    if (required) throw new MatchInputError(`${where} is required`);
    return undefined;
  }
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  throw new MatchInputError(`${where} must be a string`);
}

/** Decimals are accepted as strings or numbers; numbers are converted through their shortest decimal form. */
function dec(v: unknown, where: string, required = false): string | undefined {
  const s = str(v, where, required);
  if (s === undefined) return undefined;
  try {
    return toDecimal(s);
  } catch {
    throw new MatchInputError(`${where} is not a decimal number: "${s}"`);
  }
}

function poLine(raw: unknown, where: string): PoLine {
  if (!isObj(raw)) throw new MatchInputError(`${where} must be an object`);
  const std = raw.standardItemId;
  let standardItemId: PoLine['standardItemId'];
  if (isObj(std))
    standardItemId = {
      value: str(std.value, `${where}.standardItemId.value`, true)!,
      schemeId: str(std.schemeId, `${where}.standardItemId.schemeId`),
    };
  else if (std !== undefined) standardItemId = { value: str(std, `${where}.standardItemId`, true)! };
  let vat: PoLine['vat'];
  if (raw.vat !== undefined) {
    if (!isObj(raw.vat)) throw new MatchInputError(`${where}.vat must be an object`);
    vat = { categoryCode: str(raw.vat.categoryCode, `${where}.vat.categoryCode`), rate: dec(raw.vat.rate, `${where}.vat.rate`) };
  }
  return {
    id: str(raw.id, `${where}.id`, true)!,
    description: str(raw.description, `${where}.description`),
    sellerItemId: str(raw.sellerItemId, `${where}.sellerItemId`),
    buyerItemId: str(raw.buyerItemId, `${where}.buyerItemId`),
    standardItemId,
    quantity: dec(raw.quantity, `${where}.quantity`, true)!,
    unit: str(raw.unit, `${where}.unit`),
    unitPrice: dec(raw.unitPrice, `${where}.unitPrice`, true)!,
    baseQuantity: dec(raw.baseQuantity, `${where}.baseQuantity`),
    vat,
    invoicedQuantity: dec(raw.invoicedQuantity, `${where}.invoicedQuantity`),
  };
}

export function toPurchaseOrder(raw: unknown, where = 'purchaseOrder'): PurchaseOrder {
  if (!isObj(raw)) throw new MatchInputError(`${where} must be an object`);
  if (!Array.isArray(raw.lines)) throw new MatchInputError(`${where}.lines must be an array`);
  const seller = isObj(raw.seller)
    ? { name: str(raw.seller.name, `${where}.seller.name`), vatId: str(raw.seller.vatId, `${where}.seller.vatId`) }
    : undefined;
  const buyer = isObj(raw.buyer) ? { name: str(raw.buyer.name, `${where}.buyer.name`) } : undefined;
  const lines = raw.lines.map((l, i) => poLine(l, `${where}.lines[${i}]`));
  const seen = new Set<string>();
  for (const l of lines) {
    if (seen.has(l.id)) throw new MatchInputError(`${where}: duplicate line id "${l.id}"`);
    seen.add(l.id);
  }
  return {
    id: str(raw.id, `${where}.id`, true)!,
    currency: str(raw.currency, `${where}.currency`),
    issueDate: str(raw.issueDate, `${where}.issueDate`),
    seller,
    buyer,
    lines,
  };
}

/** One order, an array of orders, or `{ "purchaseOrders": [...] }`. */
export function parsePurchaseOrdersJson(text: string): PurchaseOrder[] {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (e) {
    throw new MatchInputError(`Purchase order file is not valid JSON: ${(e as Error).message}`);
  }
  const list = Array.isArray(v) ? v : isObj(v) && Array.isArray(v.purchaseOrders) ? v.purchaseOrders : [v];
  if (list.length === 0) throw new MatchInputError('No purchase orders in the file');
  return list.map((o, i) => toPurchaseOrder(o, list.length === 1 && !Array.isArray(v) ? 'purchaseOrder' : `purchaseOrders[${i}]`));
}

function toReceipt(raw: unknown, where: string): Receipt {
  if (!isObj(raw)) throw new MatchInputError(`${where} must be an object`);
  if (!Array.isArray(raw.lines)) throw new MatchInputError(`${where}.lines must be an array`);
  return {
    poId: str(raw.poId, `${where}.poId`),
    lines: raw.lines.map((l, i) => {
      if (!isObj(l)) throw new MatchInputError(`${where}.lines[${i}] must be an object`);
      return {
        lineId: str(l.lineId, `${where}.lines[${i}].lineId`, true)!,
        quantity: dec(l.quantity, `${where}.lines[${i}].quantity`, true)!,
      };
    }),
  };
}

/** One receipt, an array of receipts, or `{ "receipts": [...] }`. */
export function parseReceiptsJson(text: string): Receipt[] {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (e) {
    throw new MatchInputError(`Receipts file is not valid JSON: ${(e as Error).message}`);
  }
  const list = Array.isArray(v) ? v : isObj(v) && Array.isArray(v.receipts) ? v.receipts : [v];
  return list.map((r, i) => toReceipt(r, `receipts[${i}]`));
}
