import { describe, expect, test } from 'bun:test';
import { zlibSync } from 'fflate';
import {
  concatTransformationMatrix,
  drawObject,
  PDFDocument,
  PDFName,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  StandardFonts,
} from 'pdf-lib';
import { encodeQR } from 'qr';
import type { GenericRead } from '../../src/pdf-extract/generic.js';
import { extractPdfInvoice } from '../../src/pdf-extract/index.js';
import { applyPaymentQr, findQrCodes, parseUsingQr, type QrCode } from '../../src/pdf-extract/qr.js';

/** Synthetic payment data with valid check digits; no real company or account. */
const PAYLOAD = {
  uqr: 1,
  tp: 1,
  nme: 'Testbolaget AB',
  cid: '559900-1236',
  iref: '12345678903',
  idt: '20260302',
  ddt: '20260401',
  due: 13750,
  cur: 'SEK',
  pt: 'BG',
  acc: '123-4566',
};
const USING_QR = JSON.stringify(PAYLOAD);
/** Shaped like a Swish payment code: JSON without the `uqr` key. */
const SWISH_LIKE = JSON.stringify({ version: 1, payee: { value: '1231181189' }, amount: { value: 100 }, message: { value: 'Test' } });

/** The module matrix without its quiet zone. */
const modules = (text: string) =>
  encodeQR(text, 'raw', { border: 1 })
    .slice(1, -1)
    .map((r) => r.slice(1, -1));

