import sharp from 'sharp';
import { calculateNewsLayout, fitTextToBox, rectanglesOverlap } from './news-image.js';

export const SOURCE_ALIGNMENT_THRESHOLD = 50;
export const FINAL_ALIGNMENT_THRESHOLD = 50;
export const FINAL_READABILITY_THRESHOLD = 75;

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have',
  'how', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'their',
  'this', 'to', 'was', 'were', 'with', 'after', 'before', 'into', 'over',
  'new', 'says', 'said', 'today', 'first', 'more', 'than', 'one', 'story'
]);

const GENERIC_VISUAL_TERMS = [
  'logo', 'icon', 'infographic', 'diagram', 'chart', 'graph', 'screenshot',
  'screen capture', 'slide', 'slides', 'presentation', 'poster', 'flyer',
  'worksheet', 'map', 'textbook', 'document', 'placeholder', 'template',
  'background', 'illustration', 'painting', 'artwork', 'drawing', 'sculpture',
  'statue', 'museum', 'canvas', 'graphic'
];

const UNSAFE_TERMS = [
  'murder', 'killed', 'death', 'suicide', 'self-harm', 'rape', 'sexual assault',
  'torture', 'gore', 'beheading', 'bombing', 'terrorist', 'terrorism', 'war',
  'massacre', 'shooting', 'stabbed', 'homicide', 'drug trafficking', 'porn',
  'arrested', 'crime', 'criminal', 'assault', 'abuse', 'abduction', 'trafficking',
  'corruption', 'protest', 'riot', 'unrest', 'clash', 'scandal', 'controversy',
  'lawsuit', 'election', 'campaign', 'politician', 'partisan'
];

const TOKEN_GROUPS = [
  ['help', 'helps', 'helped', 'helping', 'assist', 'assists', 'assisted', 'assistance', 'support', 'supports', 'supported'],
  ['give', 'gives', 'gave', 'giving', 'gift', 'gifted', 'donate', 'donates', 'donated', 'donation', 'share', 'shares', 'shared'],
  ['family', 'families', 'parent', 'parents', 'mother', 'father', 'child', 'children', 'kid', 'kids'],
  ['neighbor', 'neighborhood', 'community', 'communities', 'volunteer', 'volunteers', 'charity'],
  ['food', 'meal', 'meals', 'grocery', 'groceries', 'bread', 'water', 'dinner', 'lunch'],
  ['student', 'students', 'school', 'education', 'teacher', 'teachers', 'college', 'graduate', 'graduation'],
  ['science', 'scientist', 'scientists', 'research', 'technology', 'innovation', 'invention', 'breakthrough'],
  ['award', 'awards', 'winner', 'winners', 'won', 'wins', 'milestone', 'record', 'champion'],
  ['hope', 'hopeful', 'inspiring', 'inspiration', 'heartwarming', 'uplifting', 'positive'],
  ['environment', 'conservation', 'sustainability', 'sustainable', 'renewable', 'ocean', 'marine']
];

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeTokens(value) {
  return [...new Set(
    cleanText(value)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .map(token => token.trim())
      .filter(token => token.length >= 4 && !STOPWORDS.has(token))
  )];
}

function containsTerm(text, term) {
  const normalized = ' ' + cleanText(text).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  return normalized.includes(' ' + String(term).toLowerCase() + ' ');
}

function groupIndexes(tokens) {
  return new Set(
    TOKEN_GROUPS
      .map((group, index) => tokens.some(token => group.includes(token)) ? index : -1)
      .filter(index => index >= 0)
  );
}

