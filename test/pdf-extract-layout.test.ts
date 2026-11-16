import { describe, expect, test } from 'bun:test';
import { degrees, PDFDocument, PDFHexString, PDFName, type PDFPage, rgb, StandardFonts } from 'pdf-lib';
import { extractPdfInvoice } from '../src/pdf-extract/index.js';
import { groupLines } from '../src/pdf-extract/layout/group.js';
import { extractLayout, missingRuntimeFeatures, type PdfLimits, type TextRun } from '../src/pdf-extract/layout.js';

/** Synthetic PDFs only; every text below is generic vocabulary. */
async function pdf(draw: (page: PDFPage, font: Awaited<ReturnType<PDFDocument['embedFont']>>, doc: PDFDocument) => void | Promise<void>) {
  const doc = await PDFDocument.create();
  doc.setProducer('Synthetic Producer 1.0');
  doc.setCreator('Synthetic Creator');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  await draw(doc.addPage([595, 842]), font, doc);
  return doc.save();
}

const invoice = () =>
  pdf((page, font) => {
    const text = (s: string, x: number, y: number, size = 10) => page.drawText(s, { x, y, size, font });
    const rightAt = (s: string, end: number, y: number) => text(s, end - font.widthOfTextAtSize(s, 10), y);
    text('Faktura', 50, 790, 18);
    text('Exempel AB', 50, 760);
    text('Storgatan 1', 50, 748);
    text('Förfallodatum 2026-01-31', 350, 760);
    text('Beskrivning', 50, 600);
    text('Antal', 300, 600);
    text('Moms %', 380, 600);
    rightAt('Belopp', 545, 600);
    for (const [y, desc, qty, amount] of [
      [585, 'Konsulttjänst', '2', '1 000,00'],
      [570, 'Licens', '1', '250,00'],
    ] as const) {
      text(desc, 50, y);
      text(qty, 300, y);
      text('25', 380, y);
      rightAt(amount, 545, y);
    }
    text('för ett år', 50, 559);
    text('Att betala', 50, 500);
    rightAt('1 562,50', 545, 500);
    page.drawText('Org.nr 000000-0000', { x: 20, y: 300, size: 8, font, rotate: degrees(90) });
  });

describe('extractLayout', () => {
  test('records Producer and Creator and positions runs top-left in points', async () => {
    const doc = await extractLayout(await invoice());
    expect(doc.producer).toBe('Synthetic Producer 1.0');
    expect(doc.creator).toBe('Synthetic Creator');
    expect(doc.pageCount).toBe(1);
    expect(doc.encrypted).toBe(false);
    expect(doc.quality).toEqual({ supported: true, reasons: [] });
    const [page] = doc.pages;
    expect([page.width, page.height]).toEqual([595, 842]);
    const title = page.runs.find((r) => r.text === 'Faktura') as TextRun;
    expect(title).toMatchObject({ page: 1, x: 50, fontName: 'Helvetica', fontSize: 18, rotation: 0 });
    expect(title.y).toBeCloseTo(842 - 790 - 18 * 0.718, 0);
    expect(title.y + title.height).toBeCloseTo(842 - 790 + 18 * 0.207, 0);
    expect(page.runs.find((r) => r.text.startsWith('Org.nr'))?.rotation).toBe(90);
    expect(page.fonts).toEqual([{ name: 'Helvetica', type3: false }]);
  });

  test('groups lines and blocks', async () => {
    const [page] = (await extractLayout(await invoice())).pages;
    const texts = page.lines.map((l) => l.text);
    expect(texts).toContain('Exempel AB  Förfallodatum 2026-01-31');
    expect(page.lines.find((l) => l.text.startsWith('Exempel'))?.segments.map((s) => s.text)).toEqual([
      'Exempel AB',
      'Förfallodatum 2026-01-31',
    ]);
    const address = page.blocks.find((b) => b.lines.some((l) => l.text.startsWith('Exempel')));
    expect(address?.lines.map((l) => l.text)).toEqual(['Exempel AB  Förfallodatum 2026-01-31', 'Storgatan 1']);
    expect(page.lines.find((l) => l.rotation === 90)?.text).toBe('Org.nr 000000-0000');
  });

  test('finds the item table from its header columns and alignment', async () => {
    const [page] = (await extractLayout(await invoice())).pages;
    const table = page.tables.find((t) => t.header);
    expect(table?.columns.map((c) => [c.header, c.align])).toEqual([
      ['Beskrivning', 'left'],
      ['Antal', 'left'],
      ['Moms %', 'left'],
      ['Belopp', 'right'],
    ]);
    expect(table?.rows.map((r) => [r.cells, r.continuation])).toEqual([
      [['Konsulttjänst', '2', '25', '1 000,00'], false],
      [['Licens', '1', '25', '250,00'], false],
      [['för ett år', undefined, undefined, undefined], true],
    ]);
  });

  test('finds a table without a header from aligned edges, split by a vertical rule', async () => {
    const bytes = await pdf((page, font) => {
      for (const y of [400, 385, 370]) {
        page.drawText('Alfa', { x: 100, y, size: 10, font });
        page.drawText('Beta', { x: 100 + font.widthOfTextAtSize('Alfa', 10) + 7, y, size: 10, font });
        page.drawText('12,00', { x: 300, y, size: 10, font });
      }
      page.drawLine({ start: { x: 120.5, y: 360 }, end: { x: 120.5, y: 415 }, thickness: 0.5, color: rgb(0, 0, 0) });
    });
    const [page] = (await extractLayout(bytes)).pages;
    expect(page.rules).toEqual([{ page: 1, x: 120.5, y: 427, width: 0, height: 55 }]);
    expect(page.tables).toHaveLength(1);
    expect(page.tables[0].header).toBeUndefined();
    expect(page.tables[0].rows.map((r) => r.cells)).toEqual(Array(3).fill(['Alfa', 'Beta', '12,00']));
  });

  test('is deterministic and independent of run order', async () => {
    const bytes = await invoice();
    const first = await extractLayout(bytes);
    expect(await extractLayout(bytes)).toEqual(first);
    const runs = first.pages[0].runs;
    expect(groupLines([...runs].reverse())).toEqual(groupLines(runs));
  });

  test('applies /Rotate: coordinates follow the visible page', async () => {
    const bytes = await pdf((page, font) => {
      page.setRotation(degrees(90));
      page.drawText('Rotated page', { x: 50, y: 800, size: 10, font });
    });
    const [page] = (await extractLayout(bytes)).pages;
    expect([page.width, page.height]).toEqual([842, 595]);
    expect(page.runs[0].rotation).toBe(270);
  });

  test('never loads the optional native canvas package', async () => {
    await extractLayout(await invoice());
    expect(Object.keys(require.cache).filter((path) => path.includes('@napi-rs'))).toEqual([]);
  });
});

