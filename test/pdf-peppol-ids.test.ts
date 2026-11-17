import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { convert } from '../src/index.js';
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
