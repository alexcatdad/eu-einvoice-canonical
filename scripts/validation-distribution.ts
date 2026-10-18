/** One reviewed inventory controls which local validation artifacts may be distributed. */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';

interface DistributionDecision {
  publish: boolean;
  basis: string;
  evidence: string[];
  manifestSha256?: string;
}
export interface ValidationDistribution {
  version: 1;
  noticeSha256: string;
  licenseFiles: Record<string, string>;
  bundles: Record<string, DistributionDecision>;
}

export function loadDistribution(root: string): ValidationDistribution {
  const policy = JSON.parse(readFileSync(join(root, 'validation/distribution.json'), 'utf8'));
  if (policy?.version !== 1 || !policy.bundles || typeof policy.bundles !== 'object' || Array.isArray(policy.bundles))
    throw new Error('Invalid validation distribution policy');
  if (
    !/^[a-f0-9]{64}$/.test(policy.noticeSha256 ?? '') ||
    !policy.licenseFiles ||
    typeof policy.licenseFiles !== 'object' ||
    Array.isArray(policy.licenseFiles) ||
    !Object.keys(policy.licenseFiles).length ||
    Object.entries(policy.licenseFiles).some(
      ([name, hash]) => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash),
    )
  )
    throw new Error('Invalid distribution notice or license inventory');
  for (const [id, value] of Object.entries(policy.bundles)) {
    const decision = value as DistributionDecision | null;
    if (
      !/^[a-z0-9][a-z0-9._-]*$/.test(id) ||
      !decision ||
      typeof decision.publish !== 'boolean' ||
      typeof decision.basis !== 'string' ||
      !decision.basis.trim() ||
      !Array.isArray(decision.evidence) ||
      !decision.evidence.every((item) => typeof item === 'string' && item.trim()) ||
      (decision.publish && (!decision.evidence.length || !/^[a-f0-9]{64}$/.test(decision.manifestSha256 ?? '')))
    )
      throw new Error(`Invalid distribution decision: ${id}`);
  }
  return policy;
}

