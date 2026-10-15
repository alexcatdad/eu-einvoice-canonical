import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { convert, effectiveSign } from '../src/index.js';
import { fixture, parseOne, utf8, warningCodes } from './helpers.js';

const IBAN = 'ES9121000418450200051332';

describe('Facturae: single invoice with IVA and IRPF', async () => {
  const inv = await parseOne('facturae-322-iva-irpf.xml');

  test('header', () => {
    assert.equal(inv.kind, 'invoice');
    assert.equal(inv.typeCode, '380');
    assert.equal(inv.id, '2026/0042');
    assert.equal(inv.issueDate, '2026-10-15');
    assert.equal(inv.taxPointDate, '2026-10-10');
    assert.equal(inv.dueDate, '2026-11-15');
    assert.equal(inv.currency, 'EUR');
    assert.equal(inv.contractRef, 'CT-2026-7');
    assert.equal(inv.purchaseOrderRef, 'PED-5521');
    assert.deepEqual(inv.invoicePeriod, { start: '2026-09-01', end: '2026-09-30' });
    assert.deepEqual(inv.nationalType, { scheme: 'ES:InvoiceClass', code: 'OO', label: 'Original' });
    assert.deepEqual(inv.notes, [{ text: 'Retención IRPF aplicada conforme a la normativa vigente' }]);
    assert.equal(inv.source.format, 'facturae');
    assert.equal(inv.source.formatVersion, '3.2.2');
    assert.equal(inv.source.indexInFile, undefined);
    assert.equal(inv.source.fragmentPath, '/Facturae/Invoices/Invoice[1]');
    assert.ok(inv.source.derived.some((d) => d.field === '/id'));
  });

  test('seller (individual) and buyer (legal entity)', () => {
    const s = inv.seller;
    assert.equal(s.name, 'Lucía Ejemplo Ficticia');
    assert.deepEqual(s.nationalTaxIds, [{ value: '12345678Z', schemeId: 'ES:NIF' }]);
    assert.equal(s.vatId, 'ES12345678Z');
    assert.deepEqual(s.address, { line1: 'Calle de Muestra 5, 2º B', city: 'Madrid', postalCode: '28001', countrySubdivision: 'Madrid', countryCode: 'ES' });
    assert.deepEqual(s.contact, { phone: '+34 910 000 001', email: 'facturas@lucia.example' });
    assert.equal(inv.source.unmapped['/Facturae/Parties/SellerParty/Individual/ContactDetails/WebAddress'], 'https://lucia.example');
    assert.equal(inv.buyer.name, 'Ayuntamiento de Ejemplo');
    assert.equal(inv.buyer.vatId, 'ESS0000001A');
    assert.deepEqual(inv.buyer.nationalTaxIds, [{ value: 'S0000001A', schemeId: 'ES:NIF' }]);
  });

  test('DIR3 administrative centres and Facturae data in extensions.es', () => {
    assert.deepEqual(inv.extensions.es, {
      facturaeVersion: '3.2.2', invoiceClass: 'OO', invoiceDocumentType: 'FC', batchId: 'B00000012A-2026-0042',
      administrativeCentres: [
        { roleCode: '01', code: 'EA0000001', name: 'Oficina contable ficticia' },
        { roleCode: '02', code: 'EA0000002', name: 'Órgano gestor ficticio' },
        { roleCode: '03', code: 'EA0000003', name: 'Unidad tramitadora ficticia' },
      ],
    });
  });

  test('IVA breakdown, IRPF withholding and totals', () => {
    assert.deepEqual(inv.vatBreakdown, [{ taxableAmount: '608.00', taxAmount: '127.68', categoryCode: 'S', rate: '21.00', nationalCode: 'ES:01' }]);
    assert.deepEqual(inv.withholdings, [{ scheme: 'ES:IRPF', taxableAmount: '608.00', rate: '15.00', amount: '91.20' }]);
    assert.deepEqual(inv.otherTaxes, []);
    assert.deepEqual(inv.totals, {
      lineNetTotal: '608.00', allowanceTotal: '0.00', chargeTotal: '0.00', taxExclusive: '608.00', vatTotal: '127.68',
      taxInclusive: '735.68', withholdingTotal: '91.20', payable: '644.48',
    });
    const fields = inv.source.derived.map((d) => d.field);
    assert.ok(fields.includes('/totals/taxInclusive'));
    assert.ok(fields.includes('/totals/payable'));
    assert.deepEqual(warningCodes(inv), []);
  });

  test('lines keep 6-decimal amounts, line discount and line withholding', () => {
    assert.equal(inv.lines.length, 2);
    const [a, b] = inv.lines;
    assert.equal(a.id, '1');
    assert.equal(a.quantity, '8');
    assert.equal(a.unitCode, 'HUR');
    assert.equal(a.price?.net, '62.500000');
    assert.equal(a.netAmount, '500.000000');
    assert.deepEqual(a.vat, { categoryCode: 'S', rate: '21.00', nationalCode: 'ES:01' });
    assert.deepEqual(a.withholdings, [{ scheme: 'ES:IRPF', taxableAmount: '500.00', rate: '15.00', amount: '75.00' }]);
    assert.equal(a.subjectToWithholding, true);
    assert.deepEqual(b.allowances, [{ amount: '12.000000', percentage: '10.0000', reason: 'Descuento comercial' }]);
    assert.equal(b.netAmount, '108.000000');
    assert.equal(b.unitCode, 'H87');
  });

  test('payment: transfer to IBAN, single installment becomes the due date', () => {
    assert.deepEqual(inv.payments, [{
      meansCode: '30', nationalMeansCode: '04', creditTransfers: [{ accountId: IBAN, serviceProviderId: 'CAIXESBBXXX' }],
    }]);
    assert.deepEqual(inv.paymentSchedule, []);
  });
});

