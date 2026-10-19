/** Fetch a pinned build input; callers verify the downloaded bytes against their source hash. */
export async function fetchSource(url: string): Promise<Response> {
  try {
    return await fetch(url);
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'TooManyRedirects') throw error;
    // Some upstream servers loop for Bun's HTTP client. Retain the URL and the caller's hash verification.
    const child = Bun.spawn(
      ['curl', '--disable', '--fail', '--silent', '--show-error', '--location', '--max-redirs', '10', '--max-time', '60', url],
      {
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    const [bytes, stderr, status] = await Promise.all([
      new Response(child.stdout).arrayBuffer(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (status !== 0) throw new Error(`Source download failed: ${url}: ${stderr.trim()}`);
    return new Response(bytes);
  }
}
