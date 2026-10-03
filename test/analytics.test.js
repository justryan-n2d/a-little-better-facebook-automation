import test from 'node:test';
import assert from 'node:assert/strict';
import {
  engagementScore,
  getLatestPostSnapshots,
  summarizeCategoryPerformance,
  getFollowerDelta
} from '../src/analytics.js';

test('scores shares and comments more strongly than simple reactions', () => {
  assert.equal(
    engagementScore({ reactions: 10, comments: 2, shares: 1 }),
    17
  );
});

test('keeps the latest daily snapshot for each Facebook post', () => {
  const snapshots = [
    { facebookPostId: 'p1', capturedDate: '2026-10-03', engagement: 4 },
    { facebookPostId: 'p1', capturedDate: '2026-10-04', engagement: 9 },
    { facebookPostId: 'p2', capturedDate: '2026-10-04', engagement: 6 }
  ];

  assert.deepEqual(
    getLatestPostSnapshots(snapshots),
    [
      { facebookPostId: 'p1', capturedDate: '2026-10-04', engagement: 9 },
      { facebookPostId: 'p2', capturedDate: '2026-10-04', engagement: 6 }
    ]
  );
});

test('summarizes category performance from post-level snapshots', () => {
  assert.deepEqual(
    summarizeCategoryPerformance([
      { category: 'motivation', engagement: 10, reactions: 8, comments: 1, shares: 0 },
      { category: 'motivation', engagement: 20, reactions: 10, comments: 2, shares: 1 },
      { category: 'bible', engagement: 15, reactions: 10, comments: 0, shares: 1 }
    ]),
    [
      { category: 'bible', posts: 1, averageEngagement: 15, totalEngagement: 15 },
      { category: 'motivation', posts: 2, averageEngagement: 15, totalEngagement: 30 }
    ]
  );
});

test('calculates follower change from the first and last available snapshots', () => {
  assert.equal(
    getFollowerDelta([
      { capturedAt: '2026-10-01T10:00:00.000Z', followersCount: 100 },
      { capturedAt: '2026-10-03T10:00:00.000Z', followersCount: 113 }
    ]),
    13
  );
});
