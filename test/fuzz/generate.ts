/**
 * Input generators for the fuzz harness: structural XML mutation, byte-level mutation, grammar-generated XML and
 * nested envelopes. Everything is a pure function of a fast-check-generated description, so counterexamples shrink.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import * as fc from 'fast-check';
import { zipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { makeIdentity, signCms } from '../sig-helpers.js';
import type { FuzzCase } from './properties.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_DIR = join(import.meta.dir, '..', 'fixtures');

export interface Fixture {
  name: string;
  bytes: Uint8Array;
}

function listFixtures(): Fixture[] {
  const out: Fixture[] = [];
  for (const dir of ['', 'real']) {
    for (const f of readdirSync(join(FIXTURE_DIR, dir)).sort()) {
      if (f === 'README.md' || f === 'expected.json' || f.startsWith('.') || f.endsWith('.yml')) continue;
      if (dir === '' && f === 'real') continue;
      const rel = dir ? `${dir}/${f}` : f;
      out.push({ name: rel, bytes: new Uint8Array(readFileSync(join(FIXTURE_DIR, rel))) });
    }
  }
  return out;
}

export const FIXTURES = listFixtures();
const isBinary = (b: Uint8Array) => (b[0] === 0x25 && b[1] === 0x50) || (b[0] === 0x50 && b[1] === 0x4b) || b[0] === 0x30;
export const XML_FIXTURES = FIXTURES.filter((f) => !isBinary(f.bytes));
export const BINARY_FIXTURES = FIXTURES.filter((f) => isBinary(f.bytes));

const decoder = new TextDecoder();
const encoder = new TextEncoder();

// ---------------------------------------------------------------------------
// Text values
// ---------------------------------------------------------------------------

const EDGE_TEXT = [
  '',
  ' ',
  '\n',
  '‮',
  '‮abc‬',
  'é́́́́́',
  'a\u0000b',
  '\uD800',
  '\uDC00x\uD800',
  '﻿',
  '​‍',
  '￾￿',
  '\u{1F600}'.repeat(50),
  '999999999999999999999999999999999999',
  '-0',
  '-0.00',
  '+0',
  '0.0000000000000000000001',
  '1e5',
  '1E+400',
  '-1e-400',
  '1,5',
  '1.234,56',
  '1 234,56',
  'NaN',
  'Infinity',
  '-Infinity',
  '0x1F',
  '+5',
  '.5',
  '5.',
  '.',
  '-',
  '--5',
  '１２３',
  '٣٤٥',
  '1_000',
  '2026-02-30',
  '2026-13-45',
  '0000-00-00',
  '99999999',
  '20261301',
  'T25:61:61',
  ']]>',
  '<![CDATA[x',
  '&',
  '&#0;',
  '&#xD800;',
  '&nope;',
  '<',
  '"\'',
  '__proto__',
  'constructor',
  'toString',
  'EUR',
  'XXX',
  '9'.repeat(5000),
  'x'.repeat(100_000),
  `${'1'.repeat(300)}.${'9'.repeat(300)}`,
];

const numericText = fc.oneof(
  fc.bigInt({ min: -(10n ** 40n), max: 10n ** 40n }).map(String),
  fc.double({ noNaN: false }).map(String),
  fc.double({ noNaN: true, noDefaultInfinity: true }).map((d) => d.toFixed(2)),
  fc.double({ noNaN: true, noDefaultInfinity: true }).map((d) => String(d).replace('.', ',')),
  fc.integer({ min: 1, max: 4000 }).map((n) => '9'.repeat(n)),
);

export const textValue: fc.Arbitrary<string> = fc.oneof(
  { arbitrary: fc.constantFrom(...EDGE_TEXT), weight: 4 },
  { arbitrary: numericText, weight: 3 },
  { arbitrary: fc.string({ unit: 'binary', maxLength: 40 }), weight: 2 },
  { arbitrary: fc.string({ unit: 'grapheme', maxLength: 40 }), weight: 1 },
);

// ---------------------------------------------------------------------------
// Structural XML mutation
// ---------------------------------------------------------------------------

type ElementNode = ReturnType<Document['createElement']>;

interface TreeSpec {
  name: number;
  text: string;
  kids: TreeSpec[];
}

const treeSpec: fc.Arbitrary<TreeSpec> = fc.letrec<{ tree: TreeSpec }>((tie) => ({
  tree: fc.record({
    name: fc.nat(),
    text: textValue,
    kids: fc.oneof(
      { depthSize: 'small', maxDepth: 4 },
      fc.constant([] as TreeSpec[]),
      fc.array(tie('tree') as fc.Arbitrary<TreeSpec>, { maxLength: 3 }),
    ),
  }),
})).tree;

export type XmlOp =
  | { k: 'drop'; at: number }
  | { k: 'dup'; at: number }
  | { k: 'move'; at: number }
  | { k: 'text'; at: number; text: string }
  | { k: 'attr'; at: number; text: string }
  | { k: 'ns'; at: number; text: string }
  | { k: 'rename'; at: number; name: number }
  | { k: 'insert'; at: number; tree: TreeSpec }
  | { k: 'strip' };

export type Encoding = 'utf8' | 'utf8-bom' | 'utf16le' | 'utf16be' | 'latin1-lie' | 'as-is';

const NS_POOL = [
  '',
  'urn:x',
  'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
  'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
  'http://www.w3.org/2000/09/xmldsig#',
  'http://www.unece.org/cefact/namespaces/StandardBusinessDocumentHeader',
  'http://schemas.xmlsoap.org/soap/envelope/',
  'http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2',
];

export const xmlOp: fc.Arbitrary<XmlOp> = fc.oneof(
  fc.record({ k: fc.constant('drop' as const), at: fc.nat() }),
  fc.record({ k: fc.constant('dup' as const), at: fc.nat() }),
  fc.record({ k: fc.constant('move' as const), at: fc.nat() }),
  fc.record({ k: fc.constant('text' as const), at: fc.nat(), text: textValue }),
  fc.record({ k: fc.constant('text' as const), at: fc.nat(), text: textValue }),
  fc.record({ k: fc.constant('attr' as const), at: fc.nat(), text: textValue }),
  fc.record({ k: fc.constant('ns' as const), at: fc.nat(), text: fc.oneof(fc.constantFrom(...NS_POOL), textValue) }),
  fc.record({ k: fc.constant('rename' as const), at: fc.nat(), name: fc.nat() }),
  fc.record({ k: fc.constant('insert' as const), at: fc.nat(), tree: treeSpec }),
  fc.record({ k: fc.constant('strip' as const) }),
);

export const encodingArb: fc.Arbitrary<Encoding> = fc.constantFrom('utf8', 'utf8-bom', 'utf16le', 'utf16be', 'latin1-lie', 'as-is');

function parseDoc(bytes: Uint8Array): Document | undefined {
  try {
    return new DOMParser({ onError: () => {} }).parseFromString(decoder.decode(bytes), 'text/xml') as unknown as Document;
  } catch {
    return undefined;
  }
}

function elementsOf(doc: Document): ElementNode[] {
  return Array.from(doc.getElementsByTagName('*')) as ElementNode[];
}

/** Qualified element names (as written in the source) with their namespace, harvested from one document. */
function vocabulary(doc: Document): { qname: string; ns: string | null }[] {
  const seen = new Map<string, string | null>();
  for (const el of elementsOf(doc)) seen.set(el.nodeName, el.namespaceURI);
  return [...seen].map(([qname, ns]) => ({ qname, ns }));
}

