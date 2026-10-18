import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateSource, validationPassed } from '../src/index.js';

const xml = readFileSync(new URL('./fixtures/xrechnung-ubl.xml', import.meta.url), 'utf8');

test('source receipts identify the exact manifest bytes used for validation', async () => {
  let manifestReads = 0;
  const bytes = readFileSync(new URL('../validation/bundles/xsd-ubl-2.1/manifest.json', import.meta.url));
  const summary = await validateSource(
    { xml },
    {
      scope: 'schema',
      bundles: {
        read: async (id, path) => {
          if (path === 'manifest.json') {
            manifestReads++;
            assert.equal(manifestReads, 1, 'Receipt and engine must use the same manifest read');
            return bytes;
          }
          return readFileSync(new URL(`../validation/bundles/${id}/${path}`, import.meta.url));
        },
      },
    },
  );
  assert.equal(summary.result, 'valid');
  assert.equal(summary.receipt?.artifacts.schema?.manifestSha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(manifestReads, 1);
});

test('validation acceptance requires a receipt from the supported conformance policy', async () => {
  const summary = await validateSource({ xml }, { scope: 'schema' });
  assert.equal(validationPassed(summary), true, 'A current schema-scope receipt remains accepted');
  assert.equal(validationPassed({ ...summary, receipt: undefined }), false, 'Legacy valid/complete flags cannot establish acceptance');
  assert.ok(summary.receipt);
  const unknownPolicy = JSON.parse(JSON.stringify(summary));
  unknownPolicy.receipt.policy = 'unknown-policy';
  assert.equal(validationPassed(unknownPolicy), false);
  assert.equal(validationPassed(undefined), false);
});
