import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateSource } from '../src/index.js';

test('CFDI core XSD cannot establish full-source validity without native business rules', async () => {
  const source = readFileSync(new URL('./validation-fixtures/legacy/cfdi-40.xml', import.meta.url), 'utf8');
  const full = await validateSource({ xml: source });
  assert.equal(full.schema, 'passed');
  assert.equal(full.result, 'incomplete');
  assert.equal(full.reasons?.profile, 'unsupported');
  const changed = source.replace('Total="11077.33"', 'Total="0.00"');
  assert.notEqual(changed, source);
  assert.equal((await validateSource({ xml: changed })).result, 'incomplete');
  const schema = await validateSource({ xml: source }, { scope: 'schema' });
  assert.equal(schema.result, 'valid');
  assert.equal(schema.scope, 'schema');
});
