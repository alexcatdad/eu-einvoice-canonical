/**
 * Contract tests for the conversion API: the reference server runs in-process on a free port, every fixture goes through
 * every endpoint, and each response (status, headers, body) is checked against openapi/openapi.yaml. The spec itself is
 * validated as OpenAPI 3.1, and its references into schemas/ are checked so the spec and the generated files cannot drift.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Validator } from '@seriousme/openapi-schema-validator';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { zipSync } from 'fflate';
import { main } from '../src/cli.js';
import { describeFormats, parseSnapshot, schemaVersion } from '../src/index.js';
import { PROBLEMS, problemType } from '../src/problems.js';
import { startServer } from '../src/server.js';
import { fixture, fixturePath, utf8 } from './helpers.js';

const root = join(import.meta.dir, '..');
const spec = Bun.YAML.parse(readFileSync(join(root, 'openapi/openapi.yaml'), 'utf8')) as any;
const SPEC_ID = 'https://spec.invalid/openapi.json';

// ---------------------------------------------------------------------------
// Response checking against the spec
// ---------------------------------------------------------------------------

const schemaFiles = readdirSync(join(root, 'schemas')).filter((f) => f.endsWith('.schema.json'));
const schemaDocs = new Map(schemaFiles.map((f) => [f, JSON.parse(readFileSync(join(root, 'schemas', f), 'utf8'))]));

const ajv = new Ajv2020({ strict: false, validateSchema: false, allErrors: false });
(addFormats as unknown as (a: Ajv2020) => void)(ajv);
for (const doc of schemaDocs.values()) ajv.addSchema(doc);
// The spec points at ../schemas/<file>; in ajv those are the files' own $id URLs.
const rewritten = JSON.parse(
  JSON.stringify(spec).replace(/"\.\.\/schemas\/([^"#]+)(#[^"]*)?"/g, (_m, file: string, frag?: string) => {
    const doc = schemaDocs.get(file);
    if (!doc) throw new Error(`openapi.yaml references schemas/${file}, which does not exist`);
    return JSON.stringify(`${doc.$id}${frag ?? ''}`);
  }),
);
ajv.addSchema({ $id: SPEC_ID, ...rewritten });

const pointerEscape = (s: string) => s.replace(/~/g, '~0').replace(/\//g, '~1');
const at = (pointer: string): any =>
  pointer
    .slice(2)
    .split('/')
    .reduce((n: any, k) => n?.[k.replace(/~1/g, '/').replace(/~0/g, '~')], spec);

/** Follows `$ref: '#/...'` chains inside the spec. */
function deref(node: any, pointer: string): { node: any; pointer: string } {
  while (node && typeof node.$ref === 'string' && node.$ref.startsWith('#/')) {
    pointer = node.$ref;
    node = at(pointer);
  }
  return { node, pointer };
}

const checked = new Set<string>();

/** Fails unless the response is one the spec documents for this operation. Returns the parsed body. */
async function conforms(res: Response, method: string, path: string): Promise<any> {
  const opPath = path.replace(/^\/v1\/schemas\/[^/]+$/, '/v1/schemas/{name}');
  const op = spec.paths[opPath]?.[method.toLowerCase()];
  expect(op, `${method} ${opPath} is in the spec`).toBeDefined();
  const declared = op.responses[String(res.status)];
  expect(declared, `${method} ${opPath} documents status ${res.status}`).toBeDefined();
  const { node: response, pointer } = deref(declared, `#/paths/${pointerEscape(opPath)}/${method.toLowerCase()}/responses/${res.status}`);

  for (const [name, h] of Object.entries<any>(response.headers ?? {})) {
    if (deref(h, '').node.required) expect(res.headers.has(name), `header ${name} on ${method} ${opPath} ${res.status}`).toBe(true);
  }
  const mediaType = (res.headers.get('content-type') ?? '').split(';')[0]!.trim();
  const content = response.content?.[mediaType];
  expect(content, `${method} ${opPath} ${res.status} documents ${mediaType || '(no content type)'}`).toBeDefined();
  expect(res.headers.get('x-content-type-options')).toBe('nosniff');

  const body = await res.json();
  const validate = ajv.compile({ $ref: `${SPEC_ID}${pointer}/content/${pointerEscape(mediaType)}/schema` });
  const ok = validate(body);
  expect(ok ? null : ajv.errorsText(validate.errors), `${method} ${opPath} ${res.status} body`).toBeNull();
  checked.add(`${method} ${opPath} ${res.status}`);
  return body;
}