function semanticScore(storyText, candidateText) {
  const storyTokens = normalizeTokens(storyText);
  const candidateTokens = normalizeTokens(candidateText);
  if (!storyTokens.length || !candidateTokens.length) return { score: 0, matches: [], sharedGroups: 0 };

  const exactMatches = storyTokens.filter(token => candidateTokens.includes(token));
  const storyGroups = groupIndexes(storyTokens);
  const candidateGroups = groupIndexes(candidateTokens);
  const sharedGroups = [...storyGroups].filter(index => candidateGroups.has(index));

  const specificMatches = exactMatches.filter(token =>
    !['person', 'people', 'someone', 'thing', 'moment', 'photo', 'image'].includes(token)
  );

  let score = Math.min(55, exactMatches.length * 14);
  score += Math.min(35, sharedGroups.length * 12);
  if (specificMatches.length >= 2) score += 10;
  if (exactMatches.length === 0 && sharedGroups.length === 0) score = 0;

  return {
    score: Math.max(0, Math.min(100, score)),
    matches: exactMatches.slice(0, 12),
    sharedGroups
  };
}

async function inspectImage(imageBuffer) {
  const input = Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer || '');
  if (!input.length) throw new Error('imageBuffer is required for visual verification.');

  const image = sharp(input, { failOn: 'error' });
  const metadata = await image.metadata();
  const stats = await image.stats();

  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  const pixels = width * height;
  const channels = Array.isArray(stats.channels) ? stats.channels : [];
  const meanStdDev = channels.length
    ? channels.reduce((sum, channel) => sum + Number(channel.stdev || 0), 0) / channels.length
    : 0;
  const mean = channels.length
    ? channels.reduce((sum, channel) => sum + Number(channel.mean || 0), 0) / channels.length
    : 0;
  const entropy = Number(stats.entropy || 0);

  const dimensionScore = Math.min(50, Math.min(width, height) / 700 * 50);
  const variationScore = Math.min(30, meanStdDev * 2);
  const entropyScore = Math.min(20, entropy * 3);
  const photoQualityScore = Math.max(0, Math.min(100, Math.round(
    dimensionScore + variationScore + entropyScore
  )));

  return {
    width,
    height,
    pixels,
    mean,
    meanStdDev,
    entropy,
    photoQualityScore
  };
}

function reasonList(failures, successReason) {
  return failures.length ? failures.join('; ') : successReason;
}

export async function verifyImageStoryAlignment({
  imageBuffer,
  storyTitle,
  sourceDomain = '',
  candidateContext = '',
  candidateUrl = '',
  candidateKind = ''
} = {}) {
  let inspection;
  try {
    inspection = await inspectImage(imageBuffer);
  } catch (error) {
    return {
      verified: false,
      method: 'deterministic',
      status: 'rejected',
      model: null,
      storyAlignmentScore: 0,
      photoQualityScore: 0,
      readabilityScore: null,
      genericGraphic: false,
      unsafe: false,
      visibleSubjects: [],
      visibleContext: cleanText(candidateContext),
      reason: 'image inspection failed: ' + (error instanceof Error ? error.message : String(error))
    };
  }

  const storyText = cleanText(storyTitle);
  const candidateText = cleanText([
    candidateContext,
    candidateUrl,
    candidateKind,
    sourceDomain
  ].filter(Boolean).join(' '));

  const { score, matches, sharedGroups } = semanticScore(storyText, candidateText);
  const genericGraphic = GENERIC_VISUAL_TERMS.some(term =>
    containsTerm(candidateText, term)
  );
  const unsafe = UNSAFE_TERMS.some(term =>
    containsTerm(candidateText, term)
  );

  const failures = [];
  if (inspection.width < 500 || inspection.height < 400 || inspection.pixels < 250000) {
    failures.push('image dimensions are too small for a reliable news photo');
  }
  if (inspection.mean < 4 || inspection.mean > 252 || inspection.meanStdDev < 2) {
    failures.push('image has insufficient visible variation');
  }
  if (inspection.photoQualityScore < 60) {
    failures.push('photo quality score is below 60');
  }
  if (genericGraphic) failures.push('image metadata indicates artwork or a generic graphic');
  if (unsafe) failures.push('image context contains unsafe content');
  if (score < SOURCE_ALIGNMENT_THRESHOLD) {
    failures.push('story-image context alignment score is below ' + SOURCE_ALIGNMENT_THRESHOLD);
  }

  return {
    verified: failures.length === 0,
    method: 'deterministic',
    status: failures.length ? 'rejected' : 'approved',
    model: null,
    storyAlignmentScore: score,
    photoQualityScore: inspection.photoQualityScore,
    readabilityScore: null,
    genericGraphic,
    unsafe,
    visibleSubjects: matches,
    visibleContext: cleanText(candidateContext),
    sharedContextGroups: sharedGroups.length,
    reason: reasonList(
      failures,
      'Deterministic story, context, and image-quality checks passed.'
    )
  };
}

