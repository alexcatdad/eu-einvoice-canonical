/**
 * Turns a received file into the XML documents inside it.
 *
 * Handles the wrappers EU senders and authorities actually use:
 * - PDF/A-3 with an embedded XML (Factur-X, ZUGFeRD 1/2, XRechnung-in-PDF)
 * - CMS / PKCS#7 signed data (.p7m, Italian CAdES), DER or base64
 * - ZIP (ANAF RO e-Factura download, ISDOCX, SdI and KSeF batch exports)
 * - Peppol SBDH (StandardBusinessDocument) around the UBL payload
 * - SOAP envelope in front of a Finvoice message
 * - XML in any encoding declared in the prolog (UTF-8/16, ISO-8859-x, windows-125x)
 *
 * Inbound files are treated as hostile: XML with a DOCTYPE is rejected (no entity
 * expansion, no external DTDs), and file size, archive size, entry count, nesting
 * depth and payload count are capped (see `UnwrapLimits`). Every decompression is
 * bounded before or while it runs, never only after.
 *
 * Runs unchanged in Node 20+, Bun and browsers (WebCrypto, TextDecoder, atob).
 */
import { DOMParser, type Element as XElement, XMLSerializer, type Node as XNode } from '@xmldom/xmldom';
import { unzipSync } from 'fflate';
import type { EnvelopeStep, SignatureInfo } from './canonical.js';
import { NS } from './formats.js';
import { sha256Hex } from './hash.js';
import { probeXml } from './probe.js';
import { type VerifyOptions, verifyCadesLazy, verifyXmlLazy } from './signature/index.js';

export interface XmlPayload {
  xml: string;
  encoding: string;
  envelope: EnvelopeStep[];
  /** Name of the innermost file (zip entry, PDF attachment, or the received file). */
  filename?: string;
  signatures: SignatureInfo[];
  fromPdf: boolean;
  /** SHA-256 (hex) of the XML payload, UTF-8 encoded. */
  sha256: string;
  /** Size of the XML payload in bytes, UTF-8 encoded. */
  byteLength: number;
  /** Names of the other files in the ZIP this payload came from (ISDOCX attachments); only set for ZIP members. */
  siblingEntries?: string[];
}

export interface Skipped {
  name?: string;
  reason: string;
}

export interface UnwrapResult {
  /** SHA-256 (hex) of the file as received. */
  fileSha256: string;
  payloads: XmlPayload[];
  /** Files that held no invoice (detached signatures, plain PDFs, rejected input...). Detached signatures are also recorded on sibling payloads. */
  skipped: Skipped[];
}

export interface UnwrapLimits {
  /** Largest received file accepted. */
  maxFileBytes: number;
  /** Largest single ZIP entry or PDF attachment, uncompressed. */
  maxEntryBytes: number;
  /** Total uncompressed bytes across all nested archives and attachments. */
  maxUnpackedBytes: number;
  /** ZIP entries processed per file. */
  maxEntries: number;
  /** XML documents returned per file. */
  maxPayloads: number;
  /** Nested envelopes (zip in p7m in base64...). */
  maxDepth: number;
  /** Element nesting inside one XML document. Real invoices stay below 30; deeper documents cost time and stack. */
  maxXmlDepth: number;
}

/** Signature verification settings (trust anchors, opt-out). */
export type UnwrapOptions = VerifyOptions;

export const DEFAULT_LIMITS: UnwrapLimits = {
  maxFileBytes: 50 * 1024 * 1024,
  maxEntryBytes: 50 * 1024 * 1024,
  maxUnpackedBytes: 200 * 1024 * 1024,
  maxEntries: 1000,
  maxPayloads: 500,
  maxDepth: 6,
  maxXmlDepth: 256,
};

interface Ctx {
  out: UnwrapResult;
  limits: UnwrapLimits;
  verify: VerifyOptions;
  unpacked: number;
  entries: number;
}

/** Attachment names used by Factur-X, ZUGFeRD 2.0, XRechnung-in-PDF and ZUGFeRD 1.0 (compared case-insensitively). */
const PDF_XML_NAMES = ['factur-x.xml', 'zugferd-invoice.xml', 'xrechnung.xml'];