describe('Facturae: recargo de equivalencia', async () => {
  const inv = await parseOne('facturae-322-recargo.xml');

  test('IVA per rate in the breakdown, recargo in otherTaxes', () => {
    assert.deepEqual(inv.vatBreakdown.map((v) => [v.categoryCode, v.rate, v.taxableAmount, v.taxAmount]), [
      ['S', '21.00', '823.46', '172.93'],
      ['S', '10.00', '100.00', '10.00'],
    ]);
    assert.deepEqual(inv.otherTaxes, [
      { scheme: 'ES:RE', taxableAmount: '823.46', rate: '5.20', amount: '42.82', includedInTotal: true },
      { scheme: 'ES:RE', taxableAmount: '100.00', rate: '1.40', amount: '1.40', includedInTotal: true },
    ]);
  });

  test('vatTotal excludes the recargo and the totals reconcile', () => {
    assert.equal(inv.totals.vatTotal, '182.93');
    assert.equal(inv.totals.taxInclusive, '1150.61');
    assert.equal(inv.totals.payable, '1150.61');
    assert.equal(inv.totals.withholdingTotal, undefined);
    assert.ok(inv.source.derived.some((d) => d.field === '/totals/vatTotal'));
    assert.deepEqual(warningCodes(inv), []);
  });

  test('8-decimal amounts stay strings, line recargo', () => {
    const l = inv.lines[0];
    assert.equal(l.quantity, '1000');
    assert.equal(l.price?.net, '0.12345678');
    assert.equal(l.netAmount, '123.45678000');
    assert.deepEqual(l.otherTaxes, [{ scheme: 'ES:RE', taxableAmount: '123.45678000', rate: '5.20', amount: '6.41975256', includedInTotal: true }]);
    assert.equal(l.item.sellerId, 'TOR-M4');
  });

  test('legal entity seller, individual buyer, direct debit', () => {
    assert.equal(inv.id, 'RE311');
    assert.equal(inv.seller.name, 'Distribuciones Ficticias, S.L.');
    assert.equal(inv.seller.tradingName, 'Distri Ficticia');
    assert.equal(inv.seller.additionalLegalInfo, 'Registro Mercantil de Valencia, Book 10, Sheet V-00001, Folio 20, Volume 3000');
    assert.deepEqual(inv.seller.contact, { name: 'Marta Prueba', phone: '+34 960 000 002', email: 'admin@distri.example' });
    assert.equal(inv.buyer.name, 'Pablo Tienda Imaginaria');
    assert.equal(inv.buyer.vatId, undefined);
    assert.deepEqual(inv.buyer.nationalTaxIds, [{ value: '87654321X', schemeId: 'ES:NIF' }]);
    assert.deepEqual(inv.payments, [{
      meansCode: '49', nationalMeansCode: '02', creditTransfers: [], directDebit: { debitedAccountId: 'ES7921000813610123456789' },
    }]);
  });
});

