import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSvrl } from '../src/validation/schematron.js';

test('malformed or unrelated engine output cannot establish a passing validation', () => {
  for (const output of [
    '',
    '<html/>',
    '<svrl:schematron-output xmlns:svrl="http://purl.oclc.org/dsdl/svrl"><broken></svrl:schematron-output>',
  ]) {
    assert.throws(() => parseSvrl(output, 'profile'));
  }
});

test('SFTI trailing rule IDs preserve publisher text and severity', () => {
  const message = 'Currencies must agree [R-100]';
  assert.deepEqual(
    parseSvrl(
      `<schematron-output xmlns="http://purl.oclc.org/dsdl/svrl"><failed-assert flag="fatal" location="/Invoice"><text>${message}</text></failed-assert></schematron-output>`,
      'profile',
    ),
    [{ layer: 'profile', ruleId: 'R-100', severity: 'fatal', message, path: '/Invoice' }],
  );
});
