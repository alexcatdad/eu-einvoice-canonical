/** CMS / PKCS#7 (.p7m) content extraction. Loaded on demand by envelope.ts so pkijs and asn1js stay out of the initial bundle. */
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { concat } from './bytes.js';

const OID_SIGNED_DATA = '1.2.840.113549.1.7.2';

export function extractCms(bytes: Uint8Array): { content: Uint8Array; signer?: string } | null {
  try {
    const asn1 = asn1js.fromBER(bytes.slice().buffer);
    if (asn1.offset === -1) return null;
    const ci = new pkijs.ContentInfo({ schema: asn1.result });
    if (ci.contentType !== OID_SIGNED_DATA) return null;
    const sd = new pkijs.SignedData({ schema: ci.content });
    const ec = sd.encapContentInfo.eContent;
    if (!ec) return null; // detached signature: content is elsewhere
    const content = ec.idBlock.isConstructed
      ? concat((ec.valueBlock.value as asn1js.OctetString[]).map((p) => new Uint8Array(p.valueBlock.valueHexView)))
      : new Uint8Array(ec.valueBlock.valueHexView);
    const cert = sd.certificates?.find((c): c is pkijs.Certificate => c instanceof pkijs.Certificate);
    const cn = cert?.subject.typesAndValues.find((t) => t.type === '2.5.4.3')?.value.valueBlock.value;
    return { content, signer: typeof cn === 'string' ? cn : undefined };
  } catch {
    return null;
  }
}
