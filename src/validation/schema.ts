import type { BundleReaderFor } from './bundles.js';
import type { Finding } from './types.js';

/** xmllint reads UTF-8 only; the payload is already decoded, so drop a BOM and the declared encoding. */
export function forValidator(xml: string): string {
  const s = xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml;
  return s.replace(/^(\s*<\?xml\b[^?]*?)\s+encoding\s*=\s*("[^"]*"|'[^']*')/, '$1');
}

export async function runSchema(bundles: BundleReaderFor, bundleId: string, xml: string, rootName: string): Promise<Finding[]> {
  const manifest = await bundles.manifest(bundleId);
  const entry = manifest.entries?.[rootName];
  if (!entry) throw new NotApplicable(`${bundleId} has no schema for <${rootName}>`);
  // The main schema and the modules it imports are preloaded into xmllint's in-memory file system.
  const files = await Promise.all(manifest.files.map(async (f) => ({ fileName: f.path, contents: await bundles.file(bundleId, f.path) })));
  // Compiled executables keep worker/WASM files beside the binary, outside Bun's virtual module tree.
  let runtime: string | undefined;
  if (import.meta.url.includes('/$bunfs/') || import.meta.url.includes('/~BUN/')) {
    const urlSpecifier = 'node:url';
    const { pathToFileURL } = await import(urlSpecifier);
    runtime = new URL('./node_modules/xmllint-wasm/index-node.js', pathToFileURL(process.execPath)).href;
  }
  const { validateXML, memoryPages }: typeof import('xmllint-wasm') = runtime
    ? await import(/* @vite-ignore */ runtime)
    : await import('xmllint-wasm');
  const result = await validateXML({
    xml: [{ fileName: 'invoice.xml', contents: forValidator(xml) }],
    schema: [files.find((f) => f.fileName === entry)!],
    preload: files.filter((f) => f.fileName !== entry),
    maxMemoryPages: memoryPages.defaultMaxMemoryPages * 8,
  });
  if (result.valid) return [];
  return result.errors.map((e) => ({
    layer: 'schema',
    severity: 'fatal' as const,
    message: e.loc ? `${e.message} (line ${e.loc.lineNumber})` : e.message || e.rawMessage,
  }));
}

/** The bundle exists but does not cover this document, which is not a failure of the document. */
export class NotApplicable extends Error {
  override name = 'NotApplicable';
}
