/**
 * Generic extraction rules for Swedish invoices: values are taken only where a lexicon label names them (right of
 * the label on the same line, or directly under it), parsed as the field's type, and kept only when every
 * occurrence agrees. Pure: works on a layout model, so tests and later rule layers can run it without pdf.js.
 *
 * The result maps canonical JSON Pointers to the values as printed, with the region each was read from. Values the
 * rules derive rather than read (a VAT category, a giro's service provider) carry the region of the value they
 * come from. Nothing is computed here; `build.ts` reconciles and fills derived totals.
 */
import type { PdfRegion, SourceWarning } from '../canonical.js';
import { below, belowAll, type Cell, cellRows, overlapX, regionOf, rightOf } from './generic/cells.js';
import { type FieldKey, type FieldLabel, fieldLabel, inlinePair, type Parsed, parseField } from './generic/fields.js';
import { findItemTables, type Item } from './generic/items.js';
import { vatBreakdown, vatTable } from './generic/vat.js';
import type { LayoutDocument, Line } from './layout.js';
import { findLabels, isReminder, matchLabel, normalize } from './se/index.js';

export interface ReadValue {
  value: string;
  region: PdfRegion;
}

export interface GenericRead {
  /** Set when the document is not an invoice, e.g. a payment reminder. */
  notAnInvoice?: string;
  /** Canonical JSON Pointer -> value as printed (normalised) and where. */
  values: Record<string, ReadValue>;
  problems: SourceWarning[];
  /** Line amounts include VAT ("Mervärdesskatt ingår"): they are printed gross. */
  pricesIncludeVat: boolean;
  /** Number of item lines read. */
  lineCount: number;
  /** Set when only the first pages were read (a file with several invoices): the number of pages read. */
  pages?: number;
  /** Values no page prints, set by a rule layer's defaults: used only when no value was read, and recorded as derived. */
  defaults?: Record<string, { value: string; rule: string }>;
  /** Set by `buildExtraction` on a credit note printed with negative amounts, whose amounts it negated. */
  flipped?: true;
}

const POINTER: Partial<Record<FieldKey, string>> = {
  id: '/id',
  issueDate: '/issueDate',
  dueDate: '/dueDate',
  payable: '/totals/payable',
  taxInclusive: '/totals/taxInclusive',
  vatTotal: '/totals/vatTotal',
  lineNetTotal: '/totals/lineNetTotal',
  taxExclusive: '/totals/taxExclusive',
  orgNumber: '/seller/legalRegistrationId/value',
  vatNumber: '/seller/vatId',
  ocr: '/payments/0/remittanceInformation',
  rounding: '/totals/rounding',
  charge: '/totals/chargeTotal',
  allowance: '/totals/allowanceTotal',
  prepaid: '/totals/prepaid',
  buyerReference: '/buyerReference',
  orderReference: '/purchaseOrderRef',
  buyerOrgNumber: '/buyer/legalRegistrationId/value',
  buyerVatNumber: '/buyer/vatId',
};

const TITLE = /^(?:faktura\p{L}*|kreditfaktura|invoice|kvitto|orderbekräftelse|sida \d.*|\d+ ?\(\d+\))$/u;
const COMPANY_FORM = /\b(?:ab|hb|kb|aktiebolag|ek\.? ?för\.?|ekonomisk förening|kommun|region|stiftelse|förening)\.?$/u;
/** A company form anywhere in a name ("Fastighets AB Exempel"). */
const COMPANY_WORD = /(?:^|\s)(?:ab|hb|kb|aktiebolag)(?:\s|$)/u;
const POSTAL = /^(?:SE-?)?(\d{3}) ?(\d{2}) +(\p{L}[\p{L} -]*)$/u;
const PRICES_INCLUDE_VAT = /(?:mervärdesskatt|moms(?:en)?) ingår|priser(?:na)? (?:är )?inkl/u;

/**
 * Reads the invoice on the pages of `layout`. When pages carry different invoice numbers, the file holds several
 * invoices: only the first one (its pages up to the first page with another number) is read, with a problem.
 */
