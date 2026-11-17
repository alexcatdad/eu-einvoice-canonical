import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { type CanonicalInvoice, effectiveSign } from '../../src/canonical.js';
import { convert, schemaVersion } from '../../src/index.js';
import { attachment } from '../../src/pdf-extract/attachment.js';
import { type GenericRead, itemValues } from '../../src/pdf-extract/generic.js';
import { extractPdfInvoice, type PdfExtraction } from '../../src/pdf-extract/index.js';
import { analyseLines } from '../../src/relations/rules.js';
import { toDecimal } from '../../src/values.js';
import { toUbl } from '../../src/writers/ubl.js';

/** Synthetic identifiers with valid check digits; no real company. */
const ID = { org: '559900-1236', vat: 'SE559900123601', bankgiro: '123-4566', ocr: '12345678903' };

type Text = [x: number, y: number, text: string, size?: number];
/** Every text the base page prints (filled in by `invoicePdf`), to blank a page. */
const ALL: string[] = [];

/** A Swedish invoice drawn with pdf-lib; `edit` replaces or drops texts by their content. `more` adds pages, each edited the same way. */
// Edits match texts by content, so texts added by a test differ from the ones it removes (e.g. "Moms%" for "Moms %").
async function invoicePdf(
  edit: Record<string, string | null> = {},
  extra: Text[] = [],
  more: { edit?: Record<string, string | null>; extra?: Text[] }[] = [],
): Promise<Uint8Array> {
  const texts: Text[] = [
    [60, 30, 'Testbolaget AB', 16],
    [330, 30, 'Faktura', 16],
    [330, 70, 'Fakturanummer'],
    [450, 70, 'Fakturadatum'],
    [330, 82, '5001'],
    [450, 82, '2026-03-02'],
    [330, 100, 'Förfallodatum'],
    [430, 100, '2026-04-01'],
    [330, 114, 'Dröjsmålsränta'],
    [430, 114, '12,00 %'],
    [60, 100, 'Fakturaadress'],
    [60, 112, 'Kund Ett AB'],
    [60, 124, 'Gatan 5'],
    [60, 136, '111 22 STADEN'],
    [60, 170, 'Benämning'],
    [300, 170, 'Antal'],
    [340, 170, 'Enh'],
    [400, 170, 'À-pris'],
    [500, 170, 'Summa'],
    [60, 186, 'Konsultarbete systemutveckling'],
    [300, 186, '10'],
    [340, 186, 'tim'],
    [400, 186, '1 000,00'],
    [500, 186, '10 000,00'],
    [60, 198, 'enligt avtal'],
    [60, 214, 'Licens'],
    [300, 214, '2'],
    [340, 214, 'st'],
    [400, 214, '500,00'],
    [500, 214, '1 000,00'],
    [60, 300, 'Netto'],
    [160, 300, 'Moms %'],
    [240, 300, 'Moms kr'],
    [480, 300, 'Att betala'],
    [60, 312, '11 000,00'],
    [160, 312, '25'],
    [240, 312, '2 750,00'],
    [480, 312, '13 750,00 kr'],
    [60, 700, 'Adress'],
    [60, 712, 'Box 9'],
    [60, 724, '222 33 ORTEN'],
    [200, 700, 'Bankgiro'],
    [200, 712, ID.bankgiro],
    [330, 700, 'Org.nr'],
    [330, 712, ID.org],
    [440, 700, 'Momsreg.nr'],
    [440, 712, ID.vat],
    [330, 736, 'Godkänd för F-skatt'],
    [200, 736, 'OCR'],
    [230, 736, ID.ocr],
  ];
  if (!ALL.length) ALL.push(...texts.map((t) => t[2]));
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const p of [{ edit, extra }, ...more]) {
    const page = doc.addPage([595, 842]);
    for (const [x, y, raw, size = 9] of [...texts, ...(p.extra ?? [])]) {
      const text = p.edit && raw in p.edit ? p.edit[raw] : raw;
      if (text !== null) page.drawText(text, { x, y: 842 - y - size, size, font });
    }
  }
  return doc.save();
}

const extract = async (bytes: Uint8Array) => extractPdfInvoice(bytes, { fileSha256: 'f'.repeat(64), filename: 'synthetic.pdf' });
function ok(r: PdfExtraction): CanonicalInvoice {
  if (r.status !== 'ok') throw new Error(`expected ok, got ${r.status}: ${JSON.stringify(r)}`);
  return r.invoice;
}
function draft(r: PdfExtraction) {
  if (r.status !== 'draft') throw new Error(`expected draft, got ${r.status}`);
  return r.draft;
}

/**
 * A second synthetic layout: a large "FAKTURA" title over a letterhead in body text, the seller's identity in a
 * footer line with "·" separators, item headings "À-pris" and "Moms %" printed close together, and a VAT table
 * headed "Momssats | Underlag | Moms". `items`, `vat` and `totals` replace those blocks.
 */
