/**
 * Fixed-position layouts for pdf-lib cases: the Swedish rendering of a Peppol BIS Billing 3 invoice by an e-invoice
 * viewer, and an issuer's own layout with footer boxes and footer columns. Positions are in points from the top-left
 * corner; the renderer draws every text at its place, right-aligned where marked. Fictitious data only.
 */
import type { CaseSpec } from './model.js';

export type Layout = 'peppol-viewer' | 'issuer' | 'peppol-and-issuer';

export interface Placed {
  page: number;
  x: number;
  y: number;
  text: string;
  size?: number;
  bold?: boolean;
  right?: boolean;
}

/** The amounts of a case, in öre, as model.ts computes them. */
export interface Figures {
  nets: number[];
  vatRows: { rate: number; taxable: number; tax: number }[];
  lineNet: number;
  taxExcl: number;
  vatTotal: number;
  taxIncl: number;
  rounding: number;
  payable: number;
}

const group = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
/** Peppol viewer amounts: space thousands, dot decimal, no zero before the point ("1 870.00", ".50"). */
const dot = (o: number) => {
  const a = Math.abs(o);
  const kr = Math.floor(a / 100);
  return `${o < 0 ? '-' : ''}${kr ? group(kr) : ''}.${String(a % 100).padStart(2, '0')}`;
};
/** Issuer amounts: space thousands, comma decimal. */
const comma = (o: number) => {
  const a = Math.abs(o);
  return `${o < 0 ? '-' : ''}${group(Math.floor(a / 100))},${String(a % 100).padStart(2, '0')}`;
};
const ore = (s: string) => Math.round(Number(s) * 100);
const postal = (line: string) => line.replace(/^(\d{3}) (\d{2})/, '$1$2');
const vatId = (org: string) => `SE${org}01`;

export function placeLayout(spec: CaseSpec, f: Figures, layout: Layout): Placed[] {
  if (layout === 'peppol-viewer') return peppol(spec, f, 1);
  if (layout === 'issuer') return issuer(spec, f, 1);
  return [...peppol(spec, f, 1), ...issuer(spec, f, 2)];
}

