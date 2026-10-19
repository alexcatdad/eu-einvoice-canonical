/** Loads only the published EU trust snapshot; acquisition and updates are separate maintenance operations. */
import { parseSnapshot, type TrustSnapshot } from '../src/index.js';

export interface SiteTrust {
  snapshot: TrustSnapshot;
}

const PUBLISHED = 'eu-trust-snapshot.json';

export async function loadSiteTrust(): Promise<SiteTrust> {
  const res = await fetch(PUBLISHED);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { snapshot: parseSnapshot(await res.text()) };
}
