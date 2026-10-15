import { describe, expect, test } from 'bun:test';
import { convert, type CanonicalInvoice, type Line } from '../src/index.js';
import { analyseLines, applyRelations, isDescriptor, percentagesIn, SEARCH_LIMITS } from '../src/relations/rules.js';
import { applyModelLabels, buildModelInput, buildPrompt, parseModelOutput, LABEL_SCHEMA } from '../src/relations/model.js';
import { evaluate, scoreCase } from '../src/relations/eval.js';
import { LABELLED_CASES, toLines } from '../src/relations/labelled.js';
import { percentOf } from '../src/values.js';
import { fixture } from './helpers.js';

type Spec = [id: string, text: string, qty: string | undefined, amount: string, extra?: Partial<Line>];
const mk = (rows: Spec[]): Line[] => rows.map(([id, text, qty, amount, extra]) => ({
  id, quantity: qty as Line['quantity'], netAmount: amount as Line['netAmount'], allowances: [], charges: [],
  price: qty === '1' ? { net: amount as never } : undefined,
  item: { name: text, classifications: [], attributes: [] },
  ...extra,
}));
const rel = (rows: Spec[]) => analyseLines({ lines: mk(rows) });
const codes = (a: ReturnType<typeof rel>) => a.warnings.map((w) => w.code);

async function parse(name: string, relations: boolean): Promise<CanonicalInvoice> {
  const r = await convert(fixture(name), name, undefined, { relations });
  const o = r.outcomes[0];
  if (o.status !== 'ok') throw new Error(JSON.stringify(o));
  return o.invoices[0];
}

describe('the Svefaktura example with descriptors, a markup and an uncovered item', () => {
  test('roles and relations', async () => {
    const inv = await parse('svefaktura-1.0-descriptors.xml', true);
    expect(inv.lines).toHaveLength(6);
    expect(inv.lineRoles).toEqual({ 1: 'heading', 2: 'description', 3: 'description', 4: 'item', 5: 'surcharge', 6: 'item' });
    expect(inv.relations as unknown[]).toContainEqual({ from: '5', to: ['4'], type: 'markup', rate: '10', method: 'arithmetic', confidence: 'proven' });
    expect(inv.relations).toContainEqual({ from: '1', to: ['4', '5', '6'], type: 'heading', method: 'rule' });
    expect(inv.relations).toHaveLength(2);
    expect(inv.source.warnings.filter((w) => w.code.startsWith('LINE-'))).toEqual([]);
  });

  test('the lines and totals are exactly what they are without relations', async () => {
    const plain = await parse('svefaktura-1.0-descriptors.xml', false);
    const rich = await parse('svefaktura-1.0-descriptors.xml', true);
    expect(plain.lineRoles).toBeUndefined();
    expect(plain.relations).toBeUndefined();
    expect(rich.lines).toEqual(plain.lines);
    expect(rich.totals).toEqual(plain.totals);
    expect(String(plain.totals.lineNetTotal)).toBe('372887.00');
  });

  test('10 % of line 4 is exactly line 5, 10 % of lines 4 and 6 is not', () => {
    expect(String(percentOf('337170.00', '10'))).toBe('33717.0000');
    expect(String(percentOf('339170.00', '10'))).toBe('33917.0000');
  });

  test('the descriptor lines are zero-valued in the source', async () => {
    const inv = await parse('svefaktura-1.0-descriptors.xml', false);
    expect(inv.lines.slice(0, 3).every(isDescriptor)).toBe(true);
    expect(inv.lines.slice(3).some(isDescriptor)).toBe(false);
  });

  test('other fixtures stay free of invented markups', async () => {
    const inv = await parse('svefaktura-1.0.xml', true);
    expect(inv.relations?.filter((r) => r.type === 'markup' || r.type === 'discount')).toEqual([]);
    expect(Object.values(inv.lineRoles!)).toEqual(['item', 'item', 'item']);
  });
});