function buildTree(doc: Document, spec: TreeSpec, vocab: { qname: string; ns: string | null }[]): ElementNode {
  const v = vocab[spec.name % vocab.length];
  const el = (v.ns ? doc.createElementNS(v.ns, v.qname) : doc.createElement(v.qname)) as ElementNode;
  if (spec.kids.length === 0) el.appendChild(doc.createTextNode(spec.text));
  for (const kid of spec.kids) el.appendChild(buildTree(doc, kid, vocab));
  return el;
}

function encode(xml: string, enc: Encoding): Uint8Array {
  switch (enc) {
    case 'utf8-bom':
      return new Uint8Array([0xef, 0xbb, 0xbf, ...encoder.encode(xml)]);
    case 'utf16le':
    case 'utf16be': {
      const out = new Uint8Array(2 + xml.length * 2);
      const le = enc === 'utf16le';
      out.set(le ? [0xff, 0xfe] : [0xfe, 0xff]);
      for (let i = 0; i < xml.length; i++) {
        const c = xml.charCodeAt(i);
        out[2 + i * 2 + (le ? 0 : 1)] = c & 0xff;
        out[2 + i * 2 + (le ? 1 : 0)] = c >> 8;
      }
      return out;
    }
    case 'latin1-lie': {
      // Declares ISO-8859-1 but carries UTF-8 bytes.
      const body = xml.replace(/^<\?xml[^>]*\?>/, '');
      return encoder.encode(`<?xml version="1.0" encoding="ISO-8859-1"?>${body}`);
    }
    default:
      return encoder.encode(xml);
  }
}

