import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTimingPlan,
  shouldPublishAtHour,
  getTimingVariant
} from '../src/timing.js';

test('uses 6 PM for the first Wednesday experiment week', () => {
  assert.deepEqual(getTimingPlan('2026-10-07'), {
    weekday: 'wednesday',
    baselineHour: 9,
    experimentHour: 18,
    selectedHour: 18,
    variant: 'experiment'
  });
});

test('switches the same weekday back to 9 AM on the next week', () => {
  assert.deepEqual(getTimingPlan('2026-10-14'), {
    weekday: 'wednesday',
    baselineHour: 9,
    experimentHour: 18,
    selectedHour: 9,
    variant: 'baseline'
  });
});

test('leaves non-Wednesday posts at the baseline hour', () => {
  assert.deepEqual(getTimingPlan('2026-10-08'), {
    weekday: 'thursday',
    baselineHour: 9,
    experimentHour: 18,
    selectedHour: 9,
    variant: 'baseline'
  });
});

test('matches only the selected publishing hour for scheduled runs', () => {
  assert.equal(
    shouldPublishAtHour('2026-10-07T01:00:00.000Z'),
    false
  );
  assert.equal(
    shouldPublishAtHour('2026-10-07T10:00:00.000Z'),
    true
  );
});

test('returns a stable timing variant for a date', () => {
  assert.equal(getTimingVariant('2026-10-07'), 'experiment');
  assert.equal(getTimingVariant('2026-10-14'), 'baseline');
});
