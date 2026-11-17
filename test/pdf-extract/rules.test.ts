import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { convert, PdfRuleError, schemaVersion } from '../../src/index.js';
import { buildExtraction } from '../../src/pdf-extract/generic/build.js';
import { readInvoice } from '../../src/pdf-extract/generic.js';
import { extractPdfInvoice, type PdfExtraction } from '../../src/pdf-extract/index.js';
import { extractLayout } from '../../src/pdf-extract/layout.js';
import { applyRules, BUNDLED_PROFILES, loadPdfRuleSet, PDFJS_VERSION, type PdfRuleSet } from '../../src/pdf-extract/rules/index.js';

/** Synthetic identifiers with valid check digits; no real company. */
const ID = { org: '559900-1236', vat: 'SE559900123601', bankgiro: '123-4566', otherVat: 'SE556677889901' };
const SHA = 'f'.repeat(64);

type Text = [x: number, y: number, text: string, size?: number];

/** A synthetic Swedish invoice from a made-up generator; `edit` replaces or drops texts by content. */
async function pdf(edit: Record<string, string | null> = {}, extra: Text[] = [], producer = 'Synthetic Invoicer 1.0'): Promise<Uint8Array> {
  const texts: Text[] = [
    [60, 30, 'Testbolaget AB', 16],
    [330, 70, 'Fakturanummer'],
    [450, 70, 'Fakturadatum'],
    [330, 82, '5001'],
    [450, 82, '2026-03-02'],
    [330, 100, 'Förfallodatum'],
    [430, 100, '2026-04-01'],
    [60, 100, 'Fakturaadress'],
    [60, 112, 'Kund Ett AB'],
    [60, 124, 'Gatan 5'],
    [60, 136, '111 22 STADEN'],
    [60, 170, 'Benämning'],
    [300, 170, 'Antal'],
    [340, 170, 'Enh'],
    [400, 170, 'À-pris'],
    [500, 170, 'Summa'],
    [60, 186, 'Konsultarbete'],
    [300, 186, '10'],
    [340, 186, 'tim'],
    [400, 186, '1 000,00'],
    [500, 186, '10 000,00'],
    [60, 300, 'Netto'],
    [160, 300, 'Moms %'],
    [240, 300, 'Moms kr'],
    [480, 300, 'Att betala'],
    [60, 312, '10 000,00'],
    [160, 312, '25'],
    [240, 312, '2 500,00'],
    [480, 312, '12 500,00 kr'],
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
  ];
  const doc = await PDFDocument.create();
  doc.setProducer(producer);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  for (const [x, y, raw, size = 9] of [...texts, ...extra]) {
    const text = raw in edit ? edit[raw] : raw;
    if (text !== null) page.drawText(text, { x, y: 842 - y - size, size, font });
  }
  return doc.save();
}

const base = { $schema: `../../schemas/pdf-rule-set.${schemaVersion}.schema.json`, version: 1, pdfjsVersion: PDFJS_VERSION };
const profile = (layouts: PdfRuleSet['layouts'], extra: Partial<PdfRuleSet> = {}): PdfRuleSet =>
  loadPdfRuleSet({
    ...base,
    kind: 'generator-profile',
    id: 'synthetic-invoicer',
    match: { producer: ['synthetic invoicer'] },
    layouts,
    ...extra,
  });
const template = (
  layouts: PdfRuleSet['layouts'],
  match: PdfRuleSet['match'] = { bankgiro: [ID.bankgiro] },
  id = 'testbolaget',
): PdfRuleSet => loadPdfRuleSet({ ...base, kind: 'issuer-template', id, match, layouts });

/** Runs the layers directly (profiles are bundled, so tests pass their own). */
async function run(bytes: Uint8Array, profiles: PdfRuleSet[] = [], templates: PdfRuleSet[] = []): Promise<PdfExtraction> {
  const layout = await extractLayout(bytes);
  return buildExtraction(applyRules(layout, readInvoice(layout), profiles, templates), { fileSha256: SHA });
}
const status = (r: PdfExtraction) => r.status;
function draft(r: PdfExtraction) {
  if (r.status !== 'draft') throw new Error(`expected draft, got ${r.status}`);
  return r.draft;
}
function ok(r: PdfExtraction) {
  if (r.status !== 'ok') throw new Error(`expected ok, got ${r.status}: ${JSON.stringify(r)}`);
  return r.invoice;
}

// "Slutsumma" is not in the generic lexicon, so the generic rules do not read the amount due
const SLUT = { 'Att betala': 'Slutsumma' };

