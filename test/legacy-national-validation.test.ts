import { expect, test } from 'bun:test';
import { validateSource } from '../src/index.js';

for (const version of ['1.3', '2.0', '2.01']) {
  test(`Finvoice ${version} uses its exact official schema and rejects a newer field`, async () => {
    const xml = await Bun.file(new URL(`./validation-fixtures/legacy/finvoice-${version}.xml`, import.meta.url)).text();
    const result = await validateSource({ xml }, { scope: 'schema' });
    expect(result.bundles.schema).toBe(`xsd-finvoice-${version}`);
    expect(result.schema).toBe('passed');
    const negative = xml.replace(
      '<InvoiceTotalVatExcludedAmount',
      '<RowsTotalVatExcludedAmount AmountCurrencyIdentifier="EUR">100,00</RowsTotalVatExcludedAmount><InvoiceTotalVatExcludedAmount',
    );
    expect((await validateSource({ xml: negative }, { scope: 'schema' })).schema).toBe('failed');
    expect((await validateSource({ xml: negative.replace(`Version="${version}"`, 'Version="3.0"') }, { scope: 'schema' })).schema).toBe(
      'passed',
    );
  });
}
for (const version of ['4.0', '4.1', '4.2']) {
  test(`ebInterface ${version} selects exact namespace schema and rejects a missing invoice date`, async () => {
    const xml = await Bun.file(new URL(`./validation-fixtures/legacy/ebinterface-${version}.xml`, import.meta.url)).text();
    const result = await validateSource({ xml }, { scope: 'schema' });
    expect(result.bundles.schema).toBe(`xsd-ebinterface-${version}`);
    expect(result.schema).toBe('passed');
    const negative = xml.replace(/<InvoiceDate>[^<]*<\/InvoiceDate>/, '');
    expect((await validateSource({ xml: negative }, { scope: 'schema' })).schema).toBe('failed');
  });
}
for (const version of ['3.0', '3.1']) {
  test(`Facturae ${version} uses exact namespace schema and rejects missing issue date`, async () => {
    const xml = await Bun.file(new URL(`./validation-fixtures/legacy/facturae-${version}.xml`, import.meta.url)).text();
    const result = await validateSource({ xml }, { scope: 'schema' });
    expect(result.bundles.schema).toBe(`xsd-facturae-${version}`);
    expect(result.schema).toBe('passed');
    expect((await validateSource({ xml: xml.replace(/<IssueDate>[^<]*<\/IssueDate>/, '') }, { scope: 'schema' })).schema).toBe('failed');
  });
}
test('OIOUBL2.02 uses UBL2.0 syntax and rejects a missing issue date', async () => {
  const xml = await Bun.file(new URL('./validation-fixtures/legacy/oioubl-2.02.xml', import.meta.url)).text();
  const result = await validateSource({ xml }, { scope: 'schema' });
  expect(result.bundles.schema).toBe('xsd-ubl-2.0');
  expect(result.schema).toBe('passed');
  expect((await validateSource({ xml: xml.replace(/<cbc:IssueDate>[^<]*<\/cbc:IssueDate>/, '') }, { scope: 'schema' })).schema).toBe(
    'failed',
  );
});
for (const version of ['3.3', '4.0']) {
  test(`CFDI ${version} checks core and Timbre schemas and rejects a missing RFC`, async () => {
    const file = version === '4.0' ? 'cfdi-40.xml' : 'cfdi-33.xml';
    const xml = await Bun.file(new URL(`./validation-fixtures/legacy/${file}`, import.meta.url)).text();
    const result = await validateSource({ xml }, { scope: 'schema' });
    expect(result.bundles.schema).toBe(`xsd-cfdi-${version}`);
    expect(result.schema).toBe('passed');
    const negative = xml.replace(/ Rfc="[^"]+"/, '');
    expect((await validateSource({ xml: negative }, { scope: 'schema' })).schema).toBe('failed');
  });
}
test('unpackaged CFDI complements are incomplete rather than falsely invalid documents', async () => {
  const xml = (await Bun.file(new URL('./validation-fixtures/legacy/cfdi-40.xml', import.meta.url)).text()).replace(
    '<cfdi:Complemento>',
    '<cfdi:Complemento><extra:Unknown xmlns:extra="urn:synthetic:unpackaged-complement"/>',
  );
  const result = await validateSource({ xml }, { scope: 'schema' });
  expect(result.result).toBe('incomplete');
  expect(result.reasons?.schema).toBe('unsupported');
  expect(result.schema).not.toBe('failed');
});
