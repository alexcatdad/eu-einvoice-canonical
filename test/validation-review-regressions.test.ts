import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateSource } from '../src/index.js';
import { countLines } from '../src/validation/index.js';

const invoice = readFileSync(new URL('./fixtures/xrechnung-ubl.xml', import.meta.url), 'utf8');
const signatureNamespace = 'urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2';
const extension = (namespace = signatureNamespace, child = '<sac:SignatureInformation/>') => `
  <ext:UBLExtensions xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
    <ext:UBLExtension><ext:ExtensionContent>
      <sig:UBLDocumentSignatures xmlns:sig="${namespace}"
        xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2">
        ${child}
      </sig:UBLDocumentSignatures>
    </ext:ExtensionContent></ext:UBLExtension>
  </ext:UBLExtensions>`;
const withExtension = (value: string) =>
  invoice
    .replace('urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0', 'urn:cen.eu:en16931:2017')
    .replace('<cbc:CustomizationID>', `${value}<cbc:CustomizationID>`);

test('the standard UBL signature container has source coverage without claiming signature validity', { timeout: 60_000 }, async () => {
  const summary = await validateSource({ xml: withExtension(extension()) });
  assert.equal(summary.schema, 'passed');
  assert.equal(summary.semantic, 'passed');
  assert.equal(summary.result, 'valid', JSON.stringify(summary.findings));
  assert.equal(summary.signature, 'not-run');
});

test('malformed standard signature content still fails the source schema', { timeout: 60_000 }, async () => {
  const summary = await validateSource({ xml: withExtension(extension(signatureNamespace, '<sig:Unexpected/>')) });
  assert.equal(summary.schema, 'failed');
  assert.equal(summary.result, 'invalid');
});

test('a lookalike signature extension in an unknown namespace remains incomplete', { timeout: 60_000 }, async () => {
  const summary = await validateSource({ xml: withExtension(extension('urn:example:unknown')) });
  assert.equal(summary.schema, 'passed');
  assert.equal(summary.result, 'incomplete');
  assert.equal(summary.reasons?.profile, 'unsupported');
});

test('ISDOC native rules honor the line limit while its schema still runs', { timeout: 60_000 }, async () => {
  for (const file of ['national/isdoc.isdoc', 'remaining-legacy/isdoc-6.0.1.xml']) {
    const xml = readFileSync(new URL(`./validation-fixtures/${file}`, import.meta.url), 'utf8');
    const limited = await validateSource({ xml }, { maxSchematronLines: 0 });
    assert.equal(limited.schema, 'passed');
    assert.equal(limited.profile, 'not-run');
    assert.equal(limited.reasons?.profile, 'size-limit');
    assert.equal(limited.result, 'incomplete');
    assert.equal(limited.receipt?.artifacts.profile, undefined, 'Skipped rules must not load an artifact');
    const atLimit = await validateSource({ xml }, { maxSchematronLines: countLines(xml) });
    assert.equal(atLimit.profile, 'passed');
  }
});

test('ISDOC line counting respects namespaces, ignores text and stops beyond the limit', () => {
  const xml =
    '<Invoice xmlns="http://isdoc.cz/namespace/2013"><!-- <InvoiceLine/> --><![CDATA[<InvoiceLine/>]]><InvoiceLine xmlns="urn:other"/><InvoiceLine/><i:InvoiceLine xmlns:i="http://isdoc.cz/namespace/2013"/></Invoice>';
  assert.equal(countLines(xml), 2);
  assert.equal(countLines(xml, 0), 1);
});

test('custom runners without engine identities do not claim the built-in engines', async () => {
  const summary = await validateSource({ xml: invoice }, { runners: { schema: async () => [], schematron: async () => [] } });
  assert.equal(summary.result, 'valid');
  assert.deepEqual(summary.receipt?.engines, {});
});

test('receipts preserve custom runner identities', async () => {
  const engines = { schema: 'example-schema@1', schematron: 'example-schematron@2' };
  const runners = { engines, schema: async () => [], schematron: async () => [] };
  const summary = await validateSource({ xml: invoice }, { runners });
  assert.equal(summary.result, 'valid');
  assert.deepEqual(summary.receipt?.engines, engines);
});

test('default runner receipts retain the bundled engine identities', async () => {
  const summary = await validateSource({ xml: invoice }, { scope: 'schema' });
  assert.deepEqual(summary.receipt?.engines, { schema: 'xmllint-wasm@5.3.0', schematron: 'saxon-js@2.7.0' });
});
