import { execFile as defaultExecFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  getLittleBetterTopic,
  isHeartwarmingHumanStory,
  isSafeNewsCandidate,
  searchFreshNews
} from './news.js';

const execFileAsync = promisify(defaultExecFile);
export const PUBLIC_SOCIAL_DISCOVERY_QUERY =
  'recent heartwarming kindness real life story person or animal helping someone ' +
  '(site:x.com OR site:twitter.com OR site:instagram.com OR site:facebook.com OR site:tiktok.com OR site:youtube.com OR site:reddit.com OR site:threads.net)';

const PUBLIC_SOCIAL_DOMAINS = [
  ['x.com', 'x'],
  ['twitter.com', 'x'],
  ['instagram.com', 'instagram'],
  ['facebook.com', 'facebook'],
  ['tiktok.com', 'tiktok'],
  ['youtube.com', 'youtube'],
  ['reddit.com', 'reddit'],
  ['threads.net', 'threads']
];

export function detectPublicSocialPlatform(value) {
  try {
    const hostname = new URL(value).hostname.replace(/^www\./, '').toLowerCase();
    for (const [domain, platform] of PUBLIC_SOCIAL_DOMAINS) {
      if (hostname === domain || hostname.endsWith('.' + domain)) {
        return platform;
      }
    }
  } catch {}
  return null;
}

function sourceMetadata(url) {
  const socialPlatform = detectPublicSocialPlatform(url);
  return {
    sourceType: socialPlatform ? 'public-social' : 'web',
    socialPlatform
  };
}

const CORROBORATION_EXCLUDED_SOCIAL_SITES = [
  'x.com', 'twitter.com', 'instagram.com', 'facebook.com',
  'tiktok.com', 'youtube.com', 'reddit.com', 'threads.net'
];

function storyTokens(story) {
  return [...new Set(
    cleanText([story?.title, story?.snippet].filter(Boolean).join(' '))
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(token =>
        token.length >= 4 &&
        !['story', 'says', 'said', 'family', 'people', 'person', 'helped', 'helping', 'recent'].includes(token)
      )
  )];
}

function corroborationMatchScore(story, candidate) {
  const tokens = storyTokens(story);
  const text = cleanText([candidate?.title, candidate?.snippet].filter(Boolean).join(' ')).toLowerCase();
  const matches = tokens.filter(token => containsTerm(text, token));
  const uniqueMatches = [...new Set(matches)];

  let score = uniqueMatches.length * 10;
  if (uniqueMatches.length >= 3) score += 15;
  if (uniqueMatches.length >= 5) score += 10;

  return {
    score: Math.min(100, score),
    matches: uniqueMatches
  };
}

export function buildCorroborationQuery(story) {
  const title = cleanText(story?.title);
  const phrase = title.length > 120 ? title.slice(0, 120) : title;
  const exclusions = CORROBORATION_EXCLUDED_SOCIAL_SITES
    .map(site => '-site:' + site)
    .join(' ');

  return `"${phrase}" recent report news confirmed covered ${exclusions}`;
}

export async function corroborateSocialStory(story, {
  numResults = 8,
  now = new Date(),
  execFileImpl = execFileAsync
} = {}) {
  if (story?.sourceType !== 'public-social') {
    return {
      verified: false,
      reason: 'not-a-public-social-lead',
      lead: story
    };
  }

  const query = buildCorroborationQuery(story);
  let candidates = [];

  try {
    candidates = await runAgentReachSearch({
      query,
      numResults,
      execFileImpl
    });
  } catch (error) {
    throw new Error(
      'Public social story corroboration search failed: ' +
      (error instanceof Error ? error.message : String(error))
    );
  }

  const ranked = candidates
    .filter(candidate => candidate?.url && !detectPublicSocialPlatform(candidate.url))
    .filter(candidate => candidate.url !== story.url)
    .map(candidate => {
      const match = corroborationMatchScore(story, candidate);
      const age = hoursOld(candidate.publishedDate || candidate.seendate, now);
      const freshnessBonus = age === null
        ? 0
        : age <= 48 ? 10
        : age <= 120 ? 5
        : age <= 168 ? 2
        : -10;

      return {
        ...candidate,
        ...sourceMetadata(candidate.url),
        corroborationScore: Math.max(0, Math.min(100, match.score + freshnessBonus)),
        corroborationMatches: match.matches
      };
    })
    .filter(candidate =>
      candidate.corroborationMatches.length >= 3 &&
      candidate.corroborationScore >= 35 &&
      !BLOCKED_STORY_TERMS.some(term =>
        containsTerm(cleanText([candidate.title, candidate.snippet].filter(Boolean).join(' ')).toLowerCase(), term)
      )
    )
    .sort((a, b) =>
      b.corroborationScore - a.corroborationScore ||
      String(a.domain).localeCompare(String(b.domain))
    );

  const corroboratingSource = ranked[0] || null;
  if (!corroboratingSource) {
    throw new Error(
      'Public social story could not be independently corroborated: ' +
      cleanText(story?.title)
    );
  }

  return {
    verified: true,
    lead: story,
    corroboratingSource: {
      title: corroboratingSource.title,
      url: corroboratingSource.url,
      domain: corroboratingSource.domain,
      publishedDate: corroboratingSource.publishedDate || null,
      author: corroboratingSource.author || '',
      snippet: corroboratingSource.snippet || '',
      sourceType: 'web',
      corroborationScore: corroboratingSource.corroborationScore,
      corroborationMatches: corroboratingSource.corroborationMatches
    }
  };
}


