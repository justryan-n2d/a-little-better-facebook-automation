import test from 'node:test';
import assert from 'node:assert/strict';
import { buildArticleSummary, fetchArticleSummary } from '../src/article-summary.js';

test('buildArticleSummary returns a grounded 2 to 3 sentence summary', () => {
  const html = `
    <html><body>
      <article>
        <p>Gilbert Kirk saw that a Wyandotte County home had been damaged by a storm.</p>
        <p>He brought materials and gathered a crew to cover the damaged home with a tarp.</p>
        <p>More neighbors later joined the effort and helped the family.</p>
      </article>
    </body></html>
  `;

  const summary = buildArticleSummary({
    html,
    storyTitle: 'Stranger keeps promise to cover storm-damaged Wyandotte County home with tarp'
  });

  const sentences = summary.match(/[^.!?]+[.!?]+/g) || [];
  assert.ok(sentences.length >= 2 && sentences.length <= 3);
  assert.match(summary, /Gilbert Kirk saw that a Wyandotte County home had been damaged by a storm\./);
  assert.match(summary, /gathered a crew to cover the damaged home with a tarp\./);
  assert.doesNotMatch(summary, /neighbors later joined the effort/i);
});

test('fetchArticleSummary uses only the verified publishing article URL', async () => {
  const calls = [];
  const result = await fetchArticleSummary({
    story: {
      title: 'Stranger helps storm-damaged home',
      url: 'https://example.com/story'
    },
    fetchImpl: async (input, init) => {
      calls.push({ url: String(input), redirect: init?.redirect });
      if (String(input) === 'https://example.com/story') {
        return new Response(`
          <html><body><article>
            <p>A stranger brought a tarp to a storm-damaged home.</p>
            <p>The helper gathered a crew and covered the damaged roof.</p>
          </article></body></html>
        `, {
          status: 200,
          headers: { 'content-type': 'text/html' }
        });
      }
      throw new Error('unexpected URL: ' + input);
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].redirect, 'follow');
  assert.equal(result.url, 'https://example.com/story');
  assert.ok((result.summary.match(/[^.!?]+[.!?]+/g) || []).length >= 2);
});
