// All identifiers below are synthetic; check digits were computed independently of the code under test.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  classifyRates,
  containsPersonalNumber,
  findLabels,
  isInterestRate,
  isReminder,
  luhn,
  matchLabel,
  normalize,
  parseBankgiro,
  parseBic,
  parseIban,
  parseOcr,
  parseOrgNumber,
  parsePlusgiro,
  parseSeAmount,
  parseSeDate,
  parseSeVatNumber,
} from '../../src/pdf-extract/se/index.js';

describe('normalize', () => {
  test('composes decomposed å, folds case and space variants', () =>
    assert.equal(normalize('  Förfallodatum   ÅR X '), 'förfallodatum år x'));
});

describe('matchLabel', () => {
  const CASES: [string, string][] = [
    ['Fakturanummer', 'invoiceNumber'],
    ['FAKTURANR:', 'invoiceNumber'],
    ['Fakt nr', 'invoiceNumber'],
    ['Faktura-nr', 'invoiceNumber'],
    ['Fakturadatum', 'invoiceDate'],
    ['Fakt.datum', 'invoiceDate'],
    ['Förfallodatum', 'dueDate'],
    ['Förfallodag', 'dueDate'],
    ['Förf.datum', 'dueDate'],
    ['Att betala senast', 'dueDate'],
    ['Sista betalningsdag', 'dueDate'],
    ['Att betala', 'amountDue'],
    ['Summa att betala', 'amountDue'],
    ['Totalt att betala', 'amountDue'],
    ['Att betala SEK', 'amountDue'],
    ['Total fordran', 'amountDue'],
    ['Summa', 'total'],
    ['Totalt', 'total'],
    ['Totala beloppet', 'total'],
    ['Totalt inkl. moms', 'total'],
    ['Summa inklusive moms', 'total'],
    ['Moms', 'vat'],
    ['Mervärdesskatt', 'vat'],
    ['Summa moms', 'vat'],
    ['Netto', 'net'],
    ['Summa exkl. moms', 'net'],
    ['Exklusive moms', 'net'],
    ['Belopp exkl moms', 'net'],
    ['Org.nr', 'orgNumber'],
    ['Org. nr', 'orgNumber'],
    ['Orgnr', 'orgNumber'],
    ['Organisationsnr', 'orgNumber'],
    ['Organisationsnummer', 'orgNumber'],
    ['Momsreg.nr', 'vatNumber'],
    ['Momsregnr', 'vatNumber'],
    ['Momsregistreringsnummer', 'vatNumber'],
    ['VAT', 'vatNumber'],
    ['VAT reg. no', 'vatNumber'],
    ['OCR', 'ocr'],
    ['OCR-nummer', 'ocr'],
    ['OCR-nr', 'ocr'],
    ['OCR-referens', 'ocr'],
    ['Betalningsreferens', 'ocr'],
    ['Er referens', 'reference'],
    ['Vår ref.', 'reference'],
    ['Bankgiro', 'bankgiro'],
    ['Bankgironr', 'bankgiro'],
    ['Bankgironummer', 'bankgiro'],
    ['BG', 'bankgiro'],
    ['Plusgiro', 'plusgiro'],
    ['Plusgirot', 'plusgiro'],
    ['Plusgirokonto', 'plusgiro'],
    ['Postgiro', 'plusgiro'],
    ['PG', 'plusgiro'],
    ['IBAN', 'iban'],
    ['BIC/SWIFT', 'bic'],
    ['Godkänd för F-skatt', 'fSkatt'],
    ['F-skattebevis', 'fSkatt'],
    ['Innehar F-skattsedel', 'fSkatt'],
    ['Kreditfaktura', 'creditNote'],
    ['Påminnelse', 'reminder'],
    ['Betalningspåminnelse', 'reminder'],
    ['1:a påminnelse', 'reminder'],
    ['Påminnelsedatum', 'reminder'],
    ['Påminnelseavgift', 'reminderFee'],
    ['Dröjsmålsränta', 'lateInterest'],
    ['ROT-avdrag', 'rot'],
    ['RUT', 'rut'],
    ['Husarbete', 'householdWork'],
    ['Preliminär skattereduktion', 'householdWork'],
    ['Belåning', 'factoring'],
    ['Överlåtelsetext', 'factoring'],
    ['Momsfritt', 'vatExempt'],
    ['Öresavrundning', 'rounding'],
    ['Öresutjämning', 'rounding'],
    ['Öresavr.', 'rounding'],
    ['Avrundning', 'rounding'],
  ];
  for (const [text, label] of CASES) test(`"${text}" -> ${label}`, () => assert.equal(matchLabel(text), label));

  for (const text of ['Öresundskraft', 'Rotfrukter', 'Ocrx', 'Nettopris per enhet', 'Fakturanummer 123', 'Momsen', 'Summering', ''])
    test(`"${text}" is not a whole label`, () => assert.equal(matchLabel(text), undefined));
});

