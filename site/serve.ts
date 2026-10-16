/**
 * Serves dist/ the way GitHub Pages does, under the same base path, for local testing:
 *   bun run serve:site [port]    then open http://localhost:4173/eu-einvoice-canonical/
 */
import { join, normalize } from 'node:path';
import { BASE } from './site.js';

const dir = join(import.meta.dir, '..', 'dist');
const port = Number(process.argv[2] ?? process.env.PORT ?? 4173);
Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith(BASE)) return Response.redirect(new URL(BASE, url), 302);
    const path = normalize(decodeURIComponent(url.pathname.slice(BASE.length - 1))).replace(/^(\.\.[/\\])+/, '');
    let file = Bun.file(join(dir, path.endsWith('/') ? `${path}index.html` : path));
    if (!(await file.exists()) && !/\.[a-z0-9]+$/i.test(path)) {
      // GitHub Pages answers /docs/cli with a redirect to /docs/cli/.
      if (await Bun.file(join(dir, path, 'index.html')).exists()) return Response.redirect(new URL(`${url.pathname}/`, url), 301);
    }
    if (await file.exists()) return new Response(file);
    file = Bun.file(join(dir, '404.html'));
    return new Response((await file.exists()) ? file : 'Not found', { status: 404, headers: { 'Content-Type': 'text/html' } });
  },
});
console.log(`Serving ${dir} on http://localhost:${port}${BASE}`);
