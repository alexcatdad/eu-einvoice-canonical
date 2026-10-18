import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNpmBundleFiles, copyPublishedBundles, prepareCliSidecars } from '../scripts/validation-distribution.js';

const temporary: string[] = [];
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'validation-distribution-'));
  temporary.push(root);
  mkdirSync(join(root, 'validation/bundles/approved'), { recursive: true });
  mkdirSync(join(root, 'validation/bundles/held'), { recursive: true });
  const manifest = JSON.stringify({
    id: 'approved',
    files: [{ path: 'rules.xsd', bytes: 14, sha256: createHash('sha256').update('approved rules').digest('hex') }],
  });
  writeFileSync(join(root, 'validation/bundles/approved/manifest.json'), manifest);
  writeFileSync(join(root, 'validation/bundles/approved/rules.xsd'), 'approved rules');
  writeFileSync(join(root, 'validation/bundles/held/manifest.json'), '{"id":"held"}');
  writeFileSync(join(root, 'validation/bundles/held/source.sch'), 'held source');
  mkdirSync(join(root, 'validation/licenses'));
  writeFileSync(join(root, 'validation/licenses/LICENSE.txt'), 'Synthetic license');
  writeFileSync(join(root, 'validation/NOTICE'), 'Synthetic notice');
  writeFileSync(
    join(root, 'validation/distribution.json'),
    JSON.stringify({
      version: 1,
      noticeSha256: createHash('sha256').update('Synthetic notice').digest('hex'),
      licenseFiles: { 'LICENSE.txt': createHash('sha256').update('Synthetic license').digest('hex') },
      bundles: {
        approved: {
          publish: true,
          basis: 'Synthetic permission',
          evidence: ['https://example.test/license'],
          manifestSha256: createHash('sha256').update(manifest).digest('hex'),
        },
        held: { publish: false, basis: 'Permission unresolved', evidence: [] },
      },
    }),
  );
  return root;
}

test('distribution staging removes stale held artifacts while preserving the full local bundle collection', () => {
  const root = fixture();
  const output = join(root, 'output/bundles');
  mkdirSync(join(output, 'held'), { recursive: true });
  writeFileSync(join(output, 'held/source.sch'), 'stale held source');
  copyPublishedBundles(root, output);
  expect(readFileSync(join(output, 'approved/rules.xsd'), 'utf8')).toBe('approved rules');
  expect(existsSync(join(output, 'held'))).toBe(false);
  expect(readFileSync(join(root, 'validation/bundles/held/source.sch'), 'utf8')).toBe('held source');
});

test('missing qualified sources fail before a previous output is changed', () => {
  const root = fixture();
  const output = join(root, 'output/bundles');
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'previous.txt'), 'previous output');
  rmSync(join(root, 'validation/bundles/approved'), { recursive: true });
  expect(() => copyPublishedBundles(root, output)).toThrow('Missing approved validation bundle');
  expect(readFileSync(join(output, 'previous.txt'), 'utf8')).toBe('previous output');
});

test('a new local bundle cannot silently enter or disappear from a distribution', () => {
  const root = fixture();
  mkdirSync(join(root, 'validation/bundles/unreviewed'));
  expect(() => copyPublishedBundles(root, join(root, 'output/bundles'))).toThrow('Unreviewed validation bundle: unreviewed');
});

test('a changed manifest requires a new distribution review even under the same bundle ID', () => {
  const root = fixture();
  writeFileSync(join(root, 'validation/bundles/approved/manifest.json'), '{"id":"approved","version":"changed"}');
  expect(() => copyPublishedBundles(root, join(root, 'output/bundles'))).toThrow('Approved manifest changed: approved');
});

test('staging refuses to erase its source tree or an ancestor', () => {
  const root = fixture();
  expect(() => copyPublishedBundles(root, join(root, 'validation'))).toThrow('Distribution output overlaps source');
  expect(readFileSync(join(root, 'validation/bundles/approved/rules.xsd'), 'utf8')).toBe('approved rules');
});

test('a malformed publication decision fails closed instead of treating a string as permission', () => {
  const root = fixture();
  const path = join(root, 'validation/distribution.json');
  const policy = JSON.parse(readFileSync(path, 'utf8'));
  policy.bundles.held.publish = 'false';
  writeFileSync(path, JSON.stringify(policy));
  expect(() => copyPublishedBundles(root, join(root, 'output/bundles'))).toThrow('Invalid distribution decision: held');
});

test('npm must enumerate the reviewed directories and cannot use the entire validation tree', () => {
  const root = fixture();
  const path = join(root, 'package.json');
  writeFileSync(path, JSON.stringify({ files: ['lib', 'validation/bundles'] }));
  expect(() => assertNpmBundleFiles(root)).toThrow('npm validation bundle files differ');
  writeFileSync(
    path,
    JSON.stringify({
      files: ['lib', 'validation/bundles/approved', 'validation/licenses', 'validation/NOTICE', 'validation/distribution.json'],
    }),
  );
  expect(() => assertNpmBundleFiles(root)).not.toThrow();
});

test('npm cannot bypass the bundle allowlist through a broad parent or wildcard', () => {
  const root = fixture();
  for (const extra of ['*', '.', 'validation/', 'validation/**', 'validation/runtime']) {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ files: ['lib', 'validation/bundles/approved', extra] }));
    expect(() => assertNpmBundleFiles(root)).toThrow('npm validation bundle files differ');
  }
});

