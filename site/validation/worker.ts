import { gunzipSync } from 'fflate';
import { validate } from '../../src/validation/index.js';
import { forValidator } from '../../src/validation/schema.js';
import { parseSvrl } from '../../src/validation/svrl.js';

declare const VALIDATION_MANIFEST_DIGESTS: Record<string, string>;
const engines = new Set<Worker>();
const host = globalThis as unknown as { onmessage: (event: MessageEvent) => void; postMessage: (message: unknown) => void };
function execute(url: string, message: unknown, module = false): Promise<{ value: string; exitCode: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const engine = new Worker(url, module ? { type: 'module' } : undefined);
    engines.add(engine);
    const finish = () => {
      engines.delete(engine);
      engine.terminate();
    };
    engine.onmessage = ({ data }) => {
      finish();
      data.error ? reject(new Error(data.error)) : resolve(data);
    };
    engine.onerror = (event) => {
      finish();
      reject(new Error(event.message || 'Validation engine failed'));
    };
    engine.postMessage(message);
  });
}
host.onmessage = async ({ data }) => {
  if (data.cancel) {
    for (const engine of engines) engine.terminate();
    engines.clear();
    host.postMessage({ cancelled: true });
    return;
  }
  try {
    if (new TextEncoder().encode(data.xml).length > 10 * 1024 * 1024)
      throw new Error('Local validation supports XML up to 10 MiB. Use the CLI for this document.');
    const value = await validate({ xml: data.xml }, data.detection, {
      suite: data.suite,
      bundles: {
        read: async (id, path) => {
          if (!VALIDATION_MANIFEST_DIGESTS[id] || path.split('/').some((part) => part === '..'))
            throw new Error('Unpackaged validation asset');
          const response = await fetch(`${data.base}validation/bundles/${id}/${path}`);
          if (!response.ok) throw new Error(`Validation asset HTTP ${response.status}`);
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (path === 'manifest.json') {
            const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
              b.toString(16).padStart(2, '0'),
            ).join('');
            if (digest !== VALIDATION_MANIFEST_DIGESTS[id]) throw new Error('Validation manifest does not match this application build');
          }
          return bytes;
        },
      },
      runners: {
        schema: async (bundles, id, xml, rootName) => {
          const manifest = await bundles.manifest(id);
          const entry = manifest.entries?.[rootName];
          if (!entry) throw new Error(`No schema for <${rootName}>`);
          const files = await Promise.all(
            manifest.files.map(async (file) => ({ fileName: file.path, contents: await bundles.file(id, file.path) })),
          );
          const result = await execute(
            `${data.base}validation/runtime/xmllint-browser.mjs`,
            {
              'xmllint-wasm': true,
              inputFiles: [{ fileName: 'invoice.xml', contents: forValidator(xml) }, ...files],
              args: ['--nonet', '--schema', entry, '--noout', 'invoice.xml'],
              initialMemory: 256,
              maxMemory: 4096,
            },
            true,
          );
          if (result.exitCode === 0) return [];
          if (![3, 4].includes(result.exitCode)) throw new Error(result.stderr || 'XSD engine failed');
          return [{ layer: 'schema', severity: 'fatal', message: result.stderr || 'XSD validation failed' }];
        },
        schematron: async (bundles, id, layer, xml) => {
          const manifest = await bundles.manifest(id);
          // Send JSON text: deeply nested SEF objects can deserialize as null in browser Worker structured cloning.
          const stylesheet = new TextDecoder().decode(gunzipSync(await bundles.file(id, manifest.entry!)));
          const result = await execute(`${data.base}validation/runtime/saxon-worker.js`, { stylesheet, xml: forValidator(xml) });
          return parseSvrl(result.value, layer);
        },
      },
    });
    host.postMessage({ value });
  } catch (error) {
    host.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
