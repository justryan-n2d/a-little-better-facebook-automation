import test from 'node:test';
import assert from 'node:assert/strict';
import { decideAnalyticsHealthAction, decideWatchdogAction } from '../src/watchdog.js';


test('does not alert for analytics before the daily analytics grace period', () => {
  const action = decideAnalyticsHealthAction({
    now: '2026-10-04T11:00:00.000Z',
    today: '2026-10-04',
    scheduleHour: 18,
    scheduleMinute: 0,
    graceMinutes: 120,
    analytics: {}
  });

  assert.deepEqual(action, {
    type: 'wait',
    reason: 'before-analytics-grace-period'
  });
});

test('alerts when analytics are stale after the daily grace period', () => {
  const action = decideAnalyticsHealthAction({
    now: '2026-10-04T13:30:00.000Z',
    today: '2026-10-04',
    scheduleHour: 18,
    scheduleMinute: 0,
    graceMinutes: 120,
    analytics: {
      collectorRuns: [
        {
          capturedDate: '2026-10-03',
          capturedAt: '2026-10-03T10:00:00.000Z',
          attemptedPosts: 1,
          successfulPosts: 1,
          errorCount: 0
        }
      ]
    }
  });

  assert.deepEqual(action, {
    type: 'alert',
    reason: 'analytics-stale',
    capturedDate: '2026-10-03'
  });
});

test('marks analytics healthy when today has successful collection', () => {
  const action = decideAnalyticsHealthAction({
    now: '2026-10-04T13:30:00.000Z',
    today: '2026-10-04',
    scheduleHour: 18,
    scheduleMinute: 0,
    graceMinutes: 120,
    analytics: {
      collectorRuns: [
        {
          capturedDate: '2026-10-04',
          capturedAt: '2026-10-04T10:00:00.000Z',
          attemptedPosts: 1,
          successfulPosts: 1,
          errorCount: 0
        }
      ]
    }
  });

  assert.deepEqual(action, {
    type: 'healthy',
    capturedDate: '2026-10-04'
  });
});


test('dispatches recovery when the daily run is missing after the grace period', () => {
  const action = decideWatchdogAction({
    now: '2026-10-04T02:30:00.000Z',
    today: '2026-10-04',
    scheduleHour: 9,
    scheduleMinute: 0,
    graceMinutes: 60,
    runs: []
  });

  assert.deepEqual(action, { type: 'dispatch', reason: 'missing-daily-run' });
});

test('retries a failed record job but does not re-run a publish failure', () => {
  const recordAction = decideWatchdogAction({
    now: '2026-10-04T02:00:00.000Z',
    today: '2026-10-04',
    scheduleHour: 9,
    scheduleMinute: 0,
    graceMinutes: 60,
    runs: [{
      id: 123,
      event: 'schedule',
      created_at: '2026-10-04T01:00:00.000Z',
      status: 'completed',
      conclusion: 'failure',
      run_attempt: 1,
      failedJobNames: ['record']
    }]
  });

  assert.deepEqual(recordAction, {
    type: 'rerun-failed-jobs',
    runId: 123,
    reason: 'record-job-failure'
  });

  const publishAction = decideWatchdogAction({
    now: '2026-10-04T02:00:00.000Z',
    today: '2026-10-04',
    scheduleHour: 9,
    scheduleMinute: 0,
    graceMinutes: 60,
    runs: [{
      id: 124,
      event: 'schedule',
      created_at: '2026-10-04T01:00:00.000Z',
      status: 'completed',
      conclusion: 'failure',
      run_attempt: 1,
      failedJobNames: ['publish']
    }]
  });

  assert.deepEqual(publishAction, {
    type: 'alert',
    runId: 124,
    reason: 'publish-job-failure'
  });
});

test('waits when the scheduled run is still active', () => {
  const action = decideWatchdogAction({
    now: '2026-10-04T02:00:00.000Z',
    today: '2026-10-04',
    scheduleHour: 9,
    scheduleMinute: 0,
    graceMinutes: 60,
    runs: [{
      id: 125,
      event: 'schedule',
      created_at: '2026-10-04T01:00:00.000Z',
      status: 'in_progress',
      conclusion: null,
      run_attempt: 1
    }]
  });

  assert.deepEqual(action, {
    type: 'wait',
    reason: 'daily-run-active',
    runId: 125
  });
});

test('handles a watchdog recovery run separately from the missing scheduled run', () => {
  const action = decideWatchdogAction({
    now: '2026-10-04T03:00:00.000Z',
    today: '2026-10-04',
    scheduleHour: 9,
    scheduleMinute: 0,
    graceMinutes: 60,
    runs: [{
      id: 126,
      event: 'repository_dispatch',
      created_at: '2026-10-04T02:45:00.000Z',
      status: 'in_progress',
      conclusion: null,
      run_attempt: 1
    }]
  });

  assert.deepEqual(action, {
    type: 'wait',
    reason: 'recovery-run-active',
    runId: 126
  });
});
