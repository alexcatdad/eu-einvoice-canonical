/**
 * A construction-company invoice over several pages with documents attached after it, as invoicing software prints one:
 * a letterhead and reference block repeated on every page with "Sida k av N", an item table with a second header line
 * (order number), cost-group headings and person headings priced 0,00, re-invoiced costs each followed by a fee row
 * included in their amount, dated time lines whose text wraps, totals on the last page with reverse charge and
 * öresavrundning, a remark under the amount due, and a footer repeated on every page. Supplier invoices (pages of
 * other synthetic cases, one with unmapped glyphs) and a scanned page with a payment QR code follow the invoice.
 * All names, numbers and texts are invented.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { zlibSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { encodeQR } from 'qr';
import { luhn } from '../../src/pdf-extract/se/identifiers.js';
import type { Truth } from '../pdf-eval/score.js';
import { type CaseSpec, fmtAmount, type Model, type Printed } from './model.js';

export type Row =
  | { heading: string }
  | { cost: string; price: string; fee: string; order: string }
  | { art: string; text: string[]; qty: string; unit: string; price: string; order?: string };

export interface Construction {
  /** The seller's name as the letterhead prints it, over two lines; the footer splits it differently. */
  sellerLines: [string, string];
  footerLines: [string, string];
  street: string;
  postal: string;
  phone: string;
  email: string;
  seat: string;
  contact: string;
  buyerContact: string;
  terms: string[];
  interest: string;
  /** Item rows per invoice page; the totals stand alone on the last page. */
  pages: Row[][];
  statement: string;
  remark: string;
  /** Pages attached after the invoice: `case:<file>` (all pages of another case) or `scan` (an image with a payment QR code). */
  attachments: string[];
}

const ore = (s: string) => Math.round(Number(s) * 100);
const sv = (s: string) => fmtAmount(ore(s));
const key = (o: number) => (o / 100).toFixed(2);
const vatId = (org: string) => `SE${org}01`;
const net = (r: Row) => ('cost' in r ? ore(r.price) + ore(r.fee) : 'art' in r ? Math.round(Number(r.qty) * ore(r.price)) : 0);