describe('findLabels', () => {
  test('finds labels in reading order without overlaps', () =>
    assert.deepEqual(
      findLabels('Org.nr 556000-0001  Momsreg.nr SE556000000101  Godkänd för F-skatt').map((m) => [m.label, m.text]),
      [
        ['orgNumber', 'org.nr'],
        ['vatNumber', 'momsreg.nr'],
        ['fSkatt', 'godkänd för f-skatt'],
      ],
    ));

  test('reports offsets in the normalised text', () => {
    const [m] = findLabels('  Att  betala:');
    assert.deepEqual([m.label, m.start, m.end], ['amountDue', 0, 10]);
  });
});

describe('parseSeAmount', () => {
  const OK: [string, string, boolean?][] = [
    ['1 234,56', '1234.56'],
    ['1 234,56', '1234.56'],
    ['1 234,56', '1234.56'],
    ['1 234 567,00', '1234567.00'],
    ['22 697 kr', '22697', true],
    ['22 697 Kr', '22697', true],
    ['999,99SEK', '999.99', true],
    ['SEK 1 234,56', '1234.56', true],
    ['1.234,56', '1234.56'],
    ['1234.56', '1234.56'],
    ['100:-', '100', true],
    ['100,-', '100', true],
    ['1 500:- kr', '1500', true],
    ['0,4567 kr', '0.4567', true],
    ['-0,40', '-0.40'],
    ['−0,40', '-0.40'],
    ['– 12,50 kr', '-12.50', true],
    ['1 234,56-', '-1234.56'],
    ['(12,00)', '-12.00'],
    ['0', '0'],
  ];
  for (const [raw, value, sek] of OK)
    test(`"${raw}" -> ${value}`, () => assert.deepEqual(parseSeAmount(raw), sek ? { value, currency: 'SEK' } : { value }));

  for (const bad of ['', 'kr', '1.234', '12 34', '1 2345', '1,234.56', '100,50:-', '(-5)', '12:50', 'abc', '1e5', '1 234,', '--5'])
    test(`"${bad}" is rejected`, () => assert.equal(parseSeAmount(bad), undefined));
});

describe('parseSeDate', () => {
  const OK: [string, string][] = [
    ['2026-01-15', '2026-01-15'],
    ['20260115', '2026-01-15'],
    ['26-01-15', '2026-01-15'],
    ['260115', '2026-01-15'],
    ['15 januari 2026', '2026-01-15'],
    ['3 feb. 2026', '2026-02-03'],
    ['3 Feb 2026', '2026-02-03'],
    ['den 1 maj 2026', '2026-05-01'],
    ['30 sept 2026', '2026-09-30'],
    ['1. okt 2026', '2026-10-01'],
    ['29 februari 2028', '2028-02-29'],
  ];
  for (const [raw, iso] of OK) test(`"${raw}" -> ${iso}`, () => assert.equal(parseSeDate(raw), iso));

  for (const bad of [
    '2026-02-30',
    '29 februari 2026',
    '15 foo 2026',
    '2026-1-15',
    '2026-0115',
    '15/01/2026',
    '1234567',
    '2026-01-15T10:00',
    '',
  ])
    test(`"${bad}" is rejected`, () => assert.equal(parseSeDate(bad), undefined));
});

