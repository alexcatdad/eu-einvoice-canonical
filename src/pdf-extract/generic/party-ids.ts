/**
 * Party identifiers printed with their scheme code in brackets, as Peppol viewers print them: an electronic address
 * ("Köparens PEPPOL-ID: 9999990113 [0007]", BT-34/BT-49) and, in a party block, the organisation number
 * ("Organisationsnummer: 9999990113 [0007]", "ID: 9999990113 [0007]"). The party is the one the label names
 * ("Köparens", "Seller's"), else the one whose heading (KÖPAREN, SÄLJAREN) stands above in the same column.
 */
import type { SourceWarning } from '../../canonical.js';
import { PEPPOL_EAS_CODES } from '../../codes.js';
import type { ReadValue } from '../generic.js';
import { normalize, parseGln } from '../se/index.js';
import { type Cell, regionOf } from './cells.js';
import { type Parsed, parseField } from './fields.js';

export type Party = 'buyer' | 'seller';
export type PartyId =
  | { kind: 'endpoint'; party: Party; scheme: string; parsed: Parsed | { value: string; badScheme: true }; cell: Cell }
  | { kind: 'orgNumber'; party: Party; parsed: Parsed; cell: Cell }
  /** A VAT number alone on a line of the party block ("SE999999011301"). */
  | { kind: 'vatNumber'; party: Party; parsed: Parsed; cell: Cell }
  /** Another party ID with an ISO 6523 scheme ("ID: 9999999000010 [0088]", BT-29/BT-46). */
  | { kind: 'identifier'; party: Party; scheme: string; value: string; cell: Cell }
  /** A bracketed identifier this reader does not use. */
  | { kind: 'other' };

const SIDE = `(?:(?<side>köparens|säljarens|kundens|leverantörens|buyer'?s|seller'?s|customer'?s|supplier'?s) )?`;
const VALUE = ' ?: ?(?<value>\\S.*?) ?\\[(?<scheme>[0-9A-Za-z]{2,4})\\]$';
const ENDPOINT = new RegExp(
  `^${SIDE}(?:peppol[- ]?(?:id|participant id|deltagar-?id)|endpoint(?: id)?|elektronisk adress|electronic address)${VALUE}`,
  'iu',
);
const ORG = new RegExp(`^(?:organisationsnummer|org(?:anisations)?\\.? ?nr|id)${VALUE}`, 'iu');
const ID = new RegExp(`^id${VALUE}`, 'iu');
const HEADING = /^(?:köparen|säljaren|buyer|seller)$/u;
/** ISO 6523 ICD codes that EN 16931 rule BR-CL-10 accepts in both pinned versions (1.3.16 and 1.3.17). */
const ICD = (s: string) => /^0\d{3}$/u.test(s) && +s >= 2 && +s <= 248 && ![92, 103, 181, 182].includes(+s);
const BUYER = /^(?:köp|kund|buyer|customer)/iu;

/** The party heading nearest above `cell` on its page, left-aligned with it. */
function blockParty(rows: Cell[][], cell: Cell): Party | undefined {
  let best: Cell | undefined;
  for (const c of rows.flat())
    if (c.page === cell.page && c.y < cell.y && Math.abs(c.x - cell.x) <= 2 && HEADING.test(normalize(c.text)) && (!best || c.y > best.y))
      best = c;
  return best && (BUYER.test(normalize(best.text)) ? 'buyer' : 'seller');
}

/** The scheme's own check where it has one (0007 Luhn, 0088 GS1 mod 10); a scheme outside the Peppol EAS list is flagged. */
function endpointValue(scheme: string, raw: string): Parsed | { value: string; badScheme: true } {
  const compact = raw.replace(/\s+/gu, '');
  if (!PEPPOL_EAS_CODES.has(scheme)) return { value: compact, badScheme: true };
  if (scheme === '0007') return parseField('orgNumber', raw) ?? { value: compact, checkFailed: true };
  if (scheme === '0088') return parseGln(compact) ? { value: compact } : { value: compact, checkFailed: true };
  return { value: compact };
}

