/**
 * Applies the rule layers after the generic rules: the generator profile selected by Producer/Creator and layout
 * fingerprint, then the issuer template selected by the issuer's identifiers or keywords. A field a layer reads
 * replaces the earlier value and the earlier problems for that field; a field it cannot read gets a problem and no
 * value (never the earlier value). Pure: works on the layout model and the generic result.
 */
import type { PdfRegion, SourceWarning } from '../../canonical.js';
import { below, type Cell, cellRows, regionOf, rightOf } from '../generic/cells.js';
import { type FieldKey, parseField } from '../generic/fields.js';
import { type Column, findItemTables, merge } from '../generic/items.js';
import type { GenericRead, ReadValue } from '../generic.js';
import { itemValues } from '../generic.js';
import type { LayoutDocument } from '../layout.js';
import { normalize } from '../se/index.js';
import { FIELD_TYPES, PDFJS_VERSION } from './load.js';
import type { PdfFieldRule, PdfRuleField, PdfRuleLayout, PdfRuleSet, PdfTableRule } from './types.js';

type Read = { value: string; region: PdfRegion; problem?: SourceWarning } | { problem: SourceWarning } | { absent: true };

const label = (text: string) => normalize(text).replace(/\s*:$/u, '');
const clean = (s: string) => s.normalize('NFC').replace(/\s+/gu, ' ').trim();
const compact = (s: string) => s.toUpperCase().replace(/[^0-9A-Z]/gu, '');

/** Refines `read` with the matching generator profile, then the matching issuer template. */
export function applyRules(
  layout: LayoutDocument,
  read: GenericRead,
  profiles: readonly PdfRuleSet[],
  templates: readonly PdfRuleSet[],
): GenericRead {
  if (read.notAnInvoice || (!profiles.length && !templates.length)) return read;
  const rows = cellRows({ ...layout, pages: layout.pages.slice(0, read.pages ?? layout.pages.length) });
  const text = rows.map((r) => normalize(r.map((c) => c.text).join(' '))).join('\n');
  const upper = rows.map((r) => r.map((c) => clean(c.text).toUpperCase()).join('  ')).join('\n');
  const out: GenericRead = { ...read, values: { ...read.values }, problems: [...read.problems], defaults: { ...read.defaults } };

  const seller = (pointer: string) => out.values[pointer]?.value;
  const printed = (id: string) => {
    const chars = [...compact(id)];
    return chars.length > 0 && new RegExp(`(?<![0-9A-Z])${chars.join('[ -]?')}(?![0-9A-Z])`, 'u').test(upper);
  };
  const selected = (set: PdfRuleSet) => {
    const m = set.match;
    if (set.kind === 'generator-profile') {
      const has = (meta: string | undefined, texts: string[] | undefined) =>
        !!meta && !!texts?.some((t) => meta.toLowerCase().includes(t.toLowerCase()));
      return has(layout.producer, m.producer) || has(layout.creator, m.creator);
    }
    // The seller the generic rules read, if any, must be the template's issuer
    const vat = seller('/seller/vatId');
    const org = seller('/seller/legalRegistrationId/value');
    if (vat && m.sellerVatId && !m.sellerVatId.some((v) => compact(v) === compact(vat))) return false;
    if (org && m.orgNumber && !m.orgNumber.some((v) => compact(v) === compact(org))) return false;
    const ids = [m.sellerVatId, m.orgNumber, m.bankgiro, m.plusgiro, m.iban].flatMap((l) => l ?? []);
    return ids.some(printed) || (!!m.keywords && m.keywords.every((k) => text.includes(normalize(k))));
  };

  for (const layer of [profiles, templates]) {
    const sets = layer.filter(selected);
    if (sets.length > 1) {
      out.problems.push({
        code: 'ambiguous-rules',
        message: `Several rule sets match: ${sets.map((s) => s.id).join(', ')}; none is applied`,
      });
      continue;
    }
    const [set] = sets;
    if (!set) continue;
    if (set.pdfjsVersion !== PDFJS_VERSION) {
      out.problems.push({
        code: 'rules-version',
        message: `Rule set ${set.id} was written for pdfjs-dist ${set.pdfjsVersion}, this library uses ${PDFJS_VERSION}; it is not applied`,
      });
      continue;
    }
    const layouts = set.layouts.filter((l) => (l.fingerprint ?? []).every((f) => text.includes(normalize(f))));
    if (layouts.length > 1) {
      out.problems.push({
        code: 'ambiguous-rules',
        message: `Several layouts of rule set ${set.id} match: ${layouts.map((l) => l.name).join(', ')}; none is applied`,
      });
      continue;
    }
    if (layouts.length === 1) applyLayout(`${set.id} v${set.version} (${layouts[0].name})`, layouts[0], rows, out);
  }
  return out;
}

