/**
 * Shared machinery for the writers: a tiny XML tree with a deterministic serialiser, text and
 * attribute escaping, decimal pass-through and the choice of the specification identifier.
 *
 * Values are written as the canonical model holds them. Decimals are strings and stay strings:
 * nothing here converts them to a JS number, and the only arithmetic is the exact BigInt `sum`
 * from `values.ts` (used once, to fill a document-level VAT total the model leaves out).
 */
import { isDecimal } from '../values.js';

/** Thrown when the canonical invoice holds something the target syntax cannot carry (for example a malformed decimal). */
export class WriterError extends Error {}

export type Attrs = Record<string, string | undefined>;

export interface XmlNode {
  name: string;
  attrs: Attrs;
  /** Text content. A node has either text or children, never both. */
  text?: string;
  children: XmlNode[];
}

/** What a builder accepts as a child: a node, or nothing at all (skipped). */
export type Child = XmlNode | undefined | null | false;

/** Whether a code point may appear in an XML 1.0 document. */
function xmlChar(cp: number): boolean {
  return cp === 0x9 || cp === 0xa || cp === 0xd || (cp >= 0x20 && cp <= 0xd7ff) || (cp >= 0xe000 && cp <= 0xfffd) || cp >= 0x10000;
}

/** Drops what XML 1.0 forbids (control characters, lone surrogates, U+FFFE/U+FFFF); everything else is kept as is. */
export function cleanXmlText(s: string): string {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (xmlChar(cp)) out += ch;
  }
  return out;
}

export function escapeText(s: string): string {
  return cleanXmlText(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#13;');
}

export function escapeAttr(s: string): string {
  return cleanXmlText(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\t/g, '&#9;')
    .replace(/\n/g, '&#10;')
    .replace(/\r/g, '&#13;');
}

/** An element with text content; undefined text means "not there" and yields no node. Empty text yields an empty element. */
export function leaf(name: string, text: string | undefined, attrs: Attrs = {}): XmlNode | undefined {
  if (text === undefined) return undefined;
  return { name, attrs, text, children: [] };
}

/** An element with children; yields no node when none of the children is present, unless `keepEmpty`. */
export function group(name: string, children: Child[], opts: { attrs?: Attrs; keepEmpty?: boolean } = {}): XmlNode | undefined {
  const kids = children.filter((c): c is XmlNode => !!c);
  if (kids.length === 0 && !opts.keepEmpty) return undefined;
  return { name, attrs: opts.attrs ?? {}, children: kids };
}

/** A decimal exactly as the model holds it; refuses anything that is not an xsd:decimal. */
export function dec(value: string, what: string): string {
  if (!isDecimal(value)) throw new WriterError(`${what}: "${value}" is not a decimal`);
  return value;
}

/** Same for an optional decimal. */
export function optDec(value: string | undefined, what: string): string | undefined {
  return value === undefined ? undefined : dec(value, what);
}

function openTag(n: XmlNode, extra: Attrs = {}): string {
  let s = `<${n.name}`;
  for (const [k, v] of Object.entries({ ...extra, ...n.attrs })) if (v !== undefined && v !== '') s += ` ${k}="${escapeAttr(v)}"`;
  return s;
}

function write(n: XmlNode, depth: number, extra: Attrs, out: string[]): void {
  const pad = '  '.repeat(depth);
  const open = openTag(n, extra);
  if (n.children.length > 0) {
    out.push(`${pad}${open}>`);
    for (const c of n.children) write(c, depth + 1, {}, out);
    out.push(`${pad}</${n.name}>`);
  } else if (n.text !== undefined && n.text !== '') out.push(`${pad}${open}>${escapeText(n.text)}</${n.name}>`);
  else out.push(`${pad}${open}/>`);
}

/** Serialises a tree: XML declaration, two-space indentation, one element per line, newline at the end. Same tree, same bytes. */
export function serialize(root: XmlNode, namespaces: Attrs): string {
  const out: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
  write(root, 0, namespaces, out);
  return `${out.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// VAT point date code (BT-8)
// ---------------------------------------------------------------------------

/** BT-8 is coded with UNTDID 2005 in UBL (InvoicePeriod/DescriptionCode) and with UNTDID 2475 in CII (DueDateTypeCode). */
const BT8_2475_TO_2005: Record<string, string> = { '5': '3', '29': '35', '72': '432' };
const BT8_2005_TO_2475: Record<string, string> = { '3': '5', '35': '29', '432': '72' };

/** The code as UBL writes it: a UNTDID 2475 code is translated, anything else is kept. */
export const vatPointCodeForUbl = (code: string | undefined): string | undefined =>
  code === undefined ? undefined : (BT8_2475_TO_2005[code] ?? code);
/** The code as CII writes it: a UNTDID 2005 code is translated, anything else is kept. */
export const vatPointCodeForCii = (code: string | undefined): string | undefined =>
  code === undefined ? undefined : (BT8_2005_TO_2475[code] ?? code);

// ---------------------------------------------------------------------------
// Specification identifier (BT-24) and business process (BT-23)
// ---------------------------------------------------------------------------

/** The specifications the writers can stamp on a document. */
export type WriterProfile = 'peppol-bis3' | 'xrechnung' | 'en16931';

const PEPPOL_PROCESS = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';

export const PROFILES: Record<WriterProfile, { specificationId: string; businessProcess?: string }> = {
  'peppol-bis3': {
    specificationId: 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0',
    businessProcess: PEPPOL_PROCESS,
  },
  xrechnung: { specificationId: 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0', businessProcess: PEPPOL_PROCESS },
  en16931: { specificationId: 'urn:cen.eu:en16931:2017' },
};

/** Identifiers that already name an EN 16931 based specification: kept as they are. */
const EN_SPECIFICATION = /^urn:(cen\.eu:en16931|fdc:peppol\.eu|factur-x\.eu|xoev-de|xeinkauf\.de)/i;

/**
 * BT-24 and BT-23 for the written document. An explicit `profile` wins. Otherwise the invoice's own
 * identifier is kept when it names an EN 16931 based specification (Peppol, XRechnung, NLCIUS, CIUS-RO,
 * Factur-X...), so a document written back in its own syntax stays what it was. Anything else (a national
 * format's synthesised identifier, an empty one) is replaced by `fallback`.
 */
export function resolveSpecification(
  invoice: { specificationId: string; businessProcess?: string },
  profile: WriterProfile | undefined,
  fallback: WriterProfile,
): { specificationId: string; businessProcess?: string } {
  if (profile !== undefined) {
    const preset = PROFILES[profile];
    if (!preset) throw new WriterError(`Unknown profile "${profile}" (known: ${Object.keys(PROFILES).join(', ')})`);
    return preset;
  }
  if (EN_SPECIFICATION.test(invoice.specificationId))
    return { specificationId: invoice.specificationId, businessProcess: invoice.businessProcess };
  return PROFILES[fallback];
}
