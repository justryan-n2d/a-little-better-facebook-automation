import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePostMetrics,
  parsePageFollowerCount,
  parseInsightValues,
  addDerivedPerformanceMetrics,
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



test('records the Manila publish hour when available', () => {
  const parsed = parsePostMetrics({
    id: '123_999'
  }, {
    contentId: 'motivation-001',
    category: 'motivation',
    postDate: '2026-10-03',
    publishedAt: '2026-10-03T01:00:00.000Z'
  });

  assert.equal(parsed.publishHour, 9);
});


test('carries experiment metadata into collected post metrics', () => {
  const experiment = {
    selectionMode: 'explore',
    contentTraits: {
      hookType: 'imperative',
      ctaType: 'save',
      textLength: 'short'
    }
  };

  assert.deepEqual(
    parsePostMetrics({
      id: '123_789',
      created_time: '2026-10-06T09:00:00+0000'
    }, {
      contentId: 'mindset-001',
      category: 'mindset',
      postDate: '2026-10-06',
      experiment
    }),
    {
      facebookPostId: '123_789',
      contentId: 'mindset-001',
      category: 'mindset',
      postDate: '2026-10-06',
      permalinkUrl: null,
      reactions: 0,
      comments: 0,
      shares: 0,
      engagement: 0,
      experiment
    }
  );
});


test('parses a numeric Page follower count', () => {
  assert.equal(parsePageFollowerCount({ followers_count: 217 }), 217);
  assert.equal(parsePageFollowerCount({ followers_count: 'not-a-number' }), null);
});

test('maps available Meta insight metrics into stable analytics fields', () => {
  assert.deepEqual(
    parseInsightValues({
      data: [
        { name: 'post_impressions_unique', values: [{ value: 91 }] },
        { name: 'post_engaged_users', values: [{ value: 17 }] }
      ]
    }),
    {
      reach: 91,
      engagedUsers: 17
    }
  );
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

test('derives engagement and interaction rates from available reach', () => {
  assert.deepEqual(
    addDerivedPerformanceMetrics({
      reactions: 10,
      comments: 3,
      shares: 2,
      engagement: 22,
      reach: 1000,
      engagedUsers: 40
    }),
    {
      reactions: 10,
      comments: 3,
      shares: 2,
      engagement: 22,
      reach: 1000,
      engagedUsers: 40,
      engagementRate: 0.022,
      reactionRate: 0.01,
      commentRate: 0.003,
      shareRate: 0.002,
      engagedUserRate: 0.04
    }
  );
});

test('does not invent rates when reach is unavailable', () => {
  const snapshot = { engagement: 10, reactions: 5, comments: 2, shares: 1 };
  assert.deepEqual(addDerivedPerformanceMetrics(snapshot), snapshot);
});
