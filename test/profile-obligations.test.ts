import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateSource } from '../src/index.js';

for (const fixture of [
  'peppol-valid-invoice.xml',
  'nlcius-valid-invoice.xml',
  'nlcius-valid-cii.xml',
  'nlcius-gaccount-valid-invoice.xml',
  'ciuspt-valid-invoice.xml',
  'ciusro-valid-invoice.xml',
  'hr-cius-valid-invoice.xml',
  'selfbilling-valid-invoice.xml',
  'selfbilling-valid-credit.xml',
  'legacy/oioubl3-invoice.xml',
  'legacy/oioubl3-creditnote.xml',
  'legacy/oioubl2-invoice.xml',
  'legacy/oioubl2-creditnote.xml',
]) {
  test(`unknown chained obligations remain incomplete for ${fixture}`, async () => {
    const source = readFileSync(new URL(`./validation-fixtures/${fixture}`, import.meta.url), 'utf8');
    const xml = fixture.includes('cii')
      ? source.replace(/(<[^:>]+:GuidelineSpecifiedDocumentContextParameter>\s*<[^:>]+:ID>)([^<]+)/, '$1$2#conformant#urn:example:unknown')
      : source.replace(/(<[^:>]+:CustomizationID>)([^<]+)/, '$1$2#conformant#urn:example:unknown');
    assert.notEqual(xml, source);
    const summary = await validateSource({ xml });
    assert.equal(summary.completeness, 'incomplete');
    assert.equal(summary.reasons?.profile, 'unsupported');
  });
}
for (const profile of ['basicwl', 'en16931', 'extended']) {
  test(`explicit Factur-X ${profile} cannot cover an unknown chained profile`, async () => {
    const source = readFileSync(new URL(`./validation-fixtures/facturx-1.09.2-${profile}.xml`, import.meta.url), 'utf8');
    const xml = source.replace(
      /(<[^:>]+:GuidelineSpecifiedDocumentContextParameter>\s*<[^:>]+:ID>)([^<]+)/,
      '$1$2#conformant#urn:example:unknown',
    );
    assert.notEqual(xml, source);
    const summary = await validateSource({ xml }, { suite: 'facturx-1.09.2' });
    assert.equal(summary.completeness, 'incomplete');
    assert.equal(summary.reasons?.profile, 'unsupported');
  });
}
test('PINT shared semantic rules cannot cover an unknown chained profile', async () => {
  const source = readFileSync(new URL('./fixtures/pint-base.xml', import.meta.url), 'utf8');
  const xml = source.replace(/(<[^:>]+:CustomizationID>)([^<]+)/, '$1$2#conformant#urn:example:unknown');
  assert.notEqual(xml, source);
  const summary = await validateSource({ xml });
  assert.equal(summary.completeness, 'incomplete');
  assert.equal(summary.reasons?.profile, 'unsupported');
});
test('an uncovered extension retains applicable base-rule violations', async () => {
  const source = readFileSync(new URL('./validation-fixtures/peppol-valid-invoice.xml', import.meta.url), 'utf8');
  const xml = source
    .replace('poacc:billing:3.0', 'poacc:billing:3.0#conformant#urn:example:unknown')
    .replace(/<cbc:BuyerReference>[^<]*<\/cbc:BuyerReference>/, '');
  assert.notEqual(xml, source);
  const summary = await validateSource({ xml });
  assert.equal(summary.completeness, 'incomplete');
  assert.equal(summary.result, 'invalid');
  assert.equal(summary.reasons?.profile, 'unsupported');
  assert.ok(summary.findings.some((finding) => finding.ruleId === 'PEPPOL-EN16931-R003' && finding.severity === 'fatal'));
});
