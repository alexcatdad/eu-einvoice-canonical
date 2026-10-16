/** Generated inputs for the benchmarks: large invoices built from a real fixture. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const fixtures = join(import.meta.dir, '..', 'test', 'fixtures');
export const fixture = (name: string) => new Uint8Array(readFileSync(join(fixtures, name)));

const BASE = readFileSync(join(fixtures, 'peppol-bis3-invoice.xml'), 'utf8');
const FIRST_LINE = BASE.indexOf('<cac:InvoiceLine>');
const LAST_LINE = BASE.lastIndexOf('</cac:InvoiceLine>') + '</cac:InvoiceLine>'.length;
const HEAD = BASE.slice(0, FIRST_LINE);
const TAIL = BASE.slice(LAST_LINE);

/** One line in the shape real invoices have, with a distinct id, an order reference and some text to match on. */
function line(i: number): string {
  const net = ((i % 97) + 1) * 2;
  // Every tenth line is a stated percentage (quantity 1, a rate in the text, an amount that fits nothing), which sends the relations search through its subsets.
  const rateLine = i % 10 === 0;
  const qty = rateLine ? 1 : 2;
  const price = rateLine ? net : net / 2;
  return `<cac:InvoiceLine>
    <cbc:ID>${i}</cbc:ID>
    <cbc:Note>Line ${i}</cbc:Note>
    <cbc:InvoicedQuantity unitCode="H87">${qty}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="SEK">${net}.00</cbc:LineExtensionAmount>
    <cac:OrderLineReference><cbc:LineID>${i}</cbc:LineID></cac:OrderLineReference>
    <cac:Item>
      <cbc:Name>Article ${i}${rateLine ? ' 7 %' : ''}</cbc:Name>
      <cac:SellersItemIdentification><cbc:ID>A-${i}</cbc:ID></cac:SellersItemIdentification>
      <cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="SEK">${price}.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>`;
}

export function largeInvoice(lines: number): Uint8Array {
  const parts = [HEAD];
  for (let i = 1; i <= lines; i++) parts.push(line(i), '\n  ');
  parts.push(TAIL);
  return new TextEncoder().encode(parts.join(''));
}

/** A UBL invoice carrying one embedded attachment of `megabytes` MB of (incompressible-looking) binary. */
export function invoiceWithAttachment(megabytes: number): Uint8Array {
  const raw = new Uint8Array(megabytes * 1024 * 1024);
  let x = 0x9e3779b9;
  for (let i = 0; i < raw.length; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    raw[i] = x >>> 24;
  }
  const b64 = Buffer.from(raw)
    .toString('base64')
    .replace(/(.{76})/g, '$1\n');
  const doc = `<cac:AdditionalDocumentReference>
    <cbc:ID>BIG</cbc:ID>
    <cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="application/pdf" filename="big.pdf">${b64}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment>
  </cac:AdditionalDocumentReference>
  `;
  const at = BASE.indexOf('<cac:AdditionalDocumentReference>');
  return new TextEncoder().encode(BASE.slice(0, at) + doc + BASE.slice(at));
}

const cacheDir = join(import.meta.dir, '.cache');

/**
 * Generated inputs are written to bench/.cache once and read back from there, so a child process that
 * measures peak memory pays for the input bytes but not for generating them.
 */
export function cached(name: string, make: () => Uint8Array): Uint8Array {
  const path = join(cacheDir, name);
  if (!existsSync(path)) {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(path, make());
  }
  return new Uint8Array(readFileSync(path));
}
