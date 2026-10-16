import { expect } from 'bun:test';
import type { CanonicalInvoice } from '../src/index.js';

/** Adds every optional part the renderers know about to a parsed invoice. */
export function enrich(inv: CanonicalInvoice): CanonicalInvoice {
  const copy = structuredClone(inv) as unknown as Record<string, unknown>;
  const lines = copy.lines as Record<string, unknown>[];
  Object.assign(lines[0]!, {
    allowances: [{ amount: '1.00', reason: 'Line discount' }],
    charges: [{ amount: '2.00', reason: 'Line surcharge' }],
    item: {
      name: 'Shelf',
      description: 'Oak, 40 cm',
      sellerId: 'S-1',
      classifications: [],
      attributes: [{ name: 'Colour', value: 'Oak' }],
    },
    period: { start: '2026-09-01' },
    unitText: 'pieces',
  });
  Object.assign(copy, {
    issueTime: '10:30:00',
    payee: { name: 'Payee Ltd', identifier: { value: 'P-1', schemeId: '0088' }, legalRegistrationId: { value: 'R-1' } },
    taxRepresentative: { name: 'Rep AB', vatId: 'SE111', address: { city: 'Malmö', line1: 'Gatan 1' } },
    allowances: [{ amount: '5.00', reason: 'Early payment', reasonCode: '95', percentage: '2', vat: { categoryCode: 'S', rate: '25' } }],
    charges: [{ amount: '3.00', vat: { categoryCode: 'E' } }],
    vatBreakdown: [
      { taxableAmount: '10.00', taxAmount: '0.00', categoryCode: 'E', exemptionReason: 'Exempt', exemptionReasonCode: 'VATEX-EU-132' },
      { taxableAmount: '10.00', taxAmount: '2.50', categoryCode: 'S' },
    ],
    payments: [
      {
        meansCode: '30',
        creditTransfers: [{ accountId: 'SE45 5000' }],
        card: { primaryAccountNumber: '1234', holderName: 'A. Holder', network: 'VISA' },
        directDebit: { mandateId: 'M-1', creditorId: 'C-1', debitedAccountId: 'D-1' },
      },
    ],
    paymentSchedule: [{ dueDate: '2026-12-01', amount: '10.00', description: 'First half' }],
    attachments: [
      { kind: 'embedded', id: '1', description: 'Time sheet', mimeCode: 'text/plain', filename: 'timesheet.txt', base64: 'AAAA' },
      { kind: 'external', id: '2', description: 'Specification', uri: 'https://example.com/spec.pdf' },
      { kind: 'reference', id: '3', typeCode: 'ZZZ' },
    ],
  });
  return copy as unknown as CanonicalInvoice;
}

export const PAYLOAD = `<script>alert(1)</script>"><img src=x onerror=alert(1)>' onmouseover='alert(1)\` autofocus onfocus=alert(1) <!-- --> &amp; &#x3C;`;

/** Every string in the invoice becomes a hostile string that names the field it sits in. */
export function poison(value: unknown, path: string): unknown {
  if (typeof value === 'string') return `${PAYLOAD}[${path}]`;
  if (Array.isArray(value)) return value.map((v, i) => poison(v, `${path}.${i}`));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === 'kind' ? v : poison(v, `${path}.${k}`)]));
  }
  return value;
}

const ALLOWED_TAGS = new Set([
  'html',
  'head',
  'meta',
  'title',
  'body',
  'main',
  'style',
  'article',
  'header',
  'address',
  'h1',
  'h2',
  'h3',
  'p',
  'div',
  'span',
  'time',
  'section',
  'dl',
  'dt',
  'dd',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'ul',
  'li',
  'br',
]);
const ALLOWED_ATTRS = new Set([
  'lang',
  'id',
  'class',
  'scope',
  'charset',
  'name',
  'content',
  'http-equiv',
  'aria-labelledby',
  'title',
  'dateTime',
]);

/** Fails unless every tag and attribute in `html` is one the renderers write themselves, with a quoted value. */
export function expectOnlyOwnMarkup(html: string): void {
  for (const m of html.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g)) {
    expect(ALLOWED_TAGS.has(m[1]!.toLowerCase())).toBe(true);
    // Every attribute is one of ours with a value quoted in "; nothing else is left (escaped text inside a
    // value, such as a hostile title, is not an attribute). `<br/>` closes itself.
    const rest = m[2]!.replace(/\s([a-zA-Z-]+)="[^"]*"/g, (_, name: string) => {
      expect(ALLOWED_ATTRS.has(name)).toBe(true);
      return '';
    });
    expect(rest.replace(/\/$/, '').trim()).toBe('');
  }
}
