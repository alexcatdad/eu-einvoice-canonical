/**
 * Saudi ZATCA (FATOORA) invoices on top of the UBL parser. A ZATCA invoice is a UBL 2.1 Invoice with
 * ProfileID reporting:1.0, no CustomizationID, a transaction code in InvoiceTypeCode/@name, and three
 * control references (ICV counter, PIH previous hash, QR code) plus an XAdES signature in UBLExtensions.
 * `parseUbl` maps the invoice itself; this module adds the clearance data (`clearance[0]`, authority
 * 'SA:ZATCA') and `extensions.sa`.
 *
 * Mapping source: ZATCA E-Invoicing Detailed Technical Guidelines and XML Implementation Standard
 * (zatca.gov.sa). The invoice hash follows the signature's own transforms: remove ext:UBLExtensions,
 * cac:Signature and the AdditionalDocumentReference whose ID is QR, canonicalize (C14N 1.1, which for
 * these documents equals inclusive C14N 1.0: no xml:base or xml:id), SHA-256, base64. Checked against
 * the signed sample invoices of github.com/Saleh7/php-zatca-xml (MIT).
 */
import type { Element } from '@xmldom/xmldom';
import type { CanonicalInvoice, IsoDate, SaAddress, SaExtension, SaQr } from '../canonical.js';
import { base64, sha256 } from '../sha256.js';
import { canonicalize } from '../signature/c14n.js';
import { cmp, isDecimal, toDecimal } from '../values.js';
import { CREDIT_TYPE_CODES, type Ctx, parseXml } from './context.js';

const NS_EXT = 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2';
const NS_CAC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2';
const NS_CBC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
const NS_DS = 'http://www.w3.org/2000/09/xmldsig#';
const NS_XADES = 'http://uri.etsi.org/01903/v1.3.2#';

const CONTROL_REFS = new Set(['ICV', 'PIH', 'QR']);
/** Control references are not attachments; they live in `clearance` and `extensions.sa`. */
export const isZatcaControlRef = (c: Ctx, ref: Element) => CONTROL_REFS.has(c.text(ref, 'cbc:ID') ?? '');

// ---------------------------------------------------------------------------
// Invoice hash
// ---------------------------------------------------------------------------

const hasChildId = (e: Element, id: string) => {
  for (let n = e.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1 && (n as Element).namespaceURI === NS_CBC && (n as Element).localName === 'ID') return n.textContent === id;
  }
  return false;
};

const isExcludedFromHash = (e: Element) =>
  (e.namespaceURI === NS_EXT && e.localName === 'UBLExtensions') ||
  (e.namespaceURI === NS_CAC && e.localName === 'Signature') ||
  (e.namespaceURI === NS_CAC && e.localName === 'AdditionalDocumentReference' && hasChildId(e, 'QR'));

function strip(el: Element) {
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType !== 1) continue;
    if (isExcludedFromHash(n as Element)) el.removeChild(n);
    else strip(n as Element);
  }
}

/** Base64 SHA-256 of the canonicalised invoice as ZATCA's signature transforms define it. */
export function zatcaInvoiceHash(xml: string): string {
  const root = parseXml(xml);
  strip(root);
  const canonical = canonicalize(root.ownerDocument!, { exclusive: false, withComments: false });
  return base64(sha256(new TextEncoder().encode(canonical)));
}

// ---------------------------------------------------------------------------
// QR code (TLV)
// ---------------------------------------------------------------------------

/**
 * Decodes the ZATCA QR payload: base64 of tag-length-value records with one-byte tags and lengths.
 * Tags 1-5: seller name, VAT number, timestamp, total with VAT, VAT total. Tags 6-9 (phase 2): invoice
 * hash (base64 text), ECDSA signature, public key, and the authority's signature of the stamp (binary).
 * Undefined when the payload is not base64 or not TLV.
 */
