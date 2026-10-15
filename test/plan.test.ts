import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { detectXml } from '../src/index.js';
import { planFor, unavailableSummary } from '../src/validation/plan.js';
import { PEPPOL, ublHeader } from './helpers.js';

describe('validation plan when the validators cannot be loaded', () => {
  test('a Peppol invoice reports every planned layer as unavailable, with the bundle and the reason', () => {
    const detection = detectXml(ublHeader(PEPPOL));
    const plan = planFor(detection);
    assert.deepEqual(Object.keys(plan).sort(), ['profile', 'schema', 'semantic']);
    const s = unavailableSummary(detection, 'import failed');
    assert.equal(s.parse, 'passed');
    for (const layer of ['schema', 'semantic', 'profile'] as const) {
      assert.equal(s[layer], 'unavailable', layer);
      assert.equal(s.bundles[layer], plan[layer]);
    }
    assert.equal(s.findings.length, 3);
    assert.ok(s.findings.every((f) => f.severity === 'info' && f.message === 'Validator unavailable: import failed'));
    assert.equal(s.signature, 'not-run');
  });

  test('a format without validators keeps every layer not-run', () => {
    const detection = detectXml('<Invoice xmlns="urn:sfti:documents:BasicInvoice:1:0"/>');
    const s = unavailableSummary(detection, 'import failed');
    assert.equal(s.parse, 'passed');
    for (const layer of ['schema', 'semantic', 'profile'] as const) assert.equal(s[layer], 'not-run', layer);
    assert.deepEqual(s.findings, []);
  });

  test('input that is not XML reports parse failed', () => {
    const s = unavailableSummary(detectXml('not xml'), 'import failed');
    assert.equal(s.parse, 'failed');
    assert.deepEqual(s.bundles, {});
  });
});
