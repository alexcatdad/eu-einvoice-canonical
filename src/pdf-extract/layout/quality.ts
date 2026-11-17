/**
 * Text quality check: decides from the extracted text, not from font flags, whether a PDF's text layer can be read.
 * A font without ToUnicode often extracts fine, so only the resulting characters count.
 */
import type { LayoutPage } from '../layout.js';

export type UnsupportedCode =
  /** The file needs a password to open. */
  | 'encrypted'
  /** The JavaScript runtime lacks built-ins pdf.js needs (supported: Bun 1.4+ and current browsers). */
  | 'unsupported-runtime'
  /** The file is over one of the extraction limits (pages, text runs, operators, time). */
  | 'too-large'
  /** The file could not be parsed as a PDF. */
  | 'unreadable'
  /** A page has no text layer and no images. */
  | 'no-text'
  /** A page has images but no text layer: a scan or a rendered picture of the invoice. */
  | 'image-only'
  /** A page's text is mojibake: control, private-use or replacement characters, or too few letters and digits. */
  | 'garbled-text'
  /** Swedish words appear with å, ä or ö dropped or replaced. */
  | 'missing-diacritics';

export interface UnsupportedReason {
  code: UnsupportedCode;
  /** 1-based page number; absent for reasons about the whole file. */
  page?: number;
  detail: string;
}

export interface TextQuality {
  supported: boolean;
  reasons: UnsupportedReason[];
}

/** Common invoice words spelled with å, ä or ö; generic vocabulary, not taken from any document. */
const DIACRITIC_WORDS = [
  'förfallodatum',
  'förfallodag',
  'fakturaförfrågan',
  'vår referens',
  'godkänd',
  'dröjsmålsränta',
  'ränta',
  'öresavrundning',
  'påminnelse',
  'säljare',
  'köpare',
  'mängd',
  'märkning',
  'övrigt',
  'säte',
];

/** Each å/ä/ö may come out as a/o, another non-letter, mojibake ("Ã¤") or nothing at all. */
const deformed = DIACRITIC_WORDS.map(
  (word) =>
    new RegExp(
      `(?<![\\p{L}\\p{N}])${[...word].map((ch) => (/[åäö]/.test(ch) ? '(?:Ã.|[aoAO]|[^\\p{L}\\p{N}])?' : ch)).join('')}(?![\\p{L}\\p{N}])`,
      'iu',
    ),
);

// C0/C1 controls, private use, replacement character, unassigned code points.
const SUSPICIOUS = /[\p{Cc}\p{Co}\p{Cn}�]/u;
const MIN_CHARS = 20;

function garbled(text: string): string | undefined {
  // Leaders ("......", "‥‥‥") are punctuation drawn as text, not mojibake.
  const chars = [...text.replace(/([^\p{L}\p{N}\s])\1{2,}/gu, '').replace(/\s+/g, '')];
  if (chars.length < MIN_CHARS) return undefined;
  const suspicious = chars.filter((c) => SUSPICIOUS.test(c)).length / chars.length;
  const alnum = chars.filter((c) => /[\p{L}\p{N}]/u.test(c)).length / chars.length;
  if (suspicious > 0.05) return `${Math.round(suspicious * 100)}% control, private-use or replacement characters`;
  if (alnum < 0.5) return `only ${Math.round(alnum * 100)}% letters and digits`;
  return undefined;
}

export function checkQuality(pages: LayoutPage[]): TextQuality {
  const reasons: UnsupportedReason[] = [];
  for (const page of pages) {
    const text = page.runs.map((r) => r.text).join(' ');
    const type3 = page.fonts.filter((f) => f.type3).length ? ' (Type3 font on page)' : '';
    if (!text.trim()) {
      reasons.push(
        page.imageCoverage > 0
          ? {
              code: 'image-only',
              page: page.number,
              detail: `No text layer; images cover ${Math.round(page.imageCoverage * 100)}% of the page`,
            }
          : { code: 'no-text', page: page.number, detail: 'No text layer and no images' },
      );
      continue;
    }
    const why = garbled(text);
    if (why) reasons.push({ code: 'garbled-text', page: page.number, detail: why + type3 });
    else {
      const words = deformed.filter((re) => re.test(text)).length;
      if (words) reasons.push({ code: 'missing-diacritics', page: page.number, detail: `${words} Swedish word(s) without å/ä/ö` });
    }
  }
  return { supported: reasons.length === 0, reasons };
}