export const AGENT_REACH_SEARCH_QUERIES = [
  'category:news recent heartwarming real life story act of kindness one person helping another',
  'category:news recent feel-good story stranger helping family child neighbor',
  'category:news recent inspiring community kindness generosity people helping people',
  'category:news recent uplifting human-interest story compassion unexpected help'
];

const BLOCKED_STORY_TERMS = [
  'murder', 'murdered', 'killed', 'death', 'dead', 'suicide', 'self-harm',
  'rape', 'sexual assault', 'torture', 'gore', 'graphic', 'beheading',
  'bombing', 'terrorist', 'terrorism', 'war', 'massacre', 'shooting',
  'stabbed', 'homicide', 'drug trafficking', 'porn', 'arrest', 'arrested',
  'crime', 'criminal', 'accused', 'charged', 'assault', 'abuse', 'abduction',
  'trafficking', 'corruption', 'protest', 'protests', 'riot', 'riots',
  'unrest', 'clashes', 'demonstration', 'demonstrations', 'strike', 'strikes',
  'rally', 'rallies', 'scandal', 'controversy', 'backlash', 'lawsuit',
  'election', 'campaign', 'politician', 'partisan'
];

const POSITIVE_TERMS = [
  'kindness', 'help', 'helped', 'helping', 'support', 'supported', 'offered',
  'shared', 'gave', 'gift', 'comforted', 'donated', 'reunited', 'surprised',
  'paid', 'bought', 'food', 'meal', 'groceries', 'compassion', 'generosity',
  'volunteer', 'community', 'scholarship', 'achievement', 'breakthrough',
  'discovery', 'innovation', 'success', 'milestone', 'hope', 'uplifting',
  'inspiring', 'heartwarming'
];

const HUMAN_TERMS = [
  'stranger', 'neighbor', 'family', 'child', 'children', 'woman', 'man',
  'person', 'people', 'parent', 'mother', 'father', 'worker', 'customer',
  'survivor', 'journalist'
];

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || ['fbclid', 'gclid'].includes(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return cleanText(value);
  }
}

function domainFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function titleFingerprint(title) {
  return cleanText(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2)
    .slice(0, 18)
    .join(' ');
}

function containsTerm(text, term) {
  const escaped = String(term).replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
  return new RegExp('\\b' + escaped + '\\b', 'i').test(text);
}

function parseJsonDocument(stdout) {
  const text = cleanText(stdout);
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    const firstObject = text.indexOf('{');
    const lastObject = text.lastIndexOf('}');
    if (firstObject >= 0 && lastObject > firstObject) {
      try {
        return JSON.parse(text.slice(firstObject, lastObject + 1));
      } catch {}
    }

    const firstArray = text.indexOf('[');
    const lastArray = text.lastIndexOf(']');
    if (firstArray >= 0 && lastArray > firstArray) {
      try {
        return JSON.parse(text.slice(firstArray, lastArray + 1));
      } catch {}
    }
  }

  return null;
}

function collectSearchResultArrays(value, found = [], depth = 0) {
  if (value == null || depth > 7) return found;

  if (Array.isArray(value)) {
    for (const item of value) {
      collectSearchResultArrays(item, found, depth + 1);
    }
    return found;
  }

  if (typeof value !== 'object') {
    if (typeof value === 'string' && depth <= 5) {
      const nested = parseJsonDocument(value);
      if (nested) collectSearchResultArrays(nested, found, depth + 1);
    }
    return found;
  }

  if (Array.isArray(value.results)) {
    found.push(value.results);
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === 'text' && typeof child === 'string') {
      const nested = parseJsonDocument(child);
      if (nested) collectSearchResultArrays(nested, found, depth + 1);
    } else if (key === 'results' && Array.isArray(child)) {
      for (const item of child) {
        collectSearchResultArrays(item, found, depth + 1);
      }
    } else {
      collectSearchResultArrays(child, found, depth + 1);
    }
  }

  return found;
}

