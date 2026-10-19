import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const valid = readFileSync(new URL('./fixtures/xrechnung-ubl.xml', import.meta.url), 'utf8');

test('CLI validation remains active after optional consumers are separated', async () => {
  for (const [xml, expected, layer] of [
    [valid, 0, 'valid'],
    [valid.replace(/(<cbc:PayableAmount[^>]*>)[^<]+/, '$11.00'), 4, 'invalid'],
    [valid.replace(/<cbc:BuyerReference>[^<]*<\/cbc:BuyerReference>/, ''), 4, 'invalid'],
  ] as const) {
    const child = Bun.spawn(['bun', cli, 'convert', '--validate', '--quiet', '-'], {
      stdin: new Blob([xml]),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect(code, stderr).toBe(expected);
    const validation = JSON.parse(stdout)[0].source.validation;
    expect(validation.result).toBe(layer);
    expect(validation.schema).toBe('passed');
    if (expected === 0) {
      expect(validation.semantic).toBe('passed');
      expect(validation.profile).toBe('passed');
    }
    expect(stderr).not.toContain('documents are converted without validation');
  }
});

test('missing validators still return exit 6 with canonical JSON in quiet mode', async () => {
  const { main } = await import('../src/cli.js');
  const output: string[] = [];
  const code = await main(
    ['convert', '--validate', '--quiet', '-'],
    { stdout: (s) => output.push(s), stderr() {}, readStdin: async () => new TextEncoder().encode(valid) },
    {
      validation: {
        bundles: {
          read: async () => {
            throw new Error('regression: validators unavailable');
          },
        },
      },
    },
  );
  expect(code).toBe(6);
  const invoice = JSON.parse(output.join(''))[0];
  expect(invoice.id).toBeDefined();
  expect(invoice.source.validation.result).toBe('incomplete');
  expect(invoice.source.validation.schema).toBe('unavailable');
});
