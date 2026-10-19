/** Narrow, deterministic expansion of the pinned Romanian CIUS-RO1.0.9 closure. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DOMParser, type Element, XMLSerializer } from '@xmldom/xmldom';

const SCH = 'http://purl.oclc.org/dsdl/schematron';
const fragments = [
  'abstract/EN16931-model.sch',
  'abstract/EN16931-syntax.sch',
  'UBL/EN16931-UBL-model.sch',
  'UBL/EN16931-UBL-syntax.sch',
  'codelist/EN16931-UBL-codes.sch',
  'cius-ro/RO16931-rules.sch',
];
function elements(root: Element, local: string): Element[] {
  return Array.from(root.getElementsByTagNameNS(SCH, local));
}
export function expandRoSchematron(entry: string): string {
  let source = readFileSync(entry, 'utf8').replace(/^\uFEFF/, '');
  for (const path of fragments) {
    const include = `<include href="${path}"/>`;
    if (source.split(include).length !== 2) throw new Error(`Unexpected RO include ${path}`);
    source = source.replace(include, () =>
      readFileSync(join(dirname(entry), path), 'utf8')
        .replace(/^\uFEFF/, '')
        .replace(/^\s*<\?xml[^?]*\?>/, ''),
    );
  }
  let invalid = false;
  const doc = new DOMParser({
    onError: () => {
      invalid = true;
    },
  }).parseFromString(source, 'text/xml');
  const root = doc.documentElement;
  if (invalid || !root || root.namespaceURI !== SCH || root.localName !== 'schema') throw new Error('Unexpected RO schema root');
  const patterns = elements(root, 'pattern');
  if (patterns.length !== 6 || elements(root, 'include').length || elements(root, 'extends').length)
    throw new Error('Unexpected RO pattern closure');
  for (const [name, parameterCount, assertionCount] of [
    ['syntax', 770, 751],
    ['model', 271, 203],
  ] as const) {
    const template = patterns.find((p) => p.getAttribute('id') === name && p.getAttribute('abstract') === 'true');
    const instance = patterns.find((p) => p.getAttribute('id') === `UBL-${name}` && p.getAttribute('is-a') === name);
    if (!template || !instance) throw new Error(`Missing RO ${name} pattern`);
    const parameters = elements(instance, 'param');
    if (
      parameters.length !== parameterCount ||
      elements(template, 'assert').length + elements(template, 'report').length !== assertionCount
    )
      throw new Error(`Unexpected RO ${name} size`);
    const values = new Map(parameters.map((p) => [p.getAttribute('name')!.trim(), p.getAttribute('value')!]));
    if (values.size !== parameterCount) throw new Error('Duplicate RO parameter');
    const expanded = template.cloneNode(true) as Element;
    expanded.removeAttribute('abstract');
    expanded.setAttribute('id', `UBL-${name}`);
    for (const node of [expanded, ...Array.from(expanded.getElementsByTagName('*'))]) {
      for (const attribute of Array.from(node.attributes)) {
        // Consume the whole XPath variable name, avoiding $BR-1 / $BR-10 prefix corruption.
        attribute.value = attribute.value.replace(/\$([A-Za-z_][A-Za-z0-9_.:-]*)/g, (original, key: string) => values.get(key) ?? original);
      }
    }
    instance.parentNode!.replaceChild(expanded, instance);
    template.parentNode!.removeChild(template);
  }
  if (elements(root, 'assert').length + elements(root, 'report').length !== 1098 || elements(root, 'pattern').length !== 4)
    throw new Error('Expanded RO assertion count changed');
  const finalPatterns = elements(root, 'pattern');
  const core = finalPatterns.find((p) => p.getAttribute('id') === 'UBL-model')!;
  const native = finalPatterns.find((p) => p.getAttribute('id') === 'ROmodel')!;
  if (
    elements(core, 'assert').some((a) => a.getAttribute('id') === 'BR-27') ||
    elements(native, 'assert').filter((a) => a.getAttribute('id') === 'BR-27').length !== 1
  )
    throw new Error('Authority RO negative-price rule selection changed');
  return new XMLSerializer().serializeToString(doc);
}
