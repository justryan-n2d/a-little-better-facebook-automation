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
  'stabbed', 'homicide', 'drug trafficking', 'porn'
];

const STOPWORDS = new Set([
  'a','an','and','are','as','at','be','by','for','from','has','have','how',
  'in','is','it','its','of','on','or','that','the','their','this','to','was',
  'were','with','after','before','into','over','new','says','said','from'
]);

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

  const padded = \` \${value} \`;
  const isBlocked = BLOCKED_TERMS.some(term => padded.includes(\` \${term} \`));

  return value.length >= 24 && !isBlocked;
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
  maxRecords = 20,
  fetchImpl = fetch
} = {}) {
  const all = [];
  for (const query of queries) {
    const url = new URL(GDELT_BASE);
    url.searchParams.set('query', query);
    url.searchParams.set('mode', 'artlist');
    url.searchParams.set('maxrecords', String(maxRecords));
    url.searchParams.set('timespan', timespan);
    url.searchParams.set('sort', 'HybridRel');
    url.searchParams.set('format', 'json');

    try {
      const payload = await fetchJson(url, { fetchImpl });
      for (const [index, item] of extractGdeltArticles(payload).entries()) {
        if (!item?.url || !item?.title) continue;
        all.push({
          title: cleanText(item.title),
          url: normalizeUrl(item.url),
          domain: item.domain || domainFromUrl(item.url),
          seendate: item.seendate || item.published || null,
          socialimage: item.socialimage || null,
          query,
          rank: index + 1
        });
      }
    } catch (error) {
      console.log(`GDELT query failed: ${query} (${error instanceof Error ? error.message : String(error)})`);
    }
  }
  return all;
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
    if (!isSafeNewsCandidate(article?.title)) continue;
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
      return { ...candidate, score: scoreCandidate(candidate, now) };
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

export async function findOpenverseImage(query, {
  licenses = ['cc0', 'pdm', 'by'],
  fetchImpl = fetch
} = {}) {
  for (const license of licenses) {
    const url = new URL(OPENVERSE_BASE);
    url.searchParams.set('q', query);
    url.searchParams.set('license', license);
    url.searchParams.set('page_size', '12');
    url.searchParams.set('mature', 'false');

    try {
      const payload = await fetchJson(url, { fetchImpl });
      const results = Array.isArray(payload?.results) ? payload.results : [];
      const candidate = results.find(item =>
        item &&
        item.url &&
        !item.watermarked &&
        Number(item.width || 0) >= 700 &&
        Number(item.height || 0) >= 500 &&
        ['cc0', 'pdm', 'by'].includes(String(item.license || license).toLowerCase())
      );
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
          provider: cleanText(candidate.provider || candidate.source || 'Openverse')
        };
      }
    } catch (error) {
      console.log(`Openverse search failed for ${license}: ${error instanceof Error ? error.message : String(error)}`);
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