export function buildConstruction(spec: CaseSpec): Model {
  const c = spec.construction!;
  const s = spec.seller;
  const fail = (m: string) => {
    throw new Error(`${spec.file}: ${m}`);
  };
  for (const d of [s.orgnr, s.bankgiro, spec.buyer.orgnr]) if (!d || !luhn(d)) fail('identifiers must pass Luhn');
  if (c.sellerLines.join(' ') !== s.name || c.footerLines.join(' ') !== s.name) fail('name lines must join to the seller name');
  if (spec.buyer.orgnr === s.orgnr) fail('buyer and seller need different org.nr');
  const rows = c.pages.flat();
  for (const r of rows) if ('cost' in r && Math.round(ore(r.price) * 0.04) !== ore(r.fee)) fail(`fee of ${r.cost} is not 4 %`);
  const total = rows.reduce((a, r) => a + net(r), 0);
  const payable = Math.round(total / 100) * 100;
  const rounding = payable - total;
  const buyerVat = vatId(spec.buyer.orgnr!);
  const giro = `${s.bankgiro!.slice(0, -4)}-${s.bankgiro!.slice(-4)}`;
  const orders = [...new Set(rows.flatMap((r) => ('order' in r && r.order ? [r.order] : [])))];

  const items: Printed['items'] = {
    header: ['Artikelnr', 'Beskrivning', 'Antal Enhet', 'À-pris', 'Rabatt', 'Moms %', 'Belopp exkl. moms'],
    rows: rows.flatMap((r): string[][] => {
      if ('heading' in r) return [['', r.heading, '', '0,00', '', '', '']];
      if ('cost' in r)
        return [
          ['', r.cost, '1,00', sv(r.price), '', '', fmtAmount(net(r))],
          ['', '', r.order, '', '', '', ''],
          ['', 'Avgift', '', sv(r.fee), '', '', ''],
        ];
      const amount = ore(r.price) ? fmtAmount(net(r)) : '';
      return [
        [r.art, r.text.join('\n'), `${sv(r.qty)} ${r.unit}`, sv(r.price), '', '', amount],
        ...(r.order ? [['', '', r.order, '', '', '', '']] : []),
      ];
    }),
  };
  const printed: Printed = {
    title: 'Faktura',
    seller: [...c.sellerLines, c.street, c.postal],
    buyerLabel: '',
    buyer: [spec.buyer.name, ...spec.buyer.address],
    meta: [
      ['Fakturanr', spec.number],
      ['Kundnr', buyerVat],
      ['Fakturadatum', spec.issueDate],
      ['Er referenskod', ''],
      ['Vår referens', c.contact],
      ['Er referens', ''],
      ['Betalningsvillkor', c.terms.join(' ')],
      ['Er kontakt', c.buyerContact],
      ['Ert momsreg.nr', buyerVat],
      ['Förfallodatum', spec.dueDate],
      ['Leveransvillkor', ''],
      ['Dröjsmålsränta', c.interest],
      ['Leveransdatum', ''],
      ['OCR betalningsref.', spec.number],
    ],
    items,
    totals: [
      ['Ej momspl.', fmtAmount(total)],
      ['Öresavrundning', fmtAmount(rounding)],
      ['Summa exkl. moms', fmtAmount(total)],
      ['Att betala', `${fmtAmount(payable)} SEK`],
    ],
    notes: [c.remark, c.statement],
    payment: [['Bankgiro', giro]],
    footer: [
      ...c.footerLines,
      c.street,
      c.postal,
      'Telefon',
      c.phone,
      'E-post',
      c.email,
      'Organisationsnr',
      s.orgnr,
      'Momsreg.nr',
      vatId(s.orgnr),
      'Företagets säte',
      c.seat,
      'Godkänd för F-Skatt',
    ],
  };
  const absent = { status: 'absent' as const };
  const v = (x: string | undefined) => (x === undefined ? absent : { value: x });
  const truth: Omit<Truth, 'sha256'> = {
    schemaVersion: 1,
    file: `${spec.file}.pdf`,
    documentType: 'invoice',
    typeCode: '380',
    invoicePages: c.pages.map((_, i) => i + 1).concat(c.pages.length + 1),
    pricesIncludeVat: false,
    fields: {
      id: v(spec.number),
      issueDate: v(spec.issueDate),
      dueDate: v(spec.dueDate),
      currency: v('SEK'),
      'seller.name': v(s.name),
      'seller.legalRegistrationId': v(s.orgnr),
      'seller.vatId': v(vatId(s.orgnr)),
      'seller.taxRegistrationId': v('Godkänd för F-Skatt'),
      'buyer.name': v(spec.buyer.name),
      'payee.name': absent,
      'payment.bankgiro': v(s.bankgiro),
      'payment.plusgiro': absent,
      'payment.iban': absent,
      'payment.bic': absent,
      'payment.remittanceInformation': v(spec.number),
      'totals.lineNetTotal': absent,
      'totals.allowanceTotal': absent,
      'totals.chargeTotal': absent,
      'totals.taxExclusive': v(key(total)),
      'totals.vatTotal': absent,
      'totals.taxInclusive': absent,
      'totals.prepaid': absent,
      'totals.prepaidNote': absent,
      'totals.rounding': v(key(rounding)),
      'totals.payable': v(key(payable)),
    },
    vatBreakdown: {
      rows: [{ categoryCode: 'AE', rate: absent, taxableAmount: v(key(total)), taxAmount: absent, exemptionReason: v(c.statement) }],
    },
    lines: {
      rows: rows.map((r) => {
        if ('heading' in r)
          return {
            'item.name': v(r.heading),
            quantity: absent,
            unitText: absent,
            'price.net': v('0.00'),
            'vat.rate': absent,
            netAmount: absent,
          };
        if ('cost' in r)
          return {
            'item.name': v(r.cost),
            quantity: v('1.00'),
            unitText: absent,
            'price.net': v(r.price),
            'vat.rate': absent,
            netAmount: v(key(net(r))),
          };
        return {
          'item.name': v(r.text.join(' ')),
          quantity: v(r.qty),
          unitText: v(r.unit),
          'price.net': v(r.price),
          'vat.rate': absent,
          netAmount: ore(r.price) ? v(key(net(r))) : absent,
        };
      }),
    },
    expectedProblems: [
      {
        path: 'fields.payment.remittanceInformation',
        kind: 'identifier-check',
        detail: 'OCR reference is the invoice number, no check digit',
      },
    ],
    notes: `Synthetic (scripts/pdf-synth): ${spec.covers}. One order number on every line: ${orders.join(', ')}.`,
  };
  return { spec, printed, truth };
}

