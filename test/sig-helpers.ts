/** Runtime key, certificate and signature generation for the signature tests. Nothing here is committed key material. */

import { DOMParser } from '@xmldom/xmldom';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { canonicalize } from '../src/signature/c14n.js';

export interface Identity {
  keys: CryptoKeyPair;
  cert: pkijs.Certificate;
  der: Uint8Array;
  alg: 'rsa' | 'ec';
}

const b64 = (b: Uint8Array | ArrayBuffer) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString('base64');

export { b64 };

export async function makeIdentity(cn: string, alg: 'rsa' | 'ec' = 'rsa', issuer?: Identity, ca = false): Promise<Identity> {
  const keys = (await crypto.subtle.generateKey(
    alg === 'rsa'
      ? { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }
      : { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const cert = new pkijs.Certificate();
  cert.version = 2;
  cert.serialNumber = new asn1js.Integer({ value: Math.floor(Math.random() * 1e9) + 1 });
  const name = (n: string) => new pkijs.AttributeTypeAndValue({ type: '2.5.4.3', value: new asn1js.Utf8String({ value: n }) });
  cert.subject.typesAndValues.push(name(cn));
  if (issuer) cert.issuer = issuer.cert.subject;
  else cert.issuer.typesAndValues.push(name(cn));
  cert.notBefore.value = new Date(Date.now() - 800 * 86_400_000);
  cert.notAfter.value = new Date(Date.now() + 3650 * 86_400_000);
  if (ca) {
    const bc = new pkijs.BasicConstraints({ cA: true });
    cert.extensions = [
      new pkijs.Extension({ extnID: '2.5.29.19', critical: true, extnValue: bc.toSchema().toBER(false), parsedValue: bc }),
    ];
  }
  await cert.subjectPublicKeyInfo.importKey(keys.publicKey);
  await cert.sign(issuer ? issuer.keys.privateKey : keys.privateKey, 'SHA-256');
  return { keys, cert, der: new Uint8Array(cert.toSchema(true).toBER()), alg };
}

/** CMS SignedData (attached content, signed attributes) as DER. `certOf` lets a test embed a different certificate than the signing key's. */
export async function signCms(
  content: Uint8Array,
  signer: Identity,
  certOf: Identity = signer,
  extraCerts: Identity[] = [],
): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', content as BufferSource);
  const attr = (type: string, value: asn1js.AsnType) => new pkijs.Attribute({ type, values: [value] });
  const sd = new pkijs.SignedData({
    version: 1,
    encapContentInfo: new pkijs.EncapsulatedContentInfo({
      eContentType: '1.2.840.113549.1.7.1',
      eContent: new asn1js.OctetString({ valueHex: content.slice().buffer }),
    }),
    signerInfos: [
      new pkijs.SignerInfo({
        version: 1,
        sid: new pkijs.IssuerAndSerialNumber({ issuer: certOf.cert.issuer, serialNumber: certOf.cert.serialNumber }),
        signedAttrs: new pkijs.SignedAndUnsignedAttributes({
          type: 0,
          attributes: [
            attr('1.2.840.113549.1.9.3', new asn1js.ObjectIdentifier({ value: '1.2.840.113549.1.7.1' })),
            attr('1.2.840.113549.1.9.5', new asn1js.UTCTime({ valueDate: new Date('2026-03-04T05:06:07Z') })),
            attr('1.2.840.113549.1.9.4', new asn1js.OctetString({ valueHex: digest })),
          ],
        }),
      }),
    ],
    certificates: [certOf.cert, ...extraCerts.map((c) => c.cert)],
  });
  await sd.sign(signer.keys.privateKey, 0, 'SHA-256');
  const ci = new pkijs.ContentInfo({ contentType: '1.2.840.113549.1.7.2', content: sd.toSchema(true) });
  return new Uint8Array(ci.toSchema().toBER());
}

const DS = 'http://www.w3.org/2000/09/xmldsig#';
const C14N = { inc: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315', exc: 'http://www.w3.org/2001/10/xml-exc-c14n#' };

export interface XmlSignSpec {
  signer: Identity;
  /** Certificate placed in KeyInfo (defaults to the signer's). */
  certOf?: Identity;
  c14n?: 'inc' | 'exc';
  /** 'props-only' signs just the XAdES SignedProperties (signature-wrapping shape). */
  covers?: 'document' | 'props-only';
  xades?: boolean;
  /** Replace the document Reference with this URI and these octets (detached signature next to a file). */
  detached?: { uri: string; bytes: Uint8Array };
}

const parse = (s: string) => new DOMParser().parseFromString(s, 'text/xml');

/** Replaces the `<!--SIG-->` marker in `xml` with a signature (or, for detached, returns the Signature document alone). */
export async function signXml(xml: string, spec: XmlSignSpec): Promise<string> {
  const { signer, certOf = signer } = spec;
  const mode = spec.c14n ?? 'inc';
  const alg = C14N[mode];
  const sigAlg =
    signer.alg === 'rsa' ? 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256' : 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256';
  const sha256 = 'http://www.w3.org/2001/04/xmlenc#sha256';
  const certDigest = b64(await crypto.subtle.digest('SHA-256', certOf.der as BufferSource));
  const xades = spec.xades !== false;
  const ref = (uri: string, transforms: string[], digest: string, type?: string) =>
    `<ds:Reference${type ? ` Type="${type}"` : ''} URI="${uri}"><ds:Transforms>${transforms.map((t) => `<ds:Transform Algorithm="${t}"/>`).join('')}</ds:Transforms><ds:DigestMethod Algorithm="${sha256}"/><ds:DigestValue>${digest}</ds:DigestValue></ds:Reference>`;
  const docRef = spec.detached
    ? ref(spec.detached.uri, [], '@@D1@@')
    : spec.covers === 'props-only'
      ? ''
      : ref('', [`${DS}enveloped-signature`, alg], '@@D1@@');
  const propsRef = xades ? ref('#SP1', [alg], '@@D2@@', 'http://uri.etsi.org/01903#SignedProperties') : '';
  const sig = `<ds:Signature xmlns:ds="${DS}" Id="Sig1"><ds:SignedInfo><ds:CanonicalizationMethod Algorithm="${alg}"/><ds:SignatureMethod Algorithm="${sigAlg}"/>${docRef}${propsRef}</ds:SignedInfo><ds:SignatureValue>@@SV@@</ds:SignatureValue><ds:KeyInfo><ds:X509Data><ds:X509Certificate>${b64(certOf.der)}</ds:X509Certificate></ds:X509Data></ds:KeyInfo>${xades ? `<ds:Object><xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="#Sig1"><xades:SignedProperties Id="SP1"><xades:SignedSignatureProperties><xades:SigningTime>2026-01-02T03:04:05Z</xades:SigningTime><xades:SigningCertificate><xades:Cert><xades:CertDigest><ds:DigestMethod Algorithm="${sha256}"/><ds:DigestValue>${certDigest}</ds:DigestValue></xades:CertDigest></xades:Cert></xades:SigningCertificate></xades:SignedSignatureProperties></xades:SignedProperties></xades:QualifyingProperties></ds:Object>` : ''}</ds:Signature>`;

  const enc = new TextEncoder();
  const digest = async (s: string) => b64(await crypto.subtle.digest('SHA-256', enc.encode(s)));
  const opts = { exclusive: mode === 'exc', withComments: false };
  const full = spec.detached ? sig : xml.replace('<!--SIG-->', sig);
  const doc = parse(full);
  const sigEl = doc.getElementsByTagNameNS(DS, 'Signature').item(0)!;
  let d1 = '';
  if (spec.detached) d1 = b64(await crypto.subtle.digest('SHA-256', spec.detached.bytes as BufferSource));
  else if (spec.covers !== 'props-only') d1 = await digest(canonicalize(doc, { ...opts, omit: sigEl }));
  const props = doc.getElementsByTagNameNS('http://uri.etsi.org/01903/v1.3.2#', 'SignedProperties').item(0);
  const d2 = props ? await digest(canonicalize(props, opts)) : '';
  const filled = full.replace('@@D1@@', d1).replace('@@D2@@', d2);
  const doc2 = parse(filled);
  const si = doc2.getElementsByTagNameNS(DS, 'SignedInfo').item(0)!;
  const bytes = enc.encode(canonicalize(si, opts));
  const sv = await crypto.subtle.sign(
    signer.alg === 'rsa' ? { name: 'RSASSA-PKCS1-v1_5' } : { name: 'ECDSA', hash: 'SHA-256' },
    signer.keys.privateKey,
    bytes as BufferSource,
  );
  return filled.replace('@@SV@@', b64(sv));
}
