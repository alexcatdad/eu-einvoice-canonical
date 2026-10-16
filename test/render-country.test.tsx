import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Address, CanonicalInvoice } from '../src/canonical.js';
import { EXIT, main } from '../src/cli.js';
import { EU_COUNTRIES } from '../src/codes.js';
import { Invoice } from '../src/react/Invoice.js';
import { countryLocale, formatDate, formatMoney, formatTime, paragraphs } from '../src/render/format.js';
import { renderHtml } from '../src/render/html.js';
import { buildInvoiceView } from '../src/render/model.js';
import { pdfBlocks, renderPdf } from '../src/render/pdf.js';
import { fixturePath, parseOne } from './helpers.js';

const base = await parseOne('peppol-bis3-invoice.xml');
const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');
function invoice(country?: string): CanonicalInvoice {
  const inv = structuredClone(base);
  inv.seller.address = { ...inv.seller.address, countryCode: country };
  return inv;
}

describe('invoice country formatting', () => {
  test.each(EU_COUNTRIES)('%s supplies a formatting locale independently of label language', (country) => {
    const v = buildInvoiceView(invoice(country), 'en');
    expect(new Intl.Locale(v.locale).region).toBe(country);
    expect(v.facts[0]!.value.text).toBe(formatDate(base.issueDate, v.locale).text);
    expect(v.due.value.text).toBe(formatMoney(base.totals.payable, base.currency, v.locale));
    expect(v.due.label).toBe('Amount due');
  });

  test('seller country wins over buyer and national source format', () => {
    const inv = invoice(' ro ');
    inv.source.format = 'xrechnung-ubl';
    inv.buyer.address = { countryCode: 'US' };
    const v = buildInvoiceView(inv, 'de');
    expect(v.locale).toBe('ro-RO');
    expect(v.lang).toBe('de');
    expect(v.facts[0]!.value.text).toBe('15 oct. 2026');
    expect(plain(v.due.value.text)).toBe('3.091,00 SEK');
    expect(v.lines.rows[1]!.net).toBe('1.900,00');
  });

  test('a national source supplies the country; generic and ambiguous sources fall back to language', () => {
    const inv = invoice();
    inv.source.format = 'xrechnung-ubl';
    expect(buildInvoiceView(inv, 'en').locale).toBe('de-DE');
    inv.source.format = 'peppol-bis3';
    expect(buildInvoiceView(inv, 'fr-CH').locale).toBe('fr-CH');
    inv.source.format = 'facturx';
    expect(buildInvoiceView(inv, 'en-GB').locale).toBe('en-GB');
    expect(buildInvoiceView(invoice('ZZ'), 'de').locale).toBe('de');
    expect(buildInvoiceView(invoice('XX'), 'fr').locale).toBe('fr');
    for (const code of ['EU', 'UN', '<script>', 'USA']) expect(countryLocale(code)).toBeUndefined();
  });

  test('explicit locale overrides country while keeping label language, source precision and currency', () => {
    const inv = invoice('DE');
    inv.totals.payable = '9007199254740993.12345' as CanonicalInvoice['totals']['payable'];
    const before = structuredClone(inv);
    const v = buildInvoiceView(inv, 'ro', { locale: 'en-GB' });
    expect(v.locale).toBe('en-GB');
    expect(v.due.label).toBe('De plată');
    expect(plain(v.due.value.text)).toBe('SEK 9,007,199,254,740,993.12345');
    expect(inv).toEqual(before);
    expect(buildInvoiceView(inv, 'ro', { locale: 'invalid locale' }).locale).toBe('en');
  });

  test('free text keeps language, embedded values and paragraph/list structure', () => {
    const inv = invoice('RO');
    const prose = 'Ștefan: 1,234.56 EUR on 2026-10-15\r\nSecond line\r\n\r\n- Déjà livré\n- Überweisung';
    inv.paymentTerms = prose;
    inv.notes = [{ text: prose }];
    inv.lines[0]!.item.description = prose;
    const v = buildInvoiceView(inv, 'de');
    expect(v.payment.terms).toEqual(paragraphs(prose));
    expect(v.notes[0]!.paras).toEqual(paragraphs(prose));
    expect(v.lines.rows[0]!.description.slice(0, 2)).toEqual(paragraphs(prose));
    const html = renderHtml(inv);
    expect(html).toContain('Ștefan: 1,234.56 EUR on 2026-10-15<br/>Second line');
    expect(html).toContain('<ul><li>Déjà livré</li><li>Überweisung</li></ul>');
  });

  test('dates, periods, delivery, preceding invoices and installments share country formatting', () => {
    const inv = invoice('DE');
    inv.paymentSchedule = [{ dueDate: inv.issueDate, amount: '1234.5' as CanonicalInvoice['totals']['payable'] }];
    const v = buildInvoiceView(inv);
    expect(v.facts[0]!.value).toMatchObject({ text: '15.10.2026', iso: '2026-10-15' });
    expect(v.facts.find((f) => f.label === 'Invoice period')!.value.text).toBe('01.09.2026 – 30.09.2026');
    expect(v.parties.find((p) => p.role === 'delivery')!.fields.at(-1)!.value.text).toBe('10.10.2026');
    expect(v.references.at(-1)!.value.text).toContain('30.09.2026');
    expect(v.schedule.rows[0]!.due.text).toBe('15.10.2026');
    expect(v.schedule.rows[0]!.amount).toBe('1.234,50');
    expect(v.lines.rows[0]!.vat.text).toContain('25');
  });

  test('HTML and React agree for country defaults and explicit locale overrides; PDF uses the same view', async () => {
    const inv = invoice('DE');
    for (const locale of [undefined, 'en-US', 'ro-RO']) {
      const html = renderHtml(inv, { lang: 'fr', locale, standalone: false });
      const react = renderToStaticMarkup(<Invoice invoice={inv} lang="fr" locale={locale} idPrefix="einvoice" />);
      expect(html.slice(html.indexOf('<article'))).toBe(react);
    }
    const blocks = pdfBlocks(buildInvoiceView(inv, 'en', { currencyDisplay: 'code' }), 'Address');
    const totals = blocks.find((b) => b.kind === 'totals');
    expect(plain(totals!.kind === 'totals' ? totals!.rows.at(-1)![1] : '')).toBe('3.091,00 SEK');
    expect((await renderPdf(inv, { locale: 'en-GB' })).slice(0, 5)).toEqual(new TextEncoder().encode('%PDF-'));
  });

  test('CLI defaults to country and exposes a locale override', async () => {
    for (const [args, amount] of [
      [[], '3 091,00 kr'],
      [['--locale', 'en'], 'SEK 3,091.00'],
    ] as const) {
      const output: string[] = [];
      expect(
        await main(['render', '--as', 'html', ...args, fixturePath('peppol-bis3-invoice.xml')], {
          stdout: (s) => {
            output.push(s);
          },
          stderr: () => {},
          readStdin: async () => new Uint8Array(),
        }),
      ).toBe(EXIT.ok);
      expect(plain(output.join(''))).toContain(amount);
    }
    expect(
      await main(['render', '--as', 'html', '--locale', 'bad locale', fixturePath('peppol-bis3-invoice.xml')], {
        stdout: () => {},
        stderr: () => {},
        readStdin: async () => new Uint8Array(),
      }),
    ).toBe(EXIT.usage);
  });
});

