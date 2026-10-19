import { expect, test } from 'bun:test';
import { validateSource } from '../src/index.js';

const fixture = (name: string) => Bun.file(new URL(`./validation-fixtures/remaining-legacy/${name}.xml`, import.meta.url)).text();

test('ebInterface3.0 uses its exact official schema', async () => {
  const xml = await fixture('ebinterface-3.0');
  const result = await validateSource({ xml }, { scope: 'schema' });
  expect(result.bundles.schema).toBe('xsd-ebinterface-3.0');
  expect(result.schema).toBe('passed');
});

test('ebInterface3.0 rejects a missing invoice date and unknown namespace edition', async () => {
  const xml = await fixture('ebinterface-3.0');
  expect((await validateSource({ xml: xml.replace(/<InvoiceDate>[^<]*<\/InvoiceDate>/, '') }, { scope: 'schema' })).schema).toBe('failed');
  const unknown = await validateSource({ xml: xml.replaceAll('schema/3p0/', 'schema/3p99/') }, { scope: 'schema' });
  expect(unknown.result).toBe('incomplete');
  expect(unknown.bundles.schema).toBeUndefined();
  expect((await validateSource({ xml })).result).toBe('incomplete');
});

test('ebInterface3.02 uses its exact official schema', async () => {
  const xml = await fixture('ebinterface-3.02');
  const result = await validateSource({ xml }, { scope: 'schema' });
  expect(result.bundles.schema).toBe('xsd-ebinterface-3.02');
  expect(result.schema).toBe('passed');
});

test('ordinary e-arve1.2 requires its explicit suite and exact official schema', async () => {
  const xml = await fixture('e-arve-1.2');
  const result = await validateSource({ xml }, { scope: 'schema', suite: 'e-arve-1.2' });
  expect(result.bundles.schema).toBe('xsd-e-arve-1.2');
  expect(result.schema).toBe('passed');
});

test('ebInterface3.02 rejects missing date and cannot inherit an unknown edition', async () => {
  const xml = await fixture('ebinterface-3.02');
  expect((await validateSource({ xml: xml.replace(/<InvoiceDate>[^<]*<\/InvoiceDate>/, '') }, { scope: 'schema' })).schema).toBe('failed');
  expect((await validateSource({ xml: xml.replaceAll('schema/3p02/', 'schema/3p99/') }, { scope: 'schema' })).result).toBe('incomplete');
});

test('ordinary e-arve1.2 rejects a missing invoice number and unsupported version', async () => {
  const xml = await fixture('e-arve-1.2');
  const options = { scope: 'schema', suite: 'e-arve-1.2' } as const;
  expect((await validateSource({ xml: xml.replace(/<InvoiceNumber>[^<]*<\/InvoiceNumber>/, '') }, options)).schema).toBe('failed');
  expect((await validateSource({ xml: xml.replace('<Version>1.2</Version>', '<Version>9.9</Version>') }, options)).result).toBe(
    'incomplete',
  );
  expect((await validateSource({ xml }, { scope: 'schema' })).result).toBe('incomplete');
  expect((await validateSource({ xml }, { suite: 'e-arve-1.2' })).result).toBe('incomplete');
});

test('ISDOC6.0.1 executes its matching official schema and native rules', async () => {
  const xml = await fixture('isdoc-6.0.1');
  const result = await validateSource({ xml });
  expect(result.bundles.schema).toBe('xsd-isdoc-6.0.1');
  expect(result.bundles.profile).toBe('isdoc-6.0.1-rules');
  expect(result.result).toBe('valid');
});

test('ISDOC6.0.1 native controls reject an unreferenced credit while preserving schema success', async () => {
  const xml = (await fixture('isdoc-6.0.1')).replace('<DocumentType>1</DocumentType>', '<DocumentType>2</DocumentType>');
  const result = await validateSource({ xml });
  expect(result.schema).toBe('passed');
  expect(result.profile).toBe('failed');
  expect(result.findings.some((f) => f.layer === 'profile' && f.message.includes('OriginalDocumentReference'))).toBe(true);
});

test('ISDOC6.0.1 rejects missing ID and cannot select native rules for unknown versions', async () => {
  const xml = await fixture('isdoc-6.0.1');
  expect((await validateSource({ xml: xml.replace(/<ID>[^<]*<\/ID>/, '') })).schema).toBe('failed');
  const result = await validateSource({ xml: xml.replace('version="6.0.1"', 'version="6.0.99"') });
  expect(result.result).toBe('incomplete');
  expect(result.bundles.profile).toBeUndefined();
});

