#!/usr/bin/env bun
/** Explicit network maintenance for offline, reproducible EU signature verification. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { snapshotPath } from './signature/snapshot-file.js';
import { type LoadOptions, LotlError, loadTrustLists } from './signature/trust-lists.js';
import { parseSnapshot, type TrustSnapshot } from './signature/tsl.js';

export interface TrustListIO {
  stdout(text: string): void;
  stderr(line: string): void;
}
export type TrustListDeps = Pick<LoadOptions, 'fetch' | 'now'>;
interface UpdateArgs {
  out?: string;
  lotlSigner?: string;
  lotlUrl?: string;
}
const USAGE = 'Usage: einvoice-trust-lists update [--out <snapshot.json>] [--lotl-signer <cert.pem>] [--lotl-url <url>]';
const EXIT = { ok: 0, usage: 1, unsafe: 2, internal: 7 } as const;

export async function main(argv: string[], io: TrustListIO, deps: TrustListDeps = {}): Promise<number> {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) {
    io.stdout(`${USAGE}\n`);
    return EXIT.ok;
  }
  const err = (line: string) => io.stderr(`einvoice-trust-lists: ${line.replace(/[\r\n\t]+/g, ' ')}`);
  if (argv[0] !== 'update') {
    err(USAGE);
    return EXIT.usage;
  }
  const args: UpdateArgs = {};
  const flags = { '--out': 'out', '--lotl-signer': 'lotlSigner', '--lotl-url': 'lotlUrl' } as const;
  for (let i = 1; i < argv.length; i++) {
    const eq = argv[i].indexOf('=');
    const flag = eq < 0 ? argv[i] : argv[i].slice(0, eq);
    const value = eq < 0 ? argv[++i] : argv[i].slice(eq + 1);
    if (!Object.hasOwn(flags, flag) || !value || value.startsWith('--')) {
      err(`Unknown flag or missing value: ${flag}`);
      return EXIT.usage;
    }
    args[flags[flag as keyof typeof flags]] = value;
  }
  try {
    return await updateTrustLists(args, io, deps, err, err);
  } catch (e) {
    err(`internal error: ${e instanceof Error ? e.message : String(e)}`);
    return EXIT.internal;
  }
}

async function updateTrustLists(
  args: UpdateArgs,
  io: TrustListIO,
  deps: TrustListDeps,
  note: (line: string) => void,
  err: (line: string) => void,
): Promise<number> {
  const out = snapshotPath(args.out);
  let previous: TrustSnapshot | undefined;
  try {
    previous = parseSnapshot(readFileSync(out, 'utf8'));
  } catch {
    /* no usable previous snapshot: the LOTL signer is pinned on first use */
  }
  try {
    const snapshot = await loadTrustLists({
      fetch: deps.fetch,
      lotlUrl: args.lotlUrl,
      lotlSigners: args.lotlSigner ? [readFileSync(args.lotlSigner, 'utf8')] : undefined,
      previous,
      now: deps.now,
    });
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(snapshot));
    const loaded = snapshot.lists.filter((l) => l.status === 'loaded');
    const services = loaded.reduce((n, l) => n + l.services.length, 0);
    io.stdout(`${out}\t${loaded.length}/${snapshot.lists.length} lists\t${services} CA/QC services\tfetched ${snapshot.fetchedAt}\n`);
    for (const p of snapshot.problems) note(p);
    return EXIT.ok;
  } catch (e) {
    if (e instanceof LotlError) {
      err(e.message);
      return EXIT.unsafe;
    }
    throw e;
  }
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2), {
    stdout: (text) => {
      process.stdout.write(text);
    },
    stderr: (line) => {
      process.stderr.write(`${line}\n`);
    },
  });
}
