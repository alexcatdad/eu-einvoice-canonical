import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateSource } from '../src/index.js';

const valid = readFileSync(new URL('./validation-fixtures/peppol-valid-invoice.xml', import.meta.url), 'utf8').replace(
  'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0',
  'urn:peppol:pint:billing-1',
);
test('PINT shared rules run without claiming an unchecked jurisdiction passes', async () => {
  const result = await validateSource({ xml: valid });
  assert.equal(result.schema, 'passed');
  assert.equal(result.semantic, 'passed');
  assert.equal(result.bundles.semantic, 'pint-shared-1.1.3');
  assert.equal(result.result, 'incomplete');
  assert.equal(result.reasons?.profile, 'unsupported');
});

test('PINT shared amount rules fail independently of missing jurisdiction coverage', async () => {
  const result = await validateSource({
    xml: valid.replace('<cbc:PayableAmount currencyID="SEK">250.00', '<cbc:PayableAmount currencyID="SEK">260.00'),
  });
  assert.equal(result.schema, 'passed');
  assert.equal(result.semantic, 'failed');
  assert.equal(result.result, 'invalid');
  assert.equal(result.completeness, 'incomplete');
  assert.ok(result.findings.some((f) => f.ruleId === 'ibr-co-16' && f.severity === 'fatal'));
});
