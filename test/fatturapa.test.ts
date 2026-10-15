import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { convert, effectiveSign, type CanonicalInvoice } from '../src/index.js';
import { fixture, parseOne, utf8, warningCodes } from './helpers.js';

const text = (name: string) => new TextDecoder().decode(fixture(name));
const brco = (inv: CanonicalInvoice) => warningCodes(inv).filter((c) => c.startsWith('BR-CO'));

/** Parses XML text and returns the invoices, failing loudly on any other outcome. */
async function parseText(xml: string): Promise<CanonicalInvoice[]> {
  const r = await convert(utf8(xml));
  const o = r.outcomes[0];
  if (o?.status !== 'ok') throw new Error(`expected ok, got ${JSON.stringify(o)}`);
  return o.invoices;
}

describe('FatturaPA: standard B2B invoice (TD01)', async () => {
  const inv = await parseOne('fatturapa-b2b.xml');

  test('header', () => {
    assert.equal(inv.kind, 'invoice');
    assert.equal(inv.typeCode, '380');
    assert.equal(inv.id, '2026/0142');
    assert.equal(inv.issueDate, '2026-10-15');
    assert.equal(inv.currency, 'EUR');
    assert.equal(inv.dueDate, '2026-11-30');
    assert.deepEqual(inv.nationalType, { scheme: 'IT:TipoDocumento', code: 'TD01', label: 'Fattura' });
    assert.equal(inv.purchaseOrderRef, 'ODA-2026-77');
    assert.equal(inv.contractRef, 'CTR-2025-12');
    assert.equal(inv.despatchAdviceRef, 'DDT-881');
    assert.equal(inv.paymentTerms, 'TP02: Pagamento completo');
    assert.equal(inv.selfBilled, false);
    assert.equal(effectiveSign(inv), 1);
    assert.equal(inv.specificationId, 'fatturapa:FPR12');
  });

  test('seller: VAT id, codice fiscale, REA, address, contact', () => {
    const s = inv.seller;
    assert.equal(s.name, 'Rossi Forniture S.r.l.');
    assert.equal(s.vatId, 'IT01234567890');
    assert.deepEqual(s.nationalTaxIds, [{ value: 'RSSMRA70A01H501S', schemeId: 'IT:CF' }]);
    assert.deepEqual(s.legalRegistrationId, { value: 'RM-1234567', schemeId: 'IT:REA' });
    assert.equal(s.additionalLegalInfo, 'Capitale sociale 10000.00; Socio unico: SM; Stato liquidazione: LN');
    assert.deepEqual(s.address, { line1: 'Via Roma, 1', city: 'Roma', postalCode: '00100', countrySubdivision: 'RM', countryCode: 'IT' });
    assert.deepEqual(s.contact, { phone: '+39 06 1234567', email: 'fatture@rossi.example' });
  });

  test('buyer', () => {
    assert.equal(inv.buyer.name, 'Bianchi Impianti S.p.A.');
    assert.equal(inv.buyer.vatId, 'IT09876543210');
    assert.deepEqual(inv.buyer.nationalTaxIds, [{ value: '09876543210', schemeId: 'IT:CF' }]);
    assert.equal(inv.buyer.address?.city, 'Milano');
  });

  test('extensions.it', () => {
    assert.deepEqual(inv.extensions.it, {
      transmissionFormat: 'FPR12',
      recipientCode: '0000000',
      recipientPec: 'amministrazione@pec.bianchi.example',
      transmissionSequence: '00001',
      taxRegime: 'RF01',
      vatChargeability: 'I',
      reasons: ['Fornitura materiale elettrico ottobre 2026'],
    });
  });

  test('lines', () => {
    assert.equal(inv.lines.length, 3);
    const l = inv.lines[0];
    assert.equal(l.id, '1');
    assert.equal(l.quantity, '10');
    assert.equal(l.unitText, 'm');
    assert.equal(l.netAmount, '250.00');
    assert.deepEqual(l.price, { net: '25.00' });
    assert.deepEqual(l.vat, { categoryCode: 'S', rate: '22.00' });
    assert.equal(l.item.name, 'Cavo FG16 3x2,5');
    assert.equal(l.item.sellerId, 'CAV-325');
    assert.deepEqual(l.item.standardId, { value: '8001234567893', schemeId: '0160' });
    assert.deepEqual(inv.lines[2].vat, { categoryCode: 'E', rate: '0.00', nationalCode: 'IT:N4' });
  });

  test('VAT breakdown: Natura N4 keeps its national code', () => {
    assert.deepEqual(inv.vatBreakdown, [
      { taxableAmount: '450.00', taxAmount: '99.00', categoryCode: 'S', rate: '22.00' },
      { taxableAmount: '100.00', taxAmount: '0.00', categoryCode: 'E', rate: '0.00', exemptionReason: 'Esente art. 10 DPR 633/72', nationalCode: 'IT:N4' },
    ]);
  });

  test('totals and no BR-CO warnings', () => {
    assert.deepEqual(inv.totals, {
      lineNetTotal: '550.00', taxExclusive: '550.00', vatTotal: '99.00', taxInclusive: '649.00', payable: '649.00',
    });
    assert.deepEqual(brco(inv), []);
    assert.ok(inv.source.derived.some((d) => d.field === '/totals/taxInclusive'));
  });

  test('payment: MP05 is credit transfer, kept as nationalMeansCode', () => {
    assert.deepEqual(inv.payments, [{
      meansCode: '30', nationalMeansCode: 'MP05',
      creditTransfers: [{ accountId: 'IT60X0542811101000000123456', accountName: 'Rossi Forniture S.r.l.', serviceProviderId: 'BEXAITMM' }],
    }]);
    assert.deepEqual(inv.paymentSchedule, []);
  });

  test('attachment', () => {
    assert.deepEqual(inv.attachments, [
      { kind: 'embedded', id: 'capitolato.pdf', description: 'Capitolato', mimeCode: 'application/pdf', filename: 'capitolato.pdf', base64: 'Zml4dHVyZQ==' },
    ]);
  });

  test('source: fragment, and header data with no canonical home goes to unmapped', () => {
    assert.equal(inv.source.indexInFile, 0);
    assert.equal(inv.source.fragmentPath, '/FatturaElettronica/FatturaElettronicaBody[1]');
    assert.equal(inv.source.format, 'fatturapa');
    assert.equal(inv.source.formatVersion, 'FPR12');
    assert.equal(inv.source.unmapped['/FatturaElettronica/FatturaElettronicaHeader/DatiTrasmissione/IdTrasmittente'], 'IdPaese: IT; IdCodice: 01234567890');
  });
});

