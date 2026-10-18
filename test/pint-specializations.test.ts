import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateSource } from '../src/index.js';

test('PINT SG executes its pinned specialization after the exact shared billing rules', async () => {
  const xml = readFileSync(new URL('./validation-fixtures/pint/sg-invoice.xml', import.meta.url), 'utf8');
  const summary = await validateSource({ xml });
  assert.equal(summary.schema, 'passed');
  assert.equal(summary.semantic, 'passed');
  assert.equal(summary.profile, 'passed', JSON.stringify(summary.findings));
  assert.equal(summary.bundles.profile, 'pint-sg-1.4.1');
  assert.equal(summary.result, 'valid');
});
test('PINT SG jurisdiction failures remain schema-valid and preserve independent shared results', async () => {
  const xml = readFileSync(new URL('./validation-fixtures/pint/sg-invoice.xml', import.meta.url), 'utf8').replace(
    '<cbc:UUID>00000000-0000-4000-8000-000000000001</cbc:UUID>',
    '',
  );
  const summary = await validateSource({ xml });
  assert.equal(summary.schema, 'passed');
  assert.equal(summary.semantic, 'passed');
  assert.equal(summary.profile, 'failed');
  assert.ok(summary.findings.some((finding) => finding.ruleId === 'BR-108-GST-SG' && finding.severity === 'fatal' && finding.path));
});
test('PINT SG independently executes its shared arithmetic obligations', async () => {
  const xml = readFileSync(new URL('./validation-fixtures/pint/sg-invoice.xml', import.meta.url), 'utf8').replace(
    '<cbc:PayableAmount currencyID="SGD">745.00',
    '<cbc:PayableAmount currencyID="SGD">746.00',
  );
  const summary = await validateSource({ xml });
  assert.equal(summary.schema, 'passed');
  assert.equal(summary.semantic, 'failed');
  assert.ok(summary.findings.some((finding) => finding.ruleId === 'ibr-co-16' && finding.severity === 'fatal'));
});
test('PINT A-NZ billing executes its exact distribution chain', async () => {
  const xml = readFileSync(new URL('./validation-fixtures/pint/aunz-invoice.xml', import.meta.url), 'utf8');
  const summary = await validateSource({ xml });
  assert.equal(summary.schema, 'passed');
  assert.equal(summary.semantic, 'passed');
  assert.equal(summary.profile, 'passed', JSON.stringify(summary.findings));
  assert.equal(summary.bundles.profile, 'pint-aunz-1.1.3');
  assert.equal(summary.result, 'valid');
});
test('PINT does not claim coverage of an unknown process suffix accepted by a broad publisher regex', async () => {
  const xml = readFileSync(new URL('./validation-fixtures/pint/aunz-invoice.xml', import.meta.url), 'utf8').replace(
    'urn:peppol:bis:billing</cbc:ProfileID>',
    'urn:peppol:bis:billing#urn:example:unknown-process</cbc:ProfileID>',
  );
  const summary = await validateSource({ xml });
  assert.equal(summary.schema, 'passed');
  assert.equal(summary.semantic, 'passed');
  assert.equal(summary.profile, 'passed');
  assert.equal(summary.result, 'incomplete');
  assert.equal(summary.reasons?.profile, 'unsupported');
});
test('Japan PINT billing executes the official invoice-only jurisdiction chain', async () => {
  const xml = readFileSync(new URL('./validation-fixtures/pint/jp-invoice.xml', import.meta.url), 'utf8');
  const summary = await validateSource({ xml });
  assert.equal(summary.schema, 'passed');
  assert.equal(summary.semantic, 'passed');
  assert.equal(summary.profile, 'passed', JSON.stringify(summary.findings));
  assert.equal(summary.bundles.profile, 'pint-jp-1.1.3');
  assert.equal(summary.result, 'valid');
});
test('Malaysia PINT billing executes its official jurisdiction chain', async () => {
  const xml = readFileSync(new URL('./validation-fixtures/pint/my-invoice.xml', import.meta.url), 'utf8');
  const summary = await validateSource({ xml });
  assert.equal(summary.schema, 'passed');
  assert.equal(summary.semantic, 'passed');
  assert.equal(summary.profile, 'passed', JSON.stringify(summary.findings));
  assert.equal(summary.bundles.profile, 'pint-my-1.3.1');
  assert.equal(summary.result, 'valid');
});
test('UAE PINT selects its own distribution shared rules and specialization', async () => {
  const xml = readFileSync(new URL('./validation-fixtures/pint/ae-invoice.xml', import.meta.url), 'utf8');
  const summary = await validateSource({ xml });
  assert.equal(summary.schema, 'passed');
  assert.equal(summary.semantic, 'passed');
  assert.equal(summary.profile, 'passed', JSON.stringify(summary.findings));
  assert.equal(summary.bundles.semantic, 'pint-ae-shared-1.0.4');
  assert.equal(summary.bundles.profile, 'pint-ae-1.0.4');
  assert.equal(summary.result, 'valid');
});
test('Oman PINT billing executes its pinned jurisdiction chain', async () => {
  const xml = readFileSync(new URL('./validation-fixtures/pint/om-invoice.xml', import.meta.url), 'utf8');
  const summary = await validateSource({ xml });
  assert.equal(summary.schema, 'passed');
  assert.equal(summary.semantic, 'passed', JSON.stringify(summary.findings));
  assert.equal(summary.profile, 'passed', JSON.stringify(summary.findings));
  assert.equal(summary.bundles.profile, 'pint-om-1.0.1');
  assert.equal(summary.result, 'valid');
});
test('A-NZ self-billing uses its own shared and specialization artifacts', async () => {
  const xml = readFileSync(new URL('./validation-fixtures/pint/aunz-sb-invoice.xml', import.meta.url), 'utf8');
  const summary = await validateSource({ xml });
  assert.equal(summary.bundles.semantic, 'pint-aunz-sb-shared-1.1.3');
  assert.equal(summary.bundles.profile, 'pint-aunz-sb-1.1.3');
  assert.equal(summary.result, 'valid', JSON.stringify(summary.findings));
});
test('Malaysia self-billing uses its separately published shared and native pair', async () => {
  const xml = readFileSync(new URL('./validation-fixtures/pint/my-sb-invoice.xml', import.meta.url), 'utf8');
  const summary = await validateSource({ xml });
  assert.equal(summary.bundles.semantic, 'pint-my-sb-shared-1.3.1');
  assert.equal(summary.bundles.profile, 'pint-my-sb-1.3.1');
  assert.equal(summary.result, 'valid', JSON.stringify(summary.findings));
});
test('PINT EU executes shared, EN-aligned, and jurisdiction obligations together', async () => {
  const xml = readFileSync(new URL('./validation-fixtures/pint/eu-invoice.xml', import.meta.url), 'utf8');
  const summary = await validateSource({ xml });
  assert.equal(summary.bundles.profile, 'pint-eu-1.1.1');
  assert.equal(summary.result, 'valid', JSON.stringify(summary.findings));
});
test('UAE self-billing selects its separate shared artifact and byte-identical native rules', async () => {
  const xml = readFileSync(new URL('./validation-fixtures/pint/ae-sb-invoice.xml', import.meta.url), 'utf8');
  const summary = await validateSource({ xml });
  assert.equal(summary.bundles.semantic, 'pint-ae-sb-shared-1.0.4');
  assert.equal(summary.bundles.profile, 'pint-ae-1.0.4');
  assert.equal(summary.result, 'valid', JSON.stringify(summary.findings));
});
test('Japan PINT self-billing selects its separately published invoice artifacts', async () => {
  const xml = readFileSync(new URL('./validation-fixtures/pint/jp-sb-invoice.xml', import.meta.url), 'utf8');
  const summary = await validateSource({ xml });
  assert.equal(summary.bundles.semantic, 'pint-jp-sb-shared-1.1.3');
  assert.equal(summary.bundles.profile, 'pint-jp-sb-1.1.3');
  assert.equal(summary.result, 'valid', JSON.stringify(summary.findings));
});
test('Oman PINT self-billing selects its separate shared and jurisdiction artifacts', async () => {
  const xml = readFileSync(new URL('./validation-fixtures/pint/om-sb-invoice.xml', import.meta.url), 'utf8');
  const summary = await validateSource({ xml });
  assert.equal(summary.bundles.semantic, 'pint-om-sb-shared-1.0.1');
  assert.equal(summary.bundles.profile, 'pint-om-sb-1.0.1');
  assert.equal(summary.result, 'valid', JSON.stringify(summary.findings));
});
for (const [name, profile] of [
  ['sg', 'pint-sg-1.4.1'],
  ['aunz', 'pint-aunz-1.1.3'],
  ['my', 'pint-my-1.3.1'],
  ['ae', 'pint-ae-1.0.4'],
  ['om', 'pint-om-1.0.1'],
  ['eu', 'pint-eu-1.1.1'],
  ['aunz-sb', 'pint-aunz-sb-1.1.3'],
  ['my-sb', 'pint-my-sb-1.3.1'],
  ['ae-sb', 'pint-ae-1.0.4'],
  ['om-sb', 'pint-om-sb-1.0.1'],
]) {
  test(`${name} credit note executes the corresponding published PINT chain`, async () => {
    const xml = readFileSync(new URL(`./validation-fixtures/pint/${name}-creditnote.xml`, import.meta.url), 'utf8');
    const summary = await validateSource({ xml });
    assert.equal(summary.schema, 'passed', JSON.stringify(summary.findings));
    assert.equal(summary.bundles.profile, profile);
    assert.equal(summary.result, 'valid', JSON.stringify(summary.findings));
  });
}
for (const [name, drop, rule] of [
  ['aunz', 'cbc:BuyerReference', 'aligned-ibrp-003'],
  ['aunz-sb', 'cbc:BuyerReference', 'aligned-ibrp-003'],
  ['jp', 'cac:InvoicePeriod', 'aligned-ibrp-052'],
  ['jp-sb', 'cac:InvoicePeriod', 'aligned-ibrp-052'],
  ['ae', 'cbc:CountrySubentity', 'ibr-143-ae'],
  ['ae-sb', 'cbc:CountrySubentity', 'ibr-143-ae'],
  ['om', 'cbc:IssueTime', 'ALIGNED-IBRP-016-OM'],
  ['om-sb', 'cbc:IssueTime', 'ALIGNED-IBRP-016-OM'],
  ['eu', 'cbc:BuyerReference', 'PEPPOL-EN16931-R003'],
  ['eu', 'cac:PartyTaxScheme', 'BR-S-02'],
]) {
  test(`${name} independently rejects the schema-valid native ${rule} violation`, async () => {
    const source = readFileSync(new URL(`./validation-fixtures/pint/${name}-invoice.xml`, import.meta.url), 'utf8');
    const xml = source.replace(new RegExp(`<${drop}\\b[^>]*>[\\s\\S]*?</${drop}>`), '');
    assert.notEqual(xml, source);
    const summary = await validateSource({ xml });
    assert.equal(summary.schema, 'passed');
    assert.equal(summary.semantic, 'passed');
    assert.equal(summary.profile, 'failed');
    assert.ok(summary.findings.some((finding) => finding.ruleId === rule && finding.severity === 'fatal' && finding.path));
  });
}
for (const name of ['my', 'my-sb']) {
  test(`${name} independently enforces the Malaysian tax category code list`, async () => {
    const source = readFileSync(new URL(`./validation-fixtures/pint/${name}-invoice.xml`, import.meta.url), 'utf8');
    const xml = source.replace('<cbc:ID>SE</cbc:ID>', '<cbc:ID>S</cbc:ID>');
    assert.notEqual(xml, source);
    const summary = await validateSource({ xml });
    assert.equal(summary.schema, 'passed');
    assert.equal(summary.semantic, 'passed');
    assert.equal(summary.profile, 'failed');
    assert.ok(summary.findings.some((finding) => finding.ruleId === 'aligned-ibrp-cl-01-my' && finding.severity === 'fatal'));
  });
}
for (const name of ['aunz-sb', 'my-sb', 'jp-sb', 'ae', 'ae-sb', 'om-sb']) {
  test(`${name} independently executes its exact distribution shared arithmetic rules`, async () => {
    const source = readFileSync(new URL(`./validation-fixtures/pint/${name}-invoice.xml`, import.meta.url), 'utf8');
    const xml = source.replace(/(<cbc:PayableAmount[^>]*>)([^<]*)/, (_match, tag, amount) => tag + String(Number(amount) + 1));
    const summary = await validateSource({ xml });
    assert.equal(summary.schema, 'passed');
    assert.equal(summary.semantic, 'failed');
    assert.ok(
      summary.findings.some((finding) => finding.layer === 'semantic' && finding.ruleId === 'ibr-co-16' && finding.severity === 'fatal'),
    );
  });
}
test('unqualified PINT jurisdiction chains, future syntax, and edition choices never inherit native completeness', async () => {
  const source = readFileSync(new URL('./validation-fixtures/pint/ae-invoice.xml', import.meta.url), 'utf8');
  for (const xml of [
    source.replace('billing-1@ae-1', 'billing-1@ae-1#conformant#urn:example:unknown'),
    source.replace('billing-1@ae-1', 'billing-1@ae-99'),
    source.replace('<cbc:CustomizationID>', '<cbc:UBLVersionID>2.3</cbc:UBLVersionID><cbc:CustomizationID>'),
  ]) {
    const summary = await validateSource({ xml });
    assert.equal(summary.completeness, 'incomplete');
    assert.equal(summary.bundles.profile, undefined);
  }
  const wrongSuite = await validateSource({ xml: source }, { suite: 'cii-d16b' });
  assert.equal(wrongSuite.result, 'incomplete');
});
test('Japan credit notes and unqualified SG/EU self-billing remain explicit coverage gaps', async () => {
  const credit = readFileSync(new URL('./validation-fixtures/pint/aunz-creditnote.xml', import.meta.url), 'utf8').replace(
    'billing-1@aunz-1',
    'billing-1@jp-1',
  );
  const summary = await validateSource({ xml: credit });
  assert.equal(summary.completeness, 'incomplete');
  assert.equal(summary.bundles.profile, undefined);
  for (const name of ['sg', 'eu']) {
    const source = readFileSync(new URL(`./validation-fixtures/pint/${name}-invoice.xml`, import.meta.url), 'utf8')
      .replace(`billing-1@${name}-1`, `selfbilling-1@${name}-1`)
      .replace('bis:billing</cbc:ProfileID>', 'bis:selfbilling</cbc:ProfileID>')
      .replace('>380</cbc:InvoiceTypeCode>', '>389</cbc:InvoiceTypeCode>');
    const result = await validateSource({ xml: source });
    assert.equal(result.result, 'incomplete');
    assert.equal(result.reasons?.profile, 'unsupported');
  }
});

