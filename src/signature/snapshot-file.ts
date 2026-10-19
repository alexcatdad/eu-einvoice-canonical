/** Local snapshot location shared by conversion and the separate maintenance command. */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/** Where a snapshot lives when no file is named: $EINVOICE_TRUST_SNAPSHOT, the user's cache, then the repository copy. */
export function snapshotPath(given?: string): string {
  if (given) return resolve(given);
  const user = process.env.EINVOICE_TRUST_SNAPSHOT || join(homedir(), '.einvoice', 'eu-trust-snapshot.json');
  const repo = join(import.meta.dir, '..', '..', 'trust', 'eu-trust-snapshot.json');
  return existsSync(user) || !existsSync(repo) ? resolve(user) : repo;
}
