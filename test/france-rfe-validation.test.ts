import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { convert, validateSource } from '../src/index.js';

const fixture = (name: string) => readFileSync(new URL(`./validation-fixtures/france-rfe/${name}.xml`, import.meta.url), 'utf8');
test('explicit France RFE UBL EN16931 suite executes the pinned compatible three-layer chain', async () => {
  const summary = await validateSource({ xml: fixture('ubl-en16931-invoice') }, { suite: 'france-rfe-1.4.0.04' });
  assert.equal(summary.result, 'valid', JSON.stringify(summary.findings));
  assert.equal(summary.schema, 'passed');
  assert.equal(summary.semantic, 'passed');
  assert.equal(summary.profile, 'passed');
  assert.deepEqual(summary.bundles, {
    schema: 'xsd-ubl-2.1',
    semantic: 'france-rfe-en16931-ubl-1.3.16',
    profile: 'france-rfe-ubl-1.4.0.04',
  });
});

test('French native identifier limit fails without borrowing an EN16931 or schema failure', async () => {
  const xml = fixture('ubl-en16931-invoice').replace(
    '<cbc:ID>F202500003</cbc:ID>',
    '<cbc:ID>SYNTHETIC-FRANCE-ID-OVER-THIRTY-FIVE-CHARACTERS</cbc:ID>',
  );
  const summary = await validateSource({ xml }, { suite: 'france-rfe-1.4.0.04' });
  assert.equal(summary.schema, 'passed');
  assert.equal(summary.semantic, 'passed');
  assert.equal(summary.profile, 'failed');
  assert.equal(summary.result, 'invalid');
  assert.ok(
    summary.findings.some(
      (finding) => finding.layer === 'profile' && finding.severity === 'fatal' && finding.ruleId === 'BR-FR-01_BT-1-1' && finding.path,
    ),
  );
});

for (const name of ['ubl-extended-ctc-fr-invoice', 'cii-extended-ctc-fr']) {
  test(`unselected France ${name} never executes incompatible generic EN rules`, async () => {
    const xml = fixture(name);
    const unselected = await validateSource({ xml });
    assert.equal(unselected.result, 'incomplete');
    assert.equal(unselected.semantic, 'not-run');
    assert.equal(unselected.bundles.semantic, undefined);
    assert.equal(unselected.reasons?.profile, 'unsupported');
    assert.equal(unselected.schema, name.startsWith('ubl') ? 'passed' : 'not-run');
    assert.equal((await validateSource({ xml }, { suite: 'france-rfe-1.4.0.04' })).result, 'valid');
  });
}

interface Control {
  id: string;
  fixture: string;
  options: { suite: 'france-rfe-1.4.0.04' | 'france-rfe-1.4.0.04-facturx' };
  prepare?: [string, string][];
  bundles: Record<string, string>;
  warnings?: { layer: string; ruleId: string }[];
  negatives: { layer: 'schema' | 'semantic' | 'profile'; drop?: string; replace?: [string, string]; ruleId?: string }[];
}
const controls: Control[] = JSON.parse(readFileSync(new URL('../conformance/validation-cases.json', import.meta.url), 'utf8')).filter(
  (entry: Control) => entry.id.startsWith('france-rfe-'),
);
for (const control of controls) {
  // Each control runs several complete validation pipelines sequentially, including under CI coverage.
  test(`${control.id}: independent profile, schema, semantic and France rule controls`, { timeout: 60_000 }, async () => {
    let xml = readFileSync(new URL(`../${control.fixture}`, import.meta.url), 'utf8');
    for (const [from, to] of control.prepare ?? []) {
      assert.ok(xml.includes(from));
      xml = xml.replaceAll(from, to);
    }
    const positive = await validateSource({ xml }, control.options);
    assert.equal(positive.result, 'valid', JSON.stringify(positive.findings));
    assert.deepEqual(positive.bundles, control.bundles);
    for (const warning of control.warnings ?? [])
      assert.ok(
        positive.findings.some(
          (finding) => finding.layer === warning.layer && finding.ruleId === warning.ruleId && finding.severity === 'warning',
        ),
      );
    for (const mutation of control.negatives) {
      const changed = mutation.drop
        ? xml.replace(new RegExp(`<${mutation.drop}\\b[^>]*>[\\s\\S]*?</${mutation.drop}>`), '')
        : xml.replace(mutation.replace![0], mutation.replace![1]);
      assert.notEqual(changed, xml);
      const negative = await validateSource({ xml: changed }, control.options);
      assert.equal(negative[mutation.layer], 'failed', JSON.stringify(negative.findings));
      assert.equal(negative.result, 'invalid');
      if (mutation.layer !== 'schema') assert.equal(negative.schema, 'passed');
      if (mutation.layer === 'profile') assert.equal(negative.semantic, 'passed', 'French native failure must be independently evidenced');
      assert.ok(
        negative.findings.some(
          (finding) =>
            finding.layer === mutation.layer &&
            finding.severity === 'fatal' &&
            (!mutation.ruleId || finding.ruleId === mutation.ruleId) &&
            finding.path !== '',
        ),
      );
    }
  });
}
const unsupported: {
  id: string;
  control: string;
  prepare: [string, string][];
  options: Control['options'];
  reasons: Record<string, string>;
}[] = JSON.parse(readFileSync(new URL('../conformance/validation-unsupported-selectors.json', import.meta.url), 'utf8')).filter(
  (entry: { id: string }) => entry.id.startsWith('france-rfe-'),
);
for (const entry of unsupported) {
  test(`${entry.id}: missing coverage cannot become valid`, async () => {
    const control = controls.find((control) => control.id === entry.control)!;
    let xml = readFileSync(new URL(`../${control.fixture}`, import.meta.url), 'utf8');
    for (const [from, to] of [...(control.prepare ?? []), ...entry.prepare]) {
      assert.ok(xml.includes(from));
      xml = xml.replaceAll(from, to);
    }
    const summary = await validateSource({ xml }, entry.options);
    assert.equal(summary.result, 'incomplete', JSON.stringify(summary.findings));
    for (const [layer, reason] of Object.entries(entry.reasons)) assert.equal(summary.reasons?.[layer as 'schema' | 'profile'], reason);
  });
}

test('conversion retains an independently failed French validation receipt on the converted invoice', async () => {
  const xml = fixture('ubl-en16931-invoice').replace(
    '<cbc:ID>F202500003</cbc:ID>',
    '<cbc:ID>SYNTHETIC-FRANCE-ID-OVER-THIRTY-FIVE-CHARACTERS</cbc:ID>',
  );
  const result = await convert(new TextEncoder().encode(xml), 'synthetic-france.xml', undefined, {
    validate: true,
    validation: { suite: 'france-rfe-1.4.0.04' },
  });
  const outcome = result.outcomes[0];
  assert.equal(outcome.status, 'ok');
  if (outcome.status !== 'ok') return;
  const validation = outcome.invoices[0].source.validation!;
  assert.equal(validation.result, 'invalid');
  assert.equal(validation.schema, 'passed');
  assert.equal(validation.semantic, 'passed');
  assert.equal(validation.profile, 'failed');
  assert.equal(validation.bundles.profile, 'france-rfe-ubl-1.4.0.04');
});
