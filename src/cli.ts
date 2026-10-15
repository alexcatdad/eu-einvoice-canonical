#!/usr/bin/env bun
/**
 * einvoice: command-line front end for unwrapping, detecting and converting inbound e-invoices.
 * See the README ("Command line") for commands, flags and exit codes.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { type CanonicalInvoice, convert, DEFAULT_LIMITS, type Detection, inspect, type UnwrapLimits } from './index.js';
import { runSweep } from './sweep.js';

export const EXIT = {
  ok: 0,
  usage: 1,
  unsafe: 2,
  unsupported: 3,
  validation: 4,
  partial: 5,
  validatorUnavailable: 6,
  internal: 7,
} as const;

/** Thrown by a validator that cannot run (missing rules, no network...). Maps to exit code 6. */
export class ValidatorUnavailable extends Error {}

export interface Validator {
  /** Returns one message per failed rule; empty means valid. */
  validate(invoice: CanonicalInvoice): Promise<string[]>;
}

export interface IO {
  stdout(text: string): void;
  stderr(line: string): void;
  readStdin(): Promise<Uint8Array>;
}

export interface Deps {
  /** The validation module, once it exists. Absent means `--validate` is a no-op with a message. */
  validator?: Validator | null;
}

const USAGE = `Usage:
  einvoice detect  <file...>                 format id, version and profile per document
  einvoice inspect <file...>                 unwrap and detect result as JSON
  einvoice convert <file...> [--out <dir>]   canonical JSON (stdout, or one <invoice-id>.json per invoice in <dir>)
  einvoice sweep   <dir...> [--expect answers.json]

A file argument of "-" reads stdin.
Flags: --pretty  --quiet  --limits '<json>'  --validate  --help
Exit codes: 0 ok, 1 usage, 2 unsafe/malformed input, 3 unsupported format, 4 validation failed,
            5 partially converted, 6 validator unavailable, 7 internal error.`;

class UsageError extends Error {}

interface Parsed {
  command: string;
  files: string[];
  pretty: boolean;
  quiet: boolean;
  validate: boolean;
  out?: string;
  expect?: string;
  limits?: Partial<UnwrapLimits>;
}

function parseArgs(argv: string[]): Parsed {
  const p: Parsed = { command: '', files: [], pretty: false, quiet: false, validate: false };
  const takesValue = new Set(['--out', '--expect', '--limits']);
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i]!;
    if (a === '-' || !a.startsWith('-')) {
      if (!p.command) p.command = a;
      else p.files.push(a);
      continue;
    }
    let value: string | undefined;
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq > 0) {
      value = a.slice(eq + 1);
      a = a.slice(0, eq);
    }
    if (takesValue.has(a) && value === undefined) {
      value = argv[++i];
      if (value === undefined) throw new UsageError(`${a} needs a value`);
    }
    switch (a) {
      case '--pretty':
        p.pretty = true;
        break;
      case '--quiet':
        p.quiet = true;
        break;
      case '--validate':
        p.validate = true;
        break;
      case '--out':
        p.out = value;
        break;
      case '--expect':
        p.expect = value;
        break;
      case '--limits':
        p.limits = parseLimits(value!);
        break;
      case '--help':
      case '-h':
        p.command = 'help';
        break;
      default:
        throw new UsageError(`Unknown flag ${a}`);
    }
  }
  return p;
}

function parseLimits(text: string): Partial<UnwrapLimits> {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    throw new UsageError('--limits must be a JSON object, e.g. \'{"maxEntries":10}\'');
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new UsageError('--limits must be a JSON object');
  for (const [k, n] of Object.entries(v)) {
    if (!(k in DEFAULT_LIMITS)) throw new UsageError(`--limits: unknown limit "${k}" (known: ${Object.keys(DEFAULT_LIMITS).join(', ')})`);
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) throw new UsageError(`--limits: "${k}" must be a non-negative number`);
  }
  return v as Partial<UnwrapLimits>;
}

/** Skipped entries that are expected and not a failure. */
const BENIGN_SKIP = /^Detached XML signature/;

function codeForDetection(d: Detection): number {
  if (d.kind === 'invoice') return EXIT.ok;
  if (d.kind === 'unknown' && d.probe === null) return EXIT.unsafe;
  return EXIT.unsupported;
}

