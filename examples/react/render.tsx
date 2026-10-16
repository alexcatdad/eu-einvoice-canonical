/**
 * Server-renders an invoice with the React component and writes a standalone HTML page.
 *   bun examples/react/render.tsx <invoice.xml|pdf|zip> [lang] > invoice.html
 * Not part of the site build; it shows the component the way an app would use it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { convert } from '../../src/index.js';
import { Invoice } from '../../src/react/index.js';

const [file, lang = 'en'] = process.argv.slice(2);
if (!file) {
  console.error('usage: bun examples/react/render.tsx <invoice file> [lang]');
  process.exit(2);
}
const result = await convert(new Uint8Array(readFileSync(file)), file);
const invoices = result.outcomes.flatMap((o) => (o.status === 'ok' ? o.invoices : []));
if (invoices.length === 0) {
  console.error('no invoice found');
  process.exit(1);
}
const css = readFileSync(join(import.meta.dir, '../../src/react/invoice.css'), 'utf8');
const body = renderToStaticMarkup(
  <main>
    {invoices.map((inv, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: a static list; ids may repeat across files
      <Invoice key={i} invoice={inv} lang={lang} />
    ))}
  </main>,
);
process.stdout.write(
  `<!doctype html><html lang="${lang.replace(/[^A-Za-z0-9-]/g, '')}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><title>Invoice</title>` +
    `<style>${css}</style></head><body>${body}</body></html>\n`,
);
