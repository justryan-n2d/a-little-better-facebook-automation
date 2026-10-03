import test from 'node:test';
import assert from 'node:assert/strict';
import {
  engagementScore,
  getLatestPostSnapshots,
  summarizeCategoryPerformance,
  getFollowerDelta,
  getLatestContentPerformance,
  performanceScore
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

test('uses engagement rate as the adaptive content performance score when available', () => {
  assert.equal(
    performanceScore({ engagement: 90, reach: 1000, engagementRate: 0.09 }),
    0.09
  );
});

test('keeps the latest performance snapshot for each content id', () => {
  const latest = getLatestContentPerformance([
    { contentId: 'motivation-001', capturedAt: '2026-10-03T18:00:00Z', engagementRate: 0.04 },
    { contentId: 'motivation-001', capturedAt: '2026-10-04T18:00:00Z', engagementRate: 0.08 },
    { contentId: 'bible-001', capturedAt: '2026-10-04T18:00:00Z', engagementRate: 0.06 }
  ]);

  assert.equal(latest.get('motivation-001').engagementRate, 0.08);
  assert.equal(latest.get('bible-001').engagementRate, 0.06);
});
