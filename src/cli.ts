#!/usr/bin/env bun
/**
 * einvoice: command-line front end for unwrapping, detecting and converting inbound e-invoices.
 * See the README ("Command line") for commands, flags and exit codes.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  type CanonicalInvoice,
  convert,
  DEFAULT_LIMITS,
  type Detection,
  inspect,
  type UnwrapLimits,
  type ValidateOptions,
  validationPassed,
} from './index.js';
import { snapshotPath } from './signature/snapshot-file.js';
import { parseSnapshot, snapshotNextUpdate, type TrustSnapshot } from './signature/tsl.js';
import { runSweep } from './sweep.js';
import type { WriterProfile } from './writers/index.js';

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
  /** Raw bytes to stdout (for PDF output). */
  stdoutBytes?(bytes: Uint8Array): void;
  stderr(line: string): void;
  readStdin(): Promise<Uint8Array>;
}

export interface Deps {
  /** Optional additional canonical checks, run after the built-in source validation. */
  validator?: Validator | null;
  /** Source-validation options, including a local bundle source. */
  validation?: ValidateOptions;
  /** Clock for snapshot dates. */
  now?: Date;
  /** Stops `serve` (it otherwise runs until SIGINT or SIGTERM). */
  signal?: AbortSignal;
}

const USAGE = `Usage:
  einvoice detect  <file...>                 format id, version and profile per document
  einvoice inspect <file...>                 unwrap and detect result as JSON
  einvoice convert <file...> [--out <dir>]   canonical JSON (stdout, or one <invoice-id>.json per invoice in <dir>)
  einvoice render  --as html|pdf <file...> [--lang en|de|fr|it|es|nl|pl|ro] [--locale de-CH] [--out <file|dir>]
                                             human-readable invoice: a self-contained HTML page or an A4 PDF
                                             (stdout for html; pdf needs --out unless stdout is a binary sink)
  einvoice write   <file...> --to ubl|cii [--profile peppol-bis3|xrechnung|en16931] [--out <dir>]
                                             canonical JSON, or any invoice file (converted first), written as Peppol BIS 3 UBL 2.1 or EN 16931 CII D16B
  einvoice sweep   <dir...> [--expect answers.json]

convert --eu-trust[=<snapshot.json>] checks signers against a trusted-list snapshot (default: $EINVOICE_TRUST_SNAPSHOT,
~/.einvoice/eu-trust-snapshot.json, or trust/eu-trust-snapshot.json next to the sources).
  einvoice serve   [--port 8080] [--host 127.0.0.1] [--cors[=<origin>]] [--eu-trust[=<snapshot.json>]] [--limits '<json>']
                                             the conversion API (openapi/openapi.yaml): POST /v1/convert, /v1/inspect, /v1/detect
  einvoice mcp [--allow-dir <dir>]...           Model Context Protocol server on stdio, for AI agents; files only
                                             inside the allowed directories
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
  euTrust?: string | true;
  out?: string;
  expect?: string;
  as?: string;
  lang?: string;
  locale?: string;
  to?: string;
  profile?: string;
  port?: number;
  host?: string;
  cors?: string | true;
  limits?: Partial<UnwrapLimits>;
  allowDir: string[];
}

function parseArgs(argv: string[]): Parsed {
  const p: Parsed = { command: '', files: [], pretty: false, quiet: false, validate: false, allowDir: [] };
  const takesValue = new Set([
    '--out',
    '--expect',
    '--limits',
    '--as',
    '--lang',
    '--locale',
    '--to',
    '--profile',
    '--port',
    '--host',
    '--allow-dir',
  ]);
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
      case '--eu-trust':
        p.euTrust = value ?? true;
        break;
      case '--out':
        p.out = value;
        break;
      case '--expect':
        p.expect = value;
        break;
      case '--as':
        p.as = value;
        break;
      case '--lang':
        p.lang = value;
        break;
      case '--locale':
        p.locale = value;
        break;
      case '--to':
        p.to = value;
        break;
      case '--profile':
        p.profile = value;
        break;
      case '--cors':
        p.cors = value ?? true;
        break;
      case '--host':
        p.host = value;
        break;
      case '--port': {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 0 || n > 65535) throw new UsageError('--port must be a whole number from 0 to 65535');
        p.port = n;
        break;
      }
      case '--allow-dir':
        p.allowDir.push(value!);
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
  const commands = ['detect', 'inspect', 'convert', 'render', 'write', 'sweep', 'mcp', 'serve'];
  if (!commands.includes(args.command)) {
    io.stderr(`einvoice: unknown command "${args.command}" (try --help)`);
    return EXIT.usage;
  }
  if (args.files.length === 0 && args.command !== 'mcp' && args.command !== 'serve') {
    io.stderr(`einvoice: ${args.command} needs at least one ${args.command === 'sweep' ? 'directory' : 'file'}`);
    return EXIT.usage;
  }
  if (args.command === 'render') {
    if (!['html', 'pdf'].includes(args.as ?? '')) {
      io.stderr('einvoice: render needs --as html or --as pdf');
      return EXIT.usage;
    }
    if (args.lang !== undefined && !/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$/.test(args.lang)) {
      io.stderr('einvoice: --lang must be a language tag such as en, de or fr');
      return EXIT.usage;
    }
    if (args.locale !== undefined) {
      try {
        if (!Intl.getCanonicalLocales(args.locale).length) throw new RangeError('Empty locale');
      } catch {
        io.stderr('einvoice: --locale must be a locale tag such as ro-RO or de-CH');
        return EXIT.usage;
      }
    }
  }
  if (args.command === 'write') {
    if (args.to !== 'ubl' && args.to !== 'cii') {
      io.stderr('einvoice: write needs --to ubl or --to cii');
      return EXIT.usage;
    }
    if (args.profile !== undefined && !(args.profile in PROFILE_NAMES)) {
      io.stderr(`einvoice: --profile must be one of ${Object.keys(PROFILE_NAMES).join(', ')}`);
      return EXIT.usage;
    }
  }
  const err = (line: string) => io.stderr(`einvoice: ${oneLine(line)}`);
  const note = (line: string) => {
    if (!args.quiet) err(line);
  };
  const json = (v: unknown) => `${JSON.stringify(v, null, args.pretty ? 2 : undefined)}\n`;

  try {
    if (args.command === 'serve') return await runServe(args, io, deps, note, err);
    if (args.command === 'sweep') {
      if (args.validate) note('--validate has no effect on sweep');
      return await runSweep(args.files, { expect: args.expect, limits: args.limits }, (l) => io.stdout(`${l}\n`));
    }

    if (args.command === 'write') return await runWrite(args, io, err, note);
    if (args.command === 'mcp') {
      const { runMcpStdio } = await import('./mcp/stdio.js');
      await runMcpStdio({ allowDirs: args.allowDir });
      return EXIT.ok;
    }

    let validator: Validator | null = null;
    if (args.validate) {
      if (args.command !== 'convert') note(`--validate only applies to convert; ignored for ${args.command}`);
      else if (deps.validator) validator = deps.validator;
    }

    let euTrust: TrustSnapshot | undefined;
    if (args.euTrust) {
      if (args.command !== 'convert') note(`--eu-trust only applies to convert; ignored for ${args.command}`);
      else {
        const path = snapshotPath(args.euTrust === true ? undefined : args.euTrust);
        try {
          euTrust = parseSnapshot(readFileSync(path, 'utf8'));
        } catch (e) {
          err(
            `--eu-trust: cannot use the trusted-list snapshot ${path}: ${(e as Error).message} (create one with: einvoice-trust-lists update)`,
          );
          return EXIT.usage;
        }
        const next = snapshotNextUpdate(euTrust);
        if (next && Date.parse(next) < (deps.now ?? new Date()).getTime())
          note(
            `the trusted-list snapshot (fetched ${euTrust.fetchedAt.slice(0, 10)}) is past its next update ${next.slice(0, 10)}; run: einvoice-trust-lists update`,
          );
      }
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

      const r = await convert(bytes, filename, args.limits, {
        ...(euTrust ? { euTrust, now: deps.now } : {}),
        validate: args.validate && args.command === 'convert',
        validation: deps.validation,
      });
      for (const o of r.outcomes) {
        if (o.status === 'ok') {
          let failure: number | undefined;
          for (const inv of o.invoices) {
            if (args.validate && args.command === 'convert' && !validationPassed(inv.source.validation)) {
              const summary = inv.source.validation;
              if (failure !== EXIT.validation) failure = summary?.result === 'invalid' ? EXIT.validation : EXIT.validatorUnavailable;
              for (const finding of summary?.findings ?? []) err(`${label}: invoice ${inv.id}: ${finding.message}`);
              err(`${label}: invoice ${inv.id}: source validation ${summary?.result ?? 'incomplete'}`);
            }
            if (validator) {
              const problems = await validator.validate(inv);
              for (const m of problems) err(`${label}: invoice ${inv.id}: ${m}`);
              if (problems.length) {
                failure = EXIT.validation;
                continue;
              }
            }
            invoices.push(inv);
            if (args.command === 'convert' && args.out) {
              const name = uniqueName(inv.id, seenNames);
              writeFileSync(join(resolve(args.out), `${name}.json`), json(inv));
              written++;
            }
          }
          if (failure === undefined) tally.good();
          else tally.fail(failure);
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

    if (args.command === 'render' && invoices.length > 0) {
      const { renderHtml, renderPdf } = await import('./render/index.js');
      const as = args.as as 'html' | 'pdf';
      if (!args.out && as === 'pdf' && invoices.length > 1) {
        err('render --as pdf of several invoices needs --out <directory>');
        return EXIT.usage;
      }
      const bodies: Uint8Array[] = [];
      for (const inv of invoices) {
        bodies.push(
          as === 'pdf'
            ? await renderPdf(inv, { lang: args.lang, locale: args.locale })
            : new TextEncoder().encode(renderHtml(inv, { lang: args.lang, locale: args.locale })),
        );
      }
      // --out is a directory when several inputs were given, when it already is one, or when it ends in a separator.
      const outIsDir =
        !!args.out &&
        (args.files.length > 1 ||
          invoices.length > 1 ||
          /[\\/]$/.test(args.out) ||
          (existsSync(args.out) && statSync(args.out).isDirectory()));
      if (args.out && !outIsDir) {
        writeFileSync(resolve(args.out), bodies[0]!);
        note(`wrote ${as} to ${args.out}`);
      } else if (args.out) {
        mkdirSync(resolve(args.out), { recursive: true });
        const seen = new Set<string>();
        invoices.forEach((inv, i) => {
          writeFileSync(join(resolve(args.out!), `${uniqueName(inv.id, seen)}.${as}`), bodies[i]!);
        });
        note(`wrote ${invoices.length} ${as} files to ${args.out}`);
      } else if (as === 'html') {
        for (const b of bodies) io.stdout(new TextDecoder().decode(b));
      } else if (io.stdoutBytes) io.stdoutBytes(bodies[0]!);
      else {
        err('this environment cannot write binary output to stdout; use --out <file>');
        return EXIT.internal;
      }
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

/** Runs the conversion API until the signal aborts or the process is told to stop. */
async function runServe(args: Parsed, io: IO, deps: Deps, note: (line: string) => void, err: (line: string) => void): Promise<number> {
  let trustSnapshot: TrustSnapshot | null = null;
  if (args.euTrust) {
    const path = snapshotPath(args.euTrust === true ? undefined : args.euTrust);
    try {
      trustSnapshot = parseSnapshot(readFileSync(path, 'utf8'));
    } catch (e) {
      err(
        `--eu-trust: cannot use the trusted-list snapshot ${path}: ${(e as Error).message} (create one with: einvoice-trust-lists update)`,
      );
      return EXIT.usage;
    }
  }
  const { startServer } = await import('./server.js');
  let server: ReturnType<typeof startServer>;
  try {
    server = startServer({
      port: args.port ?? 8080,
      hostname: args.host,
      cors: args.cors,
      limits: args.limits,
      trustSnapshot,
      now: deps.now,
    });
  } catch (e) {
    err(`serve: cannot listen: ${(e as Error).message}`);
    return EXIT.internal;
  }
  io.stdout(`listening on http://${server.hostname?.includes(':') ? `[${server.hostname}]` : server.hostname}:${server.port}\n`);
  if (args.cors) note(`CORS is on for ${args.cors === true ? 'any origin' : args.cors}`);
  await new Promise<void>((done) => {
    const stop = () => done();
    deps.signal?.addEventListener('abort', stop);
    if (deps.signal?.aborted) done();
    else if (!deps.signal) {
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    }
  });
  await server.stop();
  return EXIT.ok;
}

