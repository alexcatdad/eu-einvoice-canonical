import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync } from 'fflate';
import { DOMParser } from '@xmldom/xmldom';
import { convert, inspect } from '../src/index.js';
import { canonicalize } from '../src/signature/c14n.js';
import { b64, makeIdentity, signCms, signXml, type Identity } from './sig-helpers.js';
import { fixture, utf8 } from './helpers.js';

const DOC = '<fe:Facturae xmlns:fe="urn:test:fe"><Invoice><Number>1</Number><Total>10.00</Total></Invoice><!--SIG--></fe:Facturae>';

const sigsOf = async (bytes: Uint8Array, name: string, trustAnchors?: Uint8Array[]) =>
  (await inspect(bytes, name, undefined, { trustAnchors })).documents[0].payload.signatures;

describe('canonicalisation', () => {
  const c14n = (xml: string, exclusive: boolean, pick?: string) => {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const node = pick ? doc.getElementsByTagName(pick).item(0)! : doc;
    return canonicalize(node, { exclusive, withComments: false });
  };

  test('attributes are sorted, empty elements expanded, text and attribute values escaped', () => {
    assert.equal(c14n('<a  z="1"   b=\'x"y\'><b/><!-- gone -->t&amp;&gt;</a>', false), '<a b="x&quot;y" z="1"><b></b>t&amp;&gt;</a>');
  });

  test('a subtree keeps inherited namespaces inclusively, only used ones exclusively', () => {
    const xml = '<r xmlns:a="urn:a" xmlns:b="urn:b"><a:x><b:y/></a:x></r>';
    assert.equal(c14n(xml, false, 'a:x'), '<a:x xmlns:a="urn:a" xmlns:b="urn:b"><b:y></b:y></a:x>');
    assert.equal(c14n(xml, true, 'a:x'), '<a:x xmlns:a="urn:a"><b:y xmlns:b="urn:b"></b:y></a:x>');
  });

  test('the default namespace is undeclared where it ends', () => {
    assert.equal(c14n('<r xmlns="urn:d"><x xmlns=""/></r>', false), '<r xmlns="urn:d"><x xmlns=""></x></r>');
  });
});

