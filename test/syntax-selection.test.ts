import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateSource } from '../src/index.js';

const cii = readFileSync(new URL('./fixtures/xrechnung-cii.xml', import.meta.url), 'utf8').replace(
  'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0',
  'urn:cen.eu:en16931:2017',
);
test('bare EN CII does not identify a syntax edition', async () => {
  const summary = await validateSource({ xml: cii }, { scope: 'schema' });
  assert.equal(summary.schema, 'not-run');
  assert.equal(summary.result, 'incomplete');
  assert.equal(summary.reasons?.schema, 'unsupported');
});
test('explicit D16B selects the qualified generic EN2017 CII syntax', async () => {
  const summary = await validateSource({ xml: cii }, { suite: 'cii-d16b', scope: 'schema' });
  assert.equal(summary.result, 'valid');
  assert.equal(summary.bundles.schema, 'xsd-cii-d16b');
});
const ubl = readFileSync(new URL('./validation-fixtures/peppol-valid-invoice.xml', import.meta.url), 'utf8');
test('a historical Peppol replay suite cannot qualify an unrelated contract', async () => {
  const xml = ubl.replace('urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0', 'urn:cen.eu:en16931:2017');
  const summary = await validateSource({ xml }, { suite: 'legacy-peppol-3.0.20-en-1.3.17', scope: 'schema' });
  assert.equal(summary.result, 'incomplete');
  assert.equal(summary.schema, 'not-run');
});
test('an unknown UBL contract with no syntax version cannot select UBL2.1', async () => {
  const xml = ubl
    .replace(/<cbc:CustomizationID>[^<]*<\/cbc:CustomizationID>/, '')
    .replace(/<cbc:ProfileID>[^<]*<\/cbc:ProfileID>/, '')
    .replace(/<cbc:UBLVersionID>[^<]*<\/cbc:UBLVersionID>/, '');
  const summary = await validateSource({ xml }, { scope: 'schema' });
  assert.equal(summary.result, 'incomplete');
  assert.equal(summary.schema, 'not-run');
});
test('Peppol future base contracts preserve findings without claiming covered obligations', async () => {
  const xml = ubl.replace('urn:cen.eu:en16931:2017', 'urn:cen.eu:en16931:2026');
  const summary = await validateSource({ xml });
  assert.equal(summary.completeness, 'incomplete');
  assert.equal(summary.reasons?.profile, 'unsupported');
  assert.equal(summary.bundles.profile, 'peppol-bis3-3.0.21-ubl');
});
test('explicit syntax selection does not cover unknown CII extensions or future EN contracts', async () => {
  for (const xml of [
    cii.replace('urn:cen.eu:en16931:2017', 'urn:cen.eu:en16931:2017#conformant#urn:example:extension'),
    cii.replace('urn:cen.eu:en16931:2017', 'urn:cen.eu:en16931:2026'),
  ]) {
    const summary = await validateSource({ xml }, { suite: 'cii-d16b' });
    assert.equal(summary.completeness, 'incomplete');
  }
});
test('wrong family and future UBL editions do not receive a successful syntax receipt', async () => {
  for (const [xml, suite] of [
    [ubl, 'cii-d16b'],
    [ubl.replace('<cbc:CustomizationID>', '<cbc:UBLVersionID>2.3</cbc:UBLVersionID><cbc:CustomizationID>'), 'peppol-2026-05'],
  ] as const) {
    const summary = await validateSource({ xml }, { suite, scope: 'schema' });
    assert.equal(summary.result, 'incomplete');
    assert.equal(summary.schema, 'not-run');
  }
});
test('explicit UBL2.1 supports schema-only unknown contracts while full source stays incomplete', async () => {
  const xml = ubl
    .replace(/<cbc:CustomizationID>[^<]*<\/cbc:CustomizationID>/, '<cbc:UBLVersionID>2.1</cbc:UBLVersionID>')
    .replace(/<cbc:ProfileID>[^<]*<\/cbc:ProfileID>/, '');
  const schema = await validateSource({ xml }, { scope: 'schema' });
  assert.equal(schema.result, 'valid');
  const full = await validateSource({ xml });
  assert.equal(full.result, 'incomplete');
  assert.equal(full.reasons?.profile, 'unsupported');
});
test('unqualified UBL ExtensionContent cannot silently pass full-source coverage', async () => {
  const xml = ubl.replace(
    '<cbc:CustomizationID>',
    '<ext:UBLExtensions xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"><ext:UBLExtension><ext:ExtensionContent><private:Contract xmlns:private="urn:example:private-extension">synthetic</private:Contract></ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions><cbc:CustomizationID>',
  );
  const summary = await validateSource({ xml });
  assert.equal(summary.schema, 'passed');
  assert.equal(summary.completeness, 'incomplete');
  assert.equal(summary.reasons?.profile, 'unsupported');
  assert.equal(summary.bundles.profile, 'peppol-bis3-3.0.21-ubl');
});
test('a D22B-only field is evaluated against an explicitly selected D16B instead of inferring an edition from absence', async () => {
  const xml = readFileSync(new URL('./validation-fixtures/facturx-1.09.2-extended.xml', import.meta.url), 'utf8')
    .replace('urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended', 'urn:cen.eu:en16931:2017')
    .replace('<ram:Name>Bürostuhl</ram:Name>', '<ram:ModelID>SYNTHETIC-MODEL</ram:ModelID><ram:Name>Bürostuhl</ram:Name>');
  assert.ok(xml.includes('<ram:ModelID>'));
  const ambiguous = await validateSource({ xml }, { scope: 'schema' });
  assert.equal(ambiguous.result, 'incomplete');
  const d16b = await validateSource({ xml }, { suite: 'cii-d16b', scope: 'schema' });
  assert.equal(d16b.schema, 'failed');
  assert.equal(d16b.result, 'invalid');
  const d22b = await validateSource(
    { xml: xml.replace('urn:cen.eu:en16931:2017', 'urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended') },
    { suite: 'facturx-1.09.2', scope: 'schema' },
  );
  assert.equal(d22b.schema, 'passed');
});
test('a future CII profile identifier cannot identify the current syntax release', async () => {
  const xml = readFileSync(new URL('./fixtures/xrechnung-cii.xml', import.meta.url), 'utf8').replace('xrechnung_3.0', 'xrechnung_9.0');
  const summary = await validateSource({ xml }, { scope: 'schema' });
  assert.equal(summary.result, 'incomplete');
  assert.equal(summary.schema, 'not-run');
});
test('a future UBL CIUS cannot supply an unstated syntax edition', async () => {
  const xml = ubl.replace(
    'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0',
    'urn:cen.eu:en16931:2017#compliant#urn:feap.gov.pt:CIUS-PT:9.9',
  );
  const summary = await validateSource({ xml }, { scope: 'schema' });
  assert.equal(summary.result, 'incomplete');
  assert.equal(summary.schema, 'not-run');
});