export async function toConstructionDocx(m: Model): Promise<Uint8Array> {
  const c = m.spec.construction!;
  const p = m.printed;
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const noBorders = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
  const para = (text: string, o: { bold?: boolean; size?: number; right?: boolean } = {}) =>
    new Paragraph({
      alignment: o.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
      children: [new TextRun({ text, bold: o.bold, size: o.size })],
    });
  const cell = (text: string, width: number, o: { bold?: boolean; right?: boolean; size?: number } = {}) =>
    new TableCell({
      width: { size: width, type: WidthType.PERCENTAGE },
      children: text.split('\n').map((t) => para(t, o)),
    });
  const table = (rows: string[][], widths: number[], o: { right?: (k: number) => boolean; header?: number; size?: number } = {}) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: noBorders,
      rows: rows.map(
        (r, i) =>
          new TableRow({
            tableHeader: i < (o.header ?? 0),
            cantSplit: true,
            children: r.map((t, k) => cell(t, widths[k], { right: o.right?.(k), bold: i < (o.header ?? 0), size: o.size })),
          }),
      ),
    });
  const meta = Object.fromEntries(p.meta);
  // "Sida k av N" with Word's page fields
  const pageCell = new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [new TextRun({ children: ['Sida ', PageNumber.CURRENT, ' av ', PageNumber.TOTAL_PAGES] })],
  });
  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          cell(c.sellerLines.join('\n'), 45),
          new TableCell({ width: { size: 40, type: WidthType.PERCENTAGE }, children: [para('')] }),
          new TableCell({ width: { size: 15, type: WidthType.PERCENTAGE }, children: [pageCell] }),
        ],
      }),
    ],
  });
  const ids = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      ['', 'Faktura', '', ''],
      [c.street, '', '', ''],
      [c.postal, 'Fakturanr', 'Kundnr', 'Fakturadatum'],
      ['', meta.Fakturanr, meta.Kundnr, meta.Fakturadatum],
    ].map((r) => new TableRow({ children: r.map((t, k) => cell(t, [45, 15, 22, 18][k])) })),
  });
  const buyer = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: p.buyer.map((t) => new TableRow({ children: [cell('', 55), cell(t, 45)] })),
  });
  const refs = table(
    [
      ['Er referenskod', '', 'Vår referens', meta['Vår referens']],
      ['Er referens', '', 'Betalningsvillkor', c.terms.join('\n')],
      ['Er kontakt', meta['Er kontakt'], '', ''],
      ['Ert momsreg.nr', meta['Ert momsreg.nr'], 'Förfallodatum', meta.Förfallodatum],
      ['Leveransvillkor', '', 'Dröjsmålsränta', meta.Dröjsmålsränta],
      ['Leveransdatum', '', 'OCR betalningsref.', meta['OCR betalningsref.']],
    ],
    [15, 30, 18, 37],
    { size: 16 },
  );
  const widths = [8, 38, 12, 9, 10, 8, 15];
  const numeric = (k: number) => k >= 3;
  const itemTable = (rows: string[][]) =>
    table([p.items!.header, ['', '', 'Ordernr', '', 'Följesedel', '', 'Leveransdatum'], ...rows], widths, {
      right: numeric,
      header: 2,
      size: 16,
    });
  // Item rows per page, as the spec splits them
  const perPage: string[][][] = [];
  let at = 0;
  for (const page of c.pages) {
    const n = page.reduce((a, r) => a + ('cost' in r ? 3 : 'art' in r && r.order ? 2 : 1), 0);
    perPage.push(p.items!.rows.slice(at, at + n));
    at += n;
  }
  const t = Object.fromEntries(p.totals);
  const totals = table(
    [
      ['Avgift', 'Rabatt', 'Moms %', 'Momspl. belopp', 'Momsbelopp', 'Ej momspl.', 'Öresavrundning', 'Summa exkl. moms'],
      ['', '', '', '', '', t['Ej momspl.'], t.Öresavrundning, t['Summa exkl. moms']],
    ],
    [10, 10, 9, 14, 13, 14, 15, 15],
    { right: (k) => k >= 3, size: 16 },
  );
  const footer = new Footer({
    children: [
      table(
        [
          [c.footerLines[0], 'Telefon', 'Bankgiro', 'Organisationsnr'],
          [c.footerLines[1], c.phone, p.payment[0][1], m.spec.seller.orgnr],
          [c.street, 'E-post', '', 'Momsreg.nr'],
          [c.postal, c.email, '', vatId(m.spec.seller.orgnr)],
          ['', '', '', 'Företagets säte'],
          ['', '', '', c.seat],
          ['', '', '', 'Godkänd för F-Skatt'],
        ],
        [30, 25, 20, 25],
        { size: 14 },
      ),
    ],
  });
  const pageHeader = new Header({ children: [headerTable, ids, para(''), buyer, para(''), refs, para('')] });
  const body = [
    // Each spec page's rows, then a page break: the totals stand alone on the last page
    ...perPage.flatMap((rows) => [itemTable(rows), new Paragraph({ pageBreakBefore: true, children: [] })]),
    totals,
    para(t['Att betala'] ? `Att betala ${t['Att betala']}` : '', { bold: true, right: true }),
    para(c.remark, { size: 16 }),
    para(c.statement, { size: 16, right: true }),
  ];
  const doc = new Document({
    creator: 'pdf-synth',
    lastModifiedBy: 'pdf-synth',
    styles: { default: { document: { run: { font: 'Carlito', size: 18 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 400, bottom: 400, left: 600, right: 600, header: 300, footer: 300 },
          },
        },
        headers: { default: pageHeader },
        footers: { default: footer },
        children: body,
      },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}

/** The invoice followed by its attached pages: all pages of other cases' PDFs, and a scanned page with a payment QR code. */
export async function withAttachments(invoice: Uint8Array, c: Construction, pdfOf: (file: string) => Uint8Array): Promise<Uint8Array> {
  const out = await PDFDocument.load(invoice, { updateMetadata: false });
  for (const a of c.attachments) {
    if (a.startsWith('case:')) {
      const src = await PDFDocument.load(pdfOf(a.slice(5)), { updateMetadata: false });
      for (const page of await out.copyPages(src, src.getPageIndices())) out.addPage(page);
      continue;
    }
    // A scanned supplier invoice: one grey image with a payment QR code of another payee, no text layer
    const qr = encodeQR(JSON.stringify(SCAN_QR), 'raw', { border: 4 });
    const scale = 5;
    const [w, h] = [420, 594];
    const image = await out.embedPng(
      png(w, h, (x, y) => {
        const [qx, qy] = [Math.floor((x - 40) / scale), Math.floor((y - 30) / scale)];
        if (qx >= 0 && qy >= 0 && qy < qr.length && qx < qr.length) return qr[qy][qx] ? 0 : 255;
        return y % 24 < 2 && x > 30 && x < 390 && y > 400 && y < 570 ? 90 : 245;
      }),
    );
    const page = out.addPage([595.28, 841.89]);
    page.drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 });
  }
  return out.save();
}

const SCAN_QR = { uqr: 1, tp: 1, nme: 'Fiktiv Leverantör AB', iref: '4417', due: 812.5, cur: 'SEK', pt: 'BG', acc: '9999-0111' };

/** A minimal 8-bit grey PNG for pdf-lib's embedPng. */
function png(width: number, height: number, grey: (x: number, y: number) => number): Uint8Array {
  const raw = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) raw[y * (width + 1) + 1 + x] = grey(x, y);
  const crc = (bytes: Uint8Array) => {
    let c = 0xffffffff;
    for (const b of bytes) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, width);
  new DataView(ihdr.buffer).setUint32(4, height);
  ihdr.set([8, 0, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibSync(raw)),
    chunk('IEND', new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((n, q) => n + q.length, 0));
  let o = 0;
  for (const q of parts) {
    out.set(q, o);
    o += q.length;
  }
  return out;
}
