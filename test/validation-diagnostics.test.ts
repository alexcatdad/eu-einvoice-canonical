import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('malformed source values never escape to process diagnostics', () => {
  const script = `import { readFileSync } from 'node:fs';
import { convert } from './src/index.ts';
const xml = readFileSync('test/validation-fixtures/svefaktura-valid-invoice.xml', 'utf8').replace('2026-10-05', '2026-19-05');
if (!xml.includes('2026-19-05')) throw new Error('missing mutation');
const result = await convert(new TextEncoder().encode(xml), 'synthetic.xml', undefined, { validate: true });
console.log(result.outcomes[0].validation.schema);
`;
  const child = spawnSync('bun', ['--eval', script], { encoding: 'utf8', cwd: new URL('..', import.meta.url), timeout: 60_000 });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout.trim(), 'failed');
  assert.equal(child.stderr, '');
});