describe('rule-set loader and schema', () => {
  const schema = JSON.parse(readFileSync(join(import.meta.dir, '../../schemas', `pdf-rule-set.${schemaVersion}.schema.json`), 'utf8'));
  const validate = new Ajv2020({ strict: false }).compile(schema);
  const valid = [
    { ...base, kind: 'generator-profile', id: 'p', match: { creator: ['x'] }, layouts: [{ name: 'a', fingerprint: ['y'] }] },
    {
      ...base,
      kind: 'issuer-template',
      id: 'issuer-1',
      match: { orgNumber: [ID.org], keywords: ['k'] },
      layouts: [
        {
          name: 'one',
          fields: { '/id': { label: 'Nr', value: 'inline' }, '/totals/payable': { region: { x: 1, y: 2, width: 3, height: 4 }, page: 2 } },
          lines: { columns: { Text: 'desc', Belopp: 'amount' }, optional: true },
          addresses: {
            seller: { label: 'Avsändare', name: 'auto' },
            buyer: { label: 'Kund', region: { x: 0, y: 10, width: 100, height: 10 }, name: true },
          },
          defaults: { currency: 'SEK', paymentMeansCode: '30' },
        },
      ],
    },
  ];
  const invalid: [unknown, string][] = [
    [{ ...valid[0], kind: 'other' }, '/kind'],
    [{ ...valid[0], id: 'Not Valid' }, '/id'],
    [{ ...valid[0], version: 0 }, '/version'],
    [{ ...valid[0], layouts: [] }, '/layouts'],
    [{ ...valid[0], match: { creator: 'x' } }, '/match/creator'],
    [{ ...valid[0], layouts: [{ name: 'a', fields: { '/id': { label: 'Nr', value: 'left' } } }] }, '/value'],
    [{ ...valid[0], layouts: [{ name: 'a', lines: { columns: { Text: 'description' } } }] }, '/lines/columns'],
    [{ ...valid[0], layouts: [{ name: 'a', addresses: { seller: { label: 'A', name: 'maybe' } } }] }, '/addresses/seller/name'],
    [{ ...valid[0], layouts: [{ name: 'a', fields: { '/id': { label: 'Nr', labelMatch: 'end' } } }] }, '/labelMatch'],
  ];

  test('valid samples pass the loader and the published schema', () => {
    for (const v of valid) {
      expect(loadPdfRuleSet(v)).toBe(v as never);
      expect(validate(v)).toBe(true);
    }
  });

  test('invalid samples fail the loader and the published schema, naming the path', () => {
    for (const [v, path] of invalid) {
      expect(() => loadPdfRuleSet(v)).toThrow(path);
      expect(validate(v)).toBe(false);
    }
  });

  test('the loader also rejects what the open schema cannot: unknown properties and fields, wrong selectors per kind', () => {
    expect(() => loadPdfRuleSet({ ...valid[0], extra: 1 })).toThrow('/extra: unknown property');
    expect(() => loadPdfRuleSet({ ...valid[0], layouts: [{ name: 'a', fields: { '/lines/0/netAmount': { label: 'x' } } }] })).toThrow(
      'not a field a rule can read',
    );
    expect(() => loadPdfRuleSet({ ...valid[0], match: { orgNumber: [ID.org] } })).toThrow('producer, creator or layout fingerprint only');
    // Without producer or creator, every layout needs a fingerprint
    expect(() => loadPdfRuleSet({ ...valid[0], match: {}, layouts: [{ name: 'a' }] })).toThrow('needs a fingerprint on every layout');
    expect(loadPdfRuleSet({ ...valid[0], match: {}, layouts: [{ name: 'a', fingerprint: ['x'] }] }).id).toBe(valid[0].id);
    expect(() => loadPdfRuleSet({ ...valid[1], match: { producer: ['x'] } })).toThrow('identifiers or keywords only');
    expect(() => loadPdfRuleSet({ ...valid[0], layouts: [{ name: 'a', fields: { '/id': {} } }] })).toThrow('needs a label or a region');
  });

  test('PDFJS_VERSION is the exact pdfjs-dist pin', () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dir, '../../package.json'), 'utf8'));
    expect(pkg.dependencies['pdfjs-dist']).toBe(PDFJS_VERSION);
  });
});