describe('luhn', () => {
  test('valid and invalid check digits', () => {
    assert.equal(luhn('1234566'), true);
    assert.equal(luhn('1234567'), false);
    assert.equal(luhn('18'), true);
    assert.equal(luhn('12a4'), false);
    assert.equal(luhn(''), false);
  });
});

describe('parseOcr', () => {
  test('Luhn with length digit', () => assert.deepEqual(parseOcr('123 4574'), { reference: '1234574', lengthDigit: true }));
  test('length digit 0 for ten digits', () => assert.deepEqual(parseOcr('9876543209'), { reference: '9876543209', lengthDigit: true }));
  test('Luhn only', () => assert.deepEqual(parseOcr('1234566'), { reference: '1234566', lengthDigit: false }));
  test('two digits', () => assert.deepEqual(parseOcr('18'), { reference: '18', lengthDigit: false }));
  for (const bad of ['1234575', '1', '12345678901234567890123455', '12-34', 'abc'])
    test(`"${bad}" is rejected`, () => assert.equal(parseOcr(bad), undefined));
});

describe('parseBankgiro', () => {
  test('seven digits', () => assert.deepEqual(parseBankgiro('123-4566'), { digits: '1234566', formatted: '123-4566' }));
  test('eight digits, unformatted', () => assert.deepEqual(parseBankgiro('55667786'), { digits: '55667786', formatted: '5566-7786' }));
  for (const bad of ['123-4567', '12-34566', '123456789', '5566-778'])
    test(`"${bad}" is rejected`, () => assert.equal(parseBankgiro(bad), undefined));
});

describe('parsePlusgiro', () => {
  test('eight digits', () => assert.deepEqual(parsePlusgiro('1 23 45 67-4'), { digits: '12345674', formatted: '1 23 45 67-4' }));
  test('seven digits, unformatted', () => assert.deepEqual(parsePlusgiro('5551 28'), { digits: '555128', formatted: '5 55 12-8' }));
  test('two digits', () => assert.deepEqual(parsePlusgiro('1-8'), { digits: '18', formatted: '1-8' }));
  for (const bad of ['1 23 45 67-5', '8', '123456789-7', '12-34'])
    test(`"${bad}" is rejected`, () => assert.equal(parsePlusgiro(bad), undefined));
});

describe('parseOrgNumber', () => {
  test('organisation', () => assert.deepEqual(parseOrgNumber('556000-0001'), { kind: 'organisation', orgNumber: '556000-0001' }));
  test('organisation with 16 prefix', () =>
    assert.deepEqual(parseOrgNumber('16212000-0001'), { kind: 'organisation', orgNumber: '212000-0001' }));
  test('organisation without hyphen', () =>
    assert.deepEqual(parseOrgNumber('5560000001'), { kind: 'organisation', orgNumber: '556000-0001' }));
  test('personnummer is flagged without the number', () => assert.deepEqual(parseOrgNumber('800101-1231'), { kind: 'personal' }));
  test('12-digit personnummer', () => assert.deepEqual(parseOrgNumber('19121212-1212'), { kind: 'personal' }));
  test('samordningsnummer', () => assert.deepEqual(parseOrgNumber('850161-9871'), { kind: 'personal' }));
  test('centenarian separator', () => assert.deepEqual(parseOrgNumber('121212+1212'), { kind: 'personal' }));
  for (const bad of ['556000-0002', '16800101-1231', '19556000-0001', '556000+0001', '851301-1232', '55600-00001', '556000-000'])
    test(`"${bad}" is rejected`, () => assert.equal(parseOrgNumber(bad), undefined));
});

describe('containsPersonalNumber', () => {
  test('flags a personnummer in text', () => assert.equal(containsPersonalNumber('Kund: 850101-9874, Storgatan 1'), true));
  test('flags a spaced personnummer', () => assert.equal(containsPersonalNumber('Pnr 850101 9874'), true));
  test('ignores organisation numbers and other digits', () =>
    assert.equal(containsPersonalNumber('Org.nr 556000-0001 OCR 1234574 Tel 0812345678 850101-9875'), false));
});