describe('FatturaPA: credit note (TD04)', async () => {
  const inv = await parseOne('fatturapa-credit-note.xml');

  test('TD04 is a credit note with UNCL 1001 381 and keeps the national code', () => {
    assert.equal(inv.kind, 'creditNote');
    assert.equal(inv.typeCode, '381');
    assert.equal(inv.nationalType?.code, 'TD04');
    assert.equal(effectiveSign(inv), -1);
  });

  test('references the invoice it credits', () => {
    assert.deepEqual(inv.precedingInvoices, [{ id: '2026/0142', issueDate: '2026-10-15' }]);
    assert.deepEqual(inv.extensions.it?.reasons, ['Reso merce, nota di credito sulla fattura 2026/0142']);
  });

  test('amounts keep their source (positive) signs', () => {
    assert.equal(inv.totals.payable, '305.00');
    assert.deepEqual(inv.payments, []);
    assert.deepEqual(brco(inv), []);
  });

  test('TD08 is a credit note too, TD05 a debit note, TD16 self-billed', async () => {
    const xml = text('fatturapa-credit-note.xml');
    const td08 = (await parseText(xml.replace('TD04', 'TD08')))[0];
    assert.equal(td08.kind, 'creditNote');
    const td05 = (await parseText(xml.replace('TD04', 'TD05')))[0];
    assert.equal(td05.kind, 'invoice');
    assert.equal(td05.typeCode, '383');
    const td16 = (await parseText(xml.replace('TD04', 'TD16')))[0];
    assert.equal(td16.typeCode, '389');
    assert.equal(td16.selfBilled, true);
  });

  test('an unknown TipoDocumento is an invoice with a warning', async () => {
    const inv2 = (await parseText(text('fatturapa-credit-note.xml').replace('TD04', 'TD99')))[0];
    assert.equal(inv2.kind, 'invoice');
    assert.equal(inv2.nationalType?.code, 'TD99');
    assert.ok(warningCodes(inv2).includes('IT_UNKNOWN_TIPODOCUMENTO'));
  });
});

