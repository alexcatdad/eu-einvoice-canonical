import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { snapshotPath } from '../src/signature/snapshot-file.js';
import { main } from '../src/trust-lists-cli.js';

const sink = () => {
  const output: string[] = [];
  return { output, io: { stdout: (s: string) => output.push(s), stderr: (s: string) => output.push(s) } };
};

describe('explicit trust maintenance', () => {
  test('help and malformed arguments require no acquisition', async () => {
    const h = sink();
    expect(await main(['--help'], h.io)).toBe(0);
    expect(h.output.join('')).toContain('einvoice-trust-lists update');
    for (const args of [
      [],
      ['convert'],
      ['update', '--out'],
      ['update', '--out='],
      ['update', '--unknown', 'x'],
      ['update', '--out', '--lotl-url'],
    ]) {
      expect(await main(args, sink().io)).toBe(1);
    }
  });

  test('file errors are reported as internal failures before acquisition', async () => {
    const s = sink();
    const dir = mkdtempSync(join(tmpdir(), 'trust-maintenance-'));
    expect(await main(['update', `--out=${join(dir, 'snapshot.json')}`, '--lotl-signer', join(dir, 'missing.pem')], s.io)).toBe(7);
    expect(s.output.join('')).toContain('internal error:');
  });

  test('conversion and maintenance share explicit and environment snapshot locations', () => {
    expect(snapshotPath('relative.json')).toBe(resolve('relative.json'));
    const previous = process.env.EINVOICE_TRUST_SNAPSHOT;
    process.env.EINVOICE_TRUST_SNAPSHOT = join(mkdtempSync(join(tmpdir(), 'trust-path-')), 'snapshot.json');
    writeFileSync(process.env.EINVOICE_TRUST_SNAPSHOT, '{}');
    try {
      expect(snapshotPath()).toBe(resolve(process.env.EINVOICE_TRUST_SNAPSHOT));
    } finally {
      if (previous === undefined) delete process.env.EINVOICE_TRUST_SNAPSHOT;
      else process.env.EINVOICE_TRUST_SNAPSHOT = previous;
    }
    // The distribution ships a pinned offline fallback and never needs to fetch it.
    expect(snapshotPath()).toMatch(/eu-trust-snapshot\.json$/);
  });
});
