/** Rule layers over the generic rules: bundled generator profiles and caller-supplied issuer templates. */
import visma from '../profiles/visma.json' with { type: 'json' };
import { loadPdfRuleSet } from './load.js';
import type { PdfRuleSet } from './types.js';

export { applyRules } from './apply.js';
export { loadPdfRuleSet, PDFJS_VERSION, PdfRuleError } from './load.js';
export type * from './types.js';

/** Generator profiles shipped with the library: software products' layouts, no issuer's data. */
export const BUNDLED_PROFILES: readonly PdfRuleSet[] = [visma].map(loadPdfRuleSet);
