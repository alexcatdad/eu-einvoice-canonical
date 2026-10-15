/** Serves dist/ for local testing: bun run site/serve.ts [port] */
import { join, normalize } from 'node:path';

const dir = join(import.meta.dir, '..', 'dist');
const port = Number(process.argv[2] ?? 4173);
Bun.serve({
  port,
  async fetch(req) {
    const path = normalize(decodeURIComponent(new URL(req.url).pathname)).replace(/^(\.\.[/\\])+/, '');
    const file = Bun.file(join(dir, path.endsWith('/') ? `${path}index.html` : path));
    return (await file.exists()) ? new Response(file) : new Response('Not found', { status: 404 });
  },
});
console.log(`Serving ${dir} on http://localhost:${port}`);