function verifyApprovedFiles(directory: string, id: string): void {
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  if (manifest.id !== id || !Array.isArray(manifest.files) || !manifest.files.length)
    throw new Error(`Invalid approved bundle manifest: ${id}`);
  const files = new Set<string>(['manifest.json']);
  for (const file of manifest.files) {
    if (
      typeof file.path !== 'string' ||
      file.path.split(/[\\/]/).some((part: string) => !part || part === '.' || part === '..') ||
      files.has(file.path)
    )
      throw new Error(`Invalid approved bundle file path: ${id}`);
    files.add(file.path);
  }
  const walk = (path: string, prefix = '') => {
    if (lstatSync(path).isSymbolicLink()) throw new Error(`Approved bundle contains a symbolic link: ${id}/${prefix}`);
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const file = prefix + entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Approved bundle contains a symbolic link: ${id}/${file}`);
      if (entry.isDirectory()) walk(join(path, entry.name), `${file}/`);
      else if (!entry.isFile() || !files.has(file)) throw new Error(`Unlisted approved bundle file: ${id}/${file}`);
    }
  };
  walk(directory);
  for (const file of manifest.files) {
    const bytes = readFileSync(join(directory, file.path));
    if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256)
      throw new Error(`Approved bundle file changed: ${id}/${file.path}`);
  }
}

export function approvedBundleIds(root: string): string[] {
  const policy = loadDistribution(root);
  const licenseDirectory = join(root, 'validation/licenses');
  if (lstatSync(licenseDirectory).isSymbolicLink()) throw new Error('Unreviewed distribution license file: symbolic directory');
  for (const name of readdirSync(licenseDirectory))
    if (!Object.hasOwn(policy.licenseFiles, name)) throw new Error(`Unreviewed distribution license file: ${name}`);
  for (const [name, hash] of [
    ['NOTICE', policy.noticeSha256],
    ...Object.entries(policy.licenseFiles).map(([name, hash]) => [`licenses/${name}`, hash]),
  ]) {
    const path = join(root, 'validation', name);
    if (!lstatSync(path).isFile() || createHash('sha256').update(readFileSync(path)).digest('hex') !== hash)
      throw new Error(`Distribution notice or license changed: ${name}`);
  }
  for (const id of readdirSync(join(root, 'validation/bundles')))
    if (!Object.hasOwn(policy.bundles, id)) throw new Error(`Unreviewed validation bundle: ${id}`);
  const ids = Object.keys(policy.bundles)
    .filter((id) => policy.bundles[id].publish)
    .sort();
  for (const id of ids)
    if (!existsSync(join(root, 'validation/bundles', id, 'manifest.json'))) throw new Error(`Missing approved validation bundle: ${id}`);
  for (const id of ids) {
    const digest = createHash('sha256')
      .update(readFileSync(join(root, 'validation/bundles', id, 'manifest.json')))
      .digest('hex');
    if (digest !== policy.bundles[id].manifestSha256) throw new Error(`Approved manifest changed: ${id}`);
    verifyApprovedFiles(join(root, 'validation/bundles', id), id);
  }
  return ids;
}

/** Resolve existing parent links before comparing an output directory with source assets. */
function physicalPath(path: string): string {
  const absolute = resolve(path);
  if (existsSync(absolute)) return realpathSync(absolute);
  return join(physicalPath(dirname(absolute)), basename(absolute));
}

/** Destination is an owned output bundles directory, never the source directory. */
export function copyPublishedBundles(root: string, destination: string): string[] {
  const source = physicalPath(join(root, 'validation/bundles'));
  const target = physicalPath(destination);
  const nested = (a: string, b: string) => a === b || a.startsWith(b.endsWith(sep) ? b : b + sep);
  if (nested(source, target) || nested(target, source)) throw new Error('Distribution output overlaps source');
  const ids = approvedBundleIds(root);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  for (const id of ids) cpSync(join(root, 'validation/bundles', id), join(target, id), { recursive: true });
  return ids;
}

/** Replace only the CLI-owned sidecars; other platform executables in the output survive. */
export function prepareCliSidecars(root: string, output: string): void {
  const target = physicalPath(output);
  const project = physicalPath(root);
  const contains = (parent: string, child: string) => parent === child || child.startsWith(parent.endsWith(sep) ? parent : parent + sep);
  const inputs = ['validation', 'src', 'scripts', 'schemas', 'trust', 'node_modules'].map((name) => physicalPath(join(root, name)));
  if (contains(target, project) || inputs.some((input) => contains(input, target) || contains(target, input)))
    throw new Error('CLI output overlaps project inputs');
  for (const name of ['validation', 'runtime', 'node_modules']) rmSync(join(target, name), { recursive: true, force: true });
}

/** npm's explicit files list is reviewed in Git; prepack checks it and never rewrites it. */
export function assertNpmBundleFiles(root: string): void {
  const expected = approvedBundleIds(root).map((id) => `validation/bundles/${id}`);
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const allowed = new Set([
    ...expected,
    'lib',
    'schemas',
    'validation/NOTICE',
    'validation/licenses',
    'validation/distribution.json',
    'trust/eu-trust-snapshot.json',
    'README.md',
    'LICENSE',
  ]);
  if (!Array.isArray(pkg.files) || pkg.files.some((entry: unknown) => typeof entry !== 'string' || !allowed.has(entry)))
    throw new Error('npm validation bundle files differ from the reviewed distribution inventory');
  for (const path of ['validation/NOTICE', 'validation/licenses', 'validation/distribution.json'])
    if (!pkg.files.includes(path)) throw new Error(`npm must include ${path}`);
  const actual: string[] = (pkg.files ?? []).filter((entry: string) => entry.startsWith('validation/bundles')).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected) || (pkg.files ?? []).includes('validation'))
    throw new Error('npm validation bundle files differ from the reviewed distribution inventory');
}

if (import.meta.main) {
  const [root, destination] = Bun.argv.slice(2);
  if (!root || !destination || Bun.argv.length !== 4)
    throw new Error('Usage: validation-distribution.ts <project-root> <output-bundles-directory>');
  console.log(`Staged ${copyPublishedBundles(root, destination).length} approved validation bundles`);
}