export function readInvoice(layout: LayoutDocument): GenericRead {
  const whole = readPages(layout);
  if (whole.notAnInvoice || layout.pages.length < 2 || !whole.problems.some((p) => p.code === 'ambiguous' && p.field === '/id'))
    return whole;
  const idValues = layout.pages.map((page) => readPages({ ...layout, pages: [page] }).values['/id']);
  const ids = idValues.map((v) => v?.value);
  const first = ids.findIndex((id) => id !== undefined);
  let end = first + 1;
  while (end < ids.length && (ids[end] === undefined || ids[end] === ids[first])) end++;
  if (first < 0 || end === ids.length) return whole;
  const read = readPages({ ...layout, pages: layout.pages.slice(0, end) });
  read.pages = end;
  // Placed at the invoice number of the next invoice
  read.problems.push({
    code: 'several-invoices',
    message: `The file holds several invoices; only the first, on pages 1-${end}, is read`,
    region: idValues[end]!.region,
  });
  return read;
}

function readPages(layout: LayoutDocument): GenericRead {
  const rows = cellRows(layout);
  const problems: SourceWarning[] = [];
  const values: Record<string, ReadValue> = {};
  const lineTexts = rows.map((r) => r.map((c) => c.text).join('\t'));
  if (lineTexts.some((t) => isReminder(t)))
    return { notAnInvoice: 'Payment reminder (påminnelse), not an invoice', values, problems, pricesIncludeVat: false, lineCount: 0 };
  const pricesIncludeVatAt = rows.flat().find((c) => PRICES_INCLUDE_VAT.test(normalize(c.text)));
  const pricesIncludeVat = pricesIncludeVatAt !== undefined;

  const tables = findItemTables(rows);
  const inTable = new Set<Line>(tables.flatMap((t) => [...t.lines]));
  const free = rows.filter((r) => !inTable.has(r[0].line));

  // Labelled values
  type Hit = { parsed: Parsed; value: Cell | { region: PdfRegion }; label: Cell; rate?: string };
  const found = new Map<FieldKey, Hit[]>();
  const add = (key: FieldKey, hit: Hit) => found.set(key, [...(found.get(key) ?? []), hit]);
  const addresses: { key: 'buyer' | 'sellerAddress'; label: Cell }[] = [];
  for (const row of free)
    for (const cell of row) {
      // "Datum" heading the column beside "Fakturanr" is the invoice date
      const label =
        fieldLabel(cell.text) ??
        (normalize(cell.text).replace(/:$/u, '') === 'datum' && row.some((c) => fieldLabel(c.text)?.keys.includes('id'))
          ? ({ keys: ['issueDate'], part: [0], parts: 1 } satisfies FieldLabel as FieldLabel)
          : undefined);
      if (!label) {
        // "Fakturanummer: 941", "Org.nr 559900-1236", also between "·" separators in a footer line
        for (const part of cell.text.split(/\s+[·•]\s+/u)) {
          const pair = inlinePair(part);
          for (const key of pair?.label.keys ?? []) {
            const parsed = key === 'buyer' || key === 'sellerAddress' ? undefined : parseField(key, pair!.value);
            if (parsed) add(key, { parsed, value: { region: regionOf(cell) }, label: cell, rate: pair!.label.rate });
          }
        }
        continue;
      }
      const lab = label;
      for (const [k, key] of lab.keys.entries()) {
        if (key === 'buyer' || key === 'sellerAddress') {
          addresses.push({ key, label: cell });
          continue;
        }
        const rate = lab.rate;
        // A "Moms" column may hold the rate ("25%") rather than the amount
        const asRate = (c: Cell) => (key === 'vatTotal' && c.text.includes('%') ? parseField('vatRate', c.text) : undefined);
        const parse = (c: Cell | undefined) => {
          if (!c || fieldLabel(c.text)) return undefined;
          const rateValue = asRate(c);
          if (rateValue) add('vatRate', { parsed: rateValue, value: c, label: cell });
          return rateValue ? undefined : parseField(key, c.text);
        };
        const r = rightOf(rows, cell);
        // Values printed side by side under a combined label ("Fakturanummer / Kundnummer") pair up by position.
        const under = belowAll(rows, cell);
        const b = under.length === 1 ? under[0] : under.length === lab.parts ? under[lab.part[k]] : undefined;
        const viaRight = parse(r);
        // Under an empty reference field stands the next heading: a reference below its label needs a digit
        const viaBelow = viaRight || (key === 'buyerReference' && !/\d/u.test(b?.text ?? '')) ? undefined : parse(b);
        if (viaRight && r) add(key, { parsed: viaRight, value: r, label: cell, rate });
        else if (viaBelow && b) add(key, { parsed: viaBelow, value: b, label: cell, rate });
      }
    }

  paymentTable(free, add);

  const regionOfValue = (v: Cell | { region: PdfRegion }) => ('region' in v ? v.region : regionOf(v));
  // Under a multi-row VAT table, a column heading such as "Moms" labels a per-rate amount, not the total
  const vt = vatTable(rows);
  if (vt.length > 1) {
    const cells = new Set(vt.flatMap((r) => [r.taxAmount, r.taxableAmount]).map((v) => v && JSON.stringify(v.region)));
    for (const key of ['vatTotal', 'taxExclusive'] as const)
      found.set(
        key,
        (found.get(key) ?? []).filter((h) => !cells.has(JSON.stringify(regionOfValue(h.value)))),
      );
  }
  for (const [key, all] of found) {
    if (key === 'vatRate' || key === 'vatBase') continue;
    const hits = key === 'vatTotal' ? all.filter((h) => !h.rate) : all;
    if (!hits.length) continue;
    if (key === 'lineNetTotal' && pricesIncludeVat) continue;
    const distinct = new Map<string, (typeof hits)[number]>();
    for (const h of hits) distinct.set('personal' in h.parsed ? '' : h.parsed.value, h);
    const pointer = key === 'bankgiro' || key === 'plusgiro' || key === 'iban' || key === 'bic' ? undefined : POINTER[key];
    const field = pointer ?? `/payments/0/${key}`;
    if (distinct.size > 1) {
      problems.push({
        code: 'ambiguous',
        field,
        message: `Different values printed for ${key}: ${[...distinct.keys()].join(', ')}`,
        region: regionOfValue(hits[0].value),
      });
      continue;
    }
    const [h] = hits;
    // A buyer identifier that is a personal identity number or fails its check digits is not kept, and is no reason to stop
    if ((key === 'buyerOrgNumber' || key === 'buyerVatNumber') && ('personal' in h.parsed || h.parsed.checkFailed)) continue;
    if ('personal' in h.parsed) {
      problems.push({
        code: 'personal-number',
        field,
        message: `The ${key} is a personal identity number; it is not kept`,
        region: regionOfValue(h.value),
      });
      continue;
    }
    const v = { value: h.parsed.value, region: regionOfValue(h.value) };
    if (h.parsed.checkFailed)
      problems.push({ code: 'identifier-check', field, message: `The ${key} fails its check digits; kept as printed`, region: v.region });
    if (pointer) values[pointer] = v;
    if (key === 'orgNumber') values['/seller/legalRegistrationId/schemeId'] = { value: '0007', region: v.region };
    if (key === 'buyerOrgNumber') values['/buyer/legalRegistrationId/schemeId'] = { value: '0007', region: v.region };
    if (key === 'prepaid') prepaidNote(h.label, rows, v.region, values, problems);
  }

  // Payment accounts, in a fixed order
  let transfer = 0;
  for (const [key, provider] of [
    ['bankgiro', 'SE:BANKGIRO'],
    ['plusgiro', 'SE:PLUSGIRO'],
    ['iban', undefined],
  ] as const) {
    const hits = found.get(key);
    const ok =
      hits?.length && new Set(hits.map((h) => ('value' in h.parsed ? h.parsed.value : ''))).size === 1 && 'value' in hits[0].parsed;
    if (!ok) continue;
    const region = regionOfValue(hits[0].value);
    values[`/payments/0/creditTransfers/${transfer}/accountId`] = { value: (hits[0].parsed as { value: string }).value, region };
    const bic = key === 'iban' ? found.get('bic') : undefined;
    const sp =
      provider ??
      (bic && new Set(bic.map((b) => ('value' in b.parsed ? b.parsed.value : ''))).size === 1
        ? (bic[0].parsed as { value: string }).value
        : undefined);
    if (sp)
      values[`/payments/0/creditTransfers/${transfer}/serviceProviderId`] = {
        value: sp,
        region: provider ? region : regionOfValue(bic![0].value),
      };
    transfer++;
  }

  // Item lines; several invoice numbers on the same pages means several invoices, whose lines are not mixed
  const several = new Set((found.get('id') ?? []).map((h) => ('value' in h.parsed ? h.parsed.value : ''))).size > 1;
  const items = several ? [] : tables.flatMap((t) => t.items);
  itemValues(items, values, problems);
  if (!items.length && tables.length)
    problems.push({
      code: 'missing',
      field: '/lines',
      message: 'The item table has no lines with an amount',
      region: regionOf(tables[0].header[0]),
    });

  // VAT breakdown
  const breakdown = vatBreakdown(rows, found, items, values, problems);
  breakdown.forEach((b, i) => {
    for (const [k, rv] of Object.entries(b)) if (rv) values[`/vatBreakdown/${i}/${k}`] = rv;
  });

  // Parties
  for (const a of addresses) if (a.key === 'buyer') readAddress('/buyer', a.label, rows, values, true);
  const sellerName = findSellerName(layout, rows, values['/buyer/name']?.value);
  if (sellerName) values['/seller/name'] = { value: sellerName.text, region: regionOf(sellerName) };
  for (const a of addresses) if (a.key === 'sellerAddress') readAddress('/seller', a.label, rows, values, false);
  // A letterhead: the seller's address printed under its name
  if (sellerName && !values['/seller/address/postalCode']) readAddress('/seller', sellerName, rows, values, false, false);
  addressWindow(layout, rows, values);
  // "Godkänd för F-skatt" alone in a cell, or between "·" separators in a footer line; failing that, as a Peppol viewer
  // prints it: "ID för säljarens skatteregistrering: Godkänd för F-skatt [TAX]"
  const isFSkatt = (text: string) => {
    const labels = findLabels(text);
    return labels.length === 1 && labels[0].label === 'fSkatt' && text.split(' ').length <= 6;
  };
  const plain = free.flat().flatMap((c) =>
    c.text
      .split(/\s+[·•]\s+/u)
      .filter(isFSkatt)
      .map((text) => ({ text, cell: c })),
  );
  const fSkatt = plain.length
    ? plain
    : free.flat().flatMap((c) => {
        const text = /:\s+([^:]+?)\s*\[TAX\]$/u.exec(c.text)?.[1];
        return text && isFSkatt(text) ? [{ text, cell: c }] : [];
      });
  if (new Set(fSkatt.map((f) => f.text)).size === 1)
    values['/seller/taxRegistrationId'] = { value: fSkatt[0].text, region: regionOf(fSkatt[0].cell) };

  // Document type and currency
  const all = rows.flat();
  if (all.some((c) => matchLabel(c.text) === 'creditNote'))
    values['/typeCode'] = { value: '381', region: regionOf(all.find((c) => matchLabel(c.text) === 'creditNote')!) };
  const currencies = new Map<string, Cell>();
  for (const c of all) {
    const n = normalize(c.text);
    if (/(?<![\p{L}])(?:kr|sek)(?![\p{L}])/u.test(n) && !currencies.has('SEK')) currencies.set('SEK', c);
    if (/(?<![\p{L}])eur(?![\p{L}])|€/u.test(n) && !currencies.has('EUR')) currencies.set('EUR', c);
  }
  if (currencies.size === 1) {
    const [[code, cell]] = [...currencies];
    values['/currency'] = { value: code, region: regionOf(cell) };
  } else if (currencies.size > 1) problems.push({ code: 'ambiguous', field: '/currency', message: 'Both SEK and EUR amounts are printed' });

  if (all.some((c) => findLabels(c.text).some((l) => l.label === 'factoring')))
    problems.push({
      code: 'factoring',
      field: '/payee/name',
      message: 'The invoice is assigned to a finance company; the payee is not read',
      region: regionOf(all.find((c) => findLabels(c.text).some((l) => l.label === 'factoring'))!),
    });
  if (pricesIncludeVatAt)
    problems.push({
      code: 'prices-include-vat',
      field: '/lines',
      message: 'Line amounts are printed including VAT',
      region: regionOf(pricesIncludeVatAt),
    });

  return { values, problems, pricesIncludeVat, lineCount: items.length };
}

