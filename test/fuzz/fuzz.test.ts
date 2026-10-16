/**
 * Fuzzing: hostile input must never crash, hang or surface an internal error.
 *
 * Normal runs use a fixed seed and a few dozen cases per strategy (well under a minute). The nightly workflow
 * sets FUZZ_RUNS, FUZZ_ISOLATE=1 (each conversion runs in a terminable worker) and a random FUZZ_SEED.
 *
 * Every XML fixture gets one deterministic case before random sampling starts, so even the bounded run touches all of them.
 *
 * To replay a failure, either re-run the seed (FUZZ_SEED, FUZZ_PATH and FUZZ_RUNS from fuzz-failures/summary.md, with -t set to the
 * test name), or feed the saved input back: FUZZ_REPLAY=<file>.bin bun test test/fuzz -t replay. The second form is exact even for
 * cases built from a freshly generated signing key, which a seed alone cannot reproduce.
 */
import { describe, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as fc from 'fast-check';
import {
  BINARY_FIXTURES,
  binarySeeds,
  buildEnvelope,
  byteMutation,
  envelopeSpec,
  generatedXml,
  generatedXmlWith,
  onePerFixture,
  shapedXml,
  XML_FIXTURES,
  xmlMutation,
  xmlMutationWith,
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
      : `${String(details.errorInstance)} (${(details as { error?: string }).error ?? 'no message'})`;
  const textual = c && c.bytes.length <= 4000 && c.bytes.every((b) => b >= 0x20 || b === 0x09 || b === 0x0a || b === 0x0d);
  const summary = [
    `### ${name}`,
    '',
    `- Property violated: \`${message.split('\n')[0].slice(0, 300)}\``,
    `- Input: ${c ? `${c.label}, ${c.bytes.length} bytes after shrinking` : 'n/a'}`,
    `- Replay by seed: \`FUZZ_SEED=${details.seed} FUZZ_PATH=${details.counterexamplePath} FUZZ_RUNS=${details.numRuns} bun test test/fuzz -t "${name}"\``,
    `- Replay the exact bytes: \`FUZZ_REPLAY=fuzz-failures/${name.replace(/[^\w.-]+/g, '_')}.bin bun test test/fuzz -t replay\``,
    '',
    ...(c && textual ? ['```xml', Buffer.from(c.bytes).toString('utf8').replace(/`{3}/g, "'''"), '```', ''] : []),
    ...(c && !textual
      ? [
          `The shrunk input is binary (${c.bytes.length} bytes); see \`${name.replace(/[^\w.-]+/g, '_')}.bin\` in the uploaded artifact.`,
          '',
        ]
      : []),
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

async function fuzz<T>(
  name: string,
  arb: fc.Arbitrary<T>,
  toCase: (t: T) => FuzzCase | Promise<FuzzCase>,
  examples: T[] = [],
): Promise<void> {
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
      examples: examples.map((e): [T] => [e]),
    },
  );
  if (details.failed) {
    // fast-check re-runs the shrunk counterexample last, so lastFailing is the minimal case.
    const message = record(name, details as fc.RunDetails<[unknown]>, lastFailing ?? last);
    throw new Error(`${name}: ${message}\n${fc.defaultReportMessage(details as never)}`);
  }
  expect(details.failed).toBe(false);
}

const NAME = {
  structural: 'structural mutation of every fixture',
  bytes: 'byte-level mutation of the binary fixtures',
  grammar: 'XML generated from each parser grammar',
  shaped: 'deeply nested and very wide documents',
  envelope: 'envelope recursion up to and beyond maxDepth',
};

describe('fuzz: hostile input never crashes, hangs or reports an internal error', () => {
  const count = XML_FIXTURES.length;
  const limit = TIME_LIMIT_MS + 30_000;

  test(NAME.structural, () => fuzz(NAME.structural, xmlMutation, (c) => c, onePerFixture(xmlMutationWith, count, SEED)), limit);

  test(
    NAME.bytes,
    async () => {
      const seeds = await binarySeeds();
      expect(seeds.length).toBeGreaterThanOrEqual(BINARY_FIXTURES.length);
      const make = (f: fc.Arbitrary<number>) => byteMutation(seeds, f, fc.constant(false));
      await fuzz(NAME.bytes, byteMutation(seeds), (c) => c, onePerFixture(make, seeds.length, SEED));
    },
    limit,
  );

  test(NAME.grammar, () => fuzz(NAME.grammar, generatedXml, (c) => c, onePerFixture(generatedXmlWith, count, SEED)), limit);

  test(NAME.shaped, () => fuzz(NAME.shaped, shapedXml, (c) => c), limit);

  test(NAME.envelope, () => fuzz(NAME.envelope, envelopeSpec, buildEnvelope), limit);
});

const REPLAY = process.env.FUZZ_REPLAY;
describe.skipIf(!REPLAY)('fuzz: replay', () => {
  test('replay a saved counterexample', async () => {
    const meta = JSON.parse(readFileSync(String(REPLAY).replace(/\.bin$/, '.json'), 'utf8'));
    await checkCase({
      label: `replay of ${REPLAY}`,
      filename: meta.filename,
      bytes: new Uint8Array(readFileSync(String(REPLAY))),
      limits: meta.limits,
      options: meta.options,
    });
  });
});
