/**
 * The properties every fuzz case must satisfy. A violation throws an Error whose message says which property broke;
 * the harness turns that into a shrunk counterexample.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { type ConvertOptions, type ConvertResult, convert, schemaVersion, type UnwrapLimits } from '../../src/index.js';

const schema = (name: string) =>
  JSON.parse(readFileSync(join(import.meta.dir, '..', '..', 'schemas', `${name}.${schemaVersion}.schema.json`), 'utf8'));
const ajv = new Ajv2020({ strict: false, allErrors: false });
const validateInvoice = ajv.compile(schema('canonical-invoice'));
const validateResult = ajv.compile(schema('convert-result'));

/** Per-case time budget. Generous because CI runs under coverage instrumentation; a real hang exceeds any budget. */
export const BUDGET_MS = Number(process.env.FUZZ_BUDGET_MS ?? 5000);

export interface FuzzCase {
  /** Short description of how the input was made (shown in failure reports). */
  label: string;
  filename?: string;
  bytes: Uint8Array;
  limits?: Partial<UnwrapLimits>;
  options?: ConvertOptions;
}

/** Amounts are branded Decimal strings, which the schema pins to the decimal pattern; a JS number anywhere must be finite. */
function checkNumbers(value: unknown, path: string): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`non-finite number at ${path}`);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => {
      checkNumbers(v, `${path}[${i}]`);
    });
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) checkNumbers(v, `${path}.${k}`);
  }
}

export function checkResult(result: ConvertResult): void {
  const wire: { outcomes: { invoices?: unknown[] }[] } = JSON.parse(JSON.stringify(result));
  if (!validateResult(wire)) throw new Error(`result violates convert-result schema: ${ajv.errorsText(validateResult.errors)}`);
  for (const [i, o] of result.outcomes.entries()) {
    if (o.status === 'error' && /^Internal error/.test(o.error)) throw new Error(`outcome ${i}: ${o.error}`);
    if (o.status !== 'ok') continue;
    checkNumbers(o.invoices, `outcomes[${i}].invoices`);
    for (const inv of wire.outcomes[i].invoices ?? []) {
      if (!validateInvoice(inv)) throw new Error(`invoice violates canonical-invoice schema: ${ajv.errorsText(validateInvoice.errors)}`);
    }
  }
}

/** Nightly runs convert() in a worker that is terminated at the deadline, so a case that blocks synchronously is reported, not waited for. */
const ISOLATE = process.env.FUZZ_ISOLATE === '1';
const HANG_MS = Number(process.env.FUZZ_HANG_MS ?? BUDGET_MS + 15_000);

let worker: Worker | undefined;
let nextId = 0;

/** Runs one conversion in the shared worker; rejects (and replaces the worker) when it does not answer within `hangMs`. */
export function runIsolated(c: FuzzCase, hangMs = HANG_MS, hang = false): Promise<{ result: ConvertResult; ms: number }> {
  worker ??= new Worker(new URL('./worker.ts', import.meta.url).href);
  const w = worker;
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const fail = (message: string) => {
      clearTimeout(timer);
      w.terminate();
      if (worker === w) worker = undefined;
      reject(new Error(message));
    };
    const timer = setTimeout(() => fail(`hang: no result within ${hangMs} ms (worker terminated)`), hangMs);
    w.onerror = (e) => fail(`worker crashed: ${e.message}`);
    w.onmessage = (e: MessageEvent) => {
      if (e.data.id !== id) return;
      clearTimeout(timer);
      if (e.data.ok) resolve({ result: e.data.result, ms: e.data.ms });
      else reject(new Error(`convert() threw: ${e.data.error}`));
    };
    w.postMessage({ id, bytes: c.bytes, filename: c.filename, limits: c.limits, options: c.options, hang });
  });
}

async function run(c: FuzzCase): Promise<{ result: ConvertResult; ms: number }> {
  if (ISOLATE) return runIsolated(c);
  const started = performance.now();
  let result: ConvertResult;
  try {
    result = await convert(c.bytes, c.filename, c.limits, c.options);
  } catch (e) {
    throw new Error(`convert() threw: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
  }
  return { result, ms: performance.now() - started };
}

/** Checks all properties for one case. */
export async function checkCase(c: FuzzCase): Promise<void> {
  const { result, ms } = await run(c);
  if (ms > 1000) console.log(`slow fuzz case (${Math.round(ms)} ms): ${c.label}, ${c.bytes.length} bytes`);
  if (ms > BUDGET_MS) throw new Error(`took ${Math.round(ms)} ms, over the ${BUDGET_MS} ms budget`);
  checkResult(result);
  const again = await run(c);
  if (JSON.stringify(result) !== JSON.stringify(again.result)) throw new Error('not deterministic: two runs on the same input differ');
}