export function decodeZatcaQr(payload: string): SaQr | undefined {
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(payload.replace(/\s+/g, '')), (ch) => ch.charCodeAt(0));
  } catch {
    return undefined;
  }
  const tags = new Map<number, Uint8Array>();
  for (let i = 0; i < bytes.length; ) {
    if (i + 2 > bytes.length) return undefined;
    const tag = bytes[i];
    const end = i + 2 + bytes[i + 1];
    if (end > bytes.length) return undefined;
    if (!tags.has(tag)) tags.set(tag, bytes.subarray(i + 2, end));
    i = end;
  }
  if (!tags.size) return undefined;
  const text = (t: number) => (tags.has(t) ? new TextDecoder().decode(tags.get(t)) : undefined);
  const b64 = (t: number) => (tags.has(t) ? base64(tags.get(t)!) : undefined);
  const amount = (t: number) => {
    const v = text(t)?.trim();
    return v && isDecimal(v) ? toDecimal(v) : undefined;
  };
  return {
    sellerName: text(1),
    vatNumber: text(2),
    timestamp: text(3),
    total: amount(4),
    vatTotal: amount(5),
    invoiceHash: text(6),
    signature: b64(7),
    publicKey: b64(8),
    certificateSignature: b64(9),
  };
}

// ---------------------------------------------------------------------------
// Hijri dates
// ---------------------------------------------------------------------------

const HIJRI_YEARS = [1300, 1600] as const;

/**
 * Tabular (civil) Islamic calendar to Gregorian. The official Umm al-Qura calendar is observation
 * based and can differ from this by a day or two, so callers must flag the result as approximate.
 */
