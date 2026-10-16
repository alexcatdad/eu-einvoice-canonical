/** Loads the EU trusted lists for the browser page: live when the servers allow it, else the snapshot published with the site. */
import { loadTrustLists, parseSnapshot, type TrustSnapshot } from '../src/index.js';
import { t } from './i18n.js';

export interface SiteTrust {
  snapshot: TrustSnapshot;
  source: 'live' | 'published';
  /** Why the published snapshot is used, when it is. */
  note?: string;
}

const PUBLISHED = 'eu-trust-snapshot.json';

async function published(): Promise<TrustSnapshot> {
  const res = await fetch(PUBLISHED);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseSnapshot(await res.text());
}

export async function loadSiteTrust(): Promise<SiteTrust> {
  let pinned: TrustSnapshot | undefined;
  let publishedError: string | undefined;
  try {
    pinned = await published();
  } catch (e) {
    publishedError = (e as Error).message;
  }
  try {
    // The LOTL signer is pinned from the published snapshot, so a live list is held to the same signer.
    const live = await loadTrustLists({ previous: pinned });
    const missing = live.lists.filter((l) => l.status !== 'loaded');
    if (missing.length === 0) return { snapshot: live, source: 'live' };
    if (!pinned)
      return {
        snapshot: live,
        source: 'live',
        note: t('trust.noteSome', { count: missing.length, list: missing.map((l) => l.territory).join(', ') }),
      };
    return {
      snapshot: pinned,
      source: 'published',
      note: t('trust.noteFallback', { count: missing.length, total: live.lists.length }),
    };
  } catch (e) {
    if (!pinned) throw new Error(t('trust.errNoSnapshot', { reason: (e as Error).message, published: publishedError ?? '' }));
    return {
      snapshot: pinned,
      source: 'published',
      note: t('trust.noteUnreachable', { reason: (e as Error).message }),
    };
  }
}