describe('text quality', () => {
  test('reports image-only and empty pages', async () => {
    const doc = await PDFDocument.create();
    const png = await doc.embedPng('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
    doc.addPage([200, 200]).drawImage(png, { x: 0, y: 0, width: 200, height: 100 });
    doc.addPage([200, 200]);
    const result = await extractLayout(await doc.save());
    expect(result.pages[0].imageCoverage).toBe(0.5);
    expect(result.quality).toEqual({
      supported: false,
      reasons: [
        { code: 'image-only', page: 1, detail: 'No text layer; images cover 50% of the page' },
        { code: 'no-text', page: 2, detail: 'No text layer and no images' },
      ],
    });
  });

  test('reports mojibake from a Type3 font without a Unicode mapping', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 200]);
    const ctx = doc.context;
    const procs: Record<string, ReturnType<typeof ctx.register>> = {};
    for (let i = 1; i <= 30; i++) procs[`g${i}`] = ctx.register(ctx.stream('100 0 0 0 100 100 d1 0 0 100 100 re f'));
    const font = ctx.register(
      ctx.obj({
        Type: 'Font',
        Subtype: 'Type3',
        FontBBox: [0, 0, 100, 100],
        FontMatrix: [0.01, 0, 0, 0.01, 0, 0],
        CharProcs: ctx.obj(procs),
        Encoding: ctx.obj({ Type: 'Encoding', Differences: [1, ...Object.keys(procs).map((n) => PDFName.of(n))] }),
        FirstChar: 1,
        LastChar: 30,
        Widths: Array(30).fill(100),
      }),
    );
    page.node.setFontDictionary(PDFName.of('F1'), font);
    const codes = Array.from({ length: 30 }, (_, i) => (i + 1).toString(16).padStart(2, '0')).join('');
    page.node.addContentStream(ctx.register(ctx.stream(`BT /F1 10 Tf 20 100 Td <${codes}> Tj ET`)));
    const result = await extractLayout(await doc.save());
    expect(result.pages[0].fonts).toEqual([{ name: 'Type3', type3: true }]);
    expect(result.quality.reasons).toEqual([
      {
        code: 'garbled-text',
        page: 1,
        detail: '100% control, private-use or replacement characters (Type3 font on page)',
      },
    ]);
  });

  test('reports punctuation-only text but not dot leaders', async () => {
    const symbols = await pdf((page, font) => page.drawText('#$%& ()*+ ,-./ :;<= >?@[ ]^_{ |}~ #$%&', { x: 50, y: 700, size: 10, font }));
    expect((await extractLayout(symbols)).quality.reasons.map((r) => r.code)).toEqual(['garbled-text']);
    const leaders = await pdf((page, font) => page.drawText(`Summa ${'.'.repeat(60)} 100`, { x: 50, y: 700, size: 10, font }));
    expect((await extractLayout(leaders)).quality.supported).toBe(true);
  });

  test('reports Swedish words with å/ä/ö dropped or replaced', async () => {
    const bytes = await pdf((page, font) => {
      page.drawText('Forfallodatum 2026-01-31', { x: 50, y: 700, size: 10, font });
      page.drawText('Godk nd for F-skatt', { x: 50, y: 680, size: 10, font });
    });
    expect((await extractLayout(bytes)).quality.reasons).toEqual([
      { code: 'missing-diacritics', page: 1, detail: '2 Swedish word(s) without å/ä/ö' },
    ]);
  });

  test('reports a file that needs a password', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const ctx = doc.context;
    ctx.trailerInfo.Encrypt = ctx.register(
      ctx.obj({ Filter: 'Standard', V: 1, R: 2, O: PDFHexString.of('00'.repeat(32)), U: PDFHexString.of('11'.repeat(32)), P: -4 }),
    );
    const id = PDFHexString.of('00112233445566778899aabbccddeeff');
    ctx.trailerInfo.ID = ctx.obj([id, id]);
    expect(await extractLayout(await doc.save({ useObjectStreams: false }))).toEqual({
      pageCount: 0,
      encrypted: true,
      pages: [],
      quality: { supported: false, reasons: [{ code: 'encrypted', detail: 'The file needs a password to open' }] },
    });
  });

  test('reports a runtime without the built-ins pdf.js needs, before loading it', async () => {
    const sumPrecise = Object.getOwnPropertyDescriptor(Math, 'sumPrecise');
    Reflect.deleteProperty(Math, 'sumPrecise');
    try {
      expect(missingRuntimeFeatures()).toEqual(['Math.sumPrecise']);
      expect((await extractLayout(await invoice())).quality.reasons).toEqual([
        {
          code: 'unsupported-runtime',
          detail: 'PDF extraction is supported on Bun 1.4+ and current browsers; this runtime lacks Math.sumPrecise',
        },
      ]);
      expect(await extractPdfInvoice(await invoice(), { fileSha256: 'f'.repeat(64) })).toEqual({
        status: 'unsupported',
        reason: 'PDF text cannot be read: PDF extraction is supported on Bun 1.4+ and current browsers; this runtime lacks Math.sumPrecise',
      });
    } finally {
      if (sumPrecise) Object.defineProperty(Math, 'sumPrecise', sumPrecise);
    }
    expect(missingRuntimeFeatures()).toEqual([]);
  });

  test('stops at the work limits', async () => {
    const twoPages = await pdf(async (page, font, doc) => {
      page.drawText('Faktura', { x: 50, y: 790, size: 18, font });
      doc.addPage([595, 842]).drawText('Sida 2', { x: 50, y: 790, size: 10, font });
    });
    const reason = async (limits: Partial<PdfLimits>) => (await extractLayout(twoPages, { limits })).quality.reasons;
    const over = (limit: string, value: number) => [
      { code: 'too-large' as const, detail: `The PDF is over the extraction limit ${limit} (${value})` },
    ];
    expect(await reason({ maxPages: 1 })).toEqual(over('maxPages', 1));
    expect(await reason({ maxTextRuns: 1 })).toEqual(over('maxTextRuns', 1));
    expect(await reason({ maxOperators: 1 })).toEqual(over('maxOperators', 1));
    expect(await reason({ maxMilliseconds: -1 })).toEqual(over('maxMilliseconds', -1));
    expect(await reason({ maxPages: 2, maxTextRuns: 2 })).toEqual([]);
    expect(await extractPdfInvoice(twoPages, { fileSha256: 'f'.repeat(64), limits: { maxPages: 1 } })).toEqual({
      status: 'unsupported',
      reason: 'PDF text cannot be read: The PDF is over the extraction limit maxPages (1)',
    });
  });

  test('reports bytes that are not a PDF', async () => {
    const result = await extractLayout(new TextEncoder().encode('not a pdf'));
    expect(result.quality.reasons).toEqual([{ code: 'unreadable', detail: 'The file is not a readable PDF' }]);
  });
});
