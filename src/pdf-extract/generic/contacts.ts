/**
 * Contact blocks: the lines under a party's contact heading, as Peppol viewers print them ("KÖPARENS KONTAKT",
 * "SÄLJARENS KONTAKT": "Kontakt: name", "Telefon: number", "E-mail: address" or the address alone), and the seller's
 * contact for questions about the invoice ("Frågor ang. fakturan: number", the e-mail address under it). The heading
 * names the party, so these lines are read here, never as the generic labels that a footer gives the seller.
 */
import { normalize } from '../se/index.js';
import { below, type Cell, rightOf } from './cells.js';
import { type FieldKey, type Parsed, parseField } from './fields.js';

const HEADING = /^(köparens|säljarens) kontakt$/u;
const QUESTIONS = /^frågor ang(?:ående|\.)? fakturan$/u;
const LABELS: [RegExp, 'name' | 'phone' | 'email' | 'accountingRef'][] = [
  [/^kontakt(?:person)?$/u, 'name'],
  // The buyer's accounting reference (BT-19), printed in the buyer's contact block
  [/^konteringsreferens$/u, 'accountingRef'],
  [/^(?:telefon(?:nummer)?|tfn|tel)$/u, 'phone'],
  [/^(?:e-?post(?:adress)?|e-?mail)$/u, 'email'],
];
const KEYS = {
  buyer: { name: 'buyerContact', phone: 'buyerPhone', email: 'buyerEmail', accountingRef: 'accountingRef' },
  seller: { name: 'sellerContact', phone: 'phone', email: 'email', accountingRef: 'accountingRef' },
} as const satisfies Record<string, Record<string, FieldKey>>;
/** A heading in capitals ends a block; a reference such as "REF-2026-01" does not. */
const CAPITALS = /^[^\p{Ll}\d]*\p{Lu}{3}[^\p{Ll}\d]*$/u;

export interface ContactHit {
  key: FieldKey;
  parsed: Parsed;
  cell: Cell;
}

/** The contact details each block prints; `cells` are every cell of the blocks, which other rules leave alone. */
export function contactBlocks(rows: Cell[][]): { hits: ContactHit[]; cells: Set<Cell>; labels: Cell[] } {
  const hits: ContactHit[] = [];
  const cells = new Set<Cell>();
  const labels: Cell[] = [];
  for (const head of rows.flat()) {
    const t = normalize(head.text).replace(/\s*:$/u, '');
    const heading = HEADING.exec(t);
    const questions = !heading && QUESTIONS.test(t);
    if (!heading && !questions) continue;
    const party = heading?.[1] === 'köparens' ? 'buyer' : 'seller';
    const right = questions ? rightOf(rows, head) : undefined;
    const first = right ?? below(rows, head);
    let found = 0;
    for (let at = first, n = 0; at && n < 8 && Math.abs(at.x - first!.x) <= 2 && !CAPITALS.test(at.text); at = below(rows, at), n++) {
      if (HEADING.test(normalize(at.text)) || QUESTIONS.test(normalize(at.text).replace(/\s*:$/u, ''))) break;
      const pair = /^([^:]{2,30}):\s*(\S.*)$/u.exec(at.text);
      const kind = pair
        ? LABELS.find(([re]) => re.test(normalize(pair[1])))?.[1]
        : /@/u.test(at.text)
          ? 'email'
          : questions
            ? 'phone'
            : undefined;
      const key = kind && KEYS[party][kind];
      const parsed = key && parseField(key, pair ? pair[2].trim() : at.text.trim());
      if (!key || !parsed || !('value' in parsed)) continue;
      hits.push({ key, parsed, cell: at });
      cells.add(at);
      found++;
    }
    if (found) {
      cells.add(head);
      labels.push(head);
    }
  }
  return { hits, cells, labels };
}