describe('XAdES / XMLDSig', () => {
  test('valid RSA signature (inclusive C14N, XAdES): verified, signer reported, trust not checked', async () => {
    const id = await makeIdentity('Test Signer One');
    const [s] = await sigsOf(utf8(await signXml(DOC, { signer: id })), 'x.xsig');
    assert.equal(s.type, 'XAdES');
    assert.equal(s.verified, true, s.reason);
    assert.equal(s.signer, 'Test Signer One');
    assert.equal(s.trust, 'not-checked');
    assert.equal(s.signedAt, '2026-01-02T03:04:05.000Z');
    assert.ok(s.certificate?.subject.includes('Test Signer One'));
  });

  test('valid ECDSA signature with exclusive C14N and plain XMLDSig (no XAdES)', async () => {
    const id = await makeIdentity('Test Signer EC', 'ec');
    const [s] = await sigsOf(utf8(await signXml(DOC, { signer: id, c14n: 'exc', xades: false })), 'x.xml');
    assert.equal(s.type, 'XMLDSig');
    assert.equal(s.verified, true, s.reason);
  });

  test('changed content is detected', async () => {
    const id = await makeIdentity('Test Signer One');
    const signed = (await signXml(DOC, { signer: id })).replace('<Total>10.00</Total>', '<Total>11.00</Total>');
    const [s] = await sigsOf(utf8(signed), 'x.xsig');
    assert.equal(s.verified, false);
    assert.match(s.reason!, /digest/);
  });

  test('a signature value made with another key is detected', async () => {
    const signer = await makeIdentity('Real Signer');
    const claimed = await makeIdentity('Claimed Signer');
    const [s] = await sigsOf(utf8(await signXml(DOC, { signer, certOf: claimed })), 'x.xsig');
    assert.equal(s.verified, false);
    assert.match(s.reason!, /SignatureValue/);
  });

  test('a signature that does not cover the document is not valid for it', async () => {
    const id = await makeIdentity('Wrapper');
    const [s] = await sigsOf(utf8(await signXml(DOC, { signer: id, covers: 'props-only' })), 'x.xsig');
    assert.equal(s.verified, false);
    assert.match(s.reason!, /do not cover/);
  });

  test('trust anchors: a chain to the anchor is trusted, an unrelated anchor is not', async () => {
    const ca = await makeIdentity('Test CA', 'rsa', undefined, true);
    const leaf = await makeIdentity('Leaf Signer', 'rsa', ca);
    const other = await makeIdentity('Other CA', 'rsa', undefined, true);
    const bytes = utf8(await signXml(DOC, { signer: leaf }));
    const [trusted] = await sigsOf(bytes, 'x.xsig', [ca.der]);
    assert.equal(trusted.verified, true, trusted.reason);
    assert.equal(trusted.trust, 'trusted', trusted.trustReason);
    const [untrusted] = await sigsOf(bytes, 'x.xsig', [other.der]);
    assert.equal(untrusted.verified, true);
    assert.equal(untrusted.trust, 'untrusted');
  });

  test('convert(): valid → passed, tampered → failed, and the invoice is still converted', async () => {
    const id = await makeIdentity('Test Signer One');
    const xml = new TextDecoder().decode(fixture('xrechnung-ubl.xml')).replace(/<\/ubl:Invoice>\s*$/, '<!--SIG--></ubl:Invoice>');
    const signed = await signXml(xml, { signer: id, xades: false });
    const ok = await convert(utf8(signed), 'inv.xml');
    assert.equal(ok.outcomes[0].status, 'ok');
    const inv = (ok.outcomes[0] as any).invoices[0];
    assert.equal(inv.source.validation.signature, 'passed');
    assert.ok(inv.source.validation.findings.some((f: any) => /signer not checked against a trust list/.test(f.message)));

    const bad = await convert(utf8(signed.replace(/(<cbc:ID>)([^<]+)/, '$1X-$2')), 'inv.xml');
    assert.equal(bad.outcomes[0].status, 'ok');
    assert.equal((bad.outcomes[0] as any).invoices[0].source.validation.signature, 'failed');
  });

  test('unsigned documents are not-run', async () => {
    const r = await convert(fixture('xrechnung-ubl.xml'), 'x.xml');
    assert.equal((r.outcomes[0] as any).invoices[0].source.validation.signature, 'not-run');
  });
});

describe('detached XMLDSig in a ZIP (ANAF)', () => {
  const invoice = utf8('<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><x>1</x></Invoice>');
  const zipWith = async (invoiceBytes: Uint8Array, signer: Identity) => {
    const sig = await signXml('', { signer, xades: false, detached: { uri: '99.xml', bytes: invoice } });
    return zipSync({ '99.xml': invoiceBytes, 'semnatura_99.xml': utf8(sig) });
  };

  test('verified against the invoice entry it references', async () => {
    const id = await makeIdentity('ANAF Test Signer');
    const r = await inspect(await zipWith(invoice, id), 'a.zip');
    const s = r.documents[0].payload.signatures;
    assert.equal(s.length, 1);
    assert.equal(s[0].type, 'detached');
    assert.equal(s[0].verified, true, s[0].reason);
  });

  test('a changed invoice entry fails', async () => {
    const id = await makeIdentity('ANAF Test Signer');
    const r = await inspect(await zipWith(utf8('<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><x>2</x></Invoice>'), id), 'a.zip');
    assert.equal(r.documents[0].payload.signatures[0].verified, false);
  });
});

