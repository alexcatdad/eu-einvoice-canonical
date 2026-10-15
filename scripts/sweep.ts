/**
 * Thin wrapper over the sweep module (also available as `einvoice sweep`).
 *
 *   bun scripts/sweep.ts <dir> [dir...]                  counts per format (coverage)
 *   bun scripts/sweep.ts <dir> --expect answers.json     known-answer check (correctness)
 */
import { runSweep } from '../src/sweep.js';

const args = process.argv.slice(2);
const expectIdx = args.indexOf('--expect');
const expect = expectIdx >= 0 ? args[expectIdx + 1] : undefined;
// Without --expect, expectIdx is -1 and must not swallow the first directory.
const roots = args.filter((_, i) => expectIdx < 0 || (i !== expectIdx && i !== expectIdx + 1));
process.exitCode = await runSweep(roots, { expect }, (l) => console.log(l));
