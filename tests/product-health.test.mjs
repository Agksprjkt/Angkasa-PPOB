import assert from 'node:assert/strict';
import test from 'node:test';

import {
  afterFailedOrder,
  afterSuccessfulOrder,
  effectiveStreak,
  failureStreakLimit,
  failureWindowMs,
  isVendorOutage,
  shouldAutoEnable,
} from '../src/lib/product-health.ts';

const healthy = { status: 'active', disabledBy: null, failureStreak: 0 };

test('provider outage codes are recognised', () => {
  for (const rc of ['44', '45', '47', '48']) {
    assert.equal(isVendorOutage(rc), true, `rc ${rc}`);
  }
  assert.equal(isVendorOutage('00'), false);
  assert.equal(isVendorOutage(null), false);
  assert.equal(isVendorOutage(undefined), false);
});

test('an outage in the message text counts as well', () => {
  assert.equal(isVendorOutage('99', 'Produk sedang GANGGUAN'), true);
  assert.equal(isVendorOutage('', 'Biller maintenance'), true);
  assert.equal(isVendorOutage('99', 'Saldo tidak cukup'), false);
});

test('one outage disables immediately', () => {
  const next = afterFailedOrder(healthy, '47', 'gangguan');
  assert.equal(next.disable, true);
  assert.equal(next.failureStreak, 1);
  assert.match(next.reason ?? '', /Gangguan penyedia/);
});

test('ordinary failures need to repeat before disabling', () => {
  let product = healthy;
  for (let attempt = 1; attempt < failureStreakLimit; attempt += 1) {
    const next = afterFailedOrder(product, '99', 'timeout');
    assert.equal(next.disable, false, `attempt ${attempt}`);
    product = { ...product, failureStreak: next.failureStreak };
  }
  const final = afterFailedOrder(product, '99', 'timeout');
  assert.equal(final.disable, true);
  assert.equal(final.failureStreak, failureStreakLimit);
  assert.match(final.reason ?? '', /beruntun/);
});

test('an already disabled product is not disabled twice', () => {
  const next = afterFailedOrder(
    { status: 'inactive', disabledBy: 'system', failureStreak: 2 },
    '47',
    'gangguan',
  );
  assert.equal(next.disable, false);
});

test('an admin-disabled product can still be disabled by the switch', () => {
  // The admin turned it off, but the vendor also broke: recording the reason is
  // harmless and keeps the dashboard truthful.
  const next = afterFailedOrder(
    { status: 'inactive', disabledBy: 'admin', failureStreak: 0 },
    '47',
    'gangguan',
  );
  assert.equal(next.disable, true);
});

test('a success resets the streak', () => {
  assert.deepEqual(afterSuccessfulOrder(), { failureStreak: 0, enable: true });
});

test('sync only revives what the system disabled', () => {
  assert.equal(shouldAutoEnable({ status: 'inactive', disabledBy: 'system' }, true), true);
  assert.equal(shouldAutoEnable({ status: 'inactive', disabledBy: 'admin' }, true), false);
  assert.equal(shouldAutoEnable({ status: 'inactive', disabledBy: null }, true), false);
  assert.equal(shouldAutoEnable({ status: 'active', disabledBy: null }, true), false);
  assert.equal(shouldAutoEnable({ status: 'inactive', disabledBy: 'system' }, false), false);
});

test('a streak older than the window starts over', () => {
  const now = new Date('2026-11-28T10:00:00.000Z');
  const stale = new Date(now.getTime() - failureWindowMs - 1000);
  assert.equal(effectiveStreak({ failureStreak: 2, lastFailureAt: stale }, now), 0);
  assert.equal(
    effectiveStreak({ failureStreak: 2, lastFailureAt: new Date(now.getTime() - 1000) }, now),
    2,
  );
});

test('two failures last month plus one today is not a streak of three', () => {
  const now = new Date('2026-11-28T10:00:00.000Z');
  const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const next = afterFailedOrder(
    { status: 'active', disabledBy: null, failureStreak: 2, lastFailureAt: lastMonth },
    '99',
    'timeout',
    now,
  );
  assert.equal(next.failureStreak, 1);
  assert.equal(next.disable, false);
});

test('an outage still disables even when the last failure was long ago', () => {
  const now = new Date('2026-11-28T10:00:00.000Z');
  const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const next = afterFailedOrder(
    { status: 'active', disabledBy: null, failureStreak: 2, lastFailureAt: lastMonth },
    '45',
    'gangguan',
    now,
  );
  assert.equal(next.disable, true);
});