function searchResultSnippet(item) {
  const highlights = Array.isArray(item?.highlights) ? item.highlights.filter(Boolean) : [];
  return cleanText(item?.summary || item?.text || highlights[0] || item?.snippet || '');
}

function collectMcpTextBlocks(value, found = [], depth = 0) {
  if (value == null || depth > 8) return found;

  if (Array.isArray(value)) {
    for (const item of value) collectMcpTextBlocks(item, found, depth + 1);
    return found;
  }

  if (typeof value !== 'object') return found;

  if (value.type === 'text' && typeof value.text === 'string') {
    found.push(value.text);
  }

  for (const child of Object.values(value)) {
    collectMcpTextBlocks(child, found, depth + 1);
  }

  return found;
}

function parseMcpTextBlock(block) {
  const text = String(block || '').trim();
  if (!text) return [];

  return text
    .split(/\n\s*-{3,}\s*\n/)
    .map(section => section.trim())
    .map(section => {
      const title = section.match(/^Title:\s*(.+)$/mi)?.[1]?.trim();
      const url = section.match(/^URL:\s*(https?:\/\/\S+)$/mi)?.[1]?.trim();
      if (!title || !url) return null;

      const publishedDate = section.match(/^Published:\s*(.+)$/mi)?.[1]?.trim() || null;
      const author = section.match(/^Author:\s*(.+)$/mi)?.[1]?.trim() || '';
      const highlightsIndex = section.search(/^Highlights:\s*$/mi);
      const snippet = highlightsIndex >= 0
        ? cleanText(section.slice(highlightsIndex + 'Highlights:'.length))
        : cleanText(section);

      return {
        title: cleanText(title),
        url: normalizeUrl(url),
        domain: domainFromUrl(url),
        publishedDate,
        seendate: publishedDate,
        author: cleanText(author),
        snippet: cleanText(snippet),
        ...sourceMetadata(url),
      };
    })
    .filter(Boolean);
}

export function parseAgentReachOutput(stdout, query = '') {
  const payload = parseJsonDocument(stdout);
  if (!payload) {
    throw new Error('Agent-Reach Web Search returned invalid JSON.');
  }

  const arrays = collectSearchResultArrays(payload);
  const rawResults = arrays.flat()
    .filter(item => item && typeof item === 'object' && item.url && item.title)
    .map(item => ({
      title: cleanText(item.title),
      url: normalizeUrl(item.url),
      domain: domainFromUrl(item.url),
      publishedDate: item.publishedDate || item.published_at || item.date || null,
      seendate: item.publishedDate || item.published_at || item.date || null,
      author: cleanText(item.author || ''),
      snippet: searchResultSnippet(item),
      ...sourceMetadata(item.url),
    }));

  const textResults = collectMcpTextBlocks(payload)
    .flatMap(parseMcpTextBlock);

  const combined = [...rawResults, ...textResults];
  const seen = new Set();

  return combined
    .filter(item => {
      const key = normalizeUrl(item.url) || titleFingerprint(item.title);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item, index) => ({
      ...item,
      query,
      rank: index + 1
    }));
}

export async function runAgentReachSearch({
  query,
  numResults = 8,
  timeoutMs = 60000,
  execFileImpl = execFileAsync,
  env = process.env
} = {}) {
  if (!query) throw new Error('Agent-Reach search query is required.');

  const { EXA_API_KEY: _ignoredExaApiKey, ...safeEnv } = env || {};
  const args = [
    'call',
    '--http-url',
    'https://mcp.exa.ai/mcp',
    'web_search_exa',
    '--output',
    'json',
    '--args',
    JSON.stringify({ query, numResults }),
    '--timeout',
    String(timeoutMs)
  ];

  const result = await execFileImpl('mcporter', args, {
    env: safeEnv,
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024
  });

  const stdout = result?.stdout || '';
  return parseAgentReachOutput(stdout, query);
}