describe('percentage lines', () => {
  const base: Spec[] = [['1', 'Dörr', '1', '1000.00'], ['2', 'Fönster', '1', '2000.00']];

  test('the rate is read from "10%", "10 %" and "10,5%"', () => {
    expect(percentagesIn('10% Materialpåslag')).toEqual(['10']);
    expect(percentagesIn('Påslag 10 %')).toEqual(['10']);
    expect(percentagesIn('Avgift 10,5%')).toEqual(['10.5']);
    expect(percentagesIn('5% eller 7.25 % men inte 5%')).toEqual(['5', '7.25']);
    expect(percentagesIn('Ingen procent 100')).toEqual([]);
  });

  test('a markup on the previous line only', () => {
    const a = rel([...base, ['3', 'Påslag 10 %', '1', '200.00']]);
    expect(a.relations as unknown[]).toEqual([{ from: '3', to: ['2'], type: 'markup', rate: '10', method: 'arithmetic', confidence: 'proven' }]);
    expect(a.lineRoles['3']).toBe('surcharge');
  });

  test('a markup on a run of lines', () => {
    const a = rel([...base, ['3', '10% påslag', '1', '300.00']]);
    expect(a.relations as unknown[]).toEqual([{ from: '3', to: ['1', '2'], type: 'markup', rate: '10', method: 'arithmetic', confidence: 'proven' }]);
  });

  test('a markup on lines that are not next to each other is found among small subsets', () => {
    const a = rel([['1', 'Dörr', '1', '1000.00'], ['2', 'Montage', '1', '777.00'], ['3', 'Fönster', '1', '2000.00'], ['4', '10 % påslag', '1', '300.00']]);
    expect(a.relations.map((r) => [r.to, r.confidence])).toEqual([[['1', '3'], 'proven']]);
  });

  test('comma decimal rate', () => {
    const a = rel([['1', 'Tjänst', '1', '2000.00'], ['2', 'Avgift 10,5%', '1', '210.00']]);
    expect(a.relations[0]).toMatchObject({ type: 'markup', rate: '10.5', confidence: 'proven' });
  });

  test('a negative line over positive lines is a discount', () => {
    const a = rel([['1', 'Fönster', '1', '5000.00'], ['2', 'Rabatt 10 %', '1', '-500.00']]);
    expect(a.relations as unknown[]).toEqual([{ from: '2', to: ['1'], type: 'discount', rate: '10', method: 'arithmetic', confidence: 'proven' }]);
    expect(a.lineRoles['2']).toBe('discount');
  });

  test('credit notes: all-negative lines and all-positive lines both work', () => {
    const neg = rel([['1', 'Retur', '1', '-4000.00'], ['2', '5% Materialpåslag', '1', '-200.00']]);
    expect(neg.relations[0]).toMatchObject({ from: '2', to: ['1'], type: 'markup', rate: '5', confidence: 'proven' });
    const pos = rel([['1', 'Retur', '1', '4000.00'], ['2', '5% Materialpåslag', '1', '200.00']]);
    expect(pos.relations[0]).toMatchObject({ type: 'markup', confidence: 'proven' });
  });

  test('two lines that both fit: no relation, a warning', () => {
    const a = rel([['1', 'Lock', '1', '1000.00'], ['2', 'Lock', '1', '1000.00'], ['3', '10% påslag', '1', '100.00']]);
    expect(a.relations).toEqual([]);
    expect(codes(a)).toEqual(['LINE-RELATION-AMBIGUOUS']);
    expect(a.warnings[0].path).toBe('/lines/2');
    expect(a.lineRoles['3']).toBe('surcharge');
  });

  test('two rates in one text that both fit are ambiguous too', () => {
    const a = rel([['1', 'Lock', '1', '1000.00'], ['2', 'Lock', '1', '2000.00'], ['3', '10% eller 5% påslag', '1', '100.00']]);
    expect(codes(a)).toEqual(['LINE-RELATION-AMBIGUOUS']);
  });

  test('many ambiguous matches are summarised', () => {
    const rows: Spec[] = Array.from({ length: 6 }, (_, i): Spec => [String(i + 1), 'Lock', '1', '1000.00']);
    const a = rel([...rows, ['7', '10% påslag', '1', '100.00']]);
    expect(a.warnings[0].message).toContain('...');
  });

  test('no set of earlier lines fits: a warning, the line stays an item', () => {
    const a = rel([...base, ['3', '10% Materialpåslag', '1', '123.45']]);
    expect(a.relations).toEqual([]);
    expect(codes(a)).toEqual(['LINE-RELATION-UNMATCHED']);
    expect(a.lineRoles['3']).toBe('item');
  });

  test('the search is bounded: a base older than the candidate cap is not found', () => {
    const rows: Spec[] = [['0', 'Gammal', '1', '1234.00']];
    for (let i = 1; i <= SEARCH_LIMITS.candidates; i++) rows.push([String(i), `Rad ${i}`, '1', `${i * 7}.00`]);
    const a = rel([...rows, ['99', '10% påslag', '1', '123.40']]);
    expect(codes(a)).toEqual(['LINE-RELATION-UNMATCHED']);
  });

  test('items with a quantity or percent in the name are not taken for surcharges', () => {
    const a = rel([['1', 'Dörr', '1', '1000.00'], ['2', 'Sprit 40% 12 flaskor', '12', '500.00', { price: { net: '41.67' as never } }]]);
    expect(a.warnings).toEqual([]);
    expect(a.relations).toEqual([]);
  });

  test('zero-amount lines and the first line are never percentage lines', () => {
    expect(rel([['1', '10% rabatt', '1', '50.00']]).warnings).toEqual([]);
    expect(rel([['1', 'Dörr', '1', '1000.00'], ['2', 'Rabatt 10%', undefined, '0.00']]).warnings).toEqual([]);
  });

  test('a markup on a later group does not reach back over a new heading', () => {
    const a = rel([
      ['1', 'Del A', '0', '0.00'], ['2', 'Dörr', '1', '1000.00'],
      ['3', 'Del B', '0', '0.00'], ['4', 'Fönster', '1', '2000.00'], ['5', '10% påslag', '1', '100.00'],
    ]);
    expect(codes(a)).toEqual(['LINE-RELATION-UNMATCHED']);
  });
});

