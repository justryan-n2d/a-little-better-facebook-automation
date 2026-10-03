import sharp from 'sharp';

export const DEFAULT_VISION_MODEL = 'gpt-5-mini';
export const SOURCE_ALIGNMENT_THRESHOLD = 70;
export const FINAL_ALIGNMENT_THRESHOLD = 65;
export const FINAL_READABILITY_THRESHOLD = 75;

const RESPONSES_URL = 'https://api.openai.com/v1/responses';

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeMode(mode) {
  const value = String(mode ?? 'optional').toLowerCase();
  if (value === 'required' || value === 'metadata' || value === 'optional') return value;
  throw new Error('NEWS_VISUAL_VERIFY_MODE must be required, optional, or metadata.');
}

async function prepareVisionImage(imageBuffer) {
  const input = Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer || '');
  if (!input.length) throw new Error('imageBuffer is required for visual verification.');

  try {
    const optimized = await sharp(input, { failOn: 'error' })
      .rotate()
      .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: false })
      .jpeg({ quality: 80, chromaSubsampling: '4:2:0' })
      .toBuffer();

    return 'data:image/jpeg;base64,' + optimized.toString('base64');
  } catch {
    return 'data:image/jpeg;base64,' + input.toString('base64');
  }
}

function buildPrompt({
  storyTitle,
  sourceDomain,
  candidateContext,
  displayHeadline,
  purpose
}) {
  const finalGraphic = purpose === 'final';

  return [
    finalGraphic
      ? 'You are the final visual quality gate for a heartwarming Facebook news post.'
      : 'You are a conservative visual fact-checker for a heartwarming Facebook news post.',
    'Judge only what is visibly present in the image. Do not invent hidden context.',
    'Approve only when the visible photo plausibly matches the story context.',
    'Reject generic stock-like scenes when the story requires a specific person, event, object, or action.',
    'Reject artwork, illustrations, logos, screenshots, posters, maps, or graphics when the post expects a real news photo.',
    'For the final graphic, also judge whether the headline is readable and whether the graphic still clearly communicates the same story.',
    '',
    'Story title: ' + cleanText(storyTitle),
    'Source: ' + cleanText(sourceDomain),
    'Article image context: ' + cleanText(candidateContext),
    finalGraphic ? 'Display headline: ' + cleanText(displayHeadline) : '',
    '',
    'Return ONLY JSON with these fields:',
    '{"approved":true,"story_alignment_score":0,"photo_quality_score":0,"readability_score":0,"generic_graphic":false,"unsafe":false,"visible_subjects":[],"visible_context":"","reason":""}',
    'Scores are 0-100. Be conservative. Use approved=false when the evidence is weak.'
  ].filter(Boolean).join('\n');
}

function getResponseText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const chunks = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === 'string') chunks.push(content.text);
    }
  }

  return chunks.join('\n').trim();
}

function extractJson(text) {
  const source = String(text || '').trim();
  try {
    return JSON.parse(source);
  } catch {}

  const fenced = source.match(/\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {}
  }

  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(source.slice(start, end + 1));
    } catch {}
  }

  throw new Error('Vision response did not contain valid JSON.');
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 0;
}

function evaluateDecision(decision, purpose) {
  const storyAlignmentScore = numberOrZero(decision.story_alignment_score);
  const photoQualityScore = numberOrZero(decision.photo_quality_score);
  const readabilityScore = numberOrZero(decision.readability_score);
  const genericGraphic = Boolean(decision.generic_graphic);
  const unsafe = Boolean(decision.unsafe);
  const approvedByModel = decision.approved === true;

  const alignmentThreshold = purpose === 'final'
    ? FINAL_ALIGNMENT_THRESHOLD
    : SOURCE_ALIGNMENT_THRESHOLD;

  const failures = [];
  if (!approvedByModel) failures.push('model rejected the image');
  if (unsafe) failures.push('image flagged as unsafe');
  if (genericGraphic) failures.push('image appears to be a generic graphic or artwork');
  if (storyAlignmentScore < alignmentThreshold) {
    failures.push('story alignment score is below ' + alignmentThreshold);
  }
  if (purpose === 'final' && readabilityScore < FINAL_READABILITY_THRESHOLD) {
    failures.push('readability score is below ' + FINAL_READABILITY_THRESHOLD);
  }

  return {
    verified: failures.length === 0,
    storyAlignmentScore,
    photoQualityScore,
    readabilityScore,
    genericGraphic,
    unsafe,
    visibleSubjects: Array.isArray(decision.visible_subjects)
      ? decision.visible_subjects.map(cleanText).filter(Boolean).slice(0, 12)
      : [],
    visibleContext: cleanText(decision.visible_context),
    reason: failures.length ? failures.join('; ') : cleanText(decision.reason) || 'Vision verification passed.'
  };
}

