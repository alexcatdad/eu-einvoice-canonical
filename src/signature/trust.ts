/** Certificate details and optional trust-list evaluation, shared by CAdES and XAdES/XMLDSig. */
import * as pkijs from 'pkijs';
import type { SignatureInfo } from '../canonical.js';

export type TrustAnchor = Uint8Array | string;

const OIDS: Record<string, string> = {
  '2.5.4.3': 'CN',
  '2.5.4.10': 'O',
  '2.5.4.6': 'C',
  '2.5.4.5': 'serialNumber',
  '2.5.4.4': 'SN',
  '2.5.4.42': 'GN',
};

const rdn = (name: pkijs.RelativeDistinguishedNames, type: string) => {
  const v = name.typesAndValues.find((t) => t.type === type)?.value.valueBlock.value;
  return typeof v === 'string' ? v : undefined;
};

export function dn(name: pkijs.RelativeDistinguishedNames): string {
  return name.typesAndValues.map((t) => `${OIDS[t.type] ?? t.type}=${t.value.valueBlock.value}`).join(', ');
}

/** Common name of the subject, falling back to the O attribute then the full DN. */
export function commonName(cert: pkijs.Certificate): string {
  return rdn(cert.subject, '2.5.4.3') ?? rdn(cert.subject, '2.5.4.10') ?? dn(cert.subject);
}

export function certificateDetails(cert: pkijs.Certificate): NonNullable<SignatureInfo['certificate']> {
  return {
    subject: dn(cert.subject),
    issuer: dn(cert.issuer),
    serial: Array.from(new Uint8Array(cert.serialNumber.valueBlock.valueHexView), (b) => b.toString(16).padStart(2, '0')).join(''),
    notBefore: cert.notBefore.value.toISOString(),
    notAfter: cert.notAfter.value.toISOString(),
  };
}

export function parseCertificate(der: Uint8Array): pkijs.Certificate | null {
  try {
    return pkijs.Certificate.fromBER(der.slice().buffer);
  } catch {
    return null;
  }
}

/** The certificate blocks of a PEM text (linear scan), or the whole text when it has none. */
function pemBlocks(text: string): string[] {
  const begin = '-----BEGIN CERTIFICATE-----';
  const end = '-----END CERTIFICATE-----';
  const out: string[] = [];
  for (let from = text.indexOf(begin); from !== -1; ) {
    const to = text.indexOf(end, from + begin.length);
    if (to === -1) break;
    out.push(text.slice(from, to + end.length));
    from = text.indexOf(begin, to + end.length);
  }
  return out.length ? out : [text];
}

/** Accepts DER bytes, a base64 string or PEM text (several certificates allowed in PEM). */
export function parseAnchors(anchors: TrustAnchor[] | undefined): pkijs.Certificate[] {
  const out: pkijs.Certificate[] = [];
  for (const a of anchors ?? []) {
    if (typeof a !== 'string') {
      const c = parseCertificate(a);
      if (c) out.push(c);
      continue;
    }
    const blocks = pemBlocks(a);
    for (const b of blocks) {
      try {
        const bin = atob(b.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, ''));
        const c = parseCertificate(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
        if (c) out.push(c);
      } catch {
        /* not base64: ignored */
      }
    }
  }
  return out;
}

export interface TrustResult {
  trust: 'not-checked' | 'trusted' | 'untrusted';
  reason?: string;
}

/** Without configured anchors nothing is claimed about the signer: 'not-checked'. */
export async function evaluateTrust(
  signer: pkijs.Certificate,
  others: pkijs.Certificate[],
  anchors: pkijs.Certificate[],
  at: Date,
): Promise<TrustResult> {
  if (anchors.length === 0) return { trust: 'not-checked' };
  try {
    const engine = new pkijs.CertificateChainValidationEngine({
      certs: [...others.filter((c) => !sameCert(c, signer)), signer],
      trustedCerts: anchors,
      checkDate: at,
    });
    const r = await engine.verify({ passedWhenNotRevValues: true });
    return r.result ? { trust: 'trusted' } : { trust: 'untrusted', reason: r.resultMessage };
  } catch (e) {
    return { trust: 'untrusted', reason: (e as Error).message };
  }
}

function sameCert(a: pkijs.Certificate, b: pkijs.Certificate) {
  const x = new Uint8Array(a.toSchema().toBER());
  const y = new Uint8Array(b.toSchema().toBER());
  return x.length === y.length && x.every((v, i) => v === y[i]);
}
