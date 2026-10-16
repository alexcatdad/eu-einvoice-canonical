/**
 * Child of scripts/corpus-run.ts: converts the files whose paths arrive on stdin (one JSON string per
 * line) and answers each with one `@@RESULT <json>` line on stdout. It runs in its own process so the
 * parent can kill it when a file hangs, which a promise in the same process could not be.
 */
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { convert } from '../src/index.js';
import { type FileResult, summarise } from './corpus-lib.js';

for await (const line of createInterface({ input: process.stdin })) {
  if (!line.trim()) continue;
  const path = JSON.parse(line) as string;
  const started = performance.now();
  let result: Pick<FileResult, 'bytes' | 'outcome' | 'error' | 'skipped' | 'docs'>;
  let bytes = 0;
  try {
    const data = new Uint8Array(readFileSync(path));
    bytes = data.length;
    const r = await convert(data, path, undefined, { validate: true, relations: true, provenance: false });
    result = { bytes, outcome: 'done', ...summarise(r) };
  } catch (e) {
    // convert() reports bad input as outcomes; reaching here is a bug worth seeing in the report.
    result = { bytes, outcome: 'crash', error: `Uncaught: ${e instanceof Error ? e.message : String(e)}`, skipped: [], docs: [] };
  }
  process.stdout.write(`@@RESULT ${JSON.stringify({ ...result, ms: Math.round(performance.now() - started) })}\n`);
}
