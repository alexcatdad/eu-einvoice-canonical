/**
 * EU trusted lists: a small LOTL and national list are generated and signed at test runtime (nothing here is
 * committed key material) and served through an injected fetch, so no test touches the network.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { EXIT, type IO, main } from '../src/cli.js';
import { convert, inspect, parseSnapshot, type TrustSnapshot, trustAnchorsFromSnapshot } from '../src/index.js';
import { signatureFindings } from '../src/signature/index.js';
import { LOTL_URL, loadTrustLists } from '../src/signature/trust-lists.js';
import { parseTrustedList } from '../src/signature/tsl.js';
import { LotlError } from '../src/signature/tsl-load.js';
import { type TrustListDeps, main as trustMain } from '../src/trust-lists-cli.js';
import { fixturePath, utf8 } from './helpers.js';
import { b64, type Identity, makeIdentity, pssVariant, signCms, signXml } from './sig-helpers.js';

const DOC = '<fe:Facturae xmlns:fe="urn:test:fe"><Invoice><Number>1</Number><Total>10.00</Total></Invoice><!--SIG-->';
const INVOICE = `${DOC}</fe:Facturae>`;
/** The signing time signXml writes into the XAdES properties. */
const SIGNED = '2026-01-02T03:04:05.000Z';
const FROM = new Date('2019-01-01T00:00:00Z');
const NOW = new Date('2026-03-01T00:00:00Z');
const NS = 'http://uri.etsi.org/02231/v2#';
const ST = 'http://uri.etsi.org/TrstSvc/TrustedList/Svcstatus/';
const QC = 'http://uri.etsi.org/TrstSvc/Svctype/CA/QC';
const LOTL_TYPE = 'http://uri.etsi.org/TrstSvc/TrustedList/TSLType/EUlistofthelists';
const TSL_URL = 'https://tsl.test/AA.xml';

interface Svc {
  name: string;
  ca: Identity;
  /** Ascending history of [status, from]; the last entry is the current status. */
  history: [string, string][];
  type?: string;
}

const cert = (id: Identity) => `<X509Certificate>${b64(id.der)}</X509Certificate>`;
const identity = (id: Identity) => `<ServiceDigitalIdentity><DigitalId>${cert(id)}</DigitalId></ServiceDigitalIdentity>`;

function instance(tag: string, s: Svc, status: string, from: string, withName: boolean) {
  return `<${tag}><ServiceTypeIdentifier>${s.type ?? QC}</ServiceTypeIdentifier>${withName ? `<ServiceName><Name xml:lang="en">${s.name}</Name></ServiceName>` : ''}${identity(s.ca)}<ServiceStatus>${ST}${status}</ServiceStatus><StatusStartingTime>${from}</StatusStartingTime></${tag}>`;
}

function service(s: Svc) {
  const last = s.history[s.history.length - 1]!;
  const past = s.history.slice(0, -1).reverse();
  return `<TSPService>${instance('ServiceInformation', s, last[0], last[1], true)}${past.length ? `<ServiceHistory>${past.map(([st, from]) => instance('ServiceHistoryInstance', s, st, from, false)).join('')}</ServiceHistory>` : ''}</TSPService>`;
}

interface ListSpec {
  lotl?: boolean;
  territory: string;
  nextUpdate: string;
  pointers?: { url: string; territory: string; signer: Identity }[];
  services?: Svc[];
}