function applyLayout(tag: string, rule: PdfRuleLayout, rows: Cell[][], out: GenericRead) {
  for (const [field, fr] of Object.entries(rule.fields ?? {}) as [PdfRuleField, PdfFieldRule][]) {
    const r = readField(fr, FIELD_TYPES[field], rows, field);
    if ('absent' in r) continue;
    const owned = (p: SourceWarning) => p.field === field || p.field?.startsWith(`${field}/`);
    out.problems = out.problems.filter((p) => !owned(p));
    if ('value' in r) setField(out.values, field, { value: r.value, region: r.region });
    else setField(out.values, field, undefined);
    if (r.problem) out.problems.push({ ...r.problem, message: `${tag}: ${r.problem.message}` });
  }
  if (rule.lines) readLines(tag, rule.lines, rows, out);
  for (const [key, pointer] of [
    ['currency', '/currency'],
    ['paymentMeansCode', '/payments/0/meansCode'],
  ] as const) {
    const value = rule.defaults?.[key];
    if (value) out.defaults![pointer] = { value, rule: `Default of rule set ${tag}` };
  }
}

/** Reads one field; `absent` when an optional label is not printed. */
function readField(rule: PdfFieldRule, type: string, rows: Cell[][], field: string): Read {
  const problem = (code: string, message: string, region?: PdfRegion): Read => ({
    problem: { code, field, message, ...(region ? { region } : {}) },
  });
  const all = rows.flat();
  const inside = (cells: Cell[], page: number, r: { x: number; y: number; width: number; height: number }) =>
    cells.filter((c) => {
      const cx = c.x + c.width / 2;
      const cy = c.y + c.height / 2;
      return c.page === page && cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height;
    });
  const found: { raw: string; region: PdfRegion }[] = [];
  const join = (cells: Cell[]) =>
    cells.length && found.push({ raw: cells.map((c) => c.text).join(' '), region: cells.length === 1 ? regionOf(cells[0]) : merge(cells) });

  if (rule.label === undefined) {
    const page = rule.page ?? 1;
    join(inside(all, page, rule.region!));
    if (!found.length) return problem('rule-no-match', `Nothing is printed in the region given for ${field} on page ${page}`);
  } else {
    const want = normalize(rule.label);
    const anchors = all.filter((c) =>
      rule.value === 'inline' ? new RegExp(`^${escapeRe(want)}\\s*:?\\s+\\S`, 'u').test(normalize(c.text)) : label(c.text) === want,
    );
    if (!anchors.length) return rule.optional ? { absent: true } : problem('rule-no-match', `Label "${rule.label}" is not printed`);
    for (const a of anchors) {
      if (rule.region) {
        const r = rule.region;
        join(inside(all, a.page, { ...r, x: a.x + r.x, y: a.y + r.y }).filter((c) => c !== a));
      } else if (rule.value === 'inline') {
        const t = clean(a.text);
        const rest = t.slice(want.length).replace(/^\s*:?\s*/u, '');
        found.push({ raw: rest, region: regionOf(a) });
      } else {
        const v = rule.value === 'below' ? below(rows, a) : rightOf(rows, a);
        if (v) join([v]);
      }
    }
    if (!found.length) return problem('rule-no-match', `No value is printed at label "${rule.label}"`, regionOf(anchors[0]));
  }

  const parsed = found.map((f) => ({ ...f, p: parse(type, f.raw) }));
  const ok = parsed.filter((f) => f.p);
  if (!ok.length) return problem('rule-no-match', `The text printed for ${field} is not a value of its type`, found[0].region);
  if (ok.some((f) => f.p && 'personal' in f.p))
    return problem('personal-number', `The ${field} is a personal identity number; it is not kept`, ok[0].region);
  const values = new Set(ok.map((f) => (f.p as { value: string }).value));
  if (values.size > 1) return problem('ambiguous', `Different values printed for ${field}: ${[...values].join(', ')}`, ok[0].region);
  const first = ok[0].p as { value: string; checkFailed?: true };
  return {
    value: first.value,
    region: ok[0].region,
    ...(first.checkFailed
      ? {
          problem: {
            code: 'identifier-check',
            field,
            message: `The ${field} fails its check digits; kept as printed`,
            region: ok[0].region,
          },
        }
      : {}),
  };
}

