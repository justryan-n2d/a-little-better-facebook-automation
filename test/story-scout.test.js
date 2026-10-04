import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_REACH_SEARCH_QUERIES,
  parseAgentReachOutput,
  rankStoryCandidates,
  runAgentReachSearch,
  scoutStories,
  PUBLIC_SOCIAL_DISCOVERY_QUERY,
  detectPublicSocialPlatform,
  corroborateSocialStory,
  buildCorroborationQuery,
  scoreTrendSignals
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

test('parses mcporter MCP text content returned by the live Exa endpoint', () => {
  const payload = {
    content: [{
      type: 'text',
      text: [
        'Title: Stranger helps a family get home safely',
        'URL: https://example.com/live-story',
        'Published: 2026-10-04T02:00:00Z',
        'Author: Example Reporter',
        'Highlights:',
        'A simple act of kindness helped a family during a difficult day.'
      ].join('\n')
    }]
  };

  const candidates = parseAgentReachOutput(JSON.stringify(payload), AGENT_REACH_SEARCH_QUERIES[0]);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].title, 'Stranger helps a family get home safely');
  assert.equal(candidates[0].url, 'https://example.com/live-story');
  assert.equal(candidates[0].publishedDate, '2026-10-04T02:00:00Z');
  assert.equal(candidates[0].author, 'Example Reporter');
  assert.match(candidates[0].snippet, /kindness/i);
});

test('trending fresh kindness stories outrank ordinary fresh kindness stories', () => {
  const ranked = rankStoryCandidates([
    {
      title: 'Stranger helps family during a difficult day',
      url: 'https://example.com/ordinary',
      publishedDate: '2026-10-04T03:00:00Z',
      snippet: 'A kind act helped the family when they needed support.'
    },
    {
      title: 'Heartwarming kindness story is going viral online',
      url: 'https://www.tiktok.com/@example/video/456',
      publishedDate: '2026-10-04T03:00:00Z',
      snippet: 'The moment is trending and being widely shared across social media.'
    }
  ], { now: new Date('2026-10-04T04:00:00Z') });

  assert.ok(scoreTrendSignals(ranked[0]) > scoreTrendSignals(ranked[1]));
  assert.equal(ranked[0].url, 'https://www.tiktok.com/@example/video/456');
  assert.ok(ranked[0].trendScore >= 25);
  assert.ok(ranked[0].freshnessScore >= 17);
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

test('does not mistake safe words inside blocked terms', () => {
  const ranked = rankStoryCandidates([{
    title: 'Stranger offers a survivor a warm meal after a difficult day',
    url: 'https://example.com/warm-meal',
    publishedDate: '2026-10-04T02:00:00Z',
    snippet: 'A warm meal helped the survivor feel cared for.'
  }], { now: new Date('2026-10-04T04:00:00Z') });

  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].url, 'https://example.com/warm-meal');
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
  assert.ok(captured.args.includes('--http-url'));
  assert.ok(captured.args.includes('https://mcp.exa.ai/mcp'));
  assert.ok(captured.args.includes('web_search_exa'));
  assert.equal(captured.options.env.EXA_API_KEY, undefined);

  const jsonIndex = captured.args.indexOf('--args');
  const request = JSON.parse(captured.args[jsonIndex + 1]);
  assert.equal(request.numResults, 3);
  assert.equal(request.query, AGENT_REACH_SEARCH_QUERIES[0]);
});


test('public social discovery searches major public social platforms', () => {
  assert.match(PUBLIC_SOCIAL_DISCOVERY_QUERY, /site:x\.com/i);
  assert.match(PUBLIC_SOCIAL_DISCOVERY_QUERY, /site:instagram\.com/i);
  assert.match(PUBLIC_SOCIAL_DISCOVERY_QUERY, /site:facebook\.com/i);
  assert.match(PUBLIC_SOCIAL_DISCOVERY_QUERY, /site:tiktok\.com/i);
  assert.match(PUBLIC_SOCIAL_DISCOVERY_QUERY, /site:youtube\.com/i);
  assert.match(PUBLIC_SOCIAL_DISCOVERY_QUERY, /site:reddit\.com/i);
  assert.match(PUBLIC_SOCIAL_DISCOVERY_QUERY, /(trending|viral|widely shared)/i);
});