describe('FatturaPA: ritenuta, cassa previdenziale and bollo', async () => {
  const inv = await parseOne('fatturapa-ritenuta-cassa-bollo.xml');

  test('a natural person seller is named from Nome and Cognome', () => {
    assert.equal(inv.seller.name, 'Mario Verdi');
  });

  test('RT01 becomes a withholding; the total is deducted from payable', () => {
    assert.deepEqual(inv.withholdings, [{ scheme: 'IT:RT01', rate: '20.00', amount: '208.00', reasonCode: 'A' }]);
    assert.equal(inv.totals.withholdingTotal, '208.00');
    assert.equal(inv.totals.taxInclusive, '1270.80');
    assert.equal(inv.totals.payable, '1062.80');
    assert.equal(inv.lines[0].subjectToWithholding, true);
    assert.equal(inv.lines[1].subjectToWithholding, undefined);
  });

  test('cassa is a charge and is listed in extensions.it.pensionFunds', () => {
    assert.deepEqual(inv.charges, [{
      amount: '40.00', baseAmount: '1000.00', percentage: '4.00', reason: 'Cassa previdenziale TC22',
      vat: { categoryCode: 'S', rate: '22.00' },
    }]);
    assert.equal(inv.totals.chargeTotal, '40.00');
    assert.deepEqual(inv.extensions.it?.pensionFunds, [
      { type: 'TC22', rate: '4.00', amount: '40.00', taxableAmount: '1000.00', vatRate: '22.00', subjectToWithholding: true },
    ]);
  });

  test('bollo is an other tax and extensions.it.stampDuty', () => {
    assert.deepEqual(inv.otherTaxes, [{ scheme: 'IT:BOLLO', amount: '2.00', includedInTotal: true, inTaxExclusive: true }]);
    assert.deepEqual(inv.extensions.it?.stampDuty, { virtual: true, amount: '2.00' });
  });

  test('N1 is outside the scope of VAT', () => {
    assert.deepEqual(inv.lines[1].vat, { categoryCode: 'O', rate: '0.00', nationalCode: 'IT:N1' });
    assert.equal(inv.vatBreakdown[1].categoryCode, 'O');
  });

  test('totals reconcile', () => {
    assert.equal(inv.totals.lineNetTotal, '1002.00');
    assert.equal(inv.totals.taxExclusive, '1042.00');
    assert.equal(inv.totals.vatTotal, '228.80');
    assert.deepEqual(brco(inv), []);
  });

  test('a stamp duty on top of the VAT-inclusive total is flagged, not absorbed', async () => {
    const xml = text('fatturapa-ritenuta-cassa-bollo.xml').replace('<ImportoTotaleDocumento>1270.80', '<ImportoTotaleDocumento>1272.80');
    const [i] = await parseText(xml);
    assert.equal(i.otherTaxes[0].includedInTotal, false);
    assert.ok(warningCodes(i).includes('IT_BOLLO_ON_TOP'));
  });
});

