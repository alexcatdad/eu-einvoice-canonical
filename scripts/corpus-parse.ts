/**
 * Known-answer check of PARSE results (not just detection) over the public sample corpora that
 * .github/workflows/corpus.yml clones. The detection manifest test/corpus/expected.json lists the files; this
 * one adds, for the UBL and CII files among them whose values can be read reliably, the header and total
 * values the parser must return.
 *
 *   bun scripts/corpus-parse.ts --write     regenerate test/corpus/parse-expected.json from the clones
 *   bun scripts/corpus-parse.ts             check the parser against that manifest (exit 1 on any mismatch)
 *
 * The expected values are read from the XML text with regular expressions that do not use src/ (as
 * scripts/corpus-manifest.ts does for identifiers), and a file is listed only when every value is found
 * exactly once where the syntax puts it: one PayableAmount / DuePayableAmount, an ID before the first party
 * block, and so on. Files that do not meet that are left out and counted, never guessed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { convert } from '../src/index.js';

interface Known {
  id: string;
  issueDate: string;
  currency: string;
  payable: string;
  lines: number;
}

const base = resolve(import.meta.dir, '..', 'test', 'corpus');
const formatsFile = join(base, 'expected.json');
const manifestFile = join(base, 'parse-expected.json');

const tag = (name: string) => new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([^<]*)<`, 'g');
const matches = (xml: string, name: string) => [...xml.matchAll(tag(name))].map((m) => m[1].trim());
const count = (xml: string, name: string) => [...xml.matchAll(new RegExp(`<(?:\\w+:)?${name}[\\s>]`, 'g'))].length;
const only = (xs: string[]) => (xs.length === 1 && xs[0] !== '' ? xs[0] : undefined);

/** Drops every <!-- ... --> span (an unterminated one to the end), scanning rather than substituting. */
function withoutComments(text: string): string {
  let out = '';
  let from = 0;
  for (;;) {
    const start = text.indexOf('<!--', from);
    if (start < 0) return out + text.slice(from);
    out += text.slice(from, start);
    const end = text.indexOf('-->', start + 4);
    if (end < 0) return out;
    from = end + 3;
  }
}

/** Expected values for a UBL Invoice / CreditNote or a CII CrossIndustryInvoice, or undefined when not reliably readable. */
function read(raw: string): Known | undefined {
  // Comments and UBL extensions (signatures, vendor blocks) can hold look-alike elements.
  const xml = withoutComments(raw).replace(/<(\w+:)?UBLExtensions[\s>][\s\S]*?<\/(?:\w+:)?UBLExtensions>/g, '');
  const root = /<(?:\w+:)?(Invoice|CreditNote|CrossIndustryInvoice)[\s>]/.exec(xml)?.[1];
  if (root === 'Invoice' || root === 'CreditNote') {
    const id = matches(xml, 'ID')[0];
    const issueDate = matches(xml, 'IssueDate')[0];
    const currency = only(matches(xml, 'DocumentCurrencyCode'));
    const payable = only(matches(xml, 'PayableAmount'));
    if (!id || !/^\d{4}-\d\d-\d\d$/.test(issueDate ?? '') || !currency || !payable) return undefined;
    return { id, issueDate, currency, payable, lines: count(xml, root === 'Invoice' ? 'InvoiceLine' : 'CreditNoteLine') };
  }
  if (root === 'CrossIndustryInvoice') {
    const doc = /<(?:\w+:)?ExchangedDocument>([\s\S]*?)<\/(?:\w+:)?ExchangedDocument>/.exec(xml)?.[1] ?? '';
    const id = only(matches(doc, 'ID'));
    const date = /IssueDateTime>\s*<[^>]*DateTimeString[^>]*>\s*(\d{4})(\d\d)(\d\d)\s*</.exec(doc);
    const currency = only(matches(xml, 'InvoiceCurrencyCode'));
    const payable = only(matches(xml, 'DuePayableAmount'));
    if (!id || !date || !currency || !payable) return undefined;
    return {
      id,
      issueDate: `${date[1]}-${date[2]}-${date[3]}`,
      currency,
      payable,
      lines: count(xml, 'IncludedSupplyChainTradeLineItem'),
    };
  }
  return undefined;
}

/** "336.90" and "336.9" are the same amount. */
const sameAmount = (a: string, b: string) => {
  const norm = (s: string) => {
    const t = s.trim();
    return t.includes('.') ? t.replace(/0+$/, '').replace(/\.$/, '') : t;
  };
  return norm(a) === norm(b);
};

const formats = JSON.parse(readFileSync(formatsFile, 'utf8')) as Record<string, string[]>;

if (process.argv.includes('--write')) {
  const out: Record<string, Known> = {};
  let skipped = 0;
  for (const rel of Object.keys(formats)) {
    let text: string;
    try {
      text = readFileSync(join(dirname(formatsFile), rel), 'utf8');
    } catch {
      console.log(`missing ${rel}`);
      continue;
    }
    const known = read(text);
    if (known) out[rel] = known;
    else skipped++;
  }
  writeFileSync(manifestFile, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`${Object.keys(out).length} files with known values, ${skipped} left out -> test/corpus/parse-expected.json`);
} else {
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as Record<string, Known>;
  let bad = 0;
  for (const [rel, k] of Object.entries(manifest)) {
    let problem: string | undefined;
    try {
      const r = await convert(new Uint8Array(readFileSync(join(base, rel))), rel);
      const o = r.outcomes[0];
      if (r.outcomes.length !== 1 || o?.status !== 'ok' || o.invoices.length !== 1) {
        problem = `expected one converted invoice, got ${r.outcomes.map((x) => x.status).join(',') || 'none'}`;
      } else {
        const inv = o.invoices[0];
        const diffs: string[] = [];
        if (inv.id !== k.id) diffs.push(`id ${inv.id} != ${k.id}`);
        if (inv.issueDate !== k.issueDate) diffs.push(`issueDate ${inv.issueDate} != ${k.issueDate}`);
        if (inv.currency !== k.currency) diffs.push(`currency ${inv.currency} != ${k.currency}`);
        if (!sameAmount(inv.totals.payable, k.payable)) diffs.push(`payable ${inv.totals.payable} != ${k.payable}`);
        if (inv.lines.length !== k.lines) diffs.push(`lines ${inv.lines.length} != ${k.lines}`);
        if (diffs.length) problem = diffs.join('; ');
      }
    } catch (e) {
      problem = `threw ${(e as Error).message}`;
    }
    if (problem) {
      bad++;
      console.log(`MISMATCH ${rel}: ${problem}`);
    }
  }
  const total = Object.keys(manifest).length;
  console.log(`\n${total - bad}/${total} files parse to their expected header and total values`);
  process.exitCode = bad ? 1 : 0;
}
