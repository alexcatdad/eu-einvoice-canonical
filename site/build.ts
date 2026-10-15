/**
 * Builds the static GitHub Pages site into dist/:
 *   bun run site/build.ts
 */
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const out = join(root, 'dist');
const SAMPLES = [
  'peppol-bis3-invoice.xml', 'peppol-bis3-creditnote.xml', 'xrechnung-ubl.xml', 'xrechnung-cii.xml',
  'facturx-en16931.pdf', 'facturx-basic-creditnote.xml', 'svefaktura-1.0.xml', 'anaf-download.zip',
  'hr-cius.xml', 'IT01234567890_FPR12.xml.p7m', 'ksef-fa3.xml',
];

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'samples'), { recursive: true });

const build = await Bun.build({
  entrypoints: [join(root, 'site/app.ts')],
  outdir: out,
  target: 'browser',
  minify: true,
  sourcemap: 'linked',
  naming: 'app.js',
});
if (!build.success) {
  for (const log of build.logs) console.error(log);
  process.exit(1);
}
cpSync(join(root, 'site/index.html'), join(out, 'index.html'));
cpSync(join(root, 'site/style.css'), join(out, 'style.css'));
for (const s of SAMPLES) cpSync(join(root, 'test/fixtures', s), join(out, 'samples', s));
console.log(`Built ${out} (${build.outputs.map((o) => `${o.path.split('/').pop()} ${(o.size / 1024).toFixed(0)} KB`).join(', ')})`);
