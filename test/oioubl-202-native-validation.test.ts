import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateSource } from '../src/index.js';

const fixture = (kind: string) => readFileSync(new URL(`./validation-fixtures/oioubl-202-${kind}.xml`, import.meta.url), 'utf8');
test('OIOUBL2.02 invoice executes the matching historical native rule edition', async () => {
  const summary = await validateSource({ xml: fixture('invoice') });
  assert.equal(summary.schema, 'passed');
  assert.equal(summary.profile, 'passed', JSON.stringify(summary.findings));
  assert.equal(summary.bundles.profile, 'oioubl-2.02-invoice-1.11.1');
  assert.equal(summary.result, 'valid');
  assert.equal(summary.completeness, 'complete');
  assert.deepEqual(summary.findings, []);
});
test('OIOUBL2.02 credit note executes its distinct historical native rules', async () => {
  const summary = await validateSource({ xml: fixture('creditnote') });
  assert.equal(summary.schema, 'passed');
  assert.equal(summary.profile, 'passed', JSON.stringify(summary.findings));
  assert.equal(summary.bundles.profile, 'oioubl-2.02-creditnote-1.11.1');
  assert.equal(summary.result, 'valid');
  assert.deepEqual(summary.findings, []);
});
for (const kind of ['invoice', 'creditnote']) {
  test(`OIOUBL2.02 ${kind} native violation stays schema-valid and located`, async () => {
    const source = fixture(kind);
    const xml = source.replace('<cbc:Name>Moms</cbc:Name>', '<cbc:Name>NotVAT</cbc:Name>');
    assert.notEqual(xml, source);
    const summary = await validateSource({ xml });
    assert.equal(summary.schema, 'passed');
    assert.equal(summary.profile, 'failed');
    assert.equal(summary.result, 'invalid');
    const failures = summary.findings.filter((finding) => finding.severity === 'fatal');
    assert.deepEqual(
      failures.map((finding) => finding.ruleId),
      ['F-LIB198'],
    );
    assert.ok(failures[0].path?.includes('TaxScheme'));
  });
  test(`OIOUBL2.02 ${kind} preserves publisher warning severity without rejecting the document`, async () => {
    const xml = fixture(kind).replace('schemeID="urn:oioubl:id:profileid-1.2"', 'schemeID="urn:example:unknown"');
    const summary = await validateSource({ xml });
    assert.equal(summary.schema, 'passed');
    assert.equal(summary.profile, 'passed');
    assert.equal(summary.result, 'valid');
    assert.equal(summary.completeness, 'complete');
    assert.deepEqual(
      summary.findings.map((finding) => [finding.ruleId, finding.severity]),
      [['W-LIB003', 'warning']],
    );
    assert.ok(summary.findings[0].path?.startsWith('/'));
  });
}