/** Parses `fixture` as XML, applies the structural operations, serialises and encodes. Returns undefined when the fixture is not well-formed XML. */
export function mutateXml(fixture: Fixture, ops: XmlOp[], enc: Encoding): Uint8Array | undefined {
  let doc: Document;
  try {
    doc = new DOMParser({ onError: () => {} }).parseFromString(decoder.decode(fixture.bytes), 'text/xml') as unknown as Document;
  } catch {
    return undefined;
  }
  if (!doc.documentElement) return undefined;
  const vocab = vocabulary(doc);
  let strip = false;
  for (const op of ops) {
    if (op.k === 'strip') {
      strip = true;
      continue;
    }
    const els = elementsOf(doc);
    const el = els[op.at % els.length];
    const parent = el.parentNode;
    switch (op.k) {
      case 'drop':
        if (parent && el !== doc.documentElement) parent.removeChild(el);
        break;
      case 'dup':
        if (parent && el !== doc.documentElement) parent.insertBefore(el.cloneNode(true), el);
        break;
      case 'move':
        if (parent && el !== doc.documentElement) {
          // Reorder: move to the end of its parent, or before its previous sibling.
          if (op.at % 2 === 0) parent.appendChild(el);
          else if (el.previousSibling) parent.insertBefore(el, el.previousSibling);
        }
        break;
      case 'text': {
        // Replace the text of a leaf element, or of the first text child.
        const leaves = els.filter((e) => e.childNodes.length === 0 || (e.childNodes.length === 1 && e.firstChild?.nodeType === 3));
        const leaf = leaves[op.at % Math.max(leaves.length, 1)];
        if (leaf) {
          while (leaf.firstChild) leaf.removeChild(leaf.firstChild);
          leaf.appendChild(doc.createTextNode(op.text));
        }
        break;
      }
      case 'attr': {
        const withAttrs = els.filter((e) => e.attributes.length > 0);
        const target = withAttrs[op.at % Math.max(withAttrs.length, 1)];
        if (target) target.attributes[op.at % target.attributes.length].value = op.text;
        break;
      }
      case 'ns': {
        const decls = els.flatMap((e) => Array.from(e.attributes).filter((a) => a.name === 'xmlns' || a.name.startsWith('xmlns:')));
        const a = decls[op.at % Math.max(decls.length, 1)];
        if (a) a.value = op.text;
        break;
      }
      case 'rename': {
        const v = vocab[op.name % vocab.length];
        const clone = (v.ns ? doc.createElementNS(v.ns, v.qname) : doc.createElement(v.qname)) as ElementNode;
        while (el.firstChild) clone.appendChild(el.firstChild);
        for (const a of Array.from(el.attributes)) clone.setAttribute(a.name, a.value);
        if (parent && el !== doc.documentElement) parent.replaceChild(clone, el);
        break;
      }
      case 'insert':
        el.appendChild(buildTree(doc, op.tree, vocab));
        break;
    }
  }
  let xml = new XMLSerializer().serializeToString(doc as never);
  // Strip prefixes: <ns:Tag> -> <Tag>, leaving declarations and attributes alone.
  if (strip) xml = xml.replace(/<(\/?)[\w.-]+:(?=[\w.-]+[\s/>])/g, '<$1');
  return encode(xml, enc);
}