/** Writes item lines as `/lines/k/...` values, with a problem where a line's description or net price is unclear. */
export function itemValues(items: Item[], values: Record<string, ReadValue>, problems: SourceWarning[]) {
  items.forEach((item, i) => {
    const p = `/lines/${i}`;
    if (item.unclearName)
      problems.push({
        code: 'ambiguous',
        field: `${p}/item/name`,
        message: `Line ${i + 1}: text under the item may be part of its description or a note`,
        region: item.unclearName,
      });
    else if (item.name) values[`${p}/item/name`] = item.name;
    if (item.quantity) values[`${p}/quantity`] = item.quantity;
    if (item.unitText) values[`${p}/unitText`] = item.unitText;
    if (item.price) values[`${p}/price/net`] = item.price;
    if (item.rate) values[`${p}/vat/rate`] = item.rate;
    values[`${p}/netAmount`] = item.amount;
    if (item.discount)
      problems.push({
        code: 'line-discount',
        field: `${p}/price/net`,
        message: `Line ${i + 1} has a discount column; its net price is not read`,
        region: item.discount.region,
      });
  });
}

/**
 * A payment instruction table as Peppol viewers print it: columns "Betalsystem eller BIC" and "Kontonr", one row per
 * account. SE:BANKGIRO and SE:PLUSGIRO rows give a giro number; a row with a BIC gives an IBAN and its BIC.
 */
