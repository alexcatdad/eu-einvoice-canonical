/**
 * Reference server for the conversion API described in openapi/openapi.yaml. Bun.serve and nothing else:
 * the handlers call the same `convert()`, `inspect()` and `detectXml()` as the library and the command line.
 *
 * Stateless: no sessions, no cache, no disk writes. Uploads are read through a counting reader, so a body larger than
 * `maxFileBytes` is refused (413) before it is held in memory. CORS is off unless asked for.
 */
import pkg from '../package.json' with { type: 'json' };
import canonicalInvoiceSchema from '../schemas/canonical-invoice.v1.schema.json' with { type: 'json' };
import convertResultSchema from '../schemas/convert-result.v1.schema.json' with { type: 'json' };
import inspectResultSchema from '../schemas/inspect-result.v1.schema.json' with { type: 'json' };
import {
  type ConvertOptions,
  type ConvertResult,
  convert,
  DEFAULT_LIMITS,
  decodeXml,
  describeFormats,
  detectXml,
  inspect,
  schemaVersion,
  type TrustSnapshot,
  type UnwrapLimits,
  type ValidateOptions,
} from './index.js';
import { PROBLEMS, type ProblemSlug, problemType } from './problems.js';

export interface ServerOptions {
  port?: number;
  hostname?: string;
  /** Off by default. `true` allows any origin; a string allows that one origin. Answers preflight requests when on. */
  cors?: boolean | string;
  /** Overrides for the unwrap limits; `maxFileBytes` also caps the upload. */
  limits?: Partial<UnwrapLimits>;
  /** Trusted-list snapshot for `?euTrust=true`. Without one that parameter answers 503. */
  trustSnapshot?: TrustSnapshot | null;
  /** Where the validator bundles are read from. */
  validation?: ValidateOptions;
  /** Clock for the trusted-list checks. */
  now?: Date;
}

export type Handler = (req: Request) => Promise<Response>;

const SCHEMAS: Record<string, unknown> = {
  'canonical-invoice': canonicalInvoiceSchema,
  'convert-result': convertResultSchema,
  'inspect-result': inspectResultSchema,
};

/** Overhead allowed on top of `maxFileBytes` for the multipart framing around the file part. */
const MULTIPART_SLACK = 64 * 1024;
const BENIGN_SKIP = /^Detached XML signature/;
const LIMIT_SKIP = /limit|larger than|too many|more than \d+/i;

class BodyTooLarge extends Error {}
class BadRequest extends Error {}

const STATUS_FOR: Record<ProblemSlug, number> = {
  'unsafe-or-malformed': 400,
  unsupported: 422,
  'validation-failed': 422,
  partial: 422,
  'validator-unavailable': 503,
  internal: 500,
};

