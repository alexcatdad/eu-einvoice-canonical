import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CanonicalInvoice } from '../src/index.js';
import {
  buildInvoiceView,
  Invoice,
  InvoiceAdjustments,
  InvoiceHeader,
  InvoiceLines,
  InvoiceNotes,
  InvoiceParties,
  InvoiceReferences,
  InvoiceTotals,
  PaymentDetails,
  VatBreakdown,
} from '../src/react/index.js';
import { articleHtml, renderHtml } from '../src/render/html.js';
import { reactCss } from '../src/render/style.js';
import { parseOne } from './helpers.js';
import { enrich, expectOnlyOwnMarkup, poison } from './render-helpers.js';

const root = join(import.meta.dir, '..');
const peppol = await parseOne('peppol-bis3-invoice.xml');
const creditNote = await parseOne('peppol-bis3-creditnote.xml');
const rich = enrich(peppol);
const html = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);
const plain = (s: string) => s.replace(/[  ]/g, ' ');

describe('<Invoice>', () => {
  const out = plain(html(<Invoice invoice={peppol} lang="de" idPrefix="t" />));

  test('renders the whole invoice as one labelled article', () => {
    expect(out.startsWith('<article class="einvoice" lang="de" aria-labelledby="t-title">')).toBe(true);
    expect(out).toContain('<h1 class="einvoice-title" id="t-title">Rechnung INV-2026-1042</h1>');
    const headings = [...out.matchAll(/<h2 class="einvoice-h2" id="[^"]+">(.*?)<\/h2>/g)].map((m) => m[1]);
    expect(headings).toEqual([
      'Verkäufer',
      'Käufer',
      'Lieferung',
      'Referenzen und Daten',
      'Positionen',
      'Nachlässe',
      'Zuschläge',
      'Umsatzsteuer-Aufschlüsselung',
      'Summen',
      'Zahlung',
      'Hinweise',
      'Anlagen',
    ]);
  });

  test('formats numbers, dates and units for the language', () => {
    expect(out).toContain('<div class="einvoice-due"><dt>Zahlbetrag</dt><dd>3.091,00 SEK</dd></div>');
    expect(out).toContain('<time dateTime="2026-10-15" title="2026-10-15">15.10.2026</time>');
    expect(out).toContain('<span title="H87">10 Stk.</span>');
    expect(out).toContain('<td class="einvoice-num">1.900,00</td>');
  });

  test('a credit note is marked as one', () => {
    const cn = html(<Invoice invoice={creditNote} idPrefix="c" />);
    expect(cn).toContain('<article class="einvoice einvoice--credit"');
    expect(cn).toContain('<p class="einvoice-badge">Credit note</p>');
    expect(cn).toContain(`>Credit note ${creditNote.id}</h1>`);
    expect(plain(cn)).toContain('<dt>Amount credited</dt><dd>SEK 250.00</dd>');
  });

  test('className is added to the root; unstyled drops every built-in class', () => {
    expect(html(<Invoice invoice={peppol} className="mine" />)).toContain('<article class="einvoice mine"');
    const bare = html(<Invoice invoice={peppol} unstyled className="mine" />);
    expect(bare).toContain('<article class="mine"');
    expect(bare).not.toContain('einvoice-');
    expect(bare).not.toMatch(/class="einvoice/);
    expect(html(<Invoice invoice={peppol} unstyled />)).toMatch(/^<article lang="en"/);
  });

  test('without idPrefix, two invoices on one page get distinct ids', () => {
    const page = html(
      <>
        <Invoice invoice={peppol} />
        <Invoice invoice={creditNote} />
      </>,
    );
    const ids = [...page.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(10);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('renders the optional parts: payee, schedule, card, mandate, exemptions, notes as lists', () => {
    const r = structuredClone(rich) as unknown as { notes: { text: string }[] };
    r.notes = [{ text: 'Terms:\n- one\n- two' }];
    const out = plain(html(<Invoice invoice={r as unknown as CanonicalInvoice} idPrefix="r" />));
    expect(out).toContain('<p class="einvoice-party-name">Payee Ltd</p>');
    expect(out).toContain('<dt>Card</dt><dd>VISA …1234</dd>');
    expect(out).toContain('<th scope="col">Exemption reason</th>');
    expect(out).toContain('<td class="einvoice-num">45.00<br/><span class="einvoice-basis">per 100 pcs</span></td>');
    expect(out).toContain(
      '<p class="einvoice-adjustments">Allowance (Line discount): −SEK 1.00<br/>Charge (Line surcharge): +SEK 2.00</p>',
    );
    expect(out).toContain('<div class="einvoice-note"><p>Terms:</p><ul><li>one</li><li>two</li></ul></div>');
    expect(out).toContain('<h3 class="einvoice-h3">Payment schedule</h3>');
  });

  test('an invoice with nothing optional leaves those sections out', () => {
    const bare = structuredClone(peppol) as unknown as Record<string, unknown>;
    Object.assign(bare, {
      lines: [],
      vatBreakdown: [],
      allowances: [],
      charges: [],
      payments: [],
      paymentSchedule: [],
      paymentTerms: undefined,
      notes: [],
      attachments: [],
      delivery: undefined,
      buyerReference: undefined,
      purchaseOrderRef: undefined,
      salesOrderRef: undefined,
      contractRef: undefined,
      projectRef: undefined,
      accountingRef: undefined,
      precedingInvoices: [],
    });
    const out = html(<Invoice invoice={bare as unknown as CanonicalInvoice} idPrefix="b" />);
    expect(out).toContain('<p class="einvoice-empty">This document carries no invoice lines.</p>');
    for (const gone of [
      'einvoice-references',
      'einvoice-vat',
      'einvoice-payment',
      'einvoice-notes',
      'einvoice-attachments',
      'einvoice-allowances',
    ]) {
      expect(out).not.toContain(gone);
    }
    expect(out).toContain('einvoice-totals');
    expect(out).toBe(articleHtml(buildInvoiceView(bare as unknown as CanonicalInvoice), 'b'));
  });
});

describe('the exported parts compose on their own', () => {
  const view = buildInvoiceView(peppol, 'en');

  test('each part renders from an invoice or from a shared view', () => {
    expect(html(<InvoiceHeader invoice={peppol} idPrefix="p" />)).toMatch(/^<header class="einvoice-header">/);
    expect(html(<InvoiceParties view={view} />)).toMatch(/^<div class="einvoice-parties">/);
    expect(html(<InvoiceReferences view={view} idPrefix="p" />)).toContain('id="p-references"');
    expect(html(<InvoiceLines view={view} />)).toContain('Hyllkonsol');
    expect(html(<InvoiceAdjustments view={view} />)).toContain('Volymrabatt (95)');
    expect(html(<VatBreakdown invoice={peppol} />)).toContain('<td class="einvoice-num">637.50</td>');
    expect(plain(html(<InvoiceTotals view={view} />))).toContain('<dt>Amount due</dt><dd>SEK 3,091.00</dd>');
    expect(html(<PaymentDetails view={view} />)).toContain('4711000123');
    expect(html(<InvoiceNotes view={view} />)).toContain('tidrapport.txt');
  });

  test('className and unstyled apply to a part on its own', () => {
    expect(html(<InvoiceTotals view={view} className="right" idPrefix="q" />)).toMatch(
      /^<section class="einvoice-section einvoice-totals right" aria-labelledby="q-totals">/,
    );
    expect(html(<VatBreakdown view={view} unstyled />)).not.toContain('class=');
  });
});

describe('React output escapes untrusted content', () => {
  const hostile = poison(rich, 'inv') as CanonicalInvoice;
  const out = html(<Invoice invoice={hostile} idPrefix="h" />);

  test('no markup from any field survives', () => {
    expect(out).not.toMatch(/<script|<\/script|<img|<!--/i);
    expect(out).not.toContain("' onmouseover='");
    expectOnlyOwnMarkup(out);
  });

  test('the hostile text is shown, escaped, not dropped', () => {
    const shown = '&lt;script&gt;alert(1)&lt;/script&gt;&quot;&gt;&lt;img src=x onerror=alert(1)&gt;&#x27; onmouseover=&#x27;alert(1)`';
    for (const path of ['inv.id', 'inv.seller.name', 'inv.notes.0.text', 'inv.lines.0.item.name', 'inv.attachments.1.uri']) {
      expect(out).toContain(`${shown} autofocus onfocus=alert(1) &lt;!-- --&gt; &amp;amp; &amp;#x3C;[${path}]`);
    }
  });

  test('the components never use dangerouslySetInnerHTML', () => {
    const dir = join(root, 'src/react');
    for (const f of readdirSync(dir).filter((n) => /\.tsx?$/.test(n))) {
      expect(readFileSync(join(dir, f), 'utf8')).not.toContain('dangerouslySetInnerHTML');
    }
  });
});

describe('renderHtml and the React component cannot drift', () => {
  const fixtures = [
    'peppol-bis3-invoice.xml',
    'peppol-bis3-creditnote.xml',
    'xrechnung-ubl.xml',
    'en16931-cii.xml',
    'fatturapa-b2b.xml',
    'ksef-fa3.xml',
    'cfdi-40-ingreso-iva-retenciones.xml',
    'facturae-322-iva-irpf.xml',
  ];
  const section = (s: string, name: string) => {
    const start = s.indexOf(`<section class="einvoice-section einvoice-${name}"`);
    return start < 0 ? '' : s.slice(start, s.indexOf('</section>', start) + 10);
  };

  for (const name of fixtures) {
    test(`${name}: same totals and VAT rows, and the same markup throughout`, async () => {
      const inv = await parseOne(name);
      for (const lang of ['en', 'de', 'pl']) {
        const fromString = renderHtml(inv, { lang, standalone: false });
        const fromReact = html(<Invoice invoice={inv} lang={lang} idPrefix="einvoice" />);
        expect(section(fromReact, 'totals')).not.toBe('');
        expect(section(fromReact, 'totals')).toBe(section(fromString, 'totals'));
        expect(section(fromReact, 'vat')).toBe(section(fromString, 'vat'));
        expect(fromString).toBe(`<style>${fromString.slice(7, fromString.indexOf('</style>'))}</style>${fromReact}`);
      }
    });
  }
});

describe('packaging', () => {
  test('src/react/invoice.css is generated from the stylesheet renderHtml inlines', () => {
    expect(readFileSync(join(root, 'src/react/invoice.css'), 'utf8')).toBe(reactCss());
  });

  test('package.json exposes the subpath and keeps React an optional peer', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    expect(pkg.exports['./react']).toBe('./src/react/index.ts');
    expect(pkg.exports['./react/invoice.css']).toBe('./src/react/invoice.css');
    expect(pkg.peerDependenciesMeta.react.optional).toBe(true);
    expect(pkg.peerDependenciesMeta['react-dom'].optional).toBe(true);
    expect(pkg.dependencies.react).toBeUndefined();
  });

  /** Every module reachable through static or dynamic imports, by file path; bare specifiers as they are. */
  function importGraph(entry: string): Set<string> {
    const seen = new Set<string>();
    const todo = [entry];
    while (todo.length) {
      const file = todo.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      if (!file.startsWith('/')) continue;
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g)) {
        const spec = m[1]!;
        if (!spec.startsWith('.')) {
          seen.add(spec);
          continue;
        }
        const base = resolve(dirname(file), spec);
        const candidates = [base, base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx'), `${base}.ts`, join(base, 'index.ts')];
        const hit = candidates.find((c) => existsSync(c) && /\.(ts|tsx)$/.test(c));
        if (hit) todo.push(hit);
      }
    }
    return seen;
  }

  for (const entry of ['src/index.ts', 'src/server.ts', 'site/app.ts']) {
    test(`${entry} never reaches React`, () => {
      const graph = [...importGraph(join(root, entry))];
      expect(graph.length).toBeGreaterThan(5);
      expect(graph.filter((m) => /^react(-dom)?(\/|$)/.test(m) || m.includes('/src/react/'))).toEqual([]);
    });
  }

  test('the React entry does reach React (the graph walker works)', () => {
    expect([...importGraph(join(root, 'src/react/index.ts'))]).toContain('react');
  });
});
