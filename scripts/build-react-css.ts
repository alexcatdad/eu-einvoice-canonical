/**
 * Writes src/react/invoice.css, the stylesheet of the React component, from INVOICE_CSS (src/render/style.ts),
 * which renderHtml inlines. One source, so the HTML rendering and the component look the same.
 *   bun scripts/build-react-css.ts           write it
 *   bun scripts/build-react-css.ts --check   fail if the committed file differs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { reactCss } from '../src/render/style.js';

const out = join(import.meta.dir, '..', 'src', 'react', 'invoice.css');
if (process.argv.includes('--check')) {
  if (readFileSync(out, 'utf8') !== reactCss()) {
    console.error('src/react/invoice.css is out of date: run bun run build:react-css');
    process.exit(1);
  }
} else writeFileSync(out, reactCss());
