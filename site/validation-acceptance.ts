/** Built-site controls through paste→convert→Checks, reusing the independent bundle evidence matrix. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import { validateSource } from '../src/index.js';
import type { ValidateOptions } from '../src/validation/index.js';
import type { Layer } from '../src/validation/plan.js';

interface Mutation {
  drop?: string;
  replace?: [string, string];
  layer: Layer;
  ruleId?: string;
}
interface Control {
  id: string;
  fixture: string;
  prepare?: [string, string][];
  options?: Pick<ValidateOptions, 'scope' | 'suite'>;
  bundles: Partial<Record<Layer, string>>;
  negatives: Mutation[];
  warnings?: { layer: Layer; ruleId: string }[];
}
interface Scenario {
  id: string;
  xml: string;
  control?: Control;
  mutation?: Mutation;
  suite?: ValidateOptions['suite'];
  unsupportedEdition?: boolean;
  unsupportedChain?: boolean;
}
const root = join(import.meta.dir, '..');
const base = process.env.VALIDATION_SITE_URL ?? 'http://localhost:4291/eu-einvoice-canonical/';
const controls: Control[] = JSON.parse(readFileSync(join(root, 'conformance/validation-cases.json'), 'utf8'));
const scenarios: Scenario[] = [];
const skipped: string[] = [];
for (const control of controls) {
  if (control.options?.suite === 'legacy-peppol-3.0.20-en-1.3.17') {
    // The product deliberately offers the current suite and explicit Factur-X replay, not historical Peppol replay.
    skipped.push(control.id);
    continue;
  }
  let xml = readFileSync(join(root, control.fixture), 'utf8');
  for (const [from, to] of control.prepare ?? []) {
    assert.ok(xml.includes(from), `${control.id}: preparation matches`);
    xml = xml.replaceAll(from, to);
  }
  scenarios.push({ id: `${control.id}: positive`, xml, control, suite: control.options?.suite });
  for (const [index, mutation] of control.negatives.entries()) {
    const changed = mutation.drop
      ? xml.replace(new RegExp(`<${mutation.drop}\\b[^>]*>[\\s\\S]*?</${mutation.drop}>`), '')
      : xml.replace(mutation.replace![0], mutation.replace![1]);
    assert.notEqual(changed, xml, `${control.id}: negative mutation matches`);
    scenarios.push({
      id: `${control.id}: ${mutation.layer} negative ${index + 1}`,
      xml: changed,
      control,
      mutation,
      suite: control.options?.suite,
    });
  }
}
for (const fixture of ['peppol-valid-invoice.xml', '../fixtures/en16931-cii.xml']) {
  const xml = readFileSync(join(root, 'test/validation-fixtures', fixture), 'utf8');
  const changed = fixture.endsWith('cii.xml')
    ? xml.replace('urn:cen.eu:en16931:2017', 'urn:cen.eu:en16931:2026')
    : xml.replace(/<cbc:CustomizationID>[^<]+/, '<cbc:CustomizationID>urn:cen.eu:en16931:2026');
  scenarios.push({ id: `${fixture}: unsupported2026edition`, xml: changed, unsupportedEdition: true });
}
for (const syntax of ['ubl', 'cii']) {
  const source = readFileSync(join(root, 'test/fixtures', `xrechnung-${syntax}.xml`), 'utf8');
  scenarios.push({
    id: `xrechnung-${syntax}: unknown chain`,
    xml: source.replace('xrechnung_3.0', 'xrechnung_3.0#conformant#urn:example:unknown'),
    unsupportedChain: true,
  });
}
const scenarioFilter = process.env.VALIDATION_SCENARIO_FILTER;
if (scenarioFilter) {
  const selected = scenarios.filter((scenario) => scenario.id.includes(scenarioFilter));
  assert.ok(selected.length, 'Scenario filter must select at least one case');
  scenarios.splice(0, scenarios.length, ...selected);
}
const engines = { chromium, firefox, webkit };
const engineFilter = process.env.VALIDATION_BROWSER;
assert.ok(!engineFilter || Object.hasOwn(engines, engineFilter), 'Unknown validation browser');
const statuses = { passed: 'Passed', failed: 'Failed', 'not-run': 'Not run', unavailable: 'Unavailable' };
const layerOrder = ['parse', 'schema', 'semantic', 'profile'] as const;
for (const [name, engine] of Object.entries(engines).filter(([name]) => !engineFilter || name === engineFilter)) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors: string[] = [];
    const network: string[] = [];
    const assetRequests: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      assetRequests.push(request.url());
      if (![new URL(base).hostname, 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(new URL(request.url()).hostname))
        network.push(request.url());
      if (request.method() !== 'GET') network.push(`${request.method()} ${request.url()}`);
    });
    await page.goto(base);
    assert.match(await page.title(), /invoice/i);
    await page.locator('.sheet-invoice').waitFor();
    assert.ok(!assetRequests.some((url) => url.includes('/validation/')), `${name}: validation assets are lazy`);
    let selectedSuite = '';
    for (const scenario of scenarios) {
      // Browser UI requests full source coverage. Schema-only evidence still checks its intended layer independently;
      // the extra missing native scope must remain honestly incomplete in both runtimes.
      const summary = await validateSource({ xml: scenario.xml }, { suite: scenario.suite });
      assert.ok(summary, `${scenario.id}: Node source validation exists`);
      for (const [layer, id] of Object.entries(scenario.control?.bundles ?? {}) as [Layer, string][]) {
        assert.equal(summary.bundles[layer], id, `${scenario.id}: intended artifact`);
        if (!scenario.mutation) assert.equal(summary[layer], 'passed', `${scenario.id}: positive control`);
      }
      if (!scenario.mutation)
        for (const warning of scenario.control?.warnings ?? [])
          assert.ok(
            summary.findings.some(
              (finding) => finding.layer === warning.layer && finding.ruleId === warning.ruleId && finding.severity === 'warning',
            ),
            `${scenario.id}: expected warning ${warning.ruleId}`,
          );
      if (scenario.mutation) {
        assert.equal(summary[scenario.mutation.layer], 'failed', `${scenario.id}: negative control`);
        if (scenario.mutation.ruleId)
          assert.ok(
            summary.findings.some(
              (f) => f.layer === scenario.mutation!.layer && f.ruleId === scenario.mutation!.ruleId && f.severity === 'fatal',
            ),
            `${scenario.id}: expected rule`,
          );
      }
      if (scenario.unsupportedEdition) {
        assert.equal(summary.result, 'incomplete');
        assert.equal(summary.reasons?.semantic, 'unsupported');
      }
      if (scenario.unsupportedChain) {
        assert.equal(summary.result, 'incomplete');
        assert.equal(summary.profile, 'passed');
        assert.equal(summary.reasons?.profile, 'unsupported');
      }
      const desiredSuite = scenario.suite === 'peppol-2026-05' ? '' : (scenario.suite ?? '');
      if (desiredSuite !== selectedSuite) {
        await page.locator('.validation-suite select').selectOption(desiredSuite);
        await page.waitForFunction(() => !document.querySelector('.validation-progress'), undefined, { timeout: 40_000 });
        selectedSuite = desiredSuite;
      }
      await page.locator('#pasted').fill(scenario.xml);
      await page.locator('.paste-actions button').last().click();
      await page.waitForFunction(() => !!document.querySelector('.validation-progress'), undefined, { timeout: 10_000 });
      await page.waitForFunction(() => !document.querySelector('.validation-progress'), undefined, { timeout: 40_000 });
      await page.locator('.t-checks').click();
      const rows = page.locator('.layers li');
      for (const [index, layer] of layerOrder.entries()) {
        const actual = await rows.nth(index).locator('strong').innerText();
        if (actual !== statuses[summary[layer]])
          assert.equal(actual, statuses[summary[layer]], `${name} ${scenario.id}: ${layer}; ${await page.locator('.checks').innerText()}`);
        if (layer !== 'parse' && summary.bundles[layer])
          assert.ok(
            (await rows.nth(index).locator('small').allTextContents()).includes(summary.bundles[layer]!),
            `${name} ${scenario.id}: visible artifact receipt`,
          );
      }
      const findings = await page.locator('.checks').innerText();
      assert.match(findings, new RegExp(`Validation coverage: ${summary.result}`));
      for (const finding of summary.findings)
        if (finding.ruleId) assert.ok(findings.includes(finding.ruleId), `${name} ${scenario.id}: ${finding.ruleId}`);
      if (!scenario.mutation && scenario.control?.warnings?.length) {
        await page.locator('.t-json').click();
        await page.locator('.json-panel .views button').first().click();
        const displayed = JSON.parse(await page.locator('pre.json').innerText());
        for (const warning of scenario.control.warnings)
          assert.ok(
            displayed.source.validation.findings.some(
              (finding: { layer: string; ruleId?: string; severity: string }) =>
                finding.layer === warning.layer && finding.ruleId === warning.ruleId && finding.severity === 'warning',
            ),
            `${name} ${scenario.id}: exported warning severity`,
          );
        await page.locator('.t-checks').click();
      }
      console.log(`${name}: ${scenario.id}: ${summary.result}; Node/browser parity`);
    }
    assert.deepEqual(errors, [], `${name}: page errors`);
    assert.deepEqual(network, [], `${name}: no off-origin document traffic or uploads`);
    await page.screenshot({ path: join(tmpdir(), `validation-${name}.png`), fullPage: false });
    await page.setViewportSize({ width: 375, height: 812 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name}: no mobile overflow`);
    await page.locator('.layers').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(tmpdir(), `validation-${name}-mobile.png`), fullPage: false });
    console.log(`${name}: ${scenarios.length} scenarios passed; API-only legacy suite exceptions: ${skipped.join(', ') || 'none'}`);
  } finally {
    await browser.close();
  }
}