describe('Facturae: batch', async () => {
  const r = await convert(fixture('facturae-322-batch.xml'), 'facturae-322-batch.xml');
  assert.equal(r.outcomes.length, 1);
  const o = r.outcomes[0];
  assert.equal(o.status, 'ok');
  const invoices = o.status === 'ok' ? o.invoices : [];

  test('one canonical invoice per Invoice, with position and fragment path', () => {
    assert.equal(invoices.length, 2);
    assert.deepEqual(invoices.map((i) => i.id), ['L7-1001', 'L7-1002']);
    assert.deepEqual(invoices.map((i) => i.source.indexInFile), [0, 1]);
    assert.deepEqual(invoices.map((i) => i.source.fragmentPath), ['/Facturae/Invoices/Invoice[1]', '/Facturae/Invoices/Invoice[2]']);
    assert.ok(invoices.every((i) => i.extensions.es?.batchId === 'B00000012-LOTE-7'));
    assert.ok(invoices.every((i) => i.warnings === undefined && i.source.warnings.length === 0));
  });

  test('IGIC maps to category L', () => {
    assert.equal(invoices[0].vatBreakdown[0].categoryCode, 'S');
    assert.deepEqual(invoices[1].vatBreakdown, [{ taxableAmount: '91.00', taxAmount: '6.37', categoryCode: 'L', rate: '7.00', nationalCode: 'ES:03' }]);
    assert.equal(invoices[1].totals.payable, '97.37');
  });

  test('several installments go to paymentSchedule and share one payment instruction', () => {
    const b = invoices[1];
    assert.equal(b.dueDate, undefined);
    assert.equal(b.payments.length, 1);
    assert.deepEqual(b.paymentSchedule, [
      { dueDate: '2026-10-31', amount: '48.00', paymentIndex: 0 },
      { dueDate: '2026-11-30', amount: '49.37', paymentIndex: 0 },
    ]);
    assert.equal(invoices[0].dueDate, '2026-10-31');
  });
});

describe('Facturae: rectificativa', async () => {
  const inv = await parseOne('facturae-322-rectificativa.xml');

  test('a reduction is a credit note with positive magnitudes', () => {
    assert.equal(inv.kind, 'creditNote');
    assert.equal(inv.typeCode, '381');
    assert.equal(effectiveSign(inv), -1);
    assert.equal(inv.totals.lineNetTotal, '50.00');
    assert.equal(inv.totals.vatTotal, '10.50');
    assert.equal(inv.totals.payable, '60.50');
    assert.equal(inv.lines[0].quantity, '2');
    assert.equal(inv.lines[0].netAmount, '50.000000');
    assert.equal(inv.lines[0].price?.net, '25.000000');
    assert.deepEqual(inv.vatBreakdown[0], { taxableAmount: '50.00', taxAmount: '10.50', categoryCode: 'S', rate: '21.00', nationalCode: 'ES:01' });
    assert.ok(inv.source.derived.some((d) => d.field === '/kind'));
    assert.deepEqual(warningCodes(inv), []);
  });

  test('correction data and the corrected invoice', () => {
    assert.deepEqual(inv.precedingInvoices, [{ id: 'RE290' }]);
    assert.deepEqual(inv.correction, {
      reason: 'Número de la factura', reasonCode: '01', method: '02', period: { start: '2026-09-01', end: '2026-09-30' },
    });
    assert.equal(inv.nationalType?.code, 'OR');
    assert.equal(inv.typeCode, '381');
    assert.equal(inv.source.unmapped['/Facturae/Invoices/Invoice[1]/InvoiceHeader/Corrective/AdditionalReasonDescription'], 'Devolución de dos unidades defectuosas');
  });
});

