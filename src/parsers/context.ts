/**
 * Shared machinery for the parsers: namespace-aware path lookups on an xmldom tree,
 * value readers that record warnings and derivations, and the `source` block.
 *
 * Paths are '/'-separated steps of `prefix:LocalName` (prefix from the reader's
 * namespace map) or `*:LocalName` / `LocalName` for any namespace. Only child steps
 * are supported; predicates are written in code with `filter`.
 */
import { DOMParser, type Element } from '@xmldom/xmldom';
import type { CanonicalInvoice, Decimal, Identifier, IsoDate, SourceMeta } from '../canonical.js';
import { toDecimal, toIsoDate, ValueError } from '../values.js';
import type { ParseInput } from './index.js';

export class ParseError extends Error {}

export function parseXml(xml: string): Element {
  const errors: string[] = [];
  const doc = new DOMParser({
    onError: (level, msg) => {
      if (level !== 'warning') errors.push(msg);
    },
  }).parseFromString(xml, 'text/xml');
  if (errors.length || !doc.documentElement) throw new ParseError(`XML not well-formed: ${errors[0] ?? 'no root element'}`);
  return doc.documentElement;
}

type Step = [ns: string | null, local: string];

const xpathCache = new WeakMap<Element, string>();

/**
 * Absolute XPath of an element, written with the qualified names found in the document
 * (`/Invoice/cac:LegalMonetaryTotal`). A positional predicate is added only where
 * siblings share the name (`cac:InvoiceLine[2]`).
 */
export function xpathOf(el: Element): string {
  const hit = xpathCache.get(el);
  if (hit) return hit;
  let step = el.nodeName;
  const parent = el.parentNode as Element | null;
  let path: string;
  if (parent && parent.nodeType === 1) {
    let count = 0;
    let index = 0;
    for (let s = parent.firstChild; s; s = s.nextSibling) {
      if (s.nodeType === 1 && s.nodeName === el.nodeName) {
        count++;
        if (s === el) index = count;
      }
    }
    if (count > 1) step += `[${index}]`;
    path = `${xpathOf(parent)}/${step}`;
  } else {
    path = `/${step}`;
  }
  xpathCache.set(el, path);
  return path;
}

export class Ctx {
  readonly warnings: SourceMeta['warnings'] = [];
  readonly derived: SourceMeta['derived'] = [];
  readonly unmapped: SourceMeta['unmapped'] = {};
  private readonly cache = new Map<string, Step[]>();
  /** Canonical JSON path -> source XPath; present only when provenance was asked for. */
  readonly provenance?: Record<string, string>;

  constructor(
    private readonly ns: Record<string, string>,
    provenance = false,
  ) {
    if (provenance) this.provenance = {};
  }

  /** Scope for binding reads to canonical paths: `c.in('/seller').text(el, 'cbc:Name', 'name')` records '/seller/name'. */
  in(prefix: string): Scope {
    return new Scope(this, prefix);
  }

  /** Records that the canonical value at `canonical` came from `el` (or from its attribute `attr`). */
  mark(canonical: string | undefined, el: Element | undefined, attr?: string) {
    if (canonical && el && this.provenance) this.provenance[canonical] = xpathOf(el) + (attr ? `/@${attr}` : '');
  }

  /** Same for a value assembled from several elements: the XPaths are joined with `|`. */
  markAll(canonical: string | undefined, els: Element[]) {
    if (canonical && els.length && this.provenance) this.provenance[canonical] = els.map(xpathOf).join(' | ');
  }

  /** Elements with non-empty text, so array indexes stay aligned with what ends up in the output. */
  nonEmpty(els: Element[]): Element[] {
    return els.filter((e) => this.text(e));
  }

