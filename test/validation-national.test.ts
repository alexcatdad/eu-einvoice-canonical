import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { detectXml } from '../src/detect.js';
import { type CanonicalInvoice, convert, type ValidationSummary } from '../src/index.js';
import { type ValidationSuite, validate } from '../src/validation/index.js';
import { utf8 } from './helpers.js';

const DIR = new URL('./validation-fixtures/national/', import.meta.url);
const BUNDLES = new URL('../validation/bundles/', import.meta.url);

/** A mutation is an element (or block) name; `swap` exchanges two sibling blocks, `drop` removes one required block. */
interface Case {
  file: string;
  formatId: string;
  bundle: string;
  drop: string;
  swap: [string, string];
  suite?: ValidationSuite;
}

const CASES: Case[] = [
  { file: 'fatturapa.xml', formatId: 'fatturapa', bundle: 'xsd-fatturapa-1.2.2', drop: 'Divisa', swap: ['TipoDocumento', 'Divisa'] },
  {
    file: 'fatturapa-semplificata.xml',
    formatId: 'fatturapa-semplificata',
    bundle: 'xsd-fatturapa-semplificata-1.0',
    drop: 'Divisa',
    swap: ['TipoDocumento', 'Divisa'],
  },
  { file: 'ksef-fa2.xml', formatId: 'ksef', bundle: 'xsd-ksef-fa2', drop: 'P_2', swap: ['KodWaluty', 'P_1'] },
  { file: 'ksef-fa3.xml', formatId: 'ksef', bundle: 'xsd-ksef-fa3', drop: 'P_2', swap: ['KodWaluty', 'P_1'] },
  { file: 'ksef-fa-rr.xml', formatId: 'ksef', bundle: 'xsd-ksef-fa-rr', drop: 'P_4C', swap: ['P_4A', 'P_4B'] },
  {
    file: 'facturae-3.2.xml',
    formatId: 'facturae',
    bundle: 'xsd-facturae-3.2',
    drop: 'InvoiceNumber',
    swap: ['InvoiceNumber', 'InvoiceSeriesCode'],
  },
  {
    file: 'facturae-3.2.1.xml',
    formatId: 'facturae',
    bundle: 'xsd-facturae-3.2.1',
    drop: 'InvoiceNumber',
    swap: ['InvoiceNumber', 'InvoiceSeriesCode'],
  },
  {
    file: 'facturae-3.2.2.xml',
    formatId: 'facturae',
    bundle: 'xsd-facturae-3.2.2',
    drop: 'InvoiceNumber',
    swap: ['InvoiceNumber', 'InvoiceSeriesCode'],
  },
  { file: 'isdoc.isdoc', formatId: 'isdoc', bundle: 'xsd-isdoc-6.0.2', drop: 'ID', swap: ['DocumentType', 'ID'] },
  {
    file: 'ebinterface-4.3.xml',
    formatId: 'ebinterface',
    bundle: 'xsd-ebinterface-4.3',
    drop: 'InvoiceNumber',
    swap: ['InvoiceNumber', 'InvoiceDate'],
  },
  {
    file: 'ebinterface-5.0.xml',
    formatId: 'ebinterface',
    bundle: 'xsd-ebinterface-5.0',
    drop: 'InvoiceNumber',
    swap: ['InvoiceNumber', 'InvoiceDate'],
  },
  {
    file: 'ebinterface-6.0.xml',
    formatId: 'ebinterface',
    bundle: 'xsd-ebinterface-6.0',
    drop: 'InvoiceNumber',
    swap: ['InvoiceNumber', 'InvoiceDate'],
  },
  {
    file: 'ebinterface-6.1.xml',
    formatId: 'ebinterface',
    bundle: 'xsd-ebinterface-6.1',
    drop: 'InvoiceNumber',
    swap: ['InvoiceNumber', 'InvoiceDate'],
  },
  {
    file: 'finvoice.xml',
    formatId: 'finvoice',
    bundle: 'xsd-finvoice-3.0',
    drop: 'InvoiceNumber',
    swap: ['InvoiceTypeCode', 'InvoiceTypeText'],
  },
  {
    file: 'e-arve.xml',
    formatId: 'e-arve',
    bundle: 'xsd-earve-1.2',
    drop: 'InvoiceNumber',
    swap: ['Date', 'FileId'],
    suite: 'e-arve-1.2.EN',
  },
  { file: 'eslog-2.xml', formatId: 'eslog-2', bundle: 'xsd-eslog-2.0', drop: 'S_UNH', swap: ['S_UNH', 'S_BGM'] },
];

