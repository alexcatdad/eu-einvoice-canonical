import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { convert } from '../src/index.js';
import { extractLayout } from '../src/pdf-extract/layout.js';
import { findQrCodes } from '../src/pdf-extract/qr.js';
import { analyseLines } from '../src/relations/rules.js';
import { toDecimal } from '../src/values.js';
import { toUbl } from '../src/writers/ubl.js';

const NAME = 'docx-bygg-bilagor';
const bytes = new Uint8Array(readFileSync(join(import.meta.dir, 'pdf-synth', `${NAME}.pdf`)));

// A 3-page construction invoice ("Sida k av 3") followed by attached supplier invoices, one with unmapped glyphs and
// one scanned with a payment QR code of another payee (scripts/pdf-synth/cases/docx-bygg-bilagor.json)
test('a multi-page invoice with attached documents converts to ok with nothing dropped, and its UBL passes Peppol BIS 3 except R010', async () => {
  const outcome = (await convert(bytes, `${NAME}.pdf`, undefined, { extractPdf: true })).pdfOutcomes?.[0];
  if (outcome?.status !== 'ok') throw new Error(`not converted: ${outcome?.status}`);
  const inv = outcome.invoices[0];
  expect(inv.source.warnings.filter((w) => w.code === 'unmapped-text')).toEqual([]);
  expect(inv.source.warnings.map((w) => w.code).sort()).toEqual(['identifier-check', 'joined-text']);

  // Attached pages 4-7, unchanged, as one PDF (BG-24); the page with unmapped glyphs and the scanned page included
  expect(inv.attachments).toHaveLength(1);
  const [a] = inv.attachments;
  if (a.kind !== 'embedded') throw new Error('not embedded');
  expect(a.mimeCode).toBe('application/pdf');
  const attached = Uint8Array.from(atob(a.base64), (c) => c.charCodeAt(0));
  const [whole, part] = await Promise.all([extractLayout(bytes), extractLayout(attached)]);
  expect(part.pages.map((p) => p.lines.map((l) => l.text))).toEqual(whole.pages.slice(3).map((p) => p.lines.map((l) => l.text)));
  expect((await PDFDocument.load(attached)).getPageCount()).toBe(4);
  expect(part.pages[3].imageCoverage).toBeGreaterThan(0.9);
  // The payment QR code on the scanned page is not the invoice's: it is decoded from the whole file, not from the invoice pages
  expect((await findQrCodes(bytes)).map((c) => c.region.page)).toEqual([7]);
  expect(await findQrCodes(bytes, 3)).toEqual([]);
  expect(inv.payments).toEqual([
    { meansCode: '30', remittanceInformation: '70418', creditTransfers: [{ accountId: '99990103', serviceProviderId: 'SE:BANKGIRO' }] },
  ]);
  expect(inv.totals).toMatchObject({ taxExclusive: '23809.02', vatTotal: '0.00', rounding: '-0.02', payable: '23809.00' });

  // Lines: 9 headings priced 0,00, 3 re-invoiced costs with their fee as a line charge, time lines with wrapped text
  expect(inv.lines).toHaveLength(18);
  const roles = analyseLines(inv).lineRoles;
  // A run of text-only lines: the first heads the lines after it, the others describe it (src/relations)
  expect(inv.lines.filter((l) => roles[l.id] !== 'item').map((l) => [roles[l.id], l.item.name])).toEqual([
    ['heading', 'MATERIAL OCH UNDERLEVERANTÖRER'],
    ['description', 'Maskinhyra'],
    ['heading', 'Rör och ventilationsmaterial'],
    ['heading', 'Underleverantör ventilation'],
    ['heading', 'ARBETSTID'],
    ['description', 'Anna'],
    ['heading', 'Bertil'],
    ['heading', 'RAPPORTERAT I PROJEKTPORTAL'],
    ['description', 'P-14, Etapp ett'],
  ]);
  expect(inv.lines.flatMap((l) => l.charges.map((c) => [l.price?.net, c.amount, l.netAmount].map(String)))).toEqual([
    ['2350.00', '94.00', '2444.00'],
    ['6725.50', '269.02', '6994.52'],
    ['9800.00', '392.00', '10192.00'],
  ]);
  expect(inv.lines[9]).toMatchObject({
    quantity: '1.00',
    unitCode: 'HUR',
    netAmount: '0.00',
    item: { name: '2026-03-02, Planering och beställning av material inför start', sellerId: 'AP' },
  });
  expect(inv.lines[17]).toMatchObject({ quantity: '4.00', unitCode: 'H87', netAmount: '756.00', item: { sellerId: '31' } });
  // One order number on every line: the purchase order reference (BT-13), kept on each line it is printed under
  expect(inv.purchaseOrderRef).toBe('AO-77031');
  expect(inv.lines.filter((l) => l.national?.orderReference === 'AO-77031')).toHaveLength(8);
  expect(inv.lines.some((l) => l.orderLineRef)).toBe(false);

  // Reverse charge: AE, rate 0, the printed statement as reason, VATEX-EU-AE
  expect(inv.vatBreakdown).toEqual<typeof inv.vatBreakdown>([
    {
      taxableAmount: toDecimal('23809.02'),
      taxAmount: toDecimal('0.00'),
      categoryCode: 'AE',
      rate: toDecimal('0'),
      exemptionReason: 'Omvänd betalningsskyldighet',
      exemptionReasonCode: 'VATEX-EU-AE',
    },
  ]);
  expect(new Set(inv.lines.map((l) => `${l.vat?.categoryCode} ${l.vat?.rate}`))).toEqual(new Set(['AE 0']));

  // Header, reference block and footer read once although printed on every page
  expect(inv.seller).toMatchObject({
    name: 'Provservice VVS och Ventilation i Exempelstad Aktiebolag',
    legalRegistrationId: { value: '9999990139' },
    vatId: 'SE999999013901',
    taxRegistrationId: 'Godkänd för F-Skatt',
    additionalLegalInfo: 'Företagets säte: Exempelstad',
    contact: { name: 'Kim Exempel', phone: '010-000 00 00', email: 'info@example.com' },
    address: { line1: 'Industrigatan 4', postalCode: '123 45', city: 'Exempelstad' },
  });
  expect(inv.buyer).toMatchObject({
    name: 'Testbostäder i Provby AB',
    vatId: 'SE999999014701',
    identifiers: [{ value: 'SE999999014701' }],
    contact: { name: 'Robin Prov' },
  });
  expect(inv.paymentTerms).toBe(
    'Netto 20 dagar. Reklamation senast 8 dagar\nefter fakturadatum. Frågor om fakturan\nbesvaras via: kundtjanst@example.com\nDröjsmålsränta 12,00 %',
  );
  expect(inv.notes).toEqual([{ text: '2026-03-20 kp' }]);

  const validated = (await convert(new TextEncoder().encode(toUbl(inv)), `${NAME}.xml`, undefined, { validate: true })).outcomes[0];
  if (validated.status !== 'ok') throw new Error(`UBL not converted: ${validated.status}`);
  const v = validated.invoices[0].source.validation!;
  expect({ schema: v.schema, semantic: v.semantic }).toEqual({ schema: 'passed', semantic: 'passed' });
  // No buyer electronic address (BT-49) is printed
  expect([...new Set(v.findings.filter((f) => f.severity === 'fatal').map((f) => f.ruleId))]).toEqual(['PEPPOL-EN16931-R010']);
}, 120_000);
