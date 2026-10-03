import test from 'node:test';
import assert from 'node:assert/strict';
import { getDailyPost, getPhilippineDate } from '../src/content.js';

const history = [];

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

test('rejects invalid dates', () => {
  assert.throws(() => getDailyPost('not-a-date', []), /Invalid date/);
});

test('uses Philippine timezone date when requested', () => {
  const date = getPhilippineDate(new Date('2026-10-02T17:00:00.000Z'));
  assert.equal(date, '2026-10-03');
});