/** Reads `cell` as a bracketed party identifier; undefined when it is not one. */
export function partyId(rows: Cell[][], cell: Cell): PartyId | undefined {
  const text = cell.text.normalize('NFC').replace(/\s+/gu, ' ').trim();
  const endpoint = ENDPOINT.exec(text)?.groups;
  if (endpoint) {
    const party = endpoint.side ? (BUYER.test(endpoint.side) ? 'buyer' : 'seller') : blockParty(rows, cell);
    const scheme = endpoint.scheme.toUpperCase();
    return party ? { kind: 'endpoint', party, scheme, parsed: endpointValue(scheme, endpoint.value), cell } : { kind: 'other' };
  }
  if (/^SE ?\d{6}-?\d{4} ?01$/u.test(text)) {
    const party = blockParty(rows, cell);
    const parsed = party && parseField('vatNumber', text);
    return party && parsed && 'value' in parsed && !parsed.checkFailed ? { kind: 'vatNumber', party, parsed, cell } : undefined;
  }
  const org = ORG.exec(text)?.groups;
  if (!org) return undefined;
  const party = blockParty(rows, cell);
  // "ID: <n> [<ICD>]" with a scheme other than the organisation number; a GLN must pass its check digit
  const id = ID.exec(text)?.groups;
  if (party && id && id.scheme !== '0007' && ICD(id.scheme)) {
    const value = id.value.replace(/\s+/gu, '');
    if (id.scheme !== '0088' || parseGln(value)) return { kind: 'identifier', party, scheme: id.scheme, value, cell };
  }
  const parsed = org.scheme === '0007' ? parseField('orgNumber', org.value) : undefined;
  return party && parsed ? { kind: 'orgNumber', party, parsed, cell } : { kind: 'other' };
}

/** Writes each party's printed electronic address (`/{party}/endpoint`), when its occurrences agree. */
export function endpointValues(ids: PartyId[], values: Record<string, ReadValue>, problems: SourceWarning[]) {
  for (const party of ['seller', 'buyer'] as const) {
    const hits = ids.flatMap((id) => (id.kind === 'endpoint' && id.party === party ? [id] : []));
    if (!hits.length) continue;
    const field = `/${party}/endpoint`;
    const region = regionOf(hits[0].cell);
    const key = (h: (typeof hits)[number]) => ('value' in h.parsed ? `${h.scheme}:${h.parsed.value}` : '');
    const distinct = new Set(hits.map(key));
    if (distinct.size > 1) {
      problems.push({ code: 'ambiguous', field, message: `Different electronic addresses printed for the ${party}`, region });
      continue;
    }
    const [{ scheme, parsed }] = hits;
    if (!('value' in parsed)) {
      problems.push({
        code: 'personal-number',
        field,
        message: `The ${party} electronic address is a personal identity number; it is not kept`,
        region,
      });
      continue;
    }
    if ('badScheme' in parsed)
      problems.push({ code: 'identifier-check', field, message: `Scheme ${scheme} is not a Peppol EAS code; kept as printed`, region });
    else if (parsed.checkFailed)
      problems.push({
        code: 'identifier-check',
        field,
        message: `The ${party} electronic address fails its check digits; kept as printed`,
        region,
      });
    values[`${field}/value`] = { value: parsed.value, region };
    values[`${field}/schemeId`] = { value: scheme, region };
  }
}

/**
 * Writes the parties' other identifiers with their scheme: the seller may have several (BT-29); the buyer has one
 * (BT-46), so one printed after another buyer identifier is reported and not kept.
 */
export function identifierValues(ids: PartyId[], values: Record<string, ReadValue>, warnings: SourceWarning[]) {
  for (const party of ['seller', 'buyer'] as const) {
    const hits = ids.flatMap((id) => (id.kind === 'identifier' && id.party === party ? [id] : []));
    let k = 0;
    while (values[`/${party}/identifiers/${k}/value`]) k++;
    for (const [i, h] of hits.entries()) {
      if (hits.findIndex((o) => o.scheme === h.scheme && o.value === h.value) !== i) continue;
      const region = regionOf(h.cell);
      if (party === 'buyer' && k > 0) {
        warnings.push({
          code: 'ambiguous',
          field: '/buyer/identifiers',
          message: 'Another buyer identifier is printed; the buyer has one (BT-46), so only the first is kept',
          region,
        });
        continue;
      }
      values[`/${party}/identifiers/${k}/value`] = { value: h.value, region };
      values[`/${party}/identifiers/${k}/schemeId`] = { value: h.scheme, region };
      k++;
    }
  }
}