async function letterheadPdf(
  items: Text[][] = [
    ['Konsultarbete', '10', 'tim', '1 000,00', '25', '10 000,00'].map((t, i) => [ITEM_X[i], 0, t] as Text),
    ['Kurslitteratur', '4', 'fp', '250,00', '12', '1 000,00'].map((t, i) => [ITEM_X[i], 0, t] as Text),
  ],
  vat: [string, string, string][] = [
    ['25 %', '10 000,00', '2 500,00'],
    ['12 %', '1 000,00', '120,00'],
  ],
  totals: [string, string][] = [
    ['Netto', '11 000,00'],
    ['Moms', '2 620,00'],
    ['Summa inkl. moms', '13 620,00'],
    ['Att betala (kr)', '13 620,00'],
  ],
  extra: Text[] = [],
): Promise<Uint8Array> {
  const texts: Text[] = [
    [55, 40, 'FAKTURA', 20],
    [61, 70, 'Provbolaget AB'],
    [61, 82, 'Exempelgatan 1'],
    [61, 94, '999 01 Testby'],
    [309, 70, 'Fakturanummer'],
    [448, 70, '2001'],
    [309, 82, 'Fakturadatum'],
    [448, 82, '2026-05-04'],
    [309, 94, 'Förfallodatum'],
    [448, 94, '2026-06-03'],
    [55, 131, 'Fakturaadress'],
    [55, 143, 'Kund Två AB'],
    [55, 155, 'Provvägen 2'],
    [55, 167, '999 02 Testby'],
    [61, 192, 'Beskrivning'],
    [280, 192, 'Antal'],
    [313, 192, 'Enhet'],
    [385, 192, 'À-pris'],
    [412, 192, 'Moms %'],
    [506, 192, 'Belopp'],
    ...items.flatMap((row, r) => row.map(([x, , t]) => [x, 205 + 13 * r, t] as Text)),
    [61, 256, 'Momssats'],
    [337, 256, 'Underlag'],
    [509, 256, 'Moms'],
    ...vat.flatMap(
      ([rate, base, tax], r) =>
        [
          [61, 268 + 12 * r, rate],
          [335, 268 + 12 * r, base],
          [500, 268 + 12 * r, tax],
        ] as Text[],
    ),
    ...totals.flatMap(
      ([label, amount], r) =>
        [
          [303, 305 + 12 * r, label],
          [495, 305 + 12 * r, amount],
        ] as Text[],
    ),
    [61, 378, `Bankgiro: ${ID.bankgiro}`],
    [61, 390, `OCR-nummer: ${ID.ocr}`],
    [55, 797, `Provbolaget AB · Org.nr ${ID.org} · Momsreg.nr ${ID.vat} · Godkänd för F-skatt`],
    ...extra,
  ];
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  for (const [x, y, text, size = 9] of texts) page.drawText(text, { x, y: 842 - y - size, size, font });
  return doc.save();
}
/** x of the item columns in `letterheadPdf`: description, quantity, unit, price, VAT rate, amount. */
const ITEM_X = [61, 290, 313, 374, 430, 495];

