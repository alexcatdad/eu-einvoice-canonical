import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateSource } from '../src/index.js';

const valid = readFileSync(new URL('./validation-fixtures/ciusro-valid-invoice.xml', import.meta.url), 'utf8');
test('Romanian CIUS1.0.1 document runs authority integrated rules1.0.9', { timeout: 60000 }, async () => {
  const v = await validateSource({ xml: valid });
  assert.equal(v.schema, 'passed');
  assert.equal(v.semantic, 'not-run');
  assert.equal(v.profile, 'passed', JSON.stringify(v.findings));
  assert.equal(v.bundles.profile, 'cius-ro-ubl-1.0.9');
  assert.equal(v.bundles.semantic, undefined);
  assert.equal(v.result, 'valid');
});

test('Romanian native seller-address rule fails independently of schema', { timeout: 60000 }, async () => {
  const v = await validateSource({ xml: valid.replace('<cbc:StreetName>Synthetic Seller Street 1</cbc:StreetName>', '') });
  assert.equal(v.schema, 'passed');
  assert.equal(v.profile, 'failed');
  assert.ok(v.findings.some((f) => f.ruleId === 'BR-RO-081' && f.severity === 'fatal' && f.path));
});

test('Romanian integrated authority core rejects wrong tax-inclusive totals', { timeout: 60000 }, async () => {
  const v = await validateSource({
    xml: valid.replace('<cbc:TaxInclusiveAmount currencyID="RON">250.00', '<cbc:TaxInclusiveAmount currencyID="RON">260.00'),
  });
  assert.equal(v.schema, 'passed');
  assert.equal(v.profile, 'failed');
  assert.ok(v.findings.some((f) => f.ruleId === 'BR-CO-15' && f.severity === 'fatal'));
});

test('Romanian authority replacement of BR-27 still rejects a negative item price', { timeout: 60000 }, async () => {
  const v = await validateSource({
    xml: valid.replace('<cbc:PriceAmount currencyID="RON">25.00', '<cbc:PriceAmount currencyID="RON">-25.00'),
  });
  assert.equal(v.schema, 'passed');
  assert.equal(v.profile, 'failed');
  assert.equal(v.findings.filter((f) => f.ruleId === 'BR-27' && f.severity === 'fatal').length, 1);
});

for (const [attribute, before, after, ruleId] of [
  ['unit', 'unitCode="H87"', 'unitCode="ZZZ"', 'BR-CL-23'],
  ['currency', 'currencyID="RON"', 'currencyID="ZZZ"', 'BR-CL-03'],
] as const) {
  test(`Romanian authority rules visit ${attribute} attribute contexts`, { timeout: 60000 }, async () => {
    assert.ok(valid.includes(before));
    const v = await validateSource({ xml: valid.replace(before, after) });
    assert.equal(v.schema, 'passed');
    assert.equal(v.profile, 'failed');
    assert.ok(v.findings.some((f) => f.ruleId === ruleId && f.severity === 'fatal' && f.path));
    assert.equal(v.result, 'invalid');
  });
}
