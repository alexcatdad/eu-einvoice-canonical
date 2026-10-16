/**
 * Renders the "Real-world results" page from a downloaded corpus report and links it from the site's
 * coverage section.
 *
 *   bun scripts/corpus-page.ts <corpus-report.json> <dist/corpus.html> [dist/index.html]
 *
 * The link replaces the `<!--corpus-link-->` marker in index.html; without a report the marker stays an
 * invisible comment, so a build with no corpus run yet simply has no link and no page.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { type CorpusReport, linkHtml, renderHtml } from './corpus-lib.js';

const [input, output, index] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: bun scripts/corpus-page.ts <corpus-report.json> <output.html> [index.html]');
  process.exit(2);
}
const report = JSON.parse(readFileSync(input, 'utf8')) as CorpusReport;
writeFileSync(output, renderHtml(report));
if (index) writeFileSync(index, readFileSync(index, 'utf8').replace('<!--corpus-link-->', linkHtml(report)));
console.log(`Wrote ${output}`);