export function hijriToGregorian(year: number, month: number, day: number): IsoDate | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 30) return undefined;
  const jd = Math.floor((11 * year + 3) / 30) + 354 * year + 30 * month - Math.floor((month - 1) / 2) + day + 1948440 - 385;
  let l = jd + 68569;
  const n = Math.floor((4 * l) / 146097);
  l -= Math.floor((146097 * n + 3) / 4);
  const i = Math.floor((4000 * (l + 1)) / 1461001);
  l = l - Math.floor((1461 * i) / 4) + 31;
  const j = Math.floor((80 * l) / 2447);
  const d = l - Math.floor((2447 * j) / 80);
  l = Math.floor(j / 11);
  const m = j + 2 - 12 * l;
  const y = 100 * (n - 49) + i + l;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` as IsoDate;
}

const hijriParts = (date: string | undefined) => {
  const m = date && /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return undefined;
  const year = Number(m[1]);
  return year >= HIJRI_YEARS[0] && year <= HIJRI_YEARS[1] ? { year, month: Number(m[2]), day: Number(m[3]) } : undefined;
};

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function descendants(el: Element | undefined, ns: string, local: string, out: Element[] = []): Element[] {
  for (let n = el?.firstChild; n; n = n.nextSibling) {
    if (n.nodeType !== 1) continue;
    const e = n as Element;
    if (e.namespaceURI === ns && e.localName === local) out.push(e);
    descendants(e, ns, local, out);
  }
  return out;
}

const compact = (s: string | undefined) => s?.replace(/\s+/g, '') || undefined;

function address(c: Ctx, party: Element | undefined): SaAddress | undefined {
  const a = c.el(party, 'cac:PostalAddress');
  const out: SaAddress = {
    buildingNumber: c.text(a, 'cbc:BuildingNumber'),
    plotIdentification: c.text(a, 'cbc:PlotIdentification'),
    district: c.text(a, 'cbc:CitySubdivisionName'),
  };
  return out.buildingNumber || out.plotIdentification || out.district ? out : undefined;
}

export function applyZatca(c: Ctx, root: Element, xml: string, inv: CanonicalInvoice): void {
  const sa: SaExtension = { hijriDates: [] };

  // Transaction code NNPNESB: 01 standard / 02 simplified, then third-party, nominal, exports, summary, self-billed.
  const name = c.attr(c.el(root, 'cbc:InvoiceTypeCode'), undefined, 'name');
  if (name) {
    sa.transactionCode = name;
    const m = /^0([12])([01])([01])([01])([01])([01])$/.exec(name);
    if (m) {
      sa.invoiceSubtype = m[1] === '1' ? 'standard' : 'simplified';
      sa.thirdParty = m[2] === '1';
      sa.nominal = m[3] === '1';
      sa.exports = m[4] === '1';
      sa.summary = m[5] === '1';
      sa.selfBilled = m[6] === '1';
      inv.nationalType = {
        scheme: 'SA:InvoiceTypeCode',
        code: name,
        label: sa.invoiceSubtype === 'standard' ? 'Standard tax invoice' : 'Simplified tax invoice',
      };
      if (sa.selfBilled) inv.selfBilled = true;
    } else {
      c.warn('ZATCA_TRANSACTION_CODE', `InvoiceTypeCode/@name "${name}" is not a ZATCA transaction code (NNPNESB)`);
    }
  }

  // Credit notes are Invoice documents with type code 381: the direction is the document's, not the root's.
  if (inv.kind === 'invoice' && CREDIT_TYPE_CODES.has(inv.typeCode)) {
    (inv as { kind: string }).kind = 'creditNote';
    c.derive('/kind', `ZATCA sends credit notes as UBL Invoice with type code ${inv.typeCode}; kind set to creditNote`);
  }
  if (!inv.specificationId) {
    inv.specificationId = c.text(root, 'cbc:ProfileID') ?? '';
    if (inv.specificationId) c.derive('/specificationId', 'ZATCA invoices carry no CustomizationID; set to the ProfileID');
  }

  // Control references.
  const refs = c.all(root, 'cac:AdditionalDocumentReference');
  const ref = (id: string) => refs.find((r) => c.text(r, 'cbc:ID') === id);
  const embedded = (r: Element | undefined) => compact(c.text(r, 'cac:Attachment/cbc:EmbeddedDocumentBinaryObject'));
  sa.uuid = c.text(root, 'cbc:UUID');
  sa.counter = c.text(ref('ICV'), 'cbc:UUID');
  sa.previousInvoiceHash = embedded(ref('PIH'));
  const qrPayload = embedded(ref('QR'));

  // The signature (cryptographic stamp) and the digest it carries for the invoice.
  const signature = descendants(c.el(root, '*:UBLExtensions'), NS_DS, 'Signature')[0];
  if (signature) {
    const reference = descendants(signature, NS_DS, 'Reference').find(
      (r) => r.getAttribute('Id') === 'invoiceSignedData' || r.getAttribute('URI') === '',
    );
    sa.invoiceHash = compact(c.text(descendants(reference, NS_DS, 'DigestValue')[0]));
    sa.stamp = {
      signatureValue: compact(c.text(descendants(signature, NS_DS, 'SignatureValue')[0])),
      certificate: compact(c.text(descendants(signature, NS_DS, 'X509Certificate')[0])),
      signedAt: c.text(descendants(signature, NS_XADES, 'SigningTime')[0]),
    };
  }

  // QR code: decode and compare with the invoice.
  if (qrPayload) {
    sa.qr = decodeZatcaQr(qrPayload);
    if (!sa.qr) c.warn('ZATCA_QR_UNREADABLE', 'The QR reference is not a base64 TLV payload');
    else qrAgainstInvoice(c, sa.qr, inv);
  }

  // Invoice hash: recompute and compare with what the document carries. Reported, never an error.
  const computed = zatcaInvoiceHash(xml);
  const carried = sa.invoiceHash;
  const qrHash = sa.qr?.invoiceHash;
  const mismatched = [
    carried !== undefined && carried !== computed && 'signature digest',
    qrHash !== undefined && qrHash !== computed && 'QR tag 6',
  ].filter(Boolean);
  if (carried === undefined && qrHash === undefined) {
    sa.hashCheck = { status: 'not-checked', computed, reason: 'The document carries neither a signature digest nor a QR invoice hash' };
  } else if (mismatched.length) {
    sa.hashCheck = {
      status: 'mismatch',
      computed,
      carried,
      qr: qrHash,
      reason: `Recomputed hash differs from the ${mismatched.join(' and ')}`,
    };
    c.warn('ZATCA_HASH_MISMATCH', `Invoice hash ${computed} recomputed from the document differs from the ${mismatched.join(' and ')}`);
  } else {
    sa.hashCheck = { status: 'match', computed, carried, qr: qrHash };
  }

  sa.sellerAddress = address(c, c.el(root, 'cac:AccountingSupplierParty/cac:Party'));
  sa.buyerAddress = address(c, c.el(root, 'cac:AccountingCustomerParty/cac:Party'));
  convertHijri(c, inv, sa);

  inv.extensions.sa = sa;
  inv.clearance.push({
    authority: 'SA:ZATCA',
    documentId: sa.uuid,
    qrPayload,
    counter: sa.counter,
    previousHash: sa.previousInvoiceHash,
    hash: sa.invoiceHash,
    stamp: sa.stamp?.signatureValue,
  });
}

function qrAgainstInvoice(c: Ctx, qr: SaQr, inv: CanonicalInvoice) {
  const differs = (field: string, qrValue: string | undefined, docValue: string | undefined, same: (a: string, b: string) => boolean) => {
    if (qrValue !== undefined && docValue !== undefined && !same(qrValue, docValue))
      c.warn('ZATCA_QR_MISMATCH', `QR ${field} "${qrValue}" differs from the invoice value "${docValue}"`);
  };
  const text = (a: string, b: string) => a === b;
  const amount = (a: string, b: string) => isDecimal(a) && isDecimal(b) && cmp(a, b) === 0;
  differs('seller name', qr.sellerName, inv.seller.name, text);
  differs('VAT number', qr.vatNumber, inv.seller.vatId, text);
  differs('total with VAT', qr.total, inv.totals.taxInclusive, amount);
  differs('VAT total', qr.vatTotal, inv.totals.vatTotal, amount);
}

/** ZATCA dates are Gregorian; some senders put Hijri dates in them. Converted approximately, and flagged. */
function convertHijri(c: Ctx, inv: CanonicalInvoice, sa: SaExtension) {
  const fix = (field: string, path: string, value: IsoDate | undefined, set: (d: IsoDate) => void) => {
    const parts = hijriParts(value);
    if (!parts || !value) return;
    const gregorian = hijriToGregorian(parts.year, parts.month, parts.day);
    if (!gregorian) return;
    set(gregorian);
    sa.hijriDates.push({ field, hijri: value, gregorian });
    c.derive(
      path,
      `${field} ${value} is a Hijri date; converted to ${gregorian} with the tabular Islamic calendar (Umm al-Qura may differ by a day or two)`,
    );
    c.warn('ZATCA_HIJRI_DATE', `${field} ${value} is in the Hijri calendar; converted to ${gregorian} (approximate)`, path);
  };
  fix('issueDate', '/issueDate', inv.issueDate, (d) => {
    inv.issueDate = d;
  });
  fix('dueDate', '/dueDate', inv.dueDate, (d) => {
    inv.dueDate = d;
  });
  fix('taxPointDate', '/taxPointDate', inv.taxPointDate, (d) => {
    inv.taxPointDate = d;
  });
  const delivery = inv.delivery;
  if (delivery)
    fix('delivery.actualDate', '/delivery/actualDate', delivery.actualDate, (d) => {
      delivery.actualDate = d;
    });
  const period = inv.invoicePeriod;
  if (period) {
    fix('invoicePeriod.start', '/invoicePeriod/start', period.start, (d) => {
      period.start = d;
    });
    fix('invoicePeriod.end', '/invoicePeriod/end', period.end, (d) => {
      period.end = d;
    });
  }
}
