import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateSource } from '../src/index.js';

const valid = readFileSync(new URL('./validation-fixtures/ciuspt-valid-invoice.xml', import.meta.url), 'utf8');
test('CIUS-PT 2.1.1 runs its official complete native suite', { timeout: 60000 }, async () => {
  const v = await validateSource({ xml: valid });
  assert.equal(v.schema, 'passed');
  assert.equal(v.profile, 'passed', JSON.stringify(v.findings));
  assert.equal(v.result, 'valid');
  assert.equal(v.bundles.profile, 'cius-pt-ubl-2.1.1');
});
test('expanded Portuguese buyer-VAT parameter raises native BR-CIUS-PT-03', { timeout: 60000 }, async () => {
  const xml = valid.replace('<cbc:CompanyID>SE212000000101</cbc:CompanyID>', '');
  const v = await validateSource({ xml });
  assert.equal(v.schema, 'passed');
  assert.equal(v.profile, 'failed');
  assert.ok(v.findings.some((f) => f.ruleId === 'BR-CIUS-PT-03' && f.severity === 'fatal' && f.path));
});
test('Portuguese datatype pattern rejects a whole-number VAT rate', { timeout: 60000 }, async () => {
  const v = await validateSource({ xml: valid.replace('<cbc:Percent>25.00</cbc:Percent>', '<cbc:Percent>25</cbc:Percent>') });
  assert.equal(v.schema, 'passed');
  assert.equal(v.profile, 'failed');
  assert.ok(v.findings.some((f) => f.ruleId === 'DT-CIUS-PT-106.1' && f.severity === 'fatal'));
});

test('Portuguese condition group enforces a due date for a positive payment', { timeout: 60000 }, async () => {
  const v = await validateSource({ xml: valid.replace('<cbc:DueDate>2026-11-14</cbc:DueDate>', '') });
  assert.equal(v.schema, 'passed');
  assert.equal(v.profile, 'failed');
  assert.ok(v.findings.some((f) => f.ruleId === 'BR-CO-25' && f.severity === 'fatal'));
});
