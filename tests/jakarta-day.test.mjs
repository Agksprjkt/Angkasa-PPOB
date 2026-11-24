import assert from 'node:assert/strict';
import test from 'node:test';
import { getJakartaDayStart } from '../src/lib/jakarta-day.ts';

test('uses the Jakarta calendar date before UTC midnight', () => {
  const dayStart = getJakartaDayStart(new Date('2026-11-18T16:59:59.000Z'));
  assert.equal(dayStart.toISOString(), '2026-11-17T17:00:00.000Z');
});

test('advances the dashboard day at midnight in Jakarta', () => {
  const dayStart = getJakartaDayStart(new Date('2026-11-18T17:00:00.000Z'));
  assert.equal(dayStart.toISOString(), '2026-11-18T17:00:00.000Z');
});
