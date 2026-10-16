import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { EXIT, type IO, main } from '../src/cli.js';
import { type CanonicalInvoice, escapeHtml, renderHtml, renderPdf } from '../src/index.js';
import { fixturePath, parseOne } from './helpers.js';

const peppol = await parseOne('peppol-bis3-invoice.xml');
const creditNote = await parseOne('peppol-bis3-creditnote.xml');
const xrechnung = await parseOne('xrechnung-ubl.xml');

/** Adds every optional part the renderers know about to a parsed invoice. */
function enrich(inv: CanonicalInvoice): CanonicalInvoice {
  const copy = structuredClone(inv) as unknown as Record<string, unknown>;
  const lines = copy.lines as Record<string, unknown>[];
  Object.assign(lines[0]!, {
    allowances: [{ amount: '1.00', reason: 'Line discount' }],
    charges: [{ amount: '2.00', reason: 'Line surcharge' }],
    item: {
      name: 'Shelf',
      description: 'Oak, 40 cm',
      sellerId: 'S-1',
      classifications: [],
      attributes: [{ name: 'Colour', value: 'Oak' }],
    },
    period: { start: '2026-09-01' },
    unitText: 'pieces',
  });
  Object.assign(copy, {
    issueTime: '10:30:00',
    payee: { name: 'Payee Ltd', identifier: { value: 'P-1', schemeId: '0088' }, legalRegistrationId: { value: 'R-1' } },
    taxRepresentative: { name: 'Rep AB', vatId: 'SE111', address: { city: 'Malmö', line1: 'Gatan 1' } },
    allowances: [{ amount: '5.00', reason: 'Early payment', reasonCode: '95', percentage: '2', vat: { categoryCode: 'S', rate: '25' } }],
    charges: [{ amount: '3.00', vat: { categoryCode: 'E' } }],
    vatBreakdown: [
      { taxableAmount: '10.00', taxAmount: '0.00', categoryCode: 'E', exemptionReason: 'Exempt', exemptionReasonCode: 'VATEX-EU-132' },
      { taxableAmount: '10.00', taxAmount: '2.50', categoryCode: 'S' },
    ],
    payments: [
      {
        meansCode: '30',
        creditTransfers: [{ accountId: 'SE45 5000' }],
        card: { primaryAccountNumber: '1234', holderName: 'A. Holder', network: 'VISA' },
        directDebit: { mandateId: 'M-1', creditorId: 'C-1', debitedAccountId: 'D-1' },
      },
    ],
    paymentSchedule: [{ dueDate: '2026-12-01', amount: '10.00', description: 'First half' }],
    attachments: [
      { kind: 'embedded', id: '1', description: 'Time sheet', mimeCode: 'text/plain', filename: 'timesheet.txt', base64: 'AAAA' },
      { kind: 'external', id: '2', description: 'Specification', uri: 'https://example.com/spec.pdf' },
      { kind: 'reference', id: '3', typeCode: 'ZZZ' },
    ],
  });
  return copy as unknown as CanonicalInvoice;
}

const rich = enrich(peppol);

function manyLines(inv: CanonicalInvoice, n: number): CanonicalInvoice {
  const copy = structuredClone(inv) as unknown as { lines: unknown[] };
  copy.lines = Array.from({ length: n }, (_, i) => ({
    id: String(i + 1),
    quantity: '1',
    unitCode: 'C62',
    netAmount: '10.00',
    allowances: [],
    charges: [],
    price: { net: '10.00' },
    vat: { categoryCode: 'S', rate: '25' },
    item: { name: `Item number ${i + 1}`, classifications: [], attributes: [] },
  }));
  return copy as unknown as CanonicalInvoice;
}

const headings = (html: string) => [...html.matchAll(/<h2 id="h\d+">(.*?)<\/h2>/g)].map((m) => m[1]);