export async function unwrap(
  bytes: Uint8Array,
  filename?: string,
  limits: Partial<UnwrapLimits> = {},
  options: UnwrapOptions = {},
): Promise<UnwrapResult> {
  const ctx: Ctx = {
    out: { fileSha256: await sha256Hex(bytes), payloads: [], skipped: [] },
    limits: { ...DEFAULT_LIMITS, ...limits },
    verify: options,
    unpacked: 0,
    entries: 0,
  };
  if (bytes.length > ctx.limits.maxFileBytes) {
    ctx.out.skipped.push({ name: filename, reason: `File larger than ${ctx.limits.maxFileBytes} bytes` });
    return ctx.out;
  }
  await walk(bytes, filename, [], [], false, 0, ctx);
  return ctx.out;
}

async function walk(
  bytes: Uint8Array,
  name: string | undefined,
  path: EnvelopeStep[],
  signatures: SignatureInfo[],
  fromPdf: boolean,
  depth: number,
  ctx: Ctx,
): Promise<void> {
  const { out, limits } = ctx;
  if (depth > limits.maxDepth) {
    out.skipped.push({ name, reason: 'Too many nested envelopes' });
    return;
  }
  if (out.payloads.length >= limits.maxPayloads) {
    out.skipped.push({ name, reason: `More than ${limits.maxPayloads} XML documents in one file` });
    return;
  }

  // PDF
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) {
    const { pdfAttachments } = await import('./envelope-pdf.js');
    const files = await pdfAttachments(bytes, name, ctx).catch((e) => {
      out.skipped.push({ name, reason: `PDF unreadable: ${e.message}` });
      return [];
    });
    if (files.length === 0) out.skipped.push({ name, reason: 'PDF without a usable embedded XML (not a hybrid e-invoice)' });
    // Known e-invoice attachment names first; other XML attachments are tried too.
    files.sort((a, b) => rank(a.name) - rank(b.name));
    for (const f of files)
      await walk(f.data, f.name, [...path, { kind: 'pdf-attachment', name: f.name }], signatures, true, depth + 1, ctx);
    return;
  }

  // ZIP
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    let entries: Record<string, Uint8Array>;
    const refused: Skipped[] = [];
    try {
      // The filter sees each entry's declared sizes before anything is inflated. fflate never writes
      // more than the declared size, so a lying header truncates the output; the ratio check also
      // refuses entries whose compressed data is larger than deflate could ever produce for the declared
      // size, so such entries are not inflated at all (they would cost CPU for nothing).
      entries = unzipSync(bytes, {
        filter: (f) => {
          let reason: string | undefined;
          if (++ctx.entries > limits.maxEntries) reason = 'ZIP entry over the size or count limit (entry count)';
          else if (f.originalSize > limits.maxEntryBytes || ctx.unpacked + f.originalSize > limits.maxUnpackedBytes)
            reason = 'ZIP entry over the size or count limit (size)';
          else if (f.size > f.originalSize * 1.01 + 1024) reason = 'ZIP entry header understates its size';
          if (reason) {
            refused.push({ name: f.name, reason });
            return false;
          }
          ctx.unpacked += f.originalSize;
          return true;
        },
      });
    } catch (e) {
      out.skipped.push({ name, reason: `ZIP unreadable: ${(e as Error).message}` });
      return;
    }
    out.skipped.push(...refused);
    const before = out.payloads.length;
    const sigFiles: [string, Uint8Array][] = [];
    for (const [entry, data] of Object.entries(entries)) {
      if (entry.endsWith('/') || data.length === 0) continue;
      if (isDetachedSignature(data)) {
        sigFiles.push([entry, data]);
        out.skipped.push({ name: entry, reason: 'Detached XML signature' });
        continue;
      }
      await walk(data, entry, [...path, { kind: 'zip', name: entry }], signatures, fromPdf, depth + 1, ctx);
    }
    // Each detached signature is checked against the archive entry its Reference names; the result is recorded on every invoice in the archive.
    const siblings = out.payloads.slice(before);
    for (const [entry, data] of sigFiles) {
      const sigs =
        ctx.verify.verifySignatures === false
          ? [{ type: 'detached' as const }]
          : await verifyXmlLazy(decodeXml(data).text, {
              ...ctx.verify,
              type: 'detached',
              resolve: (uri) => findEntry(entries, uri, entry),
            });
      for (const sig of sigs) for (const p of siblings) p.signatures.push({ ...sig });
    }
    for (const p of siblings) {
      const own = p.envelope.find((s) => s.kind === 'zip' && s.name !== undefined && s.name in entries && !s.name.endsWith('/'))?.name;
      const others = Object.keys(entries).filter(
        (n) =>
          !n.endsWith('/') &&
          entries[n].length > 0 &&
          n !== own &&
          !siblings.some((q) => q.filename === n) &&
          !sigFiles.some(([s]) => s === n),
      );
      if (others.length) p.siblingEntries = others;
    }
    return;
  }

  // CMS / PKCS#7 signed data (.p7m)
  if (bytes[0] === 0x30) {
    const { extractCms } = await import('./envelope-cms.js');
    const cms = extractCms(bytes);
    if (cms) {
      const cades =
        ctx.verify.verifySignatures === false ? [{ type: 'CAdES' as const, signer: cms.signer }] : await verifyCadesLazy(bytes, ctx.verify);
      await walk(cms.content, stripP7m(name), [...path, { kind: 'cms-p7m', name }], [...signatures, ...cades], fromPdf, depth + 1, ctx);
      return;
    }
  }

  // Base64 text (base64 .p7m, base64 XML, PEM)
  const b64 = asBase64(bytes);
  if (b64) {
    await walk(b64, name, [...path, { kind: 'base64', name }], signatures, fromPdf, depth + 1, ctx);
    return;
  }

  // XML
  const { text, encoding } = decodeXml(bytes);
  await walkXml(text, encoding, name, path, signatures, fromPdf, depth, ctx);
}

