import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReelStoryboard,
  buildReelSvg,
  selectTopReelPost
} from '../src/reel.js';

test('builds a three-slide reel storyboard from the source post', () => {
  const storyboard = buildReelStoryboard({
    imageText: 'Keep going.\nSmall steps still count.'
  });

  assert.equal(storyboard.length, 3);
  assert.equal(storyboard[0].role, 'hook');
  assert.equal(storyboard[0].text, 'Keep going.');
  assert.equal(storyboard[1].role, 'message');
  assert.match(storyboard[1].text, /Small steps still count/);
  assert.equal(storyboard[2].role, 'cta');
  assert.match(storyboard[2].text, /Follow A Little Better/);
});

test('builds a vertical Reel SVG with brand text', () => {
  const svg = buildReelSvg({
    role: 'hook',
    text: 'Keep going.'
  });

  assert.match(svg, /width="1080" height="1920"/);
  assert.match(svg, /A LITTLE BETTER/);
  assert.match(svg, /Keep going\./);
});

test('selects the strongest measured weekly post for a Reel', () => {
  const result = selectTopReelPost({
    weekStart: '2026-09-28',
    weekEnd: '2026-10-04',
    history: [
      { date: '2026-10-01', contentId: 'motivation-001', category: 'motivation', facebookPostId: 'p1' },
      { date: '2026-10-02', contentId: 'bible-001', category: 'bible', facebookPostId: 'p2' }
    ],
    analytics: {
      snapshots: [
        { facebookPostId: 'p1', contentId: 'motivation-001', category: 'motivation', engagement: 12, engagementRate: 0.02 },
        { facebookPostId: 'p2', contentId: 'bible-001', category: 'bible', engagement: 40, engagementRate: 0.08 }
      ]
    }
  });

  assert.equal(result.contentId, 'bible-001');
  assert.equal(result.facebookPostId, 'p2');
});
