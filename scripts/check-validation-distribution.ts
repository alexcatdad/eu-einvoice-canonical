/** Check the reviewable Git candidate as well as npm's explicit release inventory. */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { approvedBundleIds, assertNpmBundleFiles, loadDistribution } from './validation-distribution.js';

const root = join(import.meta.dir, '..');
assertNpmBundleFiles(root);
const approved = new Set(approvedBundleIds(root));
const dockerIgnores = new Set(readFileSync(join(root, '.dockerignore'), 'utf8').split('\n'));
for (const [id, decision] of Object.entries(loadDistribution(root).bundles))
  if (!decision.publish && !dockerIgnores.has(`validation/bundles/${id}`))
    throw new Error(`Held artifact is not excluded from the Docker build context: ${id}`);
const listed = Bun.spawnSync(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard', 'validation/bundles'], { cwd: root });
if (listed.exitCode) throw new Error(listed.stderr.toString());
for (const file of listed.stdout.toString().split('\0').filter(Boolean)) {
  const id = file.split('/')[2];
  if (!approved.has(id)) throw new Error(`Undistributed artifact present in Git candidate: ${file}`);
}
console.log(`Git and npm candidates contain only ${approved.size} approved validation bundles.`);