// ---------------------------------------------------------------------------
// The spec itself
// ---------------------------------------------------------------------------

describe('openapi.yaml', () => {
  test('is a valid OpenAPI 3.1 document', async () => {
    const v = new Validator();
    const res = await v.validate(spec);
    expect(res.valid ? null : JSON.stringify(res.errors)).toBeNull();
    expect(v.version).toBe('3.1');
  });

  test('openapi.json is the same document as the YAML', () => {
    expect(JSON.parse(readFileSync(join(root, 'openapi/openapi.json'), 'utf8'))).toEqual(spec);
  });

  test('every reference into schemas/ resolves, and every schema file is used', () => {
    const refs: string[] = [];
    JSON.stringify(spec, (_k, v) => {
      if (typeof v === 'string' && v.startsWith('../schemas/')) refs.push(v);
      return v;
    });
    expect(refs.length).toBeGreaterThan(3);
    for (const ref of refs) {
      const [file, frag] = ref.slice('../schemas/'.length).split('#');
      const doc = schemaDocs.get(file!);
      expect(doc, `${ref}: no such schema file`).toBeDefined();
      if (frag) {
        const target = frag
          .slice(1)
          .split('/')
          .filter(Boolean)
          .reduce((n: any, k) => n?.[k], doc);
        expect(target, `${ref}: fragment not found in the generated schema`).toBeDefined();
      }
    }
    for (const f of schemaFiles)
      expect(
        refs.some((r) => r.startsWith(`../schemas/${f}`)),
        `${f} is not referenced by the spec`,
      ).toBe(true);
  });

  test('the schemas served by name are the generated files of the current schema version', () => {
    const names = spec.paths['/v1/schemas/{name}'].get.parameters[0].schema.enum as string[];
    expect(names.map((n) => `${n}.${schemaVersion}.schema.json`).sort()).toEqual([...schemaFiles].sort());
  });

  test('the problem schemas match the problem catalogue and the CLI exit codes', async () => {
    const { EXIT } = await import('../src/cli.js');
    const bySlug = {
      'unsafe-or-malformed': 'ProblemUnsafe',
      unsupported: 'ProblemUnsupported',
      'validation-failed': 'ProblemValidationFailed',
      partial: 'ProblemPartial',
      'validator-unavailable': 'ProblemValidatorUnavailable',
      internal: 'ProblemInternal',
    } as const;
    const exit = {
      'unsafe-or-malformed': EXIT.unsafe,
      unsupported: EXIT.unsupported,
      'validation-failed': EXIT.validation,
      partial: EXIT.partial,
      'validator-unavailable': EXIT.validatorUnavailable,
      internal: EXIT.internal,
    };
    for (const [slug, def] of Object.entries(bySlug)) {
      const props = spec.components.schemas[def].allOf[1].properties;
      expect(props.type.const).toBe(problemType(slug as keyof typeof PROBLEMS));
      expect(props.exitCode.const).toBe(exit[slug as keyof typeof exit]);
      expect(PROBLEMS[slug as keyof typeof PROBLEMS].exitCode).toBe(exit[slug as keyof typeof exit]);
    }
  });

  test('schemas/formats.json is the registry', () => {
    expect(JSON.parse(readFileSync(join(root, 'schemas/formats.json'), 'utf8'))).toEqual({
      formats: JSON.parse(JSON.stringify(describeFormats())),
    });
  });
});

// ---------------------------------------------------------------------------
// The server, through real HTTP
// ---------------------------------------------------------------------------

