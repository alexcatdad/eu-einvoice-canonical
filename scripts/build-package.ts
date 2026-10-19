/** Keep modules unbundled so optional validators and their relative asset paths remain intact. */
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { assertNpmBundleFiles } from './validation-distribution.js';

const root = join(import.meta.dir, '..');
assertNpmBundleFiles(root);
rmSync(join(root, 'lib'), { recursive: true, force: true });
const compiler = Bun.spawnSync(['bun', 'x', '--no-install', 'tsc', '-p', 'tsconfig.build.json'], {
  cwd: root,
  stdout: 'inherit',
  stderr: 'inherit',
});
if (compiler.exitCode !== 0) process.exit(compiler.exitCode);
mkdirSync(join(root, 'lib/react'), { recursive: true });
cpSync(join(root, 'src/react/invoice.css'), join(root, 'lib/react/invoice.css'));