/** A minimal PNG (8-bit grey or RGBA) for pdf-lib's embedPng. */
function png(width: number, height: number, channels: 1 | 4, pixel: (x: number, y: number) => number[]): Uint8Array {
  const raw = new Uint8Array((width * channels + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) raw.set(pixel(x, y), y * (width * channels + 1) + 1 + x * channels);
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    let c = 0xffffffff;
    for (const b of out.subarray(4, 8 + data.length)) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    view.setUint32(8 + data.length, (c ^ 0xffffffff) >>> 0);
    return out;
  };
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, width);
  new DataView(ihdr.buffer).setUint32(4, height);
  ihdr.set([8, channels === 1 ? 0 : 6, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibSync(raw)),
    chunk('IEND', new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

type Draw = (doc: PDFDocument, page: ReturnType<PDFDocument['addPage']>) => Promise<void> | void;

async function pdf(...draws: Draw[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  for (const d of draws) await d(doc, page);
  return doc.save();
}

/** A QR code as an embedded PNG, `px` pixels per module, with a quiet zone of `quiet` modules. */
const pngQr =
  (text: string, px = 3, quiet = 4, alpha = false): Draw =>
  async (doc, page) => {
    const m = modules(text);
    const n = m.length + 2 * quiet;
    const dark = (x: number, y: number) => m[Math.floor(y / px) - quiet]?.[Math.floor(x / px) - quiet] === true;
    // With alpha, light modules are transparent and show the white page
    const image = await doc.embedPng(
      png(n * px, n * px, alpha ? 4 : 1, (x, y) => (alpha ? (dark(x, y) ? [0, 0, 0, 255] : [0, 0, 0, 0]) : [dark(x, y) ? 0 : 255])),
    );
    page.drawImage(image, { x: 420, y: 40, width: 100, height: 100 });
  };

/** A QR code as a 1-bit image of one pixel per module and no quiet zone; `inverted` draws light modules on black. */
const bitmapQr =
  (text: string, inverted = false): Draw =>
  (doc, page) => {
    const m = modules(text);
    const n = m.length;
    const row = Math.ceil(n / 8);
    const data = new Uint8Array(row * n);
    m.forEach((r, y) => {
      r.forEach((dark, x) => {
        if (dark === inverted) data[y * row + (x >> 3)] |= 0x80 >> (x & 7); // a set bit is white
      });
    });
    const ref = doc.context.register(
      doc.context.stream(data, { Type: 'XObject', Subtype: 'Image', Width: n, Height: n, ColorSpace: 'DeviceGray', BitsPerComponent: 1 }),
    );
    page.node.setXObject(PDFName.of('Qr1'), ref);
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(90, 0, 0, 90, 420, 40), drawObject('Qr1'), popGraphicsState());
  };

/** A QR code drawn as filled rectangles: one per module, or one per horizontal run of dark modules. */
const vectorQr =
  (text: string, runs = false, at = { x: 420, y: 40 }): Draw =>
  (_doc, page) => {
    const m = modules(text);
    const size = 2.2;
    m.forEach((r, y) => {
      for (let x = 0; x < r.length; x++) {
        if (!r[x]) continue;
        let end = x + 1;
        if (runs) while (end < r.length && r[end]) end++;
        page.drawRectangle({
          x: at.x + x * size,
          y: at.y + (m.length - 1 - y) * size,
          width: (end - x) * size,
          height: size,
          color: rgb(0, 0, 0),
        });
        x = end - 1;
      }
    });
  };

const text =
  (...items: [x: number, y: number, s: string][]): Draw =>
  async (doc, page) => {
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (const [x, y, s] of items) page.drawText(s, { x, y: 842 - y - 9, size: 9, font });
  };

describe('parseUsingQr', () => {
  test('reads a UsingQR payload, keeping amounts as written', () => {
    expect(parseUsingQr('{"uqr":1,"tp":1,"due":450.5,"ddt":"20130408","pt":"BG","acc":"433-8778","new":"x"}')).toEqual({
      type: 1,
      fields: { uqr: '1', tp: '1', due: '450.5', ddt: '20130408', pt: 'BG', acc: '433-8778' },
    });
  });

  test("reads the specification's malformed examples (missing, stray and typographic quotes)", () => {
    const qr = parseUsingQr(
      '{"uqr":1,"tp":1,"nme":"Test company AB","iref":"52456",ddt":"20130408","due":5,"pt":"BBAN","acc":6000658159712","bc":"HANDSESS”}',
    );
    expect(qr?.fields).toMatchObject({ iref: '52456', ddt: '20130408', due: '5', acc: '6000658159712', bc: 'HANDSESS' });
  });

  test('a payload without uqr (Swish and the like), with an unknown type, or not JSON is not UsingQR', () => {
    expect(parseUsingQr(SWISH_LIKE)).toBeUndefined();
    expect(parseUsingQr('{"uqr":1,"tp":7}')).toBeUndefined();
    expect(parseUsingQr('C1231181189;100;Test;0')).toBeUndefined();
    expect(parseUsingQr('https://example.test/pay')).toBeUndefined();
  });

  test('values wrapped in single quotes inside the JSON strings are read without them', () => {
    expect(parseUsingQr(`{"uqr":1,"tp":1,"cur":"'SEK'","iref":"'52456'","due":5}`)?.fields).toMatchObject({ cur: 'SEK', iref: '52456' });
  });

  test('a key given twice with different values is dropped', () => {
    expect(parseUsingQr('{"uqr":1,"tp":1,"due":5,"due":6,"ddt":"20130408"}')?.fields.due).toBeUndefined();
  });
});

describe('findQrCodes', () => {
  test('an embedded grey PNG, with its region on the page', async () => {
    const codes = await findQrCodes(await pdf(pngQr(USING_QR)));
    expect(codes).toEqual([{ text: USING_QR, source: 'image', region: { page: 1, x: 420, y: 702, width: 100, height: 100 } }]);
  });

  test('an RGBA PNG whose light modules are transparent', async () => {
    expect((await findQrCodes(await pdf(pngQr(USING_QR, 2, 4, true)))).map((c) => c.text)).toEqual([USING_QR]);
  });

  test('a 1-bit image of one pixel per module without a quiet zone, also with inverted polarity', async () => {
    expect((await findQrCodes(await pdf(bitmapQr(USING_QR)))).map((c) => c.text)).toEqual([USING_QR]);
    expect((await findQrCodes(await pdf(bitmapQr(USING_QR, true)))).map((c) => c.text)).toEqual([USING_QR]);
  });

  test('vector rectangles, one per module or merged runs', async () => {
    const one = await findQrCodes(await pdf(vectorQr(USING_QR)));
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ text: USING_QR, source: 'vector', region: { page: 1, x: 420 } });
    expect((await findQrCodes(await pdf(vectorQr(SWISH_LIKE, true)))).map((c) => c.text)).toEqual([SWISH_LIKE]);
  });

  test('a page with text and no code gives nothing; codes beyond the pages read are not looked at', async () => {
    expect(await findQrCodes(await pdf(text([60, 30, 'Faktura'])))).toEqual([]);
    expect(await findQrCodes(await pdf(pngQr(USING_QR)), 0)).toEqual([]);
  });
});