test('Japan non-tax PINT executes its separately published shared and jurisdiction rules', async () => {
  const xml = readFileSync(new URL('./validation-fixtures/pint/jp-ntr-invoice.xml', import.meta.url), 'utf8');
  const summary = await validateSource({ xml });
  assert.equal(summary.schema, 'passed');
  assert.equal(summary.semantic, 'passed', JSON.stringify(summary.findings));
  assert.equal(summary.profile, 'passed', JSON.stringify(summary.findings));
  assert.equal(summary.bundles.semantic, 'pint-jp-ntr-shared-1.1.3');
  assert.equal(summary.bundles.profile, 'pint-jp-ntr-1.1.3');
  assert.equal(summary.result, 'valid');
});
for (const [label, before, after, layer, rule] of [
  ['schema', '<cbc:IssueDate>2026-03-02</cbc:IssueDate>', '<cbc:IssueDate>not-a-date</cbc:IssueDate>', 'schema', undefined],
  ['shared non-tax type', '<cbc:InvoiceTypeCode>480', '<cbc:InvoiceTypeCode>380', 'semantic', 'ibr-cl-01-jp-ntr'],
  ['shared arithmetic', '<cbc:PayableAmount currencyID="JPY">10000', '<cbc:PayableAmount currencyID="JPY">10001', 'semantic', 'ibr-co-16'],
  [
    'jurisdiction',
    '<cac:InvoicePeriod><cbc:StartDate>2026-03-01</cbc:StartDate><cbc:EndDate>2026-03-02</cbc:EndDate></cac:InvoicePeriod>',
    '',
    'profile',
    'aligned-ibrp-052',
  ],
] as const) {
  test(`Japan non-tax independently rejects its ${label} violation`, async () => {
    const xml = readFileSync(new URL('./validation-fixtures/pint/jp-ntr-invoice.xml', import.meta.url), 'utf8');
    assert.ok(xml.includes(before));
    const summary = await validateSource({ xml: xml.replace(before, after) });
    assert.equal(summary[layer], 'failed');
    assert.equal(summary.result, 'invalid');
    if (layer !== 'schema') assert.equal(summary.schema, 'passed');
    if (layer === 'profile') assert.equal(summary.semantic, 'passed');
    if (rule)
      assert.ok(
        summary.findings.some(
          (finding) => finding.layer === layer && finding.ruleId === rule && finding.severity === 'fatal' && finding.path,
        ),
      );
  });
}
for (const [name, before, after] of [
  ['unknown specialization chain', 'nontaxinvoice-1@jp-1', 'nontaxinvoice-1@jp-1#urn:example:unknown'],
  ['unknown process chain', 'urn:peppol:bis:billing</cbc:ProfileID>', 'urn:peppol:bis:billing#urn:example:unknown</cbc:ProfileID>'],
  ['future syntax', '<cbc:CustomizationID>', '<cbc:UBLVersionID>2.3</cbc:UBLVersionID><cbc:CustomizationID>'],
] as const) {
  test(`Japan non-tax preserves the ${name} coverage gap`, async () => {
    const xml = readFileSync(new URL('./validation-fixtures/pint/jp-ntr-invoice.xml', import.meta.url), 'utf8');
    const summary = await validateSource({ xml: xml.replace(before, after) });
    assert.equal(summary.result, 'incomplete');
    assert.equal(summary.reasons?.profile, 'unsupported');
  });
}
