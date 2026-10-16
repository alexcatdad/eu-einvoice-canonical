/**
 * Every padding, margin and gap in the site stylesheet and the invoice renderer comes from one spacing scale,
 * so the pages keep one rhythm. Allowed: 0, auto, a step of the scale (negated with calc(-1 * ...)), and
 * hairlines of 1px or less.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INVOICE_CSS } from '../src/render/style.js';

const SCALE = [4, 8, 12, 16, 24, 32, 48, 64];
const siteCss = readFileSync(join(import.meta.dir, '..', 'site', 'style.css'), 'utf8');

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

describe('spacing scale', () => {
  test('the site defines the scale once, on :root', () => {
    const steps = [...siteCss.matchAll(/--space-(\d):\s*(\d+)px;/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(steps).toEqual(SCALE.map((px, i) => [i + 1, px]));
  });

  test('site/style.css uses only scale steps for padding, margin and gap', () => {
    expect(offScale(siteCss, /var\(--space-[1-8]\)/g)).toEqual([]);
  });

  test('the renderer uses only scale steps, each with its own pixel value as the fallback', () => {
    expect(offScale(INVOICE_CSS, /var\(--einvoice-space-[1-8], \d+px\)/g)).toEqual([]);
    for (const m of INVOICE_CSS.matchAll(/var\(--einvoice-space-([1-8]), (\d+)px\)/g)) {
      expect(Number(m[2])).toBe(SCALE[Number(m[1]) - 1]!);
    }
  });

  test('the guard catches an off-scale value', () => {
    expect(offScale('.x { padding: 0.45rem 1rem; margin: 0 auto; gap: 1px; }', /var\(--space-[1-8]\)/g)).toEqual(['padding: 0.45rem 1rem']);
  });
});
