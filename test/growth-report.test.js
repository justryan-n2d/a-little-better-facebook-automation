import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrowthReport } from '../src/growth-report.js';

test('builds a useful weekly report from captured metrics', () => {
  const report = buildGrowthReport({
    weekStart: '2026-09-28',
    weekEnd: '2026-10-04',
    history: [
      { date: '2026-10-01', contentId: 'motivation-001', category: 'motivation', facebookPostId: 'p1' },
      { date: '2026-10-02', contentId: 'bible-001', category: 'bible', facebookPostId: 'p2' }
    ],
    analytics: {
      version: 1,
      snapshots: [
        { facebookPostId: 'p1', contentId: 'motivation-001', category: 'motivation', postDate: '2026-10-01', capturedDate: '2026-10-03', reactions: 8, comments: 2, shares: 1, engagement: 15 },
        { facebookPostId: 'p2', contentId: 'bible-001', category: 'bible', postDate: '2026-10-02', capturedDate: '2026-10-03', reactions: 3, comments: 1, shares: 0, engagement: 5 }
      ],
      followerSnapshots: [
        { capturedAt: '2026-10-01T01:00:00.000Z', capturedDate: '2026-10-01', followersCount: 100 },
        { capturedAt: '2026-10-04T01:00:00.000Z', capturedDate: '2026-10-04', followersCount: 108 }
      ]
    }
  });

  assert.match(report, /A Little Better Growth Report/);
  assert.match(report, /motivation-001/);
  assert.match(report, /Followers/);
  assert.match(report, /Reel draft/);
});
