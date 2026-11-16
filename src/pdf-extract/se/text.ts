/** Text normalisation shared by the Swedish matchers. */

/**
 * NFC (PDFs can emit a decomposed å), Swedish lower case, every space variant and run of
 * whitespace folded to one ASCII space, trimmed. Indices into the result are what the
 * matchers report.
 */
export function normalize(text: string): string {
  return text.normalize('NFC').toLocaleLowerCase('sv').replace(/\s+/gu, ' ').trim();
}

/** Builds a matcher that only accepts whole words: no letter or digit directly before or after. */
export function wordRegExp(source: string, flags = 'gu'): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${source})(?![\\p{L}\\p{N}])`, flags);
}
