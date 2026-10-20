/** Fetch a pinned build input; callers verify the downloaded bytes against their source hash. */
export async function fetchSource(url: string): Promise<Response> {
  try {
    return await fetch(url);
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || (error.code !== 'TooManyRedirects' && error.code !== 'ECONNRESET')) throw error;
    // Recover native-client redirect loops or connection resets using the same URL and caller's hash verification.
    const child = Bun.spawn(
      [
        'curl',
        '--disable',
        '--silent',
        '--show-error',
        '--location',
        // Enable an in-memory cookie engine for session/load-balancer redirects; never write a cookie jar.
        '--cookie',
        '',
        '--max-redirs',
        '10',
        '--max-time',
        '60',
        '--write-out',
        '\n%{http_code}',
        url,
      ],
      {
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    const [buffer, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).arrayBuffer(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (exitCode !== 0) throw new Error(`Source download failed: ${url}: ${stderr.trim()}`);
    const bytes = new Uint8Array(buffer);
    const trailer = new TextDecoder().decode(bytes.subarray(-4));
    if (!/^\n[2-5]\d\d$/.test(trailer)) throw new Error(`Source download returned an invalid HTTP status: ${url}`);
    // Read only the fixed status trailer as text; archive bytes must remain untouched for hash verification.
    return new Response(bytes.length === 4 ? null : bytes.subarray(0, -4), { status: Number(trailer.slice(1)) });
  }
}
