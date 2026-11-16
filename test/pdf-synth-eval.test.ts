import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { evaluateSwedish } from '../scripts/pdf-eval.js';

test('the synthetic Swedish PDF set passes the evaluation gate', async () => {
  const r = await evaluateSwedish(join(import.meta.dir, 'pdf-synth'));
  expect(r.gate.failures).toEqual([]);
  expect(r.documents.total).toBeGreaterThanOrEqual(20);
}, 120_000);
