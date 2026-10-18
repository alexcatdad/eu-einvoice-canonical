/** Explicit edition acceptance through the built UI, with Node parity. Synthetic source fixtures only. */
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import { validateSource } from '../src/index.js';

const base = process.env.VALIDATION_SITE_URL ?? 'http://localhost:4291/eu-einvoice-canonical/';
const statuses = { passed: 'Passed', failed: 'Failed', 'not-run': 'Not run', unavailable: 'Unavailable' };
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors: string[] = [];
    const uploads: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (request.method() !== 'GET') uploads.push(request.url());
    });
    await page.goto(base);
    assert.match(await page.title(), /invoice/i);
    await page.locator('.sheet-invoice').waitFor();
    assert.equal(await page.locator('vite-error-overlay, nextjs-portal').count(), 0);
    await page.screenshot({ path: join(tmpdir(), `facturx-${name}-before.png`) });
    await page.getByLabel('Validation rules', { exact: true }).selectOption('facturx-1.09.2', { timeout: 5000 });
    for (const profile of ['basicwl', 'en16931', 'extended']) {
      const valid = await Bun.file(new URL(`../test/validation-fixtures/facturx-1.09.2-${profile}.xml`, import.meta.url)).text();
      for (const negative of [false, true]) {
        const xml = negative ? valid.replace(/<ram:InvoiceCurrencyCode>[^<]+/, '<ram:InvoiceCurrencyCode>ZZZ') : valid;
        const expected = await validateSource({ xml }, { suite: 'facturx-1.09.2' });
        assert.equal(expected.result, negative ? 'invalid' : 'valid');
        await page.locator('#pasted').fill(xml);
        await page.locator('.paste-actions button').last().click();
        await page.waitForFunction(() => !!document.querySelector('.validation-progress'), undefined, { timeout: 10_000 });
        await page.waitForFunction(() => !document.querySelector('.validation-progress'), undefined, { timeout: 40_000 });
        await page.locator('.t-checks').click();
        const rows = page.locator('.layers li');
        for (const [index, layer] of ['parse', 'schema', 'semantic', 'profile'].entries())
          assert.equal(
            await rows.nth(index).locator('strong').innerText(),
            statuses[expected[layer as 'schema']],
            `${name} ${profile} ${layer}`,
          );
        const text = await page.locator('.checks').innerText();
        assert.match(text, new RegExp(`Validation coverage: ${expected.result}`));
        for (const finding of expected.findings) if (finding.ruleId) assert.ok(text.includes(finding.ruleId), `${name} ${finding.ruleId}`);
        console.log(
          `${name}: explicit Factur-X1.09.2 ${profile}${negative ? ' unknown-currency' : ''}: ${expected.result}; Node/browser parity`,
        );
      }
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(uploads, []);
    await page.locator('.layers').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(tmpdir(), `facturx-${name}.png`) });
    await page.setViewportSize({ width: 375, height: 812 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('.layers').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(tmpdir(), `facturx-${name}-mobile.png`) });
  } finally {
    await browser.close();
  }
}
