import { gunzipSync } from 'fflate';
import type { BundleReaderFor } from './bundles.js';
import { forValidator } from './schema.js';
import { parseSvrl } from './svrl.js';
import type { Finding } from './types.js';

export { parseSvrl } from './svrl.js';

const sefs = new Map<string, Promise<unknown>>();

function loadSef(bundles: BundleReaderFor, bundleId: string, path: string, scope: string): Promise<unknown> {
  const key = `${scope}|${bundleId}`;
  let p = sefs.get(key);
  if (!p) {
    p = bundles.file(bundleId, path).then((gz) => JSON.parse(new TextDecoder().decode(gunzipSync(gz))));
    sefs.set(key, p);
    p.catch(() => sefs.delete(key));
  }
  return p;
}

/** Runs a Schematron that was compiled ahead of time to a SaxonJS SEF and returns the failed assertions. */
export async function runSchematron(
  bundles: BundleReaderFor,
  bundleId: string,
  layer: 'semantic' | 'profile',
  xml: string,
  scope: string,
): Promise<Finding[]> {
  const manifest = await bundles.manifest(bundleId);
  const stylesheet = await loadSef(bundles, bundleId, manifest.entry!, scope);
  // Computed import keeps the Node worker host out of browser adapters.
  const workerModule = 'node:worker_threads';
  const { Worker } = (await import(workerModule)) as typeof import('node:worker_threads');
  let workerUrl = new URL(import.meta.url.endsWith('.ts') ? './schematron-worker.ts' : './schematron-worker.js', import.meta.url);
  if (import.meta.url.includes('/$bunfs/') || import.meta.url.includes('/~BUN/')) {
    const urlModule = 'node:url';
    const { pathToFileURL } = await import(urlModule);
    workerUrl = new URL('./runtime/schematron-worker.cjs', pathToFileURL(process.execPath));
  }
  return new Promise<Finding[]>((resolve, reject) => {
    let settled = false;
    const worker = new Worker(workerUrl, {
      workerData: { stylesheet, xml: forValidator(xml) },
      stdout: true,
      stderr: true,
    });
    // Drain diagnostics privately; Saxon prints received values even when its caller catches the exception.
    worker.stdout?.resume();
    worker.stderr?.resume();
    worker.once('message', (result: { svrl?: string; error?: string }) => {
      settled = true;
      void worker.terminate();
      if (result.error || typeof result.svrl !== 'string') return reject(new Error('Schematron transformation failed'));
      try {
        resolve(parseSvrl(result.svrl, layer));
      } catch (error) {
        reject(error);
      }
    });
    worker.once('error', () => {
      void worker.terminate();
      reject(new Error('Schematron worker unavailable'));
    });
    worker.once('exit', () => {
      if (!settled) reject(new Error('Schematron worker stopped'));
    });
  });
}
