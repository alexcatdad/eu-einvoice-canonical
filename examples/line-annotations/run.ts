/** Offline by default. --send is an explicit, single inference request to a consumer-configured endpoint. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { z } from 'zod';
import type { CanonicalInvoice } from '../../src/canonical.js';
import { buildLineAnnotationInput, LINE_ANNOTATION_SCHEMA, validateLineAnnotations } from '../../src/relations/annotations.js';

const root = import.meta.dir;
const validateInvoice = new Ajv2020({ strict: false }).compile<CanonicalInvoice>(
  JSON.parse(readFileSync(join(root, '../../schemas/canonical-invoice.v1.schema.json'), 'utf8')),
);
const assetsSchema = z.strictObject({
  invoice: z.unknown(),
  expected: z.unknown(),
  examples: z.array(
    z.strictObject({
      input: z.object({ id: z.string(), lines: z.array(z.object({ id: z.string() }).passthrough()) }).passthrough(),
      output: z.unknown(),
    }),
  ),
  config: z.strictObject({
    model: z.string().min(1),
    reasoning_effort: z.enum(['none', 'high']),
    temperature: z.number().min(0).max(2),
    top_p: z.number().gt(0).max(1),
    max_completion_tokens: z.number().int().positive(),
    includeExamples: z.boolean(),
  }),
});

/** Use the upstream Go parser, not a regex comment stripper or a different JSON dialect. */
export function loadExample() {
  const names = ['invoice', 'expected', 'examples', 'config'];
  const text = `{${names.map((name) => `${JSON.stringify(name)}:\n${readFileSync(join(root, `${name}.hujson`), 'utf8')}\n`).join(',')}}`;
  const standard = execFileSync('go', ['run', '-mod=readonly', '.'], {
    cwd: join(root, 'hujson'),
    input: text,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  const assets = assetsSchema.parse(JSON.parse(standard));
  if (!validateInvoice(assets.invoice)) throw new Error(`Invalid canonical invoice: ${JSON.stringify(validateInvoice.errors)}`);
  const invoice = assets.invoice;
  const input = buildLineAnnotationInput(invoice);
  const expected = validateLineAnnotations(assets.expected, input);
  if (!expected.ok) throw new Error(`Invalid saved expectation: ${JSON.stringify(expected.issues)}`);
  for (const example of assets.examples) {
    const result = validateLineAnnotations(example.output, example.input);
    if (!result.ok) throw new Error(`Invalid teaching example: ${JSON.stringify(result.issues)}`);
  }
  return { ...assets, invoice, input, expected: expected.value, prompt: readFileSync(join(root, 'system-prompt.txt'), 'utf8').trim() };
}

export function buildExampleRequest(assets: ReturnType<typeof loadExample>) {
  const { includeExamples, ...settings } = assets.config;
  const messages = [{ role: 'system', content: assets.prompt }];
  if (includeExamples)
    for (const example of assets.examples) {
      messages.push({ role: 'user', content: JSON.stringify(example.input) });
      messages.push({ role: 'assistant', content: JSON.stringify(example.output) });
    }
  messages.push({ role: 'user', content: JSON.stringify(assets.input) });
  return {
    ...settings,
    stream: false,
    messages,
    response_format: { type: 'json_schema', json_schema: { name: 'line_annotations_v1', strict: true, schema: LINE_ANNOTATION_SCHEMA } },
  };
}

/** Check provider completion before interpreting the content; a truncated response is never accepted. */
export function completedContent(body: unknown): string {
  const completion = z
    .object({
      choices: z
        .array(
          z.object({
            finish_reason: z.literal('stop'),
            message: z.object({ content: z.string(), refusal: z.null().optional() }),
          }),
        )
        .length(1),
    })
    .safeParse(body);
  if (!completion.success) throw new Error('Expected one complete, non-refused model response with finish_reason "stop".');
  return completion.data.choices[0].message.content;
}

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function runExample(send = false) {
  const assets = loadExample();
  const request = buildExampleRequest(assets);
  let raw: unknown = assets.expected;
  if (send) {
    const endpoint = process.env.LLM_CHAT_COMPLETIONS_URL;
    if (!endpoint) throw new Error('Set LLM_CHAT_COMPLETIONS_URL to your chosen full chat-completions URL.');
    const response = await fetch(endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(180_000),
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.LLM_API_KEY ? { Authorization: `Bearer ${process.env.LLM_API_KEY}` } : {}),
      },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error(`Model request failed (HTTP ${response.status}).`);
    raw = completedContent(await response.json());
  }
  const result = validateLineAnnotations(raw, assets.input);
  if (!result.ok) throw new Error(`Rejected annotation response: ${JSON.stringify(result.issues)}`);
  return {
    method: send ? 'model' : 'saved-example',
    status: 'unreviewed',
    inputSha256: hash(assets.input),
    requestSha256: hash(request),
    annotations: result.value,
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--send') || args.length > 1) throw new Error('Usage: bun examples/line-annotations/run.ts [--send]');
  console.log(JSON.stringify(await runExample(args.includes('--send')), null, 2));
}
