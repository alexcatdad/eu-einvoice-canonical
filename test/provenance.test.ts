import { describe, expect, test } from 'bun:test';
import { DOMParser, type Element, type Node } from '@xmldom/xmldom';
import { convert, decodeXml, values, type CanonicalInvoice } from '../src/index.js';
import { fixture } from './helpers.js';

const bytesFor = (name: string) => fixture(name);

async function traced(name: string, provenance = true): Promise<CanonicalInvoice> {
  const r = await convert(bytesFor(name), name, undefined, { provenance });
  const o = r.outcomes[0];
  if (!o || o.status !== 'ok') throw new Error(`${name}: ${JSON.stringify(o)}`);
  return o.invoices[0];
}

/** Resolves the XPath dialect the parsers emit: absolute child steps by qualified name, optional [n], optional trailing /@attr, `|` unions. */
function resolve(root: Element, xpath: string): string[] {
  return xpath.split(' | ').map((one) => {
    const steps = one.split('/').filter(Boolean);
    let attr: string | undefined;
    if (steps.at(-1)?.startsWith('@')) attr = steps.pop()!.slice(1);
    let cur: Element | undefined;
    steps.forEach((step, i) => {
      const [, name, idx] = /^(.+?)(?:\[(\d+)\])?$/.exec(step)!;
      if (i === 0) {
        cur = root.nodeName === name ? root : undefined;
        return;
      }
      if (!cur) return;
      const kids: Element[] = [];
      for (let n: Node | null = cur.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && n.nodeName === name) kids.push(n as Element);
      cur = kids[idx ? Number(idx) - 1 : 0];
    });
    if (!cur) throw new Error(`XPath does not resolve: ${one}`);
    return attr === undefined ? cur.textContent ?? '' : cur.getAttribute(attr) ?? '';
  });
}

function leaves(value: unknown, path = ''): [string, string | number | boolean][] {
  if (value === null || value === undefined) return [];
  if (typeof value !== 'object') return [[path, value as string | number | boolean]];
  return Object.entries(value).flatMap(([k, v]) => leaves(v, `${path}/${k}`));
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Does the source text stand for the canonical value, allowing only the normalisation the parsers apply? */
function matches(path: string, value: string | number | boolean, texts: string[]): boolean {
  const v = String(value);
  const joined = texts.map(squash);
  if (joined.length === 1) {
    const t = joined[0];
    if (t === v || t.replace(/\s+/g, '') === v) return true;
    try { if (values.toDecimal(t) === v) return true; } catch { /* not a number */ }
    try { if (values.toIsoDate(t).date === v) return true; } catch { /* not a date */ }
    if (path.endsWith('/accountId') && t.replace(/[\s-]/g, '') === v) return true;
    // Peppol BT-21 subject code and text are two parts of one "#AAI#text" node.
    if (/\/notes\/\d+\/(text|subjectCode)$/.test(path) && t.includes(v)) return true;
    return false;
  }
  // Several nodes joined into one value (notes, address lines, payment terms...).
  return joined.every((t) => v.includes(t));
}

/** Leaves that are structural or mapped rather than read from a node, so they carry no provenance by design. */
const NOT_READ = [/^\/source\//, /^\/kind$/, /^\/attachments\/\d+\/kind$/, /^\/selfBilled$/, /^\/extensions\//];

function isDerived(inv: CanonicalInvoice, path: string): boolean {
  return inv.source.derived.some((d) => {
    const re = new RegExp(`^${d.field.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]+')}(/|$)`);
    return re.test(path);
  });
}

async function check(name: string, constants: RegExp[] = []) {
  const inv = await traced(name);
  const xml = decodeXml(bytesFor(name)).text;
  const root = new DOMParser().parseFromString(xml, 'text/xml').documentElement!;
  const prov = inv.source.provenance!;
  expect(prov).toBeDefined();

  // Every recorded XPath resolves to a node whose text is the canonical value.
  const all = new Map(leaves(inv));
  const bad: string[] = [];
  for (const [path, xpath] of Object.entries(prov)) {
    if (!all.has(path)) { bad.push(`${path}: no such leaf in the output`); continue; }
    const texts = resolve(root, xpath);
    if (!matches(path, all.get(path)!, texts)) bad.push(`${path} = ${JSON.stringify(all.get(path))} but ${xpath} reads ${JSON.stringify(texts)}`);
  }
  expect(bad).toEqual([]);

  // Coverage over the leaves the XML is responsible for.
  const candidates = [...all.keys()].filter((p) => !NOT_READ.some((re) => re.test(p)) && !constants.some((re) => re.test(p)) && !isDerived(inv, p));
  const missing = candidates.filter((p) => !(p in prov));
  const coverage = 1 - missing.length / candidates.length;
  expect(coverage, `uncovered: ${missing.join(', ')}`).toBeGreaterThan(0.95);
  return { inv, prov };
}

describe('field provenance', () => {
  test('is off by default', async () => {
    const inv = await traced('peppol-bis3-invoice.xml', false);
    expect(inv.source.provenance).toBeUndefined();
  });

  test('Peppol BIS 3 invoice: every XPath resolves to the canonical value, coverage > 95%', async () => {
    const { prov } = await check('peppol-bis3-invoice.xml');
    expect(prov['/totals/payable']).toBe('/Invoice/cac:LegalMonetaryTotal/cbc:PayableAmount');
    expect(prov['/lines/1/netAmount']).toBe('/Invoice/cac:InvoiceLine[2]/cbc:LineExtensionAmount');
  });

  test('Peppol BIS 3 credit note', async () => {
    await check('peppol-bis3-creditnote.xml');
  });

  test('XRechnung UBL', async () => {
    await check('xrechnung-ubl.xml');
  });

  test('XRechnung CII', async () => {
    const { prov } = await check('xrechnung-cii.xml');
    expect(prov['/lines/1/netAmount']).toContain('ram:IncludedSupplyChainTradeLineItem[2]');
  });

  // Svefaktura has no BT-24 and maps schemes and units by table; those leaves are mapped, not read.
  const SVEFAKTURA_MAPPED = [/^\/specificationId$/, /\/legalRegistrationId\/schemeId$/, /\/(identifiers\/\d+|locationId|standardId)\/schemeId$/, /\/unitCode$/, /\/meansCode$/,
    // composed or normalised text: F-skatt wording, "Säte <city>", note + penalty, giro codes
    /^\/seller\/(taxRegistrationId|additionalLegalInfo)$/, /^\/paymentTerms$/, /\/serviceProviderId$/];

  test('Svefaktura invoice: every XPath resolves to the canonical value, coverage > 95%', async () => {
    const { prov } = await check('svefaktura-1.0.xml', SVEFAKTURA_MAPPED);
    expect(prov['/totals/payable']).toMatch(/^\/Invoice\/(\w+:)?LegalTotal\/(\w+:)?TaxInclusiveTotalAmount$/);
  });

  test('Svefaktura credit note', async () => {
    await check('svefaktura-1.0-credit.xml', SVEFAKTURA_MAPPED);
  });
});
