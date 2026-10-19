import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('conformance report distinguishes actual conversion and incomplete validation coverage', async () => {
  const output = join(mkdtempSync(join(tmpdir(), 'conformance-')), 'report.json');
  const process = Bun.spawn(['bun', 'scripts/conformance.ts', '--json', output], { stdout: 'ignore', stderr: 'pipe' });
  const diagnostics = await new Response(process.stderr).text();
  expect(await process.exited, diagnostics).toBe(0);
  const report = JSON.parse(readFileSync(output, 'utf8'));
  expect(report.rows.find((r: { id: string }) => r.id === 'eslog-1').parser).toBe(false);
  expect(report.rows.find((r: { id: string }) => r.id === 'ebinterface-2').parser).toBe(false);
  const finvoice = report.rows.find((r: { id: string }) => r.id === 'finvoice');
  expect(finvoice.validationGaps).toContain('profile');
  expect(finvoice.validation.every((s: string) => !s.includes('semantic'))).toBe(true);
  const peppol = report.rows.find((r: { id: string }) => r.id === 'peppol-bis3');
  expect(peppol.validation.some((s: string) => s.startsWith('schema'))).toBe(true);
  expect(peppol.validation.some((s: string) => s.startsWith('profile'))).toBe(false);
  expect(peppol.validationGaps.some((s: string) => s.includes('peppol-bis3') && s.includes('not distributed'))).toBe(true);
  expect(report.totals.withParser).toBe(44);
}, 20_000);