/** Minimal one-line Facturae 3.2.2 invoice, net 100.00, for edge cases. */
function mini(o: { cls?: string; doc?: string; corrective?: string; tax?: string; rate?: string; taxAmount?: string; event?: string; sign?: '' | '-'; country?: string; issuerType?: string } = {}): Uint8Array {
  const s = o.sign ?? '';
  const taxAmount = o.taxAmount ?? '21.00';
  const total = (Number(taxAmount) + 100).toFixed(2);
  const tax = `<Tax><TaxTypeCode>${o.tax ?? '01'}</TaxTypeCode><TaxRate>${o.rate ?? '21.00'}</TaxRate><TaxableBase><TotalAmount>${s}100.00</TotalAmount></TaxableBase><TaxAmount><TotalAmount>${s}${taxAmount}</TotalAmount></TaxAmount></Tax>`;
  const party = (nif: string, name: string) => `<TaxIdentification><PersonTypeCode>J</PersonTypeCode><ResidenceTypeCode>R</ResidenceTypeCode><TaxIdentificationNumber>${nif}</TaxIdentificationNumber></TaxIdentification><LegalEntity><CorporateName>${name}</CorporateName><AddressInSpain><Address>Calle 1</Address><PostCode>28001</PostCode><Town>Madrid</Town><Province>Madrid</Province><CountryCode>${o.country ?? 'ESP'}</CountryCode></AddressInSpain></LegalEntity>`;
  return utf8(`<?xml version="1.0" encoding="UTF-8"?>
<fe:Facturae xmlns:fe="http://www.facturae.gob.es/formato/Versiones/Facturaev3_2_2.xml"><FileHeader><SchemaVersion>3.2.2</SchemaVersion><Modality>I</Modality><InvoiceIssuerType>${o.issuerType ?? 'EM'}</InvoiceIssuerType></FileHeader>
<Parties><SellerParty>${party('B00000012', 'Vendedora Ficticia SL')}</SellerParty><BuyerParty>${party('A00000024', 'Compradora Ficticia SA')}</BuyerParty></Parties>
<Invoices><Invoice><InvoiceHeader><InvoiceNumber>9</InvoiceNumber><InvoiceDocumentType>${o.doc ?? 'FC'}</InvoiceDocumentType><InvoiceClass>${o.cls ?? 'OO'}</InvoiceClass>${o.corrective ?? ''}</InvoiceHeader>
<InvoiceIssueData><IssueDate>2026-10-01</IssueDate><InvoiceCurrencyCode>EUR</InvoiceCurrencyCode></InvoiceIssueData>
<TaxesOutputs>${tax}</TaxesOutputs>
<InvoiceTotals><TotalGrossAmount>${s}100.00</TotalGrossAmount><TotalGrossAmountBeforeTaxes>${s}100.00</TotalGrossAmountBeforeTaxes><TotalTaxOutputs>${s}${taxAmount}</TotalTaxOutputs><InvoiceTotal>${s}${total}</InvoiceTotal></InvoiceTotals>
<Items><InvoiceLine><ItemDescription>Servicio</ItemDescription><Quantity>1</Quantity><UnitOfMeasure>05</UnitOfMeasure><UnitPriceWithoutTax>${s}100.00</UnitPriceWithoutTax><TotalCost>${s}100.00</TotalCost><GrossAmount>${s}100.00</GrossAmount><TaxesOutputs>${tax}</TaxesOutputs>${o.event ?? ''}</InvoiceLine></Items>
</Invoice></Invoices></fe:Facturae>`);
}