describe('descriptors and grouping', () => {
  test('a heading line and the descriptions after it', () => {
    const a = rel([['1', 'Rubrik', undefined, '0.00'], ['2', 'Mer text', '0', '0.00'], ['3', 'Dörr', '1', '1000.00']]);
    expect(a.lineRoles).toEqual({ 1: 'heading', 2: 'description', 3: 'item' });
    expect(a.relations as unknown[]).toEqual([{ from: '1', to: ['3'], type: 'heading', method: 'rule' }]);
  });

  test('a new run of descriptors starts a new group', () => {
    const a = rel([['1', 'A', undefined, '0.00'], ['2', 'x', '1', '10.00'], ['3', 'B', undefined, '0.00'], ['4', 'y', '1', '20.00'], ['5', 'z', '1', '30.00']]);
    expect(a.relations.map((r) => [r.from, r.to])).toEqual([['1', ['2']], ['3', ['4', '5']]]);
  });

  test('a change of order reference ends the group', () => {
    const ref = (r: string): Partial<Line> => ({ national: { orderReference: r } });
    const a = rel([['1', 'Rubrik', undefined, '0.00', ref('A')], ['2', 'x', '1', '10.00', ref('A')], ['3', 'y', '1', '20.00', ref('B')]]);
    expect(a.relations as unknown[]).toEqual([{ from: '1', to: ['2'], type: 'heading', method: 'rule' }]);
    const b = rel([['1', 'Rubrik', undefined, '0.00'], ['2', 'x', '1', '10.00', ref('A')], ['3', 'y', '1', '20.00', ref('A')]]);
    expect(b.relations[0].to).toEqual(['2', '3']);
  });

  test('trailing descriptors with nothing under them relate to nothing', () => {
    const a = rel([['1', 'x', '1', '10.00'], ['2', 'Slutord', undefined, '0.00']]);
    expect(a.relations).toEqual([]);
    expect(a.lineRoles['2']).toBe('heading');
  });

  test('a free item is not a descriptor: quantity, price, allowance or sub-lines make it a line', () => {
    const free = mk([['1', 'Gratis', '1', '0.00']])[0];
    expect(isDescriptor({ ...free, quantity: '1' as never })).toBe(false);
    expect(isDescriptor({ ...free, quantity: undefined, price: { net: '5' as never } })).toBe(false);
    expect(isDescriptor({ ...free, quantity: undefined, price: undefined, charges: [{ amount: '1' as never }] })).toBe(false);
    expect(isDescriptor({ ...free, quantity: undefined, price: undefined, item: { ...free.item, name: ' ', description: ' ' } })).toBe(false);
    expect(isDescriptor({ ...free, quantity: undefined, price: undefined, item: { ...free.item, name: '', description: 'Text' } })).toBe(true);
  });
});

