import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXIT, main, uniqueName, ValidatorUnavailable, type IO } from '../src/cli.js';
import { fixturePath } from './helpers.js';

const CLI = fileURLToPathOf('../src/cli.ts');
function fileURLToPathOf(rel: string) { return new URL(rel, import.meta.url).pathname; }

async function run(args: string[], stdin?: Uint8Array | string) {
  const proc = Bun.spawn(['bun', CLI, ...args], { stdin: stdin === undefined ? 'ignore' : new Blob([stdin as BlobPart]), stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { stdout, stderr, code };
}

const tmp = mkdtempSync(join(tmpdir(), 'einvoice-cli-'));
const write = (name: string, content: string) => { const p = join(tmp, name); writeFileSync(p, content); return p; };
const peppol = fixturePath('peppol-bis3-invoice.xml');
const xrechnung = fixturePath('xrechnung-ubl.xml');
const doctype = write('doctype.xml', '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "a">]><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"/>');
const notXml = write('plain.txt', 'this is not an invoice');
const unknownXml = write('unknown.xml', '<?xml version="1.0"?><Thing xmlns="urn:example:thing"/>');

describe('einvoice detect', () => {
  test('prints format id, version and profile, exit 0', async () => {
    const r = await run(['detect', peppol]);
    expect(r.code).toBe(0);
    const [file, id] = r.stdout.trim().split('\t');
    expect(file).toBe(peppol);
    expect(id).toBe('peppol-bis3');
    expect(r.stderr).toBe('');
  });
  test('reads stdin for "-"', async () => {
    const r = await run(['detect', '-'], readFileSync(peppol));
    expect(r.code).toBe(0);
    expect(r.stdout.startsWith('stdin\tpeppol-bis3')).toBe(true);
  });
  test('several files, one line each', async () => {
    const r = await run(['detect', peppol, xrechnung]);
    expect(r.code).toBe(0);
    expect(r.stdout.trim().split('\n')).toHaveLength(2);
  });
});

describe('einvoice inspect', () => {
  test('emits JSON only on stdout', async () => {
    const r = await run(['inspect', peppol]);
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out).toHaveLength(1);
    expect(out[0].file).toBe(peppol);
    expect(out[0].documents[0].detection.kind).toBe('invoice');
    expect(out[0].documents[0].detection.format.id).toBe('peppol-bis3');
  });
  test('--pretty indents', async () => {
    const r = await run(['inspect', '--pretty', peppol]);
    expect(r.stdout).toContain('\n  ');
  });
});

describe('einvoice convert', () => {
  test('canonical JSON on stdout', async () => {
    const r = await run(['convert', peppol]);
    expect(r.code).toBe(0);
    const invs = JSON.parse(r.stdout);
    expect(invs).toHaveLength(1);
    expect(typeof invs[0].id).toBe('string');
    expect(invs[0].source.format).toBe('peppol-bis3');
  });
  test('--out writes one unique file per invoice and nothing to stdout', async () => {
    const out = join(tmp, 'out');
    const r = await run(['convert', '--quiet', '--out', out, peppol, peppol, fixturePath('e-arve-two-invoices.xml')]);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('');
    const names = readdirSync(out);
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length);
    expect(names.length).toBeGreaterThanOrEqual(4);
    for (const n of names) expect(JSON.parse(readFileSync(join(out, n), 'utf8')).id).toBeDefined();
    expect(names.some((n) => /-2\.json$/.test(n))).toBe(true);
  });
  test('--validate is a no-op with a message', async () => {
    const r = await run(['convert', '--validate', peppol]);
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/validation module is not available/);
    expect(JSON.parse(r.stdout)).toHaveLength(1);
    const q = await run(['convert', '--validate', '--quiet', peppol]);
    expect(q.stderr).toBe('');
  });
});

