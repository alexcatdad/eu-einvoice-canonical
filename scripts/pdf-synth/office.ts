/** Word (.docx, Carlito) and Excel (.xlsx, Liberation Sans) renderings of a printed invoice, for LibreOffice to turn into PDF. */
import { AlignmentType, BorderStyle, Document, Footer, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import ExcelJS from 'exceljs';
import type { Printed } from './model.js';

const FIXED_DATE = new Date('2026-01-01T00:00:00Z');
const NUMERIC = new Set(['Antal', 'À-pris', 'Moms %', 'Belopp', 'Underlag', 'Moms']);

export async function toDocx(p: Printed): Promise<Uint8Array> {
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const noBorders = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
  const para = (text: string, o: { bold?: boolean; size?: number; right?: boolean } = {}) =>
    new Paragraph({
      alignment: o.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
      children: [new TextRun({ text, bold: o.bold, size: o.size })],
    });
  const cell = (text: string, o: { bold?: boolean; right?: boolean; width?: number } = {}) =>
    new TableCell({ children: [para(text, o)], width: o.width ? { size: o.width, type: WidthType.PERCENTAGE } : undefined });
  const kv = (rows: [string, string][], right = false) =>
    new Table({
      width: { size: right ? 50 : 100, type: WidthType.PERCENTAGE },
      alignment: right ? AlignmentType.RIGHT : AlignmentType.LEFT,
      borders: noBorders,
      rows: rows.map(([k, v]) => new TableRow({ children: [cell(k, { width: 60 }), cell(v, { right, width: 40 })] })),
    });
  const grid = (g: { header: string[]; rows: string[][] }, widths: number[]) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: g.header.map((h, i) => cell(h, { bold: true, right: NUMERIC.has(h), width: widths[i] })),
        }),
        ...g.rows.map(
          (r) =>
            new TableRow({ cantSplit: true, children: r.map((t, i) => cell(t, { right: NUMERIC.has(g.header[i]), width: widths[i] })) }),
        ),
      ],
    });
  const gap = () => para('');
  const body = [
    para(p.title, { bold: true, size: 32 }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: noBorders,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: p.seller.map((t, i) => para(t, { bold: i === 0 })),
            }),
            new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: [kv(p.meta)] }),
          ],
        }),
      ],
    }),
    gap(),
    para(p.buyerLabel, { bold: true }),
    ...p.buyer.map((t) => para(t)),
    gap(),
    ...(p.items ? [grid(p.items, [43, 9, 9, 13, 11, 15]), gap()] : []),
    ...(p.vat ? [grid(p.vat, [34, 33, 33]), gap()] : []),
    kv(p.totals, true),
    gap(),
    ...p.notes.map((t) => para(t)),
    ...(p.payment.length ? [gap(), para('Betalningsinformation', { bold: true }), kv(p.payment)] : []),
  ];
  const doc = new Document({
    creator: 'pdf-synth',
    lastModifiedBy: 'pdf-synth',
    styles: { default: { document: { run: { font: 'Carlito', size: 20 } } } },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, bottom: 1200, left: 1100, right: 1100 } } },
        footers: { default: new Footer({ children: [para(p.footer.join(' · '), { size: 16 })] }) },
        children: body,
      },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}

export async function toXlsx(p: Printed): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'pdf-synth';
  wb.created = FIXED_DATE;
  wb.modified = FIXED_DATE;
  const ws = wb.addWorksheet('Faktura', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
    views: [{ showGridLines: false }],
  });
  ws.columns = [{ width: 42 }, { width: 9 }, { width: 8 }, { width: 12 }, { width: 12 }, { width: 14 }];
  const font = { name: 'Liberation Sans', size: 10 };
  const put = (values: string[], o: { bold?: boolean; size?: number; header?: boolean; rightFrom?: number; wrap?: boolean } = {}) => {
    const row = ws.addRow(values);
    row.eachCell((c, col) => {
      c.font = { ...font, bold: o.bold, size: o.size ?? font.size };
      c.alignment = { vertical: 'top', wrapText: o.wrap, horizontal: o.rightFrom && col >= o.rightFrom ? 'right' : 'left' };
      if (o.header) c.border = { bottom: { style: 'thin' } };
    });
    return row;
  };
  put([p.title], { bold: true, size: 16 });
  const left = p.seller;
  for (let i = 0; i < Math.max(left.length, p.meta.length); i++) {
    const m = p.meta[i];
    put([left[i] ?? '', '', '', m?.[0] ?? '', '', m?.[1] ?? ''], { rightFrom: 6, bold: false });
  }
  put([]);
  put([p.buyerLabel], { bold: true });
  for (const t of p.buyer) put([t]);
  put([]);
  if (p.items) {
    const h = put(p.items.header, { bold: true, header: true, rightFrom: 2 });
    ws.pageSetup.printTitlesRow = `${h.number}:${h.number}`;
    for (const r of p.items.rows) put(r, { rightFrom: 2, wrap: true });
    put([]);
  }
  if (p.vat) {
    put(['', '', '', ...p.vat.header], { bold: true, header: true, rightFrom: 5 });
    for (const r of p.vat.rows) put(['', '', '', ...r], { rightFrom: 5 });
    put([]);
  }
  for (const [k, v] of p.totals) put(['', '', '', k, '', v], { rightFrom: 6, bold: k.startsWith('Att betala') });
  put([]);
  for (const t of p.notes) {
    const r = put([t], { wrap: true });
    ws.mergeCells(r.number, 1, r.number, 6);
    r.height = 26;
  }
  if (p.payment.length) {
    put([]);
    put(['Betalningsinformation'], { bold: true });
    for (const [k, v] of p.payment) put([`${k}: ${v}`]);
  }
  put([]);
  put([p.footer.join(' · ')], { size: 8 });
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
