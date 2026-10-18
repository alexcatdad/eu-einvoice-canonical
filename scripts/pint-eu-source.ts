/** Compose the two pinned EU profile obligations without rewriting their predicates or messages. */
import { createHash } from 'node:crypto';
import { DOMParser, type Element, XMLSerializer } from '@xmldom/xmldom';

const SCH = 'http://purl.oclc.org/dsdl/schematron';
const XMLNS = 'http://www.w3.org/2000/xmlns/';
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function parsed(bytes: Uint8Array, expected: string): Element {
  if (sha(bytes) !== expected) throw new Error('Unqualified PINT EU Schematron source');
  let invalid = false;
  const doc = new DOMParser({
    onError: () => {
      invalid = true;
    },
  }).parseFromString(new TextDecoder().decode(bytes), 'text/xml');
  const root = doc.documentElement;
  if (invalid || !root || root.namespaceURI !== SCH || root.localName !== 'schema' || root.getAttribute('queryBinding') !== 'xslt2')
    throw new Error('Unexpected PINT EU schema');
  if (root.getElementsByTagNameNS(SCH, 'include').length || root.getElementsByTagNameNS(SCH, 'extends').length)
    throw new Error('Unresolved PINT EU source include');
  return root;
}
export function combinePintEuSchematrons(en: Uint8Array, jurisdiction: Uint8Array): Uint8Array {
  const root = parsed(en, 'cd99ec697db2a7772fd988f90b78e1bf0ac88a1e2b13d87906a0050b46b6daa9');
  const document = root.ownerDocument;
  if (!document) throw new Error('Missing PINT EU source document');
  const other = parsed(jurisdiction, '583e672c9abf21b36c106e45d6d67d8f2edae0e1eca3ab94eae32b0f9da6a3b2');
  const ids = new Set<string>();
  const lets = new Set<string>();
  const namespaces = new Map<string, string>();
  for (const source of [root, other]) {
    for (const element of Array.from(source.getElementsByTagName('*'))) {
      const id = element.getAttribute('id');
      if (id && ids.has(id)) throw new Error(`Duplicate PINT EU ID: ${id}`);
      if (id) ids.add(id);
    }
    for (const child of Array.from(source.childNodes)) {
      if (child.nodeType !== 1) continue;
      const element = child as Element;
      if (element.namespaceURI === SCH && element.localName === 'let') {
        const name = element.getAttribute('name')!;
        if (lets.has(name)) throw new Error(`Duplicate PINT EU variable: ${name}`);
        lets.add(name);
      }
      if (element.namespaceURI === SCH && element.localName === 'ns') {
        const prefix = element.getAttribute('prefix')!;
        const uri = element.getAttribute('uri')!;
        if (namespaces.has(prefix) && namespaces.get(prefix) !== uri) throw new Error(`Conflicting PINT EU namespace: ${prefix}`);
        namespaces.set(prefix, uri);
      }
    }
  }
  for (const attribute of Array.from(other.attributes)) {
    if (attribute.namespaceURI !== XMLNS) continue;
    const existing = root.getAttribute(attribute.name);
    if (existing && existing !== attribute.value) throw new Error('Conflicting PINT EU root namespace');
    root.setAttributeNS(XMLNS, attribute.name, attribute.value);
  }
  const present = new Set(Array.from(root.getElementsByTagNameNS(SCH, 'ns')).map((node) => node.getAttribute('prefix')));
  for (const child of Array.from(other.childNodes)) {
    if (child.nodeType !== 1) continue;
    const element = child as Element;
    if (element.namespaceURI === SCH && element.localName === 'title') continue;
    if (element.namespaceURI === SCH && element.localName === 'ns' && present.has(element.getAttribute('prefix'))) continue;
    root.appendChild(document.importNode(element, true));
  }
  if (root.getElementsByTagNameNS(SCH, 'assert').length !== 1138 || root.getElementsByTagNameNS(SCH, 'report').length)
    throw new Error('Unexpected PINT EU assertion inventory');
  return new TextEncoder().encode(new XMLSerializer().serializeToString(document));
}