test('ISDOC5.3.1 uses its own older namespace schema', async () => {
  const xml = await fixture('isdoc-5.3.1');
  const result = await validateSource({ xml }, { scope: 'schema' });
  expect(result.bundles.schema).toBe('xsd-isdoc-5.3.1');
  expect(result.schema).toBe('passed');
});

test('ISDOC5.3.1 validates required data but cannot claim native or future-version coverage', async () => {
  const xml = await fixture('isdoc-5.3.1');
  expect((await validateSource({ xml: xml.replace(/<ID>[^<]*<\/ID>/, '') }, { scope: 'schema' })).schema).toBe('failed');
  expect((await validateSource({ xml })).result).toBe('incomplete');
  const unknown = await validateSource({ xml: xml.replace('version="5.3.1"', 'version="5.99"') }, { scope: 'schema' });
  expect(unknown.result).toBe('incomplete');
  expect(unknown.bundles.schema).toBeUndefined();
  const wrongNamespace = await validateSource({ xml: xml.replaceAll('namespace/invoice', 'namespace/2013') }, { scope: 'schema' });
  expect(wrongNamespace.result).toBe('incomplete');
});

test('UBL.BE1.31 uses the authority combined native suite', async () => {
  const xml = await fixture('ublbe-1.31-invoice');
  const result = await validateSource({ xml });
  expect(result.bundles.profile).toBe('ublbe-1.31-rules');
  expect(result.result).toBe('valid');
});

test('UBL.BE native Belgian codes fail independently of UBL schema and unknown specifications stay incomplete', async () => {
  const xml = await fixture('ublbe-1.31-invoice');
  const negative = await validateSource({ xml: xml.replaceAll('<cbc:Name>03</cbc:Name>', '<cbc:Name>INVALID</cbc:Name>') });
  expect(negative.schema).toBe('passed');
  expect(negative.profile).toBe('failed');
  expect(negative.findings.some((f) => f.ruleId === 'ubl-BE-10' && f.severity === 'fatal')).toBe(true);
  const unknown = await validateSource({ xml: xml.replace('urn:UBL.BE:1.0.0.20180214', 'urn:UBL.BE:99.0') });
  expect(unknown.result).toBe('incomplete');
  expect(unknown.bundles.profile).toBeUndefined();
});

test('UBL.BE1.31 credit notes execute the same matching combined authority suite', async () => {
  const result = await validateSource({ xml: await fixture('ublbe-1.31-creditnote') });
  expect(result.bundles.profile).toBe('ublbe-1.31-rules');
  expect(result.result).toBe('valid');
});

test('Peppol BIS2 Invoice executes the matching archived BII and native/core rules', async () => {
  const result = await validateSource({ xml: await fixture('peppol-bis2-invoice') });
  expect(result.bundles.semantic).toBe('peppol-bis2-bii-invoice-3.7.0');
  expect(result.bundles.profile).toBe('peppol-bis2-invoice-3.7.0');
  expect(result.result).toBe('valid');
});

test('UBL.BE credit-note Belgian codes are checked independently of UBL syntax', async () => {
  const xml = (await fixture('ublbe-1.31-creditnote')).replaceAll('<cbc:Name>03</cbc:Name>', '<cbc:Name>INVALID</cbc:Name>');
  const result = await validateSource({ xml });
  expect(result.schema).toBe('passed');
  expect(result.profile).toBe('failed');
  expect(result.findings.some((f) => f.ruleId === 'ubl-BE-10')).toBe(true);
});

test('Peppol BIS2 cannot claim native completeness for a wrong or missing official process', async () => {
  const xml = await fixture('peppol-bis2-invoice');
  const wrong = await validateSource({
    xml: xml.replace('urn:www.cenbii.eu:profile:bii04:ver2.0', 'urn:www.cenbii.eu:profile:bii99:ver2.0'),
  });
  expect(wrong.result).toBe('incomplete');
  expect(wrong.bundles.profile).toBeUndefined();
  const missing = await validateSource({ xml: xml.replace(/\s*<cbc:ProfileID>[^<]*<\/cbc:ProfileID>/, '') });
  expect(missing.result).toBe('incomplete');
  expect(missing.bundles.profile).toBeUndefined();
});

