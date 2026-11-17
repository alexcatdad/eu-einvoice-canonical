/**
 * Swedish invoice label lexicon: label keys with the spellings, abbreviations and case
 * variants seen on Swedish invoices, plus a matcher over free text.
 */
import { normalize, wordRegExp } from './text.js';

/** Optional separator inside abbreviations: "org.nr", "org. nr", "org-nr", "orgnr". */
const S = '[ .:-]{0,3}';

/**
 * Regular-expression sources per label, matched against `normalize()`d text (lower case,
 * single spaces) as whole words. When two labels match at the same position the longer
 * match wins, so "summa att betala" is `amountDue`, not `total`.
 */
export const SE_LABEL_PATTERNS = {
  invoiceNumber: [`fakt(?:ura)?${S}(?:nr|nummer|no)`],
  invoiceDate: [`fakt(?:ura)?${S}datum`],
  dueDate: [`förf(?:allo)?${S}(?:datum|dag)`, 'förfaller(?: till betalning)?', '(?:att )?betalas? senast', 'sista betalningsdag(?:en)?'],
  amountDue: [`(?:(?:summa|totalt|belopp) )?att betala(?: sek| kr)?`, 'total fordran'],
  total: [
    'summa',
    'totalt?',
    'totala belopp(?:et)?',
    'totalbelopp(?:et)?',
    'totalsumma',
    'fakturabelopp(?:et)?',
    `(?:summa|totalt?|belopp) inkl(?:\\.|usive)? moms`,
  ],
  vat: ['moms', 'mervärdes?skatt', 'momsbelopp', '(?:summa|varav) moms'],
  net: ['netto(?:belopp)?', `(?:(?:summa|totalt?|belopp|pris) )?exkl(?:\\.|usive)? moms`],
  orgNumber: [`org(?:anisations)?${S}(?:nr|nummer)`],
  vatNumber: [
    `moms${S}reg(?:istrerings)?${S}(?:nr|nummer)`,
    `momsnr`,
    `vat(?:${S}(?:reg${S})?(?:nr|no|nummer|number|id))?`,
    `reg${S}nr för moms`,
  ],
  ocr: [`ocr(?:${S}(?:nr|nummer|referens))?`, 'betalningsreferens', 'referens vid betalning'],
  reference: ['(?:er|vår|ert|vårt) (?:referens|ref\\.?|ordernr|ordernummer)', 'referens'],
  bankgiro: [`bankgiro(?:${S}(?:nr|nummer|t))?`, 'bg(?: nr)?'],
  plusgiro: [`plusgiro(?:${S}(?:nr|nummer|t|konto))?`, 'postgiro(?:t|nr)?', 'pg(?: nr)?'],
  iban: ['iban'],
  bic: ['bic(?:/swift)?', 'swift(?:/bic)?'],
  fSkatt: ['(?:godkänd för |innehar )?f-?skatt(?:sedel|ebevis)?'],
  creditNote: ['kreditfaktura', 'kreditnota', 'kredit faktura'],
  reminder: ['betalningspåminnelse', 'påminnelse(?: om betalning)?', '(?:\\d+:?[ae] )påminnelse', 'påminnelse(?:nr|datum|nummer)'],
  reminderFee: ['påminnelseavgift'],
  lateInterest: ['dröjsmålsränta', 'ränta efter förfallodag(?:en)?', 'ränta enligt räntelagen'],
  rot: [`rot${S}avdrag`, 'rot'],
  rut: [`rut${S}avdrag`, 'rut'],
  householdWork: ['husarbete', '(?:preliminär )?skattereduktion'],
  factoring: ['belåning', 'belånad', 'factoring', 'överlåt(?:en|et|na|it|its|s|else|elsen|elsetext)', 'pantsatt'],
  vatExempt: ['momsfri(?:tt)?', 'undantag(?:en)? från skatteplikt'],
  rounding: [`öres${S}(?:avrundning|avr|utjämning|utj)\\.?`, 'avrundning'],
} as const satisfies Record<string, readonly string[]>;

export type SeLabel = keyof typeof SE_LABEL_PATTERNS;

export interface LabelMatch {
  label: SeLabel;
  /** Matched text, as normalised. */
  text: string;
  /** Start and end offsets in the normalised text. */
  start: number;
  end: number;
}

// One expression per source, so that overlap resolution, not alternation order, picks the longest match.
const COMPILED = (Object.entries(SE_LABEL_PATTERNS) as [SeLabel, readonly string[]][]).flatMap(([label, sources]) =>
  sources.map((source) => [label, wordRegExp(source)] as const),
);

/** All labels in `text`, in reading order, without overlaps (earliest start, then longest match). */
export function findLabels(text: string): LabelMatch[] {
  const norm = normalize(text);
  const all: LabelMatch[] = [];
  for (const [label, re] of COMPILED)
    for (const m of norm.matchAll(re)) all.push({ label, text: m[0], start: m.index, end: m.index + m[0].length });
  all.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: LabelMatch[] = [];
  for (const m of all) if (!out.length || m.start >= out[out.length - 1].end) out.push(m);
  return out;
}

/**
 * The label that `text` is, when the whole text (ignoring a trailing colon) is one label,
 * as in a table header or a "Fakturanummer:" text run.
 */
export function matchLabel(text: string): SeLabel | undefined {
  const norm = normalize(text).replace(/\s*:$/u, '');
  const [m] = findLabels(norm);
  return m && m.start === 0 && m.end === norm.length ? m.label : undefined;
}
