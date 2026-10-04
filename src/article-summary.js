const SENTENCE_PATTERN = /[^.!?]+(?:[.!?]+|$)/g;

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(value) {
  return String(value ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function stripMarkup(value) {
  return decodeHtml(
    String(value ?? '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<br\s*\/?\s*>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  );
}

function extractParagraphs(html) {
  const source = String(html ?? '');
  const articleMatches = [...source.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)];
  const scope = articleMatches[0]?.[1] || source;
  const paragraphs = [...scope.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(match => cleanText(stripMarkup(match[1])))
    .filter(text => text.length >= 45);

  return [...new Set(paragraphs)];
}

function splitSentences(paragraph) {
  return (cleanText(paragraph).match(SENTENCE_PATTERN) || [])
    .map(cleanText)
    .filter(sentence => sentence.length >= 45 && sentence.length <= 420)
    .filter(sentence => !/^(subscribe|sign up|advertisement|read more|follow us|cookie)/i.test(sentence));
}

function meaningfulTerms(value) {
  return [...new Set(
    cleanText(value)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length >= 5)
  )];
}

function sentenceScore(sentence, storyTerms, index) {
  const lower = sentence.toLowerCase();
  const overlap = storyTerms.filter(term => lower.includes(term)).length;
  const positionBonus = Math.max(0, 5 - index) * 0.5;
  return overlap * 10 + positionBonus;
}

export function buildArticleSummary({ html, storyTitle } = {}) {
  const paragraphs = extractParagraphs(html);
  const candidates = [];

  paragraphs.forEach((paragraph, paragraphIndex) => {
    splitSentences(paragraph).forEach(sentence => {
      candidates.push({
        sentence,
        index: candidates.length,
        score: sentenceScore(sentence, meaningfulTerms(storyTitle), paragraphIndex)
      });
    });
  });

  if (candidates.length < 2) {
    throw new Error('Verified source article did not provide at least 2 usable sentences for a summary.');
  }

  const targetCount = candidates.length >= 5 ? 3 : 2;
  const selected = candidates
    .slice()
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, targetCount)
    .sort((a, b) => a.index - b.index)
    .map(item => item.sentence);

  return selected.join(' ');
}

export async function fetchArticleSummary({ story, fetchImpl = fetch } = {}) {
  const articleUrl = cleanText(story?.url);
  if (!articleUrl) {
    throw new Error('Verified publishing article URL is required for the summary.');
  }

  const response = await fetchImpl(articleUrl, {
    redirect: 'follow',
    headers: { 'user-agent': 'A-Little-Better-News/1.0' }
  });

  if (!response.ok) {
    throw new Error('Verified source article HTTP ' + response.status);
  }

  const html = await response.text();
  const paragraphs = extractParagraphs(html);
  const sourceText = paragraphs.join(' ');
  const summary = buildArticleSummary({
    html,
    storyTitle: story?.title
  });

  return {
    url: response.url || articleUrl,
    summary,
    sourceText
  };
}