describe('FatturaPA: split payment (FPA12)', async () => {
  const inv = await parseOne('fatturapa-split-payment.xml');

  test('EsigibilitaIVA S: VAT stays in vatTotal, the buyer pays it to the tax authority', () => {
    assert.equal(inv.totals.vatTotal, '220.00');
    assert.equal(inv.totals.taxInclusive, '1220.00');
    assert.equal(inv.totals.splitPaymentVat, '220.00');
    assert.equal(inv.totals.payable, '1000.00');
    assert.equal(inv.extensions.it?.vatChargeability, 'S');
    assert.deepEqual(brco(inv), []);
  });

  test('public administration routing and tender codes', () => {
    assert.equal(inv.extensions.it?.transmissionFormat, 'FPA12');
    assert.equal(inv.extensions.it?.recipientCode, 'UFABCD');
    assert.equal(inv.extensions.it?.cup, 'B11C26000010001');
    assert.equal(inv.extensions.it?.cig, '8765432ABC');
    assert.equal(inv.purchaseOrderRef, 'DET-2026-310');
    assert.equal(inv.buyer.name, 'Comune di Esempiopoli');
  });
});

describe('FatturaPA: lot with two bodies', async () => {
  const r = await convert(fixture('fatturapa-lot.xml'), 'fatturapa-lot.xml');
  const o = r.outcomes[0];
  assert.equal(r.outcomes.length, 1);
  assert.equal(o.status, 'ok');
  const invoices = o.status === 'ok' ? o.invoices : [];

  test('one canonical invoice per FatturaElettronicaBody', () => {
    assert.deepEqual(invoices.map((i) => i.id), ['2026/0201', '2026/0202']);
    assert.deepEqual(invoices.map((i) => i.source.indexInFile), [0, 1]);
    assert.deepEqual(invoices.map((i) => i.source.fragmentPath), [
      '/FatturaElettronica/FatturaElettronicaBody[1]', '/FatturaElettronica/FatturaElettronicaBody[2]',
    ]);
    assert.equal(invoices[0].source.payloadSha256, invoices[1].source.payloadSha256);
    assert.deepEqual(invoices.map((i) => i.totals.payable), ['122.00', '61.00']);
    assert.deepEqual(invoices.flatMap(brco), []);
  });

  test('instalments become a payment schedule only when there are several', () => {
    assert.deepEqual(invoices[0].paymentSchedule, []);
    assert.equal(invoices[0].dueDate, '2026-11-25');
    assert.equal(invoices[1].payments.length, 2);
    assert.equal(invoices[1].dueDate, undefined);
    assert.equal(invoices[1].paymentTerms, 'TP01: Pagamento a rate');
    assert.deepEqual(invoices[1].paymentSchedule, [
      { dueDate: '2026-11-25', amount: '30.50', paymentIndex: 0 },
      { dueDate: '2026-12-25', amount: '30.50', paymentIndex: 1 },
    ]);
  });
});

