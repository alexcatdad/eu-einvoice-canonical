import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateSource } from '../src/index.js';

const base = readFileSync(new URL('./validation-fixtures/peppol-valid-invoice.xml', import.meta.url), 'utf8');
const valid = base
  .replace('urn:fdc:peppol.eu:2017:poacc:billing:3.0', 'urn:fdc:peppol.eu:2017:poacc:selfbilling:3.0')
  .replace('urn:fdc:peppol.eu:2017:poacc:billing:01:1.0', 'urn:fdc:peppol.eu:2017:poacc:selfbilling:01:1.0')
  .replace('<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>', '<cbc:InvoiceTypeCode>389</cbc:InvoiceTypeCode>');
test('self-billing runs its specialized CEN and native Peppol suite', { timeout: 60000 }, async () => {
  const v = await validateSource({ xml: valid });
  assert.equal(v.schema, 'passed');
  assert.equal(v.semantic, 'passed');
  assert.equal(v.profile, 'passed');
  assert.equal(v.result, 'valid');
  assert.equal(v.bundles.semantic, 'selfbilling-ubl-en16931-1.3.16');
});
test('wrong self-billing process fails native R007 while specialized CEN still passes', { timeout: 60000 }, async () => {
  const v = await validateSource({
    xml: valid.replace('urn:fdc:peppol.eu:2017:poacc:selfbilling:01:1.0', 'urn:fdc:peppol.eu:2017:poacc:selfbilling:99:1.0'),
  });
  assert.equal(v.schema, 'passed');
  assert.equal(v.semantic, 'passed');
  assert.equal(v.profile, 'failed');
  assert.ok(v.findings.some((f) => f.ruleId === 'PEPPOL-EN16931-R007' && f.severity === 'fatal'));
});
test('wrong self-billing total fails specialized CEN BR-CO-15', { timeout: 60000 }, async () => {
  const v = await validateSource({
    xml: valid.replace('<cbc:TaxInclusiveAmount currencyID="SEK">250.00', '<cbc:TaxInclusiveAmount currencyID="SEK">260.00'),
  });
  assert.equal(v.semantic, 'failed');
  assert.ok(v.findings.some((f) => f.ruleId === 'BR-CO-15' && f.layer === 'semantic'));
});
test('self-billing credit code261 passes the same specialized suite', { timeout: 60000 }, async () => {
  const xml = readFileSync(new URL('./validation-fixtures/selfbilling-valid-credit.xml', import.meta.url), 'utf8');
  const v = await validateSource({ xml });
  assert.equal(v.schema, 'passed', JSON.stringify(v.findings));
  assert.equal(v.semantic, 'passed', JSON.stringify(v.findings));
  assert.equal(v.profile, 'passed', JSON.stringify(v.findings));
});