export async function verifyImageStoryAlignment({
  imageBuffer,
  storyTitle,
  sourceDomain,
  candidateContext = '',
  mode = process.env.NEWS_VISUAL_VERIFY_MODE || 'optional',
  apiKey = process.env.OPENAI_API_KEY || '',
  model = process.env.OPENAI_VISION_MODEL || DEFAULT_VISION_MODEL,
  fetchImpl = fetch
} = {}) {
  const normalizedMode = normalizeMode(mode);

  if (normalizedMode === 'metadata') {
    return {
      verified: null,
      method: 'metadata-only',
      status: 'not-run',
      model: null,
      storyAlignmentScore: null,
      photoQualityScore: null,
      readabilityScore: null,
      genericGraphic: null,
      unsafe: null,
      visibleSubjects: [],
      visibleContext: '',
      reason: 'Vision verification disabled; metadata-only safety checks remain active.'
    };
  }

  if (!apiKey) {
    if (normalizedMode === 'required') {
      throw new Error('OPENAI_API_KEY is required for visual verification in required mode.');
    }

    return {
      verified: null,
      method: 'metadata-only',
      status: 'not-configured',
      model: null,
      storyAlignmentScore: null,
      photoQualityScore: null,
      readabilityScore: null,
      genericGraphic: null,
      unsafe: null,
      visibleSubjects: [],
      visibleContext: '',
      reason: 'OPENAI_API_KEY is not configured; using metadata-only safety checks.'
    };
  }

  const imageUrl = await prepareVisionImage(imageBuffer);
  const response = await fetchImpl(RESPONSES_URL, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + apiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model,
      input: [{
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: buildPrompt({
              storyTitle,
              sourceDomain,
              candidateContext,
              displayHeadline: '',
              purpose: 'source'
            })
          },
          {
            type: 'input_image',
            image_url: imageUrl,
            detail: 'high'
          }
        ]
      }],
      max_output_tokens: 350
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error('OpenAI visual verification HTTP ' + response.status + ': ' + cleanText(body).slice(0, 300));
  }

  const payload = await response.json();
  const decision = evaluateDecision(extractJson(getResponseText(payload)), 'source');

  return {
    ...decision,
    method: 'openai-vision',
    status: decision.verified ? 'approved' : 'rejected',
    model
  };
}

async function verifyRenderedGraphic(options = {}) {
  const {
    imageBuffer,
    storyTitle,
    sourceDomain,
    displayHeadline = '',
    mode = process.env.NEWS_VISUAL_VERIFY_MODE || 'optional',
    apiKey = process.env.OPENAI_API_KEY || '',
    model = process.env.OPENAI_VISION_MODEL || DEFAULT_VISION_MODEL,
    fetchImpl = fetch
  } = options;

  const normalizedMode = normalizeMode(mode);

  if (normalizedMode === 'metadata') {
    return {
      verified: null,
      method: 'metadata-only',
      status: 'not-run',
      model: null,
      storyAlignmentScore: null,
      photoQualityScore: null,
      readabilityScore: null,
      genericGraphic: null,
      unsafe: null,
      visibleSubjects: [],
      visibleContext: '',
      reason: 'Final graphic vision QA disabled; deterministic layout/render checks remain active.'
    };
  }

  if (!apiKey) {
    if (normalizedMode === 'required') {
      throw new Error('OPENAI_API_KEY is required for final visual QA in required mode.');
    }

    return {
      verified: null,
      method: 'metadata-only',
      status: 'not-configured',
      model: null,
      storyAlignmentScore: null,
      photoQualityScore: null,
      readabilityScore: null,
      genericGraphic: null,
      unsafe: null,
      visibleSubjects: [],
      visibleContext: '',
      reason: 'OPENAI_API_KEY is not configured; final graphic QA remains metadata-only.'
    };
  }

  const imageUrl = await prepareVisionImage(imageBuffer);
  const prompt = buildPrompt({
    storyTitle,
    sourceDomain,
    candidateContext: 'Final rendered A Little Better graphic',
    displayHeadline,
    purpose: 'final'
  });

  const response = await fetchImpl(RESPONSES_URL, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + apiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model,
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: prompt },
          { type: 'input_image', image_url: imageUrl, detail: 'high' }
        ]
      }],
      max_output_tokens: 350
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error('OpenAI final visual QA HTTP ' + response.status + ': ' + cleanText(body).slice(0, 300));
  }

  const payload = await response.json();
  const decision = evaluateDecision(extractJson(getResponseText(payload)), 'final');

  return {
    ...decision,
    method: 'openai-vision',
    status: decision.verified ? 'approved' : 'rejected',
    model
  };
}

export async function verifyRenderedNewsGraphic(options = {}) {
  try {
    return await verifyRenderedGraphic(options);
  } catch (error) {
    const mode = normalizeMode(options.mode ?? process.env.NEWS_VISUAL_VERIFY_MODE ?? 'optional');
    if (mode === 'optional') {
      return {
        verified: null,
        method: 'metadata-fallback',
        status: 'vision-error',
        model: options.model || process.env.OPENAI_VISION_MODEL || DEFAULT_VISION_MODEL,
        storyAlignmentScore: null,
        photoQualityScore: null,
        readabilityScore: null,
        genericGraphic: null,
        unsafe: null,
        visibleSubjects: [],
        visibleContext: '',
        reason: 'Vision QA failed; continuing on deterministic render checks.',
        error: error instanceof Error ? error.message : String(error)
      };
    }
    throw error;
  }
}