test('classifies supported public social source domains', () => {
  assert.equal(detectPublicSocialPlatform('https://x.com/example/status/123'), 'x');
  assert.equal(detectPublicSocialPlatform('https://www.instagram.com/p/example/'), 'instagram');
  assert.equal(detectPublicSocialPlatform('https://www.facebook.com/watch/?v=123'), 'facebook');
  assert.equal(detectPublicSocialPlatform('https://www.tiktok.com/@example/video/123'), 'tiktok');
  assert.equal(detectPublicSocialPlatform('https://www.youtube.com/watch?v=123'), 'youtube');
  assert.equal(detectPublicSocialPlatform('https://www.reddit.com/r/MadeMeSmile/comments/example/'), 'reddit');
  assert.equal(detectPublicSocialPlatform('https://example.com/story'), null);
});

test('recognizes a heartwarming animal story such as a dog protecting a baby', () => {
  const ranked = rankStoryCandidates([{
    title: 'Family says their dog protected a baby during a scary moment',
    url: 'https://www.tiktok.com/@example/video/123',
    publishedDate: '2026-10-04T03:00:00Z',
    snippet: 'The dog stayed close, alerted the family, and helped keep the baby safe.'
  }], { now: new Date('2026-10-04T04:00:00Z') });

  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].socialPlatform, 'tiktok');
  assert.equal(ranked[0].sourceType, 'public-social');
  assert.equal(ranked[0].topic, 'human-kindness');
  assert.ok(ranked[0].score >= 50);
});


test('builds a corroboration query that excludes social-only results', () => {
  const query = buildCorroborationQuery({
    title: 'Dog stays beside baby and helps keep child safe',
    snippet: 'The family says their dog protected the baby and alerted them when the child needed help.'
  });

  assert.match(query, /Dog stays beside baby/i);
  assert.match(query, /report|news|confirmed|covered/i);
  assert.match(query, /-site:x\.com/i);
  assert.match(query, /-site:tiktok\.com/i);
});

test('corroborates a public social story with an independent web source', async () => {
  const socialStory = {
    title: 'Dog stays beside baby and helps keep child safe',
    url: 'https://www.tiktok.com/@example/video/123',
    snippet: 'The family says their dog protected the baby and alerted them when the child needed help.',
    sourceType: 'public-social',
    socialPlatform: 'tiktok'
  };

  const output = JSON.stringify({
    content: [{
      type: 'text',
      text: [
        'Title: Family dog protects baby and alerts parents when child needs help',
        'URL: https://localnews.example/dog-baby-story',
        'Published: 2026-10-04T03:30:00Z',
        'Author: Example Reporter',
        'Highlights:',
        'A local news report says the family dog stayed close to the baby and alerted the parents when the child needed help.'
      ].join('\n')
    }]
  });

  const result = await corroborateSocialStory(socialStory, {
    now: new Date('2026-10-04T04:00:00Z'),
    execFileImpl: async (_command, args) => {
      const jsonIndex = args.indexOf('--args');
      const request = JSON.parse(args[jsonIndex + 1]);
      assert.match(request.query, /-site:tiktok\.com/i);
      return { stdout: output, stderr: '' };
    }
  });

  assert.equal(result.verified, true);
  assert.equal(result.corroboratingSource.url, 'https://localnews.example/dog-baby-story');
  assert.equal(result.corroboratingSource.sourceType, 'web');
  assert.equal(result.lead.url, socialStory.url);
});

test('rejects a public social story without a matching independent source', async () => {
  const socialStory = {
    title: 'Dog protects a baby',
    url: 'https://www.instagram.com/p/example/',
    snippet: 'A family dog helped keep the baby safe.',
    sourceType: 'public-social',
    socialPlatform: 'instagram'
  };

  const output = JSON.stringify({
    content: [{
      type: 'text',
      text: [
        'Title: Celebrity launches a new clothing line',
        'URL: https://unrelated.example/news',
        'Published: 2026-10-04T03:00:00Z',
        'Highlights:',
        'The announcement is unrelated to the social story.'
      ].join('\n')
    }]
  });

  await assert.rejects(
    corroborateSocialStory(socialStory, {
      now: new Date('2026-10-04T04:00:00Z'),
      execFileImpl: async () => ({ stdout: output, stderr: '' })
    }),
    /could not be independently corroborated/i
  );
});