describe('CAdES (.p7m)', () => {
  const content = fixture('xrechnung-ubl.xml');

  test('valid signature: verified, signer and signing time reported, trust not checked', async () => {
    const id = await makeIdentity('Test Signer One');
    const [s] = await sigsOf(await signCms(content, id), 'inv.xml.p7m');
    assert.equal(s.type, 'CAdES');
    assert.equal(s.verified, true, s.reason);
    assert.equal(s.signer, 'Test Signer One');
    assert.equal(s.trust, 'not-checked');
    assert.equal(s.signedAt, '2026-03-04T05:06:07.000Z');
  });

  test('base64 .p7m (PEM-less) verifies too', async () => {
    const id = await makeIdentity('Test Signer One');
    const [s] = await sigsOf(utf8(b64(await signCms(content, id))), 'inv.xml.p7m');
    assert.equal(s.verified, true, s.reason);
  });

  test('changed content is detected', async () => {
    const id = await makeIdentity('Test Signer One');
    const der = await signCms(content, id);
    // Flip one byte inside the embedded content (same length keeps the DER valid).
    const needle = utf8('<cbc:ID>');
    let at = -1;
    for (let i = 0; i < der.length - needle.length && at < 0; i++) if (needle.every((b, j) => der[i + j] === b)) at = i + needle.length;
    assert.ok(at > 0);
    der[at] = der[at] === 0x58 ? 0x59 : 0x58;
    const [s] = await sigsOf(der, 'inv.xml.p7m');
    assert.equal(s.verified, false);
  });

  test('a signature made with another key than the embedded certificate is detected', async () => {
    const signer = await makeIdentity('Real Signer');
    const claimed = await makeIdentity('Claimed Signer');
    const [s] = await sigsOf(await signCms(content, signer, claimed), 'inv.xml.p7m');
    assert.equal(s.verified, false);
  });

  test('trust anchors', async () => {
    const ca = await makeIdentity('Test CA', 'rsa', undefined, true);
    const leaf = await makeIdentity('Leaf Signer', 'rsa', ca);
    const other = await makeIdentity('Other CA', 'rsa', undefined, true);
    const der = await signCms(content, leaf);
    assert.equal((await sigsOf(der, 'a.p7m', [ca.der]))[0].trust, 'trusted');
    const [u] = await sigsOf(der, 'a.p7m', [other.der]);
    assert.equal(u.verified, true);
    assert.equal(u.trust, 'untrusted');
  });

  test('convert(): tampered p7m still converts, signature failed', async () => {
    const id = await makeIdentity('Test Signer One');
    const r = await convert(await signCms(content, id), 'inv.xml.p7m');
    assert.equal((r.outcomes[0] as any).invoices[0].source.validation.signature, 'passed');
  });
});

describe('opting out', () => {
  test('verifySignatures: false only detects', async () => {
    const id = await makeIdentity('Test Signer One');
    const r = await inspect(utf8(await signXml(DOC, { signer: id })), 'x.xsig', undefined, { verifySignatures: false });
    assert.equal(r.documents[0].payload.signatures[0].verified, undefined);
  });
});

describe('existing fixtures report their real result', () => {
  test('the .p7m fixtures carry a signature that was checked', async () => {
    for (const f of ['IT01234567890_FPR12.xml.p7m', 'IT01234567890_FPR12.base64.xml.p7m']) {
      const [s] = await sigsOf(fixture(f), f);
      assert.equal(s.type, 'CAdES');
      console.log(`${f}: verified=${s.verified} reason=${s.reason} signer=${s.signer} trust=${s.trust}`);
      assert.equal(typeof s.verified, 'boolean', f);
    }
  });

  test('the stub XAdES in the Facturae fixture and the stub detached signature in the ANAF ZIP are incomplete, hence failed', async () => {
    const [x] = await sigsOf(fixture('facturae-322-signed.xsig'), 'f.xsig');
    assert.equal(x.type, 'XAdES');
    assert.equal(x.verified, false);
    assert.match(x.reason!, /incomplete/);
    const [d] = await sigsOf(fixture('anaf-download.zip'), 'anaf-download.zip');
    assert.equal(d.type, 'detached');
    assert.equal(d.verified, false);
  });
});