const unsigned = (l: ListSpec) =>
  `<?xml version="1.0" encoding="UTF-8"?><TrustServiceStatusList xmlns="${NS}" xmlns:add="http://uri.etsi.org/02231/v2/additionaltypes#" TSLTag="http://uri.etsi.org/19612/TSLTag"><SchemeInformation><TSLVersionIdentifier>5</TSLVersionIdentifier><TSLSequenceNumber>7</TSLSequenceNumber><TSLType>${l.lotl ? LOTL_TYPE : 'http://uri.etsi.org/TrstSvc/TrustedList/TSLType/EUgeneric'}</TSLType><SchemeOperatorName><Name xml:lang="en">Operator ${l.territory}</Name></SchemeOperatorName><SchemeTerritory>${l.territory}</SchemeTerritory><ListIssueDateTime>2026-01-01T00:00:00Z</ListIssueDateTime><NextUpdate><dateTime>${l.nextUpdate}</dateTime></NextUpdate>${
    l.pointers
      ? `<PointersToOtherTSL>${l.pointers
          .map(
            (p) =>
              `<OtherTSLPointer><ServiceDigitalIdentities><ServiceDigitalIdentity><DigitalId>${cert(p.signer)}</DigitalId></ServiceDigitalIdentity></ServiceDigitalIdentities><TSLLocation>${p.url}</TSLLocation><AdditionalInformation><OtherInformation><add:MimeType>application/vnd.etsi.tsl+xml</add:MimeType></OtherInformation><OtherInformation><SchemeTerritory>${p.territory}</SchemeTerritory></OtherInformation></AdditionalInformation></OtherTSLPointer>`,
          )
          .join(
            '',
          )}<OtherTSLPointer><TSLLocation>https://example.test/ojeu.pdf</TSLLocation><AdditionalInformation><OtherInformation><add:MimeType>application/pdf</add:MimeType></OtherInformation></AdditionalInformation></OtherTSLPointer></PointersToOtherTSL>`
      : ''
  }</SchemeInformation>${
    l.services
      ? `<TrustServiceProviderList><TrustServiceProvider><TSPInformation><TSPName><Name xml:lang="en">Provider ${l.territory}</Name></TSPName></TSPInformation><TSPServices>${l.services.map(service).join('')}</TSPServices></TrustServiceProvider></TrustServiceProviderList>`
      : ''
  }<!--SIG--></TrustServiceStatusList>`;

const signList = (l: ListSpec, signer: Identity) => signXml(unsigned(l), { signer, xades: false, c14n: 'exc' });

interface World {
  lotlSigner: Identity;
  listSigner: Identity;
  leaves: Record<string, Identity>;
  fetched: string[];
  serve: Map<string, Uint8Array | Error>;
  fetch: (url: string) => Promise<Uint8Array>;
  snapshot: TrustSnapshot;
}

/** The services: each CA issues a signer; the history says what that CA's service status was and when. */
const SERVICES: Record<string, [string, string][]> = {
  valid: [[`granted`, '2020-01-01T00:00:00Z']],
  withdrawnAfter: [
    ['granted', '2020-01-01T00:00:00Z'],
    ['withdrawn', '2026-06-01T00:00:00Z'],
  ],
  withdrawnBefore: [
    ['granted', '2020-01-01T00:00:00Z'],
    ['withdrawn', '2025-12-01T00:00:00Z'],
  ],
  revoked: [
    ['granted', '2020-01-01T00:00:00Z'],
    ['supervisionrevoked', '2025-06-01T00:00:00Z'],
  ],
  notYetGranted: [['granted', '2026-03-01T00:00:00Z']],
};

async function identities() {
  const lotlSigner = await makeIdentity('LOTL Signer', 'rsa', undefined, false, FROM);
  const listSigner = await makeIdentity('AA List Signer', 'ec', undefined, false, FROM);
  const stranger = await makeIdentity('Not Published Signer', 'rsa', undefined, false, FROM);
  const leaves: Record<string, Identity> = {};
  const svcs: Svc[] = [];
  for (const [name, history] of Object.entries(SERVICES)) {
    const ca = await makeIdentity(`CA ${name}`, 'rsa', undefined, true, FROM);
    leaves[name] = await makeIdentity(`Signer ${name}`, 'rsa', ca, false, FROM);
    svcs.push({ name: `QCA ${name}`, ca, history });
  }
  // A service that is not a qualified CA must not make anyone qualified.
  const tsa = await makeIdentity('TSA Only', 'rsa', undefined, true, FROM);
  leaves.notCaQc = await makeIdentity('Signer notCaQc', 'rsa', tsa, false, FROM);
  svcs.push({
    name: 'Time stamping',
    ca: tsa,
    history: [['granted', '2020-01-01T00:00:00Z']],
    type: 'http://uri.etsi.org/TrstSvc/Svctype/TSA/QTST',
  });
  leaves.unlisted = await makeIdentity(
    'Signer unlisted',
    'rsa',
    await makeIdentity('CA unlisted', 'rsa', undefined, true, FROM),
    false,
    FROM,
  );
  return { lotlSigner, listSigner, stranger, leaves, svcs };
}

// Only the identities are reused. Each world signs new lists and owns its fetch state and snapshot.
let sharedIdentities: ReturnType<typeof identities> | undefined;
async function world(
  opts: { nextUpdate?: string; tamper?: (xml: string) => string; wrongListSigner?: boolean; freshIdentities?: boolean } = {},
): Promise<World> {
  sharedIdentities ??= identities();
  const { lotlSigner, listSigner, stranger, leaves, svcs } = await (opts.freshIdentities ? identities() : sharedIdentities);

  const nextUpdate = opts.nextUpdate ?? '2026-07-01T00:00:00Z';
  const lotl = await signList(
    { lotl: true, territory: 'EU', nextUpdate, pointers: [{ url: TSL_URL, territory: 'AA', signer: listSigner }] },
    lotlSigner,
  );
  let tsl = await signList({ territory: 'AA', nextUpdate, services: svcs }, opts.wrongListSigner ? stranger : listSigner);
  if (opts.tamper) tsl = opts.tamper(tsl);
  const serve = new Map<string, Uint8Array | Error>([
    [LOTL_URL, utf8(lotl)],
    [TSL_URL, utf8(tsl)],
  ]);
  const fetched: string[] = [];
  const fetch = async (url: string) => {
    fetched.push(url);
    const v = serve.get(url);
    if (!v) throw new Error('HTTP 404');
    if (v instanceof Error) throw v;
    return v;
  };
  const snapshot = await loadTrustLists({ fetch, now: NOW });
  return { lotlSigner, listSigner, leaves, fetched, serve, fetch, snapshot };
}

const signedBy = async (id: Identity) => utf8(await signXml(INVOICE, { signer: id }));
const check = async (w: World, leaf: string, now = NOW) =>
  (await inspect(await signedBy(w.leaves[leaf]!), 'x.xsig', undefined, { euTrust: w.snapshot, now })).documents[0]!.payload.signatures[0]!;

describe('loading the trusted lists', () => {
  test('worlds keep served bytes, fetch history and parsed snapshots isolated', async () => {
    const first = await world();
    const second = await world();
    first.serve.set(TSL_URL, new Error('first world only'));
    first.fetched.push('https://first.test/only');
    first.snapshot.lists[0]!.services.length = 0;
    assert.ok((await second.fetch(TSL_URL)).byteLength > 0);
    assert.deepEqual(second.fetched, [LOTL_URL, TSL_URL, TSL_URL]);
    assert.ok(second.snapshot.lists[0]!.services.length > 0);
    assert.equal((await check(second, 'valid')).euTrust?.qualified, true);
  });

  test('parses the LOTL pointers and the CA/QC services with their history', async () => {
    const w = await world();
    const parsed = parseTrustedList(new TextDecoder().decode(w.serve.get(TSL_URL) as Uint8Array));
    assert.equal(parsed.territory, 'AA');
    assert.equal(parsed.operator, 'Operator AA');
    assert.equal(parsed.nextUpdate, '2026-07-01T00:00:00.000Z');
    assert.equal(parsed.sequenceNumber, 7);
    assert.equal(parsed.services.length, 5); // the time-stamping service is not CA/QC
    const wd = parsed.services.find((s) => s.name === 'QCA withdrawnAfter')!;
    assert.deepEqual(
      wd.statuses.map((s) => s.status),
      ['granted', 'withdrawn'],
    );
    const lotl = parseTrustedList(new TextDecoder().decode(w.serve.get(LOTL_URL) as Uint8Array));
    assert.equal(lotl.isLotl, true);
    assert.equal(lotl.pointers.length, 2);
    assert.throws(() => parseTrustedList('<Other xmlns="urn:x"/>'), /not a trusted list/);
  });

  test('both lists verify; the snapshot records dates, pinning and fetch date', async () => {
    const w = await world();
    assert.deepEqual(w.fetched, [LOTL_URL, TSL_URL]); // the PDF pointer is not followed
    const s = w.snapshot;
    assert.equal(s.fetchedAt, NOW.toISOString());
    assert.equal(s.lotl.pinned, 'first-use');
    assert.equal(s.lotl.nextUpdate, '2026-07-01T00:00:00.000Z');
    assert.equal(s.lists.length, 1);
    assert.equal(s.lists[0]!.status, 'loaded');
    assert.equal(s.lists[0]!.services.length, 5);
    assert.ok(s.problems.some((p) => /not pinned/.test(p)));
    assert.deepEqual(parseSnapshot(JSON.stringify(s)), s);
    assert.throws(() => parseSnapshot('{"version":2}'), /not an EU trust-list snapshot/);
  });

  test('a configured or previous LOTL signer pins it; a different signer is refused', async () => {
    const w = await world();
    const pem = `-----BEGIN CERTIFICATE-----\n${b64(w.lotlSigner.der)}\n-----END CERTIFICATE-----`;
    const configured = await loadTrustLists({ fetch: w.fetch, lotlSigners: [pem], now: NOW });
    assert.equal(configured.lotl.pinned, 'configured');
    assert.ok(!configured.problems.some((p) => /not pinned/.test(p)));
    const again = await loadTrustLists({ fetch: w.fetch, previous: w.snapshot, now: NOW });
    assert.equal(again.lotl.pinned, 'previous-snapshot');

    const other = await world({ freshIdentities: true }); // a different, equally valid LOTL signer
    await assert.rejects(loadTrustLists({ fetch: other.fetch, previous: w.snapshot, now: NOW }), (e: Error) => {
      assert.ok(e instanceof LotlError);
      assert.match(e.message, /not published as the signer/);
      return true;
    });
  });

  test('a LOTL whose signature is broken, or that is missing or not a LOTL, stops the load', async () => {
    const w = await world();
    const lotl = new TextDecoder().decode(w.serve.get(LOTL_URL) as Uint8Array);
    w.serve.set(LOTL_URL, utf8(lotl.replace('<SchemeTerritory>EU', '<SchemeTerritory>XX')));
    await assert.rejects(loadTrustLists({ fetch: w.fetch }), /LOTL signature rejected: signature does not verify/);
    w.serve.set(LOTL_URL, utf8(lotl.replace(/<ds:Signature[\s\S]*<\/ds:Signature>/, '')));
    await assert.rejects(loadTrustLists({ fetch: w.fetch }), /carries no XML signature/);
    w.serve.set(LOTL_URL, new Error('HTTP 503'));
    await assert.rejects(loadTrustLists({ fetch: w.fetch }), /could not be loaded: HTTP 503/);
    w.serve.set(LOTL_URL, w.serve.get(TSL_URL)!);
    await assert.rejects(loadTrustLists({ fetch: w.fetch }), /not the list of trusted lists/);
  });

  test('a national list with a bad signature, or one signed by an unpublished certificate, contributes nothing', async () => {
    const bad = await world({ tamper: (x) => x.replace('QCA valid', 'QCA forged') });
    assert.equal(bad.snapshot.lists[0]!.status, 'rejected');
    assert.match(bad.snapshot.lists[0]!.reason!, /signature does not verify/);
    assert.deepEqual(bad.snapshot.lists[0]!.services, []);
    assert.ok(bad.snapshot.problems.some((p) => p.startsWith('AA: list rejected')));
    const s = await check(bad, 'valid');
    assert.equal(s.verified, true);
    assert.equal(s.euTrust?.qualified, false);
    assert.equal(s.euTrust?.status, 'not-listed');
    assert.equal(s.trust, 'untrusted');

    const stranger = await world({ wrongListSigner: true });
    assert.equal(stranger.snapshot.lists[0]!.status, 'rejected');
    assert.match(stranger.snapshot.lists[0]!.reason!, /not published as the signer/);
  });

  test('an unreachable national list is recorded', async () => {
    const w = await world();
    w.serve.set(TSL_URL, new Error('ENOTFOUND'));
    const s = await loadTrustLists({ fetch: w.fetch, previous: w.snapshot });
    assert.equal(s.lists[0]!.status, 'unreachable');
    assert.match(s.lists[0]!.reason!, /ENOTFOUND/);
  });
});

describe('qualified status at signing time', () => {
  test('granted before signing: qualified, with the service named', async () => {
    const w = await world();
    const s = await check(w, 'valid');
    assert.equal(s.verified, true);
    assert.equal(s.signedAt, SIGNED);
    assert.equal(s.euTrust?.qualified, true);
    assert.equal(s.euTrust?.status, 'qualified');
    assert.deepEqual(s.euTrust?.service, {
      provider: 'Provider AA',
      name: 'QCA valid',
      territory: 'AA',
      statusAtSigning: 'granted',
      currentStatus: 'granted',
      statusFrom: '2020-01-01T00:00:00.000Z',
    });
    assert.equal(s.euTrust?.signingTimeKnown, true);
    assert.equal(s.euTrust?.snapshot.stale, false);
    assert.equal(s.trust, 'trusted');
  });

  test('withdrawn after signing still counts: the status is read at the signing time', async () => {
    const s = await check(await world(), 'withdrawnAfter');
    assert.equal(s.euTrust?.qualified, true);
    assert.equal(s.euTrust?.service?.statusAtSigning, 'granted');
    assert.equal(s.euTrust?.service?.currentStatus, 'withdrawn');
  });

  test('withdrawn before signing: not qualified', async () => {
    const s = await check(await world(), 'withdrawnBefore');
    assert.equal(s.verified, true);
    assert.equal(s.euTrust?.qualified, false);
    assert.equal(s.euTrust?.status, 'not-qualified');
    assert.equal(s.euTrust?.service?.statusAtSigning, 'withdrawn');
    assert.match(s.euTrust?.reason ?? '', /status "withdrawn"/);
    assert.equal(s.trust, 'untrusted');
  });

  test('revoked supervision before signing, and not yet granted at signing: not qualified', async () => {
    const w = await world();
    const revoked = await check(w, 'revoked');
    assert.equal(revoked.euTrust?.qualified, false);
    assert.equal(revoked.euTrust?.service?.statusAtSigning, 'supervisionrevoked');
    const early = await check(w, 'notYetGranted');
    assert.equal(early.euTrust?.qualified, false);
    assert.match(early.euTrust?.reason ?? '', /was not listed at signing time/);
  });

  test('a CA that is not in the lists, and a service that is not CA/QC, are not qualified', async () => {
    const w = await world();
    for (const leaf of ['unlisted', 'notCaQc']) {
      const s = await check(w, leaf);
      assert.equal(s.euTrust?.qualified, false, leaf);
      assert.equal(s.euTrust?.status, 'not-listed', leaf);
      assert.equal(s.trust, 'untrusted');
    }
  });

  test('a snapshot past its next-update date is reported as stale, with that date', async () => {
    const w = await world({ nextUpdate: '2026-02-01T00:00:00Z' });
    const s = await check(w, 'valid', new Date('2026-09-01T00:00:00Z'));
    assert.equal(s.euTrust?.qualified, true);
    assert.deepEqual(s.euTrust?.snapshot, { fetchedAt: NOW.toISOString(), nextUpdate: '2026-02-01T00:00:00.000Z', stale: true });
    const fresh = await check(w, 'valid', new Date('2026-01-15T00:00:00Z'));
    assert.equal(fresh.euTrust?.snapshot.stale, false);
    const [finding] = signatureFindings([s]);
    assert.equal(finding!.severity, 'warning');
    assert.match(finding!.message, /past its next update \(2026-02-01\)/);
  });

  test('findings: qualified is info, not qualified is a warning that names the service', async () => {
    const w = await world();
    const [ok] = signatureFindings([await check(w, 'valid')]);
    assert.equal(ok!.severity, 'info');
    assert.match(ok!.message, /qualified service \(QCA valid, AA\)/);
    const [no] = signatureFindings([await check(w, 'withdrawnBefore')]);
    assert.equal(no!.severity, 'warning');
    assert.match(no!.message, /QCA withdrawnBefore/);
  });

  test('CAdES signatures are checked the same way, at their own signing time', async () => {
    const w = await world();
    const sigOf = async (leaf: string) =>
      (await inspect(await signCms(utf8(INVOICE), w.leaves[leaf]!), 'f.p7m', undefined, { euTrust: w.snapshot, now: NOW })).documents[0]!
        .payload.signatures[0]!;
    // signCms records the signing time 2026-03-04.
    const ok = await sigOf('valid');
    assert.equal(ok.type, 'CAdES');
    assert.equal(ok.signedAt, '2026-03-04T05:06:07.000Z');
    assert.equal(ok.euTrust?.qualified, true);
    assert.equal((await sigOf('withdrawnAfter')).euTrust?.qualified, true);
    const no = await sigOf('withdrawnBefore');
    assert.equal(no.euTrust?.qualified, false);
    assert.equal(no.trust, 'untrusted');
  });

  test('convert() puts the check on the invoice and in its signature findings', async () => {
    const w = await world();
    const xml = readFileSync(fixturePath('peppol-bis3-invoice.xml'), 'utf8').replace(/<\/Invoice>\s*$/, '<!--SIG--></Invoice>');
    const signed = utf8(await signXml(xml, { signer: w.leaves.withdrawnBefore! }));
    const r = await convert(signed, 'inv.xml', undefined, { euTrust: w.snapshot, now: NOW });
    const o = r.outcomes[0]!;
    assert.equal(o.status, 'ok');
    if (o.status !== 'ok') return;
    const inv = o.invoices[0]!;
    assert.equal(inv.source.signatures[0]?.euTrust?.status, 'not-qualified');
    assert.equal(inv.source.validation?.signature, 'passed');
    assert.ok(inv.source.validation?.findings.some((f) => f.layer === 'signature' && /QCA withdrawnBefore/.test(f.message)));
  });

  test('without the euTrust option nothing changes: no euTrust, trust not checked', async () => {
    const w = await world();
    const [s] = (await inspect(await signedBy(w.leaves.valid!), 'x.xsig')).documents[0]!.payload.signatures;
    assert.equal(s!.euTrust, undefined);
    assert.equal(s!.trust, 'not-checked');
  });

  test('the snapshot also works as trustAnchors: services that are qualified now', async () => {
    const w = await world();
    const anchors = trustAnchorsFromSnapshot(w.snapshot);
    assert.equal(anchors.length, 2); // valid and notYetGranted are granted now; the other three are not
    const [s] = (await inspect(await signedBy(w.leaves.valid!), 'x.xsig', undefined, { trustAnchors: anchors })).documents[0]!.payload
      .signatures;
    assert.equal(s!.trust, 'trusted');
    const at = trustAnchorsFromSnapshot(w.snapshot, new Date(SIGNED));
    assert.equal(at.length, 2); // valid and withdrawnAfter were qualified at signing time
  });

  test('a signature without a signing time is evaluated now and says so', async () => {
    const w = await world();
    const unsignedProps = await signXml(INVOICE, { signer: w.leaves.valid!, xades: false });
    const [s] = (await inspect(utf8(unsignedProps), 'x.xsig', undefined, { euTrust: w.snapshot, now: NOW })).documents[0]!.payload
      .signatures;
    assert.equal(s!.signedAt, undefined);
    assert.equal(s!.euTrust?.signingTimeKnown, false);
    assert.equal(s!.euTrust?.evaluatedAt, NOW.toISOString());
    assert.equal(s!.euTrust?.qualified, true);
    const [finding] = signatureFindings([s!]);
    assert.equal(finding!.severity, 'warning');
    assert.match(finding!.message, /no signing time/);
  });

  test('RSA-PSS (MGF1) signatures verify', async () => {
    const w = await world();
    const pss = await pssVariant(w.leaves.unlisted!);
    const [s] = (await inspect(utf8(await signXml(INVOICE, { signer: pss })), 'x.xsig')).documents[0]!.payload.signatures;
    assert.equal(s!.verified, true, s!.reason ?? '');
    const bad = (await signXml(INVOICE, { signer: pss })).replace('<Total>10.00</Total>', '<Total>11.00</Total>');
    const [t] = (await inspect(utf8(bad), 'x.xsig')).documents[0]!.payload.signatures;
    assert.equal(t!.verified, false);
  });
});

describe('einvoice-trust-lists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'einvoice-trust-'));
  const run = async (argv: string[], deps: Parameters<typeof main>[2] & TrustListDeps = {}) => {
    const out: string[] = [];
    const errs: string[] = [];
    const io: IO = { stdout: (t) => out.push(t), stderr: (l) => errs.push(l), readStdin: async () => new Uint8Array() };
    const code = argv[0] === 'trust-lists' ? await trustMain(argv.slice(1), io, deps) : await main(argv, io, deps);
    return { code, stdout: out.join(''), stderr: errs.join('\n') };
  };

  test('update fetches, verifies and writes a snapshot; convert --eu-trust uses it', async () => {
    const w = await world();
    const file = join(dir, 'snap.json');
    const u = await run(['trust-lists', 'update', '--out', file], { fetch: w.fetch, now: NOW });
    assert.equal(u.code, EXIT.ok, u.stderr);
    assert.match(u.stdout, /1\/1 lists\t5 CA\/QC services/);
    assert.match(u.stderr, /not pinned/);
    assert.equal(parseSnapshot(readFileSync(file, 'utf8')).fetchedAt, NOW.toISOString());

    const inv = join(dir, 'signed.xml');
    const base = readFileSync(fixturePath('peppol-bis3-invoice.xml'), 'utf8').replace(/<\/Invoice>\s*$/, '<!--SIG--></Invoice>');
    writeFileSync(inv, await signXml(base, { signer: w.leaves.valid! }));
    const ok = await run(['convert', inv, `--eu-trust=${file}`], { now: NOW });
    assert.equal(ok.code, EXIT.ok, ok.stderr);
    const sig = JSON.parse(ok.stdout)[0].source.signatures[0];
    assert.equal(sig.euTrust.qualified, true);
    assert.equal(sig.trust, 'trusted');
    const noSnap = await run(['convert', inv, `--eu-trust=${join(dir, 'missing.json')}`]);
    assert.equal(noSnap.code, EXIT.usage);
    assert.match(noSnap.stderr, /trust-lists update/);
    const stale = await run(['convert', inv, `--eu-trust=${file}`], { now: new Date('2027-01-01T00:00:00Z') });
    assert.match(stale.stderr, /past its next update 2026-07-01/);
    const ignored = await run(['detect', inv, `--eu-trust=${file}`]);
    assert.match(ignored.stderr, /only applies to convert/);
  });

  test('update reuses the previous snapshot to pin the LOTL signer, and accepts --lotl-signer', async () => {
    const w = await world();
    const file = join(dir, 'pin.json');
    await run(['trust-lists', 'update', '--out', file], { fetch: w.fetch, now: NOW });
    const again = await run(['trust-lists', 'update', '--out', file], { fetch: w.fetch, now: NOW });
    assert.equal(again.code, EXIT.ok);
    assert.equal(parseSnapshot(readFileSync(file, 'utf8')).lotl.pinned, 'previous-snapshot');

    const pem = join(dir, 'lotl.pem');
    writeFileSync(pem, `-----BEGIN CERTIFICATE-----\n${b64(w.lotlSigner.der)}\n-----END CERTIFICATE-----\n`);
    const fresh = join(dir, 'pem.json');
    const given = await run(['trust-lists', 'update', '--out', fresh, '--lotl-signer', pem, '--lotl-url', LOTL_URL], {
      fetch: w.fetch,
      now: NOW,
    });
    assert.equal(given.code, EXIT.ok, given.stderr);
    assert.equal(parseSnapshot(readFileSync(fresh, 'utf8')).lotl.pinned, 'configured');
  });

  test('a LOTL that fails verification exits 2 and writes nothing; a missing subcommand is a usage error', async () => {
    const w = await world();
    w.serve.set(LOTL_URL, utf8(new TextDecoder().decode(w.serve.get(LOTL_URL) as Uint8Array).replace('Operator EU', 'Operator XX')));
    const file = join(dir, 'never.json');
    const r = await run(['trust-lists', 'update', '--out', file], { fetch: w.fetch });
    assert.equal(r.code, EXIT.unsafe);
    assert.match(r.stderr, /LOTL signature rejected/);
    assert.throws(() => readFileSync(file));
    const usage = await run(['trust-lists']);
    assert.equal(usage.code, EXIT.usage);
  });
});
