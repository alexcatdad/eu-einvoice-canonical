/** CAdES / PKCS#7 (.p7m) verification: signature value against the signed content and the signer certificate (pkijs). */
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import type { SignatureInfo } from '../canonical.js';
import { certificateDetails, commonName, evaluateTrust, parseAnchors, type TrustAnchor } from './trust.js';

const OID_SIGNED_DATA = '1.2.840.113549.1.7.2';
const OID_SIGNING_TIME = '1.2.840.113549.1.9.5';

/** One SignatureInfo per SignerInfo. Never throws: a structure that cannot be read is a finding on one 'CAdES' entry. */
export async function verifyCades(bytes: Uint8Array, trustAnchors?: TrustAnchor[]): Promise<SignatureInfo[]> {
  let sd: pkijs.SignedData;
  let content: Uint8Array | undefined;
  try {
    const asn1 = asn1js.fromBER(bytes.slice().buffer);
    if (asn1.offset === -1) throw new Error('not valid BER');
    const ci = new pkijs.ContentInfo({ schema: asn1.result });
    if (ci.contentType !== OID_SIGNED_DATA) throw new Error('not SignedData');
    sd = new pkijs.SignedData({ schema: ci.content });
    const ec = sd.encapContentInfo.eContent;
    if (ec) {
      content = ec.idBlock.isConstructed
        ? concat((ec.valueBlock.value as asn1js.OctetString[]).map((p) => new Uint8Array(p.valueBlock.valueHexView)))
        : new Uint8Array(ec.valueBlock.valueHexView);
    }
  } catch (e) {
    return [{ type: 'CAdES', reason: `CMS structure unreadable: ${(e as Error).message}` }];
  }
  if (!content) return [{ type: 'CAdES', reason: 'Detached CMS signature: the signed content is not in the file' }];
  const count = sd.signerInfos.length;
  if (count === 0) return [{ type: 'CAdES', verified: false, reason: 'SignedData has no SignerInfo' }];

  const certs = (sd.certificates ?? []).filter((c): c is pkijs.Certificate => c instanceof pkijs.Certificate);
  const anchors = parseAnchors(trustAnchors);
  const out: SignatureInfo[] = [];
  for (let i = 0; i < count; i++) {
    const info: SignatureInfo = { type: 'CAdES' };
    out.push(info);
    try {
      const signedAt = signingTime(sd.signerInfos[i]);
      if (signedAt) info.signedAt = signedAt.toISOString();
      const r = await sd.verify({ signer: i, data: content.slice().buffer, checkChain: false, extendedMode: true });
      const cert = r.signerCertificate ?? undefined;
      if (cert) { info.signer = commonName(cert); info.certificate = certificateDetails(cert); }
      if (!cert) { info.reason = 'Signer certificate is not included in the file; the signature could not be checked'; continue; }
      info.verified = r.signatureVerified === true;
      if (!info.verified) info.reason = r.message || 'Signature value does not match the signed content';
      if (info.verified) {
        const t = await evaluateTrust(cert, certs, anchors, signedAt ?? new Date());
        info.trust = t.trust;
        if (t.reason) info.trustReason = t.reason;
      }
    } catch (e) {
      info.verified = false;
      info.reason = `Verification error: ${(e as Error).message}`;
    }
  }
  return out;
}

function signingTime(si: pkijs.SignerInfo): Date | undefined {
  const attr = si.signedAttrs?.attributes.find((a) => a.type === OID_SIGNING_TIME);
  const v = attr?.values[0] as { toDate?: () => Date } | undefined;
  try { return v?.toDate?.(); } catch { return undefined; }
}

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
