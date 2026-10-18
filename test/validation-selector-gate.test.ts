import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The executable gate is the seam: a bundle-only suite must not hide missing selector evidence.
test('coverage gate rejects an empty selector evidence inventory even when every bundle has controls', () => {
  const directory = mkdtempSync(join(tmpdir(), 'validation-selectors-'));
  try {
    const inventory = join(directory, 'selectors.json');
    writeFileSync(inventory, '[]');
    const child = Bun.spawnSync(['bun', 'scripts/check-validation-coverage.ts', '--selector-cases', inventory, '--selectors-only'], {
      cwd: join(import.meta.dir, '..'),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(child.exitCode).not.toBe(0);
    expect(child.stderr.toString()).toContain('no selector evidence');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 120_000);

// FPA12 and FPR12 use the same XSD. Bundle inventory alone cannot distinguish their obligations.
test('a registered selector reusing an evidenced bundle still requires its own control', () => {
  const directory = mkdtempSync(join(tmpdir(), 'validation-selectors-shared-bundle-'));
  try {
    const inventory = join(directory, 'selectors.json');
    const source = JSON.parse(readFileSync(new URL('../conformance/validation-selectors.json', import.meta.url), 'utf8'));
    expect(source.some((entry: { selector: string }) => entry.selector === 'fatturapa-FPR12')).toBe(true);
    expect(source.some((entry: { selector: string }) => entry.selector === 'fatturapa-FPA12')).toBe(true);
    writeFileSync(inventory, JSON.stringify(source.filter((entry: { selector: string }) => entry.selector !== 'fatturapa-FPA12')));
    const child = Bun.spawnSync(['bun', 'scripts/check-validation-coverage.ts', '--selector-cases', inventory, '--selectors-only'], {
      cwd: join(import.meta.dir, '..'),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(child.exitCode).not.toBe(0);
    expect(child.stderr.toString()).toContain('fatturapa-FPA12: no selector evidence');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const defect of ['schema scope hides semantic selector', 'failed profile hidden by schema subset']) {
  test(`selector gate rejects ${defect}`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'validation-selectors-invalid-evidence-'));
    try {
      const controls = JSON.parse(readFileSync(new URL('../conformance/validation-cases.json', import.meta.url), 'utf8'));
      const selectors = JSON.parse(readFileSync(new URL('../conformance/validation-selectors.json', import.meta.url), 'utf8'));
      const c = structuredClone(controls.find((entry: { id: string }) => entry.id === 'peppol-2026'));
      c.id = 'invalid-selector-evidence';
      c.bundles = { schema: 'xsd-ubl-2.1' };
      c.negatives = [{ layer: 'schema', drop: 'cbc:IssueDate' }];
      if (defect === 'schema scope hides semantic selector') c.options = { scope: 'schema' };
      else c.prepare = [['<cbc:BuyerReference>4025:ANNA</cbc:BuyerReference>', '']];
      controls.push(c);
      selectors.find(
        (entry: { selector: string }) =>
          entry.selector === (defect === 'schema scope hides semantic selector' ? 'peppol-peppol-2026-05-invoice' : 'ubl-2.1-invoice'),
      ).control = c.id;
      // Exercise the deliberately broken evidence first; catalogue growth must not delay this regression.
      selectors.sort((a: { control: string }, b: { control: string }) => Number(b.control === c.id) - Number(a.control === c.id));
      const casesPath = join(directory, 'cases.json');
      const selectorsPath = join(directory, 'selectors.json');
      writeFileSync(casesPath, JSON.stringify(controls));
      writeFileSync(selectorsPath, JSON.stringify(selectors));
      const child = Bun.spawnSync(
        ['bun', 'scripts/check-validation-coverage.ts', '--cases', casesPath, '--selector-cases', selectorsPath, '--selectors-only'],
        {
          cwd: join(import.meta.dir, '..'),
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );
      expect(child.exitCode).not.toBe(0);
      expect(child.stderr.toString()).toContain(
        defect === 'schema scope hides semantic selector' ? 'scope cannot establish' : 'positive source is invalid',
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 120_000);
}