const read = (file: string) => readFileSync(new URL(file, DIR), 'utf8');
const block = (tag: string) => new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`);
const drop = (xml: string, tag: string) => xml.replace(block(tag), '');
function swap(xml: string, a: string, b: string) {
  const ma = block(a).exec(xml);
  const mb = block(b).exec(xml);
  assert.ok(ma && mb && ma.index < mb.index, `${a} must precede ${b}`);
  return xml.slice(0, ma.index) + mb[0] + xml.slice(ma.index + ma[0].length, mb.index) + ma[0] + xml.slice(mb.index + mb[0].length);
}

/** The first test to run loads libxml2 as WebAssembly; give every validation test room. */
const slow = (name: string, fn: () => Promise<void>) => test(name, { timeout: 60_000 }, fn);

async function validated(xml: string, file: string, suite?: ValidationSuite): Promise<{ invoice: CanonicalInvoice; v: ValidationSummary }> {
  const result = await convert(utf8(xml), file, undefined, { validate: true, validation: { suite } });
  const outcome = result.outcomes[0];
  if (outcome?.status !== 'ok') throw new Error(`${file}: not converted: ${outcome?.status}`);
  const invoice = outcome.invoices[0];
  return { invoice, v: invoice.source.validation! };
}

/** The mutated documents go straight to the validator: a parser would reject several of them before validation runs. */
async function validatedXml(xml: string, suite?: ValidationSuite): Promise<ValidationSummary> {
  return validate({ xml }, detectXml(xml), { suite });
}

const fatal = (v: ValidationSummary) => v.findings.filter((f) => f.layer === 'schema' && f.severity === 'fatal');

describe('national schemas', () => {
  for (const c of CASES) {
    describe(c.file, () => {
      slow('the valid document passes the schema layer', async () => {
        const { invoice, v } = await validated(read(c.file), c.file, c.suite);
        assert.equal(invoice.source.format, c.formatId);
        assert.equal(v.schema, 'passed', JSON.stringify(fatal(v)));
        assert.equal(v.semantic, 'not-run');
        assert.equal(v.profile, c.formatId === 'isdoc' ? 'passed' : 'not-run');
        assert.deepEqual(v.bundles, { schema: c.bundle, ...(c.formatId === 'isdoc' ? { profile: 'isdoc-6.0.2-rules' } : {}) });
        assert.deepEqual(fatal(v), []);
      });

      slow(`a missing <${c.drop}> fails with a located finding`, async () => {
        const xml = drop(read(c.file), c.drop);
        assert.notEqual(xml, read(c.file));
        const v = await validatedXml(xml, c.suite);
        assert.equal(v.schema, 'failed');
        assert.ok(fatal(v).length > 0);
        assert.ok(
          fatal(v).every((f) => /\(line \d+\)/.test(f.message)),
          JSON.stringify(fatal(v)),
        );
      });

      slow(`<${c.swap[0]}> and <${c.swap[1]}> in the wrong order fail with a located finding`, async () => {
        const v = await validatedXml(swap(read(c.file), c.swap[0], c.swap[1]), c.suite);
        assert.equal(v.schema, 'failed');
        assert.ok(
          fatal(v).some((f) => /\(line \d+\)/.test(f.message)),
          JSON.stringify(fatal(v)),
        );
      });
    });
  }

  slow('a namespace without a bundle gets no schema layer', async () => {
    const xml = read('ksef-fa3.xml').replaceAll('2025/06/25/13775', '2021/11/05/9999');
    const result = await convert(utf8(xml), 'x.xml', undefined, { validate: true });
    const o = result.outcomes[0];
    const v = o.status === 'ok' ? o.invoices[0].source.validation : undefined;
    assert.equal(v?.schema ?? 'not-run', 'not-run');
    assert.deepEqual(v?.bundles ?? {}, {});
  });

  test('every national bundle resolves its imports locally', () => {
    const ids = readdirSync(fileURLToPath(BUNDLES)).filter((n) => /^xsd-(?!ubl|cii)/.test(n));
    assert.ok(ids.length >= 16, `found ${ids.length} bundles`);
    for (const id of ids) {
      const dir = fileURLToPath(new URL(`${id}/`, BUNDLES));
      const walk = (d: string): string[] =>
        readdirSync(d).flatMap((n) => (statSync(`${d}/${n}`).isDirectory() ? walk(`${d}/${n}`) : [`${d}/${n}`]));
      for (const f of walk(dir).filter((p) => p.endsWith('.xsd'))) {
        assert.doesNotMatch(readFileSync(f, 'utf8'), /schemaLocation\s*=\s*["']https?:/, `${id}: ${f} points at a remote schema`);
      }
    }
  });
});
