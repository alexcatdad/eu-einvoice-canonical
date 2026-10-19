import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateSource } from '../src/index.js';

const valid = readFileSync(new URL('./validation-fixtures/hr-cius-valid-invoice.xml', import.meta.url), 'utf8');
test('Croatian CIUS2025+extension executes official native rules after EN16931', { timeout: 60000 }, async () => {
  const v = await validateSource({ xml: valid });
  assert.equal(v.schema, 'passed');
  assert.equal(v.semantic, 'passed');
  assert.equal(v.profile, 'passed', JSON.stringify(v.findings));
  assert.equal(v.bundles.profile, 'hr-cius-ext-ubl-20260313');
});
test('missing Croatian issue time fails native HR-BR-2 while generic EN passes', { timeout: 60000 }, async () => {
  const v = await validateSource({ xml: valid.replace('<cbc:IssueTime>12:00:00</cbc:IssueTime>', '') });
  assert.equal(v.schema, 'passed');
  assert.equal(v.semantic, 'passed');
  assert.equal(v.profile, 'failed');
  assert.ok(v.findings.some((f) => f.ruleId === 'HR-BR-2' && f.severity === 'fatal' && f.path));
});
test('Croatian native OIB check rejects a wrong synthetic operator checksum', { timeout: 60000 }, async () => {
  const v = await validateSource({ xml: valid.replace('<cbc:ID>00000000001</cbc:ID>', '<cbc:ID>00000000002</cbc:ID>') });
  assert.equal(v.schema, 'passed');
  assert.equal(v.semantic, 'passed');
  assert.equal(v.profile, 'failed');
  assert.ok(v.findings.some((f) => f.ruleId === 'HR-BR-9' && f.severity === 'fatal'));
});

test('Croatian inlined classification code list rejects an unknown code', { timeout: 60000 }, async () => {
  const v = await validateSource({ xml: valid.replace('31.00.11', '99.99.99') });
  assert.equal(v.schema, 'passed');
  assert.equal(v.semantic, 'passed');
  assert.equal(v.profile, 'failed');
  assert.ok(v.findings.some((f) => f.ruleId === 'HR-BR-CL-2' && f.severity === 'fatal'));
});

test('a malformed Croatian foreign extension cannot pass generic lax UBL validation', { timeout: 60000 }, async () => {
  const source = readFileSync(new URL('./validation-fixtures/hr-cius-valid-extension.xml', import.meta.url), 'utf8');
  const xml = source.replace(
    '<hr:HRObracunPDVPoNaplati>Cash accounting</hr:HRObracunPDVPoNaplati>',
    '<hr:UnexpectedElement>unexpected</hr:UnexpectedElement>',
  );
  const v = await validateSource({ xml });
  assert.equal(v.schema, 'failed');
  assert.equal(v.profile, 'passed');
  assert.equal(v.result, 'invalid');
});

test('the official Croatian extension type validates real HR namespace content', { timeout: 60000 }, async () => {
  const xml = readFileSync(new URL('./validation-fixtures/hr-cius-valid-extension.xml', import.meta.url), 'utf8');
  const v = await validateSource({ xml });
  assert.equal(v.schema, 'passed');
  assert.equal(v.bundles.schema, 'xsd-hr-cius-ubl-20260415');
  assert.equal(v.profile, 'passed');
  assert.equal(v.result, 'valid');
});
