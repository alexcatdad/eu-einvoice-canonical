import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { EXIT, type IO, main } from '../src/cli.js';
import { type CanonicalInvoice, escapeHtml, renderHtml, renderPdf } from '../src/index.js';
import { fixturePath, parseOne } from './helpers.js';
import { enrich, expectOnlyOwnMarkup, PAYLOAD, poison } from './render-helpers.js';

const peppol = await parseOne('peppol-bis3-invoice.xml');
const creditNote = await parseOne('peppol-bis3-creditnote.xml');
const xrechnung = await parseOne('xrechnung-ubl.xml');

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

const headings = (html: string) => [...html.matchAll(/<h2 class="einvoice-h2" id="[^"]+">(.*?)<\/h2>/g)].map((m) => m[1]);
/** Intl puts no-break and narrow no-break spaces in amounts; the assertions use plain spaces. */
const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');

describe('renderHtml structure', () => {
  const html = plain(renderHtml(peppol));

  test('is a complete document with a language, a title and a heading', () => {
    expect(html.startsWith('<!doctype html><html lang="en">')).toBe(true);
    expect(html).toContain('<title>Invoice INV-2026-1042</title>');
    expect(html).toContain('<h1 class="einvoice-title" id="einvoice-title">Invoice INV-2026-1042</h1>');
    expect(html).toContain('<main>');
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
  });

  test('has a heading for each section, in reading order', () => {
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

  test('the header carries the key dates and the amount due, emphasised', () => {
    const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
    expect(header).toContain('<dt>Issue date</dt><dd><time dateTime="2026-10-15" title="2026-10-15">Oct 15, 2026</time></dd>');
    expect(header).toContain('<dt>Due date</dt><dd><time dateTime="2026-11-14" title="2026-11-14">Nov 14, 2026</time></dd>');
    expect(header).toContain('<div class="einvoice-due"><dt>Amount due</dt><dd>SEK 3,091.00</dd></div>');
    expect(header).not.toContain('einvoice-badge');
  });

  test('parties: name, address on separate lines with the country spelled out, labelled identifiers', () => {
    expect(html).toContain('<p class="einvoice-party-name">Snickeri Exempel AB</p>');
    expect(html).toContain('<address class="einvoice-address">Storgatan 1<br/>Box 12<br/>11122 Stockholm<br/>Sweden</address>');
    expect(html).toContain('<dt>VAT ID</dt><dd>SE556000000101</dd>');
    expect(html).toContain('<dt>Identifier (GLN)</dt><dd><span title="0088">7300010000002</span></dd>');
    expect(html).toContain('<dt>Company registration (Organisationsnummer)</dt><dd><span title="0007">5560000001</span></dd>');
    expect(html).toContain('<dt>Email</dt><dd>faktura@snickeri.example</dd>');
    expect(html).toContain('Uppsala kommun');
    expect(html).toContain('SE212000000101');
  });

  test('shows references and dates', () => {
    for (const s of [
      '<dt>Buyer reference</dt><dd>4025:ANNA</dd>',
      '<dt>Purchase order</dt><dd>PO-1001</dd>',
      '<dt>Contract</dt><dd>K-2026-1</dd>',
      '<span title="2026-09-01/2026-09-30">Sep 1, 2026 – Sep 30, 2026</span>',
      'INV-2026-0999 (Sep 30, 2026)',
    ]) {
      expect(html).toContain(s);
    }
  });

  test('shows every line, with quantity and unit name, price and net amount', () => {
    expect(html).toContain('<p class="einvoice-item">Hyllkonsol</p><p>Monterade på plats</p>');
    expect(html).toContain('Skruv 4x40');
    expect(html).toContain(
      '<td class="einvoice-num"><span title="H87">10 pcs</span></td><td class="einvoice-num">25.00</td><td class="einvoice-num"><span title="S – Standard rate">25%</span></td><td class="einvoice-num">250.00</td>',
    );
    expect(html).toContain('<span title="HUR">2 hr</span>');
    expect(html).toContain('<td class="einvoice-num">1,900.00</td>');
    expect(html).toContain('<th class="einvoice-num" scope="col">Unit price (SEK)</th>');
  });

  test('keeps the price basis next to the unit price', () => {
    expect(html).toContain('<td class="einvoice-num">45.00<br/><span class="einvoice-basis">per 100 pcs</span></td>');
    expect(html).toContain('<span title="C62">1,000 pcs</span>');
  });

  test('shows withholding and split-payment deductions before the amount due', () => {
    const w = structuredClone(peppol) as unknown as { totals: Record<string, string> };
    w.totals.withholdingTotal = '12.00';
    w.totals.splitPaymentVat = '34.00';
    const out = plain(renderHtml(w as unknown as CanonicalInvoice));
    expect(out).toContain('Withholding deducted</dt><dd>SEK 12.00');
    expect(out).toContain('(split payment)</dt><dd>SEK 34.00');
    expect(out.indexOf('SEK 12.00')).toBeLessThan(out.indexOf('<div class="einvoice-total einvoice-total--due">'));
  });

  test('shows allowances and charges', () => {
    expect(html).toContain('<td>Volymrabatt (95)</td>');
    expect(html).toContain('<td class="einvoice-num">100.00</td>');
    expect(html).toContain('<td>Frakt (FC)</td>');
    expect(html).toContain('<td class="einvoice-num">50.00</td>');
  });

  test('has one VAT row per breakdown entry, and no exemption column when nothing is exempt', () => {
    expect(html).toContain(
      '<tr><td><span title="S">Standard rate</span></td><td class="einvoice-num">25%</td><td class="einvoice-num">2,550.00</td><td class="einvoice-num">637.50</td></tr>',
    );
    expect(html).toContain(
      '<tr><td><span title="S">Standard rate</span></td><td class="einvoice-num">12%</td><td class="einvoice-num">360.00</td><td class="einvoice-num">43.20</td></tr>',
    );
    expect(html).not.toContain('Exemption reason');
  });

  test('shows the totals with subtotals and the amount due emphasised', () => {
    for (const s of ['SEK 2,960.00', 'SEK 2,910.00', 'SEK 680.70', 'SEK 3,590.70', 'SEK 500.00']) expect(html).toContain(s);
    expect(html).toContain('<div class="einvoice-total einvoice-total--subtotal"><dt>Total without VAT</dt><dd>SEK 2,910.00</dd></div>');
    expect(html).toContain('<div class="einvoice-total einvoice-total--due"><dt>Amount due</dt><dd>SEK 3,091.00</dd></div>');
  });

  test('shows payment details, notes and attachment names', () => {
    expect(html).toContain('<h3 class="einvoice-h3">Credit transfer (Bankgiro)</h3>');
    expect(html).toContain('<dt>Account</dt><dd><span class="einvoice-code">1234567</span></dd>');
    expect(html).toContain('<dt>Payment reference</dt><dd><span class="einvoice-code">4711000123</span></dd>');
    expect(html).toContain('<h3 class="einvoice-h3">Payment terms</h3><p>30 dagar netto</p>');
    expect(html).toContain('<p class="einvoice-note-subject">AAI</p><p>Leverans enligt avtal K-2026-1</p>');
    expect(html).toContain('<li>tidrapport.txt (text/plain) Tidrapport september</li>');
    expect(html).not.toContain('SGVsbG8');
  });

  test('is self-contained: no scripts, links, images or external resources', () => {
    expect(html).not.toMatch(/<script|<link|<img|<iframe|<object|<embed|<a /i);
    expect(html).not.toMatch(/\b(src|href)=|url\(|@import/i);
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('@media print');
  });

  test('is accessible: labelled sections, column headers with scope', () => {
    expect(html).toContain('<article class="einvoice" lang="en" aria-labelledby="einvoice-title">');
    expect(html).toContain('<section class="einvoice-section einvoice-lines" aria-labelledby="einvoice-lines">');
    expect(html).toContain('<th scope="col"');
    expect(html).toContain('<meta name="viewport"');
  });

  test('a credit note says so: badge, title, class and "amount credited"', () => {
    const cn = plain(renderHtml(creditNote));
    expect(cn).toContain('<article class="einvoice einvoice--credit"');
    expect(cn).toContain('<p class="einvoice-badge">Credit note</p>');
    expect(cn).toContain(`<h1 class="einvoice-title" id="einvoice-title">Credit note ${creditNote.id}</h1>`);
    expect(cn).toContain('<div class="einvoice-due"><dt>Amount credited</dt><dd>SEK 250.00</dd></div>');
  });

  test('renders another syntax too', () => {
    const x = plain(renderHtml(xrechnung));
    expect(x).toContain(`Invoice ${escapeHtml(xrechnung.id)}</h1>`);
    expect(x).toContain('€1,190.00');
    expect(headings(x)).toContain('VAT breakdown');
    expect(headings(x)).toContain('Totals');
  });
});

describe('renderHtml options', () => {
  test('German and French labels, number and date formats, language attribute', () => {
    const de = plain(renderHtml(peppol, { lang: 'de' }));
    expect(de).toContain('<html lang="de">');
    expect(de).toContain('>Rechnung INV-2026-1042</h1>');
    expect(headings(de)).toContain('Umsatzsteuer-Aufschlüsselung');
    expect(de).toContain('<dt>Zahlbetrag</dt><dd>3.091,00 SEK</dd>');
    expect(de).toContain('<time dateTime="2026-10-15" title="2026-10-15">15.10.2026</time>');
    expect(de).toContain('<td class="einvoice-num">1.900,00</td>');
    expect(de).toContain('<span title="S – Regelsatz">25 %</span>');
    expect(de).toContain('Schweden');
    const fr = plain(renderHtml(creditNote, { lang: 'fr-CH' }));
    expect(fr).toContain('<html lang="fr-CH">');
    expect(fr).toContain('Avoir');
    expect(headings(fr)).toContain('Ventilation de la TVA');
  });

  test('every site language has its own labels', () => {
    const due: Record<string, string> = {
      en: 'Amount due',
      de: 'Zahlbetrag',
      fr: 'Net à payer',
      it: 'Importo da pagare',
      es: 'Importe a pagar',
      nl: 'Te betalen bedrag',
      pl: 'Do zapłaty',
      ro: 'De plată',
    };
    for (const [lang, label] of Object.entries(due)) {
      expect(renderHtml(peppol, { lang })).toContain(`<div class="einvoice-due"><dt>${label}</dt>`);
    }
  });

  test('an unknown language keeps English labels; a hostile one cannot reach the attribute', () => {
    expect(renderHtml(peppol, { lang: 'xx' })).toContain('<html lang="xx">');
    expect(renderHtml(peppol, { lang: 'xx' })).toContain('Amount due');
    const bad = renderHtml(peppol, { lang: '"><script>alert(1)</script>' });
    expect(bad).toContain('<html lang="en">');
    expect(bad).not.toContain('<script');
    // Well-formed but not a locale Intl accepts: labels and formats fall back to English.
    expect(renderHtml(peppol, { lang: 'en-12' })).toContain('<html lang="en-12">');
  });

  test('standalone: false returns an embeddable fragment', () => {
    const frag = renderHtml(peppol, { standalone: false });
    expect(frag.startsWith('<style>')).toBe(true);
    expect(frag).toContain('<article class="einvoice" lang="en"');
    expect(frag).not.toContain('<html');
    expect(frag).not.toContain('<!doctype');
  });

  test('an invoice without lines says so', () => {
    const none = structuredClone(peppol) as unknown as { lines: unknown[]; vatBreakdown: unknown[] };
    none.lines = [];
    none.vatBreakdown = [];
    const html = renderHtml(none as unknown as CanonicalInvoice);
    expect(html).toContain('<p class="einvoice-empty">This document carries no invoice lines.</p>');
    expect(headings(html)).not.toContain('VAT breakdown');
  });
});

describe('renderHtml with every optional part', () => {
  const html = plain(renderHtml(rich));
  test('parties, delivery, payee, tax representative', () => {
    for (const h of ['Payee', 'Tax representative', 'Delivery']) expect(headings(html)).toContain(h);
    expect(html).toContain('<p class="einvoice-party-name">Payee Ltd</p>');
    expect(html).toContain('<address class="einvoice-address">Gatan 1<br/>Malmö</address>');
    expect(html).toContain('<time dateTime="2026-10-15" title="2026-10-15T10:30:00">Oct 15, 2026, 10:30</time>');
  });
  test('line details', () => {
    expect(html).toContain('<p>Oak, 40 cm</p>');
    expect(html).toContain('Seller&#x27;s item no.: S-1 · Colour: Oak · Sep 1, 2026 – …');
    expect(html).toContain(
      '<p class="einvoice-adjustments">Allowance (Line discount): −SEK 1.00<br/>Charge (Line surcharge): +SEK 2.00</p>',
    );
    expect(html).toContain('<span title="H87">10 pieces</span>');
  });
  test('document allowances with percentage, exemptions, payments', () => {
    expect(html).toContain('<td>Early payment (95) · 2%</td>');
    expect(html).toContain('<td>Exempt (VATEX-EU-132)</td>');
    expect(html).toContain('<th scope="col">Exemption reason</th>');
    expect(html).toContain('<dt>Card</dt><dd>VISA …1234</dd>');
    expect(html).toContain('<dt>Mandate reference</dt><dd><span class="einvoice-code">M-1</span></dd>');
    expect(html).toContain('<dt>Debited account</dt><dd><span class="einvoice-code">D-1</span></dd>');
    expect(html).toContain(
      '<tr><td><time dateTime="2026-12-01" title="2026-12-01">Dec 1, 2026</time></td><td class="einvoice-num">10.00</td><td>First half</td></tr>',
    );
  });
  test('an IBAN is grouped in fours and labelled as one', () => {
    const iban = structuredClone(rich) as unknown as { payments: { creditTransfers: { accountId: string }[] }[] };
    iban.payments[0]!.creditTransfers[0]!.accountId = 'DE89370400440532013000';
    expect(renderHtml(iban as unknown as CanonicalInvoice)).toContain(
      '<dt>IBAN</dt><dd><span class="einvoice-code">DE89 3704 0044 0532 0130 00</span></dd>',
    );
  });
  test('notes with line breaks and "-" items become paragraphs and lists', () => {
    const n = structuredClone(rich) as unknown as { notes: { text: string }[] };
    n.notes = [{ text: 'Delivery terms:\n- packed on pallets\n- signed on receipt\n\nThank you' }];
    expect(renderHtml(n as unknown as CanonicalInvoice)).toContain(
      '<div class="einvoice-note"><p>Delivery terms:</p><ul><li>packed on pallets</li><li>signed on receipt</li></ul><p>Thank you</p></div>',
    );
  });
  test('attachments are listed by name and never linked', () => {
    expect(html).toContain('<li>timesheet.txt (text/plain) Time sheet</li>');
    expect(html).toContain('<li>2 – Specification – https://example.com/spec.pdf</li>');
    expect(html).toContain('<li>3 – ZZZ</li>');
    expect(html).not.toMatch(/href=/);
  });
});

describe('renderHtml escapes untrusted input', () => {
  const hostile = poison(rich, 'inv') as CanonicalInvoice;

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

    test(`${name}: only our own tags and attributes appear`, () => expectOnlyOwnMarkup(html.replace(/<style>.*?<\/style>/s, '')));
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
    expect(escapeHtml(`<>&"'\``)).toBe('&lt;&gt;&amp;&quot;&#x27;&#96;');
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
    expect(two.getPageCount()).toBeLessThanOrEqual(8);
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
    expect(t.out.join('')).toContain('>Invoice INV-2026-1042</h1>');
  });

  test('--lang and --out write a file', async () => {
    const t = io();
    const out = join(dir, 'one.html');
    expect(await main(['render', '--as', 'html', '--lang', 'de', '--out', out, file], t.sink)).toBe(EXIT.ok);
    expect(readFileSync(out, 'utf8')).toContain('>Rechnung INV-2026-1042</h1>');
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