export const xmlMutation: fc.Arbitrary<FuzzCase> = fc
  .record({ f: fc.nat(), ops: fc.array(xmlOp, { minLength: 1, maxLength: 8 }), enc: encodingArb, deep: fc.boolean() })
  .map(({ f, ops, enc, deep }): FuzzCase | undefined => {
    const fixture = XML_FIXTURES[f % XML_FIXTURES.length];
    const bytes = mutateXml(fixture, ops, enc);
    return (
      bytes && {
        label: `xml-mutation of ${fixture.name}`,
        filename: fixture.name,
        bytes,
        options: deep ? { relations: true, provenance: true } : {},
      }
    );
  })
  .filter((c): c is FuzzCase => c !== undefined);

// ---------------------------------------------------------------------------
// Byte-level mutation
// ---------------------------------------------------------------------------

export type ByteOp =
  | { k: 'flip'; pos: number; bit: number }
  | { k: 'trunc'; frac: number }
  | { k: 'u32'; pos: number; val: number; le: boolean }
  | { k: 'u16'; pos: number; val: number; le: boolean }
  | { k: 'fill'; pos: number; len: number; val: number }
  | { k: 'insert'; pos: number; len: number; val: number }
  | { k: 'delete'; pos: number; len: number }
  | { k: 'zipfield'; occurrence: number; sig: number; field: number; val: number }
  | { k: 'derlen'; occurrence: number; form: number }
  | { k: 'pdfnum'; occurrence: number; val: string };

const EXTREME32 = [0, 1, 0x7fffffff, 0x80000000, 0xffffffff, 0xfffffffe, 0x10000, 0x7ffffffe];

export const byteOp: fc.Arbitrary<ByteOp> = fc.oneof(
  fc.record({ k: fc.constant('flip' as const), pos: fc.nat(), bit: fc.integer({ min: 0, max: 7 }) }),
  fc.record({ k: fc.constant('flip' as const), pos: fc.nat(), bit: fc.integer({ min: 0, max: 7 }) }),
  fc.record({ k: fc.constant('trunc' as const), frac: fc.integer({ min: 0, max: 1000 }) }),
  fc.record({ k: fc.constant('u32' as const), pos: fc.nat(), val: fc.constantFrom(...EXTREME32), le: fc.boolean() }),
  fc.record({ k: fc.constant('u16' as const), pos: fc.nat(), val: fc.constantFrom(0, 1, 0x7fff, 0x8000, 0xffff), le: fc.boolean() }),
  fc.record({
    k: fc.constant('fill' as const),
    pos: fc.nat(),
    len: fc.integer({ min: 1, max: 64 }),
    val: fc.constantFrom(0, 0xff, 0x80, 0x41),
  }),
  fc.record({
    k: fc.constant('insert' as const),
    pos: fc.nat(),
    len: fc.integer({ min: 1, max: 64 }),
    val: fc.integer({ min: 0, max: 255 }),
  }),
  fc.record({ k: fc.constant('delete' as const), pos: fc.nat(), len: fc.integer({ min: 1, max: 64 }) }),
  fc.record({
    k: fc.constant('zipfield' as const),
    occurrence: fc.nat(),
    sig: fc.integer({ min: 0, max: 2 }),
    field: fc.nat(),
    val: fc.constantFrom(...EXTREME32),
  }),
  fc.record({ k: fc.constant('derlen' as const), occurrence: fc.nat(), form: fc.integer({ min: 0, max: 3 }) }),
  fc.record({
    k: fc.constant('pdfnum' as const),
    occurrence: fc.nat(),
    val: fc.constantFrom('0', '-1', '2147483647', '4294967295', '99999999999999999999', '1e9', '0.5'),
  }),
);

// Little-endian field offsets (from the signature) holding sizes, counts and offsets in ZIP records.
const ZIP_SIGS: { sig: number[]; fields: [number, 2 | 4][] }[] = [
  {
    sig: [0x50, 0x4b, 0x03, 0x04],
    fields: [
      [18, 4],
      [22, 4],
      [26, 2],
      [28, 2],
      [8, 2],
    ],
  },
  {
    sig: [0x50, 0x4b, 0x01, 0x02],
    fields: [
      [20, 4],
      [24, 4],
      [28, 2],
      [30, 2],
      [32, 2],
      [42, 4],
      [10, 2],
    ],
  },
  {
    sig: [0x50, 0x4b, 0x05, 0x06],
    fields: [
      [8, 2],
      [10, 2],
      [12, 4],
      [16, 4],
      [20, 2],
    ],
  },
];

