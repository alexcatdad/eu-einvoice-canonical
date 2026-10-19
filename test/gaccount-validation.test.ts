import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateSource } from '../src/index.js';

const valid = readFileSync(new URL('./validation-fixtures/nlcius-gaccount-valid-invoice.xml', import.meta.url), 'utf8');
test('Dutch G-account uses the official integrated core and extension suite', { timeout: 60000 }, async () => {
  const v = await validateSource({ xml: valid });
  assert.equal(v.schema, 'passed');
  assert.equal(v.profile, 'passed');
  assert.equal(v.result, 'valid');
  assert.equal(v.bundles.profile, 'nlcius-gaccount-1.0.2.13-ubl');
  assert.equal(v.bundles.semantic, undefined);
});
test('G-account payment allocation mismatch fails BR-GA-3 while XSD passes', { timeout: 60000 }, async () => {
  const v = await validateSource({
    xml: valid.replace('<cbc:Amount currencyID="SEK">100.00</cbc:Amount>', '<cbc:Amount currencyID="SEK">90.00</cbc:Amount>'),
  });
  assert.equal(v.schema, 'passed');
  assert.equal(v.profile, 'failed');
  assert.ok(v.findings.some((f) => f.ruleId === 'BR-GA-3' && f.severity === 'fatal'));
});
test('G-account integrated core still rejects inconsistent invoice totals', { timeout: 60000 }, async () => {
  const v = await validateSource({
    xml: valid.replace('<cbc:TaxInclusiveAmount currencyID="SEK">250.00', '<cbc:TaxInclusiveAmount currencyID="SEK">260.00'),
  });
  assert.equal(v.profile, 'failed');
  assert.ok(v.findings.some((f) => f.ruleId === 'BR-CO-15' && f.severity === 'fatal'));
});
