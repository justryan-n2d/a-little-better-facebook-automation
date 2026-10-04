import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNewsCaption } from '../src/news.js';

const base = {
  title: 'Stranger helps storm-damaged home',
  sourceDomain: 'example.com',
  sourceUrl: 'https://example.com/story',
  hook: 'A simple act of kindness is reminding people what matters.',
  angle: 'Small acts of care can make a hard day feel a little lighter.',
  photoCredit: 'Source article image / example.com',
  story: { title: 'Stranger helps storm-damaged home', trendScore: 0 }
};

test('caption includes the required 2 to 3 sentence summary', () => {
  const summary = 'A stranger brought materials to help a storm-damaged home. He gathered a crew and covered the damaged roof with a tarp.';
  const caption = buildNewsCaption({ ...base, summary });
  assert.match(caption, /Summary:\nA stranger brought materials to help a storm-damaged home\. He gathered a crew and covered the damaged roof with a tarp\./);
});

test('caption guard rejects unsupported trend language inside summary', () => {
  assert.throws(
    () => buildNewsCaption({
      ...base,
      summary: 'Everyone is going viral over this stranger and the internet is loving it. People across social media are sharing the story.'
    }),
    /unsupported-trend-claim/i
  );
});

test('caption guard checks summary against verified article attribution', () => {
  assert.throws(
    () => buildNewsCaption({
      ...base,
      title: 'Family receives help after storm damage',
      summary: 'A neighbor arrived with materials and helped repair the home. The family received support during a difficult time.',
      sourceArticleText: 'The family says a neighbor arrived with materials and helped repair the home.'
    }),
    /dropped-source-attribution/i
  );
});
