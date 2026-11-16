/** Validation of rule-set JSON (generator profiles, issuer templates) against the rules of types.ts. */
import type { PdfRuleField, PdfRuleSet, PdfTableColumn } from './types.js';

/** The pdfjs-dist version this library pins; rule sets declare the version they were written against. */
export const PDFJS_VERSION = '6.5.438';

/** Parse type of each field a rule can read. */
export const FIELD_TYPES: Record<PdfRuleField, string> = {
  '/id': 'id',
  '/issueDate': 'issueDate',
  '/dueDate': 'dueDate',
  '/seller/name': 'text',
  '/seller/vatId': 'vatNumber',
  '/seller/legalRegistrationId/value': 'orgNumber',
  '/seller/taxRegistrationId': 'text',
  '/seller/address/line1': 'text',
  '/seller/address/line2': 'text',
  '/seller/address/postalCode': 'postalCode',
  '/seller/address/city': 'text',
  '/buyer/name': 'text',
  '/buyer/address/line1': 'text',
  '/buyer/address/line2': 'text',
  '/buyer/address/postalCode': 'postalCode',
  '/buyer/address/city': 'text',
  '/payments/0/remittanceInformation': 'ocr',
  '/payments/0/bankgiro': 'bankgiro',
  '/payments/0/plusgiro': 'plusgiro',
  '/payments/0/iban': 'iban',
  '/payments/0/bic': 'bic',
  '/totals/lineNetTotal': 'amount',
  '/totals/allowanceTotal': 'amount',
  '/totals/chargeTotal': 'amount',
  '/totals/taxExclusive': 'amount',
  '/totals/vatTotal': 'amount',
  '/totals/taxInclusive': 'amount',
  '/totals/prepaid': 'amount',
  '/totals/rounding': 'amount',
  '/totals/payable': 'amount',
};

const COLUMNS: PdfTableColumn[] = ['desc', 'pos', 'vat', 'artnr', 'qty', 'qtyUnit', 'unit', 'price', 'rate', 'discount', 'amount', 'date'];
const MATCH_KEYS = ['producer', 'creator', 'sellerVatId', 'orgNumber', 'bankgiro', 'plusgiro', 'iban', 'keywords'] as const;

