/**
 * Case spec -> printed document -> answer key. The key is derived from the spec and the printed model only,
 * never read back from a PDF. Format: se-pdf/truth/SCHEMA.md (schemaVersion 1) in the private cache repository.
 */
import { containsPersonalNumber, luhn, parseGln, parseIban } from '../../src/pdf-extract/se/identifiers.js';
import type { Truth } from '../pdf-eval/score.js';
import { buildConstruction, type Construction } from './construction.js';
import { type Layout, type Placed, placeLayout } from './layouts.js';

export type Renderer = 'docx' | 'xlsx' | 'pdflib';
export type Variant = 'standard14' | 'no-ruling' | 'type0-gid' | 'producer-word' | 'producer-visma' | 'scan-qr';

export interface Party {
  name: string;
  address: string[];
  /** Printed by the fixed layouts only. */
  orgnr?: string;
  /** Peppol viewer only: a GS1 GLN party ID, printed as "ID: <gln> [0088]" in the party block. */
  gln?: string;
  /** Peppol viewer only: the electronic address as "<EAS scheme>:<value>", printed as "Köparens/Säljarens PEPPOL-ID". */
  peppolId?: string;
  /** Peppol viewer only: further party IDs as "<scheme>:<value>", printed as "ID: <value> [<scheme>]" after the GLN. */
  ids?: string[];
}
export interface Seller extends Party {
  orgnr: string;
  fskatt?: boolean;
  bankgiro?: string;
  plusgiro?: string;
  iban?: string;
  bic?: string;
}
export interface LineSpec {
  name: string;
  qty: string;
  unit: string;
  price: string;
  rate: number;
  /** Labour that counts for the ROT/RUT/grön teknik deduction. */
  labour?: boolean;
  /** Fixed layouts: the UN/ECE unit code a Peppol viewer prints instead of `unit`. */
  unitCode?: string;
  /** Fixed layouts: note lines printed under the item (labelled "Anteckning:" by the Peppol viewer). */
  note?: string[];
}
export interface CaseSpec {
  file: string;
  covers: string;
  renderer: Renderer;
  variant?: Variant;
  document: 'invoice' | 'credit-note' | 'reminder';
  pages?: number;
  number: string;
  issueDate: string;
  dueDate: string;
  customer: string;
  ocr?: string;
  /** Credit note: the invoice it credits. */
  credits?: string;
  seller: Seller;
  buyer: Party;
  /** Factoring: payment goes to this party's Bankgiro. */
  payee?: { name: string; bankgiro: string };
  lines: LineSpec[];
  /** Print "Netto" (BT-106). Default true. */
  netto?: boolean;
  allowance?: { amount: string; rate: number };
  charge?: { label: string; amount: string; rate: number };
  exemptReason?: string;
  deduction?: { kind: 'ROT' | 'RUT' | 'GRON_TEKNIK'; percent: number };
  /** Öresavrundning to whole kronor. */
  rounding?: boolean;
  /** Reminder: fee added to the unpaid amount. */
  reminderFee?: string;
  /** pdf-lib only: a fixed-position layout (layouts.ts) instead of the block layout. */
  layout?: Layout;
  buyerReference?: string;
  orderReference?: string;
  /** Peppol viewer only: invoice note lines (BT-22), printed under an "Anteckning" heading. */
  invoiceNote?: string[];
  /** Fixed layouts: the payment terms text (BT-20) on the Peppol viewer page and on the issuer page. Default "30 dgr netto". */
  paymentTerms?: { peppol?: string; issuer?: string };
  /** A multi-page construction invoice with attached documents (construction.ts); `lines` is then unused. */
  construction?: Construction;
  /** Peppol viewer: phone and e-mail under "KÖPARENS KONTAKT", instead of the default phone line. */
  buyerContact?: { phone?: string; email?: string };
  /**
   * Fixed layouts: the seller's contact phone and e-mail, under "SÄLJARENS KONTAKT" on the Peppol viewer page instead
   * of the default phone line, and at "Frågor ang. fakturan:" on the issuer page.
   */
  sellerContact?: { phone: string; email: string };
  /** Issuer layout: the phone number in the footer. Default 010-000 0000. */
  footerPhone?: string;
  /** Peppol viewer: a terms text printed under the invoice note, after a gap. */
  peppolTerms?: string;
  /** Peppol viewer: "ÖVRIGA DOKUMENTREFERENSER" with one reference, optionally with its attached file's type and name. */
  documentReference?: { id: string; description: string; file?: { type: string; name: string } };
  /** Peppol viewer: "Faktureringsobjekt: <id>" (BT-18). */
  invoicedObject?: string;
  /** Issuer layout: "Besöksadress:" in the footer, the address under it. */
  visitingAddress?: string;
  /** Issuer layout: the label "Urspr. faktura:" with no value. */
  originalInvoiceLabel?: boolean;
}

