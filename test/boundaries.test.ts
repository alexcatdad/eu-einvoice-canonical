import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import * as core from 'eu-einvoice-canonical';
import { renderHtml } from 'eu-einvoice-canonical/render';
import { loadTrustLists } from 'eu-einvoice-canonical/trust-lists';
import { toCii, toUbl } from 'eu-einvoice-canonical/writers';
import { loadSiteTrust } from '../site/trust.js';
import { main } from '../src/cli.js';
import { fixturePath } from './helpers.js';

const root = join(import.meta.dir, '..');

async function inputs(entry: string): Promise<string[]> {
  const result = await Bun.build({ entrypoints: [join(root, entry)], target: 'browser', metafile: true, splitting: true });
  expect(result.success).toBe(true);
  return Object.keys(result.metafile!.inputs);
}

describe('public package boundaries', () => {
  test('core graph excludes downstream consumers and network trust maintenance', async () => {
    const graph = await inputs('src/index.ts');
    expect(graph.length).toBeGreaterThan(10);
    expect(graph.filter((p) => /src\/(render\/|react\/|writers\/|mcp\/|server\.|signature\/tsl-load\.)/.test(p))).toEqual([]);
    expect(graph.filter((p) => /node_modules\/(react|react-dom|@modelcontextprotocol|zod)\//.test(p))).toEqual([]);
    for (const name of ['renderHtml', 'renderPdf', 'toUbl', 'toCii', 'loadTrustLists', 'matching', 'findDuplicates', 'buildJournalEntry']) {
      expect(name in core).toBe(false);
    }
  });

  test('optional entry points consume canonical conversion results', async () => {
    const result = await core.convert(new Uint8Array(await Bun.file(fixturePath('peppol-bis3-invoice.xml')).arrayBuffer()));
    const outcome = result.outcomes[0];
    if (outcome.status !== 'ok') throw new Error('Expected a canonical invoice');
    const invoice = outcome.invoices[0];
    expect(renderHtml(invoice)).toContain(invoice.id);
    expect(toUbl(invoice)).toContain(invoice.id);
    expect(toCii(invoice)).toContain(invoice.id);
    expect(typeof loadTrustLists).toBe('function');
  });

  test('browser graph excludes trust-list acquisition', async () => {
    expect((await inputs('site/trust.ts')).filter((p) => p.includes('tsl-load'))).toEqual([]);
    const original = globalThis.fetch;
    const urls: string[] = [];
    const snapshot = await Bun.file(join(root, 'trust/eu-trust-snapshot.json')).text();
    globalThis.fetch = (async (input: string | URL | Request) => {
      urls.push(String(input));
      return new Response(snapshot);
    }) as typeof fetch;
    try {
      const result = await loadSiteTrust();
      expect(result.snapshot.version).toBe(1);
      expect(urls).toEqual(['eu-trust-snapshot.json']);
    } finally {
      globalThis.fetch = original;
    }
  });

  test('core CLI rejects maintenance commands and flags', async () => {
    for (const argv of [
      ['trust-lists', 'update'],
      ['convert', '--lotl-url', 'https://example.invalid'],
      ['convert', '--lotl-signer', 'cert'],
    ]) {
      expect(await main(argv, { stdout() {}, stderr() {}, readStdin: async () => new Uint8Array() })).toBe(1);
    }
  });
});
