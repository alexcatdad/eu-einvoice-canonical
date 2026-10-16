/**
 * Mexican CFDI 4.0 and 3.3 (cfdi:Comprobante, SAT Anexo 20) -> canonical.
 *
 * Namespaces: http://www.sat.gob.mx/cfd/4 and http://www.sat.gob.mx/cfd/3; the SAT stamp is
 * tfd:TimbreFiscalDigital (http://www.sat.gob.mx/TimbreFiscalDigital) in Complemento.
 * Everything is an attribute; amounts keep the digits the sender wrote.
 *
 * Only TipoDeComprobante I (ingreso) and E (egreso) are invoices. T (traslado), P (pago) and N
 * (nómina) are detected as other documents and rejected here.
 *
 * Amount conventions (CFDI -> EN 16931):
 *   Line.netAmount     = Concepto/@Importe - Concepto/@Descuento (the discount is also a line allowance)
 *   lineNetTotal       = taxExclusive = SubTotal - Descuento (Descuento is the sum of the line discounts)
 *   vatTotal           = IVA (Impuesto 002) traslados; IEPS and other traslados are in `otherTaxes`
 *   withholdingTotal   = TotalImpuestosRetenidos (ISR, IVA and IEPS retenciones, in `withholdings`)
 *   taxInclusive       = Total + withholdings: the CFDI Total is already net of what the buyer withholds
 *   payable            = Total
 * Percentages: TasaOCuota 0.160000 is stated as a fraction; it becomes the percentage 16.
 * An egreso (credit note) carries positive amounts, as `effectiveSign()` expects.
 *
 * Not mapped: local taxes (Impuestos Locales) and other complements, which are reported as warnings.
 */
import type { Element } from '@xmldom/xmldom';
import type {
  CanonicalInvoice,
  ClearanceInfo,
  Decimal,
  IsoTime,
  Line,
  MxExtension,
  OtherTax,
  Party,
  PaymentInstructions,
  PrecedingInvoiceRef,
  Totals,
  VatBreakdown,
  VatInfo,
  Withholding,
} from '../canonical.js';
import { sub, sum, toDecimal, toIsoDate, ValueError } from '../values.js';
import { Ctx, finish, ParseError, parseXml, sourceMeta, xpathOf } from './context.js';
import type { ParseInput } from './index.js';

const TFD_NS = 'http://www.sat.gob.mx/TimbreFiscalDigital';

const TYPE_LABEL: Record<string, string> = { I: 'Ingreso', E: 'Egreso' };

/** c_FormaPago -> UNCL 4461. The rest become ZZZ with the SAT label in `meansText`. */
const MEANS: Record<string, string> = { '01': '10', '02': '20', '03': '30', '04': '54', '28': '55' };
const MEANS_LABEL: Record<string, string> = {
  '05': 'Monedero electrónico',
  '06': 'Dinero electrónico',
  '08': 'Vales de despensa',
  '12': 'Dación en pago',
  '13': 'Pago por subrogación',
  '14': 'Pago por consignación',
  '15': 'Condonación',
  '17': 'Compensación',
  '23': 'Novación',
  '24': 'Confusión',
  '25': 'Remisión de deuda',
  '26': 'Prescripción o caducidad',
  '27': 'A satisfacción del acreedor',
  '29': 'Tarjeta de servicios',
  '30': 'Aplicación de anticipos',
  '31': 'Intermediario pagos',
  '99': 'Por definir',
};

const WITHHOLDING_SCHEME: Record<string, string> = { '001': 'MX:ISR', '002': 'MX:IVA', '003': 'MX:IEPS' };

