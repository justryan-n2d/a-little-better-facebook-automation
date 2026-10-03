import test from 'node:test';
import assert from 'node:assert/strict';
import { getDailyPost, getPhilippineDate } from '../src/content.js';

const history = [];

test('adds experiment metadata to each selected post', () => {
  const post = getDailyPost('2026-10-06', []);

  assert.deepEqual(post.experiment, {
    selectionMode: 'explore',
    contentTraits: {
      hookType: 'direct-statement',
      ctaType: 'question',
      textLength: 'short'
    }
  });
});


test('records the deterministic visual variant in experiment metadata', () => {
  const post = getDailyPost('2026-10-06', []);

  assert.ok(['mint', 'alternate', 'minimal', 'framed'].includes(
    post.experiment.contentTraits.visualVariant
  ));
  assert.equal(
    post.experiment.contentTraits.visualVariant,
    getDailyPost('2026-10-06', []).experiment.contentTraits.visualVariant
  );
});


test('generates a complete daily post with CTA', () => {
  const post = getDailyPost('2026-10-03', history);
  assert.equal(post.date, '2026-10-03');
  assert.ok(post.category);
  assert.ok(post.imageText);
  assert.ok(post.caption.includes('A Little Better'));
  assert.ok(post.caption.includes('Follow A Little Better'));
});

test('does not repeat the same content immediately when history is present', () => {
  const first = getDailyPost('2026-10-03', []);
  const nextHistory = [{ date: '2026-10-03', contentId: first.contentId }];
  const second = getDailyPost('2026-10-04', nextHistory);
  assert.notEqual(second.contentId, first.contentId);
});

test('uses performance data to prefer a strong eligible post after the reuse cooldown', () => {
  const analytics = {
    snapshots: [
      {
        facebookPostId: 'facebook-001',
        contentId: 'motivation-001',
        category: 'motivation',
        capturedDate: '2026-10-31',
        reach: 1000,
        engagement: 200,
        engagementRate: 0.2
      }
    ]
  };

  const history = [
    { date: '2026-10-01', contentId: 'motivation-001' },
    { date: '2026-10-31', contentId: 'motivation-002' }
  ];

  const post = getDailyPost('2026-11-02', history, analytics);

  assert.equal(post.category, 'motivation');
  assert.equal(post.contentId, 'motivation-001');
});

test('explores an unmeasured candidate on exploration days', () => {
  const analytics = {
    snapshots: [
      {
        facebookPostId: 'facebook-002',
        contentId: 'motivation-001',
        category: 'motivation',
        capturedDate: '2026-12-20',
        reach: 1000,
        engagement: 200,
        engagementRate: 0.2
      }
    ]
  };

  const history = [
    { date: '2026-12-20', contentId: 'motivation-003' },
    { date: '2026-12-20', contentId: 'motivation-004' },
    { date: '2026-12-20', contentId: 'motivation-005' },
    { date: '2026-12-20', contentId: 'motivation-006' },
    { date: '2026-12-20', contentId: 'motivation-007' },
    { date: '2026-12-20', contentId: 'motivation-008' },
    { date: '2026-12-20', contentId: 'motivation-009' }
  ];

  const post = getDailyPost('2026-12-21', history, analytics);

  assert.equal(post.category, 'motivation');
  assert.equal(post.contentId, 'motivation-002');
});

test('rejects invalid dates', () => {
  assert.throws(() => getDailyPost('not-a-date', []), /Invalid date/);
});

test('uses Philippine timezone date when requested', () => {
  const date = getPhilippineDate(new Date('2026-10-02T17:00:00.000Z'));
  assert.equal(date, '2026-10-03');
});
