/** Execute independent positive/negative controls for every shipped validator bundle.
 * A new bundle requires evidence; this is not an assertion of all-rule coverage.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateSource } from '../src/index.js';
import type { ValidateOptions } from '../src/validation/index.js';
import type { Layer } from '../src/validation/plan.js';
import { selectValidationPlan, VALIDATION_SELECTORS } from '../src/validation/selectors.js';
import { checkSelectorEvidence, type SelectorEvidence, type UnsupportedEvidence } from './validation-selector-evidence.js';

interface Mutation {
  drop?: string;
  replace?: [string, string];
  layer: Layer;
  ruleId?: string;
}
interface Control {
  id: string;
  fixture: string;
  options?: Pick<ValidateOptions, 'scope' | 'suite'>;
  prepare?: [string, string][];
  bundles: Partial<Record<Layer, string>>;
  negatives: Mutation[];
  warnings?: { layer: Layer; ruleId: string }[];
}
const root = resolve(import.meta.dir, '..');
const casesPath = process.argv.includes('--cases')
  ? process.argv[process.argv.indexOf('--cases') + 1]
  : join(root, 'conformance/validation-cases.json');
const controls: Control[] = JSON.parse(readFileSync(casesPath, 'utf8'));
const bundles = readdirSync(join(root, 'validation/bundles'));
const covered = new Set<string>();
const ids = new Set<string>();
const problems: string[] = [];
for (const c of process.argv.includes('--selectors-only') ? [] : controls) {
  try {
    assert(!ids.has(c.id), `Duplicate control ${c.id}`);
    ids.add(c.id);
    let xml = readFileSync(join(root, c.fixture), 'utf8');
    for (const [from, to] of c.prepare ?? []) {
      assert(xml.includes(from), `${c.id}: preparation did not match`);
      xml = xml.replaceAll(from, to);
    }
    const positive = await validateSource({ xml }, c.options);
    for (const warning of c.warnings ?? [])
      assert(
        positive.findings.some(
          (finding) => finding.layer === warning.layer && finding.ruleId === warning.ruleId && finding.severity === 'warning',
        ),
        `${c.id}: expected warning ${warning.ruleId}`,
      );
    for (const [layer, id] of Object.entries(c.bundles) as [Layer, string][]) {
      assert(bundles.includes(id), `${c.id}: missing bundle ${id}`);
      assert.equal(positive.bundles[layer], id, `${c.id}: incompatible bundle selection`);
      assert.equal(positive[layer], 'passed', `${c.id}: positive ${layer}: ${JSON.stringify(positive.findings)}`);
      assert(
        c.negatives.some((m) => m.layer === layer),
        `${c.id}: no ${layer} negative control`,
      );
    }
    for (const m of c.negatives) {
      const changed = m.drop
        ? xml.replace(new RegExp(`<${m.drop}\\b[^>]*>[\\s\\S]*?</${m.drop}>`), '')
        : xml.replace(m.replace![0], m.replace![1]);
      assert.notEqual(changed, xml, `${c.id}: negative mutation did not match`);
      const negative = await validateSource({ xml: changed }, c.options);
      assert.equal(negative.bundles[m.layer], c.bundles[m.layer], `${c.id}: mutation lost the intended validator`);
      assert.equal(negative[m.layer], 'failed', `${c.id}: ${m.layer} negative did not fail`);
      if (m.layer !== 'schema') assert.equal(negative.schema, 'passed', `${c.id}: native negative must remain schema-valid`);
      assert(
        negative.findings.some((f) => f.layer === m.layer && f.severity === 'fatal' && (!m.ruleId || f.ruleId === m.ruleId)),
        `${c.id}: expected fatal finding ${m.ruleId ?? m.layer}`,
      );
    }
    for (const id of Object.values(c.bundles)) covered.add(id);
    console.log(`PASS ${c.id}`);
  } catch (error) {
    problems.push(String(error));
  }
}
if (!process.argv.includes('--selectors-only'))
  for (const id of bundles) if (!covered.has(id)) problems.push(`${id}: no passing positive/negative evidence`);
const selectorPath = process.argv.includes('--selector-cases')
  ? process.argv[process.argv.indexOf('--selector-cases') + 1]
  : join(root, 'conformance/validation-selectors.json');
const selectorEvidence: SelectorEvidence[] = JSON.parse(readFileSync(selectorPath, 'utf8'));
const unsupported: UnsupportedEvidence[] = JSON.parse(
  readFileSync(join(root, 'conformance/validation-unsupported-selectors.json'), 'utf8'),
);
problems.push(
  ...(await checkSelectorEvidence(
    root,
    controls,
    selectorEvidence,
    unsupported,
    VALIDATION_SELECTORS,
    (detection, suite) => selectValidationPlan(detection, suite).selectors,
  )),
);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `${controls.length} artifact controls and ${selectorEvidence.length} selector controls cover ${bundles.length} locally qualified bundles / ${VALIDATION_SELECTORS.length} registered selectors. This proves bounded regression behavior, not exhaustive conformance.`,
  );