const snapshot = parseSnapshot(readFileSync(join(root, 'trust/eu-trust-snapshot.json'), 'utf8'));
const MAX = 200_000;
let server: ReturnType<typeof startServer>;
let small: ReturnType<typeof startServer>;
let bare: ReturnType<typeof startServer>;
let base = '';
let smallBase = '';
let bareBase = '';

beforeAll(() => {
  server = startServer({ port: 0, cors: true, trustSnapshot: snapshot, limits: { maxFileBytes: MAX } });
  small = startServer({ port: 0, limits: { maxFileBytes: 1000 } });
  // No snapshot, and validator bundles that cannot be read.
  bare = startServer({
    port: 0,
    validation: {
      bundles: {
        read: async () => {
          throw new Error('no bundles on this server');
        },
      } as never,
    },
  });
  base = `http://127.0.0.1:${server.port}`;
  smallBase = `http://127.0.0.1:${small.port}`;
  bareBase = `http://127.0.0.1:${bare.port}`;
});
afterAll(async () => {
  await Promise.all([server.stop(true), small.stop(true), bare.stop(true)]);
});

const fixtures = readdirSync(fixturePath('')).flatMap((f) =>
  f === 'real'
    ? readdirSync(fixturePath('real')).map((r) => `real/${r}`)
    : f === 'README.md' || f === 'expected.json' || f.startsWith('.')
      ? []
      : [f],
);
const mime = (name: string) =>
  name.endsWith('.xml') || name.endsWith('.xsig') || name.endsWith('.isdoc')
    ? 'application/xml'
    : name.endsWith('.pdf')
      ? 'application/pdf'
      : name.endsWith('.zip') || name.endsWith('.isdocx')
        ? 'application/zip'
        : name.endsWith('.p7m')
          ? 'application/pkcs7-mime'
          : 'application/octet-stream';

const post = (url: string, body: BodyInit, type?: string) =>
  fetch(url, { method: 'POST', body, headers: type ? { 'Content-Type': type } : {} });
const upload = (url: string, bytes: Uint8Array, name: string) => {
  const form = new FormData();
  form.append('file', new File([bytes as Uint8Array<ArrayBuffer>], name.split('/').pop()!));
  return fetch(url, { method: 'POST', body: form });
};

describe('every fixture through every endpoint', () => {
  for (const name of fixtures) {
    test(name, async () => {
      const bytes = fixture(name);
      const file = name.split('/').pop()!;
      // convert: raw body, then every opt-in flag, then multipart.
      for (const query of ['', `?relations=true&provenance=true&filename=${encodeURIComponent(file)}`]) {
        const res = await post(`${base}/v1/convert${query}`, bytes, mime(name));
        expect([200, 400, 413, 422, 500]).toContain(res.status);
        await conforms(res, 'POST', '/v1/convert');
      }
      await conforms(await upload(`${base}/v1/convert`, bytes, name), 'POST', '/v1/convert');
      // inspect: raw and multipart.
      await conforms(await post(`${base}/v1/inspect`, bytes, mime(name)), 'POST', '/v1/inspect');
      await conforms(await upload(`${base}/v1/inspect`, bytes, name), 'POST', '/v1/inspect');
      // detect takes raw XML only.
      if (mime(name) === 'application/xml') await conforms(await post(`${base}/v1/detect`, bytes, 'application/xml'), 'POST', '/v1/detect');
    });
  }

  test('validation and trusted-list checks on a sample of files', async () => {
    for (const name of ['peppol-bis3-invoice.xml', 'xrechnung-cii.xml', 'xrechnung-ubl.xml', 'facturx-en16931.pdf']) {
      const res = await post(`${base}/v1/convert?validate=true`, fixture(name), mime(name));
      expect(res.status, name).toBe(200);
      const body = await conforms(res, 'POST', '/v1/convert');
      expect(body.outcomes[0].invoices[0].source.validation.schema, name).toBe('passed');
    }
    for (const name of ['IT01234567890_FPR12.xml.p7m', 'facturae-322-signed.xsig', 'peppol-bis3-invoice.xml']) {
      const res = await post(`${base}/v1/convert?euTrust=true`, fixture(name), mime(name));
      await conforms(res, 'POST', '/v1/convert');
    }
  });
});

