/** Pinned XSLT1.0 compatibility: make format-number's implicit node-to-number conversion explicit for Saxon-JS. */
import { createHash } from 'node:crypto';

const COMMON = {
  'cbc:TaxExclusiveAmount': 1,
  'cbc:TaxInclusiveAmount': 1,
  'cbc:AllowanceTotalAmount': 1,
  'cbc:ChargeTotalAmount': 1,
  'cbc:PayableRoundingAmount': 1,
};
const SOURCES: Record<string, { calls: number; nodes: Record<string, number> }> = {
  '858ec42d3d68bcaab173aaa0aae0d46bba1ff6ce1774002961d391324a611b10': {
    calls: 18,
    nodes: { ...COMMON, 'cbc:PrepaidAmount': 1, 'cbc:PayableAmount': 2, '../cac:PaymentTerms[1]/cbc:Amount': 1 },
  },
  '9f10414ac955f7da6bbfda86364a2e08aa7bc9c681a8bfb71d8ad83265853674': {
    calls: 12,
    nodes: { ...COMMON, 'cbc:PayableAmount': 1 },
  },
};

export function oioubl202CompatibleSource(bytes: Uint8Array): Uint8Array {
  const hash = createHash('sha256').update(bytes).digest('hex');
  const expected = SOURCES[hash];
  if (!expected) throw new Error('Unqualified OIOUBL2.02 compatibility source');
  const original = new TextDecoder('utf-16le', { fatal: true }).decode(bytes);
  const seen: Record<string, number> = {};
  let calls = 0;
  const compatible = original.replace(/\b(?:test|select)="([^"]*)"/g, (attribute) =>
    attribute.replace(/format-number\(([^,]*),/g, (call: string, first: string) => {
      calls++;
      if (!Object.hasOwn(expected.nodes, first)) return call;
      seen[first] = (seen[first] ?? 0) + 1;
      return `format-number(number(${first}),`;
    }),
  );
  if (calls !== expected.calls || Object.keys(expected.nodes).some((node) => seen[node] !== expected.nodes[node]))
    throw new Error('Unexpected OIOUBL2.02 format-number call inventory');
  if ((compatible.match(/encoding="UTF-16"/g) ?? []).length !== 1) throw new Error('Unexpected OIOUBL2.02 source encoding');
  return new TextEncoder().encode(compatible.replace('encoding="UTF-16"', 'encoding="UTF-8"'));
}