function paymentTable(rows: Cell[][], add: (key: FieldKey, hit: { parsed: Parsed; value: Cell; label: Cell }) => void) {
  for (const [r, header] of rows.entries()) {
    const system = header.find((c) => normalize(c.text) === 'betalsystem eller bic');
    const account = header.find((c) => /^konto ?(?:nr|nummer)$/u.test(normalize(c.text)));
    if (!system || !account) continue;
    let prev = header[0];
    for (const row of rows.slice(r + 1)) {
      if (row[0].page !== prev.page || row[0].line.y - (prev.line.y + prev.line.height) > 1.6 * Math.max(prev.height, 8)) break;
      const under = (h: Cell) => row.filter((c) => overlapX(c, h) > 0);
      const [sys, acc] = [under(system), under(account)];
      if (sys.length !== 1 || acc.length !== 1) break;
      prev = row[0];
      const giro = { 'se:bankgiro': 'bankgiro', 'se:plusgiro': 'plusgiro' }[normalize(sys[0].text)] as FieldKey | undefined;
      const bic = giro ? undefined : parseField('bic', sys[0].text);
      const key = giro ?? (bic ? 'iban' : undefined);
      const parsed = key && parseField(key, acc[0].text);
      if (!key || !parsed) continue;
      add(key, { parsed, value: acc[0], label: account });
      if (bic) add('bic', { parsed: bic, value: sys[0], label: system });
    }
    return;
  }
}

