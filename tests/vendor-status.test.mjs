import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isVendorEnabled,
  vendorStatus,
  vendorStatusLabel,
} from '../src/lib/vendor-registry.ts';

test('Digiflazz defaults to enabled when never configured', () => {
  // A fresh install must not silently stop a store that is already live.
  assert.equal(isVendorEnabled('Digiflazz', {}), true);
  assert.equal(isVendorEnabled('Digiflazz', { digiflazzEnabled: undefined }), true);
  assert.equal(isVendorEnabled('Digiflazz', { digiflazzEnabled: true }), true);
  assert.equal(isVendorEnabled('Digiflazz', { digiflazzEnabled: false }), false);
});

test('TokoVoucher defaults to disabled', () => {
  assert.equal(isVendorEnabled('TokoVoucher', {}), false);
  assert.equal(isVendorEnabled('TokoVoucher', { tokovoucherEnabled: true }), true);
  assert.equal(isVendorEnabled('TokoVoucher', { tokovoucherEnabled: false }), false);
});

test('the two switches are independent', () => {
  const values = { digiflazzEnabled: false, tokovoucherEnabled: true };
  assert.equal(isVendorEnabled('Digiflazz', values), false);
  assert.equal(isVendorEnabled('TokoVoucher', values), true);
});

test('Manual is never orderable', () => {
  assert.equal(isVendorEnabled('Manual', { digiflazzEnabled: true }), false);
});

test('missing credentials outrank the switch', () => {
  // "Not configured" tells the admin to fill the form; "disabled" tells them to
  // flip the switch. They are not the same fix.
  assert.equal(vendorStatus({ enabled: true, configured: false }), 'unconfigured');
  assert.equal(vendorStatus({ enabled: false, configured: false }), 'unconfigured');
});

test('configured vendors report the switch state', () => {
  assert.equal(vendorStatus({ enabled: true, configured: true }), 'active');
  assert.equal(vendorStatus({ enabled: false, configured: true }), 'disabled');
});

test('labels are the Indonesian ones shown in the panel', () => {
  assert.equal(vendorStatusLabel('active'), 'Aktif');
  assert.equal(vendorStatusLabel('disabled'), 'Nonaktif');
  assert.equal(vendorStatusLabel('unconfigured'), 'Belum dikonfigurasi');
});