/** What the page shows. Renderers lay this out and add nothing. */
export interface Printed {
  title: string;
  seller: string[];
  buyerLabel: string;
  buyer: string[];
  meta: [string, string][];
  items?: { header: string[]; rows: string[][] };
  vat?: { header: string[]; rows: string[][] };
  totals: [string, string][];
  notes: string[];
  payment: [string, string][];
  footer: string[];
  /** A fixed-position layout: every text with its place; the fields above are then empty. */
  placed?: Placed[];
  /** Variant scan-qr: the page is a scanned image with no text layer, and this payment QR code (UsingQR JSON) on it. */
  qr?: string;
}

const ore = (s: string) => Math.round(Number(s) * 100);
export const fmtAmount = (o: number) => {
  const neg = o < 0;
  const a = Math.abs(o);
  const kr = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${neg ? '-' : ''}${kr},${String(a % 100).padStart(2, '0')}`;
};
const key = (o: number) => (o / 100).toFixed(2);
const sv = (s: string) => s.replace('.', ',');
const orgnr = (d: string) => `${d.slice(0, 6)}-${d.slice(6)}`;
const giro = (d: string) => `${d.slice(0, -4)}-${d.slice(-4)}`;
const plusgiro = (d: string) => `${d.slice(0, -1)}-${d.slice(-1)}`;
const iban = (s: string) => s.replace(/(.{4})/g, '$1 ').trim();
const vatId = (org: string) => `SE${org}01`;
const DEDUCTION = {
  ROT: ['Avgår ROT-avdrag', 'Skattereduktion för rotarbete (ROT) har dragits av enligt kundens begäran.'],
  RUT: ['Avgår RUT-avdrag', 'Skattereduktion för hushållsarbete (RUT) har dragits av enligt kundens begäran.'],
  GRON_TEKNIK: ['Avgår skattereduktion grön teknik', 'Skattereduktion för installation av grön teknik har dragits av.'],
} as const;

export interface Model {
  spec: CaseSpec;
  printed: Printed;
  truth?: Omit<Truth, 'sha256'>;
}

export function build(spec: CaseSpec): Model {
  if (spec.construction) return buildConstruction(spec);
  validate(spec);
  if (spec.document === 'reminder') return { spec, printed: reminder(spec) };
  const s = spec.seller;
  const nets = spec.lines.map((l) => Math.round(Number(l.qty) * Number(l.price) * 100));
  const lineNet = nets.reduce((a, b) => a + b, 0);
  const A = spec.allowance ? ore(spec.allowance.amount) : 0;
  const C = spec.charge ? ore(spec.charge.amount) : 0;
  const rates = [...new Set(spec.lines.map((l) => l.rate))].sort((a, b) => b - a);
  const vatRows = rates.map((rate) => {
    const taxable =
      spec.lines.reduce((a, l, i) => a + (l.rate === rate ? nets[i] : 0), 0) -
      (spec.allowance?.rate === rate ? A : 0) +
      (spec.charge?.rate === rate ? C : 0);
    return { rate, taxable, tax: Math.round((taxable * rate) / 100) };
  });
  const taxExcl = lineNet - A + C;
  const vatTotal = vatRows.reduce((a, r) => a + r.tax, 0);
  const taxIncl = taxExcl + vatTotal;
  const prepaid = spec.deduction
    ? Math.round(
        (spec.deduction.percent / 100) *
          spec.lines.reduce((a, l, i) => a + (l.labour ? Math.round(nets[i] * (1 + l.rate / 100)) : 0), 0) *
          0.01,
      ) * 100
    : 0;
  const unrounded = taxIncl - prepaid;
  const payable = spec.rounding ? Math.round(unrounded / 100) * 100 : unrounded;
  const rounding = payable - unrounded;
  const exempt = spec.exemptReason !== undefined;
  const netto = spec.netto !== false;
  const showExcl = !netto || A !== 0 || C !== 0;

  const totals: [string, string][] = [];
  if (netto) totals.push(['Netto', fmtAmount(lineNet)]);
  if (A) totals.push(['Rabatt', fmtAmount(A)]);
  if (C) totals.push([spec.charge!.label, fmtAmount(C)]);
  if (showExcl) totals.push(['Summa exkl. moms', fmtAmount(taxExcl)]);
  totals.push(['Moms', fmtAmount(vatTotal)], ['Summa inkl. moms', fmtAmount(taxIncl)]);
  if (spec.deduction) totals.push([DEDUCTION[spec.deduction.kind][0], fmtAmount(prepaid)]);
  if (spec.rounding) totals.push(['Öresavrundning', fmtAmount(rounding)]);
  totals.push(['Att betala (kr)', fmtAmount(payable)]);

  const payTo = spec.payee ? { bankgiro: spec.payee.bankgiro } : s;
  const payment: [string, string][] = [];
  if (payTo.bankgiro) payment.push(['Bankgiro', giro(payTo.bankgiro)]);
  if (!spec.payee && s.plusgiro) payment.push(['PlusGiro', plusgiro(s.plusgiro)]);
  if (!spec.payee && s.iban) payment.push(['IBAN', iban(s.iban)]);
  if (!spec.payee && s.bic) payment.push(['BIC', s.bic]);
  if (spec.ocr) payment.push(['OCR-nummer', spec.ocr]);

  const notes: string[] = [];
  if (spec.payee)
    notes.push(
      `Denna faktura har överlåtits till ${spec.payee.name}. Betalning ska endast ske till bankgiro ${giro(spec.payee.bankgiro)}.`,
    );
  if (exempt) notes.push(spec.exemptReason!);
  if (spec.deduction) notes.push(DEDUCTION[spec.deduction.kind][1]);

  const credit = spec.document === 'credit-note';
  const layout = spec.layout;
  const printed: Printed = layout
    ? {
        title: '',
        seller: [],
        buyerLabel: '',
        buyer: [],
        meta: [],
        totals: [],
        notes: [],
        payment: [],
        footer: [],
        placed: placeLayout(spec, { nets, vatRows, lineNet, taxExcl, vatTotal, taxIncl, rounding, payable }, layout),
      }
    : {
        title: credit ? 'KREDITFAKTURA' : 'FAKTURA',
        seller: [s.name, ...s.address],
        buyerLabel: 'Fakturaadress',
        buyer: [spec.buyer.name, ...spec.buyer.address],
        meta: [
          ['Fakturanummer', spec.number],
          ['Fakturadatum', spec.issueDate],
          ['Förfallodatum', spec.dueDate],
          ['Kundnummer', spec.customer],
          ...(spec.credits ? ([['Krediterar faktura', spec.credits]] as [string, string][]) : []),
        ],
        items: {
          header: ['Beskrivning', 'Antal', 'Enhet', 'À-pris', 'Moms %', 'Belopp'],
          rows: spec.lines.map((l, i) => [l.name, sv(l.qty), l.unit, sv(l.price), String(l.rate), fmtAmount(nets[i])]),
        },
        vat: {
          header: ['Momssats', 'Underlag', 'Moms'],
          rows: vatRows.map((r) => [exempt && r.rate === 0 ? 'Momsfri' : `${r.rate} %`, fmtAmount(r.taxable), fmtAmount(r.tax)]),
        },
        totals,
        notes,
        payment,
        footer: [s.name, `Org.nr ${orgnr(s.orgnr)}`, `Momsreg.nr ${vatId(s.orgnr)}`, ...(s.fskatt ? ['Godkänd för F-skatt'] : [])],
      };
  if (spec.variant === 'scan-qr') {
    const ymd = (d: string) => d.replaceAll('-', '');
    printed.qr = JSON.stringify({
      uqr: 1,
      tp: 1,
      nme: s.name,
      cid: orgnr(s.orgnr),
      iref: spec.ocr,
      idt: ymd(spec.issueDate),
      ddt: ymd(spec.dueDate),
      due: payable / 100,
      cur: 'SEK',
      pt: 'BG',
      acc: giro(payTo.bankgiro!),
    });
  }

  // What the fixed layouts print: the Peppol viewer prints the totals with and without VAT, the issuer layout always
  // prints the rounding box but no total with or without VAT
  const peppol = layout === 'peppol-viewer' || layout === 'peppol-and-issuer';
  const shows = {
    lineNet: layout ? true : netto,
    excl: layout ? peppol : showExcl,
    incl: layout ? peppol : true,
    rounding: layout ? layout !== 'peppol-viewer' || !!spec.rounding : !!spec.rounding,
  };
  const v = (x: string | undefined) => (x === undefined ? { status: 'absent' as const } : { value: x });
  // A credit note carries positive magnitudes in the canonical model (effectiveSign), whatever signs the page prints
  const sgn = credit ? -1 : 1;
  const mag = (o: number) => key(sgn * o);
  const amount = (o: number, shown: boolean) => v(shown ? mag(o) : undefined);
  const truth: Omit<Truth, 'sha256'> = {
    schemaVersion: 1,
    file: `${spec.file}.pdf`,
    documentType: credit ? 'credit-note' : 'invoice',
    typeCode: credit ? '381' : '380',
    invoicePages: Array.from({ length: spec.pages ?? 1 }, (_, i) => i + 1),
    pricesIncludeVat: false,
    fields: {
      id: v(spec.number),
      issueDate: v(spec.issueDate),
      dueDate: v(spec.dueDate),
      currency: v('SEK'),
      'seller.name': v(s.name),
      'seller.legalRegistrationId': v(s.orgnr),
      'seller.vatId': v(vatId(s.orgnr)),
      'seller.taxRegistrationId': v(s.fskatt ? 'Godkänd för F-skatt' : undefined),
      'buyer.name': v(spec.buyer.name),
      'payee.name': v(spec.payee?.name),
      'payment.bankgiro': v(payTo.bankgiro),
      'payment.plusgiro': v(spec.payee ? undefined : s.plusgiro),
      'payment.iban': v(spec.payee ? undefined : s.iban),
      'payment.bic': v(spec.payee ? undefined : s.bic),
      'payment.remittanceInformation': v(spec.ocr),
      'totals.lineNetTotal': amount(lineNet, shows.lineNet),
      'totals.allowanceTotal': amount(A, A !== 0),
      'totals.chargeTotal': amount(C, C !== 0),
      'totals.taxExclusive': amount(taxExcl, shows.excl),
      'totals.vatTotal': amount(vatTotal, true),
      'totals.taxInclusive': amount(taxIncl, shows.incl),
      'totals.prepaid': amount(prepaid, !!spec.deduction),
      'totals.prepaidNote': v(spec.deduction?.kind),
      'totals.rounding': amount(rounding, shows.rounding),
      'totals.payable': amount(payable, true),
    },
    vatBreakdown: {
      rows: vatRows.map((r) => ({
        categoryCode: exempt && r.rate === 0 ? 'E' : 'S',
        rate: exempt && r.rate === 0 ? { status: 'absent' as const } : { value: String(r.rate) },
        taxableAmount: { value: mag(r.taxable) },
        taxAmount: { value: mag(r.tax) },
        ...(exempt && r.rate === 0 ? { exemptionReason: { value: spec.exemptReason! } } : {}),
      })),
    },
    lines: {
      rows: spec.lines.map((l, i) => ({
        'item.name': { value: l.name },
        quantity: { value: credit ? String(-Number(l.qty)) : l.qty },
        // The Peppol viewer's table is read: its unit code
        unitText: { value: peppol ? (l.unitCode ?? l.unit) : l.unit },
        'price.net': { value: l.price },
        'vat.rate': { value: String(l.rate) },
        netAmount: { value: mag(nets[i]) },
      })),
    },
    notes: `Synthetic (scripts/pdf-synth): ${spec.covers}`,
  };
  return { spec, printed, truth };
}

function reminder(spec: CaseSpec): Printed {
  const s = spec.seller;
  const unpaid = spec.lines.reduce((a, l) => a + Math.round(Number(l.qty) * Number(l.price) * 100 * (1 + l.rate / 100)), 0);
  const fee = ore(spec.reminderFee ?? '0');
  return {
    title: 'BETALNINGSPÅMINNELSE',
    seller: [s.name, ...s.address],
    buyerLabel: 'Kund',
    buyer: [spec.buyer.name, ...spec.buyer.address],
    meta: [
      ['Påminnelsedatum', spec.issueDate],
      ['Avser faktura', spec.number],
      ['Ursprungligt förfallodatum', spec.dueDate],
      ['Kundnummer', spec.customer],
    ],
    totals: [
      ['Obetalt belopp', fmtAmount(unpaid)],
      ['Påminnelseavgift', fmtAmount(fee)],
      ['Att betala (kr)', fmtAmount(unpaid + fee)],
    ],
    notes: ['Enligt våra noteringar har nedanstående faktura ännu inte betalats. Vänligen betala inom 10 dagar.'],
    payment: [
      ...(s.bankgiro ? ([['Bankgiro', giro(s.bankgiro)]] as [string, string][]) : []),
      ...(spec.ocr ? ([['OCR-nummer', spec.ocr]] as [string, string][]) : []),
    ],
    footer: [s.name, `Org.nr ${orgnr(s.orgnr)}`, `Momsreg.nr ${vatId(s.orgnr)}`],
  };
}

/** The checks of SCHEMA.md that the spec itself must pass, plus no personnummer-like identifiers. */
function validate(spec: CaseSpec) {
  const fail = (m: string) => {
    throw new Error(`${spec.file}: ${m}`);
  };
  const s = spec.seller;
  for (const [name, d] of [
    ['org.nr', s.orgnr],
    ['bankgiro', s.bankgiro],
    ['plusgiro', s.plusgiro],
    ['payee bankgiro', spec.payee?.bankgiro],
    ['OCR', spec.ocr],
  ] as const) {
    if (d === undefined) continue;
    if (!/^\d+$/.test(d) || !luhn(d)) fail(`${name} fails Luhn`);
    if (containsPersonalNumber(d)) fail(`${name} looks like a personnummer`);
  }
  if (s.orgnr.length !== 10) fail('org.nr must have 10 digits');
  if (s.iban && parseIban(s.iban) !== s.iban) fail('IBAN fails mod 97');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(spec.issueDate) || !/^\d{4}-\d{2}-\d{2}$/.test(spec.dueDate)) fail('dates must be YYYY-MM-DD');
  if (!/^[a-z0-9-]+$/.test(spec.file)) fail('file name');
  for (const l of spec.lines) if (!/^-?\d+(\.\d+)?$/.test(l.qty) || !/^\d+(\.\d+)?$/.test(l.price)) fail(`line ${l.name}`);
  if (spec.layout && spec.renderer !== 'pdflib') fail('fixed layouts are drawn by pdf-lib');
  if (spec.variant === 'scan-qr' && (spec.renderer !== 'pdflib' || spec.layout || !s.bankgiro || !spec.ocr))
    fail('scan-qr is a pdf-lib block layout with a Bankgiro and an OCR reference');
  if (spec.buyer.orgnr && (!luhn(spec.buyer.orgnr) || containsPersonalNumber(spec.buyer.orgnr))) fail('buyer org.nr');
  for (const p of [s, spec.buyer]) {
    if (p.gln && !parseGln(p.gln)) fail(`${p.name}: GLN check digit`);
    const [scheme, id] = p.peppolId?.split(':') ?? [];
    if (p.peppolId && !(scheme === '0007' ? id === p.orgnr : scheme === '0088' && id === p.gln)) fail(`${p.name}: Peppol ID`);
    if ((p.gln || p.peppolId) && !spec.layout?.startsWith('peppol')) fail('GLN and Peppol IDs are printed by the Peppol viewer layout');
  }
  if (spec.invoiceNote && !spec.layout?.startsWith('peppol')) fail('invoice notes are printed by the Peppol viewer layout');
  if (spec.paymentTerms && !spec.layout) fail('payment terms are printed by the fixed layouts');
  if (spec.exemptReason !== undefined && spec.lines.some((l) => l.rate !== 0)) fail('exempt invoices have rate 0 lines only');
}
