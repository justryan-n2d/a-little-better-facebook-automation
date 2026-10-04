import { execFile as defaultExecFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  getLittleBetterTopic,
  isHeartwarmingHumanStory,
  isSafeNewsCandidate,
  searchFreshNews
} from './news.js';

const execFileAsync = promisify(defaultExecFile);

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

export function parseAgentReachOutput(stdout, query = '') {
  const payload = parseJsonDocument(stdout);
  if (!payload) {
    throw new Error('Agent-Reach Web Search returned invalid JSON.');
  }

  const arrays = collectSearchResultArrays(payload);
  const rawResults = arrays.flat();

  return rawResults
    .filter(item => item && typeof item === 'object' && item.url && item.title)
    .map((item, index) => ({
      title: cleanText(item.title),
      url: normalizeUrl(item.url),
      domain: domainFromUrl(item.url),
      publishedDate: item.publishedDate || item.published_at || item.date || null,
      seendate: item.publishedDate || item.published_at || item.date || null,
      author: cleanText(item.author || ''),
      snippet: searchResultSnippet(item),
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
    'exa.web_search_exa',
    '--output',
    'json',
    '--args',
    JSON.stringify({ query, numResults }),
    '--no-oauth'
  ];

  const result = await execFileImpl('mcporter', args, {
    env: safeEnv,
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024
  });

  return parseAgentReachOutput(result?.stdout || '', query);
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
  const topic = getLittleBetterTopic(title);
  if (!isSafeNewsCandidate(title) || !topic) return -Infinity;

  if (BLOCKED_STORY_TERMS.some(term => containsTerm(text, term))) {
    return -Infinity;
  }

  const isHumanKindness = isHeartwarmingHumanStory(title);
  const positiveCount = POSITIVE_TERMS.filter(term => containsTerm(text, term)).length;
  const humanCount = HUMAN_TERMS.filter(term => containsTerm(text, term)).length;
  const queryCount = new Set(candidate.sourceQueries || [candidate.query].filter(Boolean)).size;
  const age = hoursOld(candidate.publishedDate || candidate.seendate, now);

  let score = topic.name === 'human-kindness' ? 28 : 18;

  if (isHumanKindness) score += 30;
  if (humanCount >= 2 && positiveCount >= 2) score += 12;
  if (humanCount >= 1 && positiveCount >= 1) score += 6;

  score += Math.min(15, Math.max(0, queryCount - 1) * 7);
  score += Math.min(12, positiveCount * 3);

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
      return {
        ...candidate,
        sourceCount: new Set(candidate.sourceQueries || []).size || 1,
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

export async function scoutStories({
  queries = AGENT_REACH_SEARCH_QUERIES,
  numResults = 8,
  now = new Date(),
  execFileImpl = execFileAsync,
  fetchImpl = fetch
} = {}) {
  const searchResults = await Promise.allSettled(
    queries.map(query => runAgentReachSearch({
      query,
      numResults,
      execFileImpl
    }))
  );

  const candidates = [];
  let successfulSearches = 0;

  for (const result of searchResults) {
    if (result.status === 'fulfilled') {
      successfulSearches += 1;
      candidates.push(...result.value);
    } else {
      console.log('Agent-Reach Story Scout query failed: ' + (
        result.reason instanceof Error ? result.reason.message : String(result.reason)
      ));
    }
  }

  const ranked = rankStoryCandidates(candidates, { now });

  if (ranked.length > 0) {
    return {
      provider: 'agent-reach-exa',
      articles: ranked,
      successfulSearches,
      totalQueries: queries.length
    };
  }

  console.log('Agent-Reach Story Scout found no eligible stories; using existing free news fallback.');

  const fallback = await searchFreshNews({ fetchImpl });
  return {
    provider: 'fallback:' + fallback.provider,
    articles: fallback.articles,
    successfulSearches,
    totalQueries: queries.length
  };
}
