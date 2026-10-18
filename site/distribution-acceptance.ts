/** Verify the actual distributable site, independently of the full local qualification build. */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import { approvedBundleIds, loadDistribution } from '../scripts/validation-distribution.js';

const root = join(import.meta.dir, '..');
const base = process.env.VALIDATION_SITE_URL!;
assert.ok(base, 'Run through site/check-validation.ts');
const policy = loadDistribution(root);
const approved = approvedBundleIds(root);
assert.deepEqual(readdirSync(join(root, 'dist/validation/bundles')).sort(), approved);
assert.deepEqual(approvedBundleIds(join(root, 'dist')), approved);
assert.equal(
  readFileSync(join(root, 'dist/validation/distribution.json'), 'utf8'),
  readFileSync(join(root, 'validation/distribution.json'), 'utf8'),
);
const valid = readFileSync(join(root, 'test/fixtures/xrechnung-ubl.xml'), 'utf8');
const cases = [
  { id: 'qualified XRechnung', xml: valid, result: 'valid', layers: ['Passed', 'Passed', 'Passed', 'Passed'] },
  {
    id: 'invalid XRechnung',
    xml: valid.replace(/<cbc:BuyerReference>[^<]*<\/cbc:BuyerReference>/, ''),
    result: 'invalid',
    layers: ['Passed', 'Passed', 'Passed', 'Failed'],
  },
  {
    id: 'withheld Peppol profile',
    xml: readFileSync(join(root, 'test/validation-fixtures/peppol-valid-invoice.xml'), 'utf8'),
    result: 'incomplete',
    layers: ['Passed', 'Passed', 'Passed', 'Unavailable'],
  },
  {
    id: 'withheld Svefaktura',
    xml: readFileSync(join(root, 'test/fixtures/svefaktura-1.0.xml'), 'utf8'),
    result: 'incomplete',
    layers: ['Passed', 'Unavailable', 'Not run', 'Unavailable'],
  },
];
assert.notEqual(cases[0].xml, cases[1].xml);
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base);
    await page.locator('.sheet-invoice').waitFor();
    for (const entry of cases) {
      await page.locator('#pasted').fill(entry.xml);
      await page.locator('.paste-actions button').last().click();
      await page.waitForFunction(() => !!document.querySelector('.validation-progress'), undefined, { timeout: 10_000 });
      await page.waitForFunction(() => !document.querySelector('.validation-progress'), undefined, { timeout: 40_000 });
      await page.locator('.t-checks').click();
      assert.deepEqual((await page.locator('.layers li strong').allTextContents()).slice(0, 4), entry.layers, `${name}: ${entry.id}`);
      assert.ok((await page.locator('.checks').innerText()).includes(`Validation coverage: ${entry.result}`));
      await page.locator('.t-json').click();
      await page.locator('.json-panel .views button').first().click();
      const invoice = JSON.parse(await page.locator('pre.json').innerText());
      assert.equal(invoice.source.validation.result, entry.result, `${name}: exported ${entry.id}`);
      console.log(`${name}: ${entry.id}: ${entry.result}`);
    }
    for (const [id, decision] of Object.entries(policy.bundles)) {
      const response = await page.request.get(`${base}validation/bundles/${id}/manifest.json`);
      assert.equal(response.status(), decision.publish ? 200 : 404, `${name}: distribution boundary ${id}`);
    }
    for (const file of ['NOTICE', 'distribution.json', ...Object.keys(policy.licenseFiles).map((file) => `licenses/${file}`)])
      assert.equal((await page.request.get(`${base}validation/${file}`)).status(), 200, `${name}: ${file}`);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}
console.log(`Public site: ${approved.length} approved bundles, excluded assets absent, 12 rendered validation/export controls passed.`);