describe('other links', () => {
  test('a line allowance whose base amount is another line', () => {
    const lines = mk([['1', 'Dörr', '1', '1000.00'], ['2', 'Rabatt', '1', '-100.00', { allowances: [{ amount: '100.00' as never, baseAmount: '1000.00' as never }] }]]);
    const a = analyseLines({ lines });
    expect(a.relations as unknown[]).toEqual([{ from: '2', to: ['1'], type: 'allowance-base', method: 'arithmetic', confidence: 'likely' }]);
  });

  test('an allowance on its own amount links nothing', () => {
    const lines = mk([['1', 'Dörr', '1', '900.00', { allowances: [{ amount: '100.00' as never, baseAmount: '1000.00' as never }] }]]);
    expect(analyseLines({ lines }).relations).toEqual([]);
    const zero = mk([['1', 'Dörr', '1', '900.00', { allowances: [{ amount: '100.00' as never, baseAmount: '0.00' as never }] }]]);
    expect(analyseLines({ lines: zero }).relations).toEqual([]);
  });

  test('a base amount that fits two lines is not linked', () => {
    const lines = mk([['1', 'A', '1', '500.00'], ['2', 'B', '1', '500.00'], ['3', 'Rabatt', '1', '-50.00', { allowances: [{ amount: '50.00' as never, baseAmount: '500.00' as never }] }]]);
    expect(analyseLines({ lines }).relations.filter((r) => r.type === 'allowance-base')).toEqual([]);
  });

  test('notes that name another line', () => {
    const lines = mk([['1', 'Dörr', '1', '1000.00'], ['2', 'Fönster', '1', '1000.00'], ['3', 'Tillägg', '1', '50.00', { note: 'Avser rad 1 och position 2, inte rad 3 eller rad 9' }]]);
    expect(analyseLines({ lines }).relations).toEqual([{ from: '3', to: ['1', '2'], type: 'note-reference', method: 'rule', confidence: 'likely' }]);
  });

  test('shared item ids and order-line references are hints for review', () => {
    const item = (sellerId?: string, buyerId?: string, standard?: string): Partial<Line> => ({ item: { name: 'x', sellerId, buyerId, standardId: standard ? { value: standard, schemeId: '0160' as never } : undefined, classifications: [], attributes: [] } });
    const lines = mk([
      ['1', 'x', '1', '10.00', { ...item('S1'), orderLineRef: 'O1' }],
      ['2', 'x', '1', '-10.00', { ...item('S1'), orderLineRef: 'O1' }],
      ['3', 'x', '1', '10.00', item(undefined, 'B1')], ['4', 'x', '1', '10.00', item(undefined, 'B1')],
      ['5', 'x', '1', '10.00', item(undefined, undefined, '123')], ['6', 'x', '1', '10.00', item(undefined, undefined, '123')],
      ['7', 'x', '1', '10.00', item()],
    ]);
    const types = analyseLines({ lines }).relations;
    expect(types.filter((r) => r.type === 'same-item').map((r) => [r.from, r.to, r.confidence, r.method])).toEqual([
      ['1', ['2'], 'review', 'rule'], ['3', ['4'], 'review', 'rule'], ['5', ['6'], 'review', 'rule'],
    ]);
    expect(types.filter((r) => r.type === 'same-order-line').map((r) => [r.from, r.to])).toEqual([['1', ['2']]]);
  });
});

