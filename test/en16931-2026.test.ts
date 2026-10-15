import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseOne } from './helpers.js';

// The 2026 revision's new business terms are not modelled yet (see README, Known gaps): no primary
// source publishes their UBL/CII bindings. This pins the behaviour that does hold today.
describe('EN 16931-1:2026 identifier', () => {
  test('a document carrying the 2026 specification identifier parses with its 2017-term content', async () => {
    const inv = await parseOne('en16931-2026.xml');
    assert.equal(inv.specificationId, 'urn:cen.eu:en16931:2026');
    assert.equal(inv.kind, 'creditNote');
    assert.equal(inv.id, 'CN03');
  });
});
