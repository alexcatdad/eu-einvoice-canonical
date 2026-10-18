/** Offline integration check for the HuJSON consumer example. Requires Go and the pinned module cache. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildExampleRequest, completedContent, loadExample, runExample } from '../examples/line-annotations/run.js';
import { LINE_ANNOTATION_SCHEMA, validateLineAnnotations } from '../src/relations/annotations.js';

const assets = loadExample();
const request = buildExampleRequest(assets);
assert.equal(request.messages.length, 8);
assert.deepEqual(JSON.parse(request.messages.at(-1)!.content), assets.input);
assert.deepEqual(request.response_format.json_schema.schema, LINE_ANNOTATION_SCHEMA);
for (const message of request.messages.filter((m) => m.role !== 'system')) JSON.parse(message.content);
assert.equal(buildExampleRequest({ ...assets, config: { ...assets.config, includeExamples: false } }).messages.length, 2);
const snapshot = JSON.stringify(assets.invoice);
const result = await runExample();
assert.equal(result.method, 'saved-example');
assert.equal(result.status, 'unreviewed');
assert.match(result.inputSha256, /^[a-f0-9]{64}$/);
assert.match(result.requestSha256, /^[a-f0-9]{64}$/);
assert.deepEqual(result.annotations, assets.expected);
assert.equal(JSON.stringify(assets.invoice), snapshot);
assert.equal(validateLineAnnotations(JSON.stringify(result.annotations), assets.input).ok, true);
const body = (finish: string, content: unknown, refusal?: string) => ({
  choices: [{ finish_reason: finish, message: { content, refusal } }],
});
assert.equal(completedContent(body('stop', '{}')), '{}');
for (const malformed of [body('length', '{}'), body('stop', null), body('stop', '{}', 'refused'), { choices: [] }])
  assert.throws(() => completedContent(malformed));
// Exercise the upstream parser with comments, a trailing comma and comment-like content inside strings.
const cwd = join(import.meta.dir, '../examples/line-annotations/hujson');
const standardized = execFileSync('go', ['run', '-mod=readonly', '.'], {
  cwd,
  input: '{/* explanation */ "url":"https://example.invalid/a//b", "values":[1,2,],}',
  encoding: 'utf8',
});
assert.deepEqual(JSON.parse(standardized), { url: 'https://example.invalid/a//b', values: [1, 2] });
assert.throws(() => execFileSync('go', ['run', '-mod=readonly', '.'], { cwd, input: '{"unfinished":', stdio: ['pipe', 'pipe', 'pipe'] }));
const schemaText = readFileSync(join(import.meta.dir, '../examples/line-annotations/response-format.hujson'), 'utf8');
const format = JSON.parse(execFileSync('go', ['run', '-mod=readonly', '.'], { cwd, input: schemaText, encoding: 'utf8' }));
assert.deepEqual(format, request.response_format);
console.log(
  'HuJSON conversion, canonical input, teaching examples, request, completion checks and offline annotations passed. No inference calls.',
);
