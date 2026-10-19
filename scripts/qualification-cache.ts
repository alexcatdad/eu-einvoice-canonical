/** Private CI cache only; public distributions still use validation/distribution.json. */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { unzipSync, zipSync } from 'fflate';
import { loadDistribution } from './validation-distribution.js';

const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const safe = (path: string) => path.split('/').every((part) => part && part !== '.' && part !== '..' && !part.includes('\\'));

function files(directory: string, prefix = ''): string[] {
  if (lstatSync(directory).isSymbolicLink()) throw new Error(`Unsafe cache input: ${directory}`);
  return readdirSync(directory)
    .sort()
    .flatMap((name) => {
      const path = join(directory, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error(`Unsafe cache input: ${path}`);
      return stat.isDirectory() ? files(path, `${prefix}${name}/`) : [`${prefix}${name}`];
    });
}

function runtime(): string {
  const node = Bun.spawnSync(['node', '--version']);
  if (node.exitCode !== 0) throw new Error('Node compiler runtime unavailable');
  return `${process.platform}/${process.arch}/bun-${Bun.version}/node-${node.stdout.toString().trim()}`;
}

export function qualificationCacheKey(root: string, engines = runtime()): string {
  const inputs = [
    'bun.lock',
    'package.json',
    'src/hash.ts',
    'validation/local-source-pins.json',
    'validation/distribution.json',
    'validation/NOTICE',
    ...files(join(root, 'scripts')).map((name) => `scripts/${name}`),
    ...files(join(root, 'validation/licenses')).map((name) => `validation/licenses/${name}`),
  ].sort();
  const hash = createHash('sha256').update(`qualification-v1\0${engines}\0`);
  for (const input of inputs) hash.update(`${input}\0${digest(readFileSync(join(root, input)))}\0`);
  return hash.digest('hex');
}

function heldIds(root: string): string[] {
  const policy = loadDistribution(root);
  return Object.keys(policy.bundles)
    .filter((id) => !policy.bundles[id].publish)
    .sort();
}

function verifyEntries(root: string, entries: Record<string, Uint8Array>): void {
  const expected = new Set<string>();
  const pins = JSON.parse(readFileSync(join(root, 'validation/local-source-pins.json'), 'utf8'));
  for (const id of heldIds(root)) {
    const name = `${id}/manifest.json`;
    if (!entries[name]) throw new Error(`Missing cached manifest: ${id}`);
    const manifest = JSON.parse(new TextDecoder().decode(entries[name]));
    if (manifest.id !== id || !Array.isArray(manifest.files) || !manifest.files.length || !manifest.source?.length)
      throw new Error(`Invalid cached manifest: ${id}`);
    expected.add(name);
    for (const source of manifest.source) {
      // Archive members have their own recipe hashes; the enclosing download must be pinned too.
      const parent = source.url.split('#')[0];
      if (
        !/^[a-f0-9]{64}$/.test(source.sha256) ||
        !manifest.source.some((s: { url: string; sha256: string }) => s.url === parent && pins[parent] === s.sha256)
      )
        throw new Error(`Cached source pin changed: ${id}`);
    }
    for (const file of manifest.files) {
      if (typeof file.path !== 'string' || !safe(file.path)) throw new Error(`Unsafe cached file: ${id}`);
      const path = `${id}/${file.path}`;
      if (expected.has(path)) throw new Error(`Duplicate cached file: ${path}`);
      expected.add(path);
      const bytes = entries[path];
      if (!bytes || bytes.length !== file.bytes || digest(bytes) !== file.sha256) throw new Error(`Cached file hash changed: ${path}`);
    }
  }
  if (Object.keys(entries).some((name) => !safe(name) || !expected.has(name))) throw new Error('Unlisted or distributable cache entry');
}

function readCache(root: string, directory: string, key: string): Record<string, Uint8Array> | undefined {
  const metadataPath = join(directory, 'cache.json');
  if (!existsSync(metadataPath)) return undefined;
  if (!lstatSync(metadataPath).isFile() || lstatSync(metadataPath).isSymbolicLink()) throw new Error('Unsafe cache metadata');
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
  if (metadata.version !== 1 || metadata.key !== key) return undefined;
  const archivePath = join(directory, 'qualification.zip');
  if (!lstatSync(archivePath).isFile() || lstatSync(archivePath).isSymbolicLink()) throw new Error('Unsafe qualification archive');
  const archive = readFileSync(archivePath);
  if (digest(archive) !== metadata.sha256) throw new Error('Qualification archive hash changed');
  let size = 0;
  const entries = unzipSync(archive, {
    filter: (entry) => {
      size += entry.originalSize;
      if (!safe(entry.name) || size > 512 * 1024 * 1024) throw new Error('Unsafe qualification archive entry');
      return true;
    },
  });
  verifyEntries(root, entries);
  return entries;
}

export function restoreQualificationCache(root: string, directory: string, engines?: string): boolean {
  const entries = readCache(root, directory, qualificationCacheKey(root, engines));
  if (!entries) return false;
  // Validate the entire archive before changing ignored qualification inputs; approved bundles are untouched.
  for (const id of heldIds(root)) rmSync(join(root, 'validation/bundles', id), { recursive: true, force: true });
  for (const [path, bytes] of Object.entries(entries)) {
    const target = join(root, 'validation/bundles', path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  return true;
}

export function packQualificationCache(root: string, directory: string, engines?: string): boolean {
  const key = qualificationCacheKey(root, engines);
  const entries: Record<string, Uint8Array> = {};
  for (const id of heldIds(root))
    for (const path of files(join(root, 'validation/bundles', id)))
      entries[`${id}/${path}`] = readFileSync(join(root, 'validation/bundles', id, path));
  verifyEntries(root, entries);
  // Weekly acquisition/qualification still runs; unchanged inputs do not accumulate binary Git revisions.
  if (readCache(root, directory, key)) return false;
  const archive = zipSync(entries, { level: 6 });
  if (archive.length > 90 * 1024 * 1024) throw new Error('Qualification cache exceeds the private Git blob budget');
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'qualification.zip'), archive);
  writeFileSync(join(directory, 'cache.json'), `${JSON.stringify({ version: 1, key, sha256: digest(archive) }, null, 2)}\n`);
  return true;
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, '..');
  const directory = process.argv[3] && resolve(process.argv[3]);
  if (process.argv[2] === 'key') console.log(qualificationCacheKey(root));
  else if (process.argv[2] === 'pack' && directory)
    console.log(packQualificationCache(root, directory) ? 'Private cache packed.' : 'Verified cache already current.');
  else if (process.argv[2] === 'restore' && directory) {
    const hit = restoreQualificationCache(root, directory);
    console.log(hit ? 'Private qualification cache verified and restored.' : 'Private cache miss; pinned acquisition is required.');
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `hit=${hit}\n`);
  } else throw new Error('Usage: qualification-cache.ts key | pack DIRECTORY | restore DIRECTORY');
}