/** Second stage for decoded XML text: strips SBDH / SOAP wrappers without re-encoding, then records the payload. */
async function walkXml(
  text: string,
  encoding: string,
  name: string | undefined,
  path: EnvelopeStep[],
  signatures: SignatureInfo[],
  fromPdf: boolean,
  depth: number,
  ctx: Ctx,
): Promise<void> {
  const { out, limits } = ctx;
  if (depth > limits.maxDepth) {
    out.skipped.push({ name, reason: 'Too many nested envelopes' });
    return;
  }
  if (out.payloads.length >= limits.maxPayloads) {
    out.skipped.push({ name, reason: `More than ${limits.maxPayloads} XML documents in one file` });
    return;
  }
  if (!withinXmlDepth(text, limits.maxXmlDepth)) {
    out.skipped.push({ name, reason: `XML nested deeper than ${limits.maxXmlDepth} elements` });
    return;
  }
  const probe = probeXml(text);
  if (!probe) {
    out.skipped.push({ name, reason: 'Not XML, PDF, ZIP or CMS' });
    return;
  }
  if (probe.hasDoctype) {
    out.skipped.push({ name, reason: 'DOCTYPE not allowed in inbound XML (entity expansion / external DTD risk)' });
    return;
  }

  // Peppol SBDH: the payload is the element after StandardBusinessDocumentHeader.
  if (probe.rootNs === NS.sbdh && probe.rootName === 'StandardBusinessDocument') {
    const inner = firstPayloadElement(text, (el) => !(el.namespaceURI === NS.sbdh && el.localName === 'StandardBusinessDocumentHeader'));
    if (!inner) {
      out.skipped.push({ name, reason: 'SBDH without payload' });
      return;
    }
    await walkXml(inner, encoding, name, [...path, { kind: 'sbdh' }], signatures, fromPdf, depth + 1, ctx);
    return;
  }

  // SOAP: Finvoice puts the message after the envelope; others put it in the Body.
  if ((probe.rootNs === NS.soap11 || probe.rootNs === NS.soap12) && probe.rootName === 'Envelope') {
    const after = text.replace(/^[\s\S]*?<\/(?:[\w.-]+:)?Envelope\s*>/, '').trim();
    const inner = after.startsWith('<') ? after : firstPayloadElement(text, () => true, 'Body');
    if (!inner) {
      out.skipped.push({ name, reason: 'SOAP envelope without payload' });
      return;
    }
    await walkXml(inner, encoding, name, [...path, { kind: 'soap' }], signatures, fromPdf, depth + 1, ctx);
    return;
  }

  if (probe.rootNs === NS.xmldsig) {
    out.skipped.push({ name, reason: 'Detached XML signature' });
    return;
  }

  const sigs = [...signatures];
  if (text.includes(NS.xmldsig) && /<(?:[\w.-]+:)?Signature[\s>]/.test(text)) {
    if (ctx.verify.verifySignatures === false) sigs.push({ type: text.includes('uri.etsi.org/01903') ? 'XAdES' : 'XMLDSig' });
    else sigs.push(...(await verifyXmlLazy(text, ctx.verify)));
  }
  const utf8 = new TextEncoder().encode(text);
  out.payloads.push({
    xml: text,
    encoding,
    envelope: [...path, { kind: 'xml', name }],
    filename: name,
    signatures: sigs,
    fromPdf,
    sha256: await sha256Hex(utf8),
    byteLength: utf8.length,
  });
}

