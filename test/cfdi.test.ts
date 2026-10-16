import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { convert, detectXml, effectiveSign } from '../src/index.js';
import { fractionToPercent } from '../src/parsers/cfdi.js';
import { fixture, parseOne, utf8, warningCodes } from './helpers.js';

const text = (name: string) => new TextDecoder().decode(fixture(name));
const brco = (codes: string[]) => codes.filter((c) => c.startsWith('BR-CO'));
const UUID_INGRESO = '3f2a9b1c-5d4e-4a7b-8c19-0e6d2f4a7b11';

describe('fractionToPercent', () => {
  test('moves the decimal point and trims trailing zeros', () => {
    assert.equal(fractionToPercent('0.160000'), '16');
    assert.equal(fractionToPercent('0.106667'), '10.6667');
    assert.equal(fractionToPercent('0.265000'), '26.5');
    assert.equal(fractionToPercent('0.000000'), '0');
    assert.equal(fractionToPercent('0.08'), '8');
    assert.equal(fractionToPercent('1'), '100');
  });
});

describe('CFDI 4.0 ingreso: IVA 16 % and 0 %, ISR and IVA withholdings, line discount', async () => {
  const inv = await parseOne('cfdi-40-ingreso-iva-retenciones.xml');

  test('header', () => {
    assert.equal(inv.kind, 'invoice');
    assert.equal(inv.typeCode, '380');
    assert.equal(inv.id, 'A1001');
    assert.ok(inv.source.derived.some((d) => d.field === '/id'));
    assert.equal(inv.issueDate, '2026-03-05');
    assert.equal(inv.issueTime, '10:20:30');
    assert.equal(inv.currency, 'MXN');
    assert.equal(inv.exchangeRate, undefined);
    assert.equal(inv.paymentTerms, 'Contado');
    assert.deepEqual(inv.nationalType, { scheme: 'MX:TipoDeComprobante', code: 'I', label: 'Ingreso' });
    assert.equal(inv.source.format, 'mx-cfdi');
    assert.equal(inv.source.formatVersion, '4.0');
    assert.equal(inv.specificationId, 'http://www.sat.gob.mx/cfd/4');
    assert.equal(effectiveSign(inv), 1);
  });

  test('parties carry the RFC as national tax id and nothing is invented', () => {
    assert.equal(inv.seller.name, 'ESCUELA KEMPER URGATE');
    assert.deepEqual(inv.seller.nationalTaxIds, [{ value: 'EKU9003173C9', schemeId: 'MX:RFC' }]);
    assert.equal(inv.seller.vatId, undefined);
    assert.equal(inv.seller.address, undefined);
    assert.deepEqual(inv.buyer.nationalTaxIds, [{ value: 'URE180429TM6', schemeId: 'MX:RFC' }]);
    assert.deepEqual(inv.buyer.address, { postalCode: '86991' });
  });

  test('extensions.mx', () => {
    const mx = inv.extensions.mx;
    assert.equal(mx?.cfdiVersion, '4.0');
    assert.equal(mx?.series, 'A');
    assert.equal(mx?.folio, '1001');
    assert.equal(mx?.placeOfIssue, '06600');
    assert.equal(mx?.exportation, '01');
    assert.equal(mx?.paymentMethod, 'PUE');
    assert.equal(mx?.paymentForm, '03');
    assert.equal(mx?.issuer?.taxRegime, '601');
    assert.equal(mx?.issuer?.sealCertificateNumber, '30001000000500003416');
    assert.equal(mx?.issuer?.seal, 'U2VsbG9FbWlzb3JTaW50ZXRpY28=');
    assert.deepEqual(mx?.receiver, { taxRegime: '601', fiscalPostalCode: '86991', cfdiUse: 'G03' });
    assert.equal(mx?.subTotal, '11500.00');
    assert.equal(mx?.discount, '100.00');
  });

  test('lines: SAT product key, unit, object of tax, discount and per-line taxes', () => {
    assert.equal(inv.lines.length, 3);
    const [service, keyboard, book] = inv.lines;
    assert.equal(service.item.name, 'Servicios de consultoría');
    assert.equal(service.item.sellerId, 'SRV-01');
    assert.deepEqual(service.item.classifications, [{ code: '80101505', listId: 'MX:ClaveProdServ' }]);
    assert.equal(service.unitCode, 'E48');
    assert.equal(service.unitText, 'Unidad de servicio');
    assert.equal(service.quantity, '1');
    assert.equal(service.price?.net, '10000.00');
    assert.equal(service.netAmount, '10000.00');
    assert.deepEqual(service.vat, { categoryCode: 'S', rate: '16', nationalCode: 'MX:IVA:Tasa' });
    assert.deepEqual(service.national, { objetoImp: '02', claveUnidad: 'E48' });
    assert.equal(service.subjectToWithholding, true);
    assert.deepEqual(service.withholdings, [
      { scheme: 'MX:ISR', taxableAmount: '10000.00', rate: '10', amount: '1000.00' },
      { scheme: 'MX:IVA', taxableAmount: '10000.00', rate: '10.6667', amount: '1066.67' },
    ]);

    assert.equal(keyboard.quantity, '2');
    assert.equal(keyboard.unitCode, 'H87');
    assert.equal(keyboard.netAmount, '900.00');
    assert.deepEqual(keyboard.allowances, [{ amount: '100.00', reason: 'Descuento' }]);
    assert.equal(keyboard.subjectToWithholding, undefined);

    assert.deepEqual(book.vat, { categoryCode: 'Z', rate: '0', nationalCode: 'MX:IVA:Tasa' });
    assert.equal(book.item.sellerId, undefined);
  });

  test('IVA goes to vatBreakdown, ISR and IVA retenciones to withholdings', () => {
    assert.deepEqual(inv.vatBreakdown, [
      { taxableAmount: '10900.00', taxAmount: '1744.00', categoryCode: 'S', rate: '16', nationalCode: 'MX:IVA:Tasa' },
      { taxableAmount: '500.00', taxAmount: '0.00', categoryCode: 'Z', rate: '0', nationalCode: 'MX:IVA:Tasa' },
    ]);
    assert.deepEqual(inv.otherTaxes, []);
    assert.deepEqual(inv.withholdings, [
      { scheme: 'MX:ISR', amount: '1000.00' },
      { scheme: 'MX:IVA', amount: '1066.67' },
    ]);
  });

  test('totals: Total is net of withholdings, so taxInclusive adds them back', () => {
    const t = inv.totals;
    assert.equal(t.lineNetTotal, '11400.00');
    assert.equal(t.taxExclusive, '11400.00');
    assert.equal(t.vatTotal, '1744.00');
    assert.equal(t.withholdingTotal, '2066.67');
    assert.equal(t.taxInclusive, '13144.00');
    assert.equal(t.payable, '11077.33');
    assert.deepEqual(brco(warningCodes(inv)), []);
  });

  test('payment means from FormaPago', () => {
    assert.deepEqual(inv.payments, [{ meansCode: '30', nationalMeansCode: '03', creditTransfers: [] }]);
  });

  test('SAT stamp becomes clearance', () => {
    assert.deepEqual(inv.clearance, [
      {
        authority: 'MX:SAT',
        documentId: UUID_INGRESO,
        receivedAt: '2026-03-05T10:21:04',
        certificateNumber: '30001000000500003456',
        stamp: 'U2VsbG9TQVRTaW50ZXRpY28=',
        intermediary: 'SPR190613I52',
      },
    ]);
    assert.deepEqual(inv.precedingInvoices, []);
  });
});

