import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { capped, createMcpServer } from '../src/mcp/server.js';
import { fixture, fixturePath } from './helpers.js';

const allowed = mkdtempSync(join(tmpdir(), 'einvoice-mcp-'));
const invoicePath = join(allowed, 'invoice.xml');
writeFileSync(invoicePath, fixture('peppol-bis3-invoice.xml'));

const client = new Client({ name: 'test', version: '1.0.0' });
type Content = { type: string; text: string }[];
const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: Content };
  return { isError: r.isError ?? false, summary: r.content[0]?.text ?? '', data: r.content[1] ? JSON.parse(r.content[1].text) : undefined };
};

beforeAll(async () => {
  const server = createMcpServer({ allowDirs: [allowed] });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
});
afterAll(async () => {
  await client.close();
});

describe('MCP server', () => {
  test('lists every tool, each saying invoice content is untrusted where it reads invoices', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(['convert_invoice', 'detect_invoice_format', 'explain_finding', 'list_formats', 'validate_invoice']);
    for (const t of tools.filter((t) => !['list_formats', 'explain_finding'].includes(t.name)))
      expect(t.description).toContain('untrusted');
  });

  test('list_formats returns the registry', async () => {
    const r = await call('list_formats');
    expect(r.data.some((f: { id: string }) => f.id === 'peppol-bis3')).toBe(true);
  });

  test('convert_invoice from an allowed file', async () => {
    const r = await call('convert_invoice', { file: invoicePath });
    expect(r.isError).toBe(false);
    expect(r.summary).toContain('INV-2026-1042');
    expect(r.data.outcomes[0].invoices[0].totals.payable).toBe('3091.00');
  });

  test('convert_invoice from inline XML and from base64', async () => {
    const xml = new TextDecoder().decode(fixture('xrechnung-ubl.xml'));
    expect((await call('convert_invoice', { xml })).data.outcomes[0].status).toBe('ok');
    const b64 = Buffer.from(fixture('facturx-en16931.pdf')).toString('base64');
    expect((await call('convert_invoice', { base64: b64 })).data.outcomes[0].invoices[0].id).toBe('471102');
  });

  test('a file outside the allowed directories is refused', async () => {
    const r = await call('convert_invoice', { file: fixturePath('peppol-bis3-invoice.xml') });
    expect(r.isError).toBe(true);
    expect(r.summary).toContain('outside the allowed directories');
  });

  test('exactly one input is required, and relative paths are refused', async () => {
    expect((await call('convert_invoice', {})).isError).toBe(true);
    expect((await call('convert_invoice', { file: 'invoice.xml' })).summary).toContain('absolute');
  });

  test('detect_invoice_format reports format and envelope', async () => {
    const r = await call('detect_invoice_format', { base64: Buffer.from(fixture('anaf-download.zip')).toString('base64') });
    expect(r.data.documents[0].format).toBe('cius-ro');
    expect(r.data.documents[0].envelope).toEqual(['zip', 'xml']);
  });

  test('explain_finding knows the totals rules', async () => {
    expect((await call('explain_finding', { ruleId: 'br-co-15' })).summary).toContain('BT-112');
    expect((await call('explain_finding', { ruleId: 'XYZ-1' })).data.explanation).toBeNull();
  });

  test('validate_invoice retains source findings when mapping fails', async () => {
    const xml = readFileSync(new URL('./validation-fixtures/svefaktura-valid-invoice.xml', import.meta.url), 'utf8').replace(
      '2026-10-05',
      'not-a-date',
    );
    const r = await call('validate_invoice', { xml });
    expect(r.data.reports).toHaveLength(1);
    expect(r.data.reports[0].validation.schema).toBe('failed');
    expect(r.data.reports[0].validation.result).toBe('invalid');
    expect(r.data.reports[0].conversionStatus).toBe('error');
    expect(r.summary).toContain('invalid');
  });

  test('schema resources are readable', async () => {
    const r = await client.readResource({ uri: 'einvoice://schemas/canonical-invoice.v1' });
    expect(JSON.parse((r.contents[0] as { text: string }).text).$schema).toContain('2020-12');
  });

  test('long base64 attachments and oversized output are shortened', () => {
    const text = capped({ attachments: [{ base64: 'A'.repeat(10_000) }] }, 1_000_000);
    expect(text).toContain('base64 characters omitted');
    expect(capped({ x: 'y'.repeat(5_000) }, 100)).toContain('output cut at 100');
  });
});
