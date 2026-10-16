/**
 * XMLDSig / XAdES verification on WebCrypto (no signature library): RSA PKCS#1 v1.5 and ECDSA,
 * SHA-1/256/384/512, inclusive and exclusive C14N, enveloped-signature transform, same-document
 * and external (detached) references.
 *
 * Checks, in order: every Reference digest, the SignatureValue over the canonical SignedInfo with
 * the key of the certificate in KeyInfo, that the signed references cover the whole document
 * (otherwise a signature over an unrelated fragment would pass), and for XAdES the signing
 * certificate digest in the signed properties. Trust is separate (see trust.ts).
 */
import { DOMParser, type Document as XDocument, type Element as XElement, type Node as XNode } from '@xmldom/xmldom';
import type * as pkijs from 'pkijs';
import type { SignatureInfo } from '../canonical.js';
import { type C14nOptions, canonicalize } from './c14n.js';
import { assessTrust } from './eu-trust.js';
import { certificateDetails, commonName, parseAnchors, parseCertificate, type TrustAnchor } from './trust.js';
import type { TrustSnapshot } from './tsl.js';

const DSIG = 'http://www.w3.org/2000/09/xmldsig#';
const EXC = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const XADES_URI = 'http://uri.etsi.org/01903/';

export interface XmlSigOptions {
  trustAnchors?: TrustAnchor[];
  /** Resolves a non-fragment Reference URI (a file next to a detached signature) to its bytes. */
  resolve?: (uri: string) => Uint8Array | undefined;
  /** Reported type when the signature is not inside the invoice document. */
  type?: SignatureInfo['type'];
  /** EU trusted-list snapshot to check the signer against (see eu-trust.ts). */
  euTrust?: TrustSnapshot;
  /** Clock for trust evaluation; defaults to the current time. */
  now?: Date;
  /** Called with the DER of the signer certificate of every signature that verified. */
  onSigner?: (info: SignatureInfo, der: Uint8Array) => void;
}

class Unsupported extends Error {}

const C14N: Record<string, Omit<C14nOptions, 'omit' | 'inclusivePrefixes'>> = {
  'http://www.w3.org/TR/2001/REC-xml-c14n-20010315': { exclusive: false, withComments: false },
  'http://www.w3.org/TR/2001/REC-xml-c14n-20010315#WithComments': { exclusive: false, withComments: true },
  [EXC]: { exclusive: true, withComments: false },
  [`${EXC}WithComments`]: { exclusive: true, withComments: true },
};
const DIGESTS: Record<string, string> = {
  [`${DSIG}sha1`]: 'SHA-1',
  'http://www.w3.org/2001/04/xmlenc#sha256': 'SHA-256',
  'http://www.w3.org/2001/04/xmldsig-more#sha384': 'SHA-384',
  'http://www.w3.org/2001/04/xmlenc#sha512': 'SHA-512',
};
const SIG_ALGS: Record<string, { kind: 'rsa' | 'rsa-pss' | 'ec'; hash: string }> = {
  [`${DSIG}rsa-sha1`]: { kind: 'rsa', hash: 'SHA-1' },
  'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256': { kind: 'rsa', hash: 'SHA-256' },
  'http://www.w3.org/2001/04/xmldsig-more#rsa-sha384': { kind: 'rsa', hash: 'SHA-384' },
  'http://www.w3.org/2001/04/xmldsig-more#rsa-sha512': { kind: 'rsa', hash: 'SHA-512' },
  'http://www.w3.org/2007/05/xmldsig-more#sha1-rsa-MGF1': { kind: 'rsa-pss', hash: 'SHA-1' },
  'http://www.w3.org/2007/05/xmldsig-more#sha256-rsa-MGF1': { kind: 'rsa-pss', hash: 'SHA-256' },
  'http://www.w3.org/2007/05/xmldsig-more#sha384-rsa-MGF1': { kind: 'rsa-pss', hash: 'SHA-384' },
  'http://www.w3.org/2007/05/xmldsig-more#sha512-rsa-MGF1': { kind: 'rsa-pss', hash: 'SHA-512' },
  'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha1': { kind: 'ec', hash: 'SHA-1' },
  'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256': { kind: 'ec', hash: 'SHA-256' },
  'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha384': { kind: 'ec', hash: 'SHA-384' },
  'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha512': { kind: 'ec', hash: 'SHA-512' },
};
/** RFC 6931: with MGF1 and no explicit parameters the salt is as long as the digest. */
const PSS_SALT: Record<string, number> = { 'SHA-1': 20, 'SHA-256': 32, 'SHA-384': 48, 'SHA-512': 64 };
const CURVES: Record<string, string> = { '1.2.840.10045.3.1.7': 'P-256', '1.3.132.0.34': 'P-384', '1.3.132.0.35': 'P-521' };