  private steps(path: string): Step[] {
    let s = this.cache.get(path);
    if (!s) {
      s = path
        .split('/')
        .filter(Boolean)
        .map((step): Step => {
          const i = step.indexOf(':');
          if (i === -1) return [null, step];
          const prefix = step.slice(0, i);
          if (prefix === '*') return [null, step.slice(i + 1)];
          const uri = this.ns[prefix];
          if (uri === undefined) throw new Error(`Unknown prefix in path: ${path}`);
          return [uri, step.slice(i + 1)];
        });
      this.cache.set(path, s);
    }
    return s;
  }

  /** Every element at `path` below `node`. */
  all(node: Element | undefined, path: string): Element[] {
    if (!node) return [];
    let cur: Element[] = [node];
    for (const [uri, local] of this.steps(path)) {
      const next: Element[] = [];
      for (const n of cur) {
        for (let c = n.firstChild; c; c = c.nextSibling) {
          if (c.nodeType !== 1) continue;
          const el = c as Element;
          if (el.localName === local && (uri === null || el.namespaceURI === uri)) next.push(el);
        }
      }
      cur = next;
    }
    return cur;
  }

  el(node: Element | undefined, path: string): Element | undefined {
    return this.all(node, path)[0];
  }

  /** Trimmed text of the first element at `path`; undefined when absent or empty. */
  text(node: Element | undefined, path?: string, bind?: string): string | undefined {
    const el = path ? this.el(node, path) : node;
    const t = el?.textContent?.trim();
    if (!t) return undefined;
    this.mark(bind, el);
    return t;
  }

  texts(node: Element | undefined, path: string, bind?: string): string[] {
    const els = this.nonEmpty(this.all(node, path));
    this.markAll(bind, els);
    return els.map((e) => e.textContent!.trim());
  }

  attr(node: Element | undefined, path: string | undefined, name: string, bind?: string): string | undefined {
    const el = path ? this.el(node, path) : node;
    const v = el?.getAttribute(name)?.trim();
    if (!v) return undefined;
    this.mark(bind, el, name);
    return v;
  }

  /** Decimal at `path`. Throws ParseError on a malformed number: amounts that cannot be read make the invoice unusable. */
  dec(node: Element | undefined, path?: string, bind?: string): Decimal | undefined {
    const raw = this.text(node, path, bind);
    if (raw === undefined) return undefined;
    try {
      return toDecimal(raw);
    } catch (e) {
      if (e instanceof ValueError) throw new ParseError(`${describe(node, path)}: ${e.message}`);
      throw e;
    }
  }

  /** Date at `path`; date-times are truncated and the dropped time is recorded as a warning. */
  date(node: Element | undefined, path?: string, field?: string, bind?: string): IsoDate | undefined {
    const raw = this.text(node, path, bind);
    if (raw === undefined) return undefined;
    try {
      const { date, droppedTime } = toIsoDate(raw);
      if (droppedTime) this.warn('TIME_DROPPED', `${field ?? describe(node, path)}: time ${droppedTime} dropped from ${raw}`);
      return date;
    } catch (e) {
      if (e instanceof ValueError) throw new ParseError(`${describe(node, path)}: ${e.message}`);
      throw e;
    }
  }

  /** Identifier with its scheme attribute (schemeID by default). */
  id(node: Element | undefined, path?: string, schemeAttr = 'schemeID', bind?: string): Identifier | undefined {
    const el = path ? this.el(node, path) : node;
    const value = this.text(el, undefined, bind && `${bind}/value`);
    if (!value) return undefined;
    const schemeId = this.attr(el, undefined, schemeAttr, bind && `${bind}/schemeId`);
    return schemeId ? { value, schemeId } : { value };
  }

  warn(code: string, message: string, path?: string) {
    this.warnings.push(path ? { code, message, path } : { code, message });
  }

  derive(field: string, rule: string) {
    this.derived.push({ field, rule });
  }
}

/**
 * A canonical-path prefix to read under. Parsers write `s.text(node, 'cbc:Name', 'name')`
 * and, when provenance is on, the XPath of the node read is recorded for `<prefix>/name`.
 * Keys may be nested (`'address/city'`); array items are scopes of their own (`c.in('/lines/0')`).
 * With provenance off the reads behave exactly like the plain Ctx ones.
 */