describe('CFDI 4.0 egreso related to an invoice', async () => {
  const inv = await parseOne('cfdi-40-egreso-relacionado.xml');

  test('is a credit note with positive amounts', () => {
    assert.equal(inv.kind, 'creditNote');
    assert.equal(inv.typeCode, '381');
    assert.equal(effectiveSign(inv), -1);
    assert.equal(inv.id, 'NC45');
    assert.deepEqual(inv.nationalType, { scheme: 'MX:TipoDeComprobante', code: 'E', label: 'Egreso' });
    assert.equal(inv.totals.payable, '1160.00');
    assert.equal(inv.totals.vatTotal, '160.00');
    assert.equal(inv.totals.withholdingTotal, undefined);
    assert.deepEqual(brco(warningCodes(inv)), []);
  });

  test('CfdiRelacionados become precedingInvoices with the relation type', () => {
    assert.deepEqual(inv.precedingInvoices, [{ id: UUID_INGRESO, clearanceId: UUID_INGRESO, relationType: '01' }]);
    assert.equal(inv.extensions.mx?.receiver?.cfdiUse, 'G02');
  });
});

describe('CFDI 4.0 with IEPS (rate and fixed amount)', async () => {
  const inv = await parseOne('cfdi-40-ieps.xml');

  test('IEPS is in otherTaxes, IVA on top of it in vatBreakdown', () => {
    assert.deepEqual(inv.otherTaxes, [
      { scheme: 'MX:IEPS', taxableAmount: '1000.00', rate: '26.5', amount: '265.00', includedInTotal: true },
      { scheme: 'MX:IEPS', taxableAmount: '100.000000', amount: '59.24', includedInTotal: true },
    ]);
    assert.deepEqual(inv.vatBreakdown, [
      { taxableAmount: '3324.24', taxAmount: '531.88', categoryCode: 'S', rate: '16', nationalCode: 'MX:IVA:Tasa' },
    ]);
  });

  test('vatTotal excludes the IEPS that TotalImpuestosTrasladados includes', () => {
    assert.equal(inv.totals.vatTotal, '531.88');
    assert.equal(inv.totals.taxInclusive, '3856.12');
    assert.equal(inv.totals.payable, '3856.12');
    assert.ok(inv.source.derived.some((d) => d.field === '/totals/vatTotal'));
    assert.deepEqual(brco(warningCodes(inv)), []);
  });

  test('a fixed-amount (Cuota) IEPS is mapped without a rate and warned once', () => {
    assert.deepEqual(
      warningCodes(inv).filter((c) => c === 'MX-TAX-CUOTA'),
      ['MX-TAX-CUOTA'],
    );
  });

  test('line-level IEPS and IVA', () => {
    const [beer, fuel] = inv.lines;
    assert.deepEqual(beer.otherTaxes, [
      { scheme: 'MX:IEPS', taxableAmount: '1000.00', rate: '26.5', amount: '265.00', includedInTotal: true },
    ]);
    assert.deepEqual(beer.vat, { categoryCode: 'S', rate: '16', nationalCode: 'MX:IVA:Tasa' });
    assert.equal(fuel.unitCode, 'LTR');
    assert.equal(fuel.otherTaxes?.[0].rate, undefined);
  });

  test('cash payment', () => {
    assert.equal(inv.payments[0].meansCode, '10');
  });
});

