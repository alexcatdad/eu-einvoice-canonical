/** Compile the CLI and place its portable validator assets beside the executable. */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { approvedBundleIds, copyPublishedBundles, prepareCliSidecars } from './validation-distribution.js';

const root = join(import.meta.dir, '..');
let outfile = resolve(root, process.platform === 'win32' ? 'dist/einvoice.exe' : 'dist/einvoice');
const flags: string[] = [];
for (let i = 2; i < Bun.argv.length; i++) {
  const option = Bun.argv[i];
  const value = Bun.argv[++i];
  if (!value || (option !== '--target' && option !== '--outfile'))
    throw new Error('Usage: build-cli.ts [--target bun-platform-arch] [--outfile path]');
  if (option === '--outfile') outfile = resolve(value);
  else flags.push('--target', value);
}
approvedBundleIds(root);
prepareCliSidecars(root, dirname(outfile));
const result = Bun.spawnSync(
  ['bun', 'build', '--compile', '--external', 'xmllint-wasm', '--external', 'saxon-js', ...flags, 'src/cli.ts', '--outfile', outfile],
  {
    cwd: root,
    stdout: 'inherit',
    stderr: 'inherit',
  },
);
if (result.exitCode !== 0) process.exit(result.exitCode);
const output = dirname(outfile);
mkdirSync(join(output, 'validation'), { recursive: true });
mkdirSync(join(output, 'node_modules'), { recursive: true });
copyPublishedBundles(root, join(output, 'validation/bundles'));
cpSync(join(root, 'validation/NOTICE'), join(output, 'validation/NOTICE'));
cpSync(join(root, 'validation/distribution.json'), join(output, 'validation/distribution.json'));
cpSync(join(root, 'validation/licenses'), join(output, 'validation/licenses'), { recursive: true });
approvedBundleIds(output);
// xmllint needs its real sibling worker/WASM. Saxon needs a separate CommonJS engine bundle.
cpSync(join(root, 'node_modules/xmllint-wasm'), join(output, 'node_modules/xmllint-wasm'), { recursive: true });
mkdirSync(join(output, 'runtime'), { recursive: true });
const saxon = Bun.spawnSync(
  [
    'bun',
    'build',
    'src/validation/schematron-worker.ts',
    '--target',
    'node',
    '--format',
    'cjs',
    '--outfile',
    join(output, 'runtime/schematron-worker.cjs'),
  ],
  {
    cwd: root,
    stdout: 'inherit',
    stderr: 'inherit',
  },
);
if (saxon.exitCode !== 0) process.exit(saxon.exitCode);
// Retain the license and version metadata for every package included in that engine bundle.
const copied = new Map<string, string>();
function copyDependency(name: string, from: string) {
  const require = createRequire(join(from, 'package.json'));
  let directory: string;
  try {
    directory = dirname(require.resolve(`${name}/package.json`));
  } catch {
    directory = dirname(require.resolve(name));
  }
  while (!existsSync(join(directory, 'package.json')) || JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')).name !== name) {
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`Cannot locate package ${name}`);
    directory = parent;
  }
  directory = realpathSync(directory);
  const before = copied.get(name);
  if (before) {
    if (before !== directory) throw new Error(`Conflicting runtime dependency versions: ${name}`);
    return;
  }
  copied.set(name, directory);
  const destination = join(output, 'runtime/licenses', name);
  mkdirSync(destination, { recursive: true });
  for (const file of readdirSync(directory))
    if (/^(license|copying|notice)/i.test(file) || file === 'package.json')
      cpSync(join(directory, file), join(destination, file), { recursive: true });
  const pkg = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  for (const dependency of Object.keys(pkg.dependencies ?? {})) copyDependency(dependency, directory);
}
copyDependency('saxon-js', root);
