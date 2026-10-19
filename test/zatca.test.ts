import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { convert, detectXml, validateSource } from '../src/index.js';
import { decodeZatcaQr, hijriToGregorian, zatcaInvoiceHash } from '../src/parsers/zatca.js';
import { sha256 } from '../src/sha256.js';
import { CBC, fixturePath, NSI, parseOne, utf8, warningCodes } from './helpers.js';

const text = (name: string) => readFileSync(fixturePath(name), 'utf8');
const SIMPLIFIED = 'zatca-simplified-signed.xml';
const zatcaWarnings = (inv: Awaited<ReturnType<typeof parseOne>>) => warningCodes(inv).filter((c) => c.startsWith('ZATCA_'));
const fromXml = (xml: string) => parseOne(utf8(xml), 'x.xml');

describe('ZATCA detection', () => {
  const header = (profile: string) =>
    `<Invoice xmlns="${NSI}" xmlns:cbc="${CBC}"><cbc:ProfileID>${profile}</cbc:ProfileID><cbc:ID>1</cbc:ID></Invoice>`;

  test('ProfileID reporting:1.0 detects ZATCA without establishing a qualified syntax edition', async () => {
    const d = detectXml(header('reporting:1.0'));
    assert.equal(d.kind, 'invoice');
    if (d.kind !== 'invoice') return;
    assert.equal(d.format.id, 'zatca-ubl');
    assert.equal(d.details.version, '1.0');
    assert.equal(d.details.profile, 'reporting:1.0');
    const summary = await validateSource({ xml: header('reporting:1.0') }, { scope: 'schema' });
    assert.equal(summary.result, 'incomplete');
    assert.equal(summary.reasons?.schema, 'unsupported');
    const declared = header('reporting:1.0').replace('<cbc:ProfileID>', '<cbc:UBLVersionID>2.1</cbc:UBLVersionID><cbc:ProfileID>');
    const schema = await validateSource({ xml: declared }, { scope: 'schema' });
    assert.equal(schema.bundles.schema, 'xsd-ubl-2.1');
    assert.equal(schema.schema, 'failed', 'the declared edition checks the deliberately incomplete header');
  });

  test('clearance:1.0 is detected too; other profile ids are not', () => {
    const id = (xml: string) => {
      const d = detectXml(xml);
      return d.kind === 'invoice' ? d.format.id : d.kind;
    };
    assert.equal(id(header('clearance:1.0')), 'zatca-ubl');
    assert.equal(id(header('reporting:2.0')), 'ubl-unknown');
  });
});