/** Verifies every top-level ds:Signature in the document. Never throws. */
export async function verifyXmlSignatures(xml: string, opts: XmlSigOptions = {}): Promise<SignatureInfo[]> {
  let doc: XDocument;
  try {
    doc = new DOMParser({
      onError: (level: string, msg: string) => {
        if (level !== 'warning') throw new Error(msg);
      },
    }).parseFromString(xml, 'text/xml');
  } catch (e) {
    return [{ type: opts.type ?? 'XMLDSig', reason: `XML could not be parsed for signature checking: ${(e as Error).message}` }];
  }
  const sigs = findSignatures(doc);
  const ids = indexIds(doc);
  const anchors = parseAnchors(opts.trustAnchors);
  const out: SignatureInfo[] = [];
  for (const sig of sigs) out.push(await verifyOne(doc, sig, ids, anchors, opts));
  return out;
}

async function verifyOne(
  doc: XDocument,
  sig: XElement,
  ids: Map<string, XElement[]>,
  anchors: pkijs.Certificate[],
  opts: XmlSigOptions,
): Promise<SignatureInfo> {
  const xades = !!first(sig, XADES_URI, 'QualifyingProperties', true);
  const info: SignatureInfo = { type: opts.type ?? (xades ? 'XAdES' : 'XMLDSig') };
  try {
    const signedInfo = child(sig, DSIG, 'SignedInfo');
    const sigValueEl = child(sig, DSIG, 'SignatureValue');
    const refs = signedInfo ? children(signedInfo, DSIG, 'Reference') : [];
    if (!signedInfo || !sigValueEl || refs.length === 0)
      throw new Malformed('Signature is incomplete (SignedInfo, Reference or SignatureValue missing)');
    const c14nAlg = child(signedInfo, DSIG, 'CanonicalizationMethod')?.getAttribute('Algorithm') ?? '';
    const c14nOpts = C14N[c14nAlg];
    if (!c14nOpts) throw new Unsupported(`Unsupported canonicalization ${c14nAlg || '(none)'}`);
    const sigAlgUri = child(signedInfo, DSIG, 'SignatureMethod')?.getAttribute('Algorithm') ?? '';
    const sigAlg = SIG_ALGS[sigAlgUri];
    if (!sigAlg) throw new Unsupported(`Unsupported signature algorithm ${sigAlgUri || '(none)'}`);

    // Signer certificates carried in KeyInfo.
    const certEls = descendants(child(sig, DSIG, 'KeyInfo'), DSIG, 'X509Certificate');
    const certs: { cert: pkijs.Certificate; der: Uint8Array }[] = [];
    for (const el of certEls) {
      const der = b64(el.textContent ?? '');
      const cert = der && parseCertificate(der);
      if (cert && der) certs.push({ cert, der });
    }

    // References.
    const targets: (XNode | 'external')[] = [];
    const refProblems: string[] = [];
    for (const ref of refs) {
      const uri = ref.getAttribute('URI');
      try {
        const { bytes, target } = dereference(doc, sig, ref, uri, ids, opts);
        targets.push(target);
        const digestEl = child(ref, DSIG, 'DigestMethod');
        const hash = DIGESTS[digestEl?.getAttribute('Algorithm') ?? ''];
        if (!hash) throw new Unsupported(`Unsupported digest algorithm ${digestEl?.getAttribute('Algorithm') ?? '(none)'}`);
        const expected = b64(child(ref, DSIG, 'DigestValue')?.textContent ?? '');
        if (!expected) throw new Malformed(`Reference ${uri ?? ''} has no DigestValue`);
        const actual = new Uint8Array(await crypto.subtle.digest(hash, bytes as BufferSource));
        if (!equal(actual, expected)) refProblems.push(`digest of reference "${uri ?? ''}" does not match (content changed after signing)`);
      } catch (e) {
        if (e instanceof Unsupported || e instanceof Malformed) throw e;
        throw new Malformed((e as Error).message);
      }
    }

    // SignatureValue over canonical SignedInfo.
    const incl = child(child(signedInfo, DSIG, 'CanonicalizationMethod'), EXC, 'InclusiveNamespaces')?.getAttribute('PrefixList');
    const signedBytes = new TextEncoder().encode(
      canonicalize(signedInfo, { ...c14nOpts, inclusivePrefixes: incl?.split(/\s+/).filter(Boolean) }),
    );
    const sigValue = b64(sigValueEl.textContent ?? '');
    if (!sigValue) throw new Malformed('Empty SignatureValue');

    // XAdES: only trust signed properties that a reference actually covers.
    const signedProps = first(sig, XADES_URI, 'SignedProperties', true);
    const propsCovered = !!signedProps && targets.includes(signedProps);
    const certDigest = propsCovered ? signingCertDigest(signedProps!) : undefined;
    if (propsCovered) {
      const t = textOf(first(signedProps!, XADES_URI, 'SigningTime', true));
      if (t && !Number.isNaN(Date.parse(t))) info.signedAt = new Date(t).toISOString();
    }

    let signer = certs[0];
    if (certDigest) {
      const hash = DIGESTS[certDigest.alg];
      const match = hash ? await findByDigest(certs, hash, certDigest.value) : undefined;
      if (match) signer = match;
      else if (certs.length)
        info.reason = 'Signing certificate digest in the signed properties matches none of the certificates in the signature';
    }
    const key = signer ? await importKey(signer.cert, sigAlg) : await keyFromKeyValue(child(sig, DSIG, 'KeyInfo'), sigAlg);
    if (signer) {
      info.signer = commonName(signer.cert);
      info.certificate = certificateDetails(signer.cert);
    }
    const sigOk = await crypto.subtle.verify(
      sigAlg.kind === 'rsa'
        ? { name: 'RSASSA-PKCS1-v1_5' }
        : sigAlg.kind === 'rsa-pss'
          ? { name: 'RSA-PSS', saltLength: PSS_SALT[sigAlg.hash] }
          : { name: 'ECDSA', hash: sigAlg.hash },
      key,
      sigValue as BufferSource,
      signedBytes as BufferSource,
    );

    const covers = targets.some((t) => t === 'external' || t === doc || t === doc.documentElement);
    const problems = [...refProblems];
    if (!sigOk) problems.unshift('SignatureValue does not match the signed information (wrong key or altered SignedInfo)');
    if (info.reason) problems.push(info.reason);
    if (sigOk && !refProblems.length && !covers) problems.push('the signed references do not cover the whole document');
    if (problems.length) {
      info.verified = false;
      info.reason = problems.join('; ');
      return info;
    }
    info.verified = true;
    if (signer) {
      opts.onSigner?.(info, signer.der);
      await assessTrust(
        info,
        signer.cert,
        certs.map((c) => c.cert),
        anchors,
        info.signedAt ? new Date(info.signedAt) : undefined,
        opts,
      );
    }
    delete info.reason;
    return info;
  } catch (e) {
    if (e instanceof Unsupported) info.reason = e.message;
    else {
      info.verified = false;
      info.reason = e instanceof Malformed ? e.message : `Verification error: ${(e as Error).message}`;
    }
    return info;
  }
}