describe('postal addresses use their own country', () => {
  test.each([
    ['DE', ['00123 Town', 'Region']],
    ['IT', ['00123 Town Region']],
    ['GB', ['Town', 'Region', '00123']],
    ['IE', ['Town', 'Region', '00123']],
    ['LV', ['Region', 'Town, 00123']],
    ['US', ['Town Region 00123']],
    ['CA', ['Town Region 00123']],
    ['AU', ['Town Region 00123']],
    ['XX', ['00123 Town', 'Region']],
  ])('%s layout keeps every address component and leading zeros', (code, tail) => {
    const inv = invoice('RO');
    const address: Address = {
      line1: 'Street 1',
      line2: 'Building A',
      line3: 'Floor 2',
      city: 'Town',
      countrySubdivision: 'Region',
      postalCode: '00123',
      countryCode: code as string,
    };
    inv.buyer.address = address;
    const lines = buildInvoiceView(inv).parties.find((p) => p.role === 'buyer')!.address;
    expect(lines.slice(0, -1)).toEqual(['Street 1', 'Building A', 'Floor 2', ...tail]);
  });

  test('Hungarian locality precedes the street with postcode last', () => {
    const inv = invoice('HU');
    inv.seller.address = { city: 'Budapest', line1: 'Virág tér 3.', postalCode: '1037', countryCode: 'HU' };
    expect(buildInvoiceView(inv).parties[0]!.address).toEqual(['Budapest', 'Virág tér 3.', '1037', 'Hungary']);
  });

  test('partial addresses omit blanks without punctuation artifacts', () => {
    const inv = invoice();
    inv.buyer.address = { countryCode: 'us', countrySubdivision: 'CA', postalCode: '00123' };
    expect(buildInvoiceView(inv).parties[1]!.address).toEqual(['CA 00123', 'United States']);
  });
});

test('times use the locale clock without shifting time zones; malformed values survive', () => {
  expect(plain(formatTime('14:30:00+03:00', 'en-US'))).toBe('2:30 PM');
  expect(formatTime('14:30:00+03:00', 'de-DE')).toBe('14:30');
  for (const value of ['soon', '25:30:00', '12:60:00', '12:30:61', '12:30:00+14:01']) {
    expect(formatTime(value, 'de-DE')).toBe(value);
  }
});
