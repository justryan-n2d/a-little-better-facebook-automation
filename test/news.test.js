import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNewsHook,
  buildNewsAngle,
  extractGdeltArticles,
  extractGoogleNewsRssArticles,
  searchGdelt,
  searchFreshNews,
  isSafeNewsCandidate,
  selectFreshStory
} from '../src/news.js';
import { buildNewsSvg } from '../src/news-image.js';
import { runNewsPost } from '../src/news-post.js';

test('rejects unsafe or obviously graphic headlines', () => {
  assert.equal(isSafeNewsCandidate('Woman survives an unexpected roof fall'), true);
  assert.equal(isSafeNewsCandidate('Graphic murder scene shocks city'), false);
  assert.equal(isSafeNewsCandidate('Tiny update'), false);
});

test('uses one combined GDELT request for all content themes', async () => {
  const calls = [];
  const result = await searchGdelt({
    queries: ['(student OR school) success', '(science OR innovation) discovery'],
    fetchImpl: async url => {
      calls.push(String(url));
      return new Response(JSON.stringify({
        articles: [{
          title: 'Student wins science award',
          url: 'https://example.com/story',
          domain: 'example.com',
          seendate: '20261003030000'
        }]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /student/i);
  assert.match(calls[0], /science/i);
  assert.equal(result.length, 1);
});

test('extracts GDELT article list', () => {
  const items = extractGdeltArticles({
    articles: [{ title: 'A story', url: 'https://example.com/a' }]
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'A story');
});

test('selects a recent multi-source story and avoids used URLs', () => {
  const now = new Date('2026-10-03T04:00:00Z');
  const selected = selectFreshStory([
    {
      title: 'Student wins national science award',
      url: 'https://one.example/story',
      domain: 'one.example',
      seendate: '20261003030000',
      rank: 2
    },
    {
      title: 'Student wins national science award',
      url: 'https://two.example/story',
      domain: 'two.example',
      seendate: '20261003020000',
      rank: 4
    },
    {
      title: 'Student wins national science award',
      url: 'https://one.example/old',
      domain: 'one.example',
      seendate: '20260925020000',
      rank: 1
    }
  ], {
    now,
    usedUrls: []
  });

  assert.equal(selected.sourceCount, 2);
  assert.equal(selected.domain, 'one.example');
});

test('avoids previously used title fingerprints', () => {
  const selected = selectFreshStory([{
    title: 'A heartwarming community volunteer story',
    url: 'https://example.com/new',
    domain: 'example.com',
    seendate: '20261003030000',
    rank: 1
  }], {
    usedTitles: ['A heartwarming community volunteer story'],
    now: new Date('2026-10-03T04:00:00Z')
  });
  assert.equal(selected, null);
});

test('parses Google News RSS fallback articles', () => {
  const xml = '<rss><channel><item><title><![CDATA[Student wins national science award]]></title><link>https://example.com/story</link><pubDate>Sat, 03 Oct 2026 03:00:00 GMT</pubDate><source>Example News</source></item></channel></rss>';
  const items = extractGoogleNewsRssArticles(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Student wins national science award');
  assert.equal(items[0].domain, 'Example News');
});

test('falls back to Google News RSS after a GDELT failure', async () => {
  const calls = [];
  const result = await searchFreshNews({
    queries: ['student success'],
    fetchImpl: async url => {
      calls.push(String(url));
      if (String(url).includes('gdeltproject.org')) {
        return new Response('rate limited', { status: 429 });
      }
      return new Response('<rss><channel><item><title>Student wins national science award</title><link>https://example.com/story</link><pubDate>Sat, 03 Oct 2026 03:00:00 GMT</pubDate><source>Example News</source></item></channel></rss>', { status: 200, headers: { 'content-type': 'application/rss+xml' } });
    }
  });
  assert.equal(result.provider, 'google-news-rss');
  assert.equal(result.articles.length, 1);
  assert.equal(calls.filter(url => url.includes('gdeltproject.org')).length, 1);
});

test('builds a category-aware hook and original angle', () => {
  assert.match(buildNewsHook('Student receives award for science project'), /student/i);
  assert.match(buildNewsHook('New science discovery changes how we see space'), /development/i);
  assert.match(buildNewsAngle('Student receives award for science project'), /achievements/i);
});

test('news SVG contains the brand, source, and original angle', () => {
  const svg = buildNewsSvg({
    imageDataBase64: 'dGVzdA==',
    hook: 'A new story is catching attention today.',
    title: 'Student wins national science award',
    sourceDomain: 'example.com',
    angle: 'Small achievements can become big reasons for people to keep going.',
    photoCredit: 'Creator / Openverse / CC0'
  });
  assert.match(svg, /A LITTLE BETTER/);
  assert.match(svg, /Source: example.com/);
  assert.match(svg, /Small achievements/);
});

test('news post runner is importable', () => {
  assert.equal(typeof runNewsPost, 'function');
});
