/**
 * XML Canonicalization over @xmldom/xmldom nodes: inclusive C14N 1.0 and exclusive C14N 1.0,
 * with or without comments. Enough for XMLDSig/XAdES references on invoices; it does not
 * implement arbitrary XPath node-sets, only "this subtree, optionally minus one element".
 */
import type { Document as XDocument, Element as XElement, Node as XNode } from '@xmldom/xmldom';

export interface C14nOptions {
  exclusive: boolean;
  withComments: boolean;
  /** Exclusive only: prefixes (or '#default') to treat as visibly used (InclusiveNamespaces PrefixList). */
  inclusivePrefixes?: string[];
  /** An element left out of the output together with its subtree (enveloped-signature transform). */
  omit?: XElement;
}

const XML_NS = 'http://www.w3.org/XML/1998/namespace';

const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#xD;');
const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/\t/g, '&#x9;').replace(/\n/g, '&#xA;').replace(/\r/g, '&#xD;');

/** Canonical bytes of the whole document (comments only when asked) or of one element subtree. */
export function canonicalize(node: XNode, opts: C14nOptions): string {
  if (node.nodeType === 9) {
    const doc = node as XDocument;
    const parts: string[] = [];
    let seenRoot = false;
    for (let c: XNode | null = doc.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 1) { parts.push(renderElement(c as XElement, opts, new Map(), true)); seenRoot = true; }
      else if (c.nodeType === 7 && (c as any).target === 'xml') continue; // the XML declaration is not a PI
      else if (c.nodeType === 7) parts.push((seenRoot ? '\n' : '') + pi(c) + (seenRoot ? '' : '\n'));
      else if (c.nodeType === 8 && opts.withComments) parts.push((seenRoot ? '\n' : '') + comment(c) + (seenRoot ? '' : '\n'));
    }
    return parts.join('');
  }
  return renderElement(node as XElement, opts, new Map(), true);
}

/**
 * A comment node in canonical form. Built from parts on purpose: a literal HTML-comment opener in the
 * source makes Bun's coverage mis-map the lines of this file (JS treats it as a legacy HTML-like comment).
 */
const COMMENT_OPEN = '<' + '!--';
const COMMENT_CLOSE = '--' + '>';
const comment = (n: XNode) => COMMENT_OPEN + n.nodeValue + COMMENT_CLOSE;

const pi = (n: XNode) => `<?${(n as any).target}${(n as any).data ? ' ' + (n as any).data : ''}?>`;

/** In-scope namespace declarations (prefix '' = default) as seen on the element, ancestors included. */
function inScope(el: XElement): Map<string, string> {
  const chain: XElement[] = [];
  for (let n: XNode | null = el; n && n.nodeType === 1; n = n.parentNode) chain.push(n as XElement);
  const scope = new Map<string, string>();
  for (let i = chain.length - 1; i >= 0; i--) {
    const attrs = chain[i].attributes;
    for (let j = 0; j < attrs.length; j++) {
      const a = attrs.item(j)!;
      if (a.name === 'xmlns') scope.set('', a.value);
      else if (a.name.startsWith('xmlns:')) scope.set(a.name.slice(6), a.value);
    }
  }
  return scope;
}

function renderElement(el: XElement, opts: C14nOptions, rendered: Map<string, string>, apex: boolean): string {
  const scope = inScope(el);
  const attrs: { name: string; ns: string; local: string; value: string; prefix: string }[] = [];
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes.item(i)!;
    if (a.name === 'xmlns' || a.name.startsWith('xmlns:')) continue;
    attrs.push({ name: a.name, ns: a.namespaceURI ?? '', local: a.localName ?? a.name, value: a.value, prefix: a.prefix ?? '' });
  }
  // Inclusive C14N: xml:* attributes of omitted ancestors are inherited by the apex element of a subtree.
  if (apex && !opts.exclusive) {
    for (let p: XNode | null = el.parentNode; p && p.nodeType === 1; p = p.parentNode) {
      const pa = (p as XElement).attributes;
      for (let i = 0; i < pa.length; i++) {
        const a = pa.item(i)!;
        if (a.namespaceURI === XML_NS && !attrs.some((x) => x.ns === XML_NS && x.local === a.localName)) {
          attrs.push({ name: a.name, ns: XML_NS, local: a.localName ?? a.name, value: a.value, prefix: 'xml' });
        }
      }
    }
  }
  attrs.sort((a, b) => (a.ns === b.ns ? (a.local < b.local ? -1 : a.local > b.local ? 1 : 0) : a.ns < b.ns ? -1 : 1));

  // Which namespace declarations to emit.
  const wanted = new Set<string>();
  if (opts.exclusive) {
    wanted.add(el.prefix ?? '');
    for (const a of attrs) if (a.prefix && a.prefix !== 'xml') wanted.add(a.prefix);
    for (const p of opts.inclusivePrefixes ?? []) wanted.add(p === '#default' ? '' : p);
  } else {
    for (const p of scope.keys()) wanted.add(p);
  }
  const decls: [string, string][] = [];
  const next = new Map(rendered);
  for (const prefix of wanted) {
    if (prefix === 'xml') continue;
    const uri = scope.get(prefix);
    const prev = rendered.get(prefix);
    if (uri === undefined) continue;
    if (prefix === '' && uri === '' && prev === undefined) continue;
    if (prev === uri) continue;
    if (prefix !== '' && uri === '') continue;
    decls.push([prefix, uri]);
    next.set(prefix, uri);
  }
  decls.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  let out = `<${el.tagName}`;
  for (const [p, u] of decls) out += p === '' ? ` xmlns="${escAttr(u)}"` : ` xmlns:${p}="${escAttr(u)}"`;
  for (const a of attrs) out += ` ${a.name}="${escAttr(a.value)}"`;
  out += '>';
  for (let c: XNode | null = el.firstChild; c; c = c.nextSibling) {
    if (c === opts.omit) continue;
    switch (c.nodeType) {
      case 1: out += renderElement(c as XElement, opts, next, false); break;
      case 3: case 4: out += escText(c.nodeValue ?? ''); break;
      case 7: out += pi(c); break;
      case 8: if (opts.withComments) out += comment(c); break;
    }
  }
  return out + `</${el.tagName}>`;
}