describe('endpoints', () => {
  test('detect names the format', async () => {
    const body = await conforms(
      await post(`${base}/v1/detect`, fixture('peppol-bis3-invoice.xml'), 'application/xml'),
      'POST',
      '/v1/detect',
    );
    expect(body.kind).toBe('invoice');
    expect(body.format.id).toBe('peppol-bis3');
  });

  test('formats lists the registry; schemas serve the generated files; health reports the versions', async () => {
    const formats = await conforms(await fetch(`${base}/v1/formats`), 'GET', '/v1/formats');
    expect(formats.formats.length).toBe(describeFormats().length);
    for (const name of ['canonical-invoice', 'convert-result', 'inspect-result']) {
      const res = await fetch(`${base}/v1/schemas/${name}`);
      expect(res.headers.get('content-type')).toBe('application/schema+json');
      const served = await conforms(res, 'GET', `/v1/schemas/${name}`);
      expect(served).toEqual(schemaDocs.get(`${name}.${schemaVersion}.schema.json`));
      expect(() => ajv.compile({ ...served, $id: `${served.$id}#copy` })).not.toThrow();
    }
    const health = await conforms(await fetch(`${base}/health`), 'GET', '/health');
    expect(health).toMatchObject({ status: 'ok', schemaVersion });
    expect(await conforms(await fetch(`${base}/v1/schemas/nope`), 'GET', '/v1/schemas/nope')).toMatchObject({ status: 404 });
  });

  test('unknown routes and wrong methods are problems, not crashes', async () => {
    const missing = await fetch(`${base}/v2/convert`);
    expect(missing.status).toBe(404);
    expect(missing.headers.get('content-type')).toBe('application/problem+json');
    const wrong = await fetch(`${base}/v1/convert`);
    expect(wrong.status).toBe(405);
    expect(wrong.headers.get('allow')).toBe('POST');
    expect((await fetch(`${base}/health`, { method: 'POST' })).status).toBe(405);
    expect((await fetch(`${base}/v1/schemas/convert-result`, { method: 'POST' })).status).toBe(405);
  });
});