/** Collects per-document results across files and derives the overall exit code. */
class Tally {
  ok = 0;
  failures: number[] = [];
  good() {
    this.ok++;
  }
  fail(code: number) {
    this.failures.push(code);
  }
  code(): number {
    if (this.failures.length === 0) return EXIT.ok;
    return this.ok === 0 ? this.failures[0]! : EXIT.partial;
  }
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

export async function main(argv: string[], io: IO, deps: Deps = {}): Promise<number> {
  let args: Parsed;
  try {
    args = parseArgs(argv);
  } catch (e) {
    io.stderr(`einvoice: ${(e as Error).message}`);
    return EXIT.usage;
  }
  if (args.command === 'help' || (!args.command && argv.length === 0)) {
    io.stdout(`${USAGE}\n`);
    return EXIT.ok;
  }
  const commands = ['detect', 'inspect', 'convert', 'sweep'];
  if (!commands.includes(args.command)) {
    io.stderr(`einvoice: unknown command "${args.command}" (try --help)`);
    return EXIT.usage;
  }
  if (args.files.length === 0) {
    io.stderr(`einvoice: ${args.command} needs at least one ${args.command === 'sweep' ? 'directory' : 'file'}`);
    return EXIT.usage;
  }
  const err = (line: string) => io.stderr(`einvoice: ${oneLine(line)}`);
  const note = (line: string) => {
    if (!args.quiet) err(line);
  };
  const json = (v: unknown) => `${JSON.stringify(v, null, args.pretty ? 2 : undefined)}\n`;

  try {
    if (args.command === 'sweep') {
      if (args.validate) note('--validate has no effect on sweep');
      return await runSweep(args.files, { expect: args.expect, limits: args.limits }, (l) => io.stdout(`${l}\n`));
    }

    let validator: Validator | null = null;
    if (args.validate) {
      if (args.command !== 'convert') note(`--validate only applies to convert; ignored for ${args.command}`);
      else if (deps.validator) validator = deps.validator;
      else note('--validate: the validation module is not available in this build; documents are converted without validation');
    }

    const tally = new Tally();
    const inspected: unknown[] = [];
    const invoices: CanonicalInvoice[] = [];
    const seenNames = new Set<string>();
    let written = 0;
    if (args.command === 'convert' && args.out) mkdirSync(resolve(args.out), { recursive: true });

    for (const file of args.files) {
      const label = file === '-' ? 'stdin' : file;
      let bytes: Uint8Array;
      try {
        bytes = file === '-' ? await io.readStdin() : new Uint8Array(readFileSync(file));
      } catch (e) {
        err(`${label}: cannot read: ${(e as Error).message}`);
        tally.fail(EXIT.internal);
        continue;
      }
      const filename = file === '-' ? undefined : file;

      const skippedFailure = (skipped: { name?: string; reason: string }[]) => {
        for (const s of skipped) {
          if (BENIGN_SKIP.test(s.reason)) {
            note(`${label}${s.name && s.name !== filename ? ` (${s.name})` : ''}: ${s.reason}`);
            continue;
          }
          err(`${label}${s.name && s.name !== filename ? ` (${s.name})` : ''}: ${s.reason}`);
          tally.fail(EXIT.unsafe);
        }
      };

      if (args.command === 'detect' || args.command === 'inspect') {
        const r = await inspect(bytes, filename, args.limits);
        if (args.command === 'inspect') inspected.push({ file: label, ...r });
        for (const d of r.documents) {
          const det = d.detection;
          if (args.command === 'detect') {
            if (det.kind === 'invoice')
              io.stdout(`${label}\t${det.format.id}\t${det.details.version ?? '-'}\t${det.details.profile ?? '-'}\n`);
            else if (det.kind === 'other-document') io.stdout(`${label}\tother\t-\t${oneLine(det.label)}\n`);
            else io.stdout(`${label}\tunknown\t-\t${oneLine(det.reason)}\n`);
          }
          const c = codeForDetection(det);
          if (c === EXIT.ok) tally.good();
          else {
            tally.fail(c);
            err(`${label}: ${det.kind === 'invoice' ? '' : det.kind === 'unknown' ? det.reason : `not an invoice (${det.label})`}`);
          }
        }
        skippedFailure(r.skipped);
        continue;
      }

      const r = await convert(bytes, filename, args.limits);
      for (const o of r.outcomes) {
        if (o.status === 'ok') {
          let valid = true;
          for (const inv of o.invoices) {
            if (validator) {
              const problems = await validator.validate(inv);
              for (const m of problems) err(`${label}: invoice ${inv.id}: ${m}`);
              if (problems.length) {
                valid = false;
                continue;
              }
            }
            invoices.push(inv);
            if (args.out) {
              const name = uniqueName(inv.id, seenNames);
              writeFileSync(join(resolve(args.out), `${name}.json`), json(inv));
              written++;
            }
          }
          if (valid) tally.good();
          else tally.fail(EXIT.validation);
        } else if (o.status === 'not-an-invoice') {
          err(`${label}: not an invoice (${o.detection.kind === 'other-document' ? o.detection.label : 'unknown'})`);
          tally.fail(EXIT.unsupported);
        } else if (o.status === 'unsupported') {
          err(`${label}: ${o.reason}`);
          tally.fail(EXIT.unsupported);
        } else if (o.error.startsWith('Internal error')) {
          err(`${label}: ${o.error}`);
          tally.fail(EXIT.internal);
        } else {
          err(`${label}: ${o.error}`);
          tally.fail(EXIT.unsafe);
        }
      }
      skippedFailure(r.skipped);
    }

    if (args.command === 'inspect') io.stdout(json(inspected));
    if (args.command === 'convert' && !args.out) io.stdout(json(invoices));
    if (args.command === 'convert' && args.out) note(`wrote ${written} invoice file(s) to ${args.out}`);
    return tally.code();
  } catch (e) {
    if (e instanceof ValidatorUnavailable) {
      err(`validator unavailable: ${e.message}`);
      return EXIT.validatorUnavailable;
    }
    err(`internal error: ${(e as Error).message}`);
    return EXIT.internal;
  }
}

/** A file-system-safe name for an invoice id, unique (case-insensitively) within one run. */
export function uniqueName(id: string, seen: Set<string>): string {
  const base =
    id
      .replace(/[^\p{L}\p{N}._-]+/gu, '_')
      .replace(/^\.+/, '')
      .slice(0, 120) || 'invoice';
  let name = base;
  for (let n = 2; seen.has(name.toLowerCase()); n++) name = `${base}-${n}`;
  seen.add(name.toLowerCase());
  return name;
}

if (import.meta.main) {
  const io: IO = {
    stdout: (t) => {
      process.stdout.write(t);
    },
    stderr: (l) => {
      process.stderr.write(`${l}\n`);
    },
    readStdin: async () => new Uint8Array(await Bun.stdin.arrayBuffer()),
  };
  process.exitCode = await main(process.argv.slice(2), io);
}