describe('ZATCA simplified invoice', () => {
  test('header, transaction code and parties', async () => {
    const inv = await parseOne(SIMPLIFIED);
    assert.equal(inv.source.format, 'zatca-ubl');
    assert.equal(inv.kind, 'invoice');
    assert.equal(inv.typeCode, '388');
    assert.equal(inv.id, 'SME00023');
    assert.equal(inv.issueDate, '2024-09-07');
    assert.equal(inv.issueTime, '17:41:08');
    assert.equal(inv.currency, 'SAR');
    assert.equal(inv.specificationId, 'reporting:1.0');
    assert.deepEqual(inv.nationalType, { scheme: 'SA:InvoiceTypeCode', code: '0200000', label: 'Simplified tax invoice' });
    assert.equal(inv.seller.name, 'Latency');
    assert.equal(inv.seller.vatId, '399999999900003');
    assert.deepEqual(inv.seller.identifiers, [{ value: '1010010000', schemeId: 'CRN' }]);
    assert.equal(inv.buyer.vatId, '399999999800003');
    assert.deepEqual(inv.attachments, [], 'ICV, PIH and QR are control references, not attachments');
  });

  test('VAT breakdown comes from the TaxTotal that has subtotals', async () => {
    const inv = await parseOne(SIMPLIFIED);
    assert.deepEqual(inv.vatBreakdown, [{ taxableAmount: '201.00', taxAmount: '30.15', categoryCode: 'S', rate: '15' }]);
    assert.equal(inv.totals.vatTotal, '30.15');
    assert.equal(inv.totals.taxInclusive, '231.15');
    assert.equal(inv.totals.payable, '231.15');
    assert.equal(inv.lines.length, 2);
  });

  test('extensions.sa: transaction code, counter, hashes, stamp and QR', async () => {
    const sa = (await parseOne(SIMPLIFIED)).extensions.sa!;
    assert.equal(sa.invoiceSubtype, 'simplified');
    assert.equal(sa.transactionCode, '0200000');
    assert.deepEqual([sa.thirdParty, sa.nominal, sa.exports, sa.summary, sa.selfBilled], [false, false, false, false, false]);
    assert.equal(sa.uuid, '3cf5ee18-ee25-44ea-a444-2c37ba7f28be');
    assert.equal(sa.counter, '10');
    assert.equal(sa.previousInvoiceHash, 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==');
    assert.equal(sa.invoiceHash, '7HWvwzSMv7IEh3pIhuX4xQNPqBWbUm6RhdPjSKPF0xM=');
    assert.equal(sa.stamp?.signedAt, '2025-02-27T20:53:12');
    assert.ok(sa.stamp?.certificate?.startsWith('MIID'));
    assert.ok(sa.stamp?.signatureValue?.startsWith('MEQ'));
    assert.deepEqual(sa.sellerAddress, { buildingNumber: '2322', district: 'Al-Murabba' });
    assert.deepEqual(sa.buyerAddress, { buildingNumber: '1111', district: 'Al-Murooj' });
    assert.deepEqual(sa.hijriDates, []);
    assert.equal(sa.qr?.sellerName, 'Latency');
    assert.equal(sa.qr?.vatNumber, '399999999900003');
    assert.equal(sa.qr?.timestamp, '2024-09-07T17:41:08Z');
    assert.equal(sa.qr?.total, '231.15');
    assert.equal(sa.qr?.vatTotal, '30.15');
    assert.equal(sa.qr?.invoiceHash, sa.invoiceHash);
    assert.ok(sa.qr?.publicKey && sa.qr.certificateSignature && sa.qr.signature);
  });

  test('clearance carries the same data under authority SA:ZATCA', async () => {
    const inv = await parseOne(SIMPLIFIED);
    assert.equal(inv.clearance.length, 1);
    const [c] = inv.clearance;
    assert.equal(c.authority, 'SA:ZATCA');
    assert.equal(c.documentId, '3cf5ee18-ee25-44ea-a444-2c37ba7f28be');
    assert.equal(c.counter, '10');
    assert.equal(c.hash, '7HWvwzSMv7IEh3pIhuX4xQNPqBWbUm6RhdPjSKPF0xM=');
    assert.equal(c.previousHash, inv.extensions.sa?.previousInvoiceHash);
    assert.equal(c.qrPayload?.slice(0, 20), 'AQdMYXRlbmN5Ag8zOTk5');
    assert.equal(c.stamp, inv.extensions.sa?.stamp?.signatureValue);
  });

  test('the recomputed invoice hash matches the signature digest and the QR', async () => {
    const inv = await parseOne(SIMPLIFIED);
    assert.deepEqual(inv.extensions.sa?.hashCheck, {
      status: 'match',
      computed: '7HWvwzSMv7IEh3pIhuX4xQNPqBWbUm6RhdPjSKPF0xM=',
      carried: '7HWvwzSMv7IEh3pIhuX4xQNPqBWbUm6RhdPjSKPF0xM=',
      qr: '7HWvwzSMv7IEh3pIhuX4xQNPqBWbUm6RhdPjSKPF0xM=',
    });
    assert.deepEqual(zatcaWarnings(inv), []);
  });
});

describe('ZATCA standard documents', () => {
  test('standard tax invoice', async () => {
    const inv = await parseOne('zatca-standard-signed.xml');
    assert.equal(inv.id, 'SME00099');
    assert.equal(inv.extensions.sa?.invoiceSubtype, 'standard');
    assert.equal(inv.nationalType?.label, 'Standard tax invoice');
    assert.equal(inv.totals.payable, '4.60');
    assert.equal(inv.extensions.sa?.hashCheck?.status, 'match');
    assert.equal(inv.extensions.sa?.hashCheck?.computed, 'w3MZKM0CTHawhhST7Q2qD0mi9Dc/Xc2pD1ASiXFwpJY=');
    assert.deepEqual(zatcaWarnings(inv), []);
  });

  test('debit note (383) keeps the direction of an invoice and refers to the original', async () => {
    const inv = await parseOne('zatca-standard-debit-signed.xml');
    assert.equal(inv.kind, 'invoice');
    assert.equal(inv.typeCode, '383');
    assert.equal(inv.precedingInvoices[0].id, 'SME00098');
    assert.equal(inv.extensions.sa?.hashCheck?.status, 'match');
    assert.equal(inv.extensions.sa?.hashCheck?.computed, 'vsw6Z695b3gZUzTHcgMgfSO0C+VLJVbwgwBzaRjDemU=');
  });
});

describe('ZATCA reporting without failing', () => {
  test('a changed document reports a hash mismatch and still converts', async () => {
    const inv = await fromXml(text(SIMPLIFIED).replace('<cbc:ID>SME00023</cbc:ID>', '<cbc:ID>SME00024</cbc:ID>'));
    const check = inv.extensions.sa?.hashCheck;
    assert.equal(check?.status, 'mismatch');
    assert.equal(check?.carried, '7HWvwzSMv7IEh3pIhuX4xQNPqBWbUm6RhdPjSKPF0xM=');
    assert.notEqual(check?.computed, check?.carried);
    assert.match(check?.reason ?? '', /signature digest and QR tag 6/);
    assert.deepEqual(zatcaWarnings(inv), ['ZATCA_HASH_MISMATCH']);
    assert.equal(inv.id, 'SME00024');
  });

  test('a document without signature and QR is not checked, but the hash is still computed', async () => {
    const xml = text(SIMPLIFIED)
      .replace(/<ext:UBLExtensions>[\s\S]*?<\/ext:UBLExtensions>/, '')
      .replace(/<cac:AdditionalDocumentReference>\s*<cbc:ID>QR<\/cbc:ID>[\s\S]*?<\/cac:AdditionalDocumentReference>/, '');
    const inv = await fromXml(xml);
    const check = inv.extensions.sa?.hashCheck;
    assert.equal(check?.status, 'not-checked');
    assert.equal(check?.computed, '7HWvwzSMv7IEh3pIhuX4xQNPqBWbUm6RhdPjSKPF0xM=');
    assert.equal(inv.extensions.sa?.stamp, undefined);
    assert.equal(inv.extensions.sa?.qr, undefined);
    assert.equal(inv.clearance[0].authority, 'SA:ZATCA');
  });

  test('the QR code is compared with the invoice', async () => {
    const inv = await fromXml(text(SIMPLIFIED).replaceAll('231.15', '232.15'));
    assert.ok(inv.source.warnings.some((w) => w.code === 'ZATCA_QR_MISMATCH' && w.message.includes('total with VAT')));
  });

  test('hashing works on the received bytes through convert()', async () => {
    const r = await convert(utf8(text(SIMPLIFIED)), 'x.xml');
    assert.equal(r.outcomes[0].status, 'ok');
    assert.equal(zatcaInvoiceHash(text(SIMPLIFIED)), '7HWvwzSMv7IEh3pIhuX4xQNPqBWbUm6RhdPjSKPF0xM=');
  });
});

describe('ZATCA transaction code and document type', () => {
  test('subtype flags', async () => {
    const inv = await fromXml(text(SIMPLIFIED).replace('name="0200000"', 'name="0111111"'));
    const sa = inv.extensions.sa!;
    assert.equal(sa.invoiceSubtype, 'standard');
    assert.deepEqual([sa.thirdParty, sa.nominal, sa.exports, sa.summary, sa.selfBilled], [true, true, true, true, true]);
    assert.equal(inv.selfBilled, true);
  });

  test('an unknown transaction code is kept and reported', async () => {
    const inv = await fromXml(text(SIMPLIFIED).replace('name="0200000"', 'name="9999999"'));
    assert.equal(inv.extensions.sa?.transactionCode, '9999999');
    assert.equal(inv.extensions.sa?.invoiceSubtype, undefined);
    assert.ok(warningCodes(inv).includes('ZATCA_TRANSACTION_CODE'));
  });

  test('a credit note (381) arrives as an Invoice root and is a creditNote', async () => {
    const inv = await fromXml(text(SIMPLIFIED).replace('>388</cbc:InvoiceTypeCode>', '>381</cbc:InvoiceTypeCode>'));
    assert.equal(inv.kind, 'creditNote');
    assert.equal(inv.typeCode, '381');
    assert.ok(inv.source.derived.some((d) => d.field === '/kind'));
  });
});

describe('ZATCA Hijri dates', () => {
  test('tabular conversion, which Umm al-Qura can differ from by a day', () => {
    assert.equal(hijriToGregorian(1446, 1, 1), '2024-07-08'); // Umm al-Qura: 2024-07-07
    assert.equal(hijriToGregorian(1446, 9, 1), '2025-03-01'); // the start of Ramadan 1446
    assert.equal(hijriToGregorian(1446, 13, 1), undefined);
    assert.equal(hijriToGregorian(1446, 1, 31), undefined);
  });

  test('a Hijri issue date is converted and flagged, not passed on as Gregorian', async () => {
    const inv = await fromXml(
      text(SIMPLIFIED).replace('<cbc:IssueDate>2024-09-07</cbc:IssueDate>', '<cbc:IssueDate>1446-03-05</cbc:IssueDate>'),
    );
    assert.equal(inv.issueDate, '2024-09-09');
    assert.deepEqual(inv.extensions.sa?.hijriDates, [{ field: 'issueDate', hijri: '1446-03-05', gregorian: '2024-09-09' }]);
    assert.ok(inv.source.derived.some((d) => d.field === '/issueDate' && d.rule.includes('Hijri')));
    assert.ok(warningCodes(inv).includes('ZATCA_HIJRI_DATE'));
  });
});

describe('ZATCA QR decoding', () => {
  const tlv = (...fields: [number, string][]) =>
    btoa(String.fromCharCode(...fields.flatMap(([tag, v]) => [tag, new TextEncoder().encode(v).length, ...new TextEncoder().encode(v)])));

  test('text tags and amounts', () => {
    assert.deepEqual(decodeZatcaQr(tlv([1, 'Seller'], [2, '300000000000003'], [3, '2026-01-02T03:04:05Z'], [4, '115.00'], [5, '15.00'])), {
      sellerName: 'Seller',
      vatNumber: '300000000000003',
      timestamp: '2026-01-02T03:04:05Z',
      total: '115.00',
      vatTotal: '15.00',
      invoiceHash: undefined,
      signature: undefined,
      publicKey: undefined,
      certificateSignature: undefined,
    });
  });

  test('binary tags come back as base64', () => {
    const qr = decodeZatcaQr(btoa(String.fromCharCode(7, 3, 1, 2, 3, 8, 2, 255, 0)));
    assert.equal(qr?.signature, 'AQID');
    assert.equal(qr?.publicKey, '/wA=');
  });

  test('anything that is not TLV is undefined', () => {
    assert.equal(decodeZatcaQr('not base64!'), undefined);
    assert.equal(decodeZatcaQr(btoa(String.fromCharCode(1, 9, 65))), undefined);
    assert.equal(decodeZatcaQr(''), undefined);
  });
});

describe('synchronous SHA-256', () => {
  test('agrees with node:crypto around the block boundaries', () => {
    for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000]) {
      const bytes = randomBytes(n);
      assert.equal(Buffer.from(sha256(bytes)).toString('hex'), createHash('sha256').update(bytes).digest('hex'), `length ${n}`);
    }
  });
});
