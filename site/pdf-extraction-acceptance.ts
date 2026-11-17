/**
 * The built converter reads PDFs without embedded XML from their text layer, by default, with synthetic PDFs only
 * (test/pdf-synth/). In every engine: an invoice converts, a draft is labelled as not valid and offers no XML export,
 * other documents and unreadable text give their reason, a browser without the needed built-ins gets the plain-words
 * reason, and pdf.js (its worker included) loads from the site itself.
 */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium, firefox, type Page, webkit } from 'playwright';

const base = process.env.VALIDATION_SITE_URL ?? 'http://localhost:4291/eu-einvoice-canonical/';
const pdf = (name: string) => join(import.meta.dir, '../test/pdf-synth', name);

async function drop(page: Page, name: string) {
  await page.locator('.slot input[type=file]').setInputFiles(pdf(name));
  await page.locator('.file-name', { hasText: name }).waitFor({ timeout: 60_000 });
  return (await page.locator('.sheet-invoice').innerText()).replace(/\s+/g, ' ');
}

for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const violations: string[] = [];
    page.on('pageerror', (error) => violations.push(error.message));
    page.on('request', (request) => {
      const url = new URL(request.url());
      const allowed = url.origin === new URL(base).origin || ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname);
      if (request.method() !== 'GET' || !allowed) violations.push(request.url());
    });
    await page.goto(base);
    await page.locator('.sheet-invoice').waitFor();
    const supported = await page.evaluate(() => {
      const g = globalThis as unknown as Record<string, { prototype?: Record<string, unknown> } & Record<string, unknown>>;
      return [g.Math?.sumPrecise, g.Map?.prototype?.getOrInsertComputed, g.Uint8Array?.prototype?.toHex, g.Promise?.try].every(
        (f) => typeof f === 'function',
      );
    });

    const invoice = await drop(page, 'docx-moms-12.pdf');
    if (!supported) {
      assert.match(invoice, /This browser cannot read PDF invoices/);
      console.log(`${name}: lacks the built-ins PDF extraction needs; plain-words reason shown`);
      assert.deepEqual(violations, []);
      continue;
    }
    assert.match(invoice, /Read from PDF/);
    assert.doesNotMatch(invoice, /Draft/);
    await page.getByRole('tab', { name: 'JSON', exact: true }).click();
    assert.equal(
      await page
        .locator('.json-bar')
        .getByRole('button', { name: /^Write as (UBL|CII)$/ })
        .count(),
      2,
    );
    assert.match(await page.locator('.json').innerText(), /"format": "pdf-text"/);
    await page.getByRole('tab', { name: 'Invoice', exact: true }).click();

    const draft = await drop(page, 'xlsx-blandade-momssatser.pdf');
    assert.match(draft, /Draft — not a valid invoice/);
    assert.match(draft, /Not a valid invoice/);
    assert.match(draft, /Why it is a draft/);
    assert.match(draft, /page \d+, x \d+, y \d+/);
    await page.getByRole('tab', { name: 'JSON', exact: true }).click();
    assert.equal(
      await page
        .locator('.json-bar')
        .getByRole('button', { name: /^Write as (UBL|CII)$/ })
        .count(),
      0,
    );
    assert.match(await page.locator('.json').innerText(), /"status": "draft"/);
    await page.getByRole('tab', { name: 'Invoice', exact: true }).click();

    assert.match(await drop(page, 'docx-paminnelse.pdf'), /Not an invoice.*Payment reminder/);
    assert.match(await drop(page, 'pdflib-type0-utan-tounicode.pdf'), /PDF not read.*PDF text cannot be read/);
    assert.deepEqual(violations, []);

    // A browser without the built-ins: the library answers unsupported-runtime; the converter says it in plain words.
    const old = await browser.newPage();
    await old.addInitScript(() => {
      delete (Math as { sumPrecise?: unknown }).sumPrecise;
    });
    await old.goto(base);
    await old.locator('.sheet-invoice').waitFor();
    assert.match(await drop(old, 'docx-moms-12.pdf'), /This browser cannot read PDF invoices: it lacks Math\.sumPrecise\./);
    console.log(`${name}: PDF invoice, draft, other document, unreadable text and missing built-ins as expected`);
  } finally {
    await browser.close();
  }
}
