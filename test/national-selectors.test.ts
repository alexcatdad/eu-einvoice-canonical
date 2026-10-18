import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateSource } from '../src/index.js';
import { NATIONAL_SELECTOR_CASES } from './national-selector-cases.js';

test('e-arve header1.2 cannot silently choose the distinct 1.2.EN schema edition', async () => {
  const xml = readFileSync(new URL('./validation-fixtures/national/e-arve.xml', import.meta.url), 'utf8');
  const v = await validateSource({ xml }, { scope: 'schema' });
  assert.equal(v.result, 'incomplete');
  assert.equal(v.schema, 'not-run');
  assert.equal(v.reasons?.schema, 'unsupported');
});

test('a KSeF future schema revision cannot reuse the known namespace bundle', async () => {
  const source = readFileSync(new URL('./validation-fixtures/national/ksef-fa3.xml', import.meta.url), 'utf8');
  const v = await validateSource({ xml: source.replace('wersjaSchemy="1-0E"', 'wersjaSchemy="9-9E"') }, { scope: 'schema' });
  assert.equal(v.result, 'incomplete');
  assert.equal(v.schema, 'not-run');
  assert.equal(v.reasons?.schema, 'unsupported');
});

for (const entry of NATIONAL_SELECTOR_CASES) {
  test(`${entry.selectorId} selects only its qualified source contract`, async () => {
    let xml = readFileSync(new URL(`../${entry.fixture}`, import.meta.url), 'utf8');
    for (const [before, after] of entry.prepare ?? []) {
      assert.ok(xml.includes(before), `${entry.selectorId} preparation marker`);
      xml = xml.replace(before, after);
    }
    const options = { scope: 'schema' as const, ...(entry.suite ? { suite: entry.suite } : {}) };
    const positive = await validateSource({ xml }, options);
    assert.equal(positive.schema, 'passed', JSON.stringify(positive.findings));
    assert.equal(positive.result, 'valid');
    assert.equal(positive.bundles.schema, entry.schema);
    for (const [label, [before, after]] of [
      ['wrong', entry.wrong],
      ['future', entry.future],
    ] as const) {
      assert.ok(xml.includes(before), `${entry.selectorId} ${label} marker`);
      const negative = await validateSource({ xml: xml.replace(before, after) }, options);
      if (entry.selectorId === 'isdoc-6.0.2' && label === 'wrong') {
        // The shared namespace also has a qualified 6.0.1 edition; the declared version selects that schema.
        assert.equal(negative.bundles.schema, 'xsd-isdoc-6.0.1');
        assert.equal(negative.schema, 'passed');
        assert.equal(negative.result, 'valid');
        continue;
      }
      if (entry.selectorId.startsWith('ebinterface-') && label === 'wrong') {
        // 3.0 is now qualified: a renamed newer document is checked against that older schema, not silently its original one.
        assert.equal(negative.bundles.schema, 'xsd-ebinterface-3.0');
        assert.equal(negative.schema, 'failed');
        assert.equal(negative.result, 'invalid');
        continue;
      }
      assert.equal(negative.result, 'incomplete', `${entry.selectorId} ${label}`);
      assert.equal(negative.schema, 'not-run', `${entry.selectorId} ${label}`);
      assert.equal(negative.reasons?.schema, 'unsupported');
      assert.equal(negative.bundles.schema, undefined);
    }
  });
}

test('a future KSeF form variant cannot inherit the known namespace schema', async () => {
  const source = readFileSync(new URL('./validation-fixtures/national/ksef-fa3.xml', import.meta.url), 'utf8');
  const v = await validateSource(
    { xml: source.replace('<WariantFormularza>3</WariantFormularza>', '<WariantFormularza>99</WariantFormularza>') },
    { scope: 'schema' },
  );
  assert.equal(v.result, 'incomplete');
  assert.equal(v.schema, 'not-run');
  assert.equal(v.reasons?.schema, 'unsupported');
});
