/**
 * Records the elements a parser did not map into `source.unmapped`, keyed by XPath.
 * Called per container with the local names the parser consumed; everything else below
 * it is flattened to its leaf text. Attributes of unmapped elements are not recorded.
 */
import type { Element } from '@xmldom/xmldom';
import type { Ctx } from './context.js';

/** Hard cap on entries per document, so a hostile or huge file cannot bloat the output. */
const MAX_ENTRIES = 500;

function children(el: Element): Element[] {
  const out: Element[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) out.push(n as Element);
  return out;
}

export function recordUnmapped(c: Ctx, el: Element | undefined, handled: Iterable<string>, xpath: string): void {
  if (!el) return;
  const skip = new Set(handled);
  const kids = children(el);
  const seen = new Map<string, number>();
  const total = new Map<string, number>();
  for (const k of kids) total.set(k.localName ?? '', (total.get(k.localName ?? '') ?? 0) + 1);
  for (const k of kids) {
    const name = k.localName ?? '';
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    if (skip.has(name)) continue;
    flatten(c, k, `${xpath}/${name}${(total.get(name) ?? 1) > 1 ? `[${n}]` : ''}`);
  }
}

function flatten(c: Ctx, el: Element, path: string): void {
  if (Object.keys(c.unmapped).length >= MAX_ENTRIES) return;
  const kids = children(el);
  if (kids.length === 0) {
    const t = el.textContent?.trim();
    if (t) c.unmapped[path] = t;
    return;
  }
  recordUnmapped(c, el, [], path);
}