function hoursOld(publishedDate, now) {
  if (!publishedDate) return null;
  const parsed = new Date(publishedDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.max(0, (now.getTime() - parsed.getTime()) / 3600000);
}

function scoreCandidate(candidate, now) {
  const title = cleanText(candidate.title);
  const text = cleanText([candidate.title, candidate.snippet].join(' ')).toLowerCase();
  const storyContext = cleanText([title, candidate.snippet].filter(Boolean).join(' '));
  const topic = getLittleBetterTopic(storyContext);
  if (!storyContext || !isSafeNewsCandidate(storyContext) || !topic) return -Infinity;

  if (BLOCKED_STORY_TERMS.some(term => containsTerm(text, term))) {
    return -Infinity;
  }

  const isHumanKindness = isHeartwarmingHumanStory(title);
  const positiveCount = POSITIVE_TERMS.filter(term => containsTerm(text, term)).length;
  const humanCount = HUMAN_TERMS.filter(term => containsTerm(text, term)).length;
  const queryCount = new Set(candidate.sourceQueries || [candidate.query].filter(Boolean)).size;
  const age = hoursOld(candidate.publishedDate || candidate.seendate, now);
  const socialPlatform = detectPublicSocialPlatform(candidate.url);

  let score = topic.name === 'human-kindness' ? 28 : 18;

  if (isHumanKindness) score += 30;
  if (humanCount >= 2 && positiveCount >= 2) score += 12;
  if (humanCount >= 1 && positiveCount >= 1) score += 6;

  score += Math.min(15, Math.max(0, queryCount - 1) * 7);
  score += Math.min(12, positiveCount * 3);
  if (socialPlatform) score += 10;

  if (age !== null) {
    if (age <= 12) score += 20;
    else if (age <= 24) score += 17;
    else if (age <= 48) score += 12;
    else if (age <= 72) score += 7;
    else if (age <= 120) score += 2;
    else score -= 15;
  }

  if (title.length >= 40 && title.length <= 150) score += 4;
  if (/[!?]{2,}/.test(title)) score -= 4;

  return Math.max(0, Math.min(100, score));
}

export function rankStoryCandidates(candidates, { now = new Date() } = {}) {
  const groups = new Map();

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const title = cleanText(candidate?.title);
    const url = normalizeUrl(candidate?.url);
    if (!title || !url) continue;

    const key = url || titleFingerprint(title);
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        ...candidate,
        title,
        url,
        domain: candidate.domain || domainFromUrl(url),
        ...sourceMetadata(url),
        sourceQueries: [...new Set([
          ...(candidate.sourceQueries || []),
          candidate.query
        ].filter(Boolean))]
      });
      continue;
    }

    existing.sourceQueries = [...new Set([
      ...existing.sourceQueries,
      ...(candidate.sourceQueries || []),
      candidate.query
    ].filter(Boolean))];

    const existingDate = existing.publishedDate ? new Date(existing.publishedDate).getTime() : Infinity;
    const candidateDate = candidate.publishedDate ? new Date(candidate.publishedDate).getTime() : Infinity;
    if (candidateDate < existingDate) {
      existing.publishedDate = candidate.publishedDate;
      existing.seendate = candidate.seendate;
    }

    if (!existing.snippet && candidate.snippet) {
      existing.snippet = candidate.snippet;
    }
  }

  return [...groups.values()]
    .map(candidate => {
      const score = scoreCandidate(candidate, now);
      const topic = getLittleBetterTopic(
        cleanText([candidate.title, candidate.snippet].filter(Boolean).join(' '))
      );
      return {
        ...candidate,
        sourceCount: new Set(candidate.sourceQueries || []).size || 1,
        topic: topic?.name || null,
        scoutScore: score,
        score
      };
    })
    .filter(candidate => Number.isFinite(candidate.score))
    .sort((a, b) =>
      b.score - a.score ||
      b.sourceCount - a.sourceCount ||
      String(a.title).localeCompare(String(b.title))
    );
}

function isRateLimitError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:HTTP\\s*429|free MCP rate limit|rate limit)/i.test(message);
}

export async function scoutStories({
  queries = [PUBLIC_SOCIAL_DISCOVERY_QUERY, ...AGENT_REACH_SEARCH_QUERIES],
  numResults = 8,
  now = new Date(),
  maxQueries = 1,
  execFileImpl = execFileAsync,
  fetchImpl = fetch
} = {}) {
  const selectedQueries = queries.slice(0, Math.max(1, Number(maxQueries) || queries.length));
  const candidates = [];
  let successfulSearches = 0;

  for (const query of selectedQueries) {
    try {
      const results = await runAgentReachSearch({
        query,
        numResults,
        execFileImpl
      });
      successfulSearches += 1;
      candidates.push(...results);

      const rankedSoFar = rankStoryCandidates(candidates, { now });
      if (rankedSoFar.length >= numResults) {
        break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log('Agent-Reach Story Scout query failed: ' + message);

      if (isRateLimitError(error)) {
        console.log('Agent-Reach free MCP rate limit reached; stopping further searches and using fallback if needed.');
        break;
      }
    }
  }

  const ranked = rankStoryCandidates(candidates, { now });

  if (ranked.length > 0) {
    return {
      provider: ranked.some(item => item.sourceType === 'public-social')
        ? 'agent-reach-exa-public-social'
        : 'agent-reach-exa',
      articles: ranked,
      successfulSearches,
      totalQueries: selectedQueries.length
    };
  }

  console.log('Agent-Reach Story Scout found no eligible stories; using existing free news fallback.');

  const fallback = await searchFreshNews({ fetchImpl });
  return {
    provider: 'fallback:' + fallback.provider,
    articles: fallback.articles,
    successfulSearches,
    totalQueries: selectedQueries.length
  };
}