/** Builds the handler. Exported separately so tests and other runtimes can call it without opening a socket. */
export function createHandler(opts: ServerOptions = {}): Handler {
  const limits: UnwrapLimits = { ...DEFAULT_LIMITS, ...opts.limits };
  const corsOrigin = opts.cors === true ? '*' : opts.cors || null;

  const headers = (type: string, cache = 'no-store'): Headers => {
    const h = new Headers({ 'Content-Type': type, 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' });
    if (corsOrigin) {
      h.set('Access-Control-Allow-Origin', corsOrigin);
      if (corsOrigin !== '*') h.set('Vary', 'Origin');
    }
    return h;
  };
  const json = (body: unknown, status = 200, type = 'application/json', cache?: string) =>
    new Response(JSON.stringify(body), { status, headers: headers(type, cache) });

  const problem = (slug: ProblemSlug, detail: string, extra: { status?: number; result?: ConvertResult } = {}) => {
    const p = PROBLEMS[slug];
    const status = extra.status ?? STATUS_FOR[slug];
    const body = {
      type: problemType(slug),
      title: status === 413 ? 'Limit exceeded' : p.title,
      status,
      detail,
      exitCode: p.exitCode,
      ...(extra.result ? { result: extra.result } : {}),
    };
    return json(body, status, 'application/problem+json');
  };
  const generic = (status: number, title: string, detail: string, extra: HeadersInit = {}) => {
    const res = json({ type: 'about:blank', title, status, detail }, status, 'application/problem+json');
    for (const [k, v] of new Headers(extra)) res.headers.set(k, v);
    return res;
  };
  const tooLarge = (what: string) =>
    problem('unsafe-or-malformed', `${what} exceeds the limit of ${limits.maxFileBytes} bytes`, { status: 413 });

  /** The request body, refused as soon as it passes `cap` bytes. */
  async function readCapped(req: Request, cap: number): Promise<Uint8Array<ArrayBuffer>> {
    const declared = Number(req.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > cap) throw new BodyTooLarge();
    if (!req.body) return new Uint8Array();
    const reader = req.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > cap) {
        await reader.cancel().catch(() => {});
        throw new BodyTooLarge();
      }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  }

  /** The uploaded file and the name it had: a multipart `file` part, or the raw body. */
  async function readUpload(req: Request, url: URL): Promise<{ bytes: Uint8Array; filename?: string }> {
    const type = req.headers.get('content-type') ?? '';
    const named = url.searchParams.get('filename') || req.headers.get('x-filename') || undefined;
    if (/^multipart\/form-data/i.test(type)) {
      const raw = await readCapped(req, limits.maxFileBytes + MULTIPART_SLACK);
      let form: FormData;
      try {
        form = await new Response(raw, { headers: { 'Content-Type': type } }).formData();
      } catch {
        throw new BadRequest('The multipart body could not be read');
      }
      const file = form.get('file');
      if (!file || typeof file === 'string') throw new BadRequest('The multipart body needs a file part named "file"');
      if (file.size > limits.maxFileBytes) throw new BodyTooLarge();
      return { bytes: new Uint8Array(await file.arrayBuffer()), filename: named ?? (file.name || undefined) };
    }
    return { bytes: await readCapped(req, limits.maxFileBytes), filename: named };
  }

  const flag = (url: URL, name: string): boolean => {
    const v = url.searchParams.get(name);
    if (v === null) return false;
    if (v === '' || v === 'true' || v === '1') return true;
    if (v === 'false' || v === '0') return false;
    throw new BadRequest(`Query parameter ${name} must be true or false`);
  };

  /** What a file's skipped entries say: a limit (413) or anything else that is a problem (400). Detached signatures are expected. */
  const skippedProblem = (skipped: { name?: string; reason: string }[], result?: ConvertResult) => {
    const bad = skipped.filter((s) => !BENIGN_SKIP.test(s.reason));
    const first = bad[0];
    if (!first) return null;
    const label = first.name ? `${first.name}: ${first.reason}` : first.reason;
    return LIMIT_SKIP.test(first.reason)
      ? problem('unsafe-or-malformed', label, { status: 413, result })
      : problem('unsafe-or-malformed', label, { result });
  };

  async function convertRoute(req: Request, url: URL): Promise<Response> {
    const validate = flag(url, 'validate');
    const options: ConvertOptions = { relations: flag(url, 'relations'), provenance: flag(url, 'provenance'), validate };
    if (flag(url, 'euTrust')) {
      if (!opts.trustSnapshot)
        return problem('validator-unavailable', 'This server has no EU trusted-list snapshot; start it with --eu-trust');
      options.euTrust = opts.trustSnapshot;
      options.now = opts.now;
    }
    if (validate) options.validation = opts.validation;
    const { bytes, filename } = await readUpload(req, url);
    if (bytes.length === 0) return problem('unsafe-or-malformed', 'The request body is empty');
    const result = await convert(bytes, filename, opts.limits, options);
    const failure = classify(result, validate);
    return failure ? problem(failure.slug, failure.detail, { status: failure.status, result }) : json(result);
  }

  async function inspectRoute(req: Request, url: URL): Promise<Response> {
    const { bytes, filename } = await readUpload(req, url);
    if (bytes.length === 0) return problem('unsafe-or-malformed', 'The request body is empty');
    const result = await inspect(bytes, filename, opts.limits);
    if (result.documents.length === 0) {
      const p = skippedProblem(result.skipped);
      if (p) return p;
    }
    return json(result);
  }

  async function detectRoute(req: Request): Promise<Response> {
    const bytes = await readCapped(req, limits.maxFileBytes);
    if (bytes.length === 0) return problem('unsafe-or-malformed', 'The request body is empty');
    const xml = decodeXml(bytes).text;
    if (/<!DOCTYPE/i.test(xml))
      return problem('unsafe-or-malformed', 'DOCTYPE not allowed in inbound XML (entity expansion / external DTD risk)');
    const detection = detectXml(xml);
    if (detection.kind === 'unknown' && detection.probe === null) return problem('unsafe-or-malformed', detection.reason);
    return json(detection);
  }

  return async (req) => {
    const url = new URL(req.url);
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
    try {
      if (req.method === 'OPTIONS' && corsOrigin) {
        const h = headers('text/plain');
        h.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        h.set('Access-Control-Allow-Headers', 'Content-Type, X-Filename');
        h.set('Access-Control-Max-Age', '600');
        return new Response(null, { status: 204, headers: h });
      }
      const post = { '/v1/convert': convertRoute, '/v1/inspect': inspectRoute, '/v1/detect': detectRoute } as Record<
        string,
        (req: Request, url: URL) => Promise<Response>
      >;
      const get: Record<string, () => Response> = {
        '/health': () => json({ status: 'ok', version: pkg.version, schemaVersion }),
        '/v1/formats': () => json({ formats: describeFormats() }, 200, 'application/json', 'public, max-age=300'),
      };
      if (path in post || path in get) {
        const allowed = path in post ? 'POST' : 'GET';
        if (req.method !== allowed) return generic(405, 'Method not allowed', `Use ${allowed} for ${path}`, { Allow: allowed });
        return path in post ? await post[path]!(req, url) : get[path]!();
      }
      const schema = /^\/v1\/schemas\/([^/]+)$/.exec(path);
      if (schema) {
        if (req.method !== 'GET') return generic(405, 'Method not allowed', `Use GET for ${path}`, { Allow: 'GET' });
        const name = decodeURIComponent(schema[1]!);
        return Object.hasOwn(SCHEMAS, name)
          ? json(SCHEMAS[name], 200, 'application/schema+json', 'public, max-age=300')
          : generic(404, 'Not found', `No schema named "${name}" (known: ${Object.keys(SCHEMAS).join(', ')})`);
      }
      return generic(404, 'Not found', `No such route: ${path}`);
    } catch (e) {
      if (e instanceof BodyTooLarge) return tooLarge('The upload');
      if (e instanceof BadRequest)
        return e.message.startsWith('Query') ? generic(400, 'Bad request', e.message) : problem('unsafe-or-malformed', e.message);
      console.error('einvoice serve: internal error', e);
      return problem('internal', 'An internal error occurred');
    }
  };
}

type Failure = { slug: ProblemSlug; status: number; detail: string };

/** With nothing converted, the answer is the most serious failure: a limit, then a bug, then unsafe input, then validation, then unsupported. */
const severity = (f: Failure) =>
  f.status === 413 ? 5 : f.slug === 'internal' ? 4 : f.slug === 'unsafe-or-malformed' ? 3 : f.slug === 'validation-failed' ? 2 : 1;

const LAYERS = ['schema', 'semantic', 'profile'] as const;

/** Maps a conversion result to the CLI's exit-code categories. `null` means every document converted. */
function classify(result: ConvertResult, validate: boolean): Failure | null {
  const failures: Failure[] = [];
  let good = 0;
  let incomplete = false;
  for (const o of result.outcomes) {
    if (o.status === 'ok') {
      const summaries = o.invoices.map((i) => i.source.validation);
      const failed = summaries.some((v) => v && LAYERS.some((l) => v[l] === 'failed'));
      incomplete ||= summaries.some((v) => v?.completeness !== 'complete');
      if (failed)
        failures.push({
          slug: 'validation-failed',
          status: 422,
          detail: 'The requested validation reported failures; see source.validation',
        });
      else good++;
    } else if (o.status === 'not-an-invoice') {
      failures.push({
        slug: 'unsupported',
        status: 422,
        detail: `Not an invoice (${o.detection.kind === 'other-document' ? o.detection.label : 'unknown'})`,
      });
    } else if (o.status === 'unsupported') {
      failures.push({ slug: 'unsupported', status: 422, detail: o.reason });
    } else if (o.error.startsWith('Internal error')) {
      failures.push({ slug: 'internal', status: 500, detail: 'An internal error occurred while converting a document' });
    } else {
      failures.push({ slug: 'unsafe-or-malformed', status: 400, detail: o.error });
    }
  }
  for (const s of result.skipped) {
    if (BENIGN_SKIP.test(s.reason)) continue;
    const detail = s.name ? `${s.name}: ${s.reason}` : s.reason;
    failures.push({ slug: 'unsafe-or-malformed', status: LIMIT_SKIP.test(s.reason) ? 413 : 400, detail });
  }
  if (failures.length > 0) {
    if (good > 0)
      return {
        slug: 'partial',
        status: 422,
        detail: `${failures.length} of ${failures.length + good} documents did not convert: ${failures[0]!.detail}`,
      };
    return failures.sort((a, b) => severity(b) - severity(a))[0]!;
  }
  if (good === 0) return { slug: 'unsupported', status: 422, detail: 'The file contains no XML document to convert' };
  if (validate && incomplete)
    return {
      slug: 'validator-unavailable',
      status: 503,
      detail: 'The requested source validation is incomplete; see source.validation',
    };
  return null;
}

/** Starts the server. `port: 0` picks a free port (read it from `server.port`). */
export function startServer(opts: ServerOptions = {}): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    port: opts.port ?? 8080,
    hostname: opts.hostname ?? '127.0.0.1',
    // Bun's own ceiling is set to its maximum so every oversized body reaches the handler's counting reader and gets the
    // problem+json 413; the reader stops at maxFileBytes, so nothing larger is ever held in memory.
    maxRequestBodySize: 2 ** 32 - 1,
    fetch: createHandler(opts),
  });
}