function peppol(spec: CaseSpec, f: Figures, page: number): Placed[] {
  const out: Placed[] = [];
  const t = (x: number, y: number, text: string, o: Partial<Placed> = {}) => out.push({ page, x, y, text, ...o });
  const s = spec.seller;
  const b = spec.buyer;
  t(16, 19, 'Faktura', { size: 14, bold: true });
  t(299, 19, 'Fakturadatum');
  t(439, 19, 'Fakturanummer');
  t(299, 30, spec.issueDate);
  t(439, 30, spec.number);
  t(299, 40, 'Sista betaldatum');
  t(439, 40, 'Orderreferens');
  t(16, 47, s.name, { size: 11, bold: true });
  t(299, 49, spec.dueDate);
  t(439, 57, 'Beställarreferens');
  if (spec.buyerReference) t(439, 67, spec.buyerReference);
  t(439, 77, 'Belopp att betala');
  t(439, 86, `${dot(f.payable)} SEK`);

  // Party block: name, an "Adress" sub-heading, street lines, postal line without the space, country, identifiers
  const party = (y: number, heading: string, p: CaseSpec['buyer'], extra: string[]) => {
    t(16, y, heading, { bold: true });
    const lines = [p.name, 'Adress', ...p.address.slice(0, -1), postal(p.address[p.address.length - 1]), 'SE'];
    if (p.orgnr) lines.push(`ID: ${p.orgnr} [0007]`);
    if (p.gln) lines.push(`ID: ${p.gln} [0088]`);
    if (p.orgnr) lines.push(`Organisationsnummer: ${p.orgnr} [0007]`);
    lines.push(...extra);
    lines.forEach((l, i) => {
      t(16, y + 9 * (i + 1), l);
    });
    return y + 9 * (lines.length + 1);
  };
  t(157, 112, 'KÖPARENS KONTAKT', { bold: true });
  if (spec.buyerReference) t(157, 121, spec.buyerReference);
  t(157, 130, 'Telefon: 0100000000');
  let y = party(112, 'KÖPAREN', b, [`Köparens namn: ${b.name}`, ...(b.orgnr ? [vatId(b.orgnr)] : [])]);

  // Item table: a two-line header; each line, its quantity code and an optional note under it
  y += 12;
  for (const [x, a, c] of [
    [17, 'artikelnr', ''],
    [76, 'Benämning', ''],
    [283, 'Fakturerad', 'kvantitet'],
    [342, 'Ápris', ''],
    [401, 'Momskategori', ''],
    [460, 'Avgifter', 'Rabatter'],
  ] as const) {
    t(x, y, a);
    if (c) t(x, y + 10, c);
  }
  t(578, y, 'Radbelopp', { right: true });
  y += 21;
  spec.lines.forEach((l, i) => {
    t(17, y, `A${i + 1}`);
    t(76, y, l.name);
    t(283, y, `${Number(l.qty).toFixed(2)} ${l.unitCode ?? l.unit}`);
    t(342, y, `${dot(ore(l.price))} SEK`);
    t(401, y, `S, ${l.rate}.00%`);
    t(578, y, dot(f.nets[i]), { right: true });
    y += 9;
    t(283, y, '(Kvantitetskod: styck)');
    y += 8;
    for (const [k, n] of (l.note ?? []).entries()) {
      t(76, y, k === 0 ? `Anteckning: ${n}` : n);
      y += 8;
    }
    y += 5;
  });
  const total = (label: string, value: string) => {
    t(16, y, label);
    t(579, y, value, { right: true });
    y += 12;
  };
  y += 8;
  total('Summa radbelopp:', `${dot(f.lineNet)} SEK`);
  total('Summa rabatter (huvudnivå):', `${dot(0)} SEK`);
  total('Summa avgifter (huvudnivå):', `${dot(0)} SEK`);
  t(16, y, 'SKATTESAMMANRÄKNING', { bold: true });
  y += 18;
  t(17, y, 'Momskategori', { bold: true });
  t(158, y, 'Undantagsorsak', { bold: true });
  t(298, y, 'Skattepliktigt belopp', { bold: true });
  t(578, y, 'Skattebelopp', { bold: true, right: true });
  for (const r of f.vatRows) {
    y += 10;
    t(17, y, `VAT : S (Standard), ${r.rate}.00%`);
    t(298, y, dot(r.taxable));
    t(578, y, dot(r.tax), { right: true });
  }
  y += 14;
  total('Totalt momsbelopp:', `${dot(f.vatTotal)} SEK`);
  total('Totalbelopp exkl moms:', dot(f.taxExcl));
  total('Totalbelopp inkl moms:', dot(f.taxIncl));
  if (spec.rounding) total('Beloppsutjämning:', dot(f.rounding));
  total('Belopp att betala:', `${dot(f.payable)} SEK`);
  y += 6;
  t(16, y, 'Betalningsvillkor:');
  t(16, y + 11, '30 dgr netto');
  y += 25;

  t(16, y, 'BETALINSTRUKTION', { bold: true });
  y += 11;
  t(17, y, 'Betalsätt kod', { bold: true });
  t(154, y, 'Betalsystem eller BIC', { bold: true });
  t(259, y, 'Kontonr', { bold: true });
  t(410, y, 'Kontonamn', { bold: true });
  t(578, y, 'Referens vid betalning', { bold: true, right: true });
  const accounts: [string, string][] = [];
  if (s.bankgiro) accounts.push(['SE:BANKGIRO', s.bankgiro]);
  if (s.iban && s.bic) accounts.push([s.bic, s.iban]);
  for (const [system, account] of accounts) {
    y += 11;
    t(17, y, '30 (Kontobaserad betalning)');
    t(154, y, system);
    t(259, y, account);
    if (spec.ocr) t(578, y, spec.ocr, { right: true });
  }
  y += 18;

  t(204, y, 'SÄLJARENS KONTAKT', { bold: true });
  t(204, y + 9, 'Kontakt: Testsson, Test');
  t(204, y + 18, 'Telefon: 0100000001');
  y = party(y, 'SÄLJAREN', s, [
    s.name,
    `ID för säljarens skatteregistrering: ${vatId(s.orgnr)} [VAT]`,
    ...(s.fskatt ? ['ID för säljarens skatteregistrering: Godkänd för F-skatt [TAX]'] : []),
  ]);
  // Electronic addresses, under the seller's block
  for (const [label, id] of [
    ['Säljarens PEPPOL-ID', s.peppolId],
    ['Köparens PEPPOL-ID', b.peppolId],
  ] as const) {
    if (!id) continue;
    const [scheme, value] = id.split(':');
    t(16, y, `${label}: ${value} [${scheme}]`);
    y += 9;
  }
  return out;
}