/** ROT, RUT or grön teknik, when the page names exactly one of them. */
function prepaidNote(label: Cell, rows: Cell[][], region: PdfRegion, values: Record<string, ReadValue>, problems: SourceWarning[]) {
  const kinds = new Set<string>();
  for (const c of rows.flat()) {
    for (const l of findLabels(c.text)) if (l.label === 'rot' || l.label === 'rut') kinds.add(l.label.toUpperCase());
    if (/grön teknik/u.test(normalize(c.text))) kinds.add('GRON_TEKNIK');
  }
  if (kinds.size === 1) values['/notes/0/text'] = { value: [...kinds][0], region: regionOf(label) };
  else
    problems.push({
      code: 'missing',
      field: '/notes/0/text',
      message: 'The tax deduction is not named as ROT, RUT or grön teknik',
      region,
    });
}

/**
 * The issuer's name: the largest text at the top of the first page when it is a company name; otherwise the one company
 * name at the top that is printed again on the line with the organisation or VAT number (a letterhead in body text).
 */
function findSellerName(layout: LayoutDocument, rows: Cell[][], buyerName: string | undefined): Cell | undefined {
  const first = layout.pages[0];
  if (!first) return undefined;
  const top = rows
    .flat()
    .filter(
      (c) =>
        c.page === first.number &&
        c.y < first.height * 0.2 &&
        /\p{L}{2}/u.test(c.text) &&
        !TITLE.test(normalize(c.text)) &&
        !fieldLabel(c.text),
    );
  const size = Math.max(...top.map((c) => c.fontSize));
  const biggest = top.filter((c) => c.fontSize === size);
  if (biggest.length && new Set(biggest.map((c) => c.text)).size === 1 && COMPANY_FORM.test(normalize(biggest[0].text))) return biggest[0];
  // The name must also stand on the line that carries the seller's organisation or VAT number
  const identity = rows.filter((r) => findLabels(r[0].line.text).some((l) => l.label === 'orgNumber' || l.label === 'vatNumber'));
  const named = top.filter(
    (c) =>
      c.text !== buyerName &&
      COMPANY_FORM.test(normalize(c.text)) &&
      identity.some((r) => r[0].line !== c.line && r[0].line.text.includes(c.text)),
  );
  if (named.length) return new Set(named.map((c) => c.text)).size === 1 ? named[0] : undefined;
  // A footer: the one company name on a line whose columns are headed "Org.nr" or "Momsreg.nr" (the name heads its own column)
  const footer = rows
    .filter((r) => r.some((c) => fieldLabel(c.text)?.keys.some((k) => k === 'orgNumber' || k === 'vatNumber')))
    .flatMap((r) => r.filter((c) => c.text !== buyerName && !fieldLabel(c.text) && COMPANY_FORM.test(normalize(c.text))));
  return new Set(footer.map((c) => c.text)).size === 1 ? footer[0] : undefined;
}

