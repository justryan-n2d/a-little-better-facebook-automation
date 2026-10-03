import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const NEWS_CANVAS = { width: 1080, height: 1350 };
export const NEWS_PRIMARY = '#FFD61A';
export const NEWS_WHITE = '#FFFFFF';
export const NEWS_DARK = '#111111';
export const NEWS_SAFE = 72;

const TEMPLATES = {
  '4:5': { width: 1080, height: 1350 },
  '1:1': { width: 1080, height: 1080 },
  '9:16': { width: 1080, height: 1920 }
};

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function estimateWidth(text, size) {
  return String(text || '').length * size * 0.56;
}

export function wrapTextToBox(text, {
  fontSize,
  maxWidth
} = {}) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && estimateWidth(next, fontSize) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines;
}

export function fitTextToBox(text, {
  maxWidth,
  maxHeight,
  maxFontSize = 72,
  minFontSize = 34,
  lineHeight = 1.08,
  maxLines = 5
} = {}) {
  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 1) {
    const lines = wrapTextToBox(text, { fontSize, maxWidth });
    const width = Math.max(...lines.map(line => estimateWidth(line, fontSize)), 0);
    const height = lines.length * fontSize * lineHeight;

    if (
      lines.length <= maxLines &&
      width <= maxWidth &&
      height <= maxHeight
    ) {
      return { fontSize, lineHeight, lines, width, height };
    }
  }

  throw new Error(
    `Text cannot fit in allocated box: "${String(text || '').slice(0, 100)}"`
  );
}

function chooseHighlights(lines) {
  const candidates = lines
    .flatMap(line => line.split(/\s+/))
    .map(word => word.replace(/[^A-Za-z0-9]/g, ''))
    .filter(word => word.length >= 5);

  return [...new Set(candidates)]
    .sort((a, b) => b.length - a.length)
    .slice(0, 2);
}

function rect(x, y, width, height, name, padding = 0) {
  return {
    name,
    x,
    y,
    width,
    height,
    padding,
    left: x - padding,
    top: y - padding,
    right: x + width + padding,
    bottom: y + height + padding
  };
}

export function rectanglesOverlap(a, b) {
  return !(
    a.right <= b.left ||
    a.left >= b.right ||
    a.bottom <= b.top ||
    a.top >= b.bottom
  );
}

export function calculateNewsLayout(template = '4:5') {
  const canvas = TEMPLATES[template] || TEMPLATES['4:5'];
  const { width, height } = canvas;
  const scale = width / 1080;

  const photoCredit = rect(
    NEWS_SAFE * scale,
    28 * scale,
    width - NEWS_SAFE * 2 * scale,
    32 * scale,
    'photo-credit',
    8 * scale
  );

  const circleRadius = 178 * scale;
  const circleCenterX = 250 * scale;
  const circleCenterY = 270 * scale;
  const photoInset = rect(
    circleCenterX - circleRadius,
    circleCenterY - circleRadius,
    circleRadius * 2,
    circleRadius * 2,
    'photo-inset',
    10 * scale
  );

  const brandWidth = 300 * scale;
  const brandHeight = 64 * scale;
  const brand = rect(
    (width - brandWidth) / 2,
    height * 0.625,
    brandWidth,
    brandHeight,
    'branding',
    12 * scale
  );

  const headline = rect(
    NEWS_SAFE * scale,
    height * 0.705,
    width - NEWS_SAFE * 2 * scale,
    height * 0.205,
    'headline',
    18 * scale
  );

  const source = rect(
    NEWS_SAFE * scale,
    height * 0.955,
    width - NEWS_SAFE * 2 * scale,
    height * 0.025,
    'source',
    8 * scale
  );

  const zones = [photoCredit, photoInset, brand, headline, source];
  for (let i = 0; i < zones.length; i += 1) {
    for (let j = i + 1; j < zones.length; j += 1) {
      const a = zones[i];
      const b = zones[j];
      if (rectanglesOverlap(a, b)) {
        // The inset intentionally overlaps the background only. All text zones must stay isolated.
        if (a.name === 'photo-inset' || b.name === 'photo-inset') continue;
        throw new Error(`Layout collision: ${a.name} overlaps ${b.name}`);
      }
    }
  }

  return {
    template,
    width,
    height,
    photoCredit,
    photoInset,
    brand,
    headline,
    source
  };
}

