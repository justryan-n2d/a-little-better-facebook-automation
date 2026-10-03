import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const CANVAS = { width: 1080, height: 1350 };
const YELLOW = '#FFD61A';
const WHITE = '#FFFFFF';
const DARK = '#111111';
const SAFE = 72;

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function wrap(text, maxChars = 25) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 5);
}

function fontSizeFor(lines, max = 58, min = 30, maxWidth = 860, lineHeight = 1.02) {
  let size = max;
  const widthEstimate = line => line.length * size * 0.56;
  while (size > min) {
    const height = lines.length * size * lineHeight;
    const width = Math.max(...lines.map(widthEstimate), 0);
    if (height <= 310 && width <= maxWidth) return size;
    size -= 1;
  }
  return size;
}

function chooseHighlights(lines) {
  const candidates = [];
  const words = lines.flatMap(line => line.split(/\s+/));
  for (const word of words) {
    const cleaned = word.replace(/[^A-Za-z0-9]/g, '');
    if (cleaned.length >= 5) candidates.push(cleaned);
  }
  return [...new Set(candidates)]
    .sort((a, b) => b.length - a.length)
    .slice(0, 2);
}

function renderHighlightedLines(lines, highlightWords, {
  x, yStart, size, lineGap
}) {
  return lines.map((line, index) => {
    const parts = line.split(/(\s+)/);
    let cursor = x;
    const totalWidth = line.length * size * 0.56;
    cursor = x - totalWidth / 2;

    const tspans = parts.map(part => {
      const isWord = /\S/.test(part);
      const cleaned = part.replace(/[^A-Za-z0-9]/g, '');
      const highlight = isWord && highlightWords.includes(cleaned);
      const out = `<tspan fill="${highlight ? YELLOW : WHITE}" font-weight="${highlight ? 800 : 800}">${escapeXml(part)}</tspan>`;
      return out;
    }).join('');

    return `<text x="${x}" y="${yStart + index * lineGap}" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="${size}" font-weight="800">${tspans}</text>`;
  }).join('\n');
}

export function buildNewsSvg({
  imageDataBase64,
  hook,
  title,
  sourceDomain,
  photoCredit
}) {
  const hookLines = wrap(hook, 24);
  const titleLines = wrap(title, 28);
  const hookSize = fontSizeFor(hookLines, 60, 34, 900, 1.02);
  const titleSize = fontSizeFor(titleLines, 42, 24, 860, 1.05);
  const hookHighlights = chooseHighlights(hookLines);\n  const angleLines = wrap(angle, 42).slice(0, 2);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}" viewBox="0 0 ${CANVAS.width} ${CANVAS.height}">
  <defs>
    <linearGradient id="darkfade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.05"/>
      <stop offset="55%" stop-color="#000000" stop-opacity="0.38"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.94"/>
    </linearGradient>
    <clipPath id="photoCircle">
      <circle cx="250" cy="270" r="165"/>
    </clipPath>
  </defs>

  <rect width="1080" height="1350" fill="#222222"/>
  <image href="data:image/jpeg;base64,${imageDataBase64}" x="0" y="0" width="1080" height="760" preserveAspectRatio="xMidYMid slice"/>
  <rect x="0" y="0" width="1080" height="760" fill="url(#darkfade)"/>

  <circle cx="250" cy="270" r="178" fill="${YELLOW}"/>
  <image href="data:image/jpeg;base64,${imageDataBase64}" x="85" y="105" width="330" height="330" preserveAspectRatio="xMidYMid slice" clip-path="url(#photoCircle)"/>
  <circle cx="250" cy="270" r="165" fill="none" stroke="${YELLOW}" stroke-width="8"/>

  <text x="${SAFE}" y="52" fill="${WHITE}" font-family="DejaVu Sans, sans-serif" font-size="18" font-weight="700">
    Photo: ${escapeXml(photoCredit)}
  </text>

  <rect x="385" y="680" width="310" height="64" rx="32" fill="${YELLOW}"/>
  <g>
    <path d="M425 725 C425 700 442 688 460 687 C459 708 449 723 425 725Z" fill="${DARK}"/>
    <path d="M427 724 C416 713 408 710 397 711 C401 724 411 729 427 724Z" fill="${DARK}"/>
    <path d="M427 724 V739" stroke="${DARK}" stroke-width="3" stroke-linecap="round"/>
    <text x="480" y="722" fill="${DARK}" font-family="DejaVu Sans, sans-serif" font-size="21" font-weight="800" letter-spacing="3">A LITTLE BETTER</text>
  </g>

  <text x="540" y="835" text-anchor="middle" fill="${WHITE}" font-family="DejaVu Sans, sans-serif" font-size="17" font-weight="700" letter-spacing="2">
    FRESH STORY
  </text>

  <g>
    ${renderHighlightedLines(hookLines, hookHighlights, { x: 540, yStart: 905, size: hookSize, lineGap: Math.round(hookSize * 1.04) })}
  </g>

  <g fill="${WHITE}">
    ${titleLines.map((line, i) =>
      `<text x="540" y="${1080 + i * Math.round(titleSize * 1.08)}" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="${titleSize}" font-weight="700">${escapeXml(line)}</text>`
    ).join('\n')}
  </g>

  <rect x="90" y="1232" width="900" height="2" fill="${YELLOW}" opacity="0.9"/>
  <text x="540" y="1270" text-anchor="middle" fill="${WHITE}" font-family="DejaVu Sans, sans-serif" font-size="19" font-weight="600">
    Source: ${escapeXml(sourceDomain)}
  </text>
</svg>`;
}

export async function renderNewsImage({
  imageBuffer,
  hook,
  title,
  sourceDomain,
  photoCredit,
  outputPath
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
      photoCredit
    }), 'utf8');

    let command = 'magick';
    try {
      await execFileAsync(command, ['-version']);
    } catch {
      command = 'convert';
    }

    await execFileAsync(command, [
      svgPath,
      '-background', DARK,
      '-resize', '1080x1350!',
      outputPath
    ]);

    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