describe('applyRelations', () => {
  test('adds to the invoice and appends warnings, leaving lines alone', async () => {
    const inv = await parse('svefaktura-1.0-descriptors.xml', false);
    const before = structuredClone(inv.lines);
    inv.lines[4].item.name = '12% Materialpåslag';
    applyRelations(inv);
    expect(inv.source.warnings.map((w) => w.code)).toContain('LINE-RELATION-UNMATCHED');
    expect(inv.lines.slice(0, 4)).toEqual(before.slice(0, 4));
    expect(inv.lineRoles?.['1']).toBe('heading');
  });
});

describe('language model labels', () => {
  const invoice = async () => {
    const inv = await parse('svefaktura-1.0.xml', true);
    return inv;
  };

  test('the input carries the rule roles, the prompt carries the lines', async () => {
    const input = buildModelInput(await invoice());
    expect(input.lines.map((l) => [l.id, l.text, l.role])).toEqual([['1', 'Ekbord', 'item'], ['2', 'Montering', 'item'], ['3', 'Frakt', 'item']]);
    expect(buildPrompt(input)).toContain('Frakt');
    expect(LABEL_SCHEMA.required).toEqual(['labels', 'links']);
    expect(buildModelInput({ lines: toLines(LABELLED_CASES[0]) }).lines[0].role).toBe('heading');
  });

  test('output is cleaned: unknown ids and kinds, think blocks, text around the JSON', async () => {
    const input = buildModelInput(await invoice());
    const raw = '<think>hmm {"labels":[]}</think> Here: {"labels":[{"id":"2","kind":"labour"},{"id":"9","kind":"freight"},{"id":"3","kind":"banana"},{"id":"3","kind":"freight"},null],"links":[{"from":"1","to":["2","2","1","7"],"type":"heading"},{"from":"1","to":["2"],"type":"nope"},{"from":"8","to":["1"],"type":"markup"},{"from":"1","to":"2","type":"markup"},{"from":"1","to":[],"type":"markup"},null]}';
    expect(parseModelOutput(raw, input)).toEqual({
      labels: [{ id: '2', kind: 'labour' }, { id: '3', kind: 'freight' }],
      links: [{ from: '1', to: ['2'], type: 'heading' }],
    });
    expect(parseModelOutput('not json', input)).toEqual({ labels: [], links: [] });
    expect(parseModelOutput('{broken', input)).toEqual({ labels: [], links: [] });
    expect(parseModelOutput(42, input)).toEqual({ labels: [], links: [] });
    expect(parseModelOutput({ labels: 'x', links: 'y' }, input)).toEqual({ labels: [], links: [] });
  });

  test('labels fill in plain items only and are recorded as unverified', async () => {
    const inv = await parse('svefaktura-1.0-descriptors.xml', true);
    await applyModelLabels(inv, async () => ({
      labels: [{ id: '4', kind: 'freight' }, { id: '5', kind: 'discount' }, { id: '6', kind: 'item' }, { id: '1', kind: 'other' }],
      links: [{ from: '6', to: ['4'], type: 'markup' }, { from: '5', to: ['6'], type: 'markup' }, { from: '1', to: ['6'], type: 'heading' }, { from: '2', to: ['6'], type: 'heading' }],
    }));
    expect(inv.lineRoles).toEqual({ 1: 'heading', 2: 'description', 3: 'description', 4: 'freight', 5: 'surcharge', 6: 'item' });
    expect(inv.source.derived.map((d) => d.field).filter((f) => f.startsWith('/lineRoles'))).toEqual(['/lineRoles/4']);
    const byModel = inv.relations!.filter((r) => r.method === 'model');
    expect(byModel).toEqual([
      { from: '6', to: ['4'], type: 'markup', method: 'model', confidence: 'review' },
      { from: '2', to: ['6'], type: 'heading', method: 'model', confidence: 'review' },
    ]);
  });

  test('works on an invoice that has no relations yet', async () => {
    const inv = await parse('svefaktura-1.0.xml', false);
    await applyModelLabels(inv, async () => '{"labels":[{"id":"3","kind":"freight"}],"links":[]}');
    expect(inv.lineRoles?.['3']).toBe('freight');
  });

  test('a failing model is a warning, not an error', async () => {
    const inv = await parse('svefaktura-1.0.xml', true);
    const out = await applyModelLabels(inv, async () => { throw new Error('out of memory'); });
    expect(out).toEqual({ labels: [], links: [] });
    expect(inv.source.warnings.at(-1)).toMatchObject({ code: 'LINE-MODEL-FAILED' });
    const out2 = await applyModelLabels(inv, async () => { throw 'plain'; });
    expect(out2.labels).toEqual([]);
  });
});

