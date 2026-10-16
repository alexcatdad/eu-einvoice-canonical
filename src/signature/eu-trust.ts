/**
 * Trust assessment of a signer: caller-supplied anchors and/or an EU trusted-list snapshot.
 *
 * With a snapshot, the signer's chain is built up to a certificate of a CA/QC service in the lists, and that
 * service's status is read at the signing time from its history: a service withdrawn after the signature was
 * made still counts, one withdrawn (or not yet granted) before does not. Revocation of the signer's own
 * certificate (CRL/OCSP) is not checked.
 */
import type * as pkijs from 'pkijs';
import type { SignatureInfo } from '../canonical.js';
import { evaluateTrust, parseCertificate } from './trust.js';
import {
  b64ToBytes,
  isQualifiedStatus,
  snapshotNextUpdate,
  statusAt,
  type TrustListInfo,
  type TrustService,
  type TrustSnapshot,
} from './tsl.js';

type EuTrust = NonNullable<SignatureInfo['euTrust']>;

interface IndexEntry {
  cert: pkijs.Certificate;
  service: TrustService;
  list: TrustListInfo;
}

const indexes = new WeakMap<TrustSnapshot, Map<string, IndexEntry[]>>();
const MAX_CANDIDATES = 24;

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');
const nameKey = (n: pkijs.RelativeDistinguishedNames) => hex(n.toSchema().toBER());

/** Service certificates by subject name, parsed once per snapshot. */
function indexOf(snapshot: TrustSnapshot): Map<string, IndexEntry[]> {
  let idx = indexes.get(snapshot);
  if (idx) return idx;
  idx = new Map();
  for (const list of snapshot.lists)
    if (list.status === 'loaded')
      for (const service of list.services)
        for (const c of service.certificates) {
          let cert: pkijs.Certificate | null = null;
          try {
            cert = parseCertificate(b64ToBytes(c));
          } catch {
            /* malformed entry in the snapshot: skipped */
          }
          if (!cert) continue;
          const k = nameKey(cert.subject);
          idx.set(k, [...(idx.get(k) ?? []), { cert, service, list }]);
        }
  indexes.set(snapshot, idx);
  return idx;
}

export interface TrustContext {
  euTrust?: TrustSnapshot;
  now?: Date;
}

/** Sets `trust`, `trustReason` and `euTrust` on a cryptographically valid signature. `signedAt` is undefined when the signature carries no signing time. */
export async function assessTrust(
  info: SignatureInfo,
  signer: pkijs.Certificate,
  others: pkijs.Certificate[],
  anchors: pkijs.Certificate[],
  signedAt: Date | undefined,
  ctx: TrustContext,
): Promise<void> {
  const now = ctx.now ?? new Date();
  const own = await evaluateTrust(signer, others, anchors, signedAt ?? now);
  if (!ctx.euTrust) {
    info.trust = own.trust;
    if (own.reason) info.trustReason = own.reason;
    return;
  }
  const eu = await evaluateEu(signer, others, ctx.euTrust, signedAt, now);
  info.euTrust = eu;
  if (own.trust === 'trusted' || eu.qualified) info.trust = 'trusted';
  else {
    info.trust = 'untrusted';
    info.trustReason = [own.trust === 'untrusted' ? own.reason : undefined, eu.reason].filter(Boolean).join('; ');
  }
}

export async function evaluateEu(
  signer: pkijs.Certificate,
  others: pkijs.Certificate[],
  snapshot: TrustSnapshot,
  signedAt: Date | undefined,
  now: Date,
): Promise<EuTrust> {
  const at = signedAt ?? now;
  const nextUpdate = snapshotNextUpdate(snapshot);
  const base = {
    evaluatedAt: at.toISOString(),
    signingTimeKnown: !!signedAt,
    snapshot: {
      fetchedAt: snapshot.fetchedAt,
      ...(nextUpdate ? { nextUpdate } : {}),
      stale: !!nextUpdate && Date.parse(nextUpdate) < now.getTime(),
    },
  };
  const idx = indexOf(snapshot);
  const path = [signer, ...others.filter((c) => c !== signer)];
  const seen = new Set<IndexEntry>();
  const candidates: IndexEntry[] = [];
  for (const c of path)
    for (const key of [nameKey(c.subject), nameKey(c.issuer)])
      for (const e of idx.get(key) ?? []) if (!seen.has(e)) seen.add(e), candidates.push(e);

  let best: { entry: IndexEntry; at: { status: string; from: string } } | undefined;
  let chainReason: string | undefined;
  for (const entry of candidates.slice(0, MAX_CANDIDATES)) {
    const r = await evaluateTrust(signer, others, [entry.cert], at);
    if (r.trust !== 'trusted') {
      chainReason ??= r.reason;
      continue;
    }
    const st = statusAt(entry.service, at);
    if (st && isQualifiedStatus(st.status)) {
      best = { entry, at: st };
      break;
    }
    // Remember the first chain that validates but was not qualified at that time, in case no other service is.
    best ??= { entry, at: st ?? { status: 'not-yet-listed', from: '' } };
  }

  if (!best) {
    return {
      ...base,
      qualified: false,
      status: 'not-listed',
      reason: candidates.length
        ? `the certificate chain does not validate to a listed qualified service${chainReason ? ` (${chainReason})` : ''}`
        : 'the signer does not chain to any qualified CA/QC service in the EU trusted lists',
    };
  }
  const { entry, at: st } = best;
  const last = entry.service.statuses[entry.service.statuses.length - 1]!;
  const service = {
    provider: entry.service.provider,
    name: entry.service.name,
    territory: entry.list.territory,
    statusAtSigning: st.status,
    currentStatus: last.status,
    statusFrom: st.from,
  };
  if (isQualifiedStatus(st.status)) return { ...base, qualified: true, status: 'qualified', service };
  const when = signedAt ? 'at signing time' : 'now';
  return {
    ...base,
    qualified: false,
    status: 'not-qualified',
    service,
    reason:
      st.status === 'not-yet-listed'
        ? `the issuing service "${service.name}" was not listed ${when} (${at.toISOString().slice(0, 10)})`
        : `the issuing service "${service.name}" had status "${st.status}" ${when} (${at.toISOString().slice(0, 10)})`,
  };
}