describe('FatturaPA semplificata (FSM10)', async () => {
  const inv = await parseOne('fatturapa-fsm10.xml');

  test('header and parties', () => {
    assert.equal(inv.typeCode, '380');
    assert.equal(inv.nationalType?.code, 'TD07');
    assert.equal(inv.id, 'S/77');
    assert.equal(inv.issueDate, '2026-10-15');
    assert.equal(inv.currency, 'EUR');
    assert.equal(inv.seller.name, 'Rossi Forniture S.r.l.');
    assert.equal(inv.seller.vatId, 'IT01234567890');
    assert.equal(inv.buyer.name, 'Bianchi Impianti S.p.A.');
    assert.equal(inv.buyer.vatId, 'IT09876543210');
    assert.equal(inv.extensions.it?.transmissionFormat, 'FSM10');
    assert.equal(inv.extensions.it?.taxRegime, 'RF01');
    assert.equal(inv.source.format, 'fatturapa-semplificata');
  });

  test('net amounts are Importo minus Imposta, and recorded as derived', () => {
    assert.deepEqual(inv.lines.map((l) => l.netAmount), ['100.00', '50.00']);
    assert.deepEqual(inv.totals, { lineNetTotal: '150.00', taxExclusive: '150.00', vatTotal: '22.00', taxInclusive: '172.00', payable: '172.00' });
    assert.ok(inv.source.derived.some((d) => d.field === '/lines/*/netAmount'));
    assert.deepEqual(brco(inv), []);
  });

  test('VAT breakdown by category, rate and Natura', () => {
    assert.deepEqual(inv.vatBreakdown, [
      { taxableAmount: '100.00', taxAmount: '22.00', categoryCode: 'S', rate: '22.00' },
      { taxableAmount: '50.00', taxAmount: '0.00', categoryCode: 'E', rate: '0.00', exemptionReason: 'Esente art. 10 DPR 633/72', nationalCode: 'IT:N4' },
    ]);
  });

  test('TD08 is a credit note', async () => {
    const [cn] = await parseText(text('fatturapa-fsm10.xml').replace('TD07', 'TD08'));
    assert.equal(cn.kind, 'creditNote');
    assert.equal(cn.typeCode, '381');
  });

  test('the empty stub file is an error naming the missing body, not a crash', async () => {
    const r = await convert(fixture('fattura-semplificata.xml'));
    const o = r.outcomes[0];
    assert.equal(o.status, 'error');
    assert.match(o.status === 'error' ? o.error : '', /FatturaElettronicaBody/);
  });
});

describe('FatturaPA: Natura mapping', () => {
  const cases: [natura: string, category: string][] = [
    ['N1', 'O'], ['N2.2', 'O'], ['N3.1', 'G'], ['N3.2', 'K'], ['N3.5', 'Z'], ['N4', 'E'], ['N5', 'E'], ['N6.3', 'AE'], ['N7', 'O'],
  ];
  for (const [natura, category] of cases) {
    test(`${natura} -> ${category}, national code kept`, async () => {
      const [inv] = await parseText(text('fatturapa-b2b.xml').replaceAll('<Natura>N4</Natura>', `<Natura>${natura}</Natura>`));
      assert.equal(inv.vatBreakdown[1].categoryCode, category);
      assert.equal(inv.vatBreakdown[1].nationalCode, `IT:${natura}`);
      assert.equal(inv.lines[2].vat?.categoryCode, category);
    });
  }

  test('an unknown Natura falls back to O with a warning', async () => {
    const [inv] = await parseText(text('fatturapa-b2b.xml').replaceAll('<Natura>N4</Natura>', '<Natura>N9.9</Natura>'));
    assert.equal(inv.vatBreakdown[1].categoryCode, 'O');
    assert.ok(warningCodes(inv).includes('IT_UNKNOWN_NATURA'));
  });
});

describe('FatturaPA: real sample and failure modes', () => {
  test('the CAdES-signed FPR12 sample parses', async () => {
    const r = await convert(fixture('IT01234567890_FPR12.xml.p7m'), 'IT01234567890_FPR12.xml.p7m');
    assert.equal(r.outcomes[0].status, 'ok');
  });

  test('a malformed amount is an error naming the element', async () => {
    const r = await convert(utf8(text('fatturapa-b2b.xml').replace('<PrezzoTotale>250.00', '<PrezzoTotale>250,00')));
    const o = r.outcomes[0];
    assert.equal(o.status, 'error');
    assert.match(o.status === 'error' ? o.error : '', /PrezzoTotale/);
  });

  test('tampered totals give BR-CO warnings and are not rewritten', async () => {
    const [inv] = await parseText(text('fatturapa-b2b.xml').replace('<ImportoTotaleDocumento>649.00', '<ImportoTotaleDocumento>700.00'));
    assert.equal(inv.totals.payable, '700.00');
    assert.ok(warningCodes(inv).includes('BR-CO-16'));
  });
});
