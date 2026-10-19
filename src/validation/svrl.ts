import { DOMParser, type Element } from '@xmldom/xmldom';
import type { Finding } from './types.js';

const SVRL = 'http://purl.oclc.org/dsdl/svrl';
function severityOf(flag: string, role: string): Finding['severity'] {
  const s = (flag || role).toLowerCase();
  if (s === 'warning' || s === 'warn') return 'warning';
  if (s === 'information' || s === 'info') return 'info';
  return 'fatal'; // 'fatal', 'error', or unmarked: an assertion that fails is an error
}

export function parseSvrl(svrl: string, layer: 'semantic' | 'profile'): Finding[] {
  let invalid = false;
  const doc = new DOMParser({
    onError: () => {
      invalid = true;
    },
  }).parseFromString(svrl, 'text/xml');
  const root = doc.documentElement;
  if (invalid || !root || root.namespaceURI !== SVRL || root.localName !== 'schematron-output')
    throw new Error('Invalid SVRL output from validator');
  const findings: Finding[] = [];
  for (const tag of ['failed-assert', 'successful-report']) {
    const nodes = doc.getElementsByTagNameNS(SVRL, tag);
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes.item(i) as Element;
      const text = el.getElementsByTagNameNS(SVRL, 'text').item(0)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      // Rules read "[BR-CO-15]-Invoice total VAT amount ..."; the id is also an attribute.
      const bracket = /^\[([^\]]+)\]-?\s*/.exec(text);
      const suffix = /\[([A-Za-z][A-Za-z0-9-]*)\]$/.exec(text);
      const ruleId = el.getAttribute('id') || bracket?.[1] || suffix?.[1] || undefined;
      const message = bracket ? text.slice(bracket[0].length) : text || el.getAttribute('test') || '';
      const path = el.getAttribute('location') || undefined;
      findings.push({
        layer,
        ...(ruleId ? { ruleId } : {}),
        severity: severityOf(el.getAttribute('flag') ?? '', el.getAttribute('role') ?? ''),
        message,
        ...(path ? { path } : {}),
      });
    }
  }
  return findings;
}
