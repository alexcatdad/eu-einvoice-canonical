import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { convert } from '../src/index.js';

const valid = readFileSync(new URL('./validation-fixtures/nlcius-valid-invoice.xml', import.meta.url), 'utf8');
async function validate(xml: string) {
  const r = await convert(new TextEncoder().encode(xml), 'nlcius.xml', undefined, { validate: true });
  const o = r.outcomes[0];
  assert.equal(o.status, 'ok');
  if (o.status !== 'ok') throw Error('Conversion failed');
  return o.invoices[0].source.validation!;
}
test('NLCIUS UBL runs its coherent core and native Dutch rules', { timeout: 60000 }, async () => {
  const v = await validate(valid);
  assert.equal(v.schema, 'passed');
  assert.equal(v.semantic, 'passed');
  assert.equal(v.profile, 'passed');
  assert.equal(v.bundles.semantic, 'en16931-ubl-1.3.16');
  assert.equal(v.bundles.profile, 'nlcius-ubl-2.0.3.13');
});
test('a Dutch supplier without KVK/OIN fails native BR-NL-1 while EN core passes', { timeout: 60000 }, async () => {
  const v = await validate(valid.replace('<cbc:CompanyID schemeID="0106">12345678</cbc:CompanyID>', ''));
  assert.equal(v.schema, 'passed');
  assert.equal(v.semantic, 'passed');
  assert.equal(v.profile, 'failed');
  const f = v.findings.find((f) => f.ruleId === 'BR-NL-1');
  assert.equal(f?.severity, 'fatal');
  assert.ok(f?.path?.includes('AccountingSupplierParty'));
});
test('NLCIUS CII runs the matching EN1.3.16 core and native Dutch rules', { timeout: 60000 }, async () => {
  const xml = readFileSync(new URL('./validation-fixtures/nlcius-valid-cii.xml', import.meta.url), 'utf8');
  const v = await validate(xml);
  assert.equal(v.schema, 'passed');
  assert.equal(v.semantic, 'passed');
  assert.equal(v.profile, 'passed');
  assert.equal(v.bundles.semantic, 'en16931-cii-1.3.16');
  assert.equal(v.bundles.profile, 'nlcius-cii-1.0.3.13');
});
test('a Dutch CII supplier with an unqualified legal identifier fails native BR-NL-1', { timeout: 60000 }, async () => {
  const xml = readFileSync(new URL('./validation-fixtures/nlcius-valid-cii.xml', import.meta.url), 'utf8').replace(
    '<ram:CountryID>DE</ram:CountryID>',
    '<ram:CountryID>NL</ram:CountryID>',
  );
  const v = await validate(xml);
  assert.equal(v.schema, 'passed');
  assert.equal(v.semantic, 'passed');
  assert.equal(v.profile, 'failed');
  assert.ok(v.findings.some((f) => f.ruleId === 'BR-NL-1' && f.severity === 'fatal' && f.path?.includes('SellerTradeParty')));
});