/**
 * Linear scan that counts element nesting without building anything. Comments, CDATA and processing instructions are
 * skipped and attribute values are quote-aware, so every real start tag is counted; a malformed tail just ends the scan.
 */
export function withinXmlDepth(text: string, max: number): boolean {
  let depth = 0;
  let i = text.indexOf('<');
  while (i !== -1) {
    let next: number;
    if (text.startsWith('<!--', i)) next = text.indexOf('-->', i + 4);
    else if (text.startsWith('<![CDATA[', i)) next = text.indexOf(']]>', i + 9);
    else if (text.startsWith('<?', i)) next = text.indexOf('?>', i + 2);
    else if (text.startsWith('<!', i)) next = text.indexOf('>', i + 2);
    else if (text.startsWith('</', i)) {
      depth--;
      next = text.indexOf('>', i + 2);
    } else {
      let j = i + 1;
      let quote = '';
      for (; j < text.length; j++) {
        const c = text[j];
        if (quote) {
          if (c === quote) quote = '';
        } else if (c === '"' || c === "'") quote = c;
        else if (c === '>') break;
      }
      if (j >= text.length) return true;
      if (text[j - 1] !== '/' && ++depth > max) return false;
      next = j;
    }
    if (next === -1) return true;
    i = text.indexOf('<', next + 1);
  }
  return true;
}

// ---------------------------------------------------------------------------
// XML decoding
// ---------------------------------------------------------------------------

export function decodeXml(bytes: Uint8Array): { text: string; encoding: string } {
  if (startsWith(bytes, [0xef, 0xbb, 0xbf])) return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8' };
  if (startsWith(bytes, [0xff, 0xfe]) || startsWith(bytes, [0x3c, 0x00]))
    return { text: strip(new TextDecoder('utf-16le').decode(bytes)), encoding: 'utf-16le' };
  if (startsWith(bytes, [0xfe, 0xff]) || startsWith(bytes, [0x00, 0x3c]))
    return { text: strip(new TextDecoder('utf-16be').decode(bytes)), encoding: 'utf-16be' };
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 200));
  const declared = /^\s*<\?xml[^>]*encoding\s*=\s*["']([\w.:-]+)["']/i.exec(head)?.[1]?.toLowerCase() ?? 'utf-8';
  try {
    return { text: new TextDecoder(declared, { fatal: declared === 'utf-8' }).decode(bytes), encoding: declared };
  } catch {
    // Declared UTF-8 but not valid UTF-8 (or an unknown label): legacy senders often mean windows-1252 / ISO-8859-x.
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: `windows-1252 (declared ${declared})` };
  }
}

const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

// ---------------------------------------------------------------------------
// PDF and CMS are handled in envelope-pdf.ts and envelope-cms.ts, which are imported
// dynamically so the browser bundle only fetches pdf-lib / pkijs when a file needs them.
// ---------------------------------------------------------------------------

