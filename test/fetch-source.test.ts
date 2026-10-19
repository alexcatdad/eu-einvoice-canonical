import { afterAll, expect, test } from 'bun:test';
import { fetchSource } from '../scripts/fetch-source.js';

let curlRequests = 0;
const server = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  fetch(request) {
    const path = new URL(request.url).pathname;
    const curl = request.headers.get('user-agent')?.startsWith('curl/');
    if (curl) curlRequests++;
    if (path.startsWith('/fallback-')) {
      if (!curl) return Response.redirect(request.url, 302);
      const status = Number(path.slice('/fallback-'.length));
      return new Response(status === 204 ? null : new Uint8Array([0, 255, 10, 53, 48, 51]), { status });
    }
    if (path === '/native-redirect-loop' && !curl) return Response.redirect(request.url, 302);
    if (path === '/always-redirect-loop') return Response.redirect(request.url, 302);
    if (path === '/missing') return new Response('missing', { status: 404 });
    return new Response('synthetic pinned archive bytes');
  },
});
afterAll(() => server.stop(true));

test('source downloads recover from a native-fetch redirect loop using the same URL', async () => {
  const url = `${server.url}native-redirect-loop`;
  await expect(fetch(url)).rejects.toMatchObject({ code: 'TooManyRedirects' });
  const response = await fetchSource(url);
  expect(response.ok).toBe(true);
  expect(await response.text()).toBe('synthetic pinned archive bytes');
  expect(curlRequests).toBe(1);
});

test('ordinary fetch responses, including HTTP errors, do not invoke curl', async () => {
  const before = curlRequests;
  expect(await (await fetchSource(String(server.url))).text()).toBe('synthetic pinned archive bytes');
  const response = await fetchSource(`${server.url}missing`);
  expect(response.status).toBe(404);
  expect(await response.text()).toBe('missing');
  expect(curlRequests).toBe(before);
});

test('a redirect loop that also affects curl fails within the redirect bound', async () => {
  await expect(fetchSource(`${server.url}always-redirect-loop`)).rejects.toThrow();
});

for (const status of [200, 503, 404, 204]) {
  test(`redirect recovery preserves HTTP ${status} for the caller's retry/error handling`, async () => {
    const response = await fetchSource(`${server.url}fallback-${status}`);
    expect(response.status).toBe(status);
    const body = new Uint8Array(await response.arrayBuffer());
    expect(body).toEqual(status === 204 ? new Uint8Array() : new Uint8Array([0, 255, 10, 53, 48, 51]));
  });
}
