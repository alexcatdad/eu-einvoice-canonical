import { describe, expect, test } from 'bun:test';
import {
  countryName,
  currencyDigits,
  formatAmount,
  formatDate,
  formatDecimal,
  formatIban,
  formatMoney,
  formatPercent,
  formatQuantity,
  paragraphs,
  resolveLocale,
  schemeName,
} from '../src/render/format.js';
import { isLabelKey, labelsFor, RENDER_LANGUAGES } from '../src/render/labels.js';

/** Intl uses no-break and narrow no-break spaces; the assertions use plain ones. */
const plain = (s: string) => s.replace(/[  ]/g, ' ');
const word = (w: string) => labelsFor('en')(w as Parameters<ReturnType<typeof labelsFor>>[0]);

describe('formatDecimal', () => {
  test('groups and uses the locale decimal sign', () => {
    expect(formatDecimal('1234567.891', 'en')).toBe('1,234,567.891');
    expect(formatDecimal('1234567.891', 'de')).toBe('1.234.567,891');
    expect(plain(formatDecimal('1234567.891', 'fr'))).toBe('1 234 567,891');
  });

  test('follows locales that leave four-digit numbers ungrouped', () => {
    expect(formatDecimal('1234', 'es')).toBe('1234');
    expect(formatDecimal('12345', 'es')).toBe('12.345');
  });

  test('keeps every digit: no float rounding, ever', () => {
    expect(formatDecimal('12345678901234567890.123456789', 'en')).toBe('12,345,678,901,234,567,890.123456789');
    expect(formatDecimal('0.1', 'en')).toBe('0.1');
    expect(formatDecimal('0.30000000000000004', 'en')).toBe('0.30000000000000004');
    expect(formatDecimal('9007199254740993', 'en')).toBe('9,007,199,254,740,993');
  });

  test('pads the fraction to a minimum, never cuts it', () => {
    expect(formatDecimal('1.5', 'en', 2)).toBe('1.50');
    expect(formatDecimal('7', 'en', 2)).toBe('7.00');
    expect(formatDecimal('1.23456', 'en', 2)).toBe('1.23456');
  });

  test('signs, and anything that is not a plain decimal comes back unchanged', () => {
    expect(formatDecimal('-1234.5', 'en')).toBe('-1,234.5');
    expect(formatDecimal('+12', 'en')).toBe('12');
    expect(formatDecimal('abc', 'en')).toBe('abc');
    expect(formatDecimal('1e5', 'en')).toBe('1e5');
    expect(formatDecimal('1,000.00', 'en')).toBe('1,000.00');
  });
});

describe('formatMoney and formatAmount', () => {
  test('puts the currency where the locale wants it', () => {
    expect(formatMoney('1234.5', 'EUR', 'en')).toBe('€1,234.50');
    expect(plain(formatMoney('1234.5', 'EUR', 'de'))).toBe('1.234,50 €');
    expect(plain(formatMoney('-3091', 'SEK', 'de'))).toBe('-3.091,00 SEK');
    expect(plain(formatMoney('1234.5', 'EUR', 'de', 'code'))).toBe('1.234,50 EUR');
  });

  test('keeps extra decimals and the currency minor unit', () => {
    expect(formatMoney('0.125', 'EUR', 'en')).toBe('€0.125');
    expect(formatMoney('100', 'JPY', 'en')).toBe('¥100');
    expect(currencyDigits('JPY')).toBe(0);
    expect(currencyDigits('EUR')).toBe(2);
    expect(formatMoney('99999999999999999999.99', 'EUR', 'en')).toBe('€99,999,999,999,999,999,999.99');
  });

  test('odd currency codes and values fall back to plain text', () => {
    expect(formatMoney('1', 'E1', 'en')).toBe('1 E1');
    expect(formatMoney('abc', 'EUR', 'en')).toBe('abc EUR');
    expect(formatMoney('5', '', 'en')).toBe('5');
    expect(currencyDigits('E1')).toBe(2);
    expect(formatMoney('1.5', 'eur', 'en')).toBe('€1.50');
  });

  test('table amounts carry no currency sign', () => {
    expect(formatAmount('100', 'EUR', 'en')).toBe('100.00');
    expect(formatAmount('1234.56789', 'EUR', 'de')).toBe('1.234,56789');
  });
});

describe('formatPercent', () => {
  test('uses the locale pattern on the exact digits', () => {
    expect(formatPercent('25', 'en')).toBe('25%');
    expect(plain(formatPercent('12.5', 'de'))).toBe('12,5 %');
    expect(plain(formatPercent('25', 'fr'))).toBe('25 %');
    expect(formatPercent('0', 'en')).toBe('0%');
    expect(formatPercent('n/a', 'en')).toBe('n/a');
  });
});

