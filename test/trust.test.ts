import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { b64, makeIdentity } from './sig-helpers.js';
import { certificateDetails, commonName, dn, evaluateTrust, parseAnchors, parseCertificate } from '../src/signature/trust.js';

const pem = (der: Uint8Array) => `-----BEGIN CERTIFICATE-----\n${b64(der).match(/.{1,64}/g)!.join('\n')}\n-----END CERTIFICATE-----\n`;
const now = new Date();

describe('trust evaluation', () => {
  test('no anchors configured: not-checked', async () => {
    const leaf = await makeIdentity('Leaf');
    assert.deepEqual(await evaluateTrust(leaf.cert, [], [], now), { trust: 'not-checked' });
  });

  test('a certificate that is itself an anchor, and a leaf issued by an anchor, are trusted', async () => {
    const root = await makeIdentity('Root CA', 'rsa', undefined, true);
    const leaf = await makeIdentity('Leaf', 'ec', root);
    assert.equal((await evaluateTrust(root.cert, [], [root.cert], now)).trust, 'trusted');
    const r = await evaluateTrust(leaf.cert, [], [root.cert], now);
    assert.equal(r.trust, 'trusted', r.reason);
  });

  test('chain building through an intermediate carried in the file', async () => {
    const root = await makeIdentity('Root CA', 'rsa', undefined, true);
    const mid = await makeIdentity('Intermediate CA', 'rsa', root, true);
    const leaf = await makeIdentity('Leaf', 'rsa', mid);
    const ok = await evaluateTrust(leaf.cert, [mid.cert, leaf.cert], [root.cert], now);
    assert.equal(ok.trust, 'trusted', ok.reason);
    const missing = await evaluateTrust(leaf.cert, [], [root.cert], now);
    assert.equal(missing.trust, 'untrusted');
    assert.ok(missing.reason);
  });

  test('a non-matching anchor is untrusted', async () => {
    const root = await makeIdentity('Root CA', 'rsa', undefined, true);
    const other = await makeIdentity('Other CA', 'rsa', undefined, true);
    const leaf = await makeIdentity('Leaf', 'rsa', root);
    const r = await evaluateTrust(leaf.cert, [], [other.cert], now);
    assert.equal(r.trust, 'untrusted');
    assert.ok(r.reason);
  });

  test('an expired certificate is untrusted at a date after its validity, trusted at the signing date', async () => {
    const root = await makeIdentity('Root CA', 'rsa', undefined, true);
    const leaf = await makeIdentity('Leaf', 'rsa', root);
    const later = new Date(Date.now() + 20 * 365 * 86_400_000);
    assert.equal((await evaluateTrust(leaf.cert, [], [root.cert], later)).trust, 'untrusted');
    const earlier = new Date(Date.now() - 100 * 86_400_000);
    assert.equal((await evaluateTrust(leaf.cert, [], [root.cert], earlier)).trust, 'trusted');
    const before = new Date(Date.now() - 2000 * 86_400_000);
    assert.equal((await evaluateTrust(leaf.cert, [], [root.cert], before)).trust, 'untrusted');
  });
});

describe('anchors and certificate details', () => {
  test('anchors are accepted as DER, PEM (several certificates), bare base64, and junk is ignored', async () => {
    const a = await makeIdentity('A');
    const b = await makeIdentity('B');
    assert.equal(parseAnchors(undefined).length, 0);
    const parsed = parseAnchors([a.der, pem(a.der) + pem(b.der), b64(b.der), 'not a certificate', new Uint8Array([1, 2, 3])]);
    assert.equal(parsed.length, 4);
  });

  test('parseCertificate returns null for garbage', () => {
    assert.equal(parseCertificate(new Uint8Array([0x30, 0x03, 1, 2, 3])), null);
  });

  test('details, common name and DN', async () => {
    const root = await makeIdentity('Root CA', 'rsa', undefined, true);
    const leaf = await makeIdentity('Leaf Signer', 'rsa', root);
    const d = certificateDetails(leaf.cert);
    assert.equal(d.subject, 'CN=Leaf Signer');
    assert.equal(d.issuer, 'CN=Root CA');
    assert.match(d.serial, /^[0-9a-f]+$/);
    assert.ok(Date.parse(d.notBefore) < Date.parse(d.notAfter));
    assert.equal(commonName(leaf.cert), 'Leaf Signer');
    assert.equal(dn(leaf.cert.issuer), 'CN=Root CA');
  });
});
