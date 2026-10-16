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
