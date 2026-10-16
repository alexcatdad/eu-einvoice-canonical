/**
 * Hand-labelled lines for comparing the rules with language models. Cases 1 and 2 mirror the
 * fixtures `svefaktura-1.0-descriptors.xml` and `svefaktura-1.0.xml`; the rest are synthetic.
 * The labels say what the invoice means, not what the rules produce, so cases the rules cannot
 * settle (nested headings, ambiguous percentages, text-only kinds) show up as misses.
 */
import type { Line, LineRelationType, LineRole } from '../canonical.js';

export interface LabelledLine {
  id: string;
  text: string;
  quantity?: string;
  unit?: string;
  price?: string;
  amount: string;
  vat?: string;
}

export interface LabelledCase {
  name: string;
  lines: LabelledLine[];
  roles: Record<string, LineRole>;
  relations: { from: string; to: string[]; type: LineRelationType }[];
}

const L = (
  id: string,
  text: string,
  quantity: string | undefined,
  price: string | undefined,
  amount: string,
  vat: string | undefined = 'S',
): LabelledLine => ({ id, text, quantity, unit: quantity ? 'st' : undefined, price, amount, vat });

export const LABELLED_CASES: LabelledCase[] = [
  {
    name: 'svefaktura-1.0-descriptors.xml (headings, markup on one line, a line the markup does not cover)',
    lines: [
      L('1', '4711 - Exempelskolan 12 st glaspartier', '0.00', '0', '0.00', undefined),
      L('2', 'Projektering, tillverkning & montage av glaspartier i aluminium.', '0.00', '0', '0.00', undefined),
      L('3', 'Utförande enligt anbud 5150', '0.00', '0', '0.00', undefined),
      L('4', '11st Glaspartier (GP-A) (Ändring till 12st)', '1.00', '248000', '248000.00'),
      L('5', '8% Materialpåslag', '1.00', '19840', '19840.00'),
      L('6', 'Dörrgångjärn (syntetisk testrad)', '20.00', '100', '2000.00'),
    ],
    roles: { 1: 'heading', 2: 'description', 3: 'description', 4: 'item', 5: 'surcharge', 6: 'item' },
    relations: [
      { from: '1', to: ['4', '5', '6'], type: 'heading' },
      { from: '5', to: ['4'], type: 'markup' },
    ],
  },
  {
    name: 'svefaktura-1.0.xml (labour and freight lines)',
    lines: [
      L('1', 'Ekbord', '4', '250.00', '1000.00', undefined),
      L('2', 'Montering', '3.5', '649.90', '2274.65', undefined),
      L('3', 'Frakt', undefined, undefined, '300.00', undefined),
    ],
    roles: { 1: 'item', 2: 'labour', 3: 'freight' },
    relations: [],
  },
  {
    name: 'synthetic: percentage discount',
    lines: [L('1', 'Fönster 120x80', '10', '500.00', '5000.00'), L('2', 'Rabatt 10 %', '1', '-500.00', '-500.00')],
    roles: { 1: 'item', 2: 'discount' },
    relations: [{ from: '2', to: ['1'], type: 'discount' }],
  },
  {
    name: 'synthetic: freight and installation after items',
    lines: [
      L('1', 'Takpannor', '200', '12.00', '2400.00'),
      L('2', 'Frakt till byggplatsen', '1', '450.00', '450.00'),
      L('3', 'Montage 8 tim', '8', '600.00', '4800.00'),
    ],
    roles: { 1: 'item', 2: 'freight', 3: 'labour' },
    relations: [],
  },
  {
    name: 'synthetic: nested headings',
    lines: [
      L('1', 'Entreprenad Skolgården', '0', '0', '0.00', undefined),
      L('2', 'Etapp 1', '0', '0', '0.00', undefined),
      L('3', 'Grävning', '1', '8000.00', '8000.00'),
      L('4', 'Plattsättning', '1', '12000.00', '12000.00'),
      L('5', 'Etapp 2', '0', '0', '0.00', undefined),
      L('6', 'Planteringar', '1', '5000.00', '5000.00'),
    ],
    roles: { 1: 'heading', 2: 'heading', 3: 'item', 4: 'item', 5: 'heading', 6: 'item' },
    relations: [
      { from: '1', to: ['3', '4', '6'], type: 'heading' },
      { from: '2', to: ['3', '4'], type: 'heading' },
      { from: '5', to: ['6'], type: 'heading' },
    ],
  },
  {
    name: 'synthetic: ambiguous percentage (two equal lines)',
    lines: [
      L('1', 'Brunnslock', '1', '1000.00', '1000.00'),
      L('2', 'Brunnslock', '1', '1000.00', '1000.00'),
      L('3', '10% påslag på sista raden', '1', '100.00', '100.00'),
    ],
    roles: { 1: 'item', 2: 'item', 3: 'surcharge' },
    relations: [{ from: '3', to: ['2'], type: 'markup' }],
  },
  {
    name: 'synthetic: comma decimal rate',
    lines: [L('1', 'Konsulttjänst', '1', '2000.00', '2000.00'), L('2', 'Administrationsavgift 10,5%', '1', '210.00', '210.00')],
    roles: { 1: 'item', 2: 'surcharge' },
    relations: [{ from: '2', to: ['1'], type: 'markup' }],
  },
  {
    name: 'synthetic: credit note with a markup',
    lines: [L('1', 'Returnerad dörr', '1', '-4000.00', '-4000.00'), L('2', '5% Materialpåslag', '1', '-200.00', '-200.00')],
    roles: { 1: 'item', 2: 'surcharge' },
    relations: [{ from: '2', to: ['1'], type: 'markup' }],
  },
];

/** The labelled lines as canonical lines, enough for the rules and the model input. */
export function toLines(c: LabelledCase): Line[] {
  return c.lines.map(
    (l): Line => ({
      id: l.id,
      quantity: l.quantity as Line['quantity'],
      unitText: l.unit,
      netAmount: l.amount as Line['netAmount'],
      allowances: [],
      charges: [],
      price: l.price ? { net: l.price as never } : undefined,
      vat: l.vat ? { categoryCode: l.vat as never } : undefined,
      item: { name: l.text, classifications: [], attributes: [] },
    }),
  );
}
