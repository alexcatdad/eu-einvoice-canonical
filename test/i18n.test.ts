import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LANGUAGES, normalizeLang, pickLanguage } from '../site/i18n.js';

const siteDir = join(import.meta.dir, '..', 'site');
const i18nDir = join(siteDir, 'i18n');

const load = (code: string): Record<string, string> => JSON.parse(readFileSync(join(i18nDir, `${code}.json`), 'utf8'));
const en = load('en');
const codes = readdirSync(i18nDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .sort();
const others = codes.filter((c) => c !== 'en');

/** The names of {placeholders} in a message, sorted. */
const placeholders = (msg: string) => [...msg.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('message catalogues', () => {
  test('there is one catalogue for each language the switcher offers', () => {
    expect(codes).toEqual(LANGUAGES.map((l) => l.code).sort());
  });

  test.each(others)('%s has exactly the keys of en.json', (code) => {
    const cat = load(code);
    const missing = Object.keys(en).filter((k) => !(k in cat));
    const extra = Object.keys(cat).filter((k) => !(k in en));
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  test.each(codes)('%s has no empty message', (code) => {
    const empty = Object.entries(load(code))
      .filter(([, v]) => typeof v !== 'string' || v.trim() === '')
      .map(([k]) => k);
    expect(empty).toEqual([]);
  });

  test.each(others)('%s keeps every {placeholder} of the English message', (code) => {
    const cat = load(code);
    const wrong = Object.keys(en)
      .filter((k) => k in cat && JSON.stringify(placeholders(cat[k])) !== JSON.stringify(placeholders(en[k])))
      .map((k) => `${k}: expected {${placeholders(en[k]).join('}, {')}} but found {${placeholders(cat[k]).join('}, {')}}`);
    expect(wrong).toEqual([]);
  });

  test.each(others)('%s keeps the HTML tags of the English message', (code) => {
    const cat = load(code);
    const tags = (msg: string) => [...msg.matchAll(/<\/?[a-z][^>]*>/g)].map((m) => m[0]).sort();
    const wrong = Object.keys(en).filter((k) => k in cat && JSON.stringify(tags(cat[k])) !== JSON.stringify(tags(en[k])));
    expect(wrong).toEqual([]);
  });
});

describe('message keys used by the site', () => {
  const files = readdirSync(siteDir).filter((f) => /\.(ts|html)$/.test(f));
  const namespaces = [...new Set(Object.keys(en).map((k) => k.split('.')[0]))];
  const literal = new RegExp(`(['"\`])((?:${namespaces.join('|')})\\.[A-Za-z0-9.-]+)\\1`, 'g');

  /** Every message key a file refers to, however it does so. */
  function keysIn(name: string): string[] {
    const src = readFileSync(join(siteDir, name), 'utf8');
    const keys: string[] = [];
    for (const m of src.matchAll(/\bt\(\s*(['"`])([^'"`$]+)\1/g)) keys.push(m[2]);
    for (const m of src.matchAll(/data-i18n(?:-html)?="([^"$]+)"/g)) keys.push(m[1]);
    for (const m of src.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const pair of m[1].split(';')) keys.push(pair.split(':')[1].trim());
    for (const m of src.matchAll(literal)) keys.push(m[2]);
    return keys;
  }

  test('the site has code to scan', () => {
    expect(files).toContain('app.ts');
    expect(files).toContain('index.html');
  });

  test.each(files)('every key used in %s exists in en.json', (name) => {
    const unknown = [...new Set(keysIn(name))].filter((k) => !(k in en));
    expect(unknown).toEqual([]);
  });
});

describe('language choice', () => {
  test('?lang= wins over the saved choice and the browser', () => {
    expect(pickLanguage({ search: '?lang=fr', stored: 'de', languages: ['it'] })).toBe('fr');
  });
  test('the saved choice wins over the browser', () => {
    expect(pickLanguage({ search: '', stored: 'de', languages: ['it'] })).toBe('de');
  });
  test('browser languages are tried in order, with regions ignored', () => {
    expect(pickLanguage({ languages: ['sv-SE', 'pl-PL', 'de'] })).toBe('pl');
  });
  test('an unsupported ?lang= falls through to the next source', () => {
    expect(pickLanguage({ search: '?lang=xx', stored: 'es' })).toBe('es');
  });
  test('English is the fallback', () => {
    expect(pickLanguage({})).toBe('en');
    expect(pickLanguage({ search: 'lang=', stored: 'zz', languages: ['ja', 'sv'] })).toBe('en');
  });
  test('language tags are normalised', () => {
    expect(normalizeLang('DE_at')).toBe('de');
    expect(normalizeLang('ro-RO')).toBe('ro');
    expect(normalizeLang('')).toBeUndefined();
    expect(normalizeLang(null)).toBeUndefined();
  });
});