describe('errors are RFC 9457 problems in the CLI categories', () => {
  const unsafe = problemType('unsafe-or-malformed');
  const convertBody = async (res: Response) => conforms(res, 'POST', '/v1/convert');

  test('not XML: 400 unsafe-or-malformed (exit 2)', async () => {
    const body = await convertBody(await post(`${base}/v1/convert`, utf8('this is not an invoice'), 'text/plain'));
    expect(body).toMatchObject({ type: unsafe, status: 400, exitCode: 2 });
    expect(body.result.skipped.length).toBeGreaterThan(0);
  });

  test('a DOCTYPE is refused on every endpoint', async () => {
    const xml = utf8('<?xml version="1.0"?><!DOCTYPE a [<!ENTITY x "y">]><a>&x;</a>');
    expect(await convertBody(await post(`${base}/v1/convert`, xml, 'application/xml'))).toMatchObject({ type: unsafe, status: 400 });
    expect(await conforms(await post(`${base}/v1/inspect`, xml, 'application/xml'), 'POST', '/v1/inspect')).toMatchObject({ type: unsafe });
    expect(await conforms(await post(`${base}/v1/detect`, xml, 'application/xml'), 'POST', '/v1/detect')).toMatchObject({ type: unsafe });
  });

  test('detect of something that is not XML is 400', async () => {
    const body = await conforms(await post(`${base}/v1/detect`, utf8('nope'), 'application/xml'), 'POST', '/v1/detect');
    expect(body).toMatchObject({ type: unsafe, status: 400 });
  });

  test('empty bodies, missing file parts and bad query values are 400', async () => {
    expect(await convertBody(await post(`${base}/v1/convert`, new Uint8Array(), 'application/xml'))).toMatchObject({ type: unsafe });
    const form = new FormData();
    form.append('other', 'x');
    expect(await convertBody(await fetch(`${base}/v1/convert`, { method: 'POST', body: form }))).toMatchObject({
      type: unsafe,
      status: 400,
    });
    const flag = await convertBody(await post(`${base}/v1/convert?validate=maybe`, fixture('peppol-bis3-invoice.xml'), 'application/xml'));
    expect(flag).toMatchObject({ type: 'about:blank', status: 400 });
  });

  test('over the upload cap: 413, for raw bodies and multipart, before anything is parsed', async () => {
    const big = new Uint8Array(1500).fill(32);
    for (const res of [
      await post(`${smallBase}/v1/convert`, big, 'application/xml'),
      await upload(`${smallBase}/v1/convert`, big, 'big.xml'),
    ]) {
      expect(res.status).toBe(413);
      expect(await conforms(res, 'POST', '/v1/convert')).toMatchObject({ type: unsafe, status: 413, exitCode: 2 });
    }
    expect((await post(`${smallBase}/v1/inspect`, big, 'application/xml')).status).toBe(413);
    expect((await post(`${smallBase}/v1/detect`, big, 'application/xml')).status).toBe(413);
    // A body without Content-Length is counted as it streams.
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(400).fill(32));
      },
    });
    const chunked = await fetch(`${smallBase}/v1/convert`, {
      method: 'POST',
      body: stream,
      headers: { 'Content-Type': 'application/xml' },
      duplex: 'half',
    } as RequestInit);
    expect(chunked.status).toBe(413);
  });

  test('a limit hit while unpacking is 413 too', async () => {
    const entries: Record<string, Uint8Array> = {};
    for (let i = 0; i < 5; i++) entries[`e${i}.xml`] = utf8('<a/>');
    const zip = zipSync(entries);
    const limited = startServer({ port: 0, limits: { maxEntries: 2 } });
    try {
      const res = await post(`http://127.0.0.1:${limited.port}/v1/convert`, zip, 'application/zip');
      expect(res.status).toBe(413);
      await conforms(res, 'POST', '/v1/convert');
    } finally {
      await limited.stop(true);
    }
  });

  test('well-formed XML that is not an invoice: 422 unsupported (exit 3) with the result', async () => {
    const body = await convertBody(await post(`${base}/v1/convert`, utf8('<root xmlns="urn:example"/>'), 'application/xml'));
    expect(body).toMatchObject({ type: problemType('unsupported'), status: 422, exitCode: 3 });
    expect(body.result.outcomes).toHaveLength(1);
  });

  test('some documents converted and some not: 422 partial (exit 5)', async () => {
    const zip = zipSync({ 'a.xml': fixture('peppol-bis3-invoice.xml'), 'b.xml': utf8('<root xmlns="urn:example"/>') });
    const body = await convertBody(await post(`${base}/v1/convert`, zip, 'application/zip'));
    expect(body).toMatchObject({ type: problemType('partial'), status: 422, exitCode: 5 });
    expect(body.result.outcomes.map((o: any) => o.status).sort()).toEqual(['ok', 'unsupported']);
  });

  test('requested validation that fails: 422 validation-failed (exit 4) with the result', async () => {
    const xml = new TextDecoder()
      .decode(fixture('peppol-bis3-invoice.xml'))
      .replace(/(<cbc:PayableAmount[^>]*>)[^<]+/, (_m, open: string) => `${open}9999.00`);
    const body = await convertBody(await post(`${base}/v1/convert?validate=true`, utf8(xml), 'application/xml'));
    expect(body).toMatchObject({ type: problemType('validation-failed'), status: 422, exitCode: 4 });
    expect(body.result.outcomes[0].invoices[0].source.validation.semantic).toBe('failed');
  });

  test('validators or trust snapshot missing: 503 validator-unavailable (exit 6)', async () => {
    const bytes = fixture('peppol-bis3-invoice.xml');
    const noSnapshot = await convertBody(await post(`${bareBase}/v1/convert?euTrust=true`, bytes, 'application/xml'));
    expect(noSnapshot).toMatchObject({ type: problemType('validator-unavailable'), status: 503, exitCode: 6 });
    const noBundles = await convertBody(await post(`${bareBase}/v1/convert?validate=true`, bytes, 'application/xml'));
    expect(noBundles).toMatchObject({ type: problemType('validator-unavailable'), status: 503, exitCode: 6 });
    expect(noBundles.result.outcomes[0].invoices[0].source.validation.schema).toBe('unavailable');
  });

  test('every documented problem type was produced by a test', () => {
    const seen = [...checked].filter((c) => c.startsWith('POST /v1/convert'));
    for (const status of [200, 400, 413, 422, 503]) expect(seen).toContain(`POST /v1/convert ${status}`);
  });
});