function renderBrandLockup({ box }) {
  const x = box.x;
  const y = box.y;
  const w = box.width;
  const h = box.height;
  const centerY = y + h / 2;

  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${NEWS_PRIMARY}"/>
    <g>
      <path d="M${x + 34} ${centerY + 7} C${x + 34} ${centerY - 18} ${x + 51} ${centerY - 31} ${x + 69} ${centerY - 32} C${x + 68} ${centerY - 11} ${x + 57} ${centerY + 4} ${x + 34} ${centerY + 7}Z" fill="${NEWS_DARK}"/>
      <path d="M${x + 36} ${centerY + 6} C${x + 25} ${centerY - 5} ${x + 17} ${centerY - 8} ${x + 8} ${centerY - 7} C${x + 11} ${centerY + 6} ${x + 21} ${centerY + 12} ${x + 36} ${centerY + 6}Z" fill="${NEWS_DARK}"/>
      <path d="M${x + 36} ${centerY + 6} V${centerY + 22}" stroke="${NEWS_DARK}" stroke-width="3" stroke-linecap="round"/>
      <text x="${x + 88}" y="${centerY + 7}" fill="${NEWS_DARK}" font-family="DejaVu Sans, sans-serif" font-size="${20 * (w / 300)}" font-weight="800" letter-spacing="2.5">A LITTLE BETTER</text>
    </g>
  `;
}

function renderHeadline({ box, title }) {
  const fit = fitTextToBox(title, {
    maxWidth: box.width - box.padding * 2,
    maxHeight: box.height - box.padding * 2,
    maxFontSize: 72,
    minFontSize: 36,
    lineHeight: 1.07,
    maxLines: 5
  });

  const highlights = chooseHighlights(fit.lines);
  const lineGap = fit.fontSize * fit.lineHeight;
  const totalHeight = fit.lines.length * lineGap;
  const yStart = box.y + (box.height - totalHeight) / 2 + fit.fontSize * 0.82;
  const x = box.x + box.width / 2;

  const lines = fit.lines.map((line, lineIndex) => {
    const parts = line.split(/(\s+)/);
    const totalWidth = estimateWidth(line, fit.fontSize);
    let cursor = x - totalWidth / 2;

    const tspans = parts.map(part => {
      const isWord = /\S/.test(part);
      const cleaned = part.replace(/[^A-Za-z0-9]/g, '');
      const highlighted = isWord && highlights.includes(cleaned);
      const out = `<tspan fill="${highlighted ? NEWS_PRIMARY : NEWS_WHITE}" font-weight="800">${escapeXml(part)}</tspan>`;
      cursor += estimateWidth(part, fit.fontSize);
      return out;
    }).join('');

    return `<text x="${x}" y="${yStart + lineIndex * lineGap}" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="${fit.fontSize}" font-weight="800">${tspans}</text>`;
  }).join('\n');

  return { svg: lines, fit };
}

export function buildNewsSvg({
  imageDataBase64,
  hook,
  title,
  sourceDomain,
  angle,
  photoCredit,
  template = '4:5'
}) {
  const layout = calculateNewsLayout(template);
  const headline = renderHeadline({ box: layout.headline, title });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">
  <defs>
    <linearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="48%" stop-color="#000000" stop-opacity="0.02"/>
      <stop offset="72%" stop-color="#000000" stop-opacity="0.46"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.96"/>
    </linearGradient>
    <radialGradient id="bottomRightFade" cx="100%" cy="100%" r="72%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.30"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="topPhotoFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.16"/>
      <stop offset="55%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="photoCircle">
      <circle cx="${layout.photoInset.x + layout.photoInset.width / 2}" cy="${layout.photoInset.y + layout.photoInset.height / 2}" r="${layout.photoInset.width / 2 - 10 * (layout.width / 1080)}"/>
    </clipPath>
  </defs>

  <rect width="${layout.width}" height="${layout.height}" fill="${NEWS_DARK}"/>
  <image href="data:image/jpeg;base64,${imageDataBase64}" x="0" y="0" width="${layout.width}" height="${layout.height}" preserveAspectRatio="xMidYMid slice"/>
  <rect x="0" y="0" width="${layout.width}" height="${layout.height}" fill="url(#topPhotoFade)"/>
  <rect x="0" y="0" width="${layout.width}" height="${layout.height}" fill="url(#bottomFade)"/>
  <rect x="0" y="0" width="${layout.width}" height="${layout.height}" fill="url(#bottomRightFade)"/>

  <g>
    <image href="data:image/jpeg;base64,${imageDataBase64}" x="${layout.photoInset.x}" y="${layout.photoInset.y}" width="${layout.photoInset.width}" height="${layout.photoInset.height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#photoCircle)"/>
    <circle
      cx="${layout.photoInset.x + layout.photoInset.width / 2}"
      cy="${layout.photoInset.y + layout.photoInset.height / 2}"
      r="${layout.photoInset.width / 2}"
      fill="none"
      stroke="${NEWS_PRIMARY}"
      stroke-width="${10 * (layout.width / 1080)}"
    />
  </g>

  <text x="${layout.photoCredit.x}" y="${layout.photoCredit.y + 22 * (layout.width / 1080)}" fill="${NEWS_WHITE}" font-family="DejaVu Sans, sans-serif" font-size="${17 * (layout.width / 1080)}" font-weight="700">
    Photo credit: ${escapeXml(photoCredit)}
  </text>

  ${renderBrandLockup({ box: layout.brand })}

  <g>
    ${headline.svg}
  </g>

  <text x="${layout.source.x + layout.source.width / 2}" y="${layout.source.y + 19 * (layout.width / 1080)}" text-anchor="middle" fill="${NEWS_WHITE}" font-family="DejaVu Sans, sans-serif" font-size="${17 * (layout.width / 1080)}" font-weight="700">
    Source: ${escapeXml(sourceDomain)}
  </text>
</svg>`;
}

export async function renderNewsImage({
  imageBuffer,
  hook,
  title,
  sourceDomain,
  angle,
  photoCredit,
  outputPath,
  template = '4:5'
}) {
  const dir = await mkdtemp('/tmp/a-little-better-news-');
  const inputPath = join(dir, 'source.jpg');
  const svgPath = join(dir, 'post.svg');

  try {
    await writeFile(inputPath, imageBuffer);
    const base64 = imageBuffer.toString('base64');

    await writeFile(svgPath, buildNewsSvg({
      imageDataBase64: base64,
      hook,
      title,
      sourceDomain,
      angle,
      photoCredit,
      template
    }), 'utf8');

    let command = 'magick';
    try {
      await execFileAsync(command, ['-version']);
    } catch {
      command = 'convert';
    }

    await execFileAsync(command, [
      svgPath,
      '-background', NEWS_DARK,
      '-resize', `${TEMPLATES[template]?.width || NEWS_CANVAS.width}x${TEMPLATES[template]?.height || NEWS_CANVAS.height}!`,
      outputPath
    ]);

    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
