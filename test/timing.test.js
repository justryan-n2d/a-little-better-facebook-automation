import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTimingPlan,
  shouldPublishAtHour,
  getTimingVariant
} from '../src/timing.js';

test('uses 4 PM as the regular daily publishing hour every day', () => {
  assert.deepEqual(getTimingPlan('2026-10-05'), {
    weekday: 'monday',
    selectedHour: 16,
    variant: 'standard'
  });

  assert.deepEqual(getTimingPlan('2026-10-07'), {
    weekday: 'wednesday',
    selectedHour: 16,
    variant: 'standard'
  });
});

test('matches only the 4 PM Philippines publishing hour', () => {
  assert.equal(
    shouldPublishAtHour('2026-10-07T07:59:59.000Z'),
    false
  );
  assert.equal(
    shouldPublishAtHour('2026-10-07T08:00:00.000Z'),
    true
  );
  assert.equal(
    shouldPublishAtHour('2026-10-07T08:59:59.000Z'),
    true
  );
  assert.equal(
    shouldPublishAtHour('2026-10-07T09:00:00.000Z'),
    false
  );
});

test('returns a stable standard timing variant for any date', () => {
  assert.equal(getTimingVariant('2026-10-05'), 'standard');
  assert.equal(getTimingVariant('2026-10-07'), 'standard');
});

test('regular daily workflow exposes only the 4 PM schedule and marks scheduled runs', async () => {
  const fs = await import('node:fs/promises');
  const workflow = await fs.readFile('.github/workflows/daily-facebook-post.yml', 'utf8');

  assert.match(workflow, /cron: "0 16 \* \* \*"/);
  assert.doesNotMatch(workflow, /cron: "0 9 \* \* \*"/);
  assert.doesNotMatch(workflow, /cron: "0 18 \* \* 3"/);
  assert.match(workflow, /SCHEDULED_RUN: \$\{\{ github\.event_name == 'schedule' \}\}/);
  assert.match(workflow, /did_publish/);
});

test('Fresh News workflow remains scheduled for 11 AM Philippines time', async () => {
  const fs = await import('node:fs/promises');
  const workflow = await fs.readFile('.github/workflows/a-little-better-fresh-news.yml', 'utf8');

  assert.match(workflow, /cron: "0 11 \* \* \*"/);
});