describe('CORS and statelessness', () => {
  test('off by default: no CORS headers, preflight is a 405', async () => {
    const res = await fetch(`${smallBase}/health`);
    expect(res.headers.has('access-control-allow-origin')).toBe(false);
    expect((await fetch(`${smallBase}/v1/convert`, { method: 'OPTIONS' })).status).toBe(405);
  });

  test('opt-in: any origin, or one named origin, with preflight', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const pre = await fetch(`${base}/v1/convert`, { method: 'OPTIONS' });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-methods')).toContain('POST');
    const one = startServer({ port: 0, cors: 'https://app.example' });
    try {
      const r = await fetch(`http://127.0.0.1:${one.port}/health`);
      expect(r.headers.get('access-control-allow-origin')).toBe('https://app.example');
      expect(r.headers.get('vary')).toBe('Origin');
    } finally {
      await one.stop(true);
    }
  });

  test('requests do not influence each other', async () => {
    const bytes = fixture('peppol-bis3-invoice.xml');
    const a = await (await post(`${base}/v1/convert`, bytes, 'application/xml')).text();
    await post(`${base}/v1/convert?provenance=true`, bytes, 'application/xml');
    const b = await (await post(`${base}/v1/convert`, bytes, 'application/xml')).text();
    expect(b).toBe(a);
  });
});

describe('einvoice serve', () => {
  test('starts, answers and stops on the signal', async () => {
    const ac = new AbortController();
    let out = '';
    const run = main(
      ['serve', '--port', '0', '--host', '127.0.0.1', '--cors', '--limits', '{"maxFileBytes":5000}'],
      {
        stdout: (t) => {
          out += t;
        },
        stderr: () => {},
        readStdin: async () => new Uint8Array(),
      },
      { signal: ac.signal },
    );
    for (let i = 0; i < 100 && !out; i++) await Bun.sleep(20);
    const url = /listening on (\S+)/.exec(out)?.[1];
    expect(url).toBeDefined();
    const res = await fetch(`${url}/health`);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect((await post(`${url}/v1/inspect`, new Uint8Array(6000), 'application/xml')).status).toBe(413);
    ac.abort();
    expect(await run).toBe(0);
  });

  test('rejects a bad port and an unreadable trusted-list snapshot', async () => {
    const io = { stdout: () => {}, stderr: () => {}, readStdin: async () => new Uint8Array() };
    expect(await main(['serve', '--port', '99999'], io)).toBe(1);
    expect(await main(['serve', '--port', '0', '--eu-trust', '/nonexistent/snapshot.json'], io)).toBe(1);
  });

  test('--eu-trust loads the snapshot for ?euTrust=true', async () => {
    const ac = new AbortController();
    let out = '';
    const io = {
      stdout: (t: string) => {
        out += t;
      },
      stderr: () => {},
      readStdin: async () => new Uint8Array(),
    };
    const run = main(['serve', '--port', '0', `--eu-trust=${join(root, 'trust/eu-trust-snapshot.json')}`], io, { signal: ac.signal });
    for (let i = 0; i < 100 && !out; i++) await Bun.sleep(20);
    const url = /listening on (\S+)/.exec(out)![1];
    const res = await post(`${url}/v1/convert?euTrust=true`, fixture('peppol-bis3-invoice.xml'), 'application/xml');
    expect(res.status).toBe(200);
    ac.abort();
    expect(await run).toBe(0);
  });
});
