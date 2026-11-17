import { expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkCoverage } from './pdf-coverage.js';

// Never drop printed text: on every synthetic invoice, each text run of the invoice pages is in a field the result holds,
// in layout text used to read the page, or kept verbatim in unmappedText, and in one of them only
test('text in equals text out on the synthetic Swedish PDF set', async () => {
  const dir = join(import.meta.dir, 'pdf-synth');
  let checked = 0;
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.pdf'))) {
    const c = await checkCoverage(new Uint8Array(readFileSync(join(dir, name))));
    if (!c) continue;
    checked++;
    expect({ name, problems: c.problems }).toEqual({ name, problems: {} });
    expect(c.field + c.consumed + c.unmapped).toBe(c.runs);
  }
  expect(checked).toBeGreaterThanOrEqual(26);
}, 120_000);