function parse(type: string, raw: string): ReturnType<typeof parseField> {
  const s = clean(raw);
  if (type === 'text') return s ? { value: s } : undefined;
  if (type === 'postalCode') {
    const m = /^(?:SE-?)?(\d{3}) ?(\d{2})$/u.exec(s);
    return m ? { value: `${m[1]} ${m[2]}` } : undefined;
  }
  return parseField((type === 'amount' ? 'payable' : type) as FieldKey, s);
}

/** Item lines from a table with the given header; they replace the lines of earlier layers. */
function readLines(tag: string, rule: PdfTableRule, rows: Cell[][], out: GenericRead) {
  const columns = new Map(Object.entries(rule.columns).map(([k, v]) => [normalize(k), v as Column]));
  const tables = findItemTables(rows, (row) => {
    const cols = row.map((c) => columns.get(label(c.text)));
    return cols.every((c) => c !== undefined) && cols.includes('desc') && cols.includes('amount') ? cols : undefined;
  });
  if (!tables.length && rule.optional) return;
  for (const k of Object.keys(out.values)) if (k.startsWith('/lines/')) delete out.values[k];
  out.problems = out.problems.filter((p) => p.field !== '/lines' && !p.field?.startsWith('/lines/'));
  const items = tables.flatMap((t) => t.items);
  out.lineCount = items.length;
  if (items.length) itemValues(items, out.values, out.problems);
  else
    out.problems.push({
      code: 'rule-no-match',
      field: '/lines',
      message: `${tag}: ${tables.length ? 'the item table has no lines with an amount' : 'the item table header is not printed'}`,
      ...(tables.length ? { region: regionOf(tables[0].header[0]) } : {}),
    });
}

const ACCOUNTS = ['bankgiro', 'plusgiro', 'iban'] as const;

/** Sets or removes a field, keeping the values that depend on it consistent. */
function setField(values: Record<string, ReadValue>, field: PdfRuleField, v: ReadValue | undefined) {
  const m = /^\/payments\/0\/(bankgiro|plusgiro|iban|bic)$/u.exec(field);
  if (!m) {
    if (v) values[field] = v;
    else delete values[field];
    if (field === '/seller/legalRegistrationId/value') {
      if (v) values['/seller/legalRegistrationId/schemeId'] = { value: '0007', region: v.region };
      else delete values['/seller/legalRegistrationId/schemeId'];
    }
    return;
  }
  // Payment accounts: read back as bankgiro, plusgiro, IBAN and BIC, changed, and written again in that order
  const acc: Partial<Record<(typeof ACCOUNTS)[number] | 'bic', ReadValue>> = {};
  for (let k = 0; values[`/payments/0/creditTransfers/${k}/accountId`]; k++) {
    const p = `/payments/0/creditTransfers/${k}`;
    const sp = values[`${p}/serviceProviderId`];
    const kind = sp?.value === 'SE:BANKGIRO' ? 'bankgiro' : sp?.value === 'SE:PLUSGIRO' ? 'plusgiro' : 'iban';
    acc[kind] = values[`${p}/accountId`];
    if (kind === 'iban' && sp) acc.bic = sp;
    delete values[`${p}/accountId`];
    delete values[`${p}/serviceProviderId`];
  }
  const key = m[1] as keyof typeof acc;
  if (v) acc[key] = v;
  else delete acc[key];
  let k = 0;
  for (const kind of ACCOUNTS) {
    const a = acc[kind];
    if (!a) continue;
    const p = `/payments/0/creditTransfers/${k++}`;
    values[`${p}/accountId`] = a;
    const sp = kind === 'iban' ? acc.bic : { value: kind === 'bankgiro' ? 'SE:BANKGIRO' : 'SE:PLUSGIRO', region: a.region };
    if (sp) values[`${p}/serviceProviderId`] = sp;
  }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