class Malformed extends Error {}

function dereference(
  doc: XDocument,
  sig: XElement,
  ref: XElement,
  uri: string | null,
  ids: Map<string, XElement[]>,
  opts: XmlSigOptions,
): { bytes: Uint8Array; target: XNode | 'external' } {
  let target: XNode | 'external';
  let octets: Uint8Array | undefined;
  if (uri === null || uri === '') target = doc;
  else if (uri.startsWith('#')) {
    const id = decodeURIComponent(uri.slice(1));
    const found = ids.get(id);
    if (!found || found.length === 0) throw new Malformed(`Reference ${uri} points to an element that does not exist`);
    if (found.length > 1) throw new Malformed(`Reference ${uri} is ambiguous (duplicate Id)`);
    target = found[0];
  } else {
    octets = opts.resolve?.(uri);
    if (!octets) throw new Malformed(`Referenced content "${uri}" is not available next to the signature`);
    target = 'external';
  }

  let omit: XElement | undefined;
  let canon: Omit<C14nOptions, 'omit'> | undefined;
  let node: XNode | undefined = target === 'external' ? undefined : target;
  const transforms = children(child(ref, DSIG, 'Transforms'), DSIG, 'Transform');
  for (const t of transforms) {
    const alg = t.getAttribute('Algorithm') ?? '';
    if (alg === `${DSIG}enveloped-signature`) {
      omit = sig;
      continue;
    }
    const c = C14N[alg];
    if (c) {
      const prefixes = child(t, EXC, 'InclusiveNamespaces')?.getAttribute('PrefixList');
      canon = { ...c, inclusivePrefixes: prefixes?.split(/\s+/).filter(Boolean) };
      continue;
    }
    if (
      alg === 'http://www.w3.org/TR/1999/REC-xpath-19991116' &&
      /^\s*not\(ancestor-or-self::(?:[\w.-]+:)?Signature\)\s*$/.test(child(t, DSIG, 'XPath')?.textContent ?? '')
    ) {
      omit = sig;
      continue;
    }
    throw new Unsupported(`Unsupported transform ${alg}`);
  }
  if (octets) {
    if (!canon) return { bytes: octets, target };
    node = new DOMParser({
      onError: (l: string, m: string) => {
        if (l !== 'warning') throw new Error(m);
      },
    }).parseFromString(new TextDecoder('utf-8').decode(octets), 'text/xml');
  }
  const opt = canon ?? { exclusive: false, withComments: false };
  return { bytes: new TextEncoder().encode(canonicalize(node!, { ...opt, omit })), target };
}