const region = { page: 1, x: 420, y: 702, width: 100, height: 100 };
const code = (t: string, page = 1): QrCode => ({ text: t, region: { ...region, page }, source: 'image' });
const read = (values: Record<string, string> = {}, more: Partial<GenericRead> = {}): GenericRead => ({
  values: Object.fromEntries(
    Object.entries(values).map(([k, value]) => [k, { value, region: { page: 1, x: 0, y: 0, width: 1, height: 1 } }]),
  ),
  problems: [],
  pricesIncludeVat: false,
  lineCount: 0,
  ...more,
});
const valuesOf = (r: GenericRead) => Object.fromEntries(Object.entries(r.values).map(([k, v]) => [k, v.value]));

describe('applyPaymentQr', () => {
  test('fills missing payment fields except the OCR reference, with the QR code as provenance', () => {
    const out = applyPaymentQr(read({ '/currency': 'SEK' }), [code(USING_QR)]);
    expect(valuesOf(out)).toEqual({
      '/currency': 'SEK',
      '/totals/payable': '13750.00',
      '/dueDate': '2026-04-01',
      '/payments/0/creditTransfers/0/accountId': '1234566',
      '/payments/0/creditTransfers/0/serviceProviderId': 'SE:BANKGIRO',
    });
    expect(out.values['/totals/payable'].region).toEqual(region);
    expect(out.problems).toEqual([]);
  });

  test('agreeing text values stand; disagreeing ones are kept and reported as qr-conflict', () => {
    const agree = read({
      '/totals/payable': '13750.00',
      '/dueDate': '2026-04-01',
      '/payments/0/remittanceInformation': '12345678903',
      '/payments/0/creditTransfers/0/accountId': '1234566',
      '/payments/0/creditTransfers/0/serviceProviderId': 'SE:BANKGIRO',
    });
    expect(applyPaymentQr(agree, [code(USING_QR)]).problems).toEqual([]);
    const differ = read({
      '/totals/payable': '13700.00',
      '/dueDate': '2026-04-02',
      '/payments/0/remittanceInformation': '12345678911',
      '/payments/0/creditTransfers/0/accountId': '1234574',
      '/payments/0/creditTransfers/0/serviceProviderId': 'SE:BANKGIRO',
    });
    const out = applyPaymentQr(differ, [code(USING_QR)]);
    expect(valuesOf(out)).toEqual(valuesOf(differ));
    expect(out.problems.map((p) => [p.code, p.field, p.region])).toEqual([
      ['qr-conflict', '/totals/payable', region],
      ['qr-conflict', '/dueDate', region],
      ['qr-conflict', '/payments/0/remittanceInformation', region],
      ['qr-conflict', '/payments/0/creditTransfers/0/accountId', region],
    ]);
  });

  test('a QR account of another kind is added in the fixed Bankgiro, Plusgiro, IBAN order', () => {
    const pg = read({
      '/payments/0/creditTransfers/0/accountId': '4711',
      '/payments/0/creditTransfers/0/serviceProviderId': 'SE:PLUSGIRO',
    });
    expect(valuesOf(applyPaymentQr(pg, [code(USING_QR)]))).toMatchObject({
      '/payments/0/creditTransfers/0/accountId': '1234566',
      '/payments/0/creditTransfers/0/serviceProviderId': 'SE:BANKGIRO',
      '/payments/0/creditTransfers/1/accountId': '4711',
      '/payments/0/creditTransfers/1/serviceProviderId': 'SE:PLUSGIRO',
    });
  });

  test('an IBAN with its BIC; BBAN and values failing their check digits are not used', () => {
    const iban = JSON.stringify({ ...PAYLOAD, pt: 'IBAN', acc: 'SE45 5000 0000 0583 9825 7466', bc: 'ESSESESS' });
    expect(valuesOf(applyPaymentQr(read(), [code(iban)]))).toMatchObject({
      '/payments/0/creditTransfers/0/accountId': 'SE4550000000058398257466',
      '/payments/0/creditTransfers/0/serviceProviderId': 'ESSESESS',
    });
    const bad = JSON.stringify({ ...PAYLOAD, iref: '12345678904', acc: '123-4567', ddt: '20260231', due: '12,5' });
    expect(valuesOf(applyPaymentQr(read(), [code(bad)]))).toEqual({});
    const bban = JSON.stringify({ ...PAYLOAD, pt: 'BBAN', acc: '6000658159712' });
    expect(Object.keys(valuesOf(applyPaymentQr(read(), [code(bban)])))).not.toContain('/payments/0/creditTransfers/0/accountId');
  });

  test('a reference equal to the invoice number is not compared with the OCR reference; credit and cash invoices give no amount', () => {
    const ocr = { '/payments/0/remittanceInformation': '12345678911' };
    expect(applyPaymentQr(read({ ...ocr, '/id': '12345678903' }), [code(USING_QR)]).problems).toEqual([]);
    const credit = JSON.stringify({ ...PAYLOAD, tp: 2, due: -13750 });
    expect(valuesOf(applyPaymentQr(read(), [code(credit)]))).not.toHaveProperty(['/totals/payable']);
  });

  test('an amount in another currency is not compared with the text and not filled in', () => {
    const eur = JSON.stringify({ ...PAYLOAD, cur: 'EUR' });
    expect(valuesOf(applyPaymentQr(read({ '/currency': 'SEK' }), [code(eur)]))).not.toHaveProperty(['/totals/payable']);
    expect(applyPaymentQr(read({ '/currency': 'SEK', '/totals/payable': '12000.00' }), [code(eur)]).problems).toEqual([]);
    // Without a printed currency the amounts are still compared, but a missing amount is not filled in
    expect(applyPaymentQr(read({ '/totals/payable': '12000.00' }), [code(eur)]).problems.map((p) => p.code)).toEqual(['qr-conflict']);
    expect(valuesOf(applyPaymentQr(read(), [code(eur)]))).not.toHaveProperty(['/totals/payable']);
  });

  test('Swish-like and malformed codes are ignored; two different UsingQR codes are ambiguous; pages not read are skipped', () => {
    expect(applyPaymentQr(read(), [code(SWISH_LIKE), code('{"uqr":1,"tp"')])).toEqual(read());
    const other = JSON.stringify({ ...PAYLOAD, due: 1 });
    const out = applyPaymentQr(read(), [code(USING_QR), code(other)]);
    expect(valuesOf(out)).toEqual({});
    expect(out.problems.map((p) => p.code)).toEqual(['ambiguous']);
    expect(applyPaymentQr(read({}, { pages: 1 }), [code(USING_QR, 2)])).toEqual(read({}, { pages: 1 }));
  });
});