describe('generic PDF invoice extraction', () => {
  test('a complete, reconciling invoice is ok, with page regions and derived totals marked', async () => {
    const inv = ok(await extract(await invoicePdf()));
    expect(inv).toMatchObject({
      kind: 'invoice',
      typeCode: '380',
      id: '5001',
      issueDate: '2026-03-02',
      dueDate: '2026-04-01',
      currency: 'SEK',
      seller: {
        name: 'Testbolaget AB',
        legalRegistrationId: { value: '5599001236', schemeId: '0007' },
        vatId: ID.vat,
        taxRegistrationId: 'Godkänd för F-skatt',
        address: { line1: 'Box 9', postalCode: '222 33', city: 'ORTEN', countryCode: 'SE' },
      },
      buyer: { name: 'Kund Ett AB', address: { line1: 'Gatan 5', postalCode: '111 22', city: 'STADEN' } },
      payments: [
        { meansCode: '30', remittanceInformation: ID.ocr, creditTransfers: [{ accountId: '1234566', serviceProviderId: 'SE:BANKGIRO' }] },
      ],
      totals: { lineNetTotal: '11000.00', taxExclusive: '11000.00', vatTotal: '2750.00', taxInclusive: '13750.00', payable: '13750.00' },
      // Dröjsmålsränta 12 % is interest, never a VAT rate
      vatBreakdown: [{ categoryCode: 'S', rate: '25', taxableAmount: '11000.00', taxAmount: '2750.00' }],
    });
    expect(inv.lines.map((l) => [l.item.name, l.quantity, l.unitText, l.unitCode, l.price?.net, l.netAmount, l.vat?.rate])).toEqual([
      ['Konsultarbete systemutveckling enligt avtal', '10', 'tim', 'HUR', '1000.00', '10000.00', '25'],
      ['Licens', '2', 'st', 'H87', '500.00', '1000.00', '25'],
    ]);
    expect(inv.source).toMatchObject({
      format: 'pdf-text',
      syntaxDocumentType: 'PDF',
      fileSha256: 'f'.repeat(64),
      filename: 'synthetic.pdf',
    });
    expect(inv.source.pdfProvenance?.['/id']).toMatchObject({ page: 1 });
    expect(inv.source.pdfProvenance?.['/totals/taxInclusive']).toBeUndefined();
    expect(inv.source.derived.map((d) => d.field)).toContain('/totals/taxInclusive');
    expect(inv.source.valueOrigins?.['/totals/taxInclusive']).toBe('derived');
  }, 30000);

  test('the UBL written from an ok result passes schema and EN 16931 validation; Peppol lacks only buyer data the PDF does not print', async () => {
    const xml = toUbl(ok(await extract(await invoicePdf())));
    const r = await convert(new TextEncoder().encode(xml), 'synthetic.xml', undefined, { validate: true });
    const o = r.outcomes[0];
    if (o?.status !== 'ok') throw new Error('UBL did not convert');
    const v = o.invoices[0].source.validation!;
    expect([v.schema, v.semantic]).toEqual(['passed', 'passed']);
    // The Peppol bundle is held locally (bun run restore:local-validation); CI always has it.
    if (v.profile === 'unavailable') {
      if (process.env.CI) throw new Error('Peppol validator bundle missing in CI');
      console.warn('SKIPPED Peppol check: validator bundle not restored locally (bun run restore:local-validation)');
      return;
    }
    // Peppol also needs a buyer reference (BT-10) and the buyer's electronic address (BT-49), which the PDF does not print
    expect(v.profile).toBe('failed');
    const fatal = v.findings.filter((f) => f.severity === 'fatal');
    expect(fatal.filter((f) => f.layer !== 'profile')).toEqual([]);
    expect([...new Set(fatal.map((f) => f.ruleId))].sort()).toEqual(['PEPPOL-EN16931-R003', 'PEPPOL-EN16931-R010']);
  }, 60000);

  test('amounts that do not reconcile give a draft, never an invoice', async () => {
    const d = draft(await extract(await invoicePdf({ '13 750,00 kr': '13 700,00 kr' })));
    expect(d.fields['/totals/payable']).toBe('13700.00');
    expect(d.problems.some((p) => p.code === 'not-reconciling')).toBe(true);
  }, 30000);

  test('an identifier failing its check digits is kept as printed and flagged', async () => {
    const d = draft(await extract(await invoicePdf({ [ID.bankgiro]: '123-4567' })));
    expect(d.fields['/payments/0/creditTransfers/0/accountId']).toBe('1234567');
    expect(d.problems).toContainEqual(expect.objectContaining({ code: 'identifier-check', region: expect.objectContaining({ page: 1 }) }));
  }, 30000);

  test('missing fields are reported with the field, and values found keep their region', async () => {
    const d = draft(await extract(await invoicePdf({ Fakturanummer: null, '5001': null })));
    expect(d.problems).toContainEqual(expect.objectContaining({ code: 'missing', field: '/id' }));
    expect(d.pdfProvenance['/issueDate']).toMatchObject({ page: 1 });
  }, 30000);

  test('ROT: the deduction is prepaid (BT-113) with a note, payable is the remainder', async () => {
    const inv = ok(
      await extract(
        await invoicePdf({ '13 750,00 kr': '10 750,00 kr' }, [
          [330, 270, 'Avgår ROT-avdrag'],
          [480, 270, '3 000,00'],
        ]),
      ),
    );
    expect(inv.totals).toMatchObject({ taxInclusive: '13750.00', prepaid: '3000.00', payable: '10750.00' });
    expect(inv.notes).toEqual([{ text: 'ROT' }]);
  }, 30000);

  test('a deduction that names neither ROT nor RUT is kept with a problem', async () => {
    const d = draft(
      await extract(
        await invoicePdf({ '13 750,00 kr': '10 750,00 kr' }, [
          [330, 270, 'Avgår skattereduktion'],
          [480, 270, '3 000,00'],
        ]),
      ),
    );
    expect(d.fields['/totals/prepaid']).toBe('3000.00');
    expect(d.problems).toContainEqual(expect.objectContaining({ code: 'missing', field: '/notes/0/text' }));
  }, 30000);

  test('momsfritt: category E with the printed statement as exemption reason', async () => {
    const statement = 'Försäljningen är momsfri enligt mervärdesskattelagen';
    const inv = ok(
      await extract(
        await invoicePdf({ 'Moms %': null, 'Moms kr': null, '25': null, '2 750,00': null, '13 750,00 kr': '11 000,00 kr' }, [
          [60, 400, statement],
        ]),
      ),
    );
    expect(inv.vatBreakdown as unknown).toEqual([
      { categoryCode: 'E', rate: '0', taxableAmount: '11000.00', taxAmount: '0.00', exemptionReason: statement },
    ]);
    expect(inv.lines.every((l) => l.vat?.categoryCode === 'E')).toBe(true);
  }, 30000);

  test('kreditfaktura is a credit note (381)', async () => {
    const inv = ok(await extract(await invoicePdf({ Faktura: 'Kreditfaktura' })));
    expect([inv.kind, inv.typeCode]).toEqual(['creditNote', '381']);
  }, 30000);

  test('a kreditfaktura printed with minus signs is a credit note with positive magnitudes', async () => {
    const neg = (row: string[]) => row.map((t, i) => [ITEM_X[i], 0, t] as Text);
    const inv = ok(
      await extract(
        await letterheadPdf(
          [
            neg(['Konsultarbete', '-10', 'tim', '1 000,00', '25', '-10 000,00']),
            neg(['Kurslitteratur', '4', 'fp', '-250,00', '12', '-1 000,00']),
          ],
          [
            ['25 %', '-10 000,00', '-2 500,00'],
            ['12 %', '-1 000,00', '-120,00'],
          ],
          [
            ['Netto', '-11 000,00'],
            ['Moms', '-2 620,00'],
            ['Summa inkl. moms', '-13 620,00'],
            ['Att betala (kr)', '-13 620,00'],
          ],
          [[309, 110, 'Kreditfaktura']],
        ),
      ),
    );
    expect([inv.kind, inv.typeCode, effectiveSign(inv)]).toEqual(['creditNote', '381', -1]);
    expect(inv.totals).toMatchObject({ lineNetTotal: '11000.00', vatTotal: '2620.00', taxInclusive: '13620.00', payable: '13620.00' });
    expect(inv.vatBreakdown.map((b) => [b.taxableAmount, b.taxAmount]) as unknown).toEqual([
      ['10000.00', '2500.00'],
      ['1000.00', '120.00'],
    ]);
    // Unit prices stay positive (BR-27): quantity × price = amount
    expect(inv.lines.map((l) => [l.quantity, l.price?.net, l.netAmount]) as unknown).toEqual([
      ['10', '1000.00', '10000.00'],
      ['4', '250.00', '1000.00'],
    ]);
    expect(inv.source.derived.map((d) => d.field)).toContain('/totals');
  }, 30000);

  test('an invoice assigned to a finance company ("har överlåtits") is a draft, never ok', async () => {
    const d = draft(
      await extract(await letterheadPdf(undefined, undefined, undefined, [[61, 410, 'Denna faktura har överlåtits till Finans AB']])),
    );
    expect(d.problems).toContainEqual(expect.objectContaining({ code: 'factoring', field: '/payee/name' }));
  }, 30000);

  test('without a printed org.nr the Peppol endpoint (BT-34) comes from a valid SE VAT number, marked derived', async () => {
    const inv = ok(await extract(await invoicePdf({ 'Org.nr': null, [ID.org]: null })));
    expect(inv.seller.legalRegistrationId).toBeUndefined();
    expect(inv.seller.endpoint).toEqual({ value: '5599001236', schemeId: '0007' });
    expect(inv.source.derived.find((d) => d.field === '/seller/endpoint')?.rule).toContain('VAT number');
    expect(inv.source.valueOrigins?.['/seller/endpoint']).toBe('derived');
    // A VAT number failing its check digits gives no endpoint (and a draft)
    const d = draft(await extract(await invoicePdf({ 'Org.nr': null, [ID.org]: null, [ID.vat]: 'SE559900123701' })));
    expect(d.problems).toContainEqual(expect.objectContaining({ code: 'identifier-check', field: '/seller/vatId' }));
  }, 30000);

  test('printed Peppol IDs are the electronic addresses (BT-34, BT-49), read from the page and not derived', async () => {
    const gln = '9999999000010';
    const inv = ok(
      await extract(
        await invoicePdf({}, [
          [60, 400, 'Säljarens PEPPOLID: 5599001236 [0007]'],
          [60, 412, `Köparens Peppol-ID: ${gln} [0088]`],
        ]),
      ),
    );
    expect(inv.seller.endpoint).toEqual({ value: '5599001236', schemeId: '0007' });
    expect(inv.buyer.endpoint).toEqual({ value: gln, schemeId: '0088' });
    expect(inv.source.derived.some((d) => d.field.startsWith('/seller/endpoint'))).toBe(false);
    expect(inv.source.valueOrigins?.['/seller/endpoint/value']).toBe('source');
    expect(inv.source.pdfProvenance?.['/buyer/endpoint/value']).toMatchObject({ page: 1 });
  }, 30000);

  test('a Peppol ID failing its check digits or outside the EAS list is kept as printed and flagged; one without a party is not read', async () => {
    for (const [text, value, scheme] of [
      ['Köparens PEPPOL-ID: 9999999000011 [0088]', '9999999000011', '0088'],
      ["Buyer's Peppol ID: 5599001236 [9955]", '5599001236', '9955'],
    ]) {
      const d = draft(await extract(await invoicePdf({}, [[60, 400, text]])));
      expect(d.fields['/buyer/endpoint/value']).toBe(value);
      expect(d.fields['/buyer/endpoint/schemeId']).toBe(scheme);
      expect(d.problems).toContainEqual(expect.objectContaining({ code: 'identifier-check', field: '/buyer/endpoint' }));
    }
    const inv = ok(await extract(await invoicePdf({}, [[60, 400, 'Elektronisk adress: 5599001236 [0007]']])));
    expect(inv.buyer.endpoint).toBeUndefined();
    expect(inv.source.valueOrigins?.['/seller/endpoint']).toBe('derived');
  }, 30000);

  test('a labelled note under an item and the lines after it are the line note (BT-127); unlabelled lines are kept there and reported', async () => {
    const inv = ok(
      await extract(
        await invoicePdf({}, [
          [60, 226, 'Notering: avser mars'],
          [60, 238, 'Projekt 7'],
        ]),
      ),
    );
    expect(inv.lines.map((l) => l.note)).toEqual([undefined, 'avser mars\nProjekt 7']);
    expect(inv.lines[1].item.name).toBe('Licens');
    expect(inv.source.pdfProvenance?.['/lines/1/note']).toMatchObject({ page: 1, x: 60 });
    const d = draft(await extract(await invoicePdf({}, [[60, 226, 'avser mars']])));
    expect(d.fields['/lines/1/note']).toBe('avser mars');
    expect(d.fields['/lines/1/item/name']).toBe('Licens');
    expect(d.problems).toContainEqual(expect.objectContaining({ code: 'ambiguous', field: '/lines/1/note' }));
  }, 30000);

  test('labels ending in an abbreviation full stop ("Org. nr.:") are read; a failing org.nr is kept and flagged', async () => {
    const d = draft(await extract(await invoicePdf({ 'Org.nr': 'ORG. NR.:', [ID.org]: '559900-1237' })));
    expect(d.fields['/seller/legalRegistrationId/value']).toBe('5599001237');
    expect(d.problems).toContainEqual(expect.objectContaining({ code: 'identifier-check', field: '/seller/legalRegistrationId/value' }));
  }, 30000);

  test('"Godkänd för F-skatt" in a footer line with "·" separators is BT-32', async () => {
    expect(ok(await extract(await letterheadPdf())).seller.taxRegistrationId).toBe('Godkänd för F-skatt');
  }, 30000);

  test('problems that contradict a printed value carry its page and position', async () => {
    const d = draft(await extract(await invoicePdf({ '13 750,00 kr': '13 700,00 kr' }, [[60, 400, 'Mervärdesskatt ingår']])));
    for (const code of ['not-reconciling', 'prices-include-vat'])
      expect(d.problems.filter((p) => p.code === code).every((p) => p.region?.page === 1)).toBe(true);
  }, 30000);

  test('a damaged PDF that pdf.js cannot parse is unsupported with the reason', async () => {
    const doc = await PDFDocument.create();
    doc.addPage().drawText('Faktura');
    const s = Buffer.from(await doc.save({ useObjectStreams: false })).toString('latin1');
    const bytes = new Uint8Array(Buffer.from(s.replace(/\/Kids \[ \d+ 0 R \]/, '/Kids [ 999 0 R ]'), 'latin1'));
    expect(await extract(bytes)).toMatchObject({ status: 'unsupported', reason: expect.stringContaining('not a readable PDF') });
  }, 30000);

  test('a truncated PDF is unsupported with a reason, never an internal error', async () => {
    const bytes = await invoicePdf();
    for (const cut of [0.5, 0.9]) {
      const part = bytes.slice(0, Math.floor(bytes.length * cut));
      expect(await extract(part)).toMatchObject({ status: 'unsupported', reason: expect.any(String) });
      const r = await convert(part, 'cut.pdf', undefined, { extractPdf: true });
      expect(r.pdfOutcomes?.some((o) => o.status === 'error') ?? false).toBe(false);
    }
  }, 30000);

  test('a payment reminder is not an invoice', async () => {
    expect(await extract(await invoicePdf({ Faktura: 'Betalningspåminnelse' }))).toMatchObject({ status: 'not-an-invoice' });
  }, 30000);

  test('text under an item that is not a wrapped description is its note, with a problem; the name is the item row', async () => {
    const d = draft(await extract(await invoicePdf({ 'enligt avtal': null }, [[60, 226, 'Ring oss vid frågor']])));
    expect(d.fields['/lines/1/item/name']).toBe('Licens');
    expect(d.fields['/lines/1/note']).toBe('Ring oss vid frågor');
    expect(d.fields['/lines/1/netAmount']).toBe('1000.00');
    expect(d.problems).toContainEqual(expect.objectContaining({ code: 'ambiguous', field: '/lines/1/note' }));
  }, 30000);

  test('ok and draft outcomes of convert match the published result schema', async () => {
    const schema = JSON.parse(
      readFileSync(join(import.meta.dir, '..', '..', 'schemas', `convert-result.${schemaVersion}.schema.json`), 'utf8'),
    );
    const valid = new Ajv2020({ strict: false }).compile(schema);
    for (const [bytes, status] of [
      [await invoicePdf(), 'ok'],
      [await invoicePdf({ '13 750,00 kr': '13 700,00 kr' }), 'draft'],
    ] as const) {
      const r = await convert(bytes, 'synthetic.pdf', undefined, { extractPdf: true });
      expect(r.pdfOutcomes?.[0]?.status).toBe(status);
      expect(valid(r)).toBe(true);
    }
  }, 60000);

  test('a multi-rate VAT table gives one breakdown row per rate; its column headings are not totals', async () => {
    const inv = ok(
      await extract(
        await invoicePdf(
          {
            'Moms %': null,
            'Moms kr': null,
            '25': null,
            '2 750,00': null,
            '13 750,00 kr': '13 620,00 kr',
            '10 000,00': '10 000,00 ',
          },
          [
            [455, 170, 'Moms%'],
            [455, 186, '25 %'],
            [455, 214, '12 %'],
            [160, 340, 'Moms%'],
            [220, 340, 'Momsunderlag'],
            [300, 340, 'Moms'],
            [160, 352, '25 %'],
            [220, 352, '10 000,00'],
            [300, 352, '2 500,00'],
            [160, 364, '12 %'],
            [220, 364, '1 000,00'],
            [300, 364, '120,00'],
            [330, 390, 'Moms (kr)'],
            [480, 390, '2 620,00'],
          ],
        ),
      ),
    );
    expect(inv.vatBreakdown.map((b) => [b.rate, b.taxableAmount, b.taxAmount]) as unknown).toEqual([
      ['25', '10000.00', '2500.00'],
      ['12', '1000.00', '120.00'],
    ]);
    expect(inv.lines.map((l) => l.vat?.rate) as unknown).toEqual(['25', '12']);
    expect(inv.totals.vatTotal as string).toBe('2620.00');
  }, 30000);

  test('several line VAT rates without a breakdown, with a fee: draft with both reasons', async () => {
    const d = draft(
      await extract(
        await invoicePdf({}, [
          [455, 170, 'Moms%'],
          [455, 186, '25 %'],
          [455, 214, '12 %'],
          [330, 270, 'Exp avg'],
          [480, 270, '50,00'],
        ]),
      ),
    );
    expect(d.problems.map((p) => p.code)).toEqual(expect.arrayContaining(['vat-breakdown', 'not-reconciling']));
    expect(d.fields['/totals/chargeTotal']).toBe('50.00');
  }, 30000);

  test('a line without quantity and unit price is one unit at the line amount (derived)', async () => {
    const inv = ok(await extract(await invoicePdf({ '2': null, st: null, '500,00': null })));
    expect(inv.lines[1]).toMatchObject({ quantity: '1', unitCode: 'C62', price: { net: '1000.00' } });
    expect(inv.source.derived.map((x) => x.field)).toEqual(expect.arrayContaining(['/lines/1/quantity', '/lines/1/unitCode']));
  }, 30000);

  test('different amounts printed for one VAT rate leave the breakdown empty', async () => {
    const d = draft(
      await extract(
        await invoicePdf({ 'Moms %': null, 'Moms kr': null, '25': null, '2 750,00': null }, [
          [330, 340, 'Moms 25 %'],
          [480, 340, '2 750,00 kr'],
          [330, 400, 'Moms 25 %'],
          [480, 400, '1 375,00 kr'],
        ]),
      ),
    );
    expect(d.fields['/vatBreakdown/0/rate']).toBeUndefined();
    expect(d.problems).toContainEqual(
      expect.objectContaining({ code: 'ambiguous', field: '/vatBreakdown', region: expect.objectContaining({ page: 1 }) }),
    );
  }, 30000);

  test('VAT read from labels that carry the rate', async () => {
    const inv = ok(
      await extract(
        await invoicePdf({ 'Moms %': null, 'Moms kr': null, '25': null, '2 750,00': null }, [
          [330, 340, 'Momspl belopp 25 %'],
          [480, 340, '11 000,00'],
          [330, 352, 'Moms (25 %)'],
          [480, 352, '2 750,00 kr'],
        ]),
      ),
    );
    expect(inv.vatBreakdown.map((b) => [b.rate, b.taxableAmount, b.taxAmount]) as unknown).toEqual([['25', '11000.00', '2750.00']]);
  }, 30000);

  test('payment accounts and labels with the value in the same text', async () => {
    const inv = ok(
      await extract(
        await invoicePdf({}, [
          [60, 760, 'PlusGiro: 4433221-1'],
          [60, 772, 'IBAN: SE45 5000 0000 0583 9825 7466'],
          [60, 784, 'BIC: ESSESESS'],
        ]),
      ),
    );
    expect(inv.payments[0].creditTransfers).toEqual([
      { accountId: '1234566', serviceProviderId: 'SE:BANKGIRO' },
      { accountId: '44332211', serviceProviderId: 'SE:PLUSGIRO' },
      { accountId: 'SE4550000000058398257466', serviceProviderId: 'ESSESESS' },
    ]);
  }, 30000);

  test('different invoice numbers on later pages: only the first invoice is read', async () => {
    const d = draft(await extract(await invoicePdf({}, [], [{ edit: { '5001': '5002' } }])));
    expect(d.fields['/id']).toBe('5001');
    expect(d.problems).toContainEqual(expect.objectContaining({ code: 'several-invoices', region: expect.objectContaining({ page: 2 }) }));
  }, 30000);

  test('two different values for one field leave it empty; lines of several invoices are not mixed', async () => {
    const d = draft(await extract(await invoicePdf({}, [[60, 600, 'Fakturanummer: 5002']])));
    expect(d.fields['/id']).toBeUndefined();
    expect(d.fields['/lines/0/netAmount']).toBeUndefined();
    expect(d.problems).toContainEqual(expect.objectContaining({ code: 'ambiguous', field: '/id' }));
  }, 30000);

  test('a personal identity number is flagged and in no field; its printed text is kept as unmapped text', async () => {
    const d = draft(await extract(await invoicePdf({ [ID.org]: '811218-9876', [ID.vat]: null })));
    expect(d.fields['/seller/legalRegistrationId/value']).toBeUndefined();
    const p = d.problems.find((x) => x.code === 'personal-number');
    expect(p?.message).not.toMatch(/\d{6}/);
    expect(d.unmappedText?.map((u) => u.text)).toContain('811218-9876');
  }, 30000);

  test('prices including VAT, factoring and unmapped units give a draft with each reason', async () => {
    const d = draft(
      await extract(
        await invoicePdf({ st: 'paket' }, [
          [60, 400, 'Mervärdesskatt ingår'],
          [60, 412, 'Fakturan är överlåten till Finans AB'],
        ]),
      ),
    );
    expect(d.fields['/totals/lineNetTotal']).toBeUndefined();
    expect(d.problems.map((p) => p.code)).toEqual(expect.arrayContaining(['prices-include-vat', 'factoring', 'unknown-unit']));
  }, 30000);

  test('a PDF whose text cannot be read is unsupported with the reason', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    expect(await extract(await doc.save())).toMatchObject({ status: 'unsupported', reason: expect.stringContaining('cannot be read') });
  }, 30000);

  test('letterhead in body text, footer identity line, close headings and a "Momssats" VAT table: ok', async () => {
    const inv = ok(await extract(await letterheadPdf()));
    expect(inv.seller).toMatchObject({
      name: 'Provbolaget AB',
      legalRegistrationId: { value: '5599001236' },
      vatId: ID.vat,
      address: { line1: 'Exempelgatan 1', postalCode: '999 01', city: 'Testby' },
    });
    expect(inv.buyer.name).toBe('Kund Två AB');
    expect(inv.lines.map((l) => [l.price?.net, l.vat?.rate, l.unitCode]) as unknown).toEqual([
      ['1000.00', '25', 'HUR'],
      ['250.00', '12', 'XPK'],
    ]);
    expect(inv.vatBreakdown.map((b) => [b.categoryCode, b.rate, b.taxableAmount, b.taxAmount]) as unknown).toEqual([
      ['S', '25', '10000.00', '2500.00'],
      ['S', '12', '1000.00', '120.00'],
    ]);
    expect(inv.totals.vatTotal as string).toBe('2620.00');
  }, 30000);

  test('momsfritt with a printed 0 % rate and "Momsfri" in the VAT table: category E with the statement, never Z', async () => {
    const statement = 'Momsfri omsättning enligt mervärdesskattelagen.';
    const inv = ok(
      await extract(
        await letterheadPdf(
          [['Behandling', '2', 'st', '2 000,00', '0', '4 000,00'].map((t, i) => [ITEM_X[i], 0, t] as Text)],
          [['Momsfri', '4 000,00', '0,00']],
          [
            ['Netto', '4 000,00'],
            ['Moms', '0,00'],
            ['Summa inkl. moms', '4 000,00'],
            ['Att betala (kr)', '4 000,00'],
          ],
          [[61, 360, statement]],
        ),
      ),
    );
    expect(inv.vatBreakdown as unknown).toEqual([
      { categoryCode: 'E', rate: '0', taxableAmount: '4000.00', taxAmount: '0.00', exemptionReason: statement },
    ]);
    expect(inv.lines[0].vat?.categoryCode).toBe('E');
  }, 30000);

  test('a deduction label wrapped over two lines ("Avgår skattereduktion grön / teknik") is read as prepaid', async () => {
    const inv = ok(
      await extract(
        await letterheadPdf(
          undefined,
          undefined,
          [
            ['Netto', '11 000,00'],
            ['Moms', '2 620,00'],
            ['Summa inkl. moms', '13 620,00'],
            ['Avgår skattereduktion grön', '2 000,00'],
            ['Att betala (kr)', '11 620,00'],
          ],
          [
            [303, 362, 'teknik'],
            [61, 410, 'Skattereduktion för grön teknik har dragits av.'],
          ],
        ),
      ),
    );
    expect(inv.totals).toMatchObject({ prepaid: '2000.00', payable: '11620.00' });
    expect(inv.notes).toEqual([{ text: 'GRON_TEKNIK' }]);
  }, 30000);

  test('a footer line right under the last item ends the item table', async () => {
    const items = [['Konsultarbete', '11', 'tim', '1 000,00', '25', '11 000,00'].map((t, i) => [ITEM_X[i], 0, t] as Text)];
    const inv = ok(
      await extract(
        await letterheadPdf(
          items,
          [['25 %', '11 000,00', '2 750,00']],
          [
            ['Netto', '11 000,00'],
            ['Moms', '2 750,00'],
            ['Summa inkl. moms', '13 750,00'],
            ['Att betala (kr)', '13 750,00'],
          ],
          [[55, 222, 'Sida 1 av 1 · Provbolaget AB']],
        ),
      ),
    );
    expect(inv.lines.map((l) => l.item.name)).toEqual(['Konsultarbete']);
  }, 30000);

  test('a PDF without recognisable invoice fields is unsupported', async () => {
    const doc = await PDFDocument.create();
    doc.addPage().drawText('Hej', { font: await doc.embedFont(StandardFonts.Helvetica) });
    expect(await extract(await doc.save())).toMatchObject({ status: 'unsupported' });
  }, 30000);
});