// --- helpers ----------------------------------------------------------------

const isEl = (n: XNode | null): n is XElement => !!n && n.nodeType === 1;

function children(parent: XElement | null | undefined, ns: string, local: string): XElement[] {
  const out: XElement[] = [];
  for (let c = parent?.firstChild ?? null; c; c = c.nextSibling) if (isEl(c) && c.namespaceURI === ns && c.localName === local) out.push(c);
  return out;
}
const child = (parent: XElement | null | undefined, ns: string, local: string) => children(parent, ns, local)[0] ?? null;

function descendants(parent: XElement | null | undefined, ns: string, local: string): XElement[] {
  if (!parent) return [];
  const list = parent.getElementsByTagNameNS(ns, local);
  return Array.from({ length: list.length }, (_, i) => list.item(i)!);
}

/** First descendant by namespace-prefix match (XAdES namespace carries a version, so match on the URI prefix). */
function first(parent: XElement, nsPrefix: string, local: string, prefixMatch = false): XElement | null {
  const list = parent.getElementsByTagNameNS('*', local);
  for (let i = 0; i < list.length; i++) {
    const el = list.item(i)!;
    if (prefixMatch ? el.namespaceURI?.startsWith(nsPrefix) : el.namespaceURI === nsPrefix) return el;
  }
  return null;
}

/** Top-level signatures: not nested inside another Signature (counter-signatures) nor inside a SOAP/SBDH-like wrapper we dropped. */
function findSignatures(doc: XDocument): XElement[] {
  const list = doc.getElementsByTagNameNS(DSIG, 'Signature');
  const out: XElement[] = [];
  for (let i = 0; i < list.length; i++) {
    const el = list.item(i)!;
    let nested = false;
    for (let p = el.parentNode; p && p.nodeType === 1; p = p.parentNode)
      if ((p as XElement).namespaceURI === DSIG && (p as XElement).localName === 'Signature') nested = true;
    if (!nested) out.push(el);
  }
  return out;
}

