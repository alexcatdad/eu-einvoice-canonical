import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { convert } from '../src/index.js';
import { toCii } from '../src/writers/cii.js';
import { toUbl } from '../src/writers/ubl.js';

const pdf = (name: string) => new Uint8Array(readFileSync(join(import.meta.dir, 'pdf-synth', `${name}.pdf`)));

// Synthetic Peppol viewer renderings that print "Säljarens/Köparens PEPPOL-ID: ... [scheme]" (scripts/pdf-synth/cases)
for (const [name, seller, buyer, notes] of [
  [
    'pdflib-peppol-id-gln',
    { value: '9999999000010', schemeId: '0088' },
    { value: '9999990113', schemeId: '0007' },
    ['Aggregat 2, plan 3\nProvvägen 7'],
  ],
  [
    'pdflib-peppol-id-orgnr',
    { value: '9999990105', schemeId: '0007' },
    { value: '9999990113', schemeId: '0007' },
    [undefined, 'Utbildningsdag 2026-05-04'],
  ],
] as const) {
  test(`${name}: printed Peppol IDs are read, and its UBL passes Peppol BIS 3`, async () => {
    const outcome = (await convert(pdf(name), `${name}.pdf`, undefined, { extractPdf: true })).pdfOutcomes?.[0];
    if (outcome?.status !== 'ok') throw new Error(`not converted: ${outcome?.status}`);
    const inv = outcome.invoices[0];
    expect(inv.seller.endpoint).toEqual(seller);
    expect(inv.buyer.endpoint).toEqual(buyer);
    expect(inv.seller.legalRegistrationId).toEqual({ value: '9999990105', schemeId: '0007' });
    expect(inv.source.derived.some((d) => d.field.startsWith('/seller/endpoint'))).toBe(false);
    // "Anteckning:" under an item is its note (BT-127), written as cbc:Note on the invoice line
    expect(inv.lines.map((l) => l.note)).toEqual([...notes]);
    expect(inv.source.pdfProvenance?.[`/lines/${notes.length - 1}/note`]).toMatchObject({ page: 1 });

    const ubl = toUbl(inv);
    for (const n of notes) if (n) expect(ubl).toContain(`<cbc:Note>${n}</cbc:Note>`);
    const xml = new TextEncoder().encode(ubl);
    const validated = (await convert(xml, `${name}.xml`, undefined, { validate: true })).outcomes[0];
    if (validated.status !== 'ok') throw new Error(`UBL not converted: ${validated.status}`);
    const v = validated.invoices[0].source.validation!;
    expect(v.bundles.profile).toBe('peppol-bis3-3.0.21-ubl');
    expect({ schema: v.schema, semantic: v.semantic, profile: v.profile }).toEqual({
      schema: 'passed',
      semantic: 'passed',
      profile: 'passed',
    });
    expect(v.findings.filter((f) => f.severity === 'fatal')).toEqual([]);
  }, 120_000);
}

test('invoice note (BT-22), payment terms (BT-20) and item note (BT-127) are read, written to UBL and CII, and pass Peppol BIS 3; other text is reported', async () => {
  const name = 'pdflib-peppol-anteckning-villkor';
  const outcome = (await convert(pdf(name), `${name}.pdf`, undefined, { extractPdf: true })).pdfOutcomes?.[0];
  if (outcome?.status !== 'ok') throw new Error(`not converted: ${outcome?.status}`);
  const inv = outcome.invoices[0];
  expect(inv.notes).toEqual([{ text: 'Avser serviceavtal 2026\nRing före besök' }]);
  // Printed differently on the two pages: both kept, in page order; the second with its own region
  expect(inv.paymentTerms).toBe('30 dagar netto\nNetto 30 dagar från fakturadatum');
  expect(inv.source.pdfProvenance?.['/paymentTerms']).toMatchObject({ page: 1 });
  expect(inv.source.warnings).toContainEqual(
    expect.objectContaining({ code: 'joined-text', field: '/paymentTerms', region: expect.objectContaining({ page: 2 }) }),
  );
  expect(inv.lines[0].note).toBe('Aggregat 1-3\nTestgatan 12');
  expect(inv.lines[0].item.name).toBe('Serviceavtal kvartal 2');

  // Text that maps to no field: reported by region, without the text; none of it inside a value read
  const unmapped = inv.source.warnings.filter((w) => w.code === 'unmapped-text');
  expect(unmapped).toHaveLength(20);
  expect(unmapped.filter((w) => w.region?.page === 2)).toHaveLength(8);
  for (const w of unmapped) expect(w.message).toMatch(/^Printed text that maps to no invoice field \(\d+ text segments?\)$/);
  // "Telefon: 0100000000" under the buyer, and the issuer's remark on page 2
  expect(unmapped.some((w) => w.region?.page === 1 && Math.round(w.region.y) === 120)).toBe(true);
  expect(unmapped.some((w) => w.region?.page === 2 && Math.round(w.region.y) === 228)).toBe(true);

  const ubl = toUbl(inv);
  expect(ubl).toContain('<cbc:Note>Avser serviceavtal 2026\nRing före besök</cbc:Note>');
  expect(ubl).toMatch(/<cac:PaymentTerms>\s*<cbc:Note>30 dagar netto\nNetto 30 dagar från fakturadatum<\/cbc:Note>\s*<\/cac:PaymentTerms>/);
  expect(ubl).toContain('<cbc:Note>Aggregat 1-3\nTestgatan 12</cbc:Note>');
  const cii = toCii(inv);
  expect(cii).toContain('<ram:Content>Avser serviceavtal 2026\nRing före besök</ram:Content>');
  expect(cii).toContain('<ram:Description>30 dagar netto\nNetto 30 dagar från fakturadatum</ram:Description>');
  expect(cii).toContain('<ram:Content>Aggregat 1-3\nTestgatan 12</ram:Content>');

  const validated = (await convert(new TextEncoder().encode(ubl), `${name}.xml`, undefined, { validate: true })).outcomes[0];
  if (validated.status !== 'ok') throw new Error(`UBL not converted: ${validated.status}`);
  const v = validated.invoices[0].source.validation!;
  expect({ schema: v.schema, semantic: v.semantic, profile: v.profile }).toEqual({
    schema: 'passed',
    semantic: 'passed',
    profile: 'passed',
  });
  expect(v.findings.filter((f) => f.severity === 'fatal')).toEqual([]);
}, 120_000);