function issuer(spec: CaseSpec, f: Figures, page: number): Placed[] {
  const out: Placed[] = [];
  const t = (x: number, y: number, text: string, o: Partial<Placed> = {}) => out.push({ page, x, y, text, ...o });
  const s = spec.seller;
  const b = spec.buyer;
  const [street, post] = [s.address.slice(0, -1), s.address[s.address.length - 1]];
  t(268, 6, 'FAKTURA', { size: 14, bold: true });
  t(549, 6, 'Sida 1');
  // Letterhead without the name (a logo would stand there)
  t(67, 40, street[0]);
  t(67, 51, post);
  t(268, 40, 'Fakturanr');
  t(376, 40, 'Datum');
  t(481, 40, 'Kundnr');
  t(268, 51, spec.number);
  t(376, 51, spec.issueDate);
  t(481, 51, spec.customer);

  // Buyer references at the left, the address window at the right, on interleaved lines
  const refs: [string, string | undefined][] = [
    ['Er referens:', spec.buyerReference],
    ['Ert beställningsnr:', spec.orderReference],
    ['Ert org.nr:', b.orgnr && `${b.orgnr.slice(0, 6)}-${b.orgnr.slice(6)}`],
    ['Ert momsregnr:', b.orgnr && vatId(b.orgnr)],
    ['Vår referens:', 'Testsson, Test'],
  ];
  refs.forEach(([k, v], i) => {
    t(52, 91 + 12.5 * i, k);
    if (v) t(142, 91 + 12.5 * i, v);
  });
  [b.name, ...b.address].forEach((l, i) => {
    t(342, 98 + 11 * i, l);
  });
  t(342, 194, 'Betalningsvillkor:');
  t(431, 194, '30 dgr netto');

  t(52, 212, 'Fakturan avser', { bold: true });
  t(271, 212, 'Antal', { bold: true });
  t(335, 212, 'À-pris', { bold: true });
  t(401, 212, 'Moms %', { bold: true });
  t(501, 212, 'Moms', { bold: true, right: true });
  t(569, 212, 'Belopp', { bold: true, right: true });
  t(52, 238, 'Från och med i år skickar vi fakturor i ny form.');
  let y = 261;
  spec.lines.forEach((l, i) => {
    const net = f.nets[i];
    t(52, y, l.name);
    t(268, y, `${l.qty.replace('.', ',')} ${l.unit}`);
    t(363, y, comma(ore(l.price)), { right: true });
    t(431, y, `${l.rate},00`, { right: true });
    t(501, y, comma(Math.round((net * l.rate) / 100)), { right: true });
    t(569, y, comma(net), { right: true });
    y += 15;
    for (const n of l.note ?? []) {
      t(52, y, n);
      y += 15;
    }
  });

  // Footer: VAT summary, payment line, total boxes, then columns of company details
  t(52, 639, 'Momssats', { bold: true });
  t(150, 639, 'Momsunderlag', { bold: true });
  t(253, 639, 'Momsbelopp', { bold: true });
  f.vatRows.forEach((r, i) => {
    t(52, 653 + 10 * i, `${r.rate} %`);
    t(210, 653 + 10 * i, comma(r.taxable), { right: true });
    t(304, 653 + 10 * i, comma(r.tax), { right: true });
  });
  if (spec.ocr) t(50, 676, `Vid betalning vänligen ange OCR: ${spec.ocr}`);
  t(302, 676, 'Efter förfallodagen debiteras ränta enligt räntelagen.');
  t(52, 694, 'Nettobelopp', { bold: true });
  t(175, 694, 'Moms', { bold: true });
  t(272, 694, 'Öresavr.', { bold: true });
  t(335, 694, 'Förfallodatum', { bold: true });
  t(569, 694, 'Att betala i SEK', { bold: true, right: true });
  t(52, 707, comma(f.lineNet));
  t(175, 707, comma(f.vatTotal));
  t(273, 707, comma(f.rounding));
  t(336, 707, spec.dueDate);
  t(569, 707, comma(f.payable), { right: true });
  t(52, 729, s.name, { bold: true });
  t(187, 729, 'Telefon');
  t(270, 729, 'Org. nr');
  t(358, 729, 'Bank');
  t(486, 729, 'Bankgiro');
  t(187, 740, '010-000 0000');
  t(270, 740, `${s.orgnr.slice(0, 6)}-${s.orgnr.slice(6)}`);
  t(358, 740, 'Testbanken');
  if (s.bankgiro) t(486, 740, `${s.bankgiro.slice(0, -4)}-${s.bankgiro.slice(-4)}`);
  t(52, 751, street[0]);
  t(270, 751, 'Momsreg. nr');
  t(358, 751, 'IBAN');
  t(485, 751, 'BIC');
  t(52, 760, post);
  t(270, 760, vatId(s.orgnr));
  if (s.iban) t(358, 760, s.iban);
  if (s.bic) t(486, 760, s.bic);
  if (s.fskatt) t(270, 770, 'Godkänd för F-skatt');
  t(358, 770, 'Allmänna villkor lämnas på begäran.');
  return out;
}
