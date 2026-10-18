/** Exercise the compiled distribution from outside the checkout, using only shipped offline assets. */
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { approvedBundleIds } from './validation-distribution.js';

const root = join(import.meta.dir, '..');
const temp = mkdtempSync(join(tmpdir(), 'einvoice-cli-package-'));
let binary = process.argv[2] ? resolve(process.argv[2]) : join(temp, 'build', process.platform === 'win32' ? 'einvoice.exe' : 'einvoice');
try {
  if (!process.argv[2]) {
    // Simulate reusing a multi-platform release directory from an older distribution.
    for (const directory of ['validation/licenses', 'runtime/licenses', 'node_modules/stale-package']) {
      mkdirSync(join(dirname(binary), directory), { recursive: true });
      writeFileSync(join(dirname(binary), directory, 'excluded-old-file'), 'stale sidecar');
    }
    writeFileSync(join(dirname(binary), 'einvoice-other-platform'), 'other platform executable');
    const build = Bun.spawnSync(['bun', 'scripts/build-cli.ts', '--outfile', binary], {
      cwd: root,
      stdout: 'inherit',
      stderr: 'inherit',
    });
    assert.equal(build.exitCode, 0, 'CLI package build failed');
    for (const directory of ['validation/licenses', 'runtime/licenses', 'node_modules/stale-package'])
      assert.equal(existsSync(join(dirname(binary), directory, 'excluded-old-file')), false, `stale ${directory} survived rebuild`);
    assert.equal(readFileSync(join(dirname(binary), 'einvoice-other-platform'), 'utf8'), 'other platform executable');
  }
  const assets = dirname(binary);
  const installed = join(temp, process.platform === 'win32' ? 'einvoice.exe' : 'einvoice');
  cpSync(binary, installed);
  const archive = join(assets, 'einvoice-validation-assets.tar.gz');
  if (existsSync(archive)) {
    const extracted = Bun.spawnSync(['tar', '-xzf', archive, '-C', temp]);
    assert.equal(extracted.exitCode, 0, extracted.stderr.toString());
  } else {
    mkdirSync(join(temp, 'node_modules'), { recursive: true });
    cpSync(join(assets, 'node_modules/xmllint-wasm'), join(temp, 'node_modules/xmllint-wasm'), { recursive: true });
    for (const name of ['validation', 'runtime']) cpSync(join(assets, name), join(temp, name), { recursive: true });
  }
  assert.deepEqual(
    approvedBundleIds(temp),
    approvedBundleIds(root),
    'compiled distribution contains exactly the approved source/license closure',
  );
  assert.deepEqual(
    readdirSync(join(temp, 'validation/bundles')).sort(),
    approvedBundleIds(root),
    'held directories must be absent from the installed CLI',
  );
  binary = installed;
  const valid = readFileSync(join(root, 'test/fixtures/xrechnung-ubl.xml'), 'utf8');
  writeFileSync(join(temp, 'valid.xml'), valid);
  writeFileSync(join(temp, 'invalid.xml'), valid.replace(/(<cbc:PayableAmount[^>]*>)[^<]+/, '$11.00'));
  writeFileSync(
    join(temp, 'invalid-xsd.xml'),
    valid.replace('</ubl:Invoice>', '<cbc:UnknownElement>invalid</cbc:UnknownElement></ubl:Invoice>'),
  );
  writeFileSync(join(temp, 'invalid-profile.xml'), valid.replace(/<cbc:BuyerReference>[^<]*<\/cbc:BuyerReference>/, ''));
  writeFileSync(join(temp, 'held.xml'), readFileSync(join(root, 'test/validation-fixtures/peppol-valid-invoice.xml')));
  function check(file: string, expected: number) {
    const run = Bun.spawnSync([binary, 'convert', '--validate', '--quiet', file], { cwd: temp, stdout: 'pipe', stderr: 'pipe' });
    assert.equal(run.exitCode, expected, `${file}: ${run.stderr.toString()}`);
    const result = JSON.parse(run.stdout.toString())[0];
    if (expected === 0) assert.equal(result.source.validation.result, 'valid');
    return result;
  }
  check('valid.xml', 0);
  check('invalid.xml', 4);
  check('invalid-xsd.xml', 4);
  const profileInvalid = check('invalid-profile.xml', 4).source.validation;
  assert.equal(profileInvalid.profile, 'failed');
  assert.ok(
    profileInvalid.findings.some(
      (finding: { ruleId?: string; severity: string }) => finding.ruleId === 'BR-DE-15' && finding.severity === 'fatal',
    ),
  );
  const held = check('held.xml', 6).source.validation;
  assert.equal(held.result, 'incomplete');
  assert.equal(held.schema, 'passed');
  assert.equal(held.semantic, 'passed');
  assert.equal(held.profile, 'unavailable');
  const written = Bun.spawnSync([binary, 'write', '--to', 'ubl', 'valid.xml'], { cwd: temp, stdout: 'pipe', stderr: 'pipe' });
  assert.equal(written.exitCode, 0, written.stderr.toString());
  assert.ok(written.stdout.toString().includes('<Invoice'));
  rmSync(join(temp, 'validation/bundles/xrechnung-3.0.2-ubl'), { recursive: true });
  const partial = check('valid.xml', 6).source.validation;
  assert.equal(partial.schema, 'passed');
  assert.equal(partial.profile, 'unavailable');
  rmSync(join(temp, 'validation/bundles'), { recursive: true });
  assert.equal(check('valid.xml', 6).source.validation.completeness, 'incomplete');
  console.log('Compiled offline CLI: valid=0, semantic/XSD/profile-invalid=4, missing-assets=6; write command passed.');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
