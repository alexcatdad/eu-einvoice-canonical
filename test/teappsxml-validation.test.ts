import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { convert } from '../src/index.js';

const valid = readFileSync(new URL('./validation-fixtures/teappsxml-valid.xml', import.meta.url), 'utf8');
async function validate(xml: string) {
  const r = await convert(new TextEncoder().encode(xml), 'teapps.xml', undefined, { validate: true });
  return r.outcomes[0];
}
test('TEAPPSXML 3.0 batch invoice and credit use the official source schema', { timeout: 60000 }, async () => {
  const o = await validate(valid);
  assert.equal(o.status, 'ok');
  assert.equal(o.validation?.schema, 'passed');
  assert.equal(o.validation?.bundles.schema, 'xsd-teappsxml-3.0');
  if (o.status === 'ok') {
    assert.equal(o.invoices.length, 2);
    for (const i of o.invoices) assert.equal(i.source.validation?.schema, 'passed');
  }
});
test('a missing mandatory TEAPPSXML frame service ID fails XSD', { timeout: 60000 }, async () => {
  const o = await validate(valid.replace('<NET_SERVICE_ID>SYNTHETIC</NET_SERVICE_ID>', ''));
  assert.equal(o.validation?.schema, 'failed');
  assert.ok(o.validation?.findings.some((f) => f.layer === 'schema' && f.severity === 'fatal'));
});
test('TEAPPSXML 2.7 is not validated against the 3.0 schema', { timeout: 60000 }, async () => {
  const o = await validate(valid.replace('<FORMAT_VERSION>3.0</FORMAT_VERSION>', '<FORMAT_VERSION>2.7</FORMAT_VERSION>'));
  assert.equal(o.validation?.schema, 'not-run');
  assert.equal(o.validation?.bundles.schema, undefined);
  assert.equal(o.validation?.result, 'incomplete');
});