const PROFILE_NAMES: Record<WriterProfile, true> = { 'peppol-bis3': true, xrechnung: true, en16931: true };

/** Canonical invoices from JSON (the output of `einvoice convert`: one invoice or an array), or undefined when the bytes are not JSON. */
function canonicalFromJson(bytes: Uint8Array): CanonicalInvoice[] | undefined {
  const raw = new TextDecoder().decode(bytes);
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  if (!/^\s*[[{]/.test(text)) return undefined;
  const v: unknown = JSON.parse(text);
  const list = Array.isArray(v) ? v : [v];
  if (list.length === 0) throw new Error('JSON holds no invoices');
  for (const [i, inv] of list.entries()) {
    const problem = canonicalProblem(inv);
    if (problem)
      throw new Error(
        `JSON is not a canonical invoice${list.length > 1 ? ` (entry ${i})` : ''}: ${problem} (expected the output of \`einvoice convert\`)`,
      );
  }
  return list as CanonicalInvoice[];
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** What the writers read without checking: the required scalars, the party and totals objects, and every list. Undefined when all are there. */
function canonicalProblem(inv: unknown): string | undefined {
  if (!isObject(inv)) return 'not an object';
  if (inv.kind !== 'invoice' && inv.kind !== 'creditNote') return 'kind must be "invoice" or "creditNote"';
  for (const k of ['id', 'issueDate', 'currency', 'typeCode', 'specificationId'])
    if (typeof inv[k] !== 'string') return `${k} must be a string`;
  for (const k of ['notes', 'precedingInvoices', 'payments', 'allowances', 'charges', 'vatBreakdown', 'attachments', 'lines'])
    if (!Array.isArray(inv[k])) return `${k} must be a list`;
  for (const k of ['seller', 'buyer', 'totals']) if (!isObject(inv[k])) return `${k} must be an object`;
  const totals = inv.totals as Record<string, unknown>;
  for (const k of ['lineNetTotal', 'taxExclusive', 'taxInclusive', 'payable'])
    if (typeof totals[k] !== 'string') return `totals.${k} must be a decimal string`;
  for (const k of ['seller', 'buyer'])
    if (!Array.isArray((inv[k] as Record<string, unknown>).identifiers)) return `${k}.identifiers must be a list`;
  for (const [i, line] of (inv.lines as unknown[]).entries()) {
    if (!isObject(line) || typeof line.id !== 'string' || typeof line.netAmount !== 'string' || !isObject(line.item))
      return `lines[${i}] needs id, netAmount and item`;
    if (!Array.isArray(line.allowances) || !Array.isArray(line.charges)) return `lines[${i}] needs allowances and charges lists`;
    const item = line.item as Record<string, unknown>;
    if (!Array.isArray(item.classifications) || !Array.isArray(item.attributes))
      return `lines[${i}].item needs classifications and attributes lists`;
  }
  for (const [i, p] of (inv.payments as unknown[]).entries())
    if (!isObject(p) || !Array.isArray(p.creditTransfers)) return `payments[${i}] needs a creditTransfers list`;
  return undefined;
}

/** `einvoice write`: canonical JSON, or any invoice file converted first, written as UBL or CII. */
async function runWrite(args: Parsed, io: IO, err: (line: string) => void, note: (line: string) => void): Promise<number> {
  const { toCii, toUbl, WriterError } = await import('./writers/index.js');
  const tally = new Tally();
  const outputs: { id: string; xml: string }[] = [];
  const profile = args.profile as WriterProfile | undefined;
  const write = (label: string, inv: CanonicalInvoice): boolean => {
    try {
      outputs.push({ id: inv.id, xml: args.to === 'ubl' ? toUbl(inv, { profile }) : toCii(inv, { profile }) });
      return true;
    } catch (e) {
      // A WriterError names the value; anything else is a shape the check above did not foresee, which is still the input's fault.
      err(`${label}: invoice ${inv.id}: ${e instanceof WriterError ? e.message : `cannot be written (${(e as Error).message})`}`);
      return false;
    }
  };
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
    let canonical: CanonicalInvoice[] | undefined;
    try {
      canonical = canonicalFromJson(bytes);
    } catch (e) {
      err(`${label}: ${(e as Error).message}`);
      tally.fail(EXIT.unsafe);
      continue;
    }
    if (canonical) {
      if (canonical.map((inv) => write(label, inv)).every(Boolean)) tally.good();
      else tally.fail(EXIT.unsafe);
      continue;
    }
    const r = await convert(bytes, file === '-' ? undefined : file, args.limits);
    for (const o of r.outcomes) {
      if (o.status === 'ok') {
        if (o.invoices.map((inv) => write(label, inv)).every(Boolean)) tally.good();
        else tally.fail(EXIT.unsafe);
      } else if (o.status === 'not-an-invoice') {
        err(`${label}: not an invoice (${o.detection.kind === 'other-document' ? o.detection.label : 'unknown'})`);
        tally.fail(EXIT.unsupported);
      } else if (o.status === 'unsupported') {
        err(`${label}: ${o.reason}`);
        tally.fail(EXIT.unsupported);
      } else {
        err(`${label}: ${o.error}`);
        tally.fail(o.error.startsWith('Internal error') ? EXIT.internal : EXIT.unsafe);
      }
    }
    for (const s of r.skipped) {
      if (BENIGN_SKIP.test(s.reason)) note(`${label}: ${s.reason}`);
      else {
        err(`${label}: ${s.reason}`);
        tally.fail(EXIT.unsafe);
      }
    }
  }
  if (outputs.length === 0) return tally.code();
  if (args.out) {
    const dir = resolve(args.out);
    mkdirSync(dir, { recursive: true });
    const seen = new Set<string>();
    for (const o of outputs) writeFileSync(join(dir, `${uniqueName(o.id, seen)}.xml`), o.xml);
    note(`wrote ${outputs.length} ${args.to?.toUpperCase()} file(s) to ${args.out}`);
  } else if (outputs.length === 1) io.stdout(outputs[0]!.xml);
  else {
    err(`${outputs.length} invoices were written; give --out <dir> to get one file per invoice`);
    return EXIT.usage;
  }
  return tally.code();
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
    stdoutBytes: (b) => {
      process.stdout.write(b);
    },
    readStdin: async () => new Uint8Array(await Bun.stdin.arrayBuffer()),
  };
  process.exitCode = await main(process.argv.slice(2), io);
}
