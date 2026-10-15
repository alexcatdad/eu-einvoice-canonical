/**
 * Loads the pinned validator bundles under validation/bundles/<id>/.
 * Every file is checked against the SHA-256 in the bundle's manifest before use, so a truncated
 * or tampered download makes the layer 'unavailable' instead of producing a wrong verdict.
 */
import { sha256Hex } from '../hash.js';

export interface BundleFile {
  path: string;
  sha256: string;
  bytes: number;
}

export interface BundleManifest {
  id: string;
  title: string;
  layer: 'schema' | 'semantic' | 'profile';
  syntax: 'ubl' | 'cii';
  version: string;
  releaseDate: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  license: string;
  upstream: string;
  format: 'xsd' | 'sef';
  /** XSD bundles: root element local name -> main schema file. */
  entries?: Record<string, string>;
  /** Schematron bundles: the gzipped SaxonJS SEF. */
  entry?: string;
  files: BundleFile[];
}

/** Returns the bytes of validation/bundles/<bundleId>/<path>. */
export type BundleReader = (bundleId: string, path: string) => Promise<Uint8Array>;

export interface BundleSource {
  /** Where bundles are fetched from: a URL ending in '/', or a custom reader. Default: the validation/bundles directory next to this package. */
  baseUrl?: string | URL;
  read?: BundleReader;
}

const isNodeLike = () => typeof process !== 'undefined' && !!process.versions?.node;

export function defaultReader(baseUrl?: string | URL): BundleReader {
  const base = new URL(baseUrl ?? '../../validation/bundles/', import.meta.url);
  return async (bundleId, path) => {
    const url = new URL(`${bundleId}/${path}`, base);
    if (url.protocol === 'file:' && isNodeLike()) {
      // Computed specifiers keep browser bundlers from pulling in node:fs.
      const fsSpecifier = 'node:fs/promises';
      const urlSpecifier = 'node:url';
      const { readFile } = await import(fsSpecifier);
      const { fileURLToPath } = await import(urlSpecifier);
      return new Uint8Array(await readFile(fileURLToPath(url)));
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  };
}

const manifests = new Map<string, Promise<BundleManifest>>();
const verified = new Map<string, Promise<Uint8Array>>();

function memo<T>(cache: Map<string, Promise<T>>, key: string, make: () => Promise<T>): Promise<T> {
  let p = cache.get(key);
  if (!p) {
    p = make();
    cache.set(key, p);
    // A failure must not stick: the next call may succeed (network back, file restored).
    p.catch(() => cache.delete(key));
  }
  return p;
}

export class BundleReaderFor {
  constructor(private readonly read: BundleReader, private readonly scope: string) {}

  manifest(id: string): Promise<BundleManifest> {
    return memo(manifests, `${this.scope}|${id}`, async () => {
      const m = JSON.parse(new TextDecoder().decode(await this.read(id, 'manifest.json'))) as BundleManifest;
      if (m.id !== id) throw new Error(`Bundle ${id}: manifest says ${m.id}`);
      return m;
    });
  }

  /** A manifest-listed file, verified against its hash. */
  async file(id: string, path: string): Promise<Uint8Array> {
    const manifest = await this.manifest(id);
    const listed = manifest.files.find((f) => f.path === path);
    if (!listed) throw new Error(`Bundle ${id}: ${path} is not in the manifest`);
    return memo(verified, `${this.scope}|${id}|${path}`, async () => {
      const bytes = await this.read(id, path);
      const sha = await sha256Hex(bytes);
      if (sha !== listed.sha256) throw new Error(`Bundle ${id}: ${path} does not match its manifest hash`);
      return bytes;
    });
  }
}
