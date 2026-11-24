import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SYNTHETIC_EMAIL_DOMAIN,
  isSyntheticEmail,
  legacySyntheticEmailForPhone,
  syntheticEmailForPhone,
} from '../src/lib/synthetic-email.ts';

test('builds an agks.id address from an Indonesian phone number', () => {
  assert.equal(SYNTHETIC_EMAIL_DOMAIN, 'agks.id');
  assert.equal(syntheticEmailForPhone('+6283893092279'), '6283893092279@agks.id');
  assert.equal(syntheticEmailForPhone('083893092279'), '6283893092279@agks.id');
});

test('normalizes separators so one number yields one address', () => {
  const expected = '6283893092279@agks.id';
  assert.equal(syntheticEmailForPhone('+62 838-9309-2279'), expected);
  assert.equal(syntheticEmailForPhone('0838 9309 2279'), expected);
  assert.equal(syntheticEmailForPhone('6283893092279'), expected);
});

test('recognizes both the current and the legacy synthetic domain', () => {
  assert.equal(isSyntheticEmail('6283893092279@agks.id'), true);
  assert.equal(isSyntheticEmail('6283893092279@phone.payku.invalid'), true);
  assert.equal(isSyntheticEmail('6283893092279@AGKS.ID'), true);
  assert.equal(isSyntheticEmail('someone@gmail.com'), false);
  assert.equal(isSyntheticEmail('admin@agks.id.evil.test'), false);
});

test('keeps the legacy builder available for rows created before the change', () => {
  assert.equal(
    legacySyntheticEmailForPhone('+6283893092279'),
    '6283893092279@phone.payku.invalid',
  );
});