describe('rule layers', () => {
  test('without rule sets the generic result stands; a missing label leaves a draft', async () => {
    expect(status(await run(await pdf()))).toBe('ok');
    expect(draft(await run(await pdf(SLUT))).problems.map((p) => p.field)).toContain('/totals/payable');
  }, 30000);

  test('a generator profile selected by Producer and fingerprint reads the field, with its region', async () => {
    const p = profile([{ name: 'v1', fingerprint: ['slutsumma'], fields: { '/totals/payable': { label: 'Slutsumma', value: 'below' } } }]);
    const inv = ok(await run(await pdf(SLUT), [p]));
    expect(String(inv.totals.payable)).toBe('12500.00');
    expect(inv.source.pdfProvenance?.['/totals/payable']).toMatchObject({ page: 1, x: 480 });
    // Another producer, or no matching fingerprint: not applied
    expect(status(await run(await pdf(SLUT, [], 'Other Writer'), [p]))).toBe('draft');
    const unprinted = profile([
      { name: 'v1', fingerprint: ['not printed'], fields: { '/totals/payable': { label: 'Slutsumma', value: 'below' } } },
    ]);
    expect(status(await run(await pdf(SLUT), [unprinted]))).toBe('draft');
  }, 30000);

  test('an override that does not match gives a problem and removes the earlier value', async () => {
    const p = profile([{ name: 'v1', fields: { '/id': { label: 'Fakturanummer', value: 'right' } } }]);
    const d = draft(await run(await pdf(), [p]));
    expect(d.fields['/id']).toBeUndefined();
    expect(d.problems).toContainEqual(expect.objectContaining({ code: 'rule-no-match', field: '/id' }));
    expect(d.problems.find((x) => x.field === '/id')?.message).toStartWith('synthetic-invoicer v1 (v1):');
    // Optional: a label that is not printed keeps the generic value
    const opt = profile([{ name: 'v1', fields: { '/id': { label: 'Invoice no', optional: true } } }]);
    expect(ok(await run(await pdf(), [opt])).id).toBe('5001');
  }, 30000);

  test('values from regions: page coordinates, relative to a label, inline after a label', async () => {
    const bytes = await pdf({ Fakturanummer: 'Ref', '5001': null }, [[60, 60, 'Löpnr: 7002']]);
    expect(draft(await run(bytes)).fields['/id']).toBeUndefined();
    const inline = profile([{ name: 'v1', fields: { '/id': { label: 'Löpnr', value: 'inline' } } }]);
    expect(ok(await run(bytes, [inline])).id).toBe('7002');
    const region = profile([{ name: 'v1', fields: { '/totals/payable': { region: { x: 470, y: 310, width: 100, height: 20 } } } }]);
    expect(String(ok(await run(await pdf(SLUT), [region])).totals.payable)).toBe('12500.00');
    const relative = profile([
      { name: 'v1', fields: { '/totals/payable': { label: 'Slutsumma', region: { x: -5, y: 8, width: 100, height: 15 } } } },
    ]);
    expect(String(ok(await run(await pdf(SLUT), [relative])).totals.payable)).toBe('12500.00');
  }, 30000);

  test('a table definition reads lines under a header the generic rules do not know, replacing their lines', async () => {
    const bytes = await pdf({ Benämning: 'Tjänst och tid' });
    expect(status(await run(bytes))).toBe('draft');
    const p = profile([
      { name: 'v1', lines: { columns: { 'Tjänst och tid': 'desc', Antal: 'qty', Enh: 'unit', 'À-pris': 'price', Summa: 'amount' } } },
    ]);
    const inv = ok(await run(bytes, [p]));
    expect(inv.lines.map((l) => [l.item.name, l.quantity, l.netAmount])).toEqual([['Konsultarbete', '10', '10000.00']]);
    const absent = profile([{ name: 'v1', lines: { columns: { Artikel: 'desc', Belopp: 'amount' } } }]);
    const d = draft(await run(await pdf(), [absent]));
    expect(d.fields['/lines/0/netAmount']).toBeUndefined();
    expect(d.problems).toContainEqual(expect.objectContaining({ code: 'rule-no-match', field: '/lines' }));
  }, 30000);

  test('the issuer template overrides the profile; it is selected by an identifier printed for the seller', async () => {
    const field = '/seller/taxRegistrationId';
    const p = profile([{ name: 'v1', fields: { [field]: { region: { x: 325, y: 735, width: 150, height: 12 } } } }]);
    const t = template([{ name: 'main', fields: { [field]: { label: 'Org.nr', value: 'below' } } }]);
    expect(ok(await run(await pdf(), [p])).seller.taxRegistrationId).toBe('Godkänd för F-skatt');
    expect(ok(await run(await pdf(), [p], [t])).seller.taxRegistrationId).toBe(ID.org);
    // The seller the generic rules read has another VAT number: the template is for another issuer
    const other = template([{ name: 'main', fields: { [field]: { label: 'Org.nr', value: 'below' } } }], {
      sellerVatId: [ID.otherVat],
      bankgiro: [ID.bankgiro],
    });
    expect(ok(await run(await pdf(), [p], [other])).seller.taxRegistrationId).toBe('Godkänd för F-skatt');
    // Keywords select too; two matching templates: none applied, reported
    const kw = template([{ name: 'main' }], { keywords: ['godkänd för f-skatt'] }, 'kw');
    expect(draft(await run(await pdf(), [], [t, kw])).problems).toContainEqual(expect.objectContaining({ code: 'ambiguous-rules' }));
  }, 30000);

  test('payment accounts and check digits: an account read by a rule keeps the transfer order and fails like generic values', async () => {
    const moved = (account: string) =>
      pdf({ Bankgiro: null, [ID.bankgiro]: null }, [
        [60, 760, 'Betala till'],
        [60, 772, account],
      ]);
    const rule = { name: 'main', fields: { '/payments/0/bankgiro': { label: 'Betala till', value: 'below' as const } } };
    expect(ok(await run(await moved('1234566'))).payments).toEqual([]);
    const inv = ok(await run(await moved('1234566'), [], [template([rule], { orgNumber: [ID.org] })]));
    expect(inv.payments[0].creditTransfers).toEqual([{ accountId: '1234566', serviceProviderId: 'SE:BANKGIRO' }]);
    const d = draft(await run(await moved('1234567'), [], [template([rule], { orgNumber: [ID.org] })]));
    expect(d.problems).toContainEqual(expect.objectContaining({ code: 'identifier-check', field: '/payments/0/bankgiro' }));
  }, 30000);

  test('defaults apply only where nothing was read and are recorded as derived, never as printed', async () => {
    const bytes = await pdf({ '12 500,00 kr': '12 500,00', 'Moms kr': 'Moms belopp' });
    expect(draft(await run(bytes)).problems.map((p) => p.field)).toContain('/currency');
    const p = profile([{ name: 'v1', defaults: { currency: 'SEK' } }]);
    const inv = ok(await run(bytes, [p]));
    expect(inv.currency).toBe('SEK');
    expect(inv.source.derived).toContainEqual({ field: '/currency', rule: 'Default of rule set synthetic-invoicer v1 (v1)' });
    expect(inv.source.pdfProvenance?.['/currency']).toBeUndefined();
    const eur = profile([{ name: 'v1', defaults: { currency: 'EUR' } }]);
    expect(ok(await run(await pdf(), [eur])).currency).toBe('SEK');
  }, 30000);

  test('a label can be matched by its start, for labels followed by varying text', async () => {
    // On a line of its own: a text right of "Fakturaadress" would end the generic buyer address
    const bytes = await pdf({ Förfallodatum: null, '2026-04-01': null }, [
      [330, 50, 'Förfallodatum (30 d)'],
      [430, 50, '2026-04-02'],
    ]);
    expect(ok(await run(bytes)).dueDate).toBeUndefined();
    const p = profile([{ name: 'v1', fields: { '/dueDate': { label: 'Förfallodatum (', labelMatch: 'start' } } }]);
    expect(String(ok(await run(bytes, [p])).dueDate)).toBe('2026-04-02');
  }, 30000);

  test('address blocks: the name line is taken only where the layout leaves no doubt', async () => {
    const block = (lines: string[], edit: Record<string, string | null> = {}) =>
      pdf({ Adress: null, 'Box 9': null, '222 33 ORTEN': null, ...edit }, [
        [60, 600, 'Avsändare'],
        ...lines.map((t, i): Text => [60, 612 + 12 * i, t]),
      ]);
    const p = profile([{ name: 'v1', addresses: { seller: { label: 'Avsändare', name: 'auto' } } }]);
    // The first line repeats the name printed at the top
    const same = ok(await run(await block(['Testbolaget AB', 'Box 7', '333 44 BYN']), [p]));
    expect([same.seller.name, same.seller.address?.line1, same.seller.address?.postalCode]).toEqual(['Testbolaget AB', 'Box 7', '333 44']);
    // The first line is not the name printed at the top: two street lines
    const streets = ok(await run(await block(['Box 7', 'Gatan 1', '333 44 BYN']), [p]));
    expect([streets.seller.name, streets.seller.address?.line1, streets.seller.address?.line2]).toEqual([
      'Testbolaget AB',
      'Box 7',
      'Gatan 1',
    ]);
    // No name at the top: three lines above the postal line and a company form, so the first is the name
    const named = ok(await run(await block(['Blockbolaget AB', 'Box 7', 'Gatan 1', '333 44 BYN'], { 'Testbolaget AB': null }), [p]));
    expect([named.seller.name, named.seller.address?.line2]).toEqual(['Blockbolaget AB', 'Gatan 1']);
    const noForm = draft(await run(await block(['Blockets kontor', 'Box 7', 'Gatan 1', '333 44 BYN'], { 'Testbolaget AB': null }), [p]));
    expect(noForm.problems).toContainEqual(expect.objectContaining({ code: 'rule-no-match', field: '/seller/address' }));
    // No name at the top and two lines: name and street, or two streets; reported, not guessed
    const d = draft(await run(await block(['Blockbolaget AB', 'Box 7', '333 44 BYN'], { 'Testbolaget AB': null }), [p]));
    expect(d.fields['/seller/address/line1']).toBeUndefined();
    expect(d.problems).toContainEqual(expect.objectContaining({ code: 'rule-no-match', field: '/seller/address' }));
  }, 30000);

  test('a rule set for another pdfjs-dist version is not applied and is reported', async () => {
    const p = profile([{ name: 'v1', fields: { '/totals/payable': { label: 'Slutsumma', value: 'below' } } }], { pdfjsVersion: '1.0.0' });
    const d = draft(await run(await pdf(SLUT), [p]));
    expect(d.problems).toContainEqual(expect.objectContaining({ code: 'rules-version' }));
    expect(d.fields['/totals/payable']).toBeUndefined();
  }, 30000);
});