describe('formatDate', () => {
  test('a real date is shown in the locale, with the ISO form kept', () => {
    expect(formatDate('2026-10-15', 'de')).toEqual({ text: '15.10.2026', iso: '2026-10-15' });
    expect(formatDate('2026-10-15', 'en')).toEqual({ text: 'Oct 15, 2026', iso: '2026-10-15' });
  });

  test('impossible or malformed dates are shown as written', () => {
    expect(formatDate('2026-02-30', 'en')).toEqual({ text: '2026-02-30' });
    expect(formatDate('soon', 'en')).toEqual({ text: 'soon' });
  });
});

describe('formatIban', () => {
  test('groups a valid IBAN in fours', () => {
    expect(formatIban('DE89370400440532013000')).toBe('DE89 3704 0044 0532 0130 00');
    expect(formatIban('de89 3704 0044 0532 0130 00')).toBe('DE89 3704 0044 0532 0130 00');
    expect(formatIban('SE4550000000058398257466')).toBe('SE45 5000 0000 0583 9825 7466');
  });

  test('leaves other account numbers alone', () => {
    expect(formatIban('DE89370400440532013001')).toBeUndefined();
    expect(formatIban('1234567')).toBeUndefined();
  });
});

describe('formatQuantity', () => {
  test('Intl units in the reader’s language', () => {
    expect(plain(formatQuantity('10', 'HUR', undefined, 'en', word))).toBe('10 hr');
    expect(plain(formatQuantity('1', 'DAY', undefined, 'en', word))).toBe('1 day');
    expect(plain(formatQuantity('-2.5', 'KGM', undefined, 'en', word))).toBe('-2.5 kg');
  });

  test('symbols, counted things, free text and unknown codes', () => {
    expect(formatQuantity('2.5', 'MTK', undefined, 'de', word)).toBe('2,5 m²');
    expect(formatQuantity('3', 'C62', undefined, 'en', word)).toBe('3 pcs');
    expect(formatQuantity('3', 'H87', undefined, 'pl', (w) => labelsFor('pl')(w))).toBe('3 szt.');
    expect(formatQuantity('3', 'C62', 'st', 'en', word)).toBe('3 st');
    expect(formatQuantity('3', 'ABC', undefined, 'en', word)).toBe('3 ABC');
    expect(formatQuantity('3', undefined, undefined, 'en', word)).toBe('3');
    expect(formatQuantity(undefined, 'C62', undefined, 'en', word)).toBe('pcs');
    expect(formatQuantity('lots', 'HUR', undefined, 'en', word)).toBe('lots HUR');
  });
});

describe('paragraphs', () => {
  test('blank lines split paragraphs; "-", "*", "•" and "1." lines become lists', () => {
    expect(paragraphs('Intro line\nsecond\r\n\n- a\n* b\n1. c\nafter')).toEqual([
      { kind: 'p', lines: ['Intro line', 'second'] },
      { kind: 'ul', items: ['a', 'b', 'c'] },
      { kind: 'p', lines: ['after'] },
    ]);
    expect(paragraphs('• one\n\n• two')).toEqual([
      { kind: 'ul', items: ['one'] },
      { kind: 'ul', items: ['two'] },
    ]);
  });

  test('a hyphen inside a word or a negative number is not a bullet', () => {
    expect(paragraphs('-5 EUR discount\nwell-known')).toEqual([{ kind: 'p', lines: ['-5 EUR discount', 'well-known'] }]);
  });

  test('empty input', () => {
    expect(paragraphs(undefined)).toEqual([]);
    expect(paragraphs('  \n ')).toEqual([]);
  });
});

describe('names and locales', () => {
  test('countries in the reader’s language', () => {
    expect(countryName('SE', 'de')).toBe('Schweden');
    expect(countryName('se', 'en')).toBe('Sweden');
    expect(countryName('XX!', 'en')).toBe('XX!');
  });

  test('identifier schemes', () => {
    expect(schemeName('0088')).toBe('GLN');
    expect(schemeName('0204')).toBe('Leitweg-ID');
    expect(schemeName('PL:NIP')).toBe('NIP');
    expect(schemeName('9999')).toBe('9999');
    expect(schemeName(undefined)).toBeUndefined();
  });

  test('resolveLocale accepts what Intl accepts and falls back to English', () => {
    expect(resolveLocale('de-CH')).toBe('de-CH');
    expect(resolveLocale('en-12')).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
  });

  test('labels exist for the site’s eight languages', () => {
    expect([...RENDER_LANGUAGES].sort()).toEqual(['de', 'en', 'es', 'fr', 'it', 'nl', 'pl', 'ro']);
    for (const lang of RENDER_LANGUAGES) expect(labelsFor(lang)('vatBreakdown')).toBeTruthy();
    expect(labelsFor('it')('payable')).toBe('Importo da pagare');
    expect(labelsFor('ro-RO')('creditNote')).toBe('Notă de credit');
    expect(isLabelKey('catS')).toBe(true);
    expect(isLabelKey('catXYZ')).toBe(false);
    expect(isLabelKey('toString')).toBe(false);
  });
});
