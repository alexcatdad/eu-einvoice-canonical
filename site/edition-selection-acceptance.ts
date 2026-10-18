/** Caller-selected editions must remain explicit in the built converter. */
import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from 'playwright';

const base = process.env.VALIDATION_SITE_URL ?? 'http://localhost:4291/eu-einvoice-canonical/';
const xml = await Bun.file(new URL('../test/fixtures/en16931-cii.xml', import.meta.url)).text();
const earve = await Bun.file(new URL('../test/validation-fixtures/national/e-arve.xml', import.meta.url)).text();
const ordinaryEarve = await Bun.file(new URL('../test/validation-fixtures/remaining-legacy/e-arve-1.2.xml', import.meta.url)).text();
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const violations: string[] = [];
    page.on('pageerror', (error) => violations.push(error.message));
    page.on('request', (request) => {
      const url = new URL(request.url());
      // Existing site typography is remote; validation assets and source data stay on the local origin.
      const allowed = url.origin === new URL(base).origin || ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname);
      if (request.method() !== 'GET' || !allowed) violations.push(request.url());
    });
    await page.goto(base);
    await page.locator('.sheet-invoice').waitFor();
    // Tracer: the caller must be able to choose the edition, not have it silently inferred.
    await page.getByLabel('Validation rules', { exact: true }).selectOption('cii-d16b', { timeout: 5000 });
    for (const [suite, source, expected, schema] of [
      ['cii-d16b', xml, 'valid', 'Passed'],
      ['', xml, 'incomplete', 'Not run'],
      ['cii-d16b', xml.replace('urn:cen.eu:en16931:2017', 'urn:cen.eu:en16931:2026'), 'incomplete', 'Not run'],
      ['e-arve-1.2.EN', earve, 'incomplete', 'Passed'],
      ['', earve, 'incomplete', 'Not run'],
      ['e-arve-1.2.EN', earve.replace('<Version>1.2</Version>', '<Version>9.9</Version>'), 'incomplete', 'Not run'],
      ['e-arve-1.2', ordinaryEarve, 'incomplete', 'Passed'],
      ['', ordinaryEarve, 'incomplete', 'Not run'],
      ['e-arve-1.2', ordinaryEarve.replace('<Version>1.2</Version>', '<Version>9.9</Version>'), 'incomplete', 'Not run'],
    ]) {
      await page.getByLabel('Validation rules', { exact: true }).selectOption(suite);
      await page.waitForFunction(() => !document.querySelector('.validation-progress'), undefined, { timeout: 40000 });
      await page.locator('#pasted').fill(source);
      await page.locator('.paste-actions button').last().click();
      await page.waitForFunction(() => !!document.querySelector('.validation-progress'), undefined, { timeout: 10000 });
      await page.waitForFunction(() => !document.querySelector('.validation-progress'), undefined, { timeout: 40000 });
      await page.locator('.t-checks').click();
      assert.match(await page.locator('.checks').innerText(), new RegExp(`Validation coverage: ${expected}`));
      assert.equal(await page.locator('.layers li').nth(1).locator('strong').innerText(), schema);
      console.log(`${name}: ${suite || 'automatic'} edition: ${expected}, schema ${schema}`);
    }
    assert.deepEqual(violations, []);
  } finally {
    await browser.close();
  }
}
