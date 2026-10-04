import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_REACH_SEARCH_QUERIES,
  parseAgentReachOutput,
  rankStoryCandidates,
  runAgentReachSearch
} from '../src/story-scout.js';

test('keeps Story Scout queries focused on recent positive human-interest news', () => {
  assert.equal(AGENT_REACH_SEARCH_QUERIES.length, 4);
  for (const query of AGENT_REACH_SEARCH_QUERIES) {
    assert.match(query, /category:news/i);
    assert.match(query, /(heartwarming|kindness|help|uplifting|inspiring)/i);
    assert.match(query, /recent/i);
  }
});

test('parses mcporter JSON output into story candidates', () => {
  const payload = {
    server: 'exa',
    tool: 'web_search_exa',
    result: {
      results: [
        {
          title: 'Stranger helps a family get home safely',
          url: 'https://example.com/story',
          publishedDate: '2026-10-04T02:00:00Z',
          author: 'Example Reporter',
          summary: 'A simple act of kindness helped a family during a difficult day.'
        }
      ]
    }
  };

  const candidates = parseAgentReachOutput(JSON.stringify(payload), AGENT_REACH_SEARCH_QUERIES[0]);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].title, 'Stranger helps a family get home safely');
  assert.equal(candidates[0].url, 'https://example.com/story');
  assert.equal(candidates[0].publishedDate, '2026-10-04T02:00:00Z');
  assert.match(candidates[0].snippet, /kindness/i);
});

test('ranks a recent human-kindness story above an older generic achievement story', () => {
  const ranked = rankStoryCandidates([
    {
      title: 'Journalist tears up after stranger offers a survivor a warm meal',
      url: 'https://example.com/kind',
      publishedDate: '2026-10-04T02:00:00Z',
      snippet: 'The small act of kindness moved everyone nearby.',
      sourceQueries: ['q1', 'q2']
    },
    {
      title: 'Company wins an industry award after years of growth',
      url: 'https://example.com/award',
      publishedDate: '2026-09-20T02:00:00Z',
      snippet: 'The company received another industry award.',
      sourceQueries: ['q1']
    }
  ], { now: new Date('2026-10-04T04:00:00Z') });

  assert.equal(ranked[0].url, 'https://example.com/kind');
  assert.ok(ranked[0].score > ranked[1].score);
});

test('invokes mcporter Exa search without an API key', async () => {
  let captured = null;
  const output = JSON.stringify({
    server: 'exa',
    tool: 'web_search_exa',
    result: { results: [] }
  });

  const result = await runAgentReachSearch({
    query: AGENT_REACH_SEARCH_QUERIES[0],
    numResults: 3,
    execFileImpl: async (command, args, options) => {
      captured = { command, args, options };
      return { stdout: output, stderr: '' };
    },
    env: {
      PATH: process.env.PATH || '',
      EXA_API_KEY: 'must-not-be-forwarded'
    }
  });

  assert.deepEqual(result, []);
  assert.equal(captured.command, 'mcporter');
  assert.ok(captured.args.includes('exa.web_search_exa'));
  assert.equal(captured.options.env.EXA_API_KEY, undefined);

  const jsonIndex = captured.args.indexOf('--args');
  const request = JSON.parse(captured.args[jsonIndex + 1]);
  assert.equal(request.numResults, 3);
  assert.equal(request.query, AGENT_REACH_SEARCH_QUERIES[0]);
});
