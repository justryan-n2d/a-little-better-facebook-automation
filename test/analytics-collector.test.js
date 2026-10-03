import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePostMetrics,
  upsertDailySnapshot
} from '../src/analytics-collector.js';

test('parses engagement counts from a Meta post response', () => {
  const parsed = parsePostMetrics({
    id: '123_456',
    created_time: '2026-10-03T09:00:00+0000',
    permalink_url: 'https://facebook.com/example',
    shares: { count: 4 },
    comments: { summary: { total_count: 3 } },
    reactions: { summary: { total_count: 10 } }
  }, {
    contentId: 'motivation-001',
    category: 'motivation',
    postDate: '2026-10-03'
  });

  assert.deepEqual(parsed, {
    facebookPostId: '123_456',
    contentId: 'motivation-001',
    category: 'motivation',
    postDate: '2026-10-03',
    permalinkUrl: 'https://facebook.com/example',
    reactions: 10,
    comments: 3,
    shares: 4,
    engagement: 28
  });
});

test('replaces the same post snapshot for the same capture date', () => {
  const store = {
    version: 1,
    snapshots: [
      { facebookPostId: 'p1', capturedDate: '2026-10-03', engagement: 2 }
    ],
    followerSnapshots: []
  };

  const result = upsertDailySnapshot(
    store,
    { facebookPostId: 'p1', capturedDate: '2026-10-03', engagement: 9 }
  );

  assert.deepEqual(result.snapshots, [
    { facebookPostId: 'p1', capturedDate: '2026-10-03', engagement: 9 }
  ]);
});
