import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type CanonicalInvoice, convert } from '../src/index.js';
import { toCii } from '../src/writers/cii.js';
import { toUbl } from '../src/writers/ubl.js';

const pdf = (name: string) => new Uint8Array(readFileSync(join(import.meta.dir, 'pdf-synth', `${name}.pdf`)));

async function read(name: string): Promise<CanonicalInvoice> {
  const outcome = (await convert(pdf(name), `${name}.pdf`, undefined, { extractPdf: true })).pdfOutcomes?.[0];
  if (outcome?.status !== 'ok') throw new Error(`not converted: ${outcome?.status}`);
  return outcome.invoices[0];
}

async function validated(xml: string, name: string) {
  const outcome = (await convert(new TextEncoder().encode(xml), name, undefined, { validate: true })).outcomes[0];
  if (outcome.status !== 'ok') throw new Error(`not converted: ${outcome.status}`);
  return outcome.invoices[0].source.validation!;
}

const unmapped = (inv: CanonicalInvoice) => inv.source.warnings.filter((w) => w.code === 'unmapped-text');

// Synthetic look-alikes of a Peppol viewer page (scripts/pdf-synth/cases): printed facts with an EN 16931 home are read,
// text used to read the layout or printed again is not reported, and the UBL stays valid
test('contact blocks, party IDs, invoiced object, document reference, means text, terms, bank and visiting address are read', async () => {
  const name = 'pdflib-peppol-kontakter-referenser';
  const inv = await read(name);
  expect(inv.buyer.contact).toEqual({ phone: '0100000020', email: 'faktura@exempelhus.invalid' });
  // Three seller numbers: the contact block's, the same one at "Frågor ang. fakturan" and the footer's, kept once each in page order
  expect(inv.seller.contact).toEqual({
    name: 'Testsson, Test',
    phone: '010-000 00 21\n010-000 00 22',
    email: 'kundtjanst@provhiss.invalid',
  });
  expect(inv.seller.identifiers).toEqual([{ value: '9999999000010', schemeId: '0088' }]);
  // The customer number is the buyer identifier; BT-46 holds one, so the printed GLN is reported and kept as unmapped text
  expect(inv.buyer.identifiers).toEqual([{ value: 'K-541' }]);
  expect(inv.source.warnings).toContainEqual(expect.objectContaining({ code: 'ambiguous', field: '/buyer/identifiers' }));
  expect(inv.buyer.vatId).toBe('SE999999011301');
  expect(inv.invoicedObjectId).toEqual({ value: 'OBJ-4711' });
  expect(inv.attachments).toEqual([{ kind: 'reference', id: '1141.pdf', description: 'COMMERCIAL INVOICE' }]);
  expect(inv.source.warnings).toContainEqual(expect.objectContaining({ code: 'attachment-not-embedded', field: '/attachments/0' }));
  expect(inv.payments[0]).toMatchObject({ meansCode: '30', meansText: 'Kontobaserad betalning' });
  expect(inv.source.derived.some((d) => d.field === '/payments/0/meansCode' || d.field.endsWith('/countryCode'))).toBe(false);
  // The issuer page repeats one of the terms sentences (not added again) and prints the late-payment interest
  expect(inv.paymentTerms).toBe(
    '30 dgr netto\nAllmänna villkor lämnas på begäran. Dröjsmålsränta: referensränta + 8 %.\nEfter förfallodagen debiteras ränta enligt räntelagen.',
  );
  expect(inv.notes).toEqual([{ text: 'Avser besiktning 2026\nProvgatan 3, hiss A\nBank: Testbanken' }]);
  expect(inv.seller.additionalLegalInfo).toBe('Besöksadress: Provgatan 9');
  // Text with no field is kept verbatim: the second buyer ID, the attached file's type and the issuer's remark
  expect(unmapped(inv).map((w) => w.region?.page)).toEqual([1, 1, 2]);
  expect(inv.source.unmappedText?.map((u) => u.text)).toEqual([
    'ID: 9999999000034 [0088]',
    '- Filtyp: application/pdf',
    'Från och med i år skickar vi fakturor i ny form.',
  ]);
  expect(toUbl(inv)).not.toContain('9999999000034');

  const ubl = toUbl(inv);
  expect(ubl).toContain('<cbc:ID schemeID="0088">9999999000010</cbc:ID>');
  expect(ubl).toContain('<cbc:ElectronicMail>faktura@exempelhus.invalid</cbc:ElectronicMail>');
  expect(ubl).toMatch(/<cbc:ID>OBJ-4711<\/cbc:ID>\s*<cbc:DocumentTypeCode>130<\/cbc:DocumentTypeCode>/);
  expect(ubl).toMatch(/<cbc:ID>1141\.pdf<\/cbc:ID>\s*<cbc:DocumentDescription>COMMERCIAL INVOICE<\/cbc:DocumentDescription>/);
  // Two accounts give two PaymentMeans; the means text is written once (UBL-SR-46)
  expect(ubl.match(/<cac:PaymentMeans>/g)).toHaveLength(2);
  expect(ubl.match(/name="Kontobaserad betalning"/g)).toHaveLength(1);
  const v = await validated(ubl, `${name}.xml`);
  expect(v.bundles.profile).toBe('peppol-bis3-3.0.21-ubl');
  expect({ schema: v.schema, semantic: v.semantic, profile: v.profile }).toEqual({
    schema: 'passed',
    semantic: 'passed',
    profile: 'passed',
  });
  expect(v.findings.filter((f) => f.severity === 'fatal')).toEqual([]);
  const c = await validated(toCii(inv), `${name}-cii.xml`);
  expect(c.semantic).toBe('passed');
  expect(c.findings.filter((f) => f.severity === 'fatal')).toEqual([]);
}, 120_000);

test('a buyer GLN is the buyer identifier, a seller DUNS a seller identifier; a scheme outside ISO 6523 is not read', async () => {
  const name = 'pdflib-peppol-kopar-id';
  const inv = await read(name);
  expect(inv.buyer.identifiers).toEqual([{ value: '9999999000027', schemeId: '0088' }]);
  expect(inv.seller.identifiers).toEqual([{ value: '999999999', schemeId: '0060' }]);
  expect(inv.buyer.contact).toEqual({ email: 'inkop@exempelbostader.invalid' });
  // "ID: ... [9955]": 9955 is no ISO 6523 code, so the line stays reported
  expect(unmapped(inv)).toHaveLength(1);

  const ubl = toUbl(inv);
  expect(ubl).toMatch(/<cac:AccountingCustomerParty>\s*<cac:Party>[\s\S]*<cbc:ID schemeID="0088">9999999000027<\/cbc:ID>/);
  const v = await validated(ubl, `${name}.xml`);
  expect({ schema: v.schema, semantic: v.semantic, profile: v.profile }).toEqual({
    schema: 'passed',
    semantic: 'passed',
    profile: 'passed',
  });
  expect(v.findings.filter((f) => f.severity === 'fatal')).toEqual([]);
}, 120_000);
