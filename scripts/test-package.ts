/** Smoke the actual packed file list from an installed-package layout, without downloading dependencies. */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { approvedBundleIds, loadDistribution } from './validation-distribution.js';

const root = join(import.meta.dir, '..');
const temp = mkdtempSync(join(tmpdir(), 'einvoice-package-'));
function run(command: string[], cwd = root, expected = 0): string {
  const p = Bun.spawnSync(command, {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, npm_config_cache: join(temp, 'npm-cache') },
  });
  if (p.exitCode !== expected)
    throw new Error(`${command.join(' ')}: expected exit ${expected}, got ${p.exitCode}\n${p.stdout.toString()}${p.stderr.toString()}`);
  return p.stdout.toString();
}
try {
  run(['bun', 'run', 'build:package']);
  const packed = JSON.parse(run(['npm', 'pack', '--ignore-scripts', '--json', '--pack-destination', temp]))[0];
  const inventory: string[] = packed.files.map((f: { path: string }) => f.path);
  for (const path of [
    'lib/index.js',
    'lib/index.d.ts',
    'lib/cli.js',
    'lib/react/index.js',
    'lib/react/invoice.css',
    'schemas/canonical-invoice.v1.schema.json',
    'lib/validation/schematron-worker.js',
  ])
    assert.ok(inventory.includes(path), `package is missing ${path}`);
  const approved = approvedBundleIds(root);
  const expectedAssets = approved.flatMap((id) => {
    const manifest = JSON.parse(readFileSync(join(root, 'validation/bundles', id, 'manifest.json'), 'utf8'));
    return ['manifest.json', ...manifest.files.map((file: { path: string }) => file.path)].map(
      (path) => `validation/bundles/${id}/${path}`,
    );
  });
  assert.deepEqual(
    inventory.filter((path) => path.startsWith('validation/bundles/')).sort(),
    expectedAssets.sort(),
    'tarball must contain exactly the reviewed bundles and their complete source/license closure',
  );
  for (const path of [
    'validation/NOTICE',
    'validation/distribution.json',
    ...Object.keys(loadDistribution(root).licenseFiles).map((name) => `validation/licenses/${name}`),
  ])
    assert.ok(inventory.includes(path), `package is missing ${path}`);
  assert.ok(!inventory.some((p) => p.startsWith('src/') || p.startsWith('test/')), 'development sources leaked into package');
  const modules = join(temp, 'node_modules');
  const installed = join(modules, 'eu-einvoice-canonical');
  mkdirSync(installed, { recursive: true });
  run(['tar', '-xzf', join(temp, packed.filename), '-C', installed, '--strip-components=1']);
  assert.deepEqual(approvedBundleIds(installed), approved, 'installed assets, licenses and notices match the reviewed hashes');
  // Use the locked checkout dependencies, while loading our own code and assets solely from the tarball.
  symlinkSync(join(root, 'node_modules'), join(installed, 'node_modules'), 'dir');
  writeFileSync(join(temp, 'package.json'), '{"type":"module"}');
  const invoice = readFileSync(join(root, 'test/fixtures/xrechnung-ubl.xml'), 'utf8');
  writeFileSync(join(temp, 'invoice.xml'), invoice);
  writeFileSync(join(temp, 'invalid-profile.xml'), invoice.replace(/<cbc:BuyerReference>[^<]*<\/cbc:BuyerReference>/, ''));
  writeFileSync(join(temp, 'held.xml'), readFileSync(join(root, 'test/validation-fixtures/peppol-valid-invoice.xml')));
  writeFileSync(
    join(temp, 'smoke.mjs'),
    `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import { convert, validateSource, validationPassed } from 'eu-einvoice-canonical';
    const result = await convert(readFileSync(new URL('./invoice.xml', import.meta.url)), 'invoice.xml', undefined, {validate:true});
    assert.equal(result.outcomes[0].status, 'ok');
    const invoice = result.outcomes[0].invoices[0];
    assert.ok(validationPassed(invoice.source.validation), JSON.stringify(invoice.source.validation));
    assert.ok(validationPassed(await validateSource({xml:readFileSync(new URL('./invoice.xml', import.meta.url),'utf8')}))); 
    const invalid = await validateSource({xml:readFileSync(new URL('./invalid-profile.xml', import.meta.url),'utf8')});
    assert.equal(invalid.profile, 'failed');
    assert.ok(invalid.findings.some(finding => finding.ruleId === 'BR-DE-15' && finding.severity === 'fatal'));
    const held = await validateSource({xml:readFileSync(new URL('./held.xml', import.meta.url),'utf8')});
    assert.equal(held.result, 'incomplete');
    assert.equal(held.schema, 'passed');
    assert.equal(held.semantic, 'passed');
    assert.equal(held.profile, 'unavailable');
    assert.equal(validationPassed(held), false);
    await import('eu-einvoice-canonical/react');
  `,
  );
  for (const runtime of [process.env.NODE_BIN ?? 'node', 'bun']) {
    assert.ok(run([runtime, '--version'], temp).trim());
    run([runtime, 'smoke.mjs'], temp);
    console.log(`Packed conversion, validators, source validation and React import passed: ${runtime}`);
  }
  writeFileSync(join(temp, 'browser.mjs'), "export { convert, detectXml } from 'eu-einvoice-canonical';");
  run(['bun', 'build', 'browser.mjs', '--target=browser', '--outfile=browser.js'], temp);
  writeFileSync(
    join(temp, 'consumer.ts'),
    `
    import { convert, type ConvertResult } from 'eu-einvoice-canonical';
    const converted: Promise<ConvertResult> = convert(new Uint8Array());
    converted.then(result => { for (const outcome of result.outcomes) if(outcome.status === 'ok') console.log(outcome.invoices.length); });
  `,
  );
  run(
    [
      'bun',
      join(root, 'node_modules/typescript/bin/tsc'),
      '--noEmit',
      '--skipLibCheck',
      '--module',
      'NodeNext',
      '--target',
      'ES2022',
      join(temp, 'consumer.ts'),
    ],
    temp,
  );
  console.log('Packed browser bundle and TypeScript consumer passed.');
  const cli = run(['bun', join(installed, 'lib/cli.js'), 'convert', '--validate', '--quiet', join(temp, 'invoice.xml')], temp);
  assert.equal(JSON.parse(cli)[0].source.validation.result, 'valid');
  const held = run(['bun', join(installed, 'lib/cli.js'), 'convert', '--validate', '--quiet', join(temp, 'held.xml')], temp, 6);
  assert.equal(JSON.parse(held)[0].source.validation.result, 'incomplete');
  const invalid = run(
    ['bun', join(installed, 'lib/cli.js'), 'convert', '--validate', '--quiet', join(temp, 'invalid-profile.xml')],
    temp,
    4,
  );
  assert.equal(JSON.parse(invalid)[0].source.validation.profile, 'failed');
  assert.ok(existsSync(join(installed, 'lib/index.d.ts')));
  console.log(`Packed CLI validation passed; checked ${inventory.length} packaged files.`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
