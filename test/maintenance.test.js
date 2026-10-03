import test from 'node:test';
import assert from 'node:assert/strict';
import { getContentBankStatus, getExpirationWarning, getThresholdWarning } from '../src/maintenance.js';

test('counts unique unused content correctly', () => {
  const status = getContentBankStatus(
    [{ id: 'a' }, { id: 'b' }, { id: 'b' }, { id: 'c' }],
    [{ contentId: 'a' }, { contentId: 'a' }]
  );

  assert.deepEqual(status, {
    total: 3,
    used: 1,
    remaining: 2
  });
});

test('flags content bank exactly at a configured threshold', () => {
  assert.deepEqual(getThresholdWarning(5, [10, 5, 2]), { value: 5 });
  assert.equal(getThresholdWarning(4, [10, 5, 2]), null);
});

test('calculates token data-access warning from Unix seconds', () => {
  const now = '2026-10-03T00:00:00.000Z';
  const expiresAt = Math.floor(new Date('2026-10-08T00:00:00.000Z').getTime() / 1000);

  assert.deepEqual(
    getExpirationWarning({
      now,
      expiresAt,
      thresholds: [7, 5, 2, 1, 0]
    }),
    {
      daysLeft: 5,
      threshold: 5,
      expiresAt: '2026-10-08T00:00:00.000Z',
      expired: false
    }
  );
});

test('does not warn between configured token thresholds', () => {
  const warning = getExpirationWarning({
    now: '2026-10-03T00:00:00.000Z',
    expiresAt: '2026-10-07T00:00:00.000Z',
    thresholds: [7, 5, 2, 1, 0]
  });

  assert.equal(warning, null);
});

test('flags expired token data access', () => {
  const warning = getExpirationWarning({
    now: '2026-10-03T00:00:00.000Z',
    expiresAt: '2026-10-02T12:00:00.000Z',
    thresholds: [5, 2, 1, 0]
  });

  assert.equal(warning?.expired, true);
  assert.equal(warning?.daysLeft, 0);
});