describe('CFDI 3.3 in USD for a foreign buyer, deferred payment', async () => {
  const inv = await parseOne('cfdi-33-ingreso-usd.xml');

  test('version, currency and exchange rate', () => {
    assert.equal(inv.source.formatVersion, '3.3');
    assert.equal(inv.specificationId, 'http://www.sat.gob.mx/cfd/3');
    assert.equal(inv.currency, 'USD');
    assert.deepEqual(inv.exchangeRate, { rate: '20.4567' });
    assert.equal(inv.issueDate, '2021-11-15');
  });

  test('foreign buyer: generic RFC plus the foreign tax id, no address invented', () => {
    assert.deepEqual(inv.buyer.nationalTaxIds, [
      { value: 'XEXX010101000', schemeId: 'MX:RFC' },
      { value: '98-7654321', schemeId: 'MX:NumRegIdTrib' },
    ]);
    assert.equal(inv.buyer.address, undefined);
    assert.equal(inv.extensions.mx?.receiver?.taxResidence, 'USA');
    assert.equal(inv.extensions.mx?.receiver?.cfdiUse, 'P01');
  });

  test('3.3 states no Base at document level: it is derived from the lines', () => {
    assert.equal(inv.vatBreakdown[0].taxableAmount, '1000.00');
    assert.ok(inv.source.derived.some((d) => d.field === '/vatBreakdown/taxableAmount'));
    assert.deepEqual(brco(warningCodes(inv)), []);
  });

  test('FormaPago 99 (por definir) and MetodoPago PPD', () => {
    assert.deepEqual(inv.payments, [{ meansCode: 'ZZZ', meansText: 'Por definir', nationalMeansCode: '99', creditTransfers: [] }]);
    assert.equal(inv.extensions.mx?.paymentMethod, 'PPD');
  });
});