/**
 * The buyer's block in an address window when no label names it: the one stack of left-aligned lines in the upper part
 * of the first page that starts with a company name and ends in a postal line, and is not the seller's.
 */
function addressWindow(layout: LayoutDocument, rows: Cell[][], values: Record<string, ReadValue>) {
  const first = layout.pages[0];
  if (!first || values['/buyer/name'] || values['/buyer/address/postalCode']) return;
  const blocks = rows
    .flat()
    .filter((c) => c.page === first.number && c.y < first.height * 0.35 && COMPANY_WORD.test(normalize(c.text)) && !fieldLabel(c.text))
    .flatMap((start) => {
      const block = [start];
      for (let at = below(rows, start); at && block.length < 5; at = below(rows, at)) {
        if (Math.abs(at.x - start.x) > 2 || fieldLabel(at.text)) return [];
        block.push(at);
        if (POSTAL.test(at.text)) return [block];
      }
      return [];
    })
    .filter((b, _, all) => b[0].text !== values['/seller/name']?.value && !all.some((o) => o.indexOf(b[0]) > 0));
  // The name, one or two street lines and the postal line
  if (blocks.length !== 1 || blocks[0].length < 3 || blocks[0].length > 4) return;
  const [name, ...rest] = blocks[0];
  const postal = POSTAL.exec(rest.pop()!.text)!;
  const last = blocks[0][blocks[0].length - 1];
  values['/buyer/name'] = { value: name.text, region: regionOf(name) };
  rest.forEach((c, i) => {
    values[`/buyer/address/line${i + 1}`] = { value: c.text, region: regionOf(c) };
  });
  values['/buyer/address/postalCode'] = { value: `${postal[1]} ${postal[2]}`, region: regionOf(last) };
  values['/buyer/address/city'] = { value: postal[3], region: regionOf(last) };
}

/** An address block under a label: name (buyer only), street lines, then "NNN NN City". */
function readAddress(
  party: '/buyer' | '/seller',
  label: Cell,
  rows: Cell[][],
  values: Record<string, ReadValue>,
  withName: boolean,
  besideLabel = true,
) {
  const block: Cell[] = [];
  let at: Cell = label;
  const beside = besideLabel ? rightOf(rows, label) : undefined;
  if (beside && !fieldLabel(beside.text)) {
    block.push(beside);
    at = beside;
  }
  for (let n = 0; n < 6 && !POSTAL.test(at.text); n++) {
    const next = below(rows, at);
    if (!next || fieldLabel(next.text)) break;
    block.push(next);
    at = next;
    if (POSTAL.test(next.text)) break;
  }
  const postal = block.length && POSTAL.exec(block[block.length - 1].text);
  if (withName && block.length && !POSTAL.test(block[0].text)) {
    if (values[`${party}/name`] === undefined) values[`${party}/name`] = { value: block[0].text, region: regionOf(block[0]) };
  }
  if (!postal) return;
  const sellerName = values['/seller/name']?.value;
  const streets = block.slice(withName ? 1 : 0, -1).filter((c) => c.text !== sellerName);
  if (streets.length > 2) return;
  const p = `${party}/address`;
  streets.forEach((c, i) => {
    values[`${p}/line${i + 1}`] = { value: c.text, region: regionOf(c) };
  });
  const last = block[block.length - 1];
  values[`${p}/postalCode`] = { value: `${postal[1]} ${postal[2]}`, region: regionOf(last) };
  values[`${p}/city`] = { value: postal[3], region: regionOf(last) };
}
