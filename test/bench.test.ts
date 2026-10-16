import { expect, test } from 'bun:test';
import { compare, MAX_BUNDLE_GROWTH, MAX_SLOWDOWN, renderComparison, renderPerformanceHtml, renderResults } from '../bench/report.js';
import type { Results } from '../bench/run.js';

const results = (ratio: number, bundleBytes: number): Results => ({
  generatedAt: '2026-01-01T00:00:00.000Z',
  runtime: 'bun test',
  platform: 'test',
  calibrationMs: 10,
  quick: true,
  cases: [{ id: 'format/peppol-bis3-invoice.xml', group: 'format', bytes: 1024, docsPerSec: 1000, medianMs: 1, ratio, peakMB: 40 }],
  bundles: [{ name: 'app.js', bytes: bundleBytes, gzipBytes: bundleBytes / 3 }],
});

test('the gate passes when nothing moved', () => {
  expect(compare(results(0.1, 1000), results(0.1, 1000)).failures).toEqual([]);
});

const many = (ratios: number[]): Results => ({
  ...results(0.1, 1000),
  cases: ratios.map((ratio, i) => ({ id: `format/f${i}`, group: 'format', bytes: 1, docsPerSec: 1, medianMs: 1, ratio })),
});

test('one case more than 2x slower than the rest fails, a uniformly slower machine does not', () => {
  const base = many([0.1, 0.1, 0.1, 0.1, 0.1]);
  expect(compare(base, many([0.15, 0.15, 0.15, 0.15, 0.15])).failures).toEqual([]);
  const slow = compare(base, many([0.15, 0.15, 0.15, 0.15, 0.15 * MAX_SLOWDOWN * 1.05]));
  expect(slow.failures).toHaveLength(1);
  expect(slow.failures[0]).toContain('f4');
  expect(compare(base, many([0.15, 0.15, 0.15, 0.15, 0.15 * MAX_SLOWDOWN * 0.95])).failures).toEqual([]);
});

test('everything several times slower fails', () => {
  const c = compare(many([0.1, 0.1, 0.1]), many([0.4, 0.4, 0.4]));
  expect(c.failures[0]).toContain('typical case');
});

test('the gate fails when a chunk grows more than 15%', () => {
  expect(compare(results(0.1, 1000), results(0.1, 1000 * MAX_BUNDLE_GROWTH * 0.99)).failures).toEqual([]);
  expect(compare(results(0.1, 1000), results(0.1, 1000 * MAX_BUNDLE_GROWTH * 1.01)).failures[0]).toContain('bundle app.js');
});

test('new and removed chunks are shown but do not fail', () => {
  const now = results(0.1, 1000);
  now.bundles = [{ name: 'chunks/new.js', bytes: 5000, gzipBytes: 2000 }];
  const c = compare(results(0.1, 1000), now);
  expect(c.failures).toEqual([]);
  expect(renderComparison(c)).toContain('new/removed');
});

test('the reports render the measured cases', () => {
  const r = results(0.1, 2048);
  expect(renderResults(r)).toContain('peppol-bis3-invoice.xml');
  expect(renderPerformanceHtml(r)).toContain('Peppol BIS 3 invoice');
});