describe('CFDI detection', () => {
  const root = (type: string, extra = '') =>
    `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" TipoDeComprobante="${type}"${extra}/>`;
  const kind = (xml: string) => detectXml(xml).kind;

  test('I and E are invoices', () => {
    for (const t of ['I', 'E']) {
      const d = detectXml(root(t));
      assert.equal(d.kind, 'invoice');
      if (d.kind === 'invoice') {
        assert.equal(d.format.id, 'mx-cfdi');
        assert.equal(d.details.version, '4.0');
        assert.equal(d.details.profile, t);
      }
    }
  });

  test('3.3 namespace and a missing Version attribute', () => {
    const d = detectXml('<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/3" TipoDeComprobante="I"/>');
    assert.equal(d.kind === 'invoice' && d.details.version, '3.3');
  });

  test('T, P and N are other documents, each with its own label', () => {
    const label = (t: string) => {
      const d = detectXml(root(t));
      return d.kind === 'other-document' ? d.label : d.kind;
    };
    assert.match(label('P'), /pago/i);
    assert.match(label('T'), /traslado/i);
    assert.match(label('N'), /nómina/i);
    assert.match(label('X'), /unrecognised/);
    assert.equal(kind(root('')), 'other-document');
  });

  test('the Pagos 2.0 complement fixture is not an invoice', async () => {
    const r = await convert(fixture('cfdi-40-pago.xml'), 'cfdi-40-pago.xml');
    assert.equal(r.outcomes[0].status, 'not-an-invoice');
    const d = r.outcomes[0].detection;
    assert.equal(d.kind, 'other-document');
    if (d.kind === 'other-document') assert.match(d.label, /Complemento de pagos/);
  });

  test('other roots named Comprobante are not CFDI', () => {
    assert.equal(kind('<Comprobante xmlns="urn:example" TipoDeComprobante="I"/>'), 'unknown');
  });
});

