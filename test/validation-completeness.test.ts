import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { convert } from '../src/index.js';

const xml = readFileSync(new URL('./validation-fixtures/peppol-valid-invoice.xml', import.meta.url), 'utf8');
test('requested Peppol validation records a complete coherent suite', async () => {
  const result = await convert(new TextEncoder().encode(xml), 'synthetic.xml', undefined, { validate: true });
  const outcome = result.outcomes[0];
  assert.equal(outcome.status, 'ok');
  if (outcome.status !== 'ok') return;
  assert.equal(outcome.invoices[0].source.validation?.result, 'valid');
  assert.equal(outcome.invoices[0].source.validation?.bundles.semantic, 'en16931-ubl-1.3.16');
  assert.equal(outcome.invoices[0].source.validation?.bundles.profile, 'peppol-bis3-3.0.21-ubl');
});

test('a missing required validator stays incomplete and preserves successful checks', async () => {
  const result = await convert(new TextEncoder().encode(xml), 'synthetic.xml', undefined, {
    validate: true,
    validation: { maxSchematronLines: 0 },
  });
  const outcome = result.outcomes[0];
  if (outcome.status !== 'ok') throw new Error(outcome.status);
  const summary = outcome.invoices[0].source.validation!;
  assert.equal(summary.result, 'incomplete');
  assert.equal(summary.reasons?.profile, 'size-limit');
  assert.equal(summary.schema, 'passed');
});

test('source validation not requested is explicit', async () => {
  const result = await convert(new TextEncoder().encode(xml), 'synthetic.xml');
  const outcome = result.outcomes[0];
  if (outcome.status !== 'ok') throw new Error(outcome.status);
  assert.equal(outcome.invoices[0].source.validation?.result, 'not-requested');
});

test('schema-only national validation declares its limited scope while full source records the native-rule gap', async () => {
  const source = readFileSync(new URL('./validation-fixtures/national/finvoice.xml', import.meta.url), 'utf8');
  const { validateSource } = await import('../src/index.js');
  const full = await validateSource({ xml: source });
  assert.equal(full.result, 'incomplete');
  assert.equal(full.reasons?.profile, 'unsupported');
  const schema = await validateSource({ xml: source }, { scope: 'schema' });
  assert.equal(schema.result, 'valid');
  assert.equal(schema.scope, 'schema');
});

test('declared national versions do not silently use a newer schema', async () => {
  const { validateSource } = await import('../src/index.js');
  for (const [file, before, after] of [
    ['finvoice.xml', 'Version="3.0"', 'Version="9.9"'],
    ['isdoc.isdoc', 'version="6.0.2"', 'version="6.9.9"'],
    ['e-arve.xml', '<Version>1.2</Version>', '<Version>1.1</Version>'],
  ]) {
    const source = readFileSync(new URL(`./validation-fixtures/national/${file}`, import.meta.url), 'utf8');
    assert.ok(source.includes(before), `${file} version marker`);
    const summary = await validateSource({ xml: source.replace(before, after) }, { scope: 'schema' });
    assert.equal(summary.result, 'incomplete', file);
    assert.equal(summary.reasons?.schema, 'unsupported', file);
    assert.equal(summary.bundles.schema, undefined, file);
  }
});

test('unsupported syntax releases and unknown profile claims cannot silently pass', async () => {
  const { validateSource } = await import('../src/index.js');
  const release = xml.replace('<cbc:CustomizationID>', '<cbc:UBLVersionID>2.3</cbc:UBLVersionID><cbc:CustomizationID>');
  const unsupported = await validateSource({ xml: release }, { scope: 'schema' });
  assert.equal(unsupported.result, 'incomplete');
  assert.equal(unsupported.reasons?.schema, 'unsupported');
  const unknown = xml.replace(/<cbc:CustomizationID>[^<]+/, '<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:example:unknown');
  assert.equal((await validateSource({ xml: unknown })).result, 'incomplete');
});

test('mapping errors preserve independent source validation reports', async () => {
  const malformedAmount = xml.replace(
    '<cbc:TaxInclusiveAmount currencyID="SEK">250.00',
    '<cbc:TaxInclusiveAmount currencyID="SEK">not-a-number',
  );
  const result = await convert(new TextEncoder().encode(malformedAmount), 'synthetic.xml', undefined, { validate: true });
  const outcome = result.outcomes[0];
  assert.equal(outcome.status, 'error');
  assert.equal(outcome.validation?.result, 'invalid');
  assert.equal(outcome.validation?.schema, 'failed');
});

test('historical XRechnung profiles are not validated as current profile rules', async () => {
  const { validateSource } = await import('../src/index.js');
  const old = xml.replace(
    /<cbc:CustomizationID>[^<]+/,
    '<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_2.3',
  );
  const summary = await validateSource({ xml: old });
  assert.equal(summary.result, 'incomplete');
  assert.equal(summary.reasons?.profile, 'unsupported');
  assert.equal(summary.bundles.profile, undefined);
});