/** A rule set that does not follow the schema; `issues` lists each problem with its JSON path. */
export class PdfRuleError extends Error {
  override name = 'PdfRuleError';
  constructor(
    readonly ruleSet: string,
    readonly issues: string[],
  ) {
    super(`Invalid PDF rule set ${ruleSet}: ${issues.join('; ')}`);
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isTexts = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every(isText);
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

/** Checks a parsed JSON rule set and returns it typed; throws {@link PdfRuleError} listing every problem. Unknown properties are errors, to catch typos. */
export function loadPdfRuleSet(json: unknown): PdfRuleSet {
  const issues: string[] = [];
  const bad = (path: string, what: string) => issues.push(`${path}: ${what}`);
  const known = (o: Obj, path: string, keys: readonly string[]) => {
    for (const k of Object.keys(o)) if (!keys.includes(k)) bad(`${path}/${k}`, 'unknown property');
  };
  const id = isObj(json) && typeof json.id === 'string' ? json.id : '(unnamed)';
  if (!isObj(json)) throw new PdfRuleError(id, ['/: must be an object']);
  known(json, '', ['$schema', 'kind', 'id', 'version', 'pdfjsVersion', 'description', 'match', 'layouts']);
  if (json.$schema !== undefined && typeof json.$schema !== 'string') bad('/$schema', 'must be a string');
  if (json.kind !== 'generator-profile' && json.kind !== 'issuer-template')
    bad('/kind', 'must be "generator-profile" or "issuer-template"');
  if (typeof json.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(json.id)) bad('/id', 'lower-case letters, digits and hyphens');
  if (!Number.isInteger(json.version) || (json.version as number) < 1) bad('/version', 'must be a positive integer');
  if (typeof json.pdfjsVersion !== 'string' || !/^\d+\.\d+\.\d+$/u.test(json.pdfjsVersion)) bad('/pdfjsVersion', 'exact version x.y.z');
  if (json.description !== undefined && typeof json.description !== 'string') bad('/description', 'must be a string');

  const m = json.match;
  if (!isObj(m)) bad('/match', 'must be an object');
  else {
    known(m, '/match', MATCH_KEYS);
    for (const k of MATCH_KEYS) if (m[k] !== undefined && !isTexts(m[k])) bad(`/match/${k}`, 'non-empty list of non-empty texts');
    const profile = m.producer !== undefined || m.creator !== undefined;
    const template = MATCH_KEYS.slice(2).some((k) => m[k] !== undefined);
    if (json.kind === 'generator-profile' && (!profile || template))
      bad('/match', 'a generator profile is selected by producer or creator only');
    if (json.kind === 'issuer-template' && (!template || profile))
      bad('/match', 'an issuer template is selected by identifiers or keywords only');
  }

  if (!Array.isArray(json.layouts) || !json.layouts.length) bad('/layouts', 'non-empty list');
  else
    json.layouts.forEach((l: unknown, i) => {
      const p = `/layouts/${i}`;
      if (!isObj(l)) {
        bad(p, 'must be an object');
        return;
      }
      known(l, p, ['name', 'fingerprint', 'fields', 'lines', 'defaults']);
      if (!isText(l.name)) bad(`${p}/name`, 'non-empty text');
      if (l.fingerprint !== undefined && !(Array.isArray(l.fingerprint) && l.fingerprint.every(isText)))
        bad(`${p}/fingerprint`, 'list of non-empty texts');
      if (l.fields !== undefined) {
        if (!isObj(l.fields)) bad(`${p}/fields`, 'must be an object');
        else
          for (const [field, rule] of Object.entries(l.fields)) {
            const fp = `${p}/fields/${field.replaceAll('~', '~0').replaceAll('/', '~1')}`;
            if (!(field in FIELD_TYPES)) bad(fp, 'not a field a rule can read');
            if (!isObj(rule)) {
              bad(fp, 'must be an object');
              continue;
            }
            known(rule, fp, ['label', 'value', 'region', 'page', 'optional']);
            if (rule.label !== undefined && !isText(rule.label)) bad(`${fp}/label`, 'non-empty text');
            if (rule.value !== undefined && !['right', 'below', 'inline'].includes(rule.value as string))
              bad(`${fp}/value`, 'right, below or inline');
            if (rule.region !== undefined) {
              const r = rule.region;
              if (!isObj(r) || !['x', 'y', 'width', 'height'].every((k) => isNum(r[k])) || Object.keys(r).length !== 4)
                bad(`${fp}/region`, 'object with numeric x, y, width, height');
              else if ((r.width as number) <= 0 || (r.height as number) <= 0) bad(`${fp}/region`, 'width and height must be positive');
            }
            if (rule.page !== undefined && !(Number.isInteger(rule.page) && (rule.page as number) >= 1))
              bad(`${fp}/page`, 'positive integer');
            if (rule.optional !== undefined && typeof rule.optional !== 'boolean') bad(`${fp}/optional`, 'boolean');
            if (rule.label === undefined && rule.region === undefined) bad(fp, 'needs a label or a region');
            if (rule.value !== undefined && (rule.label === undefined || rule.region !== undefined))
              bad(`${fp}/value`, 'only with a label and without a region');
            if (rule.page !== undefined && rule.label !== undefined) bad(`${fp}/page`, 'only for a region without a label');
            if (rule.optional !== undefined && rule.label === undefined) bad(`${fp}/optional`, 'only with a label');
          }
      }
      if (l.lines !== undefined) {
        const t = l.lines;
        if (!isObj(t) || !isObj(t.columns)) bad(`${p}/lines`, 'object with columns');
        else {
          known(t, `${p}/lines`, ['columns', 'optional']);
          const cols = Object.entries(t.columns);
          for (const [label, col] of cols)
            if (!isText(label) || !COLUMNS.includes(col as PdfTableColumn))
              bad(`${p}/lines/columns`, `"${label}": one of ${COLUMNS.join(', ')}`);
          if (!cols.some(([, c]) => c === 'desc') || !cols.some(([, c]) => c === 'amount'))
            bad(`${p}/lines/columns`, 'needs a desc and an amount column');
          if (t.optional !== undefined && typeof t.optional !== 'boolean') bad(`${p}/lines/optional`, 'boolean');
        }
      }
      if (l.defaults !== undefined) {
        const d = l.defaults;
        if (!isObj(d)) bad(`${p}/defaults`, 'must be an object');
        else {
          known(d, `${p}/defaults`, ['currency', 'paymentMeansCode']);
          if (d.currency !== undefined && !(typeof d.currency === 'string' && /^[A-Z]{3}$/u.test(d.currency)))
            bad(`${p}/defaults/currency`, 'ISO 4217 code');
          if (d.paymentMeansCode !== undefined && !(typeof d.paymentMeansCode === 'string' && /^\d{1,3}$/u.test(d.paymentMeansCode)))
            bad(`${p}/defaults/paymentMeansCode`, 'UNTDID 4461 code');
        }
      }
    });
  if (issues.length) throw new PdfRuleError(id, issues);
  return json as unknown as PdfRuleSet;
}
