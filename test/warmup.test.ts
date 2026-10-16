import { expect, test } from 'bun:test';
import { warmUpValidation } from '../src/index.js';

test('warming up the validators succeeds and leaves later validation working', async () => {
  expect(await warmUpValidation()).toBe(true);
});

test('warming up reports false, without throwing, when the bundles are not there', async () => {
  const missing = { read: async () => Promise.reject(new Error('no bundles')) };
  expect(await warmUpValidation({ bundles: missing })).toBe(false);
});
