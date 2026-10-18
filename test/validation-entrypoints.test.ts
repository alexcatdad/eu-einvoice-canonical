import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHandler } from '../src/server.js';

const validXml = readFileSync(new URL('./validation-fixtures/peppol-valid-invoice.xml', import.meta.url), 'utf8');
const post = (xml: string) =>
  new Request('http://localhost/v1/convert?validate=true', {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml' },
    body: xml,
  });

describe('requested HTTP source validation', () => {
  test('a complete pass is 200 and invalid source totals are 422', async () => {
    const handler = createHandler();
    expect((await handler(post(validXml))).status).toBe(200);
    const response = await handler(
      post(validXml.replace('<cbc:TaxInclusiveAmount currencyID="SEK">250.00', '<cbc:TaxInclusiveAmount currencyID="SEK">260.00')),
    );
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.result.outcomes[0].validation.result).toBe('invalid');
  });
  test('required checks skipped by execution limits are incomplete', async () => {
    const response = await createHandler({ validation: { maxSchematronLines: 0 } })(post(validXml));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.result.outcomes[0].validation).toMatchObject({
      result: 'incomplete',
      schema: 'passed',
      semantic: 'not-run',
      profile: 'not-run',
      reasons: { semantic: 'size-limit', profile: 'size-limit' },
    });
  });
  test('one unavailable required profile rejects a complete-pass response', async () => {
    const handler = createHandler({
      validation: {
        bundles: {
          read: async (id, path) => {
            if (id.startsWith('peppol-')) throw new Error('Profile bundle unavailable');
            return new Uint8Array(readFileSync(new URL(`../validation/bundles/${id}/${path}`, import.meta.url)));
          },
        },
      },
    });
    const response = await handler(post(validXml));
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body.result.outcomes[0].invoices[0].source.validation).toMatchObject({
      result: 'incomplete',
      schema: 'passed',
      semantic: 'passed',
      profile: 'unavailable',
    });
  });
});
