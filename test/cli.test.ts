import { describe, expect, test } from 'bun:test';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXIT, type IO, main, uniqueName, ValidatorUnavailable } from '../src/cli.js';
import { fixturePath } from './helpers.js';

const CLI = fileURLToPathOf('../src/cli.ts');
function fileURLToPathOf(rel: string) {
  return new URL(rel, import.meta.url).pathname;
}

async function run(args: string[], stdin?: Uint8Array | string) {
  const proc = Bun.spawn(['bun', CLI, ...args], {
    stdin: stdin === undefined ? 'ignore' : new Blob([stdin as BlobPart]),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { stdout, stderr, code };
}

const tmp = mkdtempSync(join(tmpdir(), 'einvoice-cli-'));
const write = (name: string, content: string) => {
  const p = join(tmp, name);
  writeFileSync(p, content);
  return p;
};
const peppol = fixturePath('peppol-bis3-invoice.xml');
const xrechnung = fixturePath('xrechnung-ubl.xml');
const doctype = write(
  'doctype.xml',
  '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "a">]><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"/>',
);
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
    const r = await run(['convert', '--quiet', '--out', out, peppol, peppol, fixturePath('peppol-bis3-creditnote.xml')]);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('');
    const names = readdirSync(out);
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length);
    expect(names.length).toBe(3);
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
    const out: string[] = [];
    const errs: string[] = [];
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
    const code = await main(['convert', '--validate', peppol], i, {
      validator: {
        validate: async () => {
          throw new ValidatorUnavailable('rules not installed');
        },
      },
    });
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
    const dir = join(tmp, 'sw');
    mkdirSync(dir);
    copyFileSync(peppol, join(dir, 'a.xml'));
    writeFileSync(join(dir, 'answers.json'), JSON.stringify({ 'a.xml': ['xrechnung-ubl'] }));
    const r = await run(['sweep', dir, '--expect', join(dir, 'answers.json')]);
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

describe('einvoice export', () => {
  const verCount = (s: string) => s.split('\r\n').filter((l) => l.startsWith('#VER')).length;
  test('--format sie writes CP437 bytes to stdout; the example mapping is announced', async () => {
    const proc = Bun.spawn(['bun', CLI, 'export', '--format', 'sie', '--generated', '2026-10-16', peppol], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [bytes, stderr, code] = await Promise.all([new Response(proc.stdout).bytes(), new Response(proc.stderr).text(), proc.exited]);
    expect(code).toBe(0);
    expect(stderr).toMatch(/example BAS mapping/);
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text.startsWith('#FLAGGA 0\r\n')).toBe(true);
    expect(text).toContain('#FORMAT PC8');
    expect(bytes.includes(0x86)).toBe(true); // å in CP437 ("Leverantörsskulder" has ö = 0x94)
    expect(verCount(text)).toBe(1);
  });
  test('--accounts with --out; --quiet silences the notes', async () => {
    const mapping = write(
      'mapping.json',
      JSON.stringify({ payable: '3300', inputVat: '1570', defaultExpense: '6000', rounding: '6999', prepaid: '1500' }),
    );
    const out = join(tmp, 'journal.se');
    const r = await run(['export', '--format', 'sie', '--accounts', mapping, '--out', out, '--quiet', '--generated', '2026-10-16', peppol]);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    const text = readFileSync(out, 'latin1');
    expect(text).toContain('#TRANS 3300 {} -3091.00');
    expect(text).toContain('#TRANS 6000 {}');
  });
  test('--format journal is JSON, --format csv is CSV', async () => {
    const j = await run(['export', '--format', 'journal', '--quiet', peppol]);
    expect(j.code).toBe(0);
    expect(JSON.parse(j.stdout)[0].invoiceId).toBe('INV-2026-1042');
    const c = await run(['export', '--format', 'csv', '--quiet', '--granularity', 'line', peppol]);
    expect(c.code).toBe(0);
    expect(c.stdout.startsWith('entry,date,invoice,')).toBe(true);
  });
  test('usage errors: missing or unknown format, bad granularity, unreadable or invalid mapping', async () => {
    expect((await run(['export', peppol])).code).toBe(1);
    expect((await run(['export', '--format', 'xml', peppol])).code).toBe(1);
    expect((await run(['export', '--format', 'csv', '--granularity', 'x', peppol])).code).toBe(1);
    const missing = await run(['export', '--format', 'csv', '--accounts', join(tmp, 'nope.json'), peppol]);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toMatch(/cannot read the account mapping/);
    const invalid = await run([
      'export',
      '--format',
      'csv',
      '--accounts',
      write('bad.json', '{"payable":"2440","defaultExpense":"4010"}'),
      peppol,
    ]);
    expect(invalid.code).toBe(1);
    expect(invalid.stderr).toMatch(/"inputVat" is required/);
  });
  test('an invoice that cannot be booked is reported (exit 4); the others are still exported (exit 5)', async () => {
    const mapping = write('nobalance.json', JSON.stringify({ payable: '2440', inputVat: '2641', defaultExpense: '4010' }));
    const only = await run(['export', '--format', 'journal', '--accounts', mapping, peppol]);
    expect(only.code).toBe(4);
    expect(only.stderr).toMatch(/invoice INV-2026-1042: .*rounding/);
    const some = await run([
      'export',
      '--format',
      'journal',
      '--accounts',
      mapping,
      '--quiet',
      peppol,
      fixturePath('svefaktura-1.0-credit.xml'),
    ]);
    expect(some.code).toBe(5);
    expect(JSON.parse(some.stdout)).toHaveLength(1);
  });
  test('a non-SEK invoice needs --currency', async () => {
    const split = fixturePath('fatturapa-split-payment.xml');
    const refused = await run(['export', '--format', 'sie', '--quiet', split]);
    expect(refused.code).toBe(4);
    expect(refused.stderr).toMatch(/ledger currency is SEK/);
    const allowed = await run(['export', '--format', 'sie', '--quiet', '--currency', 'EUR', split]);
    expect(allowed.code).toBe(0);
  });
});

describe('einvoice write', () => {
  test('writes an invoice file as UBL on stdout', async () => {
    const r = await run(['write', '--to', 'ubl', peppol]);
    expect(r.code).toBe(0);
    expect(r.stdout.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<Invoice xmlns=')).toBe(true);
    expect(r.stdout).toContain('<cbc:ID>INV-2026-1042</cbc:ID>');
    expect(r.stderr).toBe('');
  });
  test('writes canonical JSON as CII, and --profile picks the specification', async () => {
    const converted = await run(['convert', peppol]);
    const json = write('canonical.json', converted.stdout);
    const cii = await run(['write', '--to', 'cii', json]);
    expect(cii.code).toBe(0);
    expect(cii.stdout).toContain('<rsm:CrossIndustryInvoice');
    const x = await run(['write', '--to=ubl', '--profile', 'xrechnung', '-'], converted.stdout);
    expect(x.code).toBe(0);
    expect(x.stdout).toContain('xrechnung_3.0');
  });
  test('converts a national format first', async () => {
    const r = await run(['write', '--to', 'cii', fixturePath('fatturapa-b2b.xml')]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('<ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>');
  });
  test('several invoices need --out, which gets one file each', async () => {
    const lot = fixturePath('fatturapa-lot.xml');
    const refused = await run(['write', '--to', 'ubl', lot]);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toMatch(/--out/);
    const dir = join(tmp, 'written');
    const ok = await run(['write', '--to', 'ubl', '--out', dir, '--quiet', lot]);
    expect(ok.code).toBe(0);
    const files = readdirSync(dir);
    expect(files.length).toBeGreaterThan(1);
    expect(files.every((f) => f.endsWith('.xml'))).toBe(true);
  });
  test('usage errors', async () => {
    expect((await run(['write', peppol])).code).toBe(1);
    expect((await run(['write', '--to', 'json', peppol])).code).toBe(1);
    const profile = await run(['write', '--to', 'ubl', '--profile', 'nope', peppol]);
    expect(profile.code).toBe(1);
    expect(profile.stderr).toMatch(/--profile must be one of/);
  });
  test('JSON that is not an invoice is refused (exit 2); a non-invoice document is unsupported (exit 3)', async () => {
    const notInvoice = await run(['write', '--to', 'ubl', write('not-invoice.json', '{"hello":1}')]);
    expect(notInvoice.code).toBe(2);
    expect(notInvoice.stderr).toMatch(/not a canonical invoice/);
    const empty = await run(['write', '--to', 'ubl', write('empty.json', '[]')]);
    expect(empty.code).toBe(2);
    expect(empty.stderr).toMatch(/holds no invoices/);
    const partial = await run(['write', '--to', 'cii', write('partial.json', '{"kind":"invoice","id":"x","lines":[],"totals":{}}')]);
    expect(partial.code).toBe(2);
    expect(partial.stderr).toMatch(/not a canonical invoice: .*must be a/);
    const broken = await run(['write', '--to', 'ubl', write('broken.json', '{"kind":')]);
    expect(broken.code).toBe(2);
    const other = await run(['write', '--to', 'ubl', fixturePath('sdi-metadata.xml')]);
    expect(other.code).toBe(3);
  });
  test('a malformed decimal in the JSON is reported, not written (exit 2)', async () => {
    const converted = JSON.parse((await run(['convert', peppol])).stdout);
    converted[0].totals.payable = '12,5';
    const r = await run(['write', '--to', 'ubl', write('bad-decimal.json', JSON.stringify(converted))]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/not a decimal/);
  });
});
