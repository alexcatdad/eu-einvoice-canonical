import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { add, cmp, isDecimal, neg, round, sign, sub, sum, toDecimal, toIsoDate } from '../src/values.js';

describe('toDecimal', () => {
  const OK: [string, string][] = [
    ['100.00', '100.00'], // trailing zeros kept
    ['  42 ', '42'],
    ['+5.00', '5.00'],
    ['-0.5', '-0.5'],
    ['.5', '0.5'],
    ['5.', '5'],
    ['0.0000001', '0.0000001'], // no exponent
    ['123456789012345678901234.56', '123456789012345678901234.56'],
    ['007', '007'], // digits as sent
  ];
  for (const [raw, out] of OK) test(`"${raw}" -> "${out}"`, () => assert.equal(toDecimal(raw), out));

  for (const bad of ['', ' ', '1,000.50', '1 000,50', '12,5', '1e5', '1.2.3', 'abc', '-', '.', '--1', 'NaN']) {
    test(`"${bad}" is rejected`, () => {
      assert.throws(() => toDecimal(bad));
      assert.equal(isDecimal(bad), false);
    });
  }
});

describe('toIsoDate', () => {
  test('YYYY-MM-DD', () => assert.deepEqual(toIsoDate('2026-10-15'), { date: '2026-10-15', droppedTime: undefined }));
  test('CII format 102', () => assert.equal(toIsoDate('20261015').date, '2026-10-15'));
  test('date-time at midnight drops nothing', () => assert.equal(toIsoDate('2026-10-15T00:00:00').droppedTime, undefined));
  test('date-time reports the dropped time', () =>
    assert.deepEqual(toIsoDate('2026-10-15T14:30:00'), { date: '2026-10-15', droppedTime: '14:30:00' }));
  test('time-zone suffix is accepted', () => assert.equal(toIsoDate('2026-10-15+02:00').date, '2026-10-15'));
  for (const bad of ['2026-02-30', '2026-13-01', '15.10.2026', '2026/10/15', '', '20261332']) {
    test(`"${bad}" is rejected`, () => assert.throws(() => toIsoDate(bad)));
  }
});

describe('exact arithmetic', () => {
  test('add/sub keep the larger scale and never use floats', () => {
    assert.equal(add('0.1', '0.2'), '0.3');
    assert.equal(add('1.005', '2.5'), '3.505');
    assert.equal(sub('100.00', '0.01'), '99.99');
    assert.equal(sub('0', '12.50'), '-12.50');
    assert.equal(add('99999999999999999999.99', '0.01'), '100000000000000000000.00');
  });
  test('sum, neg, sign, cmp', () => {
    assert.equal(sum(['250.00', '1900.00', '360.00', '450.00']), '2960.00');
    assert.equal(sum([]), '0');
    assert.equal(neg('-3.5'), '3.5');
    assert.equal(sign('-0.00'), 0);
    assert.equal(sign('-0.01'), -1);
    assert.equal(cmp('1.10', '1.1'), 0);
    assert.equal(cmp('-2', '1'), -1);
  });
  test('round follows XPath round(): halves go towards +infinity', () => {
    assert.equal(round('904.9125'), '904.91');
    assert.equal(round('2.345'), '2.35');
    assert.equal(round('-2.345'), '-2.34');
    assert.equal(round('-2.346'), '-2.35');
    assert.equal(round('7'), '7.00');
    assert.equal(round('0.005'), '0.01');
    assert.equal(round('-0.005'), '0.00');
  });
});