describe('caller templates through the API', () => {
  const t = template([{ name: 'main', fields: { '/totals/payable': { label: 'Slutsumma', value: 'below' } } }]);

  test('extractPdfInvoice and convert apply issuer templates from the options', async () => {
    const bytes = await pdf(SLUT);
    expect(status(await extractPdfInvoice(bytes, { fileSha256: SHA, templates: [t] }))).toBe('ok');
    const r = await convert(bytes, 'synthetic.pdf', undefined, { extractPdf: { templates: [t] } });
    expect(r.pdfOutcomes?.[0].status).toBe('ok');
    expect((await convert(bytes, 'synthetic.pdf', undefined, { extractPdf: true })).pdfOutcomes?.[0].status).toBe('draft');
  }, 30000);

  test('an invalid template, or a generator profile passed as a template, throws PdfRuleError', async () => {
    const bytes = await pdf();
    await expect(convert(bytes, 'synthetic.pdf', undefined, { extractPdf: { templates: [{ ...t, version: 'x' }] } })).rejects.toThrow(
      PdfRuleError,
    );
    const p = profile([{ name: 'v1' }]);
    await expect(extractPdfInvoice(bytes, { fileSha256: SHA, templates: [p] })).rejects.toThrow('issuer templates only');
  }, 30000);
});