function indexIds(doc: XDocument): Map<string, XElement[]> {
  const map = new Map<string, XElement[]>();
  const all = doc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all.item(i)!;
    for (const name of ['Id', 'ID', 'id']) {
      const v = el.getAttribute(name);
      if (v) map.set(v, [...(map.get(v) ?? []), el]);
    }
    const x = el.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'id');
    if (x) map.set(x, [...(map.get(x) ?? []), el]);
  }
  return map;
}

const textOf = (el: XElement | null) => el?.textContent?.trim() || undefined;

function signingCertDigest(props: XElement): { alg: string; value: Uint8Array } | undefined {
  const cd = first(props, XADES_URI, 'CertDigest', true);
  if (!cd) return undefined;
  const alg = child(cd, DSIG, 'DigestMethod')?.getAttribute('Algorithm');
  const value = b64(child(cd, DSIG, 'DigestValue')?.textContent ?? '');
  return alg && value ? { alg, value } : undefined;
}

async function findByDigest(certs: { cert: pkijs.Certificate; der: Uint8Array }[], hash: string, value: Uint8Array) {
  for (const c of certs) {
    if (equal(new Uint8Array(await crypto.subtle.digest(hash, c.der as BufferSource)), value)) return c;
  }
  return undefined;
}

async function importKey(cert: pkijs.Certificate, alg: { kind: 'rsa' | 'rsa-pss' | 'ec'; hash: string }): Promise<CryptoKey> {
  const spki = new Uint8Array(cert.subjectPublicKeyInfo.toSchema().toBER());
  if (alg.kind === 'rsa') return crypto.subtle.importKey('spki', spki, { name: 'RSASSA-PKCS1-v1_5', hash: alg.hash }, false, ['verify']);
  if (alg.kind === 'rsa-pss') {
    // Some runtimes only import RSA-PSS keys whose SPKI says RSASSA-PSS; the usual rsaEncryption key goes in as JWK.
    const key = cert.subjectPublicKeyInfo.parsedKey as
      | { modulus?: { valueBlock: { valueHexView: Uint8Array } }; publicExponent?: { valueBlock: { valueHexView: Uint8Array } } }
      | undefined;
    if (!key?.modulus || !key.publicExponent) throw new Unsupported('Unsupported public key in the signer certificate');
    const part = (v: Uint8Array) =>
      btoa(String.fromCharCode(...(v[0] === 0 ? v.subarray(1) : v)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    return crypto.subtle.importKey(
      'jwk',
      { kty: 'RSA', n: part(key.modulus.valueBlock.valueHexView), e: part(key.publicExponent.valueBlock.valueHexView), ext: true },
      { name: 'RSA-PSS', hash: alg.hash },
      false,
      ['verify'],
    );
  }
  const params = cert.subjectPublicKeyInfo.algorithm.algorithmParams as { valueBlock?: { toString(): string } } | undefined;
  const curve = CURVES[params?.valueBlock?.toString() ?? ''];
  if (!curve) throw new Unsupported('Unsupported elliptic curve in the signer certificate');
  return crypto.subtle.importKey('spki', spki, { name: 'ECDSA', namedCurve: curve }, false, ['verify']);
}

async function keyFromKeyValue(keyInfo: XElement | null, alg: { kind: 'rsa' | 'rsa-pss' | 'ec'; hash: string }): Promise<CryptoKey> {
  const rsa = child(child(keyInfo, DSIG, 'KeyValue'), DSIG, 'RSAKeyValue');
  if (!rsa || alg.kind !== 'rsa') throw new Unsupported('No signer certificate or supported key in KeyInfo');
  const part = (n: string) =>
    (textOf(child(rsa, DSIG, n)) ?? '').replace(/\s+/g, '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return crypto.subtle.importKey(
    'jwk',
    { kty: 'RSA', n: part('Modulus'), e: part('Exponent'), ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: alg.hash },
    false,
    ['verify'],
  );
}

function b64(s: string): Uint8Array | undefined {
  const t = s.replace(/\s+/g, '');
  if (!t) return undefined;
  try {
    return Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
  } catch {
    return undefined;
  }
}

function equal(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