export class Scope {
  constructor(
    readonly c: Ctx,
    readonly prefix: string,
  ) {}

  in(key: string | number): Scope {
    return new Scope(this.c, `${this.prefix}/${key}`);
  }
  /** Canonical path of `key` under this scope, for `c.mark`. */
  path(key: string): string {
    return `${this.prefix}/${key}`;
  }
  private b(key: string): string | undefined {
    return this.c.provenance ? `${this.prefix}/${key}` : undefined;
  }

  text(node: Element | undefined, path: string | undefined, key: string) {
    return this.c.text(node, path, this.b(key));
  }
  texts(node: Element | undefined, path: string, key: string) {
    return this.c.texts(node, path, this.b(key));
  }
  attr(node: Element | undefined, path: string | undefined, name: string, key: string) {
    return this.c.attr(node, path, name, this.b(key));
  }
  dec(node: Element | undefined, path: string | undefined, key: string) {
    return this.c.dec(node, path, this.b(key));
  }
  date(node: Element | undefined, path: string | undefined, field: string | undefined, key: string) {
    return this.c.date(node, path, field, this.b(key));
  }
  id(node: Element | undefined, path: string | undefined, key: string, schemeAttr = 'schemeID') {
    return this.c.id(node, path, schemeAttr, this.b(key));
  }
}

function describe(node: Element | undefined, path?: string) {
  return `${node?.localName ?? '?'}${path ? `/${path}` : ''}`;
}

/** Drops undefined values and empty objects, so the JSON output only carries what the source said. */
export function compact<T>(value: T): T {
  if (Array.isArray(value)) return value.map(compact) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      const c = compact(v);
      if (c && typeof c === 'object' && !Array.isArray(c) && Object.keys(c).length === 0 && !REQUIRED_OBJECTS.has(k)) continue;
      out[k] = c;
    }
    return out as T;
  }
  return value;
}
/** Objects the canonical type requires even when empty. */
const REQUIRED_OBJECTS = new Set(['seller', 'buyer', 'totals', 'extensions', 'source', 'unmapped', 'item']);

export function sourceMeta(input: ParseInput, root: Element, ctx: Ctx, extra: Partial<SourceMeta> = {}): SourceMeta {
  const { payload, format, details, fileSha256 } = input;
  return {
    format: format.id as SourceMeta['format'],
    formatVersion: details.version,
    syntaxDocumentType: root.localName ?? '',
    rootNamespace: root.namespaceURI ?? '',
    envelope: payload.envelope,
    fileSha256,
    payloadSha256: payload.sha256,
    encoding: payload.encoding,
    filename: payload.filename,
    signatures: payload.signatures,
    unmapped: ctx.unmapped,
    derived: ctx.derived,
    warnings: ctx.warnings,
    ...(ctx.provenance ? { provenance: ctx.provenance } : {}),
    ...extra,
  };
}

/** UNCL 1001 codes that mean a credit (used where one root carries both directions: CII, Svefaktura). */
export const CREDIT_TYPE_CODES = new Set(['381', '396', '261', '262', '81', '83', '532']);
/** UNCL 1001 self-billing codes. */
export const SELF_BILLED_TYPE_CODES = new Set(['389', '261', '527']);

export function finish(inv: CanonicalInvoice): CanonicalInvoice {
  const out = compact(inv);
  const prov = out.source.provenance;
  if (prov) {
    // Reads whose value was dropped on the way (filtered, emptied) must not leave entries behind.
    for (const path of Object.keys(prov)) if (!existsAt(out, path)) delete prov[path];
  }
  return out;
}

function existsAt(root: unknown, path: string): boolean {
  let cur = root;
  for (const key of path.split('/').slice(1)) {
    if (cur === null || typeof cur !== 'object' || !Object.hasOwn(cur, key)) return false;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur !== undefined && cur !== null && typeof cur !== 'object';
}
