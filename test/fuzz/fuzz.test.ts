/**
 * Fuzzing: hostile input must never crash, hang or surface an internal error.
 *
 * Normal runs use a fixed seed and a few dozen cases per strategy (well under a minute). The nightly workflow
 * sets FUZZ_RUNS and a random FUZZ_SEED. To replay a failure: FUZZ_SEED=<seed> FUZZ_PATH=<path> FUZZ_RUNS=<runs> bun test test/fuzz
 * (the seed, path and run count are in fuzz-failures/summary.md and in the failure message).
 */
import { describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as fc from 'fast-check';
import {
  BINARY_FIXTURES,
  binarySeeds,
  buildEnvelope,
  byteMutation,
  envelopeSpec,
  generatedXml,
  shapedXml,
  xmlMutation,
} from './generate.js';
import { checkCase, type FuzzCase } from './properties.js';

const SEED = Number(process.env.FUZZ_SEED ?? 20261016);
const RUNS = Number(process.env.FUZZ_RUNS ?? 40);
const PATH = process.env.FUZZ_PATH;
/** Safety net for the bounded CI run; the nightly run sets its own. */
const TIME_LIMIT_MS = Number(process.env.FUZZ_TIME_LIMIT_MS ?? 25_000);
const OUT = process.env.FUZZ_OUT ?? 'fuzz-failures';

function record(name: string, details: fc.RunDetails<[unknown]>, c: FuzzCase | undefined): string {
  mkdirSync(OUT, { recursive: true });
  const message =
    details.errorInstance instanceof Error
      ? details.errorInstance.message
      : `${String(details.errorInstance)} (${details.error ?? 'no message'})`;
  const textual = c && c.bytes.length <= 4000 && c.bytes.every((b) => b >= 0x20 || b === 0x09 || b === 0x0a || b === 0x0d);
  const summary = [
    `### ${name}`,
    '',
    `- Property violated: \`${message.split('\n')[0].slice(0, 300)}\``,
    `- Input: ${c ? `${c.label}, ${c.bytes.length} bytes after shrinking` : 'n/a'}`,
    `- Replay: \`FUZZ_SEED=${details.seed} FUZZ_PATH=${details.counterexamplePath} FUZZ_RUNS=${details.numRuns} bun test test/fuzz -t "${name}"\``,
    '',
    ...(c && textual ? ['```xml', Buffer.from(c.bytes).toString('utf8').replace(/`{3}/g, "'''"), '```', ''] : []),
    ...(c && !textual ? [`The shrunk input is binary (${c.bytes.length} bytes); see \`${name}.bin\` in the uploaded artifact.`, ''] : []),
  ].join('\n');
  writeFileSync(join(OUT, 'summary.md'), `${summary}\n`, { flag: 'a' });
  if (c) {
    const file = name.replace(/[^\w.-]+/g, '_');
    writeFileSync(join(OUT, `${file}.bin`), c.bytes);
    writeFileSync(
      join(OUT, `${file}.json`),
      JSON.stringify(
        {
          name,
          seed: details.seed,
          path: details.counterexamplePath,
          runs: details.numRuns,
          label: c.label,
          filename: c.filename,
          limits: c.limits,
          options: c.options,
          message,
        },
        null,
        2,
      ),
    );
  }
  return message;
}

async function fuzz<T>(name: string, arb: fc.Arbitrary<T>, toCase: (t: T) => FuzzCase | Promise<FuzzCase>): Promise<void> {
  let last: FuzzCase | undefined;
  let lastFailing: FuzzCase | undefined;
  const details = await fc.check(
    fc.asyncProperty(arb, async (t) => {
      const c = await toCase(t);
      last = c;
      try {
        await checkCase(c);
      } catch (e) {
        lastFailing = c;
        throw e;
      }
    }),
    {
      seed: SEED,
      numRuns: RUNS,
      path: PATH,
      interruptAfterTimeLimit: TIME_LIMIT_MS,
      markInterruptAsFailure: false,
      endOnFailure: false,
    },
  );
  if (details.failed) {
    // fast-check re-runs the shrunk counterexample last, so lastFailing is the minimal case.
    const message = record(name, details as fc.RunDetails<[unknown]>, lastFailing ?? last);
    throw new Error(`${name}: ${message}\n${fc.defaultReportMessage(details as never)}`);
  }
  expect(details.failed).toBe(false);
}

describe('fuzz: hostile input never crashes, hangs or reports an internal error', () => {
  test('structural mutation of every fixture', () => fuzz('structural-mutation', xmlMutation, (c) => c), TIME_LIMIT_MS + 30_000);

  test(
    'byte-level mutation of the binary fixtures',
    async () => {
      const seeds = await binarySeeds();
      expect(seeds.length).toBeGreaterThanOrEqual(BINARY_FIXTURES.length);
      await fuzz('byte-mutation', byteMutation(seeds), (c) => c);
    },
    TIME_LIMIT_MS + 30_000,
  );

  test('XML generated from each parser grammar', () => fuzz('grammar-generated', generatedXml, (c) => c), TIME_LIMIT_MS + 30_000);

  test('deeply nested and very wide documents', () => fuzz('deep-and-wide', shapedXml, (c) => c), TIME_LIMIT_MS + 30_000);

  test(
    'envelope recursion up to and beyond maxDepth',
    () => fuzz('envelope-recursion', envelopeSpec, buildEnvelope),
    TIME_LIMIT_MS + 30_000,
  );
});