test('a profile chained after Peppol requires its own coverage', async () => {
  const { validateSource } = await import('../src/index.js');
  const chained = xml.replace(
    'peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>',
    'peppol.eu:2017:poacc:billing:3.0#conformant#urn:example:unknown</cbc:CustomizationID>',
  );
  assert.notEqual(chained, xml);
  const summary = await validateSource({ xml: chained });
  assert.equal(summary.result, 'incomplete');
  assert.equal(summary.reasons?.profile, 'unsupported');
});

test('standalone source validation preserves the converter DOCTYPE boundary', async () => {
  const { validateSource } = await import('../src/index.js');
  const unsafe = xml.replace('?>', '?><!DOCTYPE Invoice [<!ENTITY local "synthetic">]>');
  assert.notEqual(unsafe, xml);
  const summary = await validateSource({ xml: unsafe });
  assert.equal(summary.parse, 'failed');
  assert.equal(summary.result, 'invalid');
  assert.deepEqual(summary.receipt?.artifacts, {});
});

test('case-changed NLCIUS claims cannot skip conditional rules and pass', async () => {
  const { validateSource } = await import('../src/index.js');
  const source = readFileSync(new URL('./validation-fixtures/nlcius-valid-invoice.xml', import.meta.url), 'utf8');
  const changed = source.replace('urn:fdc:nen.nl:nlcius:v1.0', 'URN:FDC:NEN.NL:NLCIUS:V1.0');
  assert.notEqual(changed, source);
  const summary = await validateSource({ xml: changed });
  assert.equal(summary.result, 'incomplete');
  assert.equal(summary.reasons?.profile, 'unsupported');
});

test('Svefaktura native rules respect the declared Schematron line budget', async () => {
  const { validateSource } = await import('../src/index.js');
  const source = readFileSync(new URL('./validation-fixtures/svefaktura-valid-invoice.xml', import.meta.url), 'utf8');
  const summary = await validateSource({ xml: source }, { maxSchematronLines: 0 });
  assert.equal(summary.profile, 'not-run');
  assert.equal(summary.reasons?.profile, 'size-limit');
  assert.equal(summary.result, 'incomplete');
});

test('an unidentified UBL contract with declared2.1 only establishes validity in schema scope', async () => {
  const { validateSource } = await import('../src/index.js');
  const source = xml
    .replace(/<cbc:(CustomizationID|ProfileID)>[^<]*<\/cbc:\1>/g, '')
    .replace('<cbc:ID>', '<cbc:UBLVersionID>2.1</cbc:UBLVersionID><cbc:ID>');
  const full = await validateSource({ xml: source });
  assert.equal(full.result, 'incomplete');
  assert.equal(full.reasons?.profile, 'unsupported');
  const schema = await validateSource({ xml: source }, { scope: 'schema' });
  assert.equal(schema.result, 'valid');
});

test('every TEAPPS frame must declare the supported schema version', async () => {
  const { validateSource } = await import('../src/index.js');
  const source = readFileSync(new URL('./validation-fixtures/teappsxml-valid.xml', import.meta.url), 'utf8');
  const frame = /<CONTENT_FRAME>[\s\S]*?<\/CONTENT_FRAME>/.exec(source)?.[0];
  assert.ok(frame);
  const mixed = source.replace(
    '</INVOICE_CENTER>',
    `${frame.replace('<FORMAT_VERSION>3.0</FORMAT_VERSION>', '<FORMAT_VERSION>2.7</FORMAT_VERSION>')}</INVOICE_CENTER>`,
  );
  const summary = await validateSource({ xml: mixed }, { scope: 'schema' });
  assert.equal(summary.result, 'incomplete');
  assert.equal(summary.reasons?.schema, 'unsupported');
  assert.equal(summary.bundles.schema, undefined);
});

test('EN 16931 editions beyond 2017 never inherit the 2017 semantic validity claim', async () => {
  const { validateSource } = await import('../src/index.js');
  const cii = readFileSync(new URL('./fixtures/en16931-cii.xml', import.meta.url), 'utf8');
  const sources = [
    xml.replace(/<cbc:CustomizationID>[^<]+/, '<cbc:CustomizationID>urn:cen.eu:en16931:2026'),
    cii.replace('urn:cen.eu:en16931:2017', 'urn:cen.eu:en16931:2026'),
  ];
  for (const source of sources) {
    const summary = await validateSource({ xml: source });
    assert.equal(summary.result, 'incomplete');
    assert.equal(summary.reasons?.semantic, 'unsupported');
  }
});
