import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync, zipSync } from 'fflate';
import { packQualificationCache, qualificationCacheKey, restoreQualificationCache } from '../scripts/qualification-cache.js';

const temporary: string[] = [];
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
afterEach(() => {
  for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'qualification-cache-'));
  temporary.push(root);
  for (const dir of ['scripts', 'src', 'validation/licenses', 'validation/bundles/approved', 'validation/bundles/held'])
    mkdirSync(join(root, dir), { recursive: true });
  for (const file of ['bun.lock', 'package.json', 'src/hash.ts', 'scripts/spec.ts']) writeFileSync(join(root, file), 'synthetic input');
  writeFileSync(join(root, 'validation/NOTICE'), 'Synthetic notice');
  writeFileSync(join(root, 'validation/licenses/LICENSE.txt'), 'Synthetic license');
  const xml = '<synthetic/>';
  const url = 'https://example.test/schema.xsd';
  writeFileSync(join(root, 'validation/local-source-pins.json'), JSON.stringify({ [url]: hash(xml) }));
  writeFileSync(join(root, 'validation/bundles/held/schema.xsd'), xml);
  writeFileSync(
    join(root, 'validation/bundles/held/manifest.json'),
    JSON.stringify({
      id: 'held',
      source: [{ url, sha256: hash(xml) }],
      files: [{ path: 'schema.xsd', bytes: xml.length, sha256: hash(xml) }],
    }),
  );
  writeFileSync(join(root, 'validation/bundles/approved/keep.txt'), 'approved sentinel');
  writeFileSync(
    join(root, 'validation/distribution.json'),
    JSON.stringify({
      version: 1,
      noticeSha256: hash('Synthetic notice'),
      licenseFiles: { 'LICENSE.txt': hash('Synthetic license') },
      bundles: {
        approved: { publish: true, basis: 'Synthetic permission', evidence: [url], manifestSha256: hash('approved') },
        held: { publish: false, basis: 'Local qualification only', evidence: [] },
      },
    }),
  );
  const cache = join(root, 'private');
  packQualificationCache(root, cache, 'test-runtime');
  return { root, cache };
}

function alterArchive(cache: string, mutate: (entries: Record<string, Uint8Array>) => void) {
  const path = join(cache, 'qualification.zip');
  const entries = unzipSync(readFileSync(path));
  mutate(entries);
  const archive = zipSync(entries);
  writeFileSync(path, archive);
  const metadata = JSON.parse(readFileSync(join(cache, 'cache.json'), 'utf8'));
  writeFileSync(join(cache, 'cache.json'), JSON.stringify({ ...metadata, sha256: hash(archive) }));
}

test('private cache restores only held bundles and removes stale held files', () => {
  const { root, cache } = fixture();
  writeFileSync(join(root, 'validation/bundles/held/stale'), 'stale');
  expect(restoreQualificationCache(root, cache, 'test-runtime')).toBe(true);
  expect(existsSync(join(root, 'validation/bundles/held/stale'))).toBe(false);
  expect(readFileSync(join(root, 'validation/bundles/held/schema.xsd'), 'utf8')).toBe('<synthetic/>');
  expect(readFileSync(join(root, 'validation/bundles/approved/keep.txt'), 'utf8')).toBe('approved sentinel');
});

test('unchanged weekly refresh verifies existing cache without binary Git churn', () => {
  const { root, cache } = fixture();
  const before = readFileSync(join(cache, 'qualification.zip'));
  expect(packQualificationCache(root, cache, 'test-runtime')).toBe(false);
  expect(readFileSync(join(cache, 'qualification.zip'))).toEqual(before);
});

test('source pins, recipes, dependencies, license policy and runtimes invalidate the cache', () => {
  const { root, cache } = fixture();
  const before = qualificationCacheKey(root, 'test-runtime');
  for (const file of [
    'bun.lock',
    'package.json',
    'scripts/spec.ts',
    'src/hash.ts',
    'validation/local-source-pins.json',
    'validation/distribution.json',
    'validation/NOTICE',
    'validation/licenses/LICENSE.txt',
  ]) {
    const path = join(root, file);
    const original = readFileSync(path);
    writeFileSync(path, Buffer.concat([original, Buffer.from('\n')]));
    expect(qualificationCacheKey(root, 'test-runtime')).not.toBe(before);
    expect(restoreQualificationCache(root, cache, 'test-runtime')).toBe(false);
    writeFileSync(path, original);
  }
  expect(restoreQualificationCache(root, cache, 'different-runtime')).toBe(false);
});

test('a missing private cache is a miss, not successful qualification', () => {
  const { root } = fixture();
  expect(restoreQualificationCache(root, join(root, 'absent'), 'test-runtime')).toBe(false);
});

test('corrupt archive is rejected before modifying qualification inputs', () => {
  const { root, cache } = fixture();
  writeFileSync(join(cache, 'qualification.zip'), 'corrupt');
  expect(() => restoreQualificationCache(root, cache, 'test-runtime')).toThrow('archive hash changed');
  expect(readFileSync(join(root, 'validation/bundles/held/schema.xsd'), 'utf8')).toBe('<synthetic/>');
});

for (const bad of ['changed file', 'missing file', 'public bundle', 'path traversal', 'source pin', 'missing manifest']) {
  test(`private cache rejects ${bad} despite a matching archive checksum`, () => {
    const { root, cache } = fixture();
    alterArchive(cache, (entries) => {
      if (bad === 'changed file') entries['held/schema.xsd'] = Buffer.from('changed');
      if (bad === 'missing file') delete entries['held/schema.xsd'];
      if (bad === 'public bundle') entries['approved/keep.txt'] = Buffer.from('overwrite');
      if (bad === 'path traversal') entries['../escaped'] = Buffer.from('escape');
      if (bad === 'missing manifest') delete entries['held/manifest.json'];
      if (bad === 'source pin') {
        const manifest = JSON.parse(new TextDecoder().decode(entries['held/manifest.json']));
        manifest.source[0].sha256 = hash('different source');
        entries['held/manifest.json'] = Buffer.from(JSON.stringify(manifest));
      }
    });
    expect(() => restoreQualificationCache(root, cache, 'test-runtime')).toThrow();
    expect(readFileSync(join(root, 'validation/bundles/approved/keep.txt'), 'utf8')).toBe('approved sentinel');
    expect(readFileSync(join(root, 'validation/bundles/held/schema.xsd'), 'utf8')).toBe('<synthetic/>');
  });
}

test('symlinks cannot enter the private cache', () => {
  const { root, cache } = fixture();
  symlinkSync(join(root, 'package.json'), join(root, 'validation/bundles/held/linked'));
  expect(() => packQualificationCache(root, cache, 'test-runtime')).toThrow('Unsafe cache input');
});

test('cache metadata cannot be a symlink', () => {
  const { root, cache } = fixture();
  rmSync(join(cache, 'cache.json'));
  symlinkSync(join(root, 'package.json'), join(cache, 'cache.json'));
  expect(() => restoreQualificationCache(root, cache, 'test-runtime')).toThrow('Unsafe cache metadata');
});

test('a bundle root cannot be a symlink', () => {
  const { root, cache } = fixture();
  rmSync(join(root, 'validation/bundles/held'), { recursive: true });
  symlinkSync(join(root, 'scripts'), join(root, 'validation/bundles/held'));
  expect(() => packQualificationCache(root, cache, 'test-runtime')).toThrow('Unsafe cache input');
});
