import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateSource } from '../src/index.js';

const source = readFileSync(new URL('./fixtures/xrechnung-cii.xml', import.meta.url), 'utf8').replace(
  /urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0/,
  'urn:cen.eu:en16931:2017',
);
test('explicit Factur-X 1.09.2 selects its restricted EN16931 profile schema and native rules', async () => {
  const summary = await validateSource({ xml: source }, { suite: 'facturx-1.09.2' });
  assert.equal(summary.schema, 'passed');
  assert.equal(summary.profile, 'passed');
  assert.equal(summary.bundles.schema, 'xsd-facturx-1.09.2-en16931');
  assert.equal(summary.bundles.profile, 'facturx-1.09.2-en16931');
  assert.equal(summary.result, 'valid');
});

for (const profile of ['basicwl', 'en16931', 'extended']) {
  const xml = readFileSync(new URL(`./validation-fixtures/facturx-1.09.2-${profile}.xml`, import.meta.url), 'utf8');
  if (profile !== 'en16931')
    test(`Factur-X 1.09.2 ${profile} has an independent conforming source control`, async () => {
      const summary = await validateSource({ xml }, { suite: 'facturx-1.09.2' });
      assert.equal(summary.schema, 'passed');
      assert.equal(summary.profile, 'passed');
      assert.equal(summary.result, 'valid');
    });
  test(`Factur-X ${profile} restricted schema rejects a missing mandatory document type`, async () => {
    const negative = xml.replace('<ram:TypeCode>380</ram:TypeCode>', '');
    assert.notEqual(negative, xml);
    const summary = await validateSource({ xml: negative }, { suite: 'facturx-1.09.2' });
    assert.equal(summary.schema, 'failed');
    assert.equal(summary.result, 'invalid');
  });
  test(`Factur-X ${profile} code database rejects a schema-valid unknown currency`, async () => {
    const negative = xml.replace(/<ram:InvoiceCurrencyCode>[^<]+/, '<ram:InvoiceCurrencyCode>ZZZ');
    assert.notEqual(negative, xml);
    const summary = await validateSource({ xml: negative }, { suite: 'facturx-1.09.2' });
    assert.equal(summary.schema, 'passed');
    assert.equal(summary.profile, 'failed');
    assert.equal(summary.result, 'invalid');
    const codeRule = { basicwl: 'FX-SCH-A-000464', en16931: 'FX-SCH-A-000595', extended: 'FX-SCH-A-000861' }[profile];
    assert.ok(summary.findings.some((f) => f.layer === 'profile' && f.severity === 'fatal' && f.ruleId === codeRule));
  });
}

test('an explicitly unbundled Factur-X profile stays incomplete rather than inheriting generic CII validity', async () => {
  const xml = readFileSync(new URL('./fixtures/facturx-minimum.xml', import.meta.url), 'utf8');
  const summary = await validateSource({ xml }, { suite: 'facturx-1.09.2' });
  assert.equal(summary.result, 'incomplete');
  assert.equal(summary.reasons?.profile, 'unsupported');
});

test('the selected EXTENDED edition accepts a D22B model identifier that D16B cannot represent', async () => {
  const xml = readFileSync(new URL('./validation-fixtures/facturx-1.09.2-extended.xml', import.meta.url), 'utf8').replace(
    '<ram:Name>Bürostuhl</ram:Name>',
    '<ram:ModelID>SYNTHETIC-MODEL</ram:ModelID><ram:Name>Bürostuhl</ram:Name>',
  );
  const selected = await validateSource({ xml }, { suite: 'facturx-1.09.2' });
  assert.equal(selected.schema, 'passed');
  assert.equal(selected.profile, 'passed');
  assert.equal(selected.result, 'valid');
  const unspecified = await validateSource({ xml });
  assert.equal(unspecified.schema, 'not-run');
  assert.equal(unspecified.reasons?.schema, 'unsupported');
  assert.equal(unspecified.result, 'incomplete');
});