describe('parseSeVatNumber', () => {
  test('organisation', () =>
    assert.deepEqual(parseSeVatNumber('SE 556000-0001 01'), {
      kind: 'organisation',
      vatNumber: 'SE556000000101',
      orgNumber: '556000-0001',
    }));
  test('lower case', () => assert.equal(parseSeVatNumber('se556000000101')?.kind, 'organisation'));
  test('sole trader is flagged without the number', () => assert.deepEqual(parseSeVatNumber('SE800101123101'), { kind: 'personal' }));
  for (const bad of ['SE556000000201', 'SE556000000102', 'SE55600000010', 'DK556000000101'])
    test(`"${bad}" is rejected`, () => assert.equal(parseSeVatNumber(bad), undefined));
});

describe('parseIban', () => {
  for (const ok of ['SE45 5000 0000 0583 9825 7466', 'SE8312000000012345678901', 'de89 3704 0044 0532 0130 00', 'NL91ABNA0417164300'])
    test(`"${ok}" is valid`, () => assert.equal(parseIban(ok), ok.replace(/\s/g, '').toUpperCase()));
  for (const bad of [
    'SE4650000000058398257466',
    'SE455000000005839825746',
    'SE45500000000583982574AB',
    'DE88370400440532013000',
    'XX12',
    '',
  ])
    test(`"${bad}" is rejected`, () => assert.equal(parseIban(bad), undefined));
});

describe('parseBic', () => {
  test('8 and 11 characters', () => {
    assert.equal(parseBic('abcdse11'), 'ABCDSE11');
    assert.equal(parseBic('ABCD SE 11 XXX'), 'ABCDSE11XXX');
  });
  for (const bad of ['ABCDSE1', 'ABCDSE11XX', '1BCDSE11']) test(`"${bad}" is rejected`, () => assert.equal(parseBic(bad), undefined));
});

describe('classifyRates', () => {
  const kinds = (text: string) => classifyRates(text).map((r) => [r.value, r.kind]);
  test('VAT rate', () => assert.deepEqual(kinds('Moms 25 %'), [['25', 'vat']]));
  test('interest label beats a VAT-like value', () => assert.deepEqual(kinds('Dröjsmålsränta 12 %'), [['12', 'interest']]));
  test('decimal interest rate', () => assert.deepEqual(kinds('Dröjsmålsränta          9,5 %'), [['9.5', 'interest']]));
  test('nearest term wins on one line', () =>
    assert.deepEqual(kinds('Moms 25 %, dröjsmålsränta 8 %'), [
      ['25', 'vat'],
      ['8', 'interest'],
    ]));
  test('label after the rate', () =>
    assert.deepEqual(kinds('Moms 25 % 8 % dröjsmålsränta'), [
      ['25', 'vat'],
      ['8', 'interest'],
    ]));
  test('per period means interest', () => assert.deepEqual(kinds('Moms 2 % per månad'), [['2', 'interest']]));
  test('generic ränta', () => assert.deepEqual(kinds('Ränta 8 % över referensräntan'), [['8', 'interest']]));
  test('no context', () => assert.deepEqual(kinds('Rabatt 10%'), [['10', undefined]]));
  test('isInterestRate', () => {
    assert.equal(isInterestRate('Dröjsmålsränta 12%'), true);
    assert.equal(isInterestRate('Moms 12%'), false);
    assert.equal(isInterestRate('ingen procentsats'), false);
  });
});

describe('isReminder', () => {
  test('reminder headings', () => {
    assert.equal(isReminder('Firma AB\nPÅMINNELSE\nFakturanummer 1001'), true);
    assert.equal(isReminder('Betalningspåminnelse'), true);
    assert.equal(isReminder('Firma AB      Betalningspåminnelse'), true);
    assert.equal(isReminder('  2:a påminnelse'), true);
    assert.equal(isReminder('Påminnelsedatum 2026-02-01'), true);
  });
  test('invoice terms are not reminders', () => {
    assert.equal(
      isReminder('Faktura\nPåminnelseavgift 60 kr\nVid påminnelse debiteras 60 kr\tVid försenad betalning utgår påminnelseavgift'),
      false,
    );
    assert.equal(isReminder('Faktura'), false);
  });
});
