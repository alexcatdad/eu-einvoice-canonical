import { afterAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const roots: string[] = [];
const bytes = new TextEncoder().encode('synthetic publisher source');
const hash = createHash('sha256').update(bytes).digest('hex');
const url = 'https://publisher.example/source.zip';
type Source = { url: string; sha256: string };
type Item = Source & { to: string; zipEntry?: string };

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

async function isolatedHelper(item: Item) {
  // Each import reads its own synthetic configuration, without mutating the real
  // release evidence or mocking node:fs for concurrent tests.
  const root = mkdtempSync(join(tmpdir(), 'distribution-evidence-test-'));
  roots.push(root);
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'validation/licenses'), { recursive: true });
  copyFileSync(new URL('../scripts/validation-distribution-evidence.ts', import.meta.url), join(root, 'scripts/helper.ts'));
  writeFileSync(join(root, 'validation/licenses/evidence.json'), JSON.stringify({ synthetic: [item] }));
  const { addDistributionEvidence } = await import(pathToFileURL(join(root, 'scripts/helper.ts')).href);
  return addDistributionEvidence as typeof import('../scripts/validation-distribution-evidence.js').addDistributionEvidence;
}

const sources = {
  download: async () => ({ bytes, sha256: hash }),
  archive: async () => ({ 'selected.sch': bytes }),
};

test('retains selected archive source, provenance and existing executable bytes', async () => {
  const add = await isolatedHelper({ url, sha256: hash, zipEntry: 'selected.sch', to: 'source/selected.sch' });
  const executable = new Uint8Array([1, 2, 3]);
  const files: Record<string, Uint8Array> = { 'validator.sef.json.gz': executable };
  const source: Source[] = [{ url, sha256: hash }];
  await add('synthetic', files, source, sources);
  await add('synthetic', files, source, sources);
  expect(files['validator.sef.json.gz']).toBe(executable);
  expect(files['source/selected.sch']).toEqual(bytes);
  expect(source).toEqual([
    { url, sha256: hash },
    { url: `${url}#selected.sch`, sha256: hash },
  ]);
});

test('rejects a changed download before retaining any source', async () => {
  const add = await isolatedHelper({ url, sha256: 'unexpected', to: 'source.sch' });
  const files: Record<string, Uint8Array> = {};
  const source: Source[] = [];
  await expect(add('synthetic', files, source, sources)).rejects.toThrow('Distribution evidence changed');
  expect(files).toEqual({});
  expect(source).toEqual([]);
});

test('rejects an absent selected archive member', async () => {
  const add = await isolatedHelper({ url, sha256: hash, zipEntry: 'missing.sch', to: 'source.sch' });
  const files: Record<string, Uint8Array> = {};
  await expect(add('synthetic', files, [], sources)).rejects.toThrow('Missing distribution evidence');
  expect(files).toEqual({});
});

test.each(['../outside.sch', 'source/../../outside.sch', '/outside.sch', 'source\\outside.sch', 'source//file.sch', ''])(
  'rejects an unsafe output path %s before downloading',
  async (to) => {
    const add = await isolatedHelper({ url, sha256: hash, to });
    let downloaded = false;
    await expect(
      add('synthetic', {}, [], {
        ...sources,
        download: async () => {
          downloaded = true;
          return { bytes, sha256: hash };
        },
      }),
    ).rejects.toThrow('Invalid distribution evidence path');
    expect(downloaded).toBe(false);
  },
);

test('rejects conflicting artifact bytes without overwriting them', async () => {
  const add = await isolatedHelper({ url, sha256: hash, to: 'source.sch' });
  const original = new Uint8Array([9]);
  const files: Record<string, Uint8Array> = { 'source.sch': original };
  await expect(add('synthetic', files, [], sources)).rejects.toThrow('collides with artifact');
  expect(files['source.sch']).toBe(original);
});

test('rejects conflicting provenance without replacing the recorded source hash', async () => {
  const add = await isolatedHelper({ url, sha256: hash, to: 'source.sch' });
  const source: Source[] = [{ url, sha256: 'previous-source-hash' }];
  await expect(add('synthetic', {}, source, sources)).rejects.toThrow('source conflict');
  expect(source).toEqual([{ url, sha256: 'previous-source-hash' }]);
});
