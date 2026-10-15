import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type CanonicalInvoice, convert } from '../src/index.js';

export const fixturePath = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
export const fixture = (name: string) => new Uint8Array(readFileSync(fixturePath(name)));
export const utf8 = (s: string) => new TextEncoder().encode(s);

export const NSI = 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';
export const NSCN = 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2';
export const CBC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
export const CII = 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100';
export const RAM = 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100';
export const PEPPOL = 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0';

/** Minimal UBL header: enough for detection, not for parsing. */
export const ublHeader = (customizationId: string, opts: { root?: 'Invoice' | 'CreditNote'; before?: string; rootAttrs?: string } = {}) => {
  const root = opts.root ?? 'Invoice';
  return `<${root} xmlns="${root === 'Invoice' ? NSI : NSCN}" xmlns:cbc="${CBC}"${opts.rootAttrs ?? ''}>${opts.before ?? ''}<cbc:CustomizationID>${customizationId}</cbc:CustomizationID><cbc:ID>1</cbc:ID></${root}>`;
};

export const ciiHeader = (guidelineId: string) =>
  `<rsm:CrossIndustryInvoice xmlns:rsm="${CII}" xmlns:ram="${RAM}"><rsm:ExchangedDocumentContext><ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>${guidelineId}</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext></rsm:CrossIndustryInvoice>`;

/** Converts a fixture and returns its single invoice, failing loudly otherwise. */
export async function parseOne(nameOrBytes: string | Uint8Array, filename?: string): Promise<CanonicalInvoice> {
  const bytes = typeof nameOrBytes === 'string' ? fixture(nameOrBytes) : nameOrBytes;
  const r = await convert(bytes, typeof nameOrBytes === 'string' ? nameOrBytes : filename);
  if (r.outcomes.length !== 1) throw new Error(`expected 1 document, got ${r.outcomes.length}; skipped: ${JSON.stringify(r.skipped)}`);
  const o = r.outcomes[0];
  if (o.status !== 'ok') throw new Error(`expected ok, got ${o.status}: ${JSON.stringify(o)}`);
  if (o.invoices.length !== 1) throw new Error(`expected 1 invoice, got ${o.invoices.length}`);
  return o.invoices[0];
}

export const warningCodes = (inv: CanonicalInvoice) => inv.source.warnings.map((w) => w.code);
