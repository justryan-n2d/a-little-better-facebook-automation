import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrowthReport } from '../src/growth-report.js';



test('reports performance by publish hour', () => {
  const report = buildGrowthReport({
    weekStart: '2026-10-05',
    weekEnd: '2026-10-11',
    history: [
      { date: '2026-10-06', contentId: 'mindset-001', category: 'mindset', facebookPostId: 'p1' },
      { date: '2026-10-07', contentId: 'bible-001', category: 'bible', facebookPostId: 'p2' }
    ],
    analytics: {
      snapshots: [
        { facebookPostId: 'p1', contentId: 'mindset-001', category: 'mindset', publishHour: 9, engagement: 10, engagementRate: 0.02 },
        { facebookPostId: 'p2', contentId: 'bible-001', category: 'bible', publishHour: 18, engagement: 30, engagementRate: 0.06 }
      ],
      followerSnapshots: []
    }
  });

  assert.match(report, /Publish time performance/);
  assert.match(report, /9:00 AM/);
  assert.match(report, /6:00 PM/);
});


test('reports performance by experiment traits', () => {
  const report = buildGrowthReport({
    weekStart: '2026-10-05',
    weekEnd: '2026-10-11',
    history: [
      {
        date: '2026-10-06',
        contentId: 'mindset-001',
        category: 'mindset',
        facebookPostId: 'p1',
        experiment: {
          selectionMode: 'explore',
          contentTraits: {
            hookType: 'direct-statement',
            ctaType: 'question',
            textLength: 'short'
          }
        }
      },
      {
        date: '2026-10-07',
        contentId: 'bible-001',
        category: 'bible',
        facebookPostId: 'p2',
        experiment: {
          selectionMode: 'exploit',
          contentTraits: {
            hookType: 'contrast',
            ctaType: 'save',
            textLength: 'medium'
          }
        }
      }
    ],
    analytics: {
      snapshots: [
        {
          facebookPostId: 'p1',
          contentId: 'mindset-001',
          category: 'mindset',
          engagement: 10,
          engagementRate: 0.02,
          experiment: {
            selectionMode: 'explore',
            contentTraits: {
              hookType: 'direct-statement',
              ctaType: 'question',
              textLength: 'short'
            }
          }
        },
        {
          facebookPostId: 'p2',
          contentId: 'bible-001',
          category: 'bible',
          engagement: 20,
          engagementRate: 0.04,
          experiment: {
            selectionMode: 'exploit',
            contentTraits: {
              hookType: 'contrast',
              ctaType: 'save',
              textLength: 'medium'
            }
          }
        }
      ],
      followerSnapshots: []
    }
  });

  assert.match(report, /Experiment performance/);
  assert.match(report, /Hook type/);
  assert.match(report, /direct-statement/);
  assert.match(report, /CTA type/);
  assert.match(report, /save/);
  assert.match(report, /Selection mode/);
  assert.match(report, /explore/);
});


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
  assert.match(report, /motivation/);
  assert.match(report, /Follow for daily reminders to keep going/);
});