describe('extractPdfInvoice with a payment QR code', () => {
  const run = async (bytes: Uint8Array) => extractPdfInvoice(bytes, { fileSha256: 'f'.repeat(64) });

  test('fills the amount due and due date the text does not give, with the QR region', async () => {
    const r = await run(await pdf(text([60, 30, 'Faktura'], [60, 60, 'Alla belopp i SEK']), vectorQr(USING_QR)));
    if (r.status !== 'draft') throw new Error(r.status);
    expect(r.draft.fields['/totals/payable']).toBe('13750.00');
    expect(r.draft.pdfProvenance['/totals/payable']).toMatchObject({ page: 1, x: 420 });
  });

  test('an image-only page stays unsupported; its payment QR code gives the payment facts only', async () => {
    const r = await run(await pdf(pngQr(USING_QR)));
    if (r.status !== 'unsupported') throw new Error(r.status);
    expect(r.reason).toContain('cannot be read');
    expect(r.payment?.fields).toEqual({
      '/currency': 'SEK',
      '/totals/payable': '13750.00',
      '/dueDate': '2026-04-01',
      '/payments/0/creditTransfers/0/accountId': '1234566',
      '/payments/0/creditTransfers/0/serviceProviderId': 'SE:BANKGIRO',
    });
    expect(Object.values(r.payment?.pdfProvenance ?? {}).every((p) => p.page === 1 && p.x === 420)).toBe(true);
    // Without a payment QR code the result is unchanged
    expect(await run(await pdf(pngQr(SWISH_LIKE)))).not.toHaveProperty('payment');
  });

  test('a text value that disagrees with the QR code is kept and makes a draft with a qr-conflict problem', async () => {
    const r = await run(
      await pdf(text([330, 100, 'Förfallodatum'], [430, 100, '2026-04-02'], [60, 60, 'Alla belopp i SEK']), pngQr(USING_QR)),
    );
    if (r.status !== 'draft') throw new Error(r.status);
    expect(r.draft.fields['/dueDate']).toBe('2026-04-02');
    expect(r.draft.problems).toContainEqual(expect.objectContaining({ code: 'qr-conflict', field: '/dueDate', region }));
  });
});
