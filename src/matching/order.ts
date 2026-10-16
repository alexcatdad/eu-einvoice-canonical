/**
 * UBL 2.1 Order (Peppol BIS Order 3) -> `PurchaseOrder`. Reads only what matching needs: the order
 * number, currency, parties' names and, per order line, ids, description, quantity, unit, price and VAT.
 * Nothing is invented: a line without a quantity or a price is an error, not a zero.
 */
import { Ctx, ParseError, parseXml } from '../parsers/context.js';
import { MatchInputError } from './po.js';
import type { PoLine, PurchaseOrder } from './types.js';

const NS = {
  order: 'urn:oasis:names:specification:ubl:schema:xsd:Order-2',
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
};

const MAX_BYTES = 20 * 1024 * 1024;

/** Cheap check on the start of the text: is this a UBL 2.1 Order? */
export function isOrderXml(text: string): boolean {
  return text.slice(0, 4096).includes(NS.order);
}

export function parseOrder(input: string | Uint8Array): PurchaseOrder {
  if (typeof input !== 'string' && input.length > MAX_BYTES) throw new MatchInputError('Order file is too large');
  const xml = typeof input === 'string' ? input : new TextDecoder('utf-8').decode(input).replace(/^﻿/, '');
  if (/<!DOCTYPE/i.test(xml)) throw new MatchInputError('Order XML with a DOCTYPE is not accepted');
  let root: ReturnType<typeof parseXml>;
  try {
    root = parseXml(xml);
  } catch (e) {
    throw new MatchInputError(`Order XML is not well-formed: ${(e as Error).message}`);
  }
  if (root.localName !== 'Order' || root.namespaceURI !== NS.order) throw new MatchInputError('Not a UBL 2.1 Order document');
  try {
    const c = new Ctx(NS);
    const id = c.text(root, 'cbc:ID');
    if (!id) throw new MatchInputError('Order number (cbc:ID) missing');
    const lines = c.all(root, 'cac:OrderLine/cac:LineItem').map((li, i): PoLine => {
      const lineId = c.text(li, 'cbc:ID');
      const where = `Order line ${lineId ?? i + 1}`;
      if (!lineId) throw new MatchInputError(`${where}: cbc:ID missing`);
      const qtyEl = c.el(li, 'cbc:Quantity');
      const quantity = c.dec(qtyEl);
      if (quantity === undefined) throw new MatchInputError(`${where}: cbc:Quantity missing`);
      const priceEl = c.el(li, 'cac:Price');
      const unitPrice = c.dec(priceEl, 'cbc:PriceAmount');
      if (unitPrice === undefined) throw new MatchInputError(`${where}: cac:Price/cbc:PriceAmount missing`);
      const item = c.el(li, 'cac:Item');
      const std = c.el(item, 'cac:StandardItemIdentification/cbc:ID');
      const tax = c.el(item, 'cac:ClassifiedTaxCategory');
      const stdValue = c.text(std);
      return {
        id: lineId,
        description: c.text(item, 'cbc:Name') ?? c.text(item, 'cbc:Description'),
        sellerItemId: c.text(item, 'cac:SellersItemIdentification/cbc:ID'),
        buyerItemId: c.text(item, 'cac:BuyersItemIdentification/cbc:ID'),
        standardItemId: stdValue ? { value: stdValue, schemeId: c.attr(std, undefined, 'schemeID') } : undefined,
        quantity,
        unit: c.attr(qtyEl, undefined, 'unitCode'),
        unitPrice,
        baseQuantity: c.dec(priceEl, 'cbc:BaseQuantity'),
        vat: tax ? { categoryCode: c.text(tax, 'cbc:ID'), rate: c.dec(tax, 'cbc:Percent') } : undefined,
      };
    });
    const seen = new Set<string>();
    for (const l of lines) {
      if (seen.has(l.id)) throw new MatchInputError(`Duplicate order line id "${l.id}"`);
      seen.add(l.id);
    }
    return {
      id,
      currency: c.text(root, 'cbc:DocumentCurrencyCode'),
      issueDate: c.text(root, 'cbc:IssueDate'),
      seller: {
        name:
          c.text(root, 'cac:SellerSupplierParty/cac:Party/cac:PartyLegalEntity/cbc:RegistrationName') ??
          c.text(root, 'cac:SellerSupplierParty/cac:Party/cac:PartyName/cbc:Name'),
        vatId: c.text(root, 'cac:SellerSupplierParty/cac:Party/cac:PartyTaxScheme/cbc:CompanyID'),
      },
      buyer: {
        name:
          c.text(root, 'cac:BuyerCustomerParty/cac:Party/cac:PartyLegalEntity/cbc:RegistrationName') ??
          c.text(root, 'cac:BuyerCustomerParty/cac:Party/cac:PartyName/cbc:Name'),
      },
      lines,
    };
  } catch (e) {
    if (e instanceof ParseError) throw new MatchInputError(e.message);
    throw e;
  }
}
