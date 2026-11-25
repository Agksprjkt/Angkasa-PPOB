import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isOrderableVendor,
  vendorDisplayName,
  vendorLabelOf,
} from '../src/lib/vendor-registry.ts';

test('display names match the vendor column values', () => {
  assert.equal(vendorDisplayName('Digiflazz'), 'Digiflazz');
  assert.equal(vendorDisplayName('TokoVoucher'), 'TokoVoucher');
  assert.equal(vendorDisplayName('Manual'), 'Manual');
});

test('an admin label wins over the vendor name', () => {
  assert.equal(
    vendorLabelOf({ vendor: 'TokoVoucher', vendorLabel: 'Server 2' }),
    'Server 2',
  );
  assert.equal(
    vendorLabelOf({ vendor: 'Digiflazz', vendorLabel: 'Server 1' }),
    'Server 1',
  );
});

test('a blank or missing label falls back to the vendor name', () => {
  assert.equal(vendorLabelOf({ vendor: 'TokoVoucher', vendorLabel: null }), 'TokoVoucher');
  assert.equal(vendorLabelOf({ vendor: 'TokoVoucher', vendorLabel: '' }), 'TokoVoucher');
  assert.equal(vendorLabelOf({ vendor: 'TokoVoucher', vendorLabel: '   ' }), 'TokoVoucher');
  assert.equal(vendorLabelOf({ vendor: 'Digiflazz' }), 'Digiflazz');
});

test('only real providers are orderable', () => {
  assert.equal(isOrderableVendor('Digiflazz'), true);
  assert.equal(isOrderableVendor('TokoVoucher'), true);
  // Manual products are a price reference; selling them would charge without
  // any provider to fulfil the order.
  assert.equal(isOrderableVendor('Manual'), false);
});
