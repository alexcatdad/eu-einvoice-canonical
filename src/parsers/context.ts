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
import { ValueError, toDecimal, toIsoDate } from '../values.js';
import type { ParseInput } from './index.js';

export class ParseError extends Error {}

export function parseXml(xml: string): Element {
  const errors: string[] = [];
  const doc = new DOMParser({
    onError: (level, msg) => { if (level !== 'warning') errors.push(msg); },
  }).parseFromString(xml, 'text/xml');
  if (errors.length || !doc.documentElement) throw new ParseError(`XML not well-formed: ${errors[0] ?? 'no root element'}`);
  return doc.documentElement;
}

type Step = [ns: string | null, local: string];

export class Ctx {
  readonly warnings: SourceMeta['warnings'] = [];
  readonly derived: SourceMeta['derived'] = [];
  readonly unmapped: SourceMeta['unmapped'] = {};
  private readonly cache = new Map<string, Step[]>();

  constructor(private readonly ns: Record<string, string>) {}

  private steps(path: string): Step[] {
    let s = this.cache.get(path);
    if (!s) {
      s = path.split('/').filter(Boolean).map((step): Step => {
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
  text(node: Element | undefined, path?: string): string | undefined {
    const el = path ? this.el(node, path) : node;
    const t = el?.textContent?.trim();
    return t ? t : undefined;
  }

  texts(node: Element | undefined, path: string): string[] {
    return this.all(node, path).map((e) => e.textContent?.trim() ?? '').filter(Boolean);
  }

  attr(node: Element | undefined, path: string | undefined, name: string): string | undefined {
    const el = path ? this.el(node, path) : node;
    const v = el?.getAttribute(name)?.trim();
    return v ? v : undefined;
  }

  /** Decimal at `path`. Throws ParseError on a malformed number: amounts that cannot be read make the invoice unusable. */
  dec(node: Element | undefined, path?: string): Decimal | undefined {
    const raw = this.text(node, path);
    if (raw === undefined) return undefined;
    try { return toDecimal(raw); } catch (e) {
      if (e instanceof ValueError) throw new ParseError(`${describe(node, path)}: ${e.message}`);
      throw e;
    }
  }

  /** Date at `path`; date-times are truncated and the dropped time is recorded as a warning. */
  date(node: Element | undefined, path?: string, field?: string): IsoDate | undefined {
    const raw = this.text(node, path);
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
  id(node: Element | undefined, path?: string, schemeAttr = 'schemeID'): Identifier | undefined {
    const el = path ? this.el(node, path) : node;
    const value = this.text(el);
    if (!value) return undefined;
    const schemeId = this.attr(el, undefined, schemeAttr);
    return schemeId ? { value, schemeId } : { value };
  }

  warn(code: string, message: string, path?: string) {
    this.warnings.push(path ? { code, message, path } : { code, message });
  }

  derive(field: string, rule: string) {
    this.derived.push({ field, rule });
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
    ...extra,
  };
}

/** UNCL 1001 codes that mean a credit (used where one root carries both directions: CII, Svefaktura). */
export const CREDIT_TYPE_CODES = new Set(['381', '396', '261', '262', '81', '83', '532']);
/** UNCL 1001 self-billing codes. */
export const SELF_BILLED_TYPE_CODES = new Set(['389', '261', '527']);

export function finish(inv: CanonicalInvoice): CanonicalInvoice {
  return compact(inv);
}
