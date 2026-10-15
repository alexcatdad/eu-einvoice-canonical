/** Signature verification entry points and the summary used for ValidationSummary.signature. */
import type { CheckStatus, SignatureInfo, ValidationSummary } from '../canonical.js';
import type { TrustAnchor } from './trust.js';

export type { TrustAnchor } from './trust.js';

export interface VerifyOptions {
  /** DER bytes, base64 or PEM certificates the signer must chain to. Without them trust is reported as 'not-checked'. */
  trustAnchors?: TrustAnchor[];
  /** Set false to skip signature verification entirely (signatures are then only detected). Default true. */
  verifySignatures?: boolean;
}

/** Heavy code (pkijs verification, XML canonicalisation) is loaded only when a file actually carries a signature. */
export async function verifyCadesLazy(bytes: Uint8Array, opts: VerifyOptions): Promise<SignatureInfo[]> {
  const { verifyCades } = await import('./cades.js');
  return verifyCades(bytes, opts.trustAnchors);
}

export async function verifyXmlLazy(xml: string, opts: VerifyOptions & { resolve?: (uri: string) => Uint8Array | undefined; type?: SignatureInfo['type'] }): Promise<SignatureInfo[]> {
  const { verifyXmlSignatures } = await import('./xmldsig.js');
  return verifyXmlSignatures(xml, { trustAnchors: opts.trustAnchors, resolve: opts.resolve, type: opts.type });
}

/**
 * passed = every signature is cryptographically valid, failed = any is invalid, unavailable = none failed
 * but at least one could not be checked, not-run = no signatures. Trust is reported in the findings.
 */
export function signatureStatus(signatures: SignatureInfo[]): CheckStatus {
  if (signatures.length === 0) return 'not-run';
  if (signatures.some((s) => s.verified === false)) return 'failed';
  if (signatures.some((s) => s.verified === undefined)) return 'unavailable';
  return 'passed';
}

export function signatureFindings(signatures: SignatureInfo[]): ValidationSummary['findings'] {
  return signatures.map((s, i): ValidationSummary['findings'][number] => {
    const who = `${s.type} signature${signatures.length > 1 ? ` ${i + 1}` : ''}${s.signer ? ` by ${s.signer}` : ''}`;
    if (s.verified === false) return { layer: 'signature', severity: 'warning', message: `${who} is invalid: ${s.reason ?? 'verification failed'}` };
    if (s.verified === undefined) return { layer: 'signature', severity: 'info', message: `${who} could not be checked: ${s.reason ?? 'unsupported'}` };
    if (s.trust === 'trusted') return { layer: 'signature', severity: 'info', message: `${who} is valid and chains to a configured trust anchor` };
    if (s.trust === 'untrusted') return { layer: 'signature', severity: 'warning', message: `${who} is valid, but the signer does not chain to the configured trust anchors${s.trustReason ? ` (${s.trustReason})` : ''}` };
    return { layer: 'signature', severity: 'info', message: `${who} is valid; signer not checked against a trust list` };
  });
}
