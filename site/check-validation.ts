/** Run the browser validation gates against the built static artifact under the production base path. */
import { join, normalize } from 'node:path';
import { BASE } from './site.js';

const dist = join(import.meta.dir, '..', 'dist');
const server = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  async fetch(request) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(BASE)) return new Response('Not found', { status: 404 });
    const path = normalize(decodeURIComponent(url.pathname.slice(BASE.length - 1))).replace(/^(\.\.[/\\])+/, '');
    const file = Bun.file(join(dist, path.endsWith('/') ? `${path}index.html` : path));
    return (await file.exists()) ? new Response(file) : new Response('Not found', { status: 404 });
  },
});
try {
  for (const script of process.argv.length > 2
    ? process.argv.slice(2)
    : ['validation-acceptance.ts', 'facturx-validation-acceptance.ts', 'edition-selection-acceptance.ts', 'validation-faults.ts']) {
    const child = Bun.spawn(['bun', join(import.meta.dir, script)], {
      stdout: 'inherit',
      stderr: 'inherit',
      env: { ...Bun.env, VALIDATION_SITE_URL: `http://127.0.0.1:${server.port}${BASE}` },
    });
    if (await child.exited) throw new Error(`${script} failed`);
  }
} finally {
  await server.stop(true);
}
