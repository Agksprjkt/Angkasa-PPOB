import assert from 'node:assert/strict';
import test from 'node:test';

import {
  maxBulkStatusIds,
  parseBulkStatusInput,
} from '../src/lib/product-bulk-update.ts';

test('a valid bulk status body is accepted', () => {
  const result = parseBulkStatusInput({ ids: ['a', 'b'], status: 'active' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.input, { ids: ['a', 'b'], status: 'active' });
});

test('duplicate ids are collapsed so one row is not written twice', () => {
  const result = parseBulkStatusInput({ ids: ['a', 'a', 'b'], status: 'inactive' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.input.ids, ['a', 'b']);
});

test('an empty id list is rejected', () => {
  assert.deepEqual(parseBulkStatusInput({ ids: [], status: 'active' }), {
    ok: false,
    error: 'INVALID_PRODUCT_IDS',
  });
});

test('more ids than the cap are rejected', () => {
  const ids = Array.from({ length: maxBulkStatusIds + 1 }, (_, index) => `p${index}`);
  assert.deepEqual(parseBulkStatusInput({ ids, status: 'active' }), {
    ok: false,
    error: 'TOO_MANY_PRODUCTS',
  });
});

test('non-string and blank ids are rejected', () => {
  assert.equal(parseBulkStatusInput({ ids: [1], status: 'active' }).ok, false);
  assert.equal(parseBulkStatusInput({ ids: ['   '], status: 'active' }).ok, false);
});

test('an unknown status is rejected', () => {
  assert.deepEqual(parseBulkStatusInput({ ids: ['a'], status: 'deleted' }), {
    ok: false,
    error: 'INVALID_PRODUCT_STATUS',
  });
  assert.deepEqual(parseBulkStatusInput({ ids: ['a'] }), {
    ok: false,
    error: 'INVALID_PRODUCT_STATUS',
  });
});

test('a non-object body is rejected', () => {
  assert.equal(parseBulkStatusInput(null).ok, false);
  assert.equal(parseBulkStatusInput([]).ok, false);
});