test('ISDOC5.3 uses its matching historical schema', async () => {
  const result = await validateSource({ xml: await fixture('isdoc-5.3') }, { scope: 'schema' });
  expect(result.bundles.schema).toBe('xsd-isdoc-5.3');
  expect(result.schema).toBe('passed');
});

for (const version of ['5.3', '5.2.3', '5.2.2', '5.2.1', '5.2', '5.1']) {
  test(`ISDOC${version} required data and unknown-edition controls`, async () => {
    const xml = await fixture(`isdoc-${version}`);
    expect((await validateSource({ xml: xml.replace(/<ID>[^<]*<\/ID>/, '') }, { scope: 'schema' })).schema).toBe('failed');
    expect((await validateSource({ xml })).result).toBe('incomplete');
    const unknown = await validateSource({ xml: xml.replace(`version="${version}"`, 'version="99.0"') }, { scope: 'schema' });
    expect(unknown.result).toBe('incomplete');
    expect(unknown.bundles.schema).toBeUndefined();
  });
}

test('ISDOC5.2.3 uses its matching historical schema', async () => {
  const result = await validateSource({ xml: await fixture('isdoc-5.2.3') }, { scope: 'schema' });
  expect(result.bundles.schema).toBe('xsd-isdoc-5.2.3');
  expect(result.schema).toBe('passed');
});

test('ISDOC5.2.2 uses its matching historical schema', async () => {
  const result = await validateSource({ xml: await fixture('isdoc-5.2.2') }, { scope: 'schema' });
  expect(result.bundles.schema).toBe('xsd-isdoc-5.2.2');
  expect(result.schema).toBe('passed');
});

test('ISDOC5.2.1 uses its matching historical schema', async () => {
  const result = await validateSource({ xml: await fixture('isdoc-5.2.1') }, { scope: 'schema' });
  expect(result.bundles.schema).toBe('xsd-isdoc-5.2.1');
  expect(result.schema).toBe('passed');
});

test('BIS2 BII seller identity rules are independent of UBL schema', async () => {
  const xml = (await fixture('peppol-bis2-invoice')).replace(/\s*<cac:PartyName>[\s\S]*?<\/cac:PartyName>/g, '');
  const result = await validateSource({ xml });
  expect(result.schema).toBe('passed');
  expect(result.semantic).toBe('failed');
  expect(result.findings.some((f) => f.layer === 'semantic' && f.ruleId === 'BII2-T10-R006')).toBe(true);
});

test('BIS2 native tax-code metadata rules are independent of BII and UBL', async () => {
  const xml = (await fixture('peppol-bis2-invoice')).replace(' schemeID="UNCL5305"', '');
  const result = await validateSource({ xml });
  expect(result.schema).toBe('passed');
  expect(result.semantic).toBe('passed');
  expect(result.profile).toBe('failed');
  expect(result.findings.some((f) => f.layer === 'profile' && f.ruleId === 'EUGEN-T10-R032')).toBe(true);
});

test('BIS2 inherited CORE patterns report unsupported optional data as warnings', async () => {
  const xml = (await fixture('peppol-bis2-invoice')).replace('</cbc:IssueDate>', '</cbc:IssueDate><cbc:IssueTime>12:00:00</cbc:IssueTime>');
  const result = await validateSource({ xml });
  expect(result.result).toBe('valid');
  expect(result.findings.some((f) => f.ruleId === 'PEPPOL_CORE_R002' && f.severity === 'warning' && f.message.includes('IssueTime'))).toBe(
    true,
  );
});

test('BIS2 Invoice5a selects the matching archived invoice suite', async () => {
  const xml = (await fixture('peppol-bis2-invoice')).replace('peppol4a:ver2.0', 'peppol5a:ver2.0').replace('bii04:ver2.0', 'bii05:ver2.0');
  const result = await validateSource({ xml });
  expect(result.bundles.profile).toBe('peppol-bis2-invoice-3.7.0');
  expect(result.result).toBe('valid');
});

