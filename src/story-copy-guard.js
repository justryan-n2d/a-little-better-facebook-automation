const STOPWORDS = new Set([
  'about', 'after', 'again', 'also', 'because', 'being', 'from', 'have',
  'into', 'just', 'more', 'than', 'that', 'their', 'there', 'these', 'they',
  'this', 'those', 'under', 'when', 'where', 'which', 'while', 'with', 'would',
  'your', 'story', 'report', 'news', 'today'
]);

const ATTRIBUTION_PATTERNS = [
  /\bfamily says\b/i,
  /\baccording to\b/i,
  /\breportedly\b/i,
  /\bclaims?\b/i,
  /\ballegedly\b/i,
  /\bofficials? (?:say|said)\b/i,
  /\bpolice (?:say|said)\b/i,
  /\b(?:the|a) report says\b/i,
  /\bappears to\b/i,
  /\bmay have\b/i
];

const RISK_PATTERNS = [
  { type: 'stereotype', pattern: /\bpeople like (?:him|her|them)\b/i },
  { type: 'stereotype', pattern: /\b(?:all|every) (?:people|men|women|immigrants|homeless people|poor people|rich people|elderly people|disabled people)\b/i },
  { type: 'stereotype', pattern: /\b(?:people|men|women|immigrants|homeless people|poor people|rich people|elderly people|disabled people)\s+(?:are|will|always|never)\b/i },
  { type: 'stereotype', pattern: /\bdespite being (?:homeless|poor|an immigrant|elderly|disabled)\b/i },
  { type: 'motive-inference', pattern: /\b(?:selfless|selflessly)\b/i },
  { type: 'motive-inference', pattern: /\b(?:only|just) wanted to (?:get attention|look good|go viral|gain followers)\b/i },
  { type: 'motive-inference', pattern: /\b(?:did it|did this|helped) because (?:he|she|they)\b/i },
  { type: 'motive-inference', pattern: /\bfor (?:clout|attention|followers)\b/i },
  { type: 'universalization', pattern: /\b(?:proves|shows) that (?:all|people|men|women)\b/i }
];

const TREND_CLAIM_PATTERNS = [
  /\bwidely reported\b/i,
  /\bgoing viral\b/i,
  /\bgone viral\b/i,
  /\btrending\b/i,
  /\bwidely shared\b/i,
  /\bwidely viewed\b/i,
  /\beveryone is talking\b/i,
  /\bthe internet is loving\b/i,
  /\bpeople are loving\b/i,
  /\ball over social media\b/i
];

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function meaningfulTerms(value) {
  return [...new Set(
    cleanText(value)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length >= 5 && !STOPWORDS.has(word))
  )];
}

function hasAnyPattern(text, patterns) {
  return patterns.some(pattern => pattern.test(text));
}

function hasAttribution(text) {
  return ATTRIBUTION_PATTERNS.some(pattern => pattern.test(text));
}

function trendEvidenceSupports(story, sourceText) {
  if (story?.trendScore >= 25) return true;
  return hasAnyPattern(sourceText, TREND_CLAIM_PATTERNS);
}

export function validateStoryNarrative({
  story,
  headline,
  hook,
  angle,
  summary,
  sourceArticleText
} = {}) {
  const sourceText = cleanText([
    story?.title,
    story?.snippet,
    sourceArticleText
  ].filter(Boolean).join(' '));
  const headlineText = cleanText(headline);
  const copyText = cleanText([
    headline,
    hook,
    angle,
    summary
  ].filter(Boolean).join(' '));

  const riskFlags = [];
  const headlineTerms = meaningfulTerms(headlineText);
  const sourceTerms = meaningfulTerms(story?.title || sourceText);
  const matchingTerms = sourceTerms.filter(term => headlineTerms.includes(term));

  for (const risk of RISK_PATTERNS) {
    if (risk.pattern.test(copyText)) {
      riskFlags.push(risk.type);
    }
  }

  if (hasAnyPattern(copyText, TREND_CLAIM_PATTERNS) && !trendEvidenceSupports(story, sourceText)) {
    riskFlags.push('unsupported-trend-claim');
  }

  if (hasAttribution(sourceText) && !hasAttributionMarker(copyText)) {
    riskFlags.push('dropped-source-attribution');
  }

  if (sourceText && headlineText && sourceTerms.length >= 2 && matchingTerms.length < 2) {
    riskFlags.push('headline-context-drift');
  }

  return {
    passed: riskFlags.length === 0,
    riskFlags,
    matchingTerms
  };
}

export function assertStoryNarrativeIntegrity(options = {}) {
  const result = validateStoryNarrative(options);
  if (!result.passed) {
    throw new Error(
      'Story copy failed bias/context gate: ' + result.riskFlags.join(', ')
    );
  }
  return result;
}
