/**
 * ETSI TS 119 612 trusted lists: parsing, signature verification and the snapshot format.
 *
 * A snapshot holds the EU List of Trusted Lists (LOTL) and the national lists it points to, reduced to what
 * signer checking needs: the qualified CA/QC services (CA/QC service type), their certificates and the dated
 * history of their status. Nothing is invented: a service the list identifies without a certificate is counted
 * in `problems`, and a list whose own signature does not verify contributes no services.
 */
import { DOMParser, type Element as XElement } from '@xmldom/xmldom';

const TSL = 'http://uri.etsi.org/02231/v2#';
const TSL_ADD = 'http://uri.etsi.org/02231/v2/additionaltypes#';
const SVC_TYPE_CA_QC = 'http://uri.etsi.org/TrstSvc/Svctype/CA/QC';
const TSL_TYPE_LOTL = 'http://uri.etsi.org/TrstSvc/TrustedList/TSLType/EUlistofthelists';
export const LOTL_URL = 'https://ec.europa.eu/tools/lotl/eu-lotl.xml';
export const MIME_TSL_XML = 'application/vnd.etsi.tsl+xml';
const STATUS_BASE = 'http://uri.etsi.org/TrstSvc/TrustedList/Svcstatus/';

/** Status values under which a CA/QC service counts as qualified; the last three are the pre-eIDAS equivalents. */
const QUALIFIED_STATUSES = new Set(['granted', 'undersupervision', 'accredited']);
/** Pseudo status for a history entry whose service type was not CA/QC at that time. */
export const NOT_CA_QC = 'not-ca-qc';

export interface TrustService {
  provider: string;
  name: string;
  /** Base64 DER certificates of the service's digital identity (current and past). */
  certificates: string[];
  /** Status timeline in ascending order of `from` (ISO 8601); the last entry is the current status. Status is the last URI segment. */
  statuses: { status: string; from: string }[];
}

export interface TrustListInfo {
  territory: string;
  operator?: string;
  url: string;
  sequenceNumber?: number;
  issueDate?: string;
  nextUpdate?: string;
  /** loaded = signature verified against the certificates the LOTL publishes for this list. */
  status: 'loaded' | 'rejected' | 'unreachable';
  reason?: string;
  services: TrustService[];
}

export interface TrustSnapshot {
  version: 1;
  /** When the lists were fetched (ISO 8601). */
  fetchedAt: string;
  lotl: {
    url: string;
    sequenceNumber?: number;
    issueDate?: string;
    nextUpdate?: string;
    /** Base64 DER certificates the LOTL signature was checked against. */
    signers: string[];
    /** How the LOTL signer was pinned: given by the caller, taken from the previous snapshot, or first use (trusting the certificate the list carries). */
    pinned: 'configured' | 'previous-snapshot' | 'first-use';
  };
  lists: TrustListInfo[];
  problems: string[];
}

export interface Pointer {
  location: string;
  territory?: string;
  mime?: string;
  /** Base64 DER certificates the pointed-to list must be signed with. */
  signers: string[];
}

export interface ParsedList {
  isLotl: boolean;
  territory: string;
  operator?: string;
  sequenceNumber?: number;
  issueDate?: string;
  nextUpdate?: string;
  pointers: Pointer[];
  services: TrustService[];
  /** Services of the CA/QC type that carry no X509Certificate identity (only a subject name or key id). */
  withoutCertificate: number;
}

// --- XML helpers -------------------------------------------------------------

function kids(el: XElement | null | undefined, local: string, ns = TSL): XElement[] {
  const out: XElement[] = [];
  for (let c = el?.firstChild ?? null; c; c = c.nextSibling)
    if (c.nodeType === 1 && (c as XElement).localName === local && (c as XElement).namespaceURI === ns) out.push(c as XElement);
  return out;
}
const kid = (el: XElement | null | undefined, local: string, ns = TSL) => kids(el, local, ns)[0] ?? null;
const text = (el: XElement | null | undefined) => el?.textContent?.trim() || undefined;

/** First <Name> in the list, preferring English. */
function localizedName(parent: XElement | null): string | undefined {
  const names = kids(parent, 'Name');
  const en = names.find((n) => /^en/i.test(n.getAttribute('xml:lang') ?? ''));
  return text(en ?? names[0]);
}