function findAll(bytes: Uint8Array, sig: number[]): number[] {
  const hits: number[] = [];
  for (let i = 0; i + sig.length <= bytes.length; i++) if (sig.every((b, j) => bytes[i + j] === b)) hits.push(i);
  return hits;
}

function put(bytes: Uint8Array, pos: number, val: number, size: 1 | 2 | 4, le: boolean): void {
  for (let i = 0; i < size; i++) {
    const shift = 8 * (le ? i : size - 1 - i);
    if (pos + i < bytes.length) bytes[pos + i] = Math.floor(val / 2 ** shift) & 0xff;
  }
}

export function mutateBytes(input: Uint8Array, ops: ByteOp[]): Uint8Array {
  let b = new Uint8Array(input);
  for (const op of ops) {
    if (b.length === 0 && op.k !== 'insert') continue;
    const pos = (n: number) => n % Math.max(b.length, 1);
    switch (op.k) {
      case 'flip':
        b[pos(op.pos)] ^= 1 << op.bit;
        break;
      case 'trunc':
        b = b.slice(0, Math.floor((b.length * op.frac) / 1000));
        break;
      case 'u32':
        put(b, pos(op.pos), op.val, 4, op.le);
        break;
      case 'u16':
        put(b, pos(op.pos), op.val, 2, op.le);
        break;
      case 'fill': {
        const p = pos(op.pos);
        b.fill(op.val, p, Math.min(b.length, p + op.len));
        break;
      }
      case 'insert': {
        const p = pos(op.pos);
        const next = new Uint8Array(b.length + op.len);
        next.set(b.subarray(0, p));
        next.fill(op.val, p, p + op.len);
        next.set(b.subarray(p), p + op.len);
        b = next;
        break;
      }
      case 'delete': {
        const p = pos(op.pos);
        b = new Uint8Array([...b.subarray(0, p), ...b.subarray(Math.min(b.length, p + op.len))]);
        break;
      }
      case 'zipfield': {
        const spec = ZIP_SIGS[op.sig];
        const hits = findAll(b, spec.sig);
        if (hits.length === 0) break;
        const base = hits[op.occurrence % hits.length];
        const [off, size] = spec.fields[op.field % spec.fields.length];
        put(b, base + off, op.val, size, true);
        break;
      }
      case 'derlen': {
        // Overwrite a DER length after a SEQUENCE / OCTET STRING / context tag with an extreme long form.
        const tags = [...b.keys()].filter((i) => b[i] === 0x30 || b[i] === 0x04 || b[i] === 0xa0 || b[i] === 0x31).slice(0, 4000);
        if (tags.length === 0) break;
        const at = tags[op.occurrence % tags.length] + 1;
        const forms = [
          [0x84, 0xff, 0xff, 0xff, 0xff],
          [0x88, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
          [0x80],
          [0x84, 0x7f, 0xff, 0xff, 0xff],
        ];
        const form = forms[op.form % forms.length];
        for (let i = 0; i < form.length && at + i < b.length; i++) b[at + i] = form[i];
        break;
      }
      case 'pdfnum': {
        const text = new TextDecoder('latin1').decode(b);
        const hits = [...text.matchAll(/\/(?:Length|Size|Count|N|First|W|Prev|Root|Index|Filter|DecodeParms|Columns|Predictor)\s+\d+/g)];
        if (hits.length === 0) break;
        const m = hits[op.occurrence % hits.length];
        const replaced = m[0].replace(/\d+$/, op.val);
        const out = new Uint8Array(text.length - m[0].length + replaced.length);
        for (let i = 0; i < m.index; i++) out[i] = b[i];
        for (let i = 0; i < replaced.length; i++) out[m.index + i] = replaced.charCodeAt(i);
        for (let i = m.index + m[0].length; i < b.length; i++) out[i - m[0].length + replaced.length] = b[i];
        b = out;
        break;
      }
    }
  }
  return b;
}

// Extra binary seeds built at start-up: archives of fixtures, and an unsigned-looking p7m made from a fixture.
let seeds: Fixture[] | undefined;
export async function binarySeeds(): Promise<Fixture[]> {
  if (seeds) return seeds;
  const xml = XML_FIXTURES.find((f) => f.name === 'peppol-bis3-invoice.xml')!.bytes;
  const cii = XML_FIXTURES.find((f) => f.name === 'xrechnung-cii.xml')!.bytes;
  const id = await identity();
  seeds = [
    ...BINARY_FIXTURES,
    { name: 'built.zip', bytes: zipSync({ 'a.xml': xml, 'dir/b.xml': cii, 'readme.txt': encoder.encode('hi') }) },
    { name: 'built.xml.p7m', bytes: await signCms(xml, id) },
    { name: 'built.pdf', bytes: await wrap('pdf', xml) },
  ];
  return seeds;
}

export const byteMutation = (seedList: Fixture[]): fc.Arbitrary<FuzzCase> =>
  fc
    .record({
      f: fc.nat(),
      ops: fc.array(byteOp, { minLength: 1, maxLength: 6 }),
      viaXml: fc.boolean(),
    })
    .map(({ f, ops, viaXml }): FuzzCase => {
      // Mostly binary seeds; sometimes a plain XML fixture, which exercises the text decoders.
      const pool = viaXml && f % 4 === 0 ? XML_FIXTURES : seedList;
      const fixture = pool[f % pool.length];
      return { label: `byte-mutation of ${fixture.name}`, filename: fixture.name, bytes: mutateBytes(fixture.bytes, ops) };
    });

// ---------------------------------------------------------------------------
// Grammar-generated XML, deep and wide documents
// ---------------------------------------------------------------------------

export const generatedXml: fc.Arbitrary<FuzzCase> = fc
  .record({
    f: fc.nat(),
    trees: fc.array(treeSpec, { minLength: 1, maxLength: 12 }),
    where: fc.array(fc.nat(), { minLength: 1, maxLength: 12 }),
  })
  .map(({ f, trees, where }): FuzzCase | undefined => {
    const fixture = XML_FIXTURES[f % XML_FIXTURES.length];
    // Keep the root element and its declarations (so detection routes to this fixture's parser), then fill it from the grammar.
    const doc = parseDoc(fixture.bytes);
    if (!doc?.documentElement) return undefined;
    const vocab = vocabulary(doc);
    const root = doc.documentElement;
    while (root.firstChild) root.removeChild(root.firstChild);
    const placed: ElementNode[] = [root as unknown as ElementNode];
    trees.forEach((t, i) => {
      const el = buildTree(doc, t, vocab);
      placed[where[i % where.length] % placed.length].appendChild(el);
      placed.push(el);
    });
    return {
      label: `generated from the grammar of ${fixture.name}`,
      filename: fixture.name,
      bytes: encoder.encode(new XMLSerializer().serializeToString(doc as never)),
      options: { relations: true, provenance: true },
    };
  })
  .filter((c): c is FuzzCase => c !== undefined);

/** Deeply nested or very wide documents, built as strings so the generator itself does not recurse. */
export const shapedXml: fc.Arbitrary<FuzzCase> = fc
  .record({
    f: fc.nat(),
    shape: fc.constantFrom('deep', 'wide', 'deep-text', 'many-attrs'),
    n: fc.constantFrom(10, 100, 1000, 5000, 20_000, 100_000),
    pick: fc.array(fc.nat(), { minLength: 1, maxLength: 6 }),
    text: fc.constantFrom('1', 'x', '1.5', '', '9'.repeat(100)),
  })
  .map(({ f, shape, n, pick, text }): FuzzCase | undefined => {
    const fixture = XML_FIXTURES[f % XML_FIXTURES.length];
    const doc = parseDoc(fixture.bytes);
    if (!doc?.documentElement) return undefined;
    const names = vocabulary(doc).map((v) => v.qname);
    const root = doc.documentElement;
    const shallow = new XMLSerializer().serializeToString(root.cloneNode(false) as never);
    const open = shallow.replace(/\/>$/, '>');
    const close = `</${root.nodeName}>`;
    const name = (i: number) => names[pick[i % pick.length] % names.length];
    let body: string;
    if (shape === 'deep') {
      const tags = Array.from({ length: n }, (_, i) => name(i));
      body =
        tags.map((t) => `<${t}>`).join('') +
        text +
        tags
          .reverse()
          .map((t) => `</${t}>`)
          .join('');
    } else if (shape === 'deep-text') {
      const t = name(0);
      body = `${`<${t}>`.repeat(n)}${text}${`</${t}>`.repeat(n)}`;
    } else if (shape === 'wide') {
      body = Array.from({ length: n }, (_, i) => `<${name(i)}>${text}</${name(i)}>`).join('');
    } else {
      body = `<${name(0)} ${Array.from({ length: Math.min(n, 5000) }, (_, i) => `a${i}="${text}"`).join(' ')}>${text}</${name(0)}>`;
    }
    return { label: `${shape} (${n}) in ${fixture.name}`, filename: fixture.name, bytes: encoder.encode(open + body + close), options: {} };
  })
  .filter((c): c is FuzzCase => c !== undefined);

// ---------------------------------------------------------------------------
// Envelope recursion
// ---------------------------------------------------------------------------

export type Layer = 'zip' | 'p7m' | 'base64' | 'sbdh' | 'soap' | 'pdf' | 'zip-dir';

let cachedIdentity: ReturnType<typeof makeIdentity> | undefined;
const identity = () => {
  cachedIdentity ??= makeIdentity('Fuzz Signer');
  return cachedIdentity;
};

const SBDH = 'http://www.unece.org/cefact/namespaces/StandardBusinessDocumentHeader';

function asText(bytes: Uint8Array): string {
  return decoder
    .decode(bytes)
    .replace(/^﻿/, '')
    .replace(/^<\?xml[^>]*\?>/, '');
}

export async function wrap(layer: Layer, bytes: Uint8Array): Promise<Uint8Array> {
  switch (layer) {
    case 'zip':
      return zipSync({ 'inner.xml': bytes });
    case 'zip-dir':
      return zipSync({ 'a/b/': new Uint8Array(0), 'a/b/inner.p7m': bytes, 'note.txt': encoder.encode('x') });
    case 'p7m':
      return signCms(bytes, await identity());
    case 'base64':
      return encoder.encode(
        Buffer.from(bytes)
          .toString('base64')
          .replace(/(.{76})/g, '$1\n'),
      );
    case 'sbdh':
      return encoder.encode(
        `<sh:StandardBusinessDocument xmlns:sh="${SBDH}"><sh:StandardBusinessDocumentHeader><sh:HeaderVersion>1.0</sh:HeaderVersion></sh:StandardBusinessDocumentHeader>${asText(bytes)}</sh:StandardBusinessDocument>`,
      );
    case 'soap':
      return encoder.encode(
        `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>${asText(bytes)}</s:Body></s:Envelope>`,
      );
    case 'pdf': {
      const pdf = await PDFDocument.create();
      pdf.addPage();
      await pdf.attach(bytes, 'factur-x.xml', { mimeType: 'text/xml' });
      return pdf.save();
    }
  }
}

const layerArb = fc.constantFrom<Layer>('zip', 'p7m', 'base64', 'sbdh', 'soap', 'pdf', 'zip-dir');

/** A case whose bytes are computed asynchronously, so it is described first and materialised in the property. */
export interface EnvelopeSpec {
  f: number;
  layers: Layer[];
  maxDepth: number | undefined;
}

export const envelopeSpec: fc.Arbitrary<EnvelopeSpec> = fc.record({
  f: fc.nat(),
  layers: fc.array(layerArb, { minLength: 1, maxLength: 10 }),
  maxDepth: fc.option(fc.integer({ min: 0, max: 8 }), { nil: undefined }),
});

export async function buildEnvelope(spec: EnvelopeSpec): Promise<FuzzCase> {
  const fixture = XML_FIXTURES[spec.f % XML_FIXTURES.length];
  let bytes = fixture.bytes;
  for (const layer of spec.layers) bytes = await wrap(layer, bytes);
  return {
    label: `${spec.layers.join(' > ')} around ${fixture.name}${spec.maxDepth === undefined ? '' : ` (maxDepth ${spec.maxDepth})`}`,
    filename: `${fixture.name}.${spec.layers[spec.layers.length - 1]}`,
    bytes,
    limits: spec.maxDepth === undefined ? undefined : { maxDepth: spec.maxDepth },
  };
}
