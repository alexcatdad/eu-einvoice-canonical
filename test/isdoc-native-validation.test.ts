import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateSource } from '../src/index.js';

const valid = readFileSync(new URL('./validation-fixtures/national/isdoc.isdoc', import.meta.url), 'utf8');
test('ISDOC 6.0.2 executes official native rules alongside its XSD', async () => {
  const summary = await validateSource({ xml: valid });
  assert.equal(summary.schema, 'passed');
  assert.equal(summary.profile, 'passed');
  assert.equal(summary.bundles.profile, 'isdoc-6.0.2-rules');
  assert.equal(summary.result, 'valid');
});

test('ISDOC correction documents require an original reference even when XSD passes', async () => {
  const xml = valid.replace('<DocumentType>1</DocumentType>', '<DocumentType>2</DocumentType>');
  const summary = await validateSource({ xml });
  assert.equal(summary.schema, 'passed');
  assert.equal(summary.profile, 'failed');
  assert.equal(summary.result, 'invalid');
  assert.ok(
    summary.findings.some((f) => f.layer === 'profile' && f.severity === 'fatal' && f.message.includes('OriginalDocumentReference')),
  );
});

test('the documented ISDOC quantified VAT syntax repair enforces the native assertion', async () => {
  const xml = valid
    .replace('<VATApplicable>true</VATApplicable>', '<VATApplicable>false</VATApplicable>')
    .replace('</VATCalculationMethod>', '</VATCalculationMethod><VATApplicable>true</VATApplicable>');
  const summary = await validateSource({ xml });
  assert.equal(summary.schema, 'passed');
  assert.equal(summary.profile, 'failed');
  assert.ok(summary.findings.some((f) => f.layer === 'profile' && f.message.includes('ClassifiedTaxCategory')));
});

test('the documented ISDOC batch syntax repair checks quantity units independently of XSD', async () => {
  const control = valid.replace(
    '</Item>',
    '<StoreBatches><StoreBatch><Name>SYNTHETIC-BATCH</Name><Quantity unitCode="Ks">10</Quantity><BatchOrSerialNumber>B</BatchOrSerialNumber></StoreBatch></StoreBatches></Item>',
  );
  const positive = await validateSource({ xml: control });
  assert.equal(positive.schema, 'passed');
  assert.equal(positive.profile, 'passed');
  const negative = await validateSource({ xml: control.replace('<Quantity unitCode="Ks">', '<Quantity unitCode="kg">') });
  assert.equal(negative.schema, 'passed');
  assert.equal(negative.profile, 'failed');
  assert.ok(negative.findings.some((f) => f.layer === 'profile' && f.message.includes('StoreBatches')));
});
