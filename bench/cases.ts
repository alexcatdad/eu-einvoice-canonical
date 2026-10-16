import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { type ConvertOptions, convert } from '../src/index.js';
import { cached, fixture, invoiceWithAttachment, largeInvoice } from './generate.js';
import type { Case } from './lib.js';

const fixtureDir = join(import.meta.dir, '..', 'test', 'fixtures');
const FORMAT_FILES = readdirSync(fixtureDir)
  .filter((f) => /\.(xml|isdoc)$/.test(f))
  .sort();

/** Fixtures that stand for one parser family each in the quick subset. */
const QUICK_FORMATS = new Set([
  'peppol-bis3-invoice.xml',
  'xrechnung-cii.xml',
  'fatturapa-b2b.xml',
  'ksef-fa3.xml',
  'facturae-322-iva-irpf.xml',
]);

const WRAPPERS: [string, string][] = [
  ['pdf-a3', 'facturx-en16931.pdf'],
  ['cades-p7m', 'IT01234567890_FPR12.xml.p7m'],
  ['cades-p7m-base64', 'IT01234567890_FPR12.base64.xml.p7m'],
  ['zip', 'anaf-download.zip'],
  ['sbdh', 'peppol-in-sbdh.xml'],
  ['soap', 'finvoice-with-soap.xml'],
  ['xades-xsig', 'facturae-322-signed.xsig'],
];
const QUICK_WRAPPERS = new Set(['pdf-a3', 'cades-p7m', 'zip']);

const OPTION_SETS: [string, ConvertOptions][] = [
  ['plain', {}],
  ['relations', { relations: true }],
  ['provenance', { provenance: true }],
  ['relations+provenance', { relations: true, provenance: true }],
];

export function buildCases(): Case[] {
  const cases: Case[] = [];
  /** Inputs load on first use, so a child process that measures one case holds only that case's bytes. */
  const lazy = (load: () => Uint8Array) => {
    let v: Uint8Array | undefined;
    return () => {
      v ??= load();
      return v;
    };
  };
  const conv =
    (name: string, input: () => Uint8Array, opts: ConvertOptions = {}, size?: { bytes: number }) =>
    async () => {
      const bytes = input();
      if (size) size.bytes = bytes.length;
      const r = await convert(bytes, name, undefined, opts);
      if (!r.outcomes.length) throw new Error(`${name}: nothing converted`);
    };
  const add = (c: Omit<Case, 'run' | 'bytes'> & { name: string; input: () => Uint8Array; opts?: ConvertOptions }) => {
    const { name, input, opts, ...rest } = c;
    const out: Case = { ...rest, bytes: 0, run: async () => undefined };
    out.run = conv(name, input, opts, out);
    cases.push(out);
  };

  for (const f of FORMAT_FILES)
    add({ id: `format/${f}`, group: 'format', name: f, input: lazy(() => fixture(f)), quick: QUICK_FORMATS.has(f) });
  for (const [name, f] of WRAPPERS)
    add({ id: `wrapper/${name}`, group: 'wrapper', name: f, input: lazy(() => fixture(f)), quick: QUICK_WRAPPERS.has(name) });

  // The same invoice with each optional layer.
  const ubl = lazy(() => fixture('peppol-bis3-invoice.xml'));
  for (const [name, opts] of OPTION_SETS.slice(1))
    add({ id: `options/ubl-${name}`, group: 'options', name: 'i.xml', input: ubl, opts, quick: name !== 'relations' });
  add({ id: 'options/ubl-validate', group: 'options', name: 'i.xml', input: ubl, opts: { validate: true }, budgetMs: 1500 });
  add({
    id: 'options/cii-validate',
    group: 'options',
    name: 'i.xml',
    input: lazy(() => fixture('xrechnung-cii.xml')),
    opts: { validate: true },
    budgetMs: 1500,
  });

  // Generated large invoices.
  for (const n of [1000, 10000]) {
    const input = lazy(() => cached(`lines-${n}.xml`, () => largeInvoice(n)));
    for (const [name, opts] of OPTION_SETS)
      add({
        id: `large/${n}-lines-${name}`,
        group: 'large',
        name: 'big.xml',
        input,
        opts,
        quick: n === 1000 && (name === 'plain' || name === 'relations+provenance'),
        budgetMs: n === 10000 ? 1 : 250,
      });
  }
  add({
    id: 'large/attachment-20MB',
    group: 'large',
    name: 'att.xml',
    input: lazy(() => cached('attachment-20MB.xml', () => invoiceWithAttachment(20))),
    budgetMs: 1,
  });
  // The 20 MB attachment inside a base64 text file (a base64 .p7m without the CMS shell): the envelope's base64 path.
  add({
    id: 'large/attachment-20MB-base64-file',
    group: 'large',
    name: 'att.xml.b64',
    input: lazy(() =>
      cached('attachment-20MB.b64', () =>
        new TextEncoder().encode(Buffer.from(cached('attachment-20MB.xml', () => invoiceWithAttachment(20))).toString('base64')),
      ),
    ),
    budgetMs: 1,
  });
  return cases;
}
