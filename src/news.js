const GDELT_BASE = 'https://api.gdeltproject.org/api/v2/doc/doc';
const OPENVERSE_BASE = 'https://api.openverse.org/v1/images/';

export const NEWS_QUERIES = [
  '(inspiring OR heartwarming OR kindness OR uplifting) (story OR people OR community)',
  '(student OR education) (achievement OR success OR award OR scholarship)',
  '(science OR technology OR innovation) (discovery OR breakthrough OR milestone)',
  '(community OR volunteer OR rescue OR donation OR charity) (helps OR saves OR support)',
  '(artist OR athlete OR creator) (achievement OR comeback OR inspiring OR record)'
];

const BLOCKED_TERMS = [
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

const BLOCKED_IMAGE_TERMS = [
  'infographic', 'diagram', 'chart', 'graph', 'screenshot', 'screen capture',
  'slide', 'slides', 'presentation', 'poster', 'flyer', 'worksheet',
  'logo', 'icon', 'map', 'textbook', 'document', 'online learning'
];

const STOPWORDS = new Set([
  'a','an','and','are','as','at','be','by','for','from','has','have','how',
  'in','is','it','its','of','on','or','that','the','their','this','to','was',
  'were','with','after','before','into','over','new','says','said','from'
]);

const LITTLE_BETTER_TOPIC_GROUPS = [
  {
    name: 'kindness-community',
    context: ['community', 'people', 'neighborhood', 'local', 'volunteer', 'volunteers', 'charity'],
    positive: ['kindness', 'helping', 'helped', 'support', 'volunteer', 'volunteers', 'donation', 'donated', 'charity', 'generosity', 'care']
  },
  {
    name: 'education-growth',
    context: ['student', 'students', 'school', 'education', 'learning', 'teacher', 'teachers', 'study', 'college'],
    positive: ['scholarship', 'graduate', 'graduation', 'award', 'success', 'achievement', 'wins', 'won', 'excels', 'honor', 'honours']
  },
  {
    name: 'science-innovation',
    context: ['science', 'scientist', 'scientists', 'research', 'technology', 'innovation', 'inventor', 'invention'],
    positive: ['discovery', 'discovered', 'breakthrough', 'innovation', 'innovative', 'invention', 'inventor', 'milestone', 'progress']
  },
  {
    name: 'achievement-progress',
    context: ['achievement', 'success', 'winner', 'wins', 'won', 'award', 'milestone', 'record', 'champion', 'comeback', 'creator', 'artist', 'athlete'],
    positive: ['achievement', 'achieves', 'achieved', 'success', 'successful', 'award', 'awards', 'winner', 'wins', 'won', 'milestone', 'record', 'champion', 'comeback']
  },
  {
    name: 'hope-uplifting',
    context: ['story', 'people', 'moment', 'community'],
    positive: ['inspiring', 'inspiration', 'inspirational', 'hope', 'hopeful', 'positive', 'uplifting', 'heartwarming', 'good news', 'feel-good']
  },
  {
    name: 'better-world',
    context: ['environment', 'sustainability', 'sustainable', 'renewable', 'clean energy', 'green technology', 'conservation', 'restoration'],
    positive: ['sustainability', 'sustainable', 'renewable', 'clean energy', 'green technology', 'conservation', 'restoration', 'progress']
  }
];

function containsTerm(text, term) {
  const escaped = String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('\\b' + escaped + '\\b', 'i').test(text);
}

export function getLittleBetterTopic(title) {
  const lower = cleanText(title).toLowerCase();
  if (!lower || BLOCKED_TERMS.some(term => containsTerm(lower, term))) return null;

  const matches = LITTLE_BETTER_TOPIC_GROUPS
    .map(group => {
      const contextMatches = group.context.filter(keyword => containsTerm(lower, keyword));
      const positiveMatches = group.positive.filter(keyword => containsTerm(lower, keyword));
      return {
        name: group.name,
        matches: [...new Set([...contextMatches, ...positiveMatches])],
        contextCount: contextMatches.length,
        positiveCount: positiveMatches.length,
        score: contextMatches.length + (positiveMatches.length * 2)
      };
    })
    .filter(group =>
      group.positiveCount >= 1 &&
      (group.positiveCount >= 2 || group.contextCount >= 1)
    )
    .sort((a, b) => b.score - a.score || b.positiveCount - a.positiveCount || a.name.localeCompare(b.name));

  return matches[0] || null;
}

export function isLittleBetterTopic(title) {
  return Boolean(getLittleBetterTopic(title));
}



function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || ['fbclid','gclid'].includes(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return String(value ?? '').trim();
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
  const words = cleanText(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOPWORDS.has(word));
  return [...new Set(words)].sort().slice(0, 12).join(' ');
}

function hoursOld(seendate, now = new Date()) {
  if (!seendate) return 999;
  const raw = String(seendate);
  const parsed = new Date(
    raw.length >= 14
      ? raw.replace(
          /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/,
          '$1-$2-$3T$4:$5:$6Z'
        )
      : raw
  );
  if (Number.isNaN(parsed.getTime())) return 999;
  return Math.max(0, (now.getTime() - parsed.getTime()) / 3600000);
}

export function isSafeNewsCandidate(title) {
  const value = cleanText(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const padded = ` ${value} `;
  const isBlocked = BLOCKED_TERMS.some(term => padded.includes(` ${term} `));

  return value.length >= 24 && !isBlocked && isLittleBetterTopic(title);
}

export function extractGdeltArticles(payload) {
  if (Array.isArray(payload?.articles)) return payload.articles;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

export function scoreCandidate(candidate, now = new Date()) {
  const recencyHours = hoursOld(candidate.seendate, now);
  const recencyScore = Math.max(0, 30 - recencyHours);
  const multiSourceScore = Math.min(36, Math.max(1, Number(candidate.sourceCount) || 1) * 12);
  const rankScore = Math.max(0, 24 - (Math.max(1, Number(candidate.rank) || 1) - 1) * 2);
  return recencyScore + multiSourceScore + rankScore;
}

async function fetchJson(url, { timeoutMs = 15000, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: { 'user-agent': 'A-Little-Better-News/1.0' },
      signal: controller.signal
    });
    const text = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

export async function searchGdelt({
  queries = NEWS_QUERIES,
  timespan = '36h',
  maxRecords = 100,
  fetchImpl = fetch
} = {}) {
  const combinedQuery = [...new Set(queries.filter(Boolean))]
    .map(query => `(${query})`)
    .join(' OR ');

  const url = new URL(GDELT_BASE);
  url.searchParams.set('query', combinedQuery);
  url.searchParams.set('mode', 'artlist');
  url.searchParams.set('maxrecords', String(maxRecords));
  url.searchParams.set('timespan', timespan);
  url.searchParams.set('sort', 'HybridRel');
  url.searchParams.set('format', 'json');

  const payload = await fetchJson(url, { fetchImpl });
  return extractGdeltArticles(payload)
    .filter(item => item?.url && item?.title)
    .map((item, index) => ({
      title: cleanText(item.title),
      url: normalizeUrl(item.url),
      domain: item.domain || domainFromUrl(item.url),
      seendate: item.seendate || item.published || null,
      socialimage: item.socialimage || null,
      query: combinedQuery,
      rank: index + 1
    }));
}

function decodeXmlEntities(value) {
  return String(value ?? '')
    .replaceAll('<![CDATA[', '')
    .replaceAll(']]>', '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

export function extractGoogleNewsRssArticles(xml) {
  const text = String(xml ?? '');
  const items = [...text.matchAll(/<item\b[\s\S]*?<\/item>/gi)];

  return items.map((match, index) => {
    const item = match[0];
    const readTag = tag => {
      const open = '<' + tag + '\\b[^>]*>';
      const close = '</' + tag + '>';
      const found = item.match(new RegExp(open + '([\\s\\S]*?)' + close, 'i'));
      return decodeXmlEntities(found?.[1] || '').trim();
    };

    const title = readTag('title');
    const url = readTag('link');
    const pubDate = readTag('pubDate');
    const source = readTag('source');

    return {
      title,
      url: normalizeUrl(url),
      domain: source || domainFromUrl(url),
      seendate: pubDate || null,
      socialimage: null,
      rank: index + 1
    };
  }).filter(item => item.title && item.url);
}

function buildBroadNewsQuery(queries = NEWS_QUERIES) {
  const words = [...new Set(
    queries
      .join(' OR ')
      .toLowerCase()
      .match(/[a-z]{5,}/g) || []
  )].filter(word =>
    !STOPWORDS.has(word) &&
    !['achievement', 'achievements', 'inspiring', 'heartwarming'].includes(word)
  );

  const preferred = [
    'inspiring', 'heartwarming', 'kindness', 'student', 'school',
    'science', 'innovation', 'community', 'volunteer', 'achievement',
    'breakthrough', 'success', 'award', 'milestone'
  ];

  const selected = preferred.filter(word =>
    words.includes(word) || queries.join(' ').toLowerCase().includes(word)
  );

  return [...new Set([...selected, ...words])].slice(0, 12).join(' OR ');
}

export async function searchGoogleNewsRss({
  queries = NEWS_QUERIES,
  query,
  maxRecords = 50,
  fetchImpl = fetch
} = {}) {
  const searchQuery = query || buildBroadNewsQuery(queries);

  const url = new URL('https://news.google.com/rss/search');
  url.searchParams.set('q', searchQuery);
  url.searchParams.set('hl', 'en');
  url.searchParams.set('gl', 'US');
  url.searchParams.set('ceid', 'US:en');

  const response = await fetchImpl(url, {
    headers: { 'user-agent': 'A-Little-Better-News/1.0' }
  });

  if (!response.ok) {
    throw new Error(`Google News RSS HTTP ${response.status}`);
  }

  const xml = await response.text();
  return extractGoogleNewsRssArticles(xml)
    .map(item => ({ ...item, query: searchQuery }))
    .slice(0, maxRecords);
}

export async function searchGoogleNewsTopStoriesRss({
  maxRecords = 100,
  fetchImpl = fetch
} = {}) {
  const url = new URL('https://news.google.com/rss');
  url.searchParams.set('hl', 'en');
  url.searchParams.set('gl', 'US');
  url.searchParams.set('ceid', 'US:en');

  const response = await fetchImpl(url, {
    headers: { 'user-agent': 'A-Little-Better-News/1.0' }
  });

  if (!response.ok) {
    throw new Error(`Google News Top Stories RSS HTTP ${response.status}`);
  }

  const xml = await response.text();
  return extractGoogleNewsRssArticles(xml)
    .map(item => ({ ...item, query: 'top-stories' }))
    .slice(0, maxRecords);
}

export async function searchFreshNews({
  queries = NEWS_QUERIES,
  timespan = '36h',
  maxRecords = 100,
  fetchImpl = fetch
} = {}) {
  try {
    const articles = await searchGdelt({ queries, timespan, maxRecords, fetchImpl });
    if (articles.length > 0) {
      return { provider: 'gdelt', articles };
    }
    throw new Error('GDELT returned no articles.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`GDELT unavailable; using Google News RSS fallback (${message})`);

    const queryArticles = await searchGoogleNewsRss({
      queries,
      maxRecords: Math.min(maxRecords, 50),
      fetchImpl
    });

    if (queryArticles.length > 0) {
      return {
        provider: 'google-news-rss',
        articles: queryArticles
      };
    }

    console.log('Google News query returned no articles; using Top Stories fallback.');

    const topStories = await searchGoogleNewsTopStoriesRss({
      maxRecords: Math.min(maxRecords, 100),
      fetchImpl
    });

    return {
      provider: 'google-news-top-stories',
      articles: topStories
    };
  }
}

export function selectFreshStory(articles, {
  usedUrls = [],
  usedTitles = [],
  now = new Date()
} = {}) {
  const usedUrlSet = new Set(usedUrls.map(normalizeUrl));
  const usedTitleSet = new Set(usedTitles.map(titleFingerprint));
  const groups = new Map();

  for (const article of Array.isArray(articles) ? articles : []) {
    if (!isSafeNewsCandidate(article?.title) || !isLittleBetterTopic(article?.title)) continue;
    const url = normalizeUrl(article.url);
    const fingerprint = titleFingerprint(article.title);
    if (!url || usedUrlSet.has(url) || usedTitleSet.has(fingerprint)) continue;

    const key = fingerprint || url;
    const group = groups.get(key) || {
      title: article.title,
      url,
      domain: article.domain || domainFromUrl(url),
      seendate: article.seendate || null,
      socialimage: article.socialimage || null,
      sourceDomains: new Set(),
      ranks: []
    };

    if (article.domain) group.sourceDomains.add(article.domain);
    group.sourceDomains.add(domainFromUrl(article.url));
    group.ranks.push(Number(article.rank) || 99);
    if (hoursOld(article.seendate, now) < hoursOld(group.seendate, now)) {
      group.seendate = article.seendate;
      group.socialimage = article.socialimage || group.socialimage;
    }
    groups.set(key, group);
  }

  const ranked = [...groups.values()]
    .map(group => {
      const candidate = {
        ...group,
        sourceCount: group.sourceDomains.size,
        rank: Math.min(...group.ranks)
      };
      delete candidate.sourceDomains;
      delete candidate.ranks;
      const topic = getLittleBetterTopic(candidate.title);
      const brandScore = Math.min(24, (topic?.matches.length || 0) * 8);
      return { ...candidate, topic: topic?.name || null, score: scoreCandidate(candidate, now) + brandScore };
    })
    .sort((a, b) =>
      b.score - a.score ||
      b.sourceCount - a.sourceCount ||
      String(a.title).localeCompare(String(b.title))
    );

  const multiSource = ranked.find(item => item.sourceCount >= 2);
  return multiSource || ranked[0] || null;
}

export function extractImageQuery(title) {
  const words = cleanText(title)
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 4 && !STOPWORDS.has(word.toLowerCase()));
  return [...new Set(words)].slice(0, 4).join(' ');
}

export function buildDisplayHeadline(title) {
  let text = cleanText(title)
    .replace(/\s+-\s+[^-]{2,80}$/i, '')
    .trim();

  if (/discusses skills students need for success beyond grades/i.test(text)) {
    return 'Students Need More Than Good Grades';
  }

  if (text.length <= 68) return text;

  const clauses = text
    .split(/[:,;]/)
    .map(part => part.trim())
    .filter(part => part.length >= 24 && part.length <= 68);

  if (clauses.length > 0) return clauses[0];

  const words = text.split(/\s+/);
  const shortened = words.slice(0, 10).join(' ');
  return shortened + (words.length > 10 ? '...' : '');
}

export function buildImageQueries(title, topic) {
  const exact = extractImageQuery(title);
  const topicQueries = {
    'kindness-community': ['community volunteers helping people', 'people helping community'],
    'education-growth': ['students achievement education', 'students celebrating success'],
    'science-innovation': ['science innovation breakthrough', 'scientists technology discovery'],
    'achievement-progress': ['achievement celebration success', 'award winner celebration'],
    'hope-uplifting': ['inspiring people positive moment', 'heartwarming community'],
    'better-world': ['sustainable community environment', 'clean energy innovation']
  };

  const fallbacks = topicQueries[topic] || ['positive people community', 'uplifting people'];
  return [...new Set([exact, ...fallbacks, 'people community inspiration'].filter(Boolean))];
}

function imageTextForFiltering(item) {
  const tags = Array.isArray(item?.tags)
    ? item.tags.map(tag => typeof tag === 'string' ? tag : tag?.name || '').join(' ')
    : '';

  return [
    item?.title,
    item?.description,
    item?.alt_text,
    item?.caption,
    tags
  ].filter(Boolean).join(' ').toLowerCase();
}

export function isPhotoLikeOpenverseImage(item) {
  if (!item?.url || item.watermarked) return false;

  const width = Number(item.width || 0);
  const height = Number(item.height || 0);
  if (width < 700 || height < 500) return false;

  const text = imageTextForFiltering(item);
  if (BLOCKED_IMAGE_TERMS.some(term => containsTerm(text, term))) return false;

  return true;
}

function photoCandidateScore(item) {
  const width = Number(item?.width || 0);
  const height = Number(item?.height || 0);
  const ratio = height ? width / height : 1;
  let score = Math.min(12, (width * height) / 500000);

  if (ratio >= 1.2 && ratio <= 2.2) score += 8;
  if (ratio >= 0.8 && ratio <= 1.8) score += 2;

  const text = imageTextForFiltering(item);
  if (/photo|photograph|portrait/i.test(text)) score += 4;

  return score;
}

export async function findOpenverseImage(query, {
  licenses = ['cc0', 'pdm', 'by'],
  fetchImpl = fetch
} = {}) {
  const queries = Array.isArray(query) ? query : [query];

  for (const searchQuery of queries.filter(Boolean)) {
    for (const license of licenses) {
      const url = new URL(OPENVERSE_BASE);
      url.searchParams.set('q', searchQuery);
      url.searchParams.set('license', license);
      url.searchParams.set('page_size', '12');
      url.searchParams.set('mature', 'false');

      try {
        const payload = await fetchJson(url, { fetchImpl });
        const results = Array.isArray(payload?.results) ? payload.results : [];
        const candidate = results
          .filter(item =>
            isPhotoLikeOpenverseImage(item) &&
            ['cc0', 'pdm', 'by'].includes(String(item.license || license).toLowerCase())
          )
          .sort((a, b) => photoCandidateScore(b) - photoCandidateScore(a))[0];
        if (candidate) {
          return {
            url: candidate.url,
            thumbnail: candidate.thumbnail || null,
            title: cleanText(candidate.title || ''),
            creator: cleanText(candidate.creator || candidate.author || 'Unknown creator'),
            license: String(candidate.license || license).toLowerCase(),
            licenseVersion: candidate.license_version || null,
            licenseUrl: candidate.license_url || null,
            landingUrl: candidate.foreign_landing_url || candidate.url,
            provider: cleanText(candidate.provider || candidate.source || 'Openverse'),
            searchQuery
          };
        }
      } catch (error) {
        console.log(`Openverse search failed for "${searchQuery}" / ${license}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return null;
}

export async function downloadImage(url, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, {
    headers: { 'user-agent': 'A-Little-Better-News/1.0' }
  });
  if (!response.ok) throw new Error(`Image download failed: HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    throw new Error(`Image URL did not return image data: ${contentType || 'unknown content type'}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength < 10000) throw new Error('Downloaded image is unexpectedly small.');
  return Buffer.from(arrayBuffer);
}

export function buildNewsAngle(title) {
  const lower = cleanText(title).toLowerCase();
  if (/(student|school|education|scholarship|award)/.test(lower)) {
    return 'Small achievements can become big reasons for people to keep going.';
  }
  if (/(science|discovery|breakthrough|innovation|technology)/.test(lower)) {
    return 'Progress often starts with one new idea, question, or discovery.';
  }
  if (/(kindness|charity|volunteer|community|donat)/.test(lower)) {
    return 'One helpful action can reach much farther than the moment it started.';
  }
  if (/(surviv|rescued|saved|survive)/.test(lower)) {
    return 'Unexpected moments can remind us how quickly life can change.';
  }
  if (/(record|milestone|achievement|comeback|champion)/.test(lower)) {
    return 'A milestone is more than a headline. It shows what persistence can build.';
  }
  return 'Sometimes one story stands out because it gives people something to think about.';
}

export function buildNewsHook(title) {
  const lower = cleanText(title).toLowerCase();
  if (/(surviv|rescued|saved|survive)/.test(lower)) {
    return 'An unexpected moment is making headlines today.';
  }
  if (/(student|school|education|scholarship|award)/.test(lower)) {
    return 'A student story is giving people something to celebrate.';
  }
  if (/(science|discovery|breakthrough|innovation|technology)/.test(lower)) {
    return 'A new development is getting people talking.';
  }
  if (/(kindness|charity|volunteer|community|donat)/.test(lower)) {
    return 'A small act is getting a much bigger reaction.';
  }
  if (/(record|milestone|achievement|comeback|champion)/.test(lower)) {
    return 'A new milestone is catching attention today.';
  }
  return 'Here is one story worth knowing today.';
}

export function buildNewsCaption({
  title,
  sourceDomain,
  sourceUrl,
  hook,
  angle,
  photoCredit
}) {
  return [
    `📰 A Little Better News`,
    '',
    hook,
    '',
    title,
    '',
    `A Little Better angle: ${angle}`,
    '',
    `This story is being widely reported today. Read the full report from ${sourceDomain} for the complete details.`,
    '',
    `Source: ${sourceDomain}`,
    `Photo: ${photoCredit}`,
    '',
    'A Little Better, one day at a time.'
  ].join('\n');
}

export function buildPhotoCredit(image) {
  const license = String(image?.license || '').toUpperCase();
  const creator = cleanText(image?.creator || 'Unknown creator');
  const provider = cleanText(image?.provider || 'Openverse');
  return `${creator} / ${provider} / ${license || 'licensed'}`;
}

export { titleFingerprint };