export async function verifyRenderedNewsGraphic({
  imageBuffer,
  storyTitle,
  displayHeadline = '',
  sourceDomain = '',
  template = '4:5'
} = {}) {
  const failures = [];
  let inspection;

  try {
    inspection = await inspectImage(imageBuffer);
  } catch (error) {
    return {
      verified: false,
      method: 'deterministic',
      status: 'rejected',
      model: null,
      storyAlignmentScore: 0,
      photoQualityScore: 0,
      readabilityScore: 0,
      genericGraphic: false,
      unsafe: false,
      visibleSubjects: [],
      visibleContext: '',
      reason: 'render inspection failed: ' + (error instanceof Error ? error.message : String(error))
    };
  }

  const layout = calculateNewsLayout(template);
  const expected = layout.width + 'x' + layout.height;
  const actual = inspection.width + 'x' + inspection.height;
  if (actual !== expected) {
    failures.push('rendered dimensions are ' + actual + ', expected ' + expected);
  }
  if (inspection.mean < 4 || inspection.meanStdDev < 2) {
    failures.push('rendered graphic has insufficient visible variation');
  }
  if (inspection.photoQualityScore < 60) {
    failures.push('rendered image quality score is below 60');
  }

  const zones = [layout.photoCredit, layout.brand, layout.headline, layout.source];
  for (let i = 0; i < zones.length; i += 1) {
    for (let j = i + 1; j < zones.length; j += 1) {
      if (rectanglesOverlap(zones[i], zones[j])) {
        failures.push('layout collision: ' + zones[i].name + ' overlaps ' + zones[j].name);
      }
    }
  }

  let readabilityScore = 100;
  try {
    const fit = fitTextToBox(displayHeadline || storyTitle, {
      maxWidth: layout.headline.width - layout.headline.padding * 2,
      maxHeight: layout.headline.height - layout.headline.padding * 2,
      maxFontSize: 62,
      minFontSize: 38,
      lineHeight: 1.08,
      maxLines: 4
    });

    if (fit.fontSize < 40) readabilityScore = 75;
    else if (fit.fontSize < 44) readabilityScore = 85;
    else if (fit.fontSize < 48) readabilityScore = 92;
  } catch {
    readabilityScore = 0;
    failures.push('headline cannot fit inside the allocated box');
  }

  if (readabilityScore < FINAL_READABILITY_THRESHOLD) {
    failures.push('readability score is below ' + FINAL_READABILITY_THRESHOLD);
  }

  const semantic = semanticScore(storyTitle, displayHeadline || storyTitle);
  if (semantic.score < FINAL_ALIGNMENT_THRESHOLD) {
    failures.push('story-headline alignment score is below ' + FINAL_ALIGNMENT_THRESHOLD);
  }

  return {
    verified: failures.length === 0,
    method: 'deterministic',
    status: failures.length ? 'rejected' : 'approved',
    model: null,
    storyAlignmentScore: semantic.score,
    photoQualityScore: inspection.photoQualityScore,
    readabilityScore,
    genericGraphic: false,
    unsafe: false,
    visibleSubjects: semantic.matches,
    visibleContext: cleanText([displayHeadline, sourceDomain].filter(Boolean).join(' | ')),
    reason: reasonList(
      failures,
      'Deterministic visual, layout, headline-fit, and render checks passed.'
    )
  };
}