function iso(s: string | undefined): string | undefined {
  const t = s ? Date.parse(s) : Number.NaN;
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

const certsOf = (identity: XElement | null) =>
  kids(identity, 'DigitalId')
    .map((d) => text(kid(d, 'X509Certificate'))?.replace(/\s+/g, ''))
    .filter((c): c is string => !!c);

const shortStatus = (uri: string | undefined) => (uri?.startsWith(STATUS_BASE) ? uri.slice(STATUS_BASE.length) : (uri ?? 'unknown'));

// --- parsing -----------------------------------------------------------------

/** Parses a trusted list (or the LOTL). Throws if the document is not a trusted list. Does not check the signature. */
export function parseTrustedList(xml: string): ParsedList {
  const doc = new DOMParser({
    onError: (level: string, msg: string) => {
      if (level !== 'warning') throw new Error(msg);
    },
  }).parseFromString(xml, 'text/xml');
  const root = doc.documentElement;
  if (!root || root.localName !== 'TrustServiceStatusList' || root.namespaceURI !== TSL)
    throw new Error('not a trusted list (root element is not TrustServiceStatusList)');
  const info = kid(root, 'SchemeInformation');
  const territory = text(kid(info, 'SchemeTerritory')) ?? '';
  const num = Number(text(kid(info, 'TSLSequenceNumber')));

  const pointers: Pointer[] = [];
  for (const p of kids(kid(info, 'PointersToOtherTSL'), 'OtherTSLPointer')) {
    const location = text(kid(p, 'TSLLocation'));
    if (!location) continue;
    const other = kids(kid(p, 'AdditionalInformation'), 'OtherInformation');
    const mime = text(kid(other.find((o) => kid(o, 'MimeType', TSL_ADD)) ?? null, 'MimeType', TSL_ADD));
    const terr = text(kid(other.find((o) => kid(o, 'SchemeTerritory')) ?? null, 'SchemeTerritory'));
    const signers = kids(kid(p, 'ServiceDigitalIdentities'), 'ServiceDigitalIdentity').flatMap(certsOf);
    pointers.push({ location, territory: terr, mime, signers });
  }

  const services: TrustService[] = [];
  let withoutCertificate = 0;
  for (const tsp of kids(kid(root, 'TrustServiceProviderList'), 'TrustServiceProvider')) {
    const provider = localizedName(kid(kid(tsp, 'TSPInformation'), 'TSPName')) ?? '';
    for (const svc of kids(kid(tsp, 'TSPServices'), 'TSPService')) {
      const instances = [kid(svc, 'ServiceInformation'), ...kids(kid(svc, 'ServiceHistory'), 'ServiceHistoryInstance')].filter(
        (i): i is XElement => !!i,
      );
      if (!instances.some((i) => text(kid(i, 'ServiceTypeIdentifier')) === SVC_TYPE_CA_QC)) continue;
      const current = instances[0]!;
      const certificates = new Set<string>();
      const statuses: { status: string; from: string }[] = [];
      for (const i of instances) {
        for (const c of certsOf(kid(i, 'ServiceDigitalIdentity'))) certificates.add(c);
        const from = iso(text(kid(i, 'StatusStartingTime')));
        if (!from) continue;
        const isQc = text(kid(i, 'ServiceTypeIdentifier')) === SVC_TYPE_CA_QC;
        statuses.push({ status: isQc ? shortStatus(text(kid(i, 'ServiceStatus'))) : NOT_CA_QC, from });
      }
      if (certificates.size === 0) {
        withoutCertificate++;
        continue;
      }
      statuses.sort((a, b) => a.from.localeCompare(b.from));
      services.push({
        provider,
        name: localizedName(kid(current, 'ServiceName')) ?? '',
        certificates: [...certificates],
        statuses,
      });
    }
  }

  return {
    isLotl: text(kid(info, 'TSLType')) === TSL_TYPE_LOTL,
    territory,
    operator: localizedName(kid(info, 'SchemeOperatorName')),
    sequenceNumber: Number.isFinite(num) && text(kid(info, 'TSLSequenceNumber')) ? num : undefined,
    issueDate: iso(text(kid(info, 'ListIssueDateTime'))),
    nextUpdate: iso(text(kid(kid(info, 'NextUpdate'), 'dateTime'))),
    pointers,
    services,
    withoutCertificate,
  };
}

// --- signature ---------------------------------------------------------------

export const b64ToBytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const bytesToB64 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
export const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

// --- snapshot helpers --------------------------------------------------------

/** Reads a snapshot file, rejecting anything that is not a version 1 snapshot. */
export function parseSnapshot(json: string): TrustSnapshot {
  const v = JSON.parse(json) as Partial<TrustSnapshot>;
  if (!v || v.version !== 1 || typeof v.fetchedAt !== 'string' || !v.lotl || !Array.isArray(v.lists))
    throw new Error('not an EU trust-list snapshot (version 1)');
  return v as TrustSnapshot;
}

/** Earliest next-update date among the LOTL and the lists that were loaded. */
export function snapshotNextUpdate(s: TrustSnapshot): string | undefined {
  const dates = [s.lotl.nextUpdate, ...s.lists.filter((l) => l.status === 'loaded').map((l) => l.nextUpdate)].filter(
    (d): d is string => !!d,
  );
  return dates.sort()[0];
}

export function isQualifiedStatus(status: string | undefined): boolean {
  return status !== undefined && QUALIFIED_STATUSES.has(status);
}

/** Status of a service at `at`: the last timeline entry that started on or before it; undefined before the first. */
export function statusAt(service: TrustService, at: Date): { status: string; from: string } | undefined {
  let found: { status: string; from: string } | undefined;
  for (const s of service.statuses) if (Date.parse(s.from) <= at.getTime()) found = s;
  return found;
}

/**
 * Certificates of the snapshot's CA/QC services, as DER, for use as `trustAnchors`. With `at`, only services that
 * were qualified at that time; without it, those that are qualified now (by the last status in their history).
 * `trustAnchors` does not check the status at signing time per signature; the `euTrust` option does.
 */
export function trustAnchorsFromSnapshot(snapshot: TrustSnapshot, at?: Date): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (const list of snapshot.lists)
    for (const svc of list.services) {
      const st = at ? statusAt(svc, at) : svc.statuses[svc.statuses.length - 1];
      if (isQualifiedStatus(st?.status)) for (const c of svc.certificates) out.push(b64ToBytes(c));
    }
  return out;
}