/** 0.160000 -> 16, 0.106667 -> 10.6667: moves the decimal point two places, trims trailing zeros. */
export function fractionToPercent(fraction: string): Decimal {
  let d: Decimal;
  try {
    d = toDecimal(fraction);
  } catch (e) {
    if (e instanceof ValueError) throw new ParseError(`tax rate: ${e.message}`);
    throw e;
  }
  const negative = d.startsWith('-');
  const [int, frac = ''] = (negative ? d.slice(1) : d).split('.');
  const padded = frac.padEnd(2, '0');
  const whole = (int + padded.slice(0, 2)).replace(/^0+(?=\d)/, '');
  const rest = padded.slice(2).replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${rest ? `.${rest}` : ''}` as Decimal;
}

interface Tax {
  code: string;
  factor: string;
  rate?: string;
  base?: Decimal;
  amount?: Decimal;
}

export function parseCfdi(input: ParseInput): CanonicalInvoice[] {
  const root = parseXml(input.payload.xml);
  const ns = root.namespaceURI ?? '';
  const c = new Ctx({ cfdi: ns, tfd: TFD_NS });
  const att = (el: Element | undefined, name: string) => c.attr(el, undefined, name);
  const dec = (el: Element | undefined, name: string): Decimal | undefined => {
    const raw = att(el, name);
    if (raw === undefined) return undefined;
    try {
      return toDecimal(raw);
    } catch (e) {
      if (e instanceof ValueError) throw new ParseError(`${el?.localName ?? '?'}/@${name}: ${e.message}`);
      throw e;
    }
  };
  const decReq = (el: Element | undefined, name: string): Decimal => {
    const v = dec(el, name);
    if (v === undefined) throw new ParseError(`${el?.localName ?? 'Comprobante'}/@${name} missing`);
    return v;
  };

  // --- type ------------------------------------------------------------------
  const type = att(root, 'TipoDeComprobante');
  if (type !== 'I' && type !== 'E') {
    throw new ParseError(`TipoDeComprobante '${type ?? ''}' is not an invoice (only I ingreso and E egreso are mapped)`);
  }
  const kind = type === 'E' ? 'creditNote' : 'invoice';
  const version = att(root, 'Version') ?? input.details.version;

  // --- header ----------------------------------------------------------------
  const fecha = att(root, 'Fecha');
  if (!fecha) throw new ParseError('Comprobante/@Fecha missing');
  let issueDate: ReturnType<typeof toIsoDate>;
  try {
    issueDate = toIsoDate(fecha);
  } catch (e) {
    if (e instanceof ValueError) throw new ParseError(`Comprobante/@Fecha: ${e.message}`);
    throw e;
  }
  const currency = att(root, 'Moneda');
  if (!currency) throw new ParseError('Comprobante/@Moneda missing');

  const stamp = c.el(root, 'cfdi:Complemento/tfd:TimbreFiscalDigital');
  const uuid = att(stamp, 'UUID');
  const serie = att(root, 'Serie');
  const folio = att(root, 'Folio');
  let id: string;
  if (serie || folio) {
    id = `${serie ?? ''}${folio ?? ''}`;
    if (serie && folio) c.derive('/id', `Serie '${serie}' and Folio '${folio}' concatenated`);
  } else if (uuid) {
    id = uuid;
    c.derive('/id', 'Serie and Folio absent (both optional in a CFDI); the SAT UUID is used');
  } else {
    throw new ParseError('Comprobante has no Serie/Folio and no TimbreFiscalDigital UUID to identify it');
  }

  // --- parties ---------------------------------------------------------------
  const issuerEl = c.el(root, 'cfdi:Emisor');
  const receiverEl = c.el(root, 'cfdi:Receptor');
  if (!issuerEl || !receiverEl) throw new ParseError('cfdi:Emisor or cfdi:Receptor missing');
  const seller = party(att, issuerEl);
  const buyer = party(att, receiverEl);
  const foreignId = att(receiverEl, 'NumRegIdTrib');
  if (foreignId) buyer.nationalTaxIds.push({ value: foreignId, schemeId: 'MX:NumRegIdTrib' });
  const postal = att(receiverEl, 'DomicilioFiscalReceptor');
  if (postal) buyer.address = { postalCode: postal };

  // --- lines -----------------------------------------------------------------
  const conceptos = c.all(root, 'cfdi:Conceptos/cfdi:Concepto');
  if (conceptos.length === 0) throw new ParseError('cfdi:Conceptos/cfdi:Concepto missing');
  c.derive('/lines/id', 'Concepto has no identifier; position in the document (1-based)');
  const lines = conceptos.map((el, i) => line(c, el, i, att, dec, decReq));

  // --- taxes -----------------------------------------------------------------
  const readTax = (t: Element): Tax => ({
    code: att(t, 'Impuesto') ?? '',
    factor: att(t, 'TipoFactor') ?? '',
    rate: att(t, 'TasaOCuota'),
    base: dec(t, 'Base'),
    amount: dec(t, 'Importe'),
  });
  const lineTransfers = conceptos.flatMap((el) => c.all(el, 'cfdi:Impuestos/cfdi:Traslados/cfdi:Traslado').map(readTax));
  const sameTax = (a: Tax, b: Tax) => a.code === b.code && a.factor === b.factor && a.rate === b.rate;

  const vatBreakdown: VatBreakdown[] = [];
  const otherTaxes: OtherTax[] = [];
  const cuota = new Set<string>();
  for (const el of c.all(root, 'cfdi:Impuestos/cfdi:Traslados/cfdi:Traslado')) {
    const t = readTax(el);
    let base = t.base;
    if (base === undefined) {
      base = sum(lineTransfers.filter((l) => sameTax(l, t) && l.base !== undefined).map((l) => l.base as Decimal));
      c.derive(
        '/vatBreakdown/taxableAmount',
        `Traslado ${t.code}/${t.factor}/${t.rate ?? ''} has no Base (CFDI 3.3 states none at document level); sum of the line bases`,
      );
    }
    if (t.code === '002') {
      if (t.amount === undefined) c.derive('/vatBreakdown/taxAmount', 'IVA traslado without Importe (Exento): tax amount 0');
      vatBreakdown.push({
        taxableAmount: base,
        taxAmount: t.amount ?? ('0' as Decimal),
        categoryCode: vatCategory(t),
        rate: t.factor === 'Tasa' && t.rate !== undefined ? fractionToPercent(t.rate) : undefined,
        nationalCode: `MX:IVA:${t.factor}`,
      });
    } else if (t.amount !== undefined) {
      otherTaxes.push({
        scheme: t.code === '003' ? 'MX:IEPS' : `MX:${t.code}`,
        taxableAmount: base,
        rate: t.factor === 'Tasa' && t.rate !== undefined ? fractionToPercent(t.rate) : undefined,
        amount: t.amount,
        includedInTotal: true,
      });
      if (t.factor === 'Cuota' && !cuota.has(t.code)) {
        cuota.add(t.code);
        c.warn(
          'MX-TAX-CUOTA',
          `Traslado ${t.code} is a fixed amount per unit (TipoFactor Cuota, ${t.rate}); the amount is mapped and the rate left empty`,
          '/cfdi:Comprobante/cfdi:Impuestos/cfdi:Traslados',
        );
      }
    } else {
      c.unmapped[`/cfdi:Comprobante/cfdi:Impuestos/cfdi:Traslados/${t.code}:${t.factor}`] = `Base ${base}, no Importe`;
    }
  }

  const withholdings: Withholding[] = c.all(root, 'cfdi:Impuestos/cfdi:Retenciones/cfdi:Retencion').flatMap((r) => {
    const code = att(r, 'Impuesto') ?? '';
    const amount = dec(r, 'Importe');
    return amount === undefined ? [] : [{ scheme: WITHHOLDING_SCHEME[code] ?? `MX:${code}`, amount }];
  });

  // --- totals ----------------------------------------------------------------
  const subTotal = decReq(root, 'SubTotal');
  const discount = dec(root, 'Descuento');
  const total = decReq(root, 'Total');
  const net = discount === undefined ? subTotal : sub(subTotal, discount);
  const transferred = dec(c.el(root, 'cfdi:Impuestos'), 'TotalImpuestosTrasladados');
  const otherIncluded = sum(otherTaxes.map((o) => o.amount));
  const vatSum = sum(vatBreakdown.map((v) => v.taxAmount));
  let vatTotal: Decimal | undefined;
  if (transferred !== undefined) {
    vatTotal = otherTaxes.length > 0 ? sub(transferred, otherIncluded) : transferred;
    if (otherTaxes.length > 0)
      c.derive('/totals/vatTotal', 'TotalImpuestosTrasladados minus the IEPS and other non-IVA traslados, which are in otherTaxes');
  } else if (vatBreakdown.length > 0) {
    vatTotal = vatSum;
    c.derive('/totals/vatTotal', 'TotalImpuestosTrasladados absent; sum of the IVA traslados');
  }
  const withheld = dec(c.el(root, 'cfdi:Impuestos'), 'TotalImpuestosRetenidos');
  const withholdingTotal = withheld ?? (withholdings.length > 0 ? sum(withholdings.map((w) => w.amount)) : undefined);
  const taxInclusive = withholdingTotal === undefined ? total : sum([total, withholdingTotal]);
  if (withholdingTotal !== undefined)
    c.derive('/totals/taxInclusive', 'Total + retenciones: the CFDI Total is already net of withheld taxes');
  c.derive('/totals/lineNetTotal', 'SubTotal - Descuento: line net amounts are stated after the line discount');
  const totals: Totals = {
    lineNetTotal: net,
    taxExclusive: net,
    vatTotal,
    taxInclusive,
    withholdingTotal,
    payable: total,
  };

  // --- payment, relations, clearance --------------------------------------------
  const form = att(root, 'FormaPago');
  const payments: PaymentInstructions[] = [];
  if (form) {
    const code = MEANS[form] ?? 'ZZZ';
    payments.push({
      meansCode: code,
      meansText: code === 'ZZZ' ? MEANS_LABEL[form] : undefined,
      nationalMeansCode: form,
      creditTransfers: [],
    });
  }

  const precedingInvoices: PrecedingInvoiceRef[] = c.all(root, 'cfdi:CfdiRelacionados').flatMap((group) => {
    const relationType = att(group, 'TipoRelacion');
    return c.all(group, 'cfdi:CfdiRelacionado').flatMap((r) => {
      const related = att(r, 'UUID');
      return related ? [{ id: related, clearanceId: related, relationType }] : [];
    });
  });

  const clearance: ClearanceInfo[] = uuid
    ? [
        {
          authority: 'MX:SAT',
          documentId: uuid,
          receivedAt: att(stamp, 'FechaTimbrado'),
          certificateNumber: att(stamp, 'NoCertificadoSAT'),
          stamp: att(stamp, 'SelloSAT'),
          intermediary: att(stamp, 'RfcProvCertif'),
        },
      ]
    : [];
  if (!stamp)
    c.warn('MX-NO-STAMP', 'No TimbreFiscalDigital: the CFDI has not been stamped by the SAT, so it is not a valid tax document yet');

  for (const holder of c.all(root, 'cfdi:Complemento')) {
    for (let n = holder.firstChild; n; n = n.nextSibling) {
      const comp = n as Element;
      if (comp.nodeType !== 1 || comp.namespaceURI === TFD_NS) continue;
      c.warn('MX-COMPLEMENT-UNMAPPED', `Complemento ${comp.localName} (${comp.namespaceURI ?? ''}) is not mapped`, xpathOf(comp));
    }
  }
  if (c.el(root, 'cfdi:Addenda'))
    c.warn('MX-ADDENDA', 'cfdi:Addenda (sender-defined content) is not mapped', '/cfdi:Comprobante/cfdi:Addenda');

  const global = c.el(root, 'cfdi:InformacionGlobal');
  const rate = dec(root, 'TipoCambio');
  const mx: MxExtension = {
    cfdiVersion: version,
    series: serie,
    folio,
    placeOfIssue: att(root, 'LugarExpedicion'),
    exportation: att(root, 'Exportacion'),
    confirmation: att(root, 'Confirmacion'),
    paymentMethod: att(root, 'MetodoPago'),
    paymentForm: form,
    issuer: {
      taxRegime: att(issuerEl, 'RegimenFiscal'),
      sealCertificateNumber: att(root, 'NoCertificado'),
      seal: att(root, 'Sello'),
    },
    receiver: {
      taxRegime: att(receiverEl, 'RegimenFiscalReceptor'),
      fiscalPostalCode: postal,
      cfdiUse: att(receiverEl, 'UsoCFDI'),
      taxResidence: att(receiverEl, 'ResidenciaFiscal'),
    },
    globalInformation: global
      ? { periodicity: att(global, 'Periodicidad'), months: att(global, 'Meses'), year: att(global, 'Año') }
      : undefined,
    subTotal,
    discount,
  };

  const out = {
    kind,
    typeCode: kind === 'creditNote' ? '381' : '380',
    id,
    issueDate: issueDate.date,
    issueTime: issueDate.droppedTime as IsoTime | undefined,
    nationalType: { scheme: 'MX:TipoDeComprobante', code: type, label: TYPE_LABEL[type] },
    selfBilled: false,
    currency,
    exchangeRate: rate !== undefined && currency !== 'MXN' ? { rate } : undefined,
    paymentTerms: att(root, 'CondicionesDePago'),
    notes: [],
    specificationId: ns,
    precedingInvoices,
    seller,
    buyer,
    additionalParties: [],
    payments,
    paymentSchedule: [],
    allowances: [],
    charges: [],
    totals,
    vatBreakdown,
    otherTaxes,
    withholdings,
    attachments: [],
    lines,
    clearance,
    extensions: { mx },
    source: sourceMeta(input, root, c),
  } as CanonicalInvoice;
  return [finish(out)];
}

function vatCategory(t: Tax): string {
  if (t.factor === 'Exento') return 'E';
  return t.rate !== undefined && Number(t.rate) === 0 ? 'Z' : 'S';
}

function party(att: (el: Element | undefined, name: string) => string | undefined, el: Element): Party {
  const rfc = att(el, 'Rfc');
  return {
    name: att(el, 'Nombre'),
    identifiers: [],
    nationalTaxIds: rfc ? [{ value: rfc, schemeId: 'MX:RFC' }] : [],
  };
}

function line(
  c: Ctx,
  el: Element,
  index: number,
  att: (el: Element | undefined, name: string) => string | undefined,
  dec: (el: Element | undefined, name: string) => Decimal | undefined,
  decReq: (el: Element | undefined, name: string) => Decimal,
): Line {
  const amount = decReq(el, 'Importe');
  const discount = dec(el, 'Descuento');
  const objetoImp = att(el, 'ObjetoImp');
  const unit = att(el, 'ClaveUnidad');
  const productKey = att(el, 'ClaveProdServ');
  const unitPrice = dec(el, 'ValorUnitario');

  let vat: VatInfo | undefined;
  const otherTaxes: OtherTax[] = [];
  for (const t of c.all(el, 'cfdi:Impuestos/cfdi:Traslados/cfdi:Traslado')) {
    const code = att(t, 'Impuesto') ?? '';
    const factor = att(t, 'TipoFactor') ?? '';
    const rawRate = att(t, 'TasaOCuota');
    const percent = factor === 'Tasa' && rawRate !== undefined ? fractionToPercent(rawRate) : undefined;
    if (code === '002') {
      vat ??= { categoryCode: vatCategory({ code, factor, rate: rawRate }), rate: percent, nationalCode: `MX:IVA:${factor}` };
    } else {
      const taxAmount = dec(t, 'Importe');
      if (taxAmount !== undefined) {
        otherTaxes.push({
          scheme: code === '003' ? 'MX:IEPS' : `MX:${code}`,
          taxableAmount: dec(t, 'Base'),
          rate: percent,
          amount: taxAmount,
          includedInTotal: true,
        });
      }
    }
  }
  if (!vat && objetoImp === '01') vat = { categoryCode: 'O', nationalCode: 'MX:ObjetoImp:01' };

  const withholdings: Withholding[] = c.all(el, 'cfdi:Impuestos/cfdi:Retenciones/cfdi:Retencion').flatMap((r) => {
    const code = att(r, 'Impuesto') ?? '';
    const taxAmount = dec(r, 'Importe');
    if (taxAmount === undefined) return [];
    const rawRate = att(r, 'TasaOCuota');
    return [
      {
        scheme: WITHHOLDING_SCHEME[code] ?? `MX:${code}`,
        taxableAmount: dec(r, 'Base'),
        rate: att(r, 'TipoFactor') === 'Tasa' && rawRate !== undefined ? fractionToPercent(rawRate) : undefined,
        amount: taxAmount,
      },
    ];
  });

  const national: Record<string, string | string[]> = {};
  if (objetoImp) national.objetoImp = objetoImp;
  if (unit) national.claveUnidad = unit;
  const customs = c.all(el, 'cfdi:InformacionAduanera').flatMap((a) => att(a, 'NumeroPedimento') ?? []);
  if (customs.length) national.pedimento = customs;
  const cuenta = c.all(el, 'cfdi:CuentaPredial').flatMap((a) => att(a, 'Numero') ?? []);
  if (cuenta.length) national.cuentaPredial = cuenta;
  for (const k of ['Parte', 'ACuentaTerceros', 'ComplementoConcepto']) {
    if (c.el(el, `cfdi:${k}`)) c.unmapped[`/cfdi:Comprobante/cfdi:Conceptos/cfdi:Concepto[${index + 1}]/cfdi:${k}`] = 'present, not mapped';
  }

  return {
    id: String(index + 1),
    quantity: dec(el, 'Cantidad'),
    unitCode: unit,
    unitText: att(el, 'Unidad'),
    netAmount: discount === undefined ? amount : sub(amount, discount),
    allowances: discount === undefined ? [] : [{ amount: discount, reason: 'Descuento' }],
    charges: [],
    price: unitPrice !== undefined ? { net: unitPrice } : undefined,
    vat,
    item: {
      name: att(el, 'Descripcion') ?? '',
      sellerId: att(el, 'NoIdentificacion'),
      classifications: productKey ? [{ code: productKey, listId: 'MX:ClaveProdServ' }] : [],
      attributes: [],
    },
    subjectToWithholding: withholdings.length > 0 ? true : undefined,
    otherTaxes: otherTaxes.length ? otherTaxes : undefined,
    withholdings: withholdings.length ? withholdings : undefined,
    national: Object.keys(national).length ? national : undefined,
  };
}