function rank(n: string) {
  const i = PDF_XML_NAMES.findIndex((k) => k.toLowerCase() === n.toLowerCase());
  return i === -1 ? 99 : i;
}

const stripP7m = (n?: string) => n?.replace(/\.p7m$/i, '');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Base64 text to bytes, or null when it is not valid base64. Uses the built-in decoder where there is one (several times faster on big attachments). */
function decodeBase64(text: string): Uint8Array | null {
  // Same acceptance as atob on every runtime: only the base64 alphabet, padding only as the last one or two characters of a full quantum, no lone trailing character.
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 === 1 || (text.includes('=') && text.length % 4 !== 0)) return null;
  try {
    const native = (Uint8Array as unknown as { fromBase64?: (s: string) => Uint8Array }).fromBase64;
    if (native) return native(text);
    const bin = atob(text);
    const b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return b;
  } catch {
    return null;
  }
}

function asBase64(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 64) return null;
  let text = new TextDecoder('latin1').decode(bytes).trim();
  text = text.replace(/-----(BEGIN|END) [A-Z0-9 ]+-----/g, '');
  if (!/^[A-Za-z0-9+/=\s]+$/.test(text)) return null;
  const b = decodeBase64(text.replace(/\s+/g, ''));
  if (!b || b.length < 16) return null;
  // Only accept if it decodes to something we can handle.
  const looksUseful =
    b[0] === 0x30 ||
    b[0] === 0x3c ||
    startsWith(b, [0xef, 0xbb, 0xbf]) ||
    startsWith(b, [0x25, 0x50, 0x44, 0x46]) ||
    startsWith(b, [0x50, 0x4b, 0x03, 0x04]);
  return looksUseful ? b : null;
}

/** Finds the ZIP entry a detached signature's Reference URI names (exact path, then file name). */
function findEntry(entries: Record<string, Uint8Array>, uri: string, signatureEntry: string): Uint8Array | undefined {
  let name = uri;
  try {
    name = decodeURIComponent(uri);
  } catch {
    /* keep as written */
  }
  if (name in entries && name !== signatureEntry) return entries[name];
  const base = (n: string) => n.split('/').pop();
  const hit = Object.keys(entries).find((k) => k !== signatureEntry && base(k) === base(name));
  return hit ? entries[hit] : undefined;
}

function isDetachedSignature(bytes: Uint8Array): boolean {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 400));
  return /^\s*(<\?xml[^>]*\?>\s*)?<(?:[\w.-]+:)?Signature[\s>]/.test(head) && head.includes('xmldsig#');
}

/** Serialises the first element child (optionally of a named descendant) that passes the filter, keeping in-scope namespaces. */
function firstPayloadElement(xml: string, accept: (el: XElement) => boolean, container?: string): string | null {
  let doc: ReturnType<DOMParser['parseFromString']>;
  try {
    doc = new DOMParser({ onError: () => {} }).parseFromString(xml, 'text/xml');
  } catch {
    return null; // xmldom throws on fatal errors such as mismatched tags
  }
  let parent: XElement | null = doc.documentElement;
  if (container && parent) parent = parent.getElementsByTagNameNS('*', container).item(0);
  if (!parent) return null;
  for (let n: XNode | null = parent.firstChild; n; n = n.nextSibling) {
    if (n.nodeType !== 1) continue;
    const el = n as XElement;
    if (!accept(el)) continue;
    // Copy namespace declarations from ancestors so the payload stands alone.
    for (let a: XNode | null = el.parentNode; a && a.nodeType === 1; a = a.parentNode) {
      const attrs = (a as XElement).attributes;
      for (let i = 0; i < attrs.length; i++) {
        const at = attrs.item(i)!;
        if ((at.name === 'xmlns' || at.name.startsWith('xmlns:')) && !el.hasAttribute(at.name)) el.setAttribute(at.name, at.value);
      }
    }
    return new XMLSerializer().serializeToString(el);
  }
  return null;
}

function startsWith(b: Uint8Array, sig: number[]) {
  return sig.every((v, i) => b[i] === v);
}