// Independent reference: unchanged pinned 2019 XSLT, /usr/bin/xsltproc --nonet.
// Optional zero totals are deliberately invalid under the publisher's positive-amount rules.
const arithmeticReferences = {
  invoice: {
    baseline: ['F-LIB013', 'F-LIB013', 'F-LIB013', 'F-LIB303'],
    TaxExclusiveAmount: ['F-INV127', 'F-LIB013', 'F-LIB013', 'F-LIB013', 'F-LIB303'],
    TaxInclusiveAmount: ['F-INV128', 'F-LIB013', 'F-LIB013', 'F-LIB013', 'F-LIB303'],
    AllowanceTotalAmount: ['F-INV128', 'F-INV129', 'F-INV133', 'F-LIB013', 'F-LIB013', 'F-LIB303'],
    ChargeTotalAmount: ['F-INV128', 'F-INV130', 'F-INV133', 'F-LIB013', 'F-LIB013', 'F-LIB303'],
    PrepaidAmount: ['F-INV131', 'F-INV133', 'F-LIB013', 'F-LIB013', 'F-LIB303'],
    PayableRoundingAmount: ['F-INV128', 'F-INV133', 'F-LIB013', 'F-LIB013', 'F-LIB013'],
    PayableAmount: ['F-INV133', 'F-INV134', 'F-LIB013', 'F-LIB013', 'F-LIB013', 'F-LIB303'],
    PaymentTermsAmount: ['F-INV134', 'F-LIB013', 'F-LIB013', 'F-LIB013', 'F-LIB303'],
  },
  creditnote: {
    baseline: ['F-LIB303'],
    TaxExclusiveAmount: ['F-CRN073', 'F-LIB303'],
    TaxInclusiveAmount: ['F-CRN074', 'F-LIB303'],
    AllowanceTotalAmount: ['F-CRN074', 'F-CRN075', 'F-CRN079', 'F-LIB303'],
    ChargeTotalAmount: ['F-CRN074', 'F-CRN076', 'F-CRN079', 'F-LIB303'],
    PayableRoundingAmount: ['F-CRN074', 'F-CRN079'],
    PayableAmount: ['F-CRN079', 'F-LIB303'],
  },
};
for (const kind of ['invoice', 'creditnote'] as const) {
  const fields = ['AllowanceTotalAmount', 'ChargeTotalAmount', ...(kind === 'invoice' ? ['PrepaidAmount'] : []), 'PayableRoundingAmount'];
  const zeroTotals = fields.map((field) => `<cbc:${field} currencyID="DKK">0.00</cbc:${field}>`).join('');
  const baseline = fixture(kind).replace('<cbc:PayableAmount', `${zeroTotals}<cbc:PayableAmount`);
  for (const [field, expected] of Object.entries(arithmeticReferences[kind])) {
    test(`OIOUBL2.02 ${kind} ${field} matches unchanged original arithmetic reference`, async () => {
      const xml =
        field === 'baseline'
          ? baseline
          : field === 'PaymentTermsAmount'
            ? baseline.replace('<cbc:Amount currencyID="DKK">6312.50</cbc:Amount>', '<cbc:Amount currencyID="DKK">6313.50</cbc:Amount>')
            : baseline.replace(
                new RegExp(`(<cbc:${field} currencyID="DKK">)([^<]+)`),
                (_match, start, value) => start + (Number(value) + 1).toFixed(2),
              );
      const summary = await validateSource({ xml });
      assert.equal(summary.schema, 'passed');
      assert.equal(summary.profile, 'failed');
      assert.ok(summary.findings.every((finding) => finding.layer === 'profile' && finding.severity === 'fatal'));
      assert.deepEqual(
        summary.findings
          .filter((finding) => finding.severity === 'fatal')
          .map((finding) => finding.ruleId)
          .sort(),
        [...expected].sort(),
      );
    });
  }
  test(`OIOUBL2.02 ${kind} nonzero rounding matches original positive and negative reference`, async () => {
    const xml = fixture(kind)
      .replace(
        '<cbc:TaxAmount currencyID="DKK">1262.50</cbc:TaxAmount>',
        '<cbc:TaxAmount currencyID="DKK">1262.50</cbc:TaxAmount><cbc:RoundingAmount currencyID="DKK">0.01</cbc:RoundingAmount>',
      )
      .replace('<cbc:PayableAmount', '<cbc:PayableRoundingAmount currencyID="DKK">0.01</cbc:PayableRoundingAmount><cbc:PayableAmount')
      .replaceAll('6312.50', '6312.51');
    const valid = await validateSource({ xml });
    assert.equal(valid.result, 'valid', JSON.stringify(valid.findings));
    assert.deepEqual(valid.findings, []);
    const invalid = await validateSource({
      xml: xml.replace('<cbc:PayableRoundingAmount currencyID="DKK">0.01', '<cbc:PayableRoundingAmount currencyID="DKK">0.02'),
    });
    assert.equal(invalid.schema, 'passed');
    assert.ok(invalid.findings.every((finding) => finding.layer === 'profile' && finding.severity === 'fatal'));
    assert.deepEqual(
      invalid.findings
        .filter((finding) => finding.severity === 'fatal')
        .map((finding) => finding.ruleId)
        .sort(),
      kind === 'invoice' ? ['F-INV128', 'F-INV132', 'F-INV133'] : ['F-CRN074', 'F-CRN078', 'F-CRN079'],
    );
  });
}
for (const kind of ['invoice', 'creditnote']) {
  test(`OIOUBL2.02 ${kind} rules cannot be selected for contradictory or future declarations`, async () => {
    const original = fixture(kind);
    for (const xml of [
      original.replace('<cbc:UBLVersionID>2.0</cbc:UBLVersionID>', '<cbc:UBLVersionID>2.1</cbc:UBLVersionID>'),
      original.replace('OIOUBL-2.02', 'OIOUBL-2.03'),
    ]) {
      const summary = await validateSource({ xml });
      assert.equal(summary.result, 'incomplete');
      assert.equal(summary.bundles.profile, undefined);
      assert.equal(summary.reasons?.profile, 'unsupported');
    }
  });
  test(`OIOUBL2.1 and3 ${kind} retain their own native editions`, async () => {
    for (const [prefix, bundle] of [
      ['oioubl2', `oioubl2-${kind}-1.15.2`],
      ['oioubl3', `oioubl3-${kind}-3.2.4`],
    ]) {
      const xml = readFileSync(new URL(`./validation-fixtures/legacy/${prefix}-${kind}.xml`, import.meta.url), 'utf8');
      const summary = await validateSource({ xml });
      assert.equal(summary.result, 'valid', JSON.stringify(summary.findings));
      assert.equal(summary.bundles.profile, bundle);
    }
  });
}