describe('item rows without an amount, page numbering and attached pages', () => {
  test('a fee row under an item ("Avgift" with a unit price) included in its amount is a line charge (BG-28), not a line', async () => {
    const inv = ok(
      await extract(
        await invoicePdf({ '500,00': '475,00' }, [
          [60, 226, 'Avgift'],
          [400, 226, '50,00'],
        ]),
      ),
    );
    expect(inv.lines).toHaveLength(2);
    expect(inv.lines[1]).toMatchObject({
      quantity: '2',
      price: { net: '475.00' },
      netAmount: '1000.00',
      charges: [{ amount: '50.00', reason: 'Avgift' }],
    });
    expect(inv.source.pdfProvenance?.['/lines/1/charges/0/amount']).toMatchObject({ page: 1, x: 400 });
    // A fee that is not part of the amount above is no charge; its row stays reported
    const other = ok(
      await extract(
        await invoicePdf({}, [
          [60, 226, 'Avgift'],
          [400, 226, '50,00'],
        ]),
      ),
    );
    expect(other.lines[1].charges).toEqual([]);
    expect(other.source.warnings.some((w) => w.code === 'unmapped-text' && Math.abs((w.region?.y ?? 0) - 226) < 6)).toBe(true);
  }, 30000);

  test('a heading priced 0,00 is a line of amount 0 with quantity 0, marked derived, and the heading role in relations', async () => {
    const inv = ok(
      await extract(
        await invoicePdf({}, [
          [60, 226, 'ÖVRIGT'],
          [400, 226, '0,00'],
        ]),
      ),
    );
    expect(inv.lines[2]).toMatchObject({ quantity: '0', price: { net: '0.00' }, netAmount: '0.00', item: { name: 'ÖVRIGT' } });
    expect(inv.source.valueOrigins?.['/lines/2/netAmount']).toBe('derived');
    expect(inv.source.valueOrigins?.['/lines/2/item/name']).toBe('source');
    expect(analyseLines(inv).lineRoles['3']).toBe('heading');
  }, 30000);

  test('one order number under every line is the purchase order reference (BT-13); different ones stay on their lines (BT-132)', () => {
    const at = { page: 1, x: 0, y: 0, width: 1, height: 1 };
    const values = (orders: string[]) => {
      const read = { values: {}, problems: [], warnings: [] } as Pick<GenericRead, 'values' | 'problems' | 'warnings' | 'defaults'>;
      itemValues(
        orders.map((o) => ({
          amount: { value: toDecimal('1.00'), region: at },
          name: { value: 'x', region: at },
          orderRef: { value: o, region: at },
        })),
        read,
      );
      return read.values;
    };
    const same = values(['AO-1', 'AO-1']);
    expect(same['/purchaseOrderRef']?.value).toBe('AO-1');
    expect(same['/lines/0/orderLineRef']).toBeUndefined();
    const different = values(['AO-1', 'AO-2']);
    expect(different['/purchaseOrderRef']).toBeUndefined();
    expect([different['/lines/0/orderLineRef']?.value, different['/lines/1/orderLineRef']?.value]).toEqual(['AO-1', 'AO-2']);
    expect(different['/lines/1/national/orderReference']?.value).toBe('AO-2');
  });

  test('an identifier printed with two different values (customer number) is in no field; both texts are kept as unmapped text', async () => {
    const inv = ok(
      await extract(
        await invoicePdf({}, [
          [60, 400, 'Kundnr: K-101'],
          [60, 412, 'Kundnr: K-102'],
        ]),
      ),
    );
    expect(inv.buyer.identifiers).toEqual([]);
    expect(inv.source.warnings).toContainEqual(expect.objectContaining({ code: 'ambiguous', field: '/buyer/identifiers/0/value' }));
    expect(inv.source.unmappedText?.map((u) => u.text)).toEqual(['Kundnr: K-101\nKundnr: K-102']);
    expect(ok(await extract(await invoicePdf({}, [[60, 400, 'Kundnr: K-101']]))).buyer.identifiers).toEqual([{ value: 'K-101' }]);
  }, 30000);

  test('"Konteringsreferens" is the buyer accounting reference (BT-19), on its own or in the buyer contact block', async () => {
    const inv = ok(await extract(await invoicePdf({}, [[60, 400, 'Konteringsreferens: 4010-77']])));
    expect(inv.accountingRef).toBe('4010-77');
    expect(inv.source.pdfProvenance?.['/accountingRef']).toMatchObject({ page: 1, x: 60 });
    expect(toUbl(inv)).toContain('<cbc:AccountingCost>4010-77</cbc:AccountingCost>');
    const block = ok(
      await extract(
        await invoicePdf({}, [
          [60, 400, 'KÖPARENS KONTAKT'],
          [60, 412, 'Telefon: 0100000020'],
          [60, 424, 'Konteringsreferens: KST 12'],
        ]),
      ),
    );
    expect([block.accountingRef, block.buyer.contact?.phone]).toEqual(['KST 12', '0100000020']);
  }, 30000);

  test('an OCR reference that is the invoice number without a check digit is kept with a warning, not a problem', async () => {
    const inv = ok(await extract(await invoicePdf({ [ID.ocr]: '5001' })));
    expect(inv.payments[0].remittanceInformation).toBe('5001');
    expect(inv.source.warnings).toContainEqual(
      expect.objectContaining({ code: 'identifier-check', field: '/payments/0/remittanceInformation' }),
    );
  }, 30000);

  test('pages after those the page numbering counts are attached as one PDF (BG-24), unread and unchanged', async () => {
    // Page 2 is a supplier invoice with its own invoice number; a third page has no text
    const bytes = await invoicePdf(
      {},
      [[500, 20, 'Sida 1 av 1']],
      [{ edit: { '5001': '9999' } }, { edit: Object.fromEntries(ALL.map((t) => [t, null])) }],
    );
    const inv = ok(await extract(bytes));
    expect(inv.id).toBe('5001');
    expect(inv.attachments).toHaveLength(1);
    const [a] = inv.attachments;
    if (a.kind !== 'embedded') throw new Error('not embedded');
    expect(a).toMatchObject({
      mimeCode: 'application/pdf',
      filename: 'synthetic-attachment.pdf',
      description: expect.stringContaining('Pages 2-3'),
    });
    const attached = await PDFDocument.load(Uint8Array.from(atob(a.base64), (c) => c.charCodeAt(0)));
    expect(attached.getPageCount()).toBe(2);
    expect(inv.source.derived.some((d) => d.field === '/attachments/0')).toBe(true);
    // Deterministic: the same file gives the same attachment
    const again = ok(await extract(bytes));
    expect(again.attachments).toEqual(inv.attachments);
    // Pages that cannot be copied give the problem that makes the result a draft, never an invoice without them
    expect(await attachment(new Uint8Array([1, 2, 3]), 2, 3)).toEqual({
      problem: expect.objectContaining({ code: 'attachment', field: '/attachments' }),
    });
    // Without the page numbering every page is read: two invoice numbers
    expect((await extract(await invoicePdf({}, [], [{ edit: { '5001': '9999' } }]))).status).toBe('draft');
  }, 30000);
});
