/** Independent selector controls are kept apart from the executable routing registry. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectXml, validateSource } from '../src/index.js';
import type { ValidateOptions } from '../src/validation/index.js';
import type { Layer } from '../src/validation/plan.js';

export interface EvidenceMutation {
  drop?: string;
  replace?: [string, string];
  layer: Layer;
  ruleId?: string;
}
export interface ArtifactControl {
  id: string;
  fixture: string;
  options?: Pick<ValidateOptions, 'scope' | 'suite'>;
  prepare?: [string, string][];
  bundles: Partial<Record<Layer, string>>;
  negatives: EvidenceMutation[];
  warnings?: { layer: Layer; ruleId: string }[];
}
export interface SelectorEvidence {
  selector: string;
  control: string;
  prepare?: [string, string][];
}
export interface UnsupportedEvidence {
  id: string;
  control: string;
  prepare: [string, string][];
  reasons: Partial<Record<Layer, 'unsupported'>>;
  options?: Pick<ValidateOptions, 'scope' | 'suite'>;
}
export function preparedSource(root: string, control: ArtifactControl, extra: [string, string][] = []): string {
  let xml = readFileSync(join(root, control.fixture), 'utf8');
  for (const [from, to] of [...(control.prepare ?? []), ...extra]) {
    assert(xml.includes(from), `${control.id}: preparation did not match ${from}`);
    xml = xml.replaceAll(from, to);
  }
  return xml;
}
export function mutateSource(xml: string, mutation: EvidenceMutation): string {
  const changed = mutation.drop
    ? xml.replace(new RegExp(`<${mutation.drop}\\b[^>]*>[\\s\\S]*?</${mutation.drop}>`), '')
    : xml.replace(mutation.replace![0], mutation.replace![1]);
  assert.notEqual(changed, xml, 'negative mutation did not match');
  return changed;
}

export async function checkSelectorEvidence(
  root: string,
  controls: ArtifactControl[],
  evidence: SelectorEvidence[],
  unsupported: UnsupportedEvidence[],
  registry: readonly { id: string; plan: Partial<Record<Layer, string>> }[],
  selected: (detection: ReturnType<typeof detectXml>, suite?: ValidateOptions['suite']) => readonly string[],
): Promise<string[]> {
  const problems: string[] = [];
  const controlById = new Map(controls.map((control) => [control.id, control]));
  const known = new Set(registry.map((entry) => entry.id));
  if (known.size !== registry.length) return ['Duplicate routing selector IDs'];
  const missing = [...known].filter((id) => !evidence.some((entry) => entry.selector === id));
  if (missing.length) return missing.map((id) => `${id}: no selector evidence (passing positive and negative required)`);
  const seen = new Set<string>();
  for (const entry of evidence) {
    try {
      assert(known.has(entry.selector), `${entry.selector}: evidence names unregistered selector`);
      assert(!seen.has(entry.selector), `${entry.selector}: duplicate selector evidence`);
      seen.add(entry.selector);
      const control = controlById.get(entry.control);
      assert(control, `${entry.selector}: missing control ${entry.control}`);
      const selector = registry.find((candidate) => candidate.id === entry.selector)!;
      for (const [layer, bundle] of Object.entries(selector.plan) as [Layer, string][]) {
        assert(
          !(control.options?.scope === 'schema' && layer !== 'schema'),
          `${entry.selector}: schema scope cannot establish ${layer} selector evidence`,
        );
        assert.equal(
          control.bundles[layer],
          bundle,
          `${entry.selector}: selected ${layer} lacks independent expected artifact/negative evidence`,
        );
      }
    } catch (error) {
      problems.push(String(error));
    }
  }
  if (problems.length) return problems;
  const covered = new Set<string>();
  for (const entry of evidence) {
    try {
      const control = controlById.get(entry.control)!;
      const xml = preparedSource(root, control, entry.prepare);
      assert(
        selected(detectXml(xml), control.options?.suite).includes(entry.selector),
        `${entry.selector}: source does not exercise selector`,
      );
      const positive = await validateSource({ xml }, control.options);
      for (const warning of control.warnings ?? [])
        assert(
          positive.findings.some(
            (finding) => finding.layer === warning.layer && finding.ruleId === warning.ruleId && finding.severity === 'warning',
          ),
          `${entry.selector}: expected warning ${warning.ruleId}`,
        );
      assert.notEqual(positive.result, 'invalid', `${entry.selector}: positive source is invalid`);
      assert.deepEqual(
        positive.bundles,
        control.bundles,
        `${entry.selector}: every effective selected layer needs an independent expected artifact`,
      );
      for (const [layer, bundle] of Object.entries(control.bundles) as [Layer, string][]) {
        assert.equal(positive.bundles[layer], bundle, `${entry.selector}: expected ${layer} artifact`);
        assert.equal(positive[layer], 'passed', `${entry.selector}: positive ${layer} did not pass`);
        assert(
          control.negatives.some((mutation) => mutation.layer === layer),
          `${entry.selector}: no ${layer} negative evidence`,
        );
      }
      for (const mutation of control.negatives) {
        const negative = await validateSource({ xml: mutateSource(xml, mutation) }, control.options);
        assert.equal(
          negative.bundles[mutation.layer],
          control.bundles[mutation.layer],
          `${entry.selector}: mutation lost intended artifact`,
        );
        assert.equal(negative[mutation.layer], 'failed', `${entry.selector}: negative ${mutation.layer} did not fail`);
        if (mutation.layer !== 'schema')
          assert.equal(negative.schema, 'passed', `${entry.selector}: native negative must remain schema-valid`);
        assert(
          negative.findings.some(
            (finding) =>
              finding.layer === mutation.layer && finding.severity === 'fatal' && (!mutation.ruleId || finding.ruleId === mutation.ruleId),
          ),
          `${entry.selector}: missing fatal ${mutation.ruleId ?? mutation.layer}`,
        );
      }
      covered.add(entry.selector);
      console.log(`PASS selector ${entry.selector}`);
    } catch (error) {
      // An invalid control already fails the gate; do not execute the remaining expensive suites.
      return [String(error)];
    }
  }
  for (const id of known) if (!covered.has(id)) problems.push(`${id}: no selector evidence (passing positive and negative required)`);
  for (const entry of unsupported) {
    try {
      const control = controlById.get(entry.control);
      assert(control, `${entry.id}: missing control ${entry.control}`);
      const xml = preparedSource(root, control, entry.prepare);
      const summary = await validateSource({ xml }, entry.options);
      assert.equal(summary.result, 'incomplete', `${entry.id}: unsupported source must remain incomplete`);
      for (const [layer, reason] of Object.entries(entry.reasons) as [Layer, 'unsupported'][])
        assert.equal(summary.reasons?.[layer], reason, `${entry.id}: unsupported ${layer} reason`);
      console.log(`PASS unsupported ${entry.id}`);
    } catch (error) {
      problems.push(String(error));
    }
  }
  if (!unsupported.length) problems.push('No unsupported selector controls');
  return problems;
}