test('an output alias cannot place staged artifacts inside the original bundle tree', () => {
  const root = fixture();
  symlinkSync(join(root, 'validation/bundles'), join(root, 'alias'), 'dir');
  expect(() => copyPublishedBundles(root, join(root, 'alias/output'))).toThrow('Distribution output overlaps source');
  expect(existsSync(join(root, 'validation/bundles/output'))).toBe(false);
});

test('unlisted source files in an approved directory cannot leak into a distribution', () => {
  const root = fixture();
  writeFileSync(join(root, 'validation/bundles/approved/unreviewed.sch'), 'unreviewed source');
  expect(() => copyPublishedBundles(root, join(root, 'output/bundles'))).toThrow('Unlisted approved bundle file: approved/unreviewed.sch');
});

test('the license directory rejects unreviewed bytes before distribution', () => {
  const root = fixture();
  writeFileSync(join(root, 'validation/licenses/internal-notes.txt'), 'not approved');
  expect(() => copyPublishedBundles(root, join(root, 'output/bundles'))).toThrow('Unreviewed distribution license file');
});

test('npm cannot omit the license, notice or distribution metadata', () => {
  const root = fixture();
  writeFileSync(join(root, 'package.json'), JSON.stringify({ files: ['lib', 'validation/bundles/approved'] }));
  expect(() => assertNpmBundleFiles(root)).toThrow('npm must include validation/NOTICE');
});

test('reusing a CLI output removes stale sidecars while preserving binaries and local sources', () => {
  const root = fixture();
  const output = join(root, 'dist/release');
  prepareCliSidecars(root, output);
  for (const directory of ['validation/licenses', 'runtime/licenses', 'node_modules/stale-package']) {
    mkdirSync(join(output, directory), { recursive: true });
    writeFileSync(join(output, directory, 'held.txt'), 'old excluded bytes');
  }
  writeFileSync(join(output, 'einvoice-other-platform'), 'existing binary');
  prepareCliSidecars(root, output);
  for (const directory of ['validation', 'runtime', 'node_modules']) expect(existsSync(join(output, directory))).toBe(false);
  expect(readFileSync(join(output, 'einvoice-other-platform'), 'utf8')).toBe('existing binary');
  expect(readFileSync(join(root, 'validation/bundles/held/source.sch'), 'utf8')).toBe('held source');
});

test('CLI output initialization refuses unowned sidecars before deleting any shared files', () => {
  const root = fixture();
  const output = join(root, 'shared-output');
  for (const directory of ['validation', 'runtime', 'node_modules']) {
    mkdirSync(join(output, directory), { recursive: true });
    writeFileSync(join(output, directory, 'keep.txt'), `unrelated ${directory}`);
  }
  expect(() => prepareCliSidecars(root, output)).toThrow('CLI output contains unowned sidecars');
  for (const directory of ['validation', 'runtime', 'node_modules'])
    expect(readFileSync(join(output, directory, 'keep.txt'), 'utf8')).toBe(`unrelated ${directory}`);
});

test('the public CLI builder rejects a shared output before compilation or replacement', () => {
  const output = mkdtempSync(join(tmpdir(), 'cli-shared-output-'));
  temporary.push(output);
  mkdirSync(join(output, 'runtime'));
  writeFileSync(join(output, 'runtime/keep.txt'), 'another application runtime');
  writeFileSync(join(output, 'einvoice'), 'existing executable');
  const built = Bun.spawnSync([
    'bun',
    fileURLToPath(new URL('../scripts/build-cli.ts', import.meta.url)),
    '--outfile',
    join(output, 'einvoice'),
  ]);
  expect(built.exitCode).not.toBe(0);
  expect(new TextDecoder().decode(built.stderr)).toContain('CLI output contains unowned sidecars');
  expect(readFileSync(join(output, 'runtime/keep.txt'), 'utf8')).toBe('another application runtime');
  expect(readFileSync(join(output, 'einvoice'), 'utf8')).toBe('existing executable');
});

test('a damaged ownership marker cannot authorize sidecar deletion', () => {
  const root = fixture();
  const output = join(root, 'dist/release');
  prepareCliSidecars(root, output);
  mkdirSync(join(output, 'runtime'));
  writeFileSync(join(output, 'runtime/keep.txt'), 'previous runtime');
  writeFileSync(join(output, '.einvoice-cli-output'), 'unknown owner');
  expect(() => prepareCliSidecars(root, output)).toThrow('Invalid CLI output ownership marker');
  expect(readFileSync(join(output, 'runtime/keep.txt'), 'utf8')).toBe('previous runtime');
});

test('dangling shared sidecar links are rejected without changing the output directory', () => {
  const root = fixture();
  const output = join(root, 'shared-output');
  mkdirSync(output);
  symlinkSync(join(root, 'missing-runtime'), join(output, 'runtime'), 'dir');
  expect(() => prepareCliSidecars(root, output)).toThrow('CLI output contains unowned sidecars');
  expect(existsSync(join(output, '.einvoice-cli-output'))).toBe(false);
});

test('CLI sidecar cleanup cannot target the project or its source directories', () => {
  const root = fixture();
  expect(() => prepareCliSidecars(root, root)).toThrow('CLI output overlaps project inputs');
  expect(readFileSync(join(root, 'validation/bundles/approved/rules.xsd'), 'utf8')).toBe('approved rules');
  expect(() => prepareCliSidecars(root, join(root, 'validation'))).toThrow('CLI output overlaps project inputs');
});
