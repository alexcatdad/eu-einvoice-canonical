/** Reads what site/prepare.ts generated (page bodies, the corpus summary) at build time. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), '.generated');

export const generatedText = (name: string): string | undefined =>
  existsSync(join(dir, name)) ? readFileSync(join(dir, name), 'utf8') : undefined;

export function generatedJson<T>(name: string): T | undefined {
  const text = generatedText(name);
  return text === undefined ? undefined : (JSON.parse(text) as T);
}

/** The h2 headings of a generated body, for Starlight's "On this page". */
export function headingsOf(html: string): { depth: number; slug: string; text: string }[] {
  return [...html.matchAll(/<h2 id="([^"]+)">([^<]+)<\/h2>/g)].map((m) => ({ depth: 2, slug: m[1]!, text: m[2]! }));
}