describe('Facturae: edge cases', () => {
  const corrective = (method: string) => `<Corrective><InvoiceNumber>5</InvoiceNumber><ReasonCode>01</ReasonCode><ReasonDescription>x</ReasonDescription><CorrectionMethod>${method}</CorrectionMethod></Corrective>`;

  test('IPSI maps to category M', async () => {
    const inv = await parseOne(mini({ tax: '02', rate: '4.00', taxAmount: '4.00' }), 'a.xml');
    assert.equal(inv.vatBreakdown[0].categoryCode, 'M');
    assert.deepEqual(warningCodes(inv), []);
  });

  test('a corrective that increases the amount stays an invoice (384)', async () => {
    const inv = await parseOne(mini({ cls: 'OR', corrective: corrective('01') }), 'a.xml');
    assert.equal(inv.kind, 'invoice');
    assert.equal(inv.typeCode, '384');
    assert.deepEqual(warningCodes(inv), ['ES-CORRECTION-REPLACES']);
    assert.equal(inv.totals.payable, '121.00');
  });

  test('a corrective without a Corrective element is flagged', async () => {
    const inv = await parseOne(mini({ cls: 'OR', sign: '-' }), 'a.xml');
    assert.equal(inv.kind, 'creditNote');
    assert.deepEqual(warningCodes(inv), ['ES-CORRECTIVE-NO-REFERENCE']);
  });

  test('a negative original invoice keeps its signs and kind', async () => {
    const inv = await parseOne(mini({ sign: '-' }), 'a.xml');
    assert.equal(inv.kind, 'invoice');
    assert.equal(inv.totals.payable, '-121.00');
  });

  test('copies are flagged', async () => {
    const inv = await parseOne(mini({ cls: 'CO' }), 'a.xml');
    assert.deepEqual(warningCodes(inv), ['ES-COPY']);
  });

  test('self-billed invoices (AF) get 389', async () => {
    const inv = await parseOne(mini({ doc: 'AF' }), 'a.xml');
    assert.equal(inv.selfBilled, true);
    assert.equal(inv.typeCode, '389');
    assert.equal(inv.extensions.es?.invoiceDocumentType, 'AF');
  });

  test('zero-rated IVA with a special taxable event is exempt with its reason', async () => {
    const event = '<SpecialTaxableEvent><SpecialTaxableEventCode>01</SpecialTaxableEventCode><SpecialTaxableEventReason>Exenta art. 20 LIVA</SpecialTaxableEventReason></SpecialTaxableEvent>';
    const inv = await parseOne(mini({ rate: '0.00', taxAmount: '0.00', event }), 'a.xml');
    assert.equal(inv.vatBreakdown[0].categoryCode, 'E');
    assert.equal(inv.vatBreakdown[0].exemptionReason, 'Exenta art. 20 LIVA');
    assert.equal(inv.lines[0].vat?.categoryCode, 'E');
  });

  test('zero-rated IVA without an event is Z; unit 05 stays as text', async () => {
    const inv = await parseOne(mini({ rate: '0.00', taxAmount: '0.00' }), 'a.xml');
    assert.equal(inv.vatBreakdown[0].categoryCode, 'Z');
    assert.equal(inv.lines[0].unitCode, undefined);
    assert.equal(inv.lines[0].unitText, '05');
  });

  test('an unknown country code is dropped with a warning', async () => {
    const inv = await parseOne(mini({ country: 'XXX' }), 'a.xml');
    assert.equal(inv.seller.address?.countryCode, undefined);
    assert.ok(warningCodes(inv).includes('ES-COUNTRY'));
  });

  test('a file without invoices is an error outcome', async () => {
    const xml = new TextDecoder().decode(mini()).replace(/<Invoices>[\s\S]*<\/Invoices>/, '<Invoices/>');
    const r = await convert(utf8(xml), 'a.xml');
    assert.equal(r.outcomes[0].status, 'error');
  });
});