describe('renderHtml structure', () => {
  const html = renderHtml(peppol);

  test('is a complete document with a language, a title and a heading', () => {
    expect(html.startsWith('<!doctype html><html lang="en">')).toBe(true);
    expect(html).toContain('<title>Invoice INV-2026-1042</title>');
    expect(html).toContain('<h1>Invoice INV-2026-1042</h1>');
    expect(html).toContain('<main>');
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
  });

  test('has a heading for each section', () => {
    expect(headings(html)).toEqual([
      'Seller',
      'Buyer',
      'Delivery',
      'References and dates',
      'Lines',
      'Allowances',
      'Charges',
      'VAT breakdown',
      'Totals',
      'Payment',
      'Notes',
      'Attachments',
    ]);
  });

  test('shows seller and buyer with their identifiers', () => {
    expect(html).toContain('Snickeri Exempel AB');
    expect(html).toContain('7300010000002 (0088)');
    expect(html).toContain('SE556000000101');
    expect(html).toContain('Storgatan 1, Box 12, 11122 Stockholm, SE');
    expect(html).toContain('Uppsala kommun');
    expect(html).toContain('SE212000000101');
  });

  test('shows references and dates', () => {
    for (const s of [
      '2026-10-15',
      '2026-11-14',
      '2026-09-01 - 2026-09-30',
      '4025:ANNA',
      'PO-1001',
      'K-2026-1',
      'INV-2026-0999 (2026-09-30)',
    ]) {
      expect(html).toContain(s);
    }
  });

  test('shows every line, with quantity, price and net amount', () => {
    expect(html).toContain('Hyllkonsol');
    expect(html).toContain('Skruv 4x40');
    expect(html).toContain('<td class="num">10 H87</td><td class="num">25.00</td><td>S 25%</td><td class="num">250.00</td>');
    expect((html.match(/<tbody>/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  test('keeps the price basis next to the unit price', () => {
    expect(html).toContain('<td class="num">45.00 / 100 C62</td>');
    expect(html).toContain('<td class="num">25.00</td>');
  });

  test('shows withholding and split-payment deductions before the amount due', () => {
    const w = structuredClone(peppol) as unknown as { totals: Record<string, string> };
    w.totals.withholdingTotal = '12.00';
    w.totals.splitPaymentVat = '34.00';
    const out = renderHtml(w as unknown as CanonicalInvoice);
    expect(out).toContain('Withholding deducted</dt><dd>12.00 SEK');
    expect(out).toContain('(split payment)</dt><dd>34.00 SEK');
    expect(out.indexOf('12.00 SEK')).toBeLessThan(out.indexOf('Amount due'));
  });

  test('shows allowances and charges', () => {
    expect(html).toContain('Volymrabatt - 95');
    expect(html).toContain('<td class="num">100.00</td>');
    expect(html).toContain('Frakt - FC');
    expect(html).toContain('<td class="num">50.00</td>');
  });

  test('has one VAT row per breakdown entry', () => {
    expect(html).toContain('<td>S</td><td class="num">25%</td><td class="num">2550.00</td><td class="num">637.50</td>');
    expect(html).toContain('<td>S</td><td class="num">12%</td><td class="num">360.00</td><td class="num">43.20</td>');
  });

  test('shows the totals and the amount due', () => {
    for (const s of ['2960.00 SEK', '2910.00 SEK', '680.70 SEK', '3590.70 SEK', '500.00 SEK']) expect(html).toContain(s);
    expect(html).toContain('<dd class="due">3091.00 SEK</dd>');
  });

  test('shows payment details, notes and attachment names', () => {
    expect(html).toContain('30 dagar netto');
    expect(html).toContain('Bankgiro / 30');
    expect(html).toContain('4711000123');
    expect(html).toContain('1234567');
    expect(html).toContain('Leverans enligt avtal K-2026-1');
    expect(html).toContain('AAI: Leverans');
    expect(html).toContain('tidrapport.txt (text/plain) Tidrapport september');
    expect(html).not.toContain('SGVsbG8');
  });

  test('is self-contained: no scripts, links, images or external resources', () => {
    expect(html).not.toMatch(/<script|<link|<img|<iframe|<object|<embed|<a /i);
    expect(html).not.toMatch(/\b(src|href)=|url\(|@import/i);
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('@media print');
  });

  test('is accessible: labelled sections, column headers with scope', () => {
    expect(html).toContain('<section aria-labelledby="h');
    expect(html).toContain('<th scope="col"');
    expect(html).toContain('<meta name="viewport"');
  });

  test('a credit note says so', () => {
    const cn = renderHtml(creditNote);
    expect(cn).toContain(`<h1>Credit note ${creditNote.id}</h1>`);
  });

  test('renders another syntax too', () => {
    const x = renderHtml(xrechnung);
    expect(x).toContain(`<h1>Invoice ${escapeHtml(xrechnung.id)}</h1>`);
    expect(x).toContain(escapeHtml(xrechnung.totals.payable));
    expect(headings(x)).toContain('VAT breakdown');
    expect(headings(x)).toContain('Totals');
  });
});

describe('renderHtml options', () => {
  test('German and French labels, language attribute', () => {
    const de = renderHtml(peppol, { lang: 'de' });
    expect(de).toContain('<html lang="de">');
    expect(de).toContain('<h1>Rechnung INV-2026-1042</h1>');
    expect(headings(de)).toContain('Umsatzsteuer-Aufschlüsselung');
    expect(de).toContain('Zahlbetrag');
    const fr = renderHtml(creditNote, { lang: 'fr-CH' });
    expect(fr).toContain('<html lang="fr-CH">');
    expect(fr).toContain('Avoir');
    expect(headings(fr)).toContain('Ventilation de la TVA');
  });

  test('an unknown language keeps English labels; a hostile one cannot reach the attribute', () => {
    expect(renderHtml(peppol, { lang: 'xx' })).toContain('<html lang="xx">');
    expect(renderHtml(peppol, { lang: 'xx' })).toContain('Amount due');
    const bad = renderHtml(peppol, { lang: '"><script>alert(1)</script>' });
    expect(bad).toContain('<html lang="en">');
    expect(bad).not.toContain('<script');
  });

  test('standalone: false returns an embeddable fragment', () => {
    const frag = renderHtml(peppol, { standalone: false });
    expect(frag.startsWith('<style>')).toBe(true);
    expect(frag).toContain('<article class="einvoice" lang="en">');
    expect(frag).not.toContain('<html');
    expect(frag).not.toContain('<!doctype');
  });

  test('an invoice without lines says so', () => {
    const none = structuredClone(peppol) as unknown as { lines: unknown[]; vatBreakdown: unknown[] };
    none.lines = [];
    none.vatBreakdown = [];
    const html = renderHtml(none as unknown as CanonicalInvoice);
    expect(html).toContain('This document carries no invoice lines.');
  });
});

describe('renderHtml with every optional part', () => {
  const html = renderHtml(rich);
  test('parties, delivery, payee, tax representative', () => {
    for (const h of ['Payee', 'Tax representative', 'Delivery']) expect(headings(html)).toContain(h);
    expect(html).toContain('Payee Ltd');
    expect(html).toContain('Rep AB');
    expect(html).toContain('2026-10-15 10:30:00');
  });
  test('line details', () => {
    expect(html).toContain('Oak, 40 cm');
    expect(html).toContain('Colour: Oak');
    expect(html).toContain('Allowances: Line discount -1.00');
    expect(html).toContain('Charges: Line surcharge +2.00');
  });
  test('document allowances with percentage, exemptions, payments', () => {
    expect(html).toContain('Early payment - 95 (2%)');
    expect(html).toContain('VATEX-EU-132 - Exempt');
    expect(html).toContain('VISA 1234 A. Holder');
    expect(html).toContain('M-1 / C-1 / D-1');
    expect(html).toContain('2026-12-01 - 10.00 SEK - First half');
  });
  test('attachments are listed by name and never linked', () => {
    expect(html).toContain('timesheet.txt (text/plain) Time sheet');
    expect(html).toContain('2 - Specification - https://example.com/spec.pdf');
    expect(html).toContain('<li>3 - ZZZ</li>');
    expect(html).not.toMatch(/href=/);
  });
});

describe('renderHtml escapes untrusted input', () => {
  const PAYLOAD = `<script>alert(1)</script>"><img src=x onerror=alert(1)>' onmouseover='alert(1)\` autofocus onfocus=alert(1) <!-- --> &amp; &#x3C;`;

  /** Every string in the invoice becomes a hostile string that names the field it sits in. */
  function poison(value: unknown, path: string): unknown {
    if (typeof value === 'string') return `${PAYLOAD}[${path}]`;
    if (Array.isArray(value)) return value.map((v, i) => poison(v, `${path}.${i}`));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === 'kind' ? v : poison(v, `${path}.${k}`)]));
    }
    return value;
  }

  const hostile = poison(rich, 'inv') as CanonicalInvoice;
  const ALLOWED_TAGS = new Set([
    'html',
    'head',
    'meta',
    'title',
    'body',
    'main',
    'style',
    'article',
    'header',
    'h1',
    'h2',
    'p',
    'div',
    'section',
    'dl',
    'dt',
    'dd',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'ul',
    'li',
    'br',
  ]);
  const ALLOWED_ATTRS = new Set(['lang', 'id', 'class', 'scope', 'charset', 'name', 'content', 'http-equiv', 'aria-labelledby']);

  for (const [name, html] of [
    ['standalone', renderHtml(hostile)],
    ['fragment', renderHtml(hostile, { standalone: false })],
    ['German', renderHtml(hostile, { lang: 'de' })],
  ] as const) {
    test(`${name}: no raw markup from any text field survives`, () => {
      expect(html).not.toContain('<script');
      expect(html).not.toContain('<img');
      expect(html).not.toContain('<!--');
      expect(html).not.toContain('"><img');
      expect(html).not.toContain("' onmouseover='");
      expect(html).not.toMatch(/<script|<\/script/i);
    });

    test(`${name}: only our own tags and attributes appear`, () => {
      const body = html.replace(/<style>.*?<\/style>/s, '');
      for (const m of body.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g)) {
        expect(ALLOWED_TAGS.has(m[1]!.toLowerCase())).toBe(true);
        for (const a of m[2]!.matchAll(/\s([a-zA-Z-]+)=/g)) expect(ALLOWED_ATTRS.has(a[1]!)).toBe(true);
        // Attribute values are quoted with " and contain no quote of their own.
        expect(m[2]!.replace(/\s[a-zA-Z-]+="[^"]*"/g, '').trim()).toBe('');
      }
    });
  }

  test('every field shows up escaped, so nothing is silently dropped', () => {
    const html = renderHtml(hostile);
    const escaped = escapeHtml(PAYLOAD);
    for (const path of [
      'inv.id',
      'inv.seller.name',
      'inv.buyer.name',
      'inv.buyer.address.city',
      'inv.payee.name',
      'inv.notes.0.text',
      'inv.paymentTerms',
      'inv.lines.0.item.name',
      'inv.vatBreakdown.0.exemptionReason',
      'inv.attachments.0.filename',
      'inv.attachments.1.uri',
      'inv.payments.0.creditTransfers.0.accountId',
    ]) {
      expect(html).toContain(`${escaped}[${path}]`);
    }
  });

  test('escapeHtml covers the five dangerous characters plus backtick and drops control characters', () => {
    expect(escapeHtml(`<>&"'\``)).toBe('&lt;&gt;&amp;&quot;&#39;&#96;');
    expect(escapeHtml('a\u0000b\u0007c\u001fd\u007fe\tf\ng')).toBe('abcde\tf\ng');
  });

  test('the PDF renderer also survives the hostile invoice', async () => {
    const pdf = await PDFDocument.load(await renderPdf(hostile));
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});

describe('renderPdf', () => {
  test('produces an A4 PDF that parses back, with the title and language', async () => {
    const bytes = await renderPdf(peppol);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(pdf.getPageCount()).toBeLessThanOrEqual(2);
    const { width, height } = pdf.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
    expect(pdf.getTitle()).toBe('Invoice INV-2026-1042');
    expect(pdf.getProducer()).toBe('eu-einvoice-canonical');
  });

  test('a 200-line invoice paginates, and more lines need more pages', async () => {
    const two = await PDFDocument.load(await renderPdf(manyLines(peppol, 200)));
    // About 46 single-line rows fit on a page and the header blocks take most of the first one.
    expect(two.getPageCount()).toBeGreaterThanOrEqual(5);
    expect(two.getPageCount()).toBeLessThanOrEqual(7);
    const four = await PDFDocument.load(await renderPdf(manyLines(peppol, 400)));
    expect(four.getPageCount()).toBeGreaterThan(two.getPageCount() + 3);
    const one = await PDFDocument.load(await renderPdf(manyLines(peppol, 5)));
    expect(one.getPageCount()).toBeLessThanOrEqual(2);
  });

  test('is deterministic', async () => {
    const a = await renderPdf(rich);
    const b = await renderPdf(rich);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  test('wraps long text and unbroken words, and replaces characters the standard fonts cannot draw', async () => {
    const odd = structuredClone(rich) as unknown as {
      notes: { text: string }[];
      paymentTerms: string;
      lines: { item: { name: string; description: string } }[];
    };
    odd.notes = [{ text: `${'lorem ipsum '.repeat(300)}${'x'.repeat(2000)} 日本語 Ωmega 😀 € ñ\u0000\ttab` }];
    odd.paymentTerms = 'W'.repeat(5000);
    odd.lines[0]!.item.description = 'row that is far taller than a page '.repeat(900);
    const pdf = await PDFDocument.load(await renderPdf(odd as unknown as CanonicalInvoice));
    expect(pdf.getPageCount()).toBeGreaterThan(3);
  }, 30000);

  test('a very long invoice number wraps across pages instead of running off the page', async () => {
    const long = structuredClone(peppol) as unknown as { id: string };
    long.id = 'N'.repeat(6000);
    const pdf = await PDFDocument.load(await renderPdf(long as unknown as CanonicalInvoice));
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  }, 30000);

  test('a very long unbroken string is wrapped in linear time', async () => {
    const big = structuredClone(peppol) as unknown as { notes: { text: string }[] };
    big.notes = [{ text: 'Z'.repeat(300_000) }];
    const started = performance.now();
    const pdf = await PDFDocument.load(await renderPdf(big as unknown as CanonicalInvoice), { updateMetadata: false });
    expect(pdf.getPageCount()).toBeGreaterThan(40);
    expect(performance.now() - started).toBeLessThan(60000);
  }, 90000);

  test('a very tall table row continues on the next page', async () => {
    const tall = structuredClone(peppol) as unknown as { lines: { note: string }[] };
    tall.lines[1]!.note = 'word '.repeat(4000);
    const pdf = await PDFDocument.load(await renderPdf(tall as unknown as CanonicalInvoice));
    expect(pdf.getPageCount()).toBeGreaterThan(2);
  });

  test('German and French labels do not break the encoding', async () => {
    for (const lang of ['de', 'fr', 'xx']) {
      const pdf = await PDFDocument.load(await renderPdf(rich, { lang }));
      expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    }
    expect((await PDFDocument.load(await renderPdf(creditNote, { lang: 'fr' }))).getTitle()).toBe(`Avoir ${creditNote.id}`);
  });

  test('an invoice without lines, VAT rows or a valid date still renders', async () => {
    const bare = structuredClone(peppol) as unknown as { lines: unknown[]; vatBreakdown: unknown[]; issueDate: string };
    bare.lines = [];
    bare.vatBreakdown = [];
    bare.issueDate = 'not a date';
    const pdf = await PDFDocument.load(await renderPdf(bare as unknown as CanonicalInvoice));
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(pdf.getPageCount()).toBeLessThanOrEqual(2);
  });
});

describe('einvoice render', () => {
  const dir = mkdtempSync(join(tmpdir(), 'einvoice-render-'));
  function io() {
    const out: string[] = [];
    const bytes: Uint8Array[] = [];
    const errs: string[] = [];
    const sink: IO = {
      stdout: (t) => out.push(t),
      stdoutBytes: (b) => bytes.push(b),
      stderr: (l) => errs.push(l),
      readStdin: async () => new Uint8Array(),
    };
    return { sink, out, bytes, errs };
  }
  const file = fixturePath('peppol-bis3-invoice.xml');
  const file2 = fixturePath('peppol-bis3-creditnote.xml');

  test('html goes to stdout', async () => {
    const t = io();
    expect(await main(['render', '--as', 'html', file], t.sink)).toBe(EXIT.ok);
    expect(t.out.join('')).toContain('<h1>Invoice INV-2026-1042</h1>');
  });

  test('--lang and --out write a file', async () => {
    const t = io();
    const out = join(dir, 'one.html');
    expect(await main(['render', '--as', 'html', '--lang', 'de', '--out', out, file], t.sink)).toBe(EXIT.ok);
    expect(readFileSync(out, 'utf8')).toContain('<h1>Rechnung INV-2026-1042</h1>');
    expect(t.out).toEqual([]);
  });

  test('pdf to a file and to stdout bytes', async () => {
    const t = io();
    const out = join(dir, 'one.pdf');
    expect(await main(['render', '--as=pdf', '--out', out, '--quiet', file], t.sink)).toBe(EXIT.ok);
    expect((await PDFDocument.load(readFileSync(out))).getPageCount()).toBeGreaterThanOrEqual(1);
    const u = io();
    expect(await main(['render', '--as', 'pdf', file], u.sink)).toBe(EXIT.ok);
    expect(new TextDecoder().decode(u.bytes[0]!.slice(0, 5))).toBe('%PDF-');
    const noBinary = io();
    delete noBinary.sink.stdoutBytes;
    expect(await main(['render', '--as', 'pdf', file], noBinary.sink)).toBe(EXIT.internal);
  });

  test('--out naming an existing directory (or ending in a slash) gets <invoice-id>.<format> inside it', async () => {
    const existing = join(dir, 'existing');
    mkdirSync(existing);
    const t = io();
    expect(await main(['render', '--as', 'html', '--out', existing, '--quiet', file], t.sink)).toBe(EXIT.ok);
    expect(readdirSync(existing)).toEqual(['INV-2026-1042.html']);
    const slash = join(dir, 'fresh') + '/';
    expect(await main(['render', '--as', 'pdf', '--out', slash, '--quiet', file], io().sink)).toBe(EXIT.ok);
    expect(readdirSync(join(dir, 'fresh'))).toEqual(['INV-2026-1042.pdf']);
  });

  test('several invoices need a directory for --out, or pdf refuses stdout', async () => {
    const t = io();
    const out = join(dir, 'many');
    expect(await main(['render', '--as', 'html', '--out', out, '--quiet', file, file2], t.sink)).toBe(EXIT.ok);
    expect(readdirSync(out).sort()).toHaveLength(2);
    const u = io();
    expect(await main(['render', '--as', 'pdf', file, file2], u.sink)).toBe(EXIT.usage);
    const h = io();
    expect(await main(['render', '--as', 'html', file, file2], h.sink)).toBe(EXIT.ok);
    expect(h.out).toHaveLength(2);
  });

  test('usage errors', async () => {
    expect(await main(['render', file], io().sink)).toBe(EXIT.usage);
    expect(await main(['render', '--as', 'docx', file], io().sink)).toBe(EXIT.usage);
    expect(await main(['render', '--as', 'html', '--lang', 'x y', file], io().sink)).toBe(EXIT.usage);
    expect(await main(['render', '--as', 'html'], io().sink)).toBe(EXIT.usage);
  });

  test('help mentions the command', async () => {
    const t = io();
    await main(['--help'], t.sink);
    expect(t.out.join('')).toContain('einvoice render  --as html|pdf');
  });
});
