import { DOMParser, type Element } from '@xmldom/xmldom';
import { gunzipSync } from 'fflate';
import type { BundleReaderFor } from './bundles.js';
import { forValidator } from './schema.js';
import type { Finding } from './types.js';

const SVRL = 'http://purl.oclc.org/dsdl/svrl';
const sefs = new Map<string, Promise<unknown>>();

function loadSef(bundles: BundleReaderFor, bundleId: string, path: string, scope: string): Promise<unknown> {
  const key = `${scope}|${bundleId}`;
  let p = sefs.get(key);
  if (!p) {
    p = bundles.file(bundleId, path).then((gz) => JSON.parse(new TextDecoder().decode(gunzipSync(gz))));
    sefs.set(key, p);
    p.catch(() => sefs.delete(key));
  }
  return p;
}

function severityOf(flag: string, role: string): Finding['severity'] {
  const s = (flag || role).toLowerCase();
  if (s === 'warning' || s === 'warn') return 'warning';
  if (s === 'information' || s === 'info') return 'info';
  return 'fatal'; // 'fatal', 'error', or unmarked: an assertion that fails is an error
}

/** Runs a Schematron that was compiled ahead of time to a SaxonJS SEF and returns the failed assertions. */
export async function runSchematron(
  bundles: BundleReaderFor,
  bundleId: string,
  layer: 'semantic' | 'profile',
  xml: string,
  scope: string,
): Promise<Finding[]> {
  const manifest = await bundles.manifest(bundleId);
  const stylesheet = await loadSef(bundles, bundleId, manifest.entry!, scope);
  const { default: SaxonJS } = await import('saxon-js');
  const result = await SaxonJS.transform(
    { stylesheetInternal: stylesheet, sourceText: forValidator(xml), destination: 'serialized' },
    'async',
  );
  return parseSvrl(result.principalResult, layer);
}

export function parseSvrl(svrl: string, layer: 'semantic' | 'profile'): Finding[] {
  const doc = new DOMParser({ onError: () => {} }).parseFromString(svrl, 'text/xml');
  const findings: Finding[] = [];
  for (const tag of ['failed-assert', 'successful-report']) {
    const nodes = doc.getElementsByTagNameNS(SVRL, tag);
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes.item(i) as Element;
      const text = el.getElementsByTagNameNS(SVRL, 'text').item(0)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      // Rules read "[BR-CO-15]-Invoice total VAT amount ..."; the id is also an attribute.
      const bracket = /^\[([^\]]+)\]-?\s*/.exec(text);
      const ruleId = el.getAttribute('id') || bracket?.[1] || undefined;
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
