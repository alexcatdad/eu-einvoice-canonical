import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readBaseline } from '../scripts/pdf-eval/report.js';
import { evaluateSwedish } from '../scripts/pdf-eval.js';

test('the synthetic Swedish PDF set passes the evaluation gate and its baseline', async () => {
  const baseline = readBaseline(readFileSync(join(import.meta.dir, '..', 'scripts', 'pdf-eval', 'baseline-synthetic.json'), 'utf8'));
  const r = await evaluateSwedish(join(import.meta.dir, 'pdf-synth'), undefined, baseline);
  expect(r.gate.failures).toEqual([]);
  expect(r.documents.total).toBeGreaterThanOrEqual(20);
  // "Godkänd för F-skatt" (BT-32) in the footer line is read on the synthetic set
  expect(r.fields['seller.taxRegistrationId'].missing ?? 0).toBe(0);
  expect(r.fields['seller.taxRegistrationId'].correct).toBeGreaterThanOrEqual(19);
}, 120_000);
