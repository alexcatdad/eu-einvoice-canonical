/**
 * Optional language-model labelling of lines. The model is never trusted: it only picks a kind
 * for lines the rules left as plain items, and proposes links the rules did not find. Its output
 * is held to a JSON schema, checked against the invoice and marked `method: 'model'`,
 * `confidence: 'review'`. It runs in the browser only; this file has no model dependency.
 */
import type { CanonicalInvoice, LineRole } from '../canonical.js';
import { analyseLines } from './rules.js';

export const MODEL_KINDS = ['item', 'surcharge', 'discount', 'freight', 'labour', 'other'] as const;
export const MODEL_LINK_TYPES = ['heading', 'markup', 'discount'] as const;
type ModelKind = (typeof MODEL_KINDS)[number];
type ModelLinkType = (typeof MODEL_LINK_TYPES)[number];

export interface ModelInput {
  lines: { id: string; text: string; quantity?: string; unit?: string; unitPrice?: string; amount: string; vat?: string; role: LineRole }[];
}

export interface ModelOutput {
  labels: { id: string; kind: ModelKind }[];
  links: { from: string; to: string[]; type: ModelLinkType }[];
}

export const LABEL_SCHEMA = {
  type: 'object',
  properties: {
    labels: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, kind: { type: 'string', enum: [...MODEL_KINDS] } },
        required: ['id', 'kind'],
      },
    },
    links: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'array', items: { type: 'string' } },
          type: { type: 'string', enum: [...MODEL_LINK_TYPES] },
        },
        required: ['from', 'to', 'type'],
      },
    },
  },
  required: ['labels', 'links'],
} as const;

/** Returns the model's JSON (parsed, or as text). Implemented in the browser (WebLLM, Gemini Nano). */
export type ModelLabeller = (input: ModelInput, prompt: string, schema: typeof LABEL_SCHEMA) => Promise<unknown>;

export function buildModelInput(inv: Pick<CanonicalInvoice, 'lines' | 'lineRoles'>): ModelInput {
  const roles = inv.lineRoles ?? analyseLines(inv).lineRoles;
  return {
    lines: inv.lines.map((l) => ({
      id: l.id,
      text: l.item.name || l.item.description || '',
      quantity: l.quantity,
      unit: l.unitText ?? l.unitCode,
      unitPrice: l.price?.net,
      amount: l.netAmount,
      vat: l.vat ? `${l.vat.categoryCode}${l.vat.rate !== undefined ? ` ${l.vat.rate}%` : ''}` : undefined,
      role: roles[l.id] ?? 'item',
    })),
  };
}

export function buildPrompt(input: ModelInput): string {
  return [
    'You label the lines of an invoice. The invoice may be in any European language, often Swedish.',
    `For each line whose role is "item", set kind to one of: ${MODEL_KINDS.join(', ')}.`,
    'surcharge = a markup or extra charge on other lines (e.g. materialpåslag); discount = a reduction (rabatt); freight = transport (frakt); labour = work or installation (montage, arbete).',
    'Use "item" for goods or services that are sold in their own right. When unsure, answer "item".',
    'In links, say which lines a heading line introduces (type "heading"), which lines a surcharge applies to (type "markup") or a discount applies to (type "discount"). Only link ids from the list.',
    'Answer with JSON only: {"labels":[{"id":"..","kind":".."}],"links":[{"from":"..","to":[".."],"type":".."}]}',
    '',
    JSON.stringify(input.lines),
  ].join('\n');
}

/** Accepts the model's text or object and keeps only what is valid for this invoice. Never throws. */
export function parseModelOutput(raw: unknown, input: ModelInput): ModelOutput {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    const text = raw.replace(/<think>[\s\S]*?<\/think>/g, '');
    const m = /\{[\s\S]*\}/.exec(text);
    try {
      value = m ? JSON.parse(m[0]) : undefined;
    } catch {
      value = undefined;
    }
  }
  const ids = new Set(input.lines.map((l) => l.id));
  const out: ModelOutput = { labels: [], links: [] };
  if (!value || typeof value !== 'object') return out;
  const { labels, links } = value as Record<string, unknown>;
  if (Array.isArray(labels)) {
    for (const x of labels) {
      const { id, kind } = (x ?? {}) as Record<string, unknown>;
      if (typeof id === 'string' && ids.has(id) && (MODEL_KINDS as readonly unknown[]).includes(kind))
        out.labels.push({ id, kind: kind as ModelKind });
    }
  }
  if (Array.isArray(links)) {
    for (const x of links) {
      const { from, to, type } = (x ?? {}) as Record<string, unknown>;
      if (typeof from !== 'string' || !ids.has(from) || !Array.isArray(to) || !(MODEL_LINK_TYPES as readonly unknown[]).includes(type))
        continue;
      const targets = [...new Set(to.filter((t): t is string => typeof t === 'string' && ids.has(t) && t !== from))];
      if (targets.length > 0) out.links.push({ from, to: targets, type: type as ModelLinkType });
    }
  }
  return out;
}

/**
 * Asks the labeller about the invoice and merges what it says. Rule results always win: a role the
 * rules set is kept, and a link is dropped when the rules already relate that line. Model labels are
 * recorded in `source.derived`; model relations carry `method: 'model'`, `confidence: 'review'`.
 */
export async function applyModelLabels(inv: CanonicalInvoice, labeller: ModelLabeller): Promise<ModelOutput> {
  const analysis = analyseLines(inv);
  inv.lineRoles ??= analysis.lineRoles;
  inv.relations ??= analysis.relations;
  const input = buildModelInput(inv);
  let raw: unknown;
  try {
    raw = await labeller(input, buildPrompt(input), LABEL_SCHEMA);
  } catch (e) {
    inv.source.warnings.push({
      code: 'LINE-MODEL-FAILED',
      message: `The language model failed: ${e instanceof Error ? e.message : String(e)}`,
    });
    return { labels: [], links: [] };
  }
  const out = parseModelOutput(raw, input);
  const roles = inv.lineRoles;
  for (const { id, kind } of out.labels) {
    if (roles[id] !== 'item' || kind === 'item') continue;
    roles[id] = kind;
    inv.source.derived.push({ field: `/lineRoles/${id}`, rule: `Labelled "${kind}" by a language model (unverified)` });
  }
  const rels = inv.relations;
  for (const link of out.links) {
    if (rels.some((r) => r.from === link.from && (r.type === link.type || r.confidence === 'proven'))) continue;
    rels.push({ ...link, method: 'model', confidence: 'review' });
  }
  return out;
}