describe('exit codes', () => {
  test('2: DOCTYPE', async () => {
    const r = await run(['convert', doctype]);
    expect(r.code).toBe(2);
    expect(r.stderr.trim().split('\n')).toHaveLength(1);
    expect(r.stderr).toMatch(/DOCTYPE/);
    expect(JSON.parse(r.stdout)).toEqual([]);
  });
  test('2: not XML', async () => {
    expect((await run(['detect', notXml])).code).toBe(2);
  });
  test('2: limits exceeded', async () => {
    const r = await run(['convert', '--limits', '{"maxFileBytes":10}', peppol]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/larger than 10 bytes/);
  });
  test('3: unsupported format', async () => {
    const r = await run(['convert', unknownXml]);
    expect(r.code).toBe(3);
    expect(r.stderr.trim().split('\n')).toHaveLength(1);
  });
  test('5: some documents failed', async () => {
    const r = await run(['convert', peppol, unknownXml]);
    expect(r.code).toBe(5);
    expect(JSON.parse(r.stdout)).toHaveLength(1);
  });
  test('7: unreadable file', async () => {
    const r = await run(['detect', join(tmp, 'missing.xml')]);
    expect(r.code).toBe(7);
  });
  test('1: usage errors', async () => {
    expect((await run(['bogus'])).code).toBe(1);
    expect((await run(['detect'])).code).toBe(1);
    expect((await run(['detect', '--nope', peppol])).code).toBe(1);
    expect((await run(['convert', '--limits', 'nope', peppol])).code).toBe(1);
    expect((await run(['convert', '--limits', '{"bogus":1}', peppol])).code).toBe(1);
  });
  test('--help exits 0', async () => {
    const r = await run(['--help']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Exit codes');
  });
});

describe('validator seam (in process)', () => {
  const io = () => {
    const out: string[] = []; const errs: string[] = [];
    const i: IO = { stdout: (t) => out.push(t), stderr: (l) => errs.push(l), readStdin: async () => new Uint8Array() };
    return { i, out, errs };
  };
  test('4: validation failed', async () => {
    const { i, errs } = io();
    const code = await main(['convert', '--validate', peppol], i, { validator: { validate: async () => ['BR-01 missing'] } });
    expect(code).toBe(EXIT.validation);
    expect(errs.join('\n')).toMatch(/BR-01 missing/);
  });
  test('0: validation passed', async () => {
    const { i } = io();
    expect(await main(['convert', '--validate', peppol], i, { validator: { validate: async () => [] } })).toBe(0);
  });
  test('6: validator unavailable', async () => {
    const { i, errs } = io();
    const code = await main(['convert', '--validate', peppol], i, { validator: { validate: async () => { throw new ValidatorUnavailable('rules not installed'); } } });
    expect(code).toBe(EXIT.validatorUnavailable);
    expect(errs[0]).toMatch(/validator unavailable/);
  });
});

describe('sweep', () => {
  test('known-answer sweep over the fixtures exits 0', async () => {
    const r = await run(['sweep', fixturePath(''), '--expect', fixturePath('expected.json')]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/files match their expected formats/);
  });
  test('coverage mode counts formats', async () => {
    const r = await run(['sweep', fixturePath('')]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/invoice peppol-bis3/);
  });
  test('mismatch exits 1', async () => {
    const answers = write('answers.json', JSON.stringify({ [peppol]: ['xrechnung-ubl'] }));
    const r = await run(['sweep', peppol, '--expect', answers]);
    expect(r.code).toBe(1);
    expect(r.stdout).toMatch(/MISMATCH/);
  });
});

describe('uniqueName', () => {
  test('sanitises and de-duplicates', () => {
    const seen = new Set<string>();
    expect(uniqueName('INV/2026:1', seen)).toBe('INV_2026_1');
    expect(uniqueName('inv/2026:1', seen)).toBe('inv_2026_1-2');
    expect(uniqueName('', seen)).toBe('invoice');
    expect(uniqueName('..', seen)).toBe('invoice-2');
  });
});