describe('CFDI edge cases', () => {
  const base = text('cfdi-40-ingreso-iva-retenciones.xml');
  const run = async (xml: string) => (await convert(utf8(xml))).outcomes[0];

  test('without Serie and Folio the SAT UUID identifies the invoice', async () => {
    const o = await run(base.replace(' Serie="A" Folio="1001"', ''));
    assert.equal(o.status, 'ok');
    if (o.status === 'ok') {
      assert.equal(o.invoices[0].id, UUID_INGRESO);
      assert.ok(o.invoices[0].source.derived.some((d) => d.field === '/id' && /UUID/.test(d.rule)));
    }
  });

  test('without the stamp the invoice parses with a warning and no clearance', async () => {
    const o = await run(base.replace(/<cfdi:Complemento>[\s\S]*<\/cfdi:Complemento>/, ''));
    assert.equal(o.status, 'ok');
    if (o.status === 'ok') {
      assert.deepEqual(o.invoices[0].clearance, []);
      assert.ok(warningCodes(o.invoices[0]).includes('MX-NO-STAMP'));
    }
  });

  test('no Serie, Folio or stamp: an unstamped draft gets a placeholder id from the issuer, the timestamp and its hash', async () => {
    const o = await run(base.replace(' Serie="A" Folio="1001"', '').replace(/<cfdi:Complemento>[\s\S]*<\/cfdi:Complemento>/, ''));
    assert.equal(o.status, 'ok');
    if (o.status === 'ok') {
      const inv = o.invoices[0];
      assert.match(inv.id, /^UNSTAMPED:EKU9003173C9:2026-03-05T10:20:30:[0-9a-f]{12}$/);
      assert.ok(warningCodes(inv).includes('MX-NO-ID'));
      assert.ok(inv.source.derived.some((d) => d.field === '/id' && /placeholder/.test(d.rule)));
    }
  });

  test('two unstamped drafts from the same issuer in the same second get different ids', async () => {
    const draft = base.replace(' Serie="A" Folio="1001"', '').replace(/<cfdi:Complemento>[\s\S]*<\/cfdi:Complemento>/, '');
    const a = await run(draft);
    const b = await run(draft.replace('Total="11077.33"', 'Total="11077.34"'));
    assert.ok(a.status === 'ok' && b.status === 'ok');
    if (a.status === 'ok' && b.status === 'ok') assert.notEqual(a.invoices[0].id, b.invoices[0].id);
  });

  test('a complement other than the stamp is reported, not dropped silently', async () => {
    const o = await run(
      base.replace(
        '<cfdi:Complemento>',
        '<cfdi:Complemento><implocal:ImpuestosLocales xmlns:implocal="http://www.sat.gob.mx/implocal" version="1.0" TotaldeRetenciones="0.00" TotaldeTraslados="0.00"/>',
      ),
    );
    assert.equal(o.status, 'ok');
    if (o.status === 'ok') {
      const w = o.invoices[0].source.warnings.find((x) => x.code === 'MX-COMPLEMENT-UNMAPPED');
      assert.ok(w);
      assert.match(w.message, /ImpuestosLocales/);
    }
  });

  test('exempt IVA (Exento) is category E with a zero tax amount', async () => {
    const xml = base
      .replace(
        'TipoFactor="Tasa" TasaOCuota="0.000000" Importe="0.00"/>\n        </cfdi:Traslados>\n      </cfdi:Impuestos>\n    </cfdi:Concepto>\n  </cfdi:Conceptos>',
        'TipoFactor="Exento"/>\n        </cfdi:Traslados>\n      </cfdi:Impuestos>\n    </cfdi:Concepto>\n  </cfdi:Conceptos>',
      )
      .replace(
        '<cfdi:Traslado Base="500.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.000000" Importe="0.00"/>\n    </cfdi:Traslados>\n  </cfdi:Impuestos>',
        '<cfdi:Traslado Base="500.00" Impuesto="002" TipoFactor="Exento"/>\n    </cfdi:Traslados>\n  </cfdi:Impuestos>',
      );
    const o = await run(xml);
    assert.equal(o.status, 'ok');
    if (o.status === 'ok') {
      const exempt = o.invoices[0].vatBreakdown[1];
      assert.deepEqual(exempt, { taxableAmount: '500.00', taxAmount: '0', categoryCode: 'E', nationalCode: 'MX:IVA:Exento' });
      assert.equal(o.invoices[0].lines[2].vat?.categoryCode, 'E');
    }
  });

  test('a malformed amount is an error that names the attribute', async () => {
    const o = await run(base.replace('SubTotal="11500.00"', 'SubTotal="11,500.00"'));
    assert.equal(o.status, 'error');
    if (o.status === 'error') assert.match(o.error, /Comprobante\/@SubTotal/);
  });

  test('a Comprobante without conceptos is an error', async () => {
    const o = await run(base.replace(/<cfdi:Conceptos>[\s\S]*<\/cfdi:Conceptos>/, ''));
    assert.equal(o.status, 'error');
  });
});
