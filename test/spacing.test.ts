/**
 * Every padding, margin and gap in the site's styles and the invoice renderer comes from one spacing scale, so the pages
 * keep one rhythm. Allowed: 0, auto, a step of the scale (negated with calc(-1 * ...)), and hairlines of 1px or less.
 * The site's styles are site/src/styles/*.css and the <style> blocks of its Astro components; the shadcn/ui components
 * use Tailwind, whose spacing unit the site sets to 4px, so their spacing classes must be steps of the same scale.
 */
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { INVOICE_CSS } from '../src/render/style.js';

const SCALE = [4, 8, 12, 16, 24, 32, 48, 64];
const src = join(import.meta.dir, '..', 'site', 'src');

function filesIn(dir: string, ext: RegExp): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== 'content') out.push(...filesIn(path, ext));
    } else if (ext.test(name)) out.push(path);
  }
  return out;
}

const theme = readFileSync(join(src, 'styles', 'theme.css'), 'utf8');
/** Each stylesheet and each Astro <style> block, by file. */
const sheets: [string, string][] = [
  ...filesIn(join(src, 'styles'), /\.css$/).map((f): [string, string] => [relative(src, f), readFileSync(f, 'utf8')]),
  ...filesIn(src, /\.astro$/).flatMap((f): [string, string][] =>
    [...readFileSync(f, 'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => [relative(src, f), m[1]!]),
  ),
];

/** Justified exceptions, as `selector-ish text: declaration`. Keep this short. */
const ALLOWED: string[] = [];

const DECL = /(?:^|[;{\s])((?:padding|margin)(?:-[a-z]+)*|gap|row-gap|column-gap)\s*:\s*([^;{}]+);/g;

function offScale(css: string, step: RegExp): string[] {
  const bad: string[] = [];
  for (const m of css.matchAll(DECL)) {
    const [, prop, value] = m;
    const rest = value!
      .trim()
      .replace(/calc\(-1 \* (var\([^()]+\))\)/g, '$1')
      .replace(step, '')
      .replace(/(^|\s)(0|auto|-?(0?\.\d+|1)px)(?=\s|$)/g, ' ')
      .trim();
    const decl = `${prop}: ${value!.trim()}`;
    if (rest && !ALLOWED.includes(decl)) bad.push(decl);
  }
  return bad;
}

/** Tailwind spacing classes (p-4, -mt-2, gap-x-3, md:px-6) whose value is not a step of the scale. */
function offScaleClasses(source: string): string[] {
  const steps = new Set(['0', 'px', ...SCALE.map((px) => String(px / 4))]);
  const bad: string[] = [];
  for (const m of source.matchAll(/(?<![\w-])-?((?:p|m)[xytrblse]?|gap(?:-[xy])?|space-[xy])-([\w.[\]/()%-]+)/g)) {
    const value = m[2]!;
    if (!steps.has(value)) bad.push(m[0]);
  }
  return bad;
}

describe('spacing scale', () => {
  test('the site defines the scale once, on :root', () => {
    const steps = [...theme.matchAll(/--space-(\d):\s*(\d+)px;/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(steps).toEqual(SCALE.map((px, i) => [i + 1, px]));
  });

  test('the site has styles to check', () => {
    expect(sheets.map(([f]) => f)).toContain('styles/converter.css');
    expect(sheets.map(([f]) => f)).toContain('components/Header.astro');
  });

  test.each(sheets.map(([f, css], i) => [`${f} #${i}`, css]))('%s uses only scale steps for padding, margin and gap', (_name, css) => {
    expect(offScale(css as string, /var\(--space-[1-8]\)/g)).toEqual([]);
  });

  test('Tailwind is set to the 4px unit, and the components use only steps of the scale', () => {
    expect(readFileSync(join(src, 'styles', 'converter.css'), 'utf8')).toMatch(/--spacing:\s*4px;/);
    for (const f of [...filesIn(join(src, 'components', 'ui'), /\.tsx$/), ...filesIn(join(src, 'converter'), /\.tsx$/)]) {
      const classes = [...readFileSync(f, 'utf8').matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})|cva\(\s*'([^']*)'|:\s*'([^']*)'/g)]
        .map((m) => m[1] ?? m[2] ?? m[3] ?? m[4] ?? '')
        .join(' ');
      expect({ file: relative(src, f), bad: offScaleClasses(classes) }).toEqual({ file: relative(src, f), bad: [] });
    }
  });

  test('the renderer uses only scale steps, each with its own pixel value as the fallback', () => {
    expect(offScale(INVOICE_CSS, /var\(--einvoice-space-[1-8], \d+px\)/g)).toEqual([]);
    for (const m of INVOICE_CSS.matchAll(/var\(--einvoice-space-([1-8]), (\d+)px\)/g)) {
      expect(Number(m[2])).toBe(SCALE[Number(m[1]) - 1]!);
    }
  });

  test('the guards catch an off-scale value', () => {
    expect(offScale('.x { padding: 0.45rem 1rem; margin: 0 auto; gap: 1px; }', /var\(--space-[1-8]\)/g)).toEqual(['padding: 0.45rem 1rem']);
    expect(offScaleClasses('px-4 py-1 gap-2 p-5 mt-[3px] gap-x-12')).toEqual(['p-5', 'mt-[3px]']);
  });
});
