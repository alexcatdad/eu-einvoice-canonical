import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateSource } from '../src/index.js';

for (const syntax of ['ubl', 'cii']) {
  test(`an unknown extension after XRechnung ${syntax} keeps base findings without claiming complete coverage`, async () => {
    const source = readFileSync(new URL(`./fixtures/xrechnung-${syntax}.xml`, import.meta.url), 'utf8');
    const xml = source.replace('xrechnung_3.0', 'xrechnung_3.0#conformant#urn:example:unknown');
    assert.notEqual(xml, source);
    const summary = await validateSource({ xml });
    assert.equal(summary.schema, 'passed');
    assert.equal(summary.profile, 'passed');
    assert.equal(summary.result, 'incomplete');
    assert.equal(summary.completeness, 'incomplete');
    assert.equal(summary.reasons?.profile, 'unsupported');
    assert.equal(summary.bundles.profile, `xrechnung-3.0.2-${syntax}`);
  });
}
