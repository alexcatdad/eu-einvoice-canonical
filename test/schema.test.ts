import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { convert, schemaVersion } from '../src/index.js';
import { fixture, fixturePath } from './helpers.js';

const schema = (name: string) =>
  JSON.parse(readFileSync(join(import.meta.dir, '..', 'schemas', `${name}.${schemaVersion}.schema.json`), 'utf8'));

const ajv = new Ajv2020({ strict: false, allErrors: false });
const validateInvoice = ajv.compile(schema('canonical-invoice'));
const validateResult = ajv.compile(schema('convert-result'));

const fixtures = readdirSync(fixturePath('')).flatMap((f) =>
  f === 'real'
    ? readdirSync(fixturePath('real')).map((r) => `real/${r}`)
    : f === 'README.md' || f === 'expected.json' || f.startsWith('.')
      ? []
      : [f],
);

describe('JSON Schema', () => {
  test('schemas declare draft 2020-12 and a versioned $id under the Pages site', () => {
    for (const name of ['canonical-invoice', 'convert-result']) {
      const s = schema(name);
      expect(s.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(s.$id).toBe(`https://alexcatdad.github.io/eu-einvoice-canonical/schemas/${name}.${schemaVersion}.schema.json`);
    }
  });

  test('rejects values that break the primitive types', () => {
    expect(validateResult({ fileSha256: 'x', outcomes: [], skipped: [] })).toBe(true);
    expect(validateResult({ fileSha256: 'x', outcomes: 'nope', skipped: [] })).toBe(false);
  });

  test('value origins survive JSON serialization, remain optional and reject unknown states', async () => {
    const result = await convert(fixture('en16931-cii.xml'), 'synthetic.xml');
    const outcome = result.outcomes[0];
    if (outcome.status !== 'ok') throw new Error('Synthetic fixture did not convert');
    const wire = JSON.parse(JSON.stringify(outcome.invoices[0]));
    expect(wire.source.valueOrigins['/lines/0/netAmount']).toBe('source');
    expect(validateInvoice(wire)).toBe(true);
    wire.source.valueOrigins['/lines/0/netAmount'] = 'probably-source';
    expect(validateInvoice(wire)).toBe(false);
    delete wire.source.valueOrigins;
    expect(validateInvoice(wire)).toBe(true);
  });

  for (const name of fixtures) {
    test(`converted output of ${name} validates`, async () => {
      for (const options of [{}, { relations: true, provenance: true }]) {
        const result = await convert(fixture(name), name, undefined, options);
        // The wire form: what a non-TypeScript consumer receives.
        const wire = JSON.parse(JSON.stringify(result));
        const ok = validateResult(wire);
        expect(ok ? null : ajv.errorsText(validateResult.errors)).toBeNull();
        for (const o of wire.outcomes) {
          if (o.status !== 'ok') continue;
          for (const inv of o.invoices) {
            const okInv = validateInvoice(inv);
            expect(okInv ? null : ajv.errorsText(validateInvoice.errors)).toBeNull();
          }
        }
      }
    });
  }
});