describe('bundled generator profiles', () => {
  test('every bundled profile is valid for the pinned pdfjs-dist version', () => {
    expect(BUNDLED_PROFILES.map((p) => [p.id, p.kind, p.pdfjsVersion])).toEqual([
      ['visma-spcs', 'generator-profile', PDFJS_VERSION],
      ['peppol-bis-viewer-sv', 'generator-profile', PDFJS_VERSION],
    ]);
  });

  test('the Visma profile reads the footer address block of a synthetic page in its layout', async () => {
    // A text right of "Adress" (as in that layout) stops the generic rules from reading the block under it
    const extra: Text[] = [
      [130, 700, 'Telefon'],
      [330, 760, 'Företagets säte'],
      [430, 760, 'Organisationsnr'],
      [330, 150, 'Vår referens'],
    ];
    const extract = async (producer: string) => extractPdfInvoice(await pdf({}, extra, producer), { fileSha256: SHA });
    const d = draft(await extract('Other Writer'));
    expect(d.problems.map((p) => p.field)).toContain('/seller/address');
    const inv = ok(await extract('cairo 1.12.8 (synthetic)'));
    expect(inv.seller.address).toMatchObject({ line1: 'Box 9', postalCode: '222 33', city: 'ORTEN' });
    expect(inv.source.pdfProvenance?.['/seller/address/line1']).toMatchObject({ page: 1, x: 60 });
  }, 30000);
});