test('BIS2 CreditNote5a uses its own archived BII and native/Core rules', async () => {
  const result = await validateSource({ xml: await fixture('peppol-bis2-creditnote') });
  expect(result.bundles.semantic).toBe('peppol-bis2-bii-creditnote-3.7.0');
  expect(result.bundles.profile).toBe('peppol-bis2-creditnote-3.7.0');
  expect(result.result).toBe('valid');
});

test('ISDOC5.2 uses the official October schema with the same constraints as July', async () => {
  const result = await validateSource({ xml: await fixture('isdoc-5.2') }, { scope: 'schema' });
  expect(result.bundles.schema).toBe('xsd-isdoc-5.2');
  expect(result.schema).toBe('passed');
});

test('ISDOC5.1 uses its exact historical schema closure', async () => {
  const result = await validateSource({ xml: await fixture('isdoc-5.1') }, { scope: 'schema' });
  expect(result.bundles.schema).toBe('xsd-isdoc-5.1');
  expect(result.schema).toBe('passed');
});

test('BIS2 CreditNote BII and native predicates remain separately observable', async () => {
  const xml = await fixture('peppol-bis2-creditnote');
  const bii = await validateSource({ xml: xml.replace(/\s*<cac:PartyName>[\s\S]*?<\/cac:PartyName>/g, '') });
  expect(bii.schema).toBe('passed');
  expect(bii.findings.some((f) => f.layer === 'semantic' && f.ruleId === 'BII2-T14-R006')).toBe(true);
  const native = await validateSource({ xml: xml.replace(' schemeID="UNCL5305"', '') });
  expect(native.schema).toBe('passed');
  expect(native.semantic).toBe('passed');
  expect(native.findings.some((f) => f.layer === 'profile' && f.ruleId === 'EUGEN-T14-R032')).toBe(true);
});

test('BIS2 CreditNote CORE warning and unsupported process controls remain distinct', async () => {
  const xml = await fixture('peppol-bis2-creditnote');
  const warned = await validateSource({ xml: xml.replace('</cbc:IssueDate>', '</cbc:IssueDate><cbc:IssueTime>12:00:00</cbc:IssueTime>') });
  expect(warned.result).toBe('valid');
  expect(warned.findings.some((f) => f.ruleId === 'PEPPOL_CORE_R002' && f.severity === 'warning' && f.message.includes('IssueTime'))).toBe(
    true,
  );
  const unknown = await validateSource({ xml: xml.replace('bii05:ver2.0', 'bii99:ver2.0') });
  expect(unknown.result).toBe('incomplete');
  expect(unknown.bundles.profile).toBeUndefined();
});

for (const [kind, transaction] of [
  ['invoice', '10'],
  ['creditnote', '14'],
] as const) {
  test(`BIS2 ${kind} MIME membership preserves first, common and last codes and rejects nonmembers`, async () => {
    const xml = await fixture(`peppol-bis2-${kind}`);
    const withMime = (code: string) =>
      xml.replace(
        '<cac:AccountingSupplierParty>',
        `<cac:AdditionalDocumentReference><cbc:ID>SYNTHETIC-MIME</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="${code}" filename="synthetic.bin">U3ludGhldGlj</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference><cac:AccountingSupplierParty>`,
      );
    for (const code of ['application/activemessage', 'application/pdf', 'video/vnd.vivo']) {
      const result = await validateSource({ xml: withMime(code) });
      expect(result.schema).toBe('passed');
      expect(result.semantic).toBe('passed');
    }
    const invalid = await validateSource({ xml: withMime('application/x-synthetic-invalid-mime') });
    expect(invalid.schema).toBe('passed');
    expect(invalid.semantic).toBe('failed');
    expect(invalid.findings.some((f) => f.ruleId === `CL-T${transaction}-R008` && f.severity === 'fatal')).toBe(true);
  });
}

for (const [kind, transaction] of [
  ['invoice', '10'],
  ['creditnote', '14'],
] as const) {
  test(`BIS2 ${kind} executes native identifier-scheme attribute contexts`, async () => {
    const xml = (await fixture(`peppol-bis2-${kind}`)).replace('schemeID="SE:ORGNR"', 'schemeID="0007"');
    const result = await validateSource({ xml });
    expect(result.schema).toBe('passed');
    expect(result.semantic).toBe('passed');
    expect(result.profile).toBe('failed');
    expect(result.findings.some((f) => f.ruleId === `OP-T${transaction}-R002` && f.severity === 'fatal')).toBe(true);
  });
}
