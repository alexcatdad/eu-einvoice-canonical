import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { convert } from '../src/index.js';

const valid = readFileSync(new URL('./validation-fixtures/svefaktura-valid-invoice.xml', import.meta.url), 'utf8');
async function validate(xml: string) {
  const result = await convert(new TextEncoder().encode(xml), 'synthetic-svefaktura.xml', undefined, { validate: true });
  const outcome = result.outcomes[0];
  assert.equal(outcome.status, 'ok');
  if (outcome.status !== 'ok') throw new Error('Conversion failed');
  return outcome.invoices[0].source.validation!;
}

test('a synthetic conforming Svefaktura invoice passes its native schema and rules', { timeout: 60000 }, async () => {
  const v = await validate(valid);
  assert.equal(v.schema, 'passed');
  assert.equal(v.profile, 'passed');
  assert.equal(v.semantic, 'not-run');
  assert.equal(v.bundles.schema, 'xsd-svefaktura-1.0-20081227');
  assert.equal(v.bundles.profile, 'svefaktura-1.0-rules-20161025');
  assert.deepEqual(
    v.findings.filter((f) => f.severity === 'fatal'),
    [],
  );
});

test('a currency mismatch passes XSD but fails native Svefaktura rule R-100', { timeout: 60000 }, async () => {
  const v = await validate(valid.replace('amountCurrencyID="SEK"', 'amountCurrencyID="EUR"'));
  assert.equal(v.schema, 'passed');
  assert.equal(v.profile, 'failed');
  const finding = v.findings.find((f) => f.ruleId === 'R-100');
  assert.equal(finding?.severity, 'fatal');
  assert.ok(finding?.path);
  assert.ok(finding?.message.endsWith('[R-100]'));
});

test('a missing required buyer reference fails the Svefaktura schema', { timeout: 60000 }, async () => {
  const v = await validate(valid.replace(/\s*<RequisitionistDocumentReference>.*?<\/RequisitionistDocumentReference>/, ''));
  assert.equal(v.schema, 'failed');
  assert.ok(v.findings.some((f) => f.layer === 'schema' && f.severity === 'fatal'));
});

test('a synthetic Svefaktura credit passes its native schema and rules', { timeout: 60000 }, async () => {
  const xml = readFileSync(new URL('./validation-fixtures/svefaktura-valid-credit.xml', import.meta.url), 'utf8');
  const v = await validate(xml);
  assert.equal(v.schema, 'passed');
  assert.equal(v.profile, 'passed');
});

test('Svefaktura line count is checked by native rule R-27 independently of XSD', { timeout: 60000 }, async () => {
  const v = await validate(
    valid.replace('<LineItemCountNumeric>6</LineItemCountNumeric>', '<LineItemCountNumeric>7</LineItemCountNumeric>'),
  );
  assert.equal(v.schema, 'passed');
  assert.equal(v.profile, 'failed');
  assert.ok(v.findings.some((f) => f.ruleId === 'R-27' && f.severity === 'fatal' && f.path?.includes('LineItemCountNumeric')));
});

test('a zero-rate standard-tax category is a warning and does not fail Svefaktura rules', { timeout: 60000 }, async () => {
  const v = await validate(valid.replaceAll('<cac:ID>E</cac:ID>', '<cac:ID>S</cac:ID>'));
  assert.equal(v.schema, 'passed');
  assert.equal(v.profile, 'passed');
  assert.ok(v.findings.some((f) => f.ruleId === 'R-97' && f.severity === 'warning'));
  assert.ok(v.findings.some((f) => f.ruleId === 'R-39' && f.severity === 'info'));
});

test('Svefaktura rejects elements in the wrong order without failing unchanged native rules', { timeout: 60000 }, async () => {
  const date = '<cbc:IssueDate>2026-10-05</cbc:IssueDate>';
  const xml = valid.replace(date, '').replace('<ID>SF-2026-31</ID>', `${date}<ID>SF-2026-31</ID>`);
  const v = await validate(xml);
  assert.equal(v.schema, 'failed');
  assert.equal(v.profile, 'passed');
});

test('an invalid Svefaktura date fails source XSD validation', { timeout: 60000 }, async () => {
  const result = await convert(new TextEncoder().encode(valid.replace('2026-10-05', '2026-19-05')), 'synthetic-svefaktura.xml', undefined, {
    validate: true,
  });
  const v = result.outcomes[0].validation!;
  assert.equal(v.schema, 'failed');
  assert.ok(v.findings.some((f) => f.layer === 'schema' && f.severity === 'fatal'));
});
