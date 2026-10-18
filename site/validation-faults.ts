/** Built-site fault acceptance through the public converter workflow, using synthetic XML. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.VALIDATION_SITE_URL ?? 'http://localhost:4291/eu-einvoice-canonical/';
const fixture = async (name: string) => Bun.file(new URL(`../test/fixtures/${name}`, import.meta.url)).text();
const browser = await chromium.launch();
try {
  for (const fault of ['startup-race', 'manifest', 'wasm', 'cancel', 'budget', 'race']) {
    const context = await browser.newContext();
    let intercepted = 0;
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    if (fault === 'startup-race')
      await context.route('**/samples/peppol-bis3-invoice.xml', async (route) => {
        intercepted++;
        await blocked;
        await route.continue();
      });
    if (fault === 'manifest')
      await context.route('**/xsd-ubl-2.1/manifest.json', async (route) => {
        intercepted++;
        await route.fulfill({ body: '{}', contentType: 'application/json' });
      });
    if (fault === 'wasm')
      await context.route('**/xmllint.wasm', async (route) => {
        intercepted++;
        await route.abort();
      });
    if (['cancel', 'budget', 'race'].includes(fault))
      await context.route('**/xsd-ubl-2.1/manifest.json', async (route) => {
        intercepted++;
        await blocked;
        await route.abort().catch(() => {});
      });
    try {
      const page = await context.newPage();
      await page.goto(base);
      await page.locator('#pasted').fill(await fixture(fault === 'startup-race' ? 'xrechnung-cii.xml' : 'peppol-bis3-invoice.xml'));
      await page.locator('.paste-actions button').last().click();
      await page.locator('.validation-progress').waitFor();
      if (fault === 'startup-race') {
        await page.waitForFunction(() => !document.querySelector('.validation-progress'), undefined, { timeout: 15000 });
        const response = page.waitForResponse('**/samples/peppol-bis3-invoice.xml');
        release?.();
        await response;
        await page.waitForTimeout(500);
        assert.match(await page.locator('.file-name').innerText(), /pasted.xml/, 'Delayed startup example must not replace user document');
      } else if (fault === 'cancel') {
        await page.getByRole('button', { name: 'Cancel checks', exact: true }).click();
        assert.match(await page.locator('.validation-progress').innerText(), /cancelled/);
        release?.();
        await page.waitForTimeout(500);
        assert.match(await page.locator('.validation-progress').innerText(), /cancelled/);
      } else if (fault === 'race') {
        await page.locator('#pasted').fill(await fixture('xrechnung-cii.xml'));
        await page.locator('.paste-actions button').last().click();
        release?.();
        await page.waitForFunction(() => !document.querySelector('.validation-progress'), undefined, { timeout: 15_000 });
        await page.locator('.t-checks').click();
        assert.match(await page.locator('.checks').innerText(), /XRechnung/);
        assert.match(await page.locator('.checks').innerText(), /Validation coverage: valid/);
      } else if (fault === 'budget') {
        await page.waitForFunction(() => document.querySelector('.validation-progress')?.textContent?.includes('time budget'), undefined, {
          timeout: 35_000,
        });
        assert.match(await page.locator('.validation-progress').innerText(), /time budget/);
      } else {
        await page.waitForFunction(() => !document.querySelector('.validation-progress'), undefined, { timeout: 15_000 });
        await page.locator('.t-checks').click();
        assert.match(await page.locator('.checks').innerText(), /Unavailable/);
        assert.match(await page.locator('.checks').innerText(), fault === 'manifest' ? /manifest does not match/ : /Validator unavailable/);
      }
      await page.waitForFunction(() => !document.querySelector('.validation-progress button'));
      // UI completion and Playwright's worker-close notification are separate asynchronous signals.
      await Promise.all(
        page.workers().map((worker) =>
          worker.waitForEvent('close', { timeout: 5000 }).catch((error) => {
            throw new Error(`${fault}: worker did not close: ${worker.url()}`, { cause: error });
          }),
        ),
      );
      assert.equal(
        page.workers().length,
        0,
        `${fault}: workers disposed; remaining URLs: ${page
          .workers()
          .map((worker) => worker.url())
          .join(', ')}`,
      );
      assert.ok(intercepted > 0, `${fault}: fault was exercised`);
      console.log(`${fault}: passed`);
    } finally {
      release?.();
      await context.close();
    }
  }
} finally {
  await browser.close();
}