describe('evaluation set', () => {
  test('the rules settle the user example completely and prove nothing wrong anywhere', async () => {
    const r = await evaluate();
    expect(r.cases[0]).toMatchObject({ rolesCorrect: 6, rolesTotal: 6, relationsTrue: 2, relationsFound: 2, relationsExpected: 2, provenWrong: 0 });
    expect(r.provenWrong).toBe(0);
    expect(r.roleAccuracy).toBeLessThan(1);
    expect(r.relationPrecision).toBeGreaterThan(0);
    expect(r.relationRecall).toBeLessThan(1);
  });

  test('every labelled case is internally consistent', () => {
    for (const c of LABELLED_CASES) {
      const ids = new Set(c.lines.map((l) => l.id));
      expect(Object.keys(c.roles).sort()).toEqual([...ids].sort());
      for (const r of c.relations) for (const id of [r.from, ...r.to]) expect(ids.has(id)).toBe(true);
    }
  });

  test('a model that knows the kinds raises role accuracy; a failing one is reported', async () => {
    const base = await evaluate();
    const kinds: Record<string, string> = { Montering: 'labour', Frakt: 'freight', 'Frakt till byggplatsen': 'freight', 'Montage 8 tim': 'labour' };
    const smart = await evaluate(async (input) => ({ labels: input.lines.filter((l) => kinds[l.text]).map((l) => ({ id: l.id, kind: kinds[l.text] })), links: [] }));
    expect(smart.roleAccuracy).toBeGreaterThan(base.roleAccuracy);
    expect(smart.provenWrong).toBe(0);
    const broken = await evaluate(async () => { throw new Error('boom'); });
    expect(broken.cases.every((c) => c.error === 'The language model failed: boom')).toBe(true);
  });

  test('scoring ignores relation types the labels do not cover, but not wrong proven ones', () => {
    const c = LABELLED_CASES[1];
    const s = scoreCase(c, { 1: 'item', 2: 'labour', 3: 'freight' }, [
      { from: '1', to: ['2'], type: 'same-item', method: 'rule', confidence: 'review' },
      { from: '3', to: ['1'], type: 'markup', method: 'arithmetic', confidence: 'proven' },
    ]);
    expect(s).toMatchObject({ rolesCorrect: 3, relationsFound: 1, relationsTrue: 0, provenWrong: 1 });
  });
});
