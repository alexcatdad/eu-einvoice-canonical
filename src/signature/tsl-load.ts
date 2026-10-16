/**
 * Loads the EU List of Trusted Lists and the national lists it points to into a TrustSnapshot.
 *
 * Each list is accepted only when its own XML signature verifies (the XMLDSig code in xmldsig.ts) and was made
 * with a certificate pinned for it: the national lists with the certificates the LOTL publishes in its pointers,
 * the LOTL with the signer certificates passed in, those of the previous snapshot, or (first use) the certificate it
 * carries. Rejected or unreachable lists are recorded and contribute no services.
 */
import type { SignatureInfo } from '../canonical.js';
import { parseAnchors, type TrustAnchor } from './trust.js';
import {
  b64ToBytes,
  bytesToB64,
  LOTL_URL,
  MIME_TSL_XML,
  type ParsedList,
  parseTrustedList,
  sameBytes,
  type TrustListInfo,
  type TrustSnapshot,
} from './tsl.js';
import { verifyXmlSignatures } from './xmldsig.js';

export interface LoadOptions {
  /** Returns the bytes at a URL. Default: global fetch with a timeout and a size cap. */
  fetch?: (url: string) => Promise<Uint8Array>;
  lotlUrl?: string;
  /** Certificates (DER, base64 or PEM) the LOTL must be signed with, e.g. those published in the Official Journal. */
  lotlSigners?: TrustAnchor[];
  /** Snapshot whose LOTL signers are reused when `lotlSigners` is not given. */
  previous?: TrustSnapshot;
  now?: Date;
  /** Lists fetched at the same time. Default 6. */
  concurrency?: number;
}

export interface ListSignatureResult {
  ok: boolean;
  reason?: string;
  /** DER of the certificate the list is signed with, when a signature verified cryptographically. */
  signer?: Uint8Array;
}

/**
 * The list must carry an XMLDSig signature over the whole document that verifies, made with one of the
 * `pinned` certificates (compared byte for byte). With `pinned` undefined the signer is only reported.
 */
export async function verifyListSignature(xml: string, pinned: string[] | undefined): Promise<ListSignatureResult> {
  const signers: Uint8Array[] = [];
  const sigs = await verifyXmlSignatures(xml, { onSigner: (_i: SignatureInfo, der: Uint8Array) => signers.push(der) });
  if (!sigs.some((s) => s.verified === true)) {
    const why = sigs.map((s) => s.reason).find(Boolean);
    return {
      ok: false,
      reason: sigs.length === 0 ? 'the list carries no XML signature' : `signature does not verify${why ? `: ${why}` : ''}`,
    };
  }
  if (!pinned) return { ok: true, signer: signers[0] };
  const pins = pinned.flatMap((p) => {
    try {
      return [b64ToBytes(p)];
    } catch {
      return [];
    }
  });
  const match = signers.find((s) => pins.some((p) => sameBytes(p, s)));
  if (!match)
    return {
      ok: false,
      reason: 'the signature is valid but was made with a certificate that is not published as the signer of this list',
      signer: signers[0],
    };
  return { ok: true, signer: match };
}

const MAX_LIST_BYTES = 64 * 1024 * 1024;

async function defaultFetch(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000), redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > MAX_LIST_BYTES) throw new Error('response is larger than 64 MB');
  return buf;
}

const decode = (b: Uint8Array) => new TextDecoder('utf-8').decode(b).replace(/^﻿/, '');

/** Thrown when the LOTL itself cannot be fetched, parsed or verified: there is nothing to build a snapshot from. */
export class LotlError extends Error {}

export async function loadTrustLists(opts: LoadOptions = {}): Promise<TrustSnapshot> {
  const get = opts.fetch ?? defaultFetch;
  const lotlUrl = opts.lotlUrl ?? LOTL_URL;
  const now = opts.now ?? new Date();
  const problems: string[] = [];

  let lotl: ParsedList;
  let lotlXml: string;
  try {
    lotlXml = decode(await get(lotlUrl));
    lotl = parseTrustedList(lotlXml);
  } catch (e) {
    throw new LotlError(`LOTL ${lotlUrl} could not be loaded: ${(e as Error).message}`);
  }
  if (!lotl.isLotl) throw new LotlError(`${lotlUrl} is not the list of trusted lists (TSLType is not EUlistofthelists)`);

  let pinned: string[] | undefined;
  let how: TrustSnapshot['lotl']['pinned'] = 'first-use';
  const given = parseAnchors(opts.lotlSigners);
  if (given.length) {
    pinned = given.map((c) => bytesToB64(new Uint8Array(c.toSchema(true).toBER())));
    how = 'configured';
  } else if (opts.previous?.lotl.signers.length) {
    pinned = opts.previous.lotl.signers;
    how = 'previous-snapshot';
  }
  const sig = await verifyListSignature(lotlXml, pinned);
  if (!sig.ok) throw new LotlError(`LOTL signature rejected: ${sig.reason}`);
  const lotlSigners = pinned ?? [bytesToB64(sig.signer!)];
  if (how === 'first-use')
    problems.push(
      'The LOTL signer certificate was not pinned: the certificate carried in the list was trusted on first use. Pass --lotl-signer with the certificate published in the Official Journal to pin it.',
    );

  const pointers = lotl.pointers.filter((p) => (p.mime ?? MIME_TSL_XML) === MIME_TSL_XML && p.location !== lotlUrl && p.territory);
  const lists: TrustListInfo[] = new Array(pointers.length);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < pointers.length; i = next++) {
      const p = pointers[i]!;
      const info: TrustListInfo = { territory: p.territory!, url: p.location, status: 'unreachable', services: [] };
      lists[i] = info;
      let xml: string;
      try {
        xml = decode(await get(p.location));
      } catch (e) {
        info.reason = `could not be fetched: ${(e as Error).message}`;
        continue;
      }
      try {
        const parsed = parseTrustedList(xml);
        info.operator = parsed.operator;
        info.sequenceNumber = parsed.sequenceNumber;
        info.issueDate = parsed.issueDate;
        info.nextUpdate = parsed.nextUpdate;
        const ok = await verifyListSignature(xml, p.signers);
        if (!ok.ok) {
          info.status = 'rejected';
          info.reason = ok.reason;
          continue;
        }
        info.status = 'loaded';
        info.services = parsed.services;
        if (parsed.withoutCertificate)
          problems.push(`${p.territory}: ${parsed.withoutCertificate} CA/QC service(s) identified without a certificate were left out`);
      } catch (e) {
        info.status = 'rejected';
        info.reason = `unreadable: ${(e as Error).message}`;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? 6, pointers.length)) }, worker));
  for (const l of lists) if (l.status !== 'loaded') problems.push(`${l.territory}: list ${l.status}: ${l.reason}`);

  return {
    version: 1,
    fetchedAt: now.toISOString(),
    lotl: {
      url: lotlUrl,
      sequenceNumber: lotl.sequenceNumber,
      issueDate: lotl.issueDate,
      nextUpdate: lotl.nextUpdate,
      signers: lotlSigners,
      pinned: how,
    },
    lists,
    problems,
  };
}
