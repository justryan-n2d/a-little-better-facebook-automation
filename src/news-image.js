import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const NEWS_CANVAS = { width: 1080, height: 1350 };
export const NEWS_PRIMARY = '#A3D4C0';
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
  return String(text || '').length * size * 0.66;
}

export function wrapTextToBox(text, { fontSize, maxWidth } = {}) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  for (const word of words) {
    const next = current ? current + ' ' + word : word;
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
  maxFontSize = 68,
  minFontSize = 34,
  lineHeight = 1.16,
  maxLines = 4
} = {}) {
  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 1) {
    const lines = wrapTextToBox(text, { fontSize, maxWidth });
    const width = Math.max(...lines.map(line => estimateWidth(line, fontSize)), 0);
    const height = lines.length * fontSize * lineHeight;

    if (lines.length <= maxLines && width <= maxWidth && height <= maxHeight) {
      return { fontSize, lineHeight, lines, width, height };
    }
  }

  throw new Error(
    'Text cannot fit in allocated box: "' + String(text || '').slice(0, 100) + '"'
  );
}

async function measureRenderedLine(command, text, fontSize) {
  const { stdout } = await execFileAsync(command, [
    '-background', 'none',
    '-font', 'DejaVu-Sans-Bold',
    '-pointsize', String(fontSize),
    'label:' + String(text || ''),
    '-trim',
    '-format', '%wx%h',
    'info:'
  ]);

  const match = stdout.trim().match(/^(\d+)x(\d+)$/);
  if (!match) throw new Error('Unable to measure rendered headline text.');
  return { width: Number(match[1]), height: Number(match[2]) };
}

async function fitRenderedHeadline(command, text, box) {
  let fit = fitTextToBox(text, {
    maxWidth: box.width - box.padding * 2,
    maxHeight: box.height - box.padding * 2,
    maxFontSize: 68,
    minFontSize: 34,
    lineHeight: 1.16,
    maxLines: 4
  });

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const measurements = await Promise.all(
      fit.lines.map(line => measureRenderedLine(command, line, fit.fontSize))
    );

    const maxMeasuredWidth = Math.max(...measurements.map(item => item.width), 0);
    const actualLineHeight = Math.max(
      fit.fontSize * fit.lineHeight,
      Math.max(...measurements.map(item => item.height), 0) * 1.16
    );
    const totalHeight = fit.lines.length * actualLineHeight;

    if (
      fit.lines.length <= 4 &&
      maxMeasuredWidth <= box.width - box.padding * 2 &&
      totalHeight <= box.height - box.padding * 2
    ) {
      return {
        ...fit,
        lineHeight: actualLineHeight / fit.fontSize,
        width: maxMeasuredWidth,
        height: totalHeight
      };
    }

    const nextFontSize = fit.fontSize - 2;
    if (nextFontSize < 34) break;

    fit = {
      ...fitTextToBox(text, {
        maxWidth: box.width - box.padding * 2,
        maxHeight: box.height - box.padding * 2,
        maxFontSize: nextFontSize,
        minFontSize: 34,
        lineHeight: 1.16,
        maxLines: 4
      })
    };
  }

  throw new Error(
    'Rendered headline could not fit safely inside its allocated zone.'
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
    30 * scale,
    'photo-credit',
    6 * scale
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

  const brandWidth = 360 * scale;
  const brandHeight = 72 * scale;
  const source = rect(
    NEWS_SAFE * scale,
    height - 70 * scale,
    width - NEWS_SAFE * 2 * scale,
    34 * scale,
    'source',
    6 * scale
  );

  const headlineHeight = Math.min(
    380 * scale,
    Math.max(240 * scale, height * 0.23)
  );
  const headline = rect(
    NEWS_SAFE * scale,
    source.y - 58 * scale - headlineHeight,
    width - NEWS_SAFE * 2 * scale,
    headlineHeight,
    'headline',
    18 * scale
  );

  const brand = rect(
    (width - brandWidth) / 2,
    headline.y - 94 * scale,
    brandWidth,
    brandHeight,
    'branding',
    10 * scale
  );

  const zones = [photoCredit, photoInset, brand, headline, source];
  for (let i = 0; i < zones.length; i += 1) {
    for (let j = i + 1; j < zones.length; j += 1) {
      const a = zones[i];
      const b = zones[j];
      if (rectanglesOverlap(a, b)) {
        if (a.name === 'photo-inset' || b.name === 'photo-inset') continue;
        throw new Error('Layout collision: ' + a.name + ' overlaps ' + b.name);
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
  const fontSize = Math.max(15, Math.min(18, (w - 112) / 13.5));

  return [
    '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + h / 2 + '" fill="' + NEWS_PRIMARY + '"/>',
    '<g>',
    '<path d="M' + (x + 34) + ' ' + (centerY + 7) + ' C' + (x + 34) + ' ' + (centerY - 18) + ' ' + (x + 51) + ' ' + (centerY - 31) + ' ' + (x + 69) + ' ' + (centerY - 32) + ' C' + (x + 68) + ' ' + (centerY - 11) + ' ' + (x + 57) + ' ' + (centerY + 4) + ' ' + (x + 34) + ' ' + (centerY + 7) + 'Z" fill="' + NEWS_DARK + '"/>',
    '<path d="M' + (x + 36) + ' ' + (centerY + 6) + ' C' + (x + 25) + ' ' + (centerY - 5) + ' ' + (x + 17) + ' ' + (centerY - 8) + ' ' + (x + 8) + ' ' + (centerY - 7) + ' C' + (x + 11) + ' ' + (centerY + 6) + ' ' + (x + 21) + ' ' + (centerY + 12) + ' ' + (x + 36) + ' ' + (centerY + 6) + 'Z" fill="' + NEWS_DARK + '"/>',
    '<path d="M' + (x + 36) + ' ' + (centerY + 6) + ' V' + (centerY + 22) + '" stroke="' + NEWS_DARK + '" stroke-width="3" stroke-linecap="round"/>',
    '<text x="' + (x + 88) + '" y="' + (centerY + 7) + '" fill="' + NEWS_DARK + '" font-family="DejaVu Sans, sans-serif" font-size="' + fontSize + '" font-weight="800" letter-spacing="2">',
    'A LITTLE BETTER',
    '</text>',
    '</g>'
  ].join('');
}

function renderHeadline({ box, title, fitOverride = null }) {
  const fit = fitOverride || fitTextToBox(title, {
    maxWidth: box.width - box.padding * 2,
    maxHeight: box.height - box.padding * 2,
    maxFontSize: 68,
    minFontSize: 34,
    lineHeight: 1.16,
    maxLines: 4
  });

  const highlights = chooseHighlights(fit.lines);
  const lineGap = fit.fontSize * fit.lineHeight;
  const totalHeight = fit.lines.length * lineGap;
  const yStart = box.y + (box.height - totalHeight) / 2 + fit.fontSize * 0.82;
  const x = box.x + box.width / 2;

  const lines = fit.lines.map((line, lineIndex) => {
    const parts = line.split(/(\s+)/);
    const tspans = parts.map(part => {
      const isWord = /\S/.test(part);
      const cleaned = part.replace(/[^A-Za-z0-9]/g, '');
      const highlighted = isWord && highlights.includes(cleaned);
      return '<tspan fill="' + (highlighted ? NEWS_PRIMARY : NEWS_WHITE) + '" font-weight="800">' +
        escapeXml(part) +
        '</tspan>';
    }).join('');

    return '<text x="' + x + '" y="' + (yStart + lineIndex * lineGap) +
      '" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="' + fit.fontSize +
      '" font-weight="800" letter-spacing="-0.7">' + tspans + '</text>';
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
  template = '4:5',
  headlineFit = null
}) {
  const layout = calculateNewsLayout(template);
  const headline = renderHeadline({ box: layout.headline, title, fitOverride: headlineFit });
  const scale = layout.width / 1080;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + layout.width + '" height="' + layout.height + '" viewBox="0 0 ' + layout.width + ' ' + layout.height + '">',
    '<defs>',
    '<linearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0%" stop-color="#000000" stop-opacity="0"/>',
    '<stop offset="50%" stop-color="#000000" stop-opacity="0.02"/>',
    '<stop offset="70%" stop-color="#000000" stop-opacity="0.28"/>',
    '<stop offset="85%" stop-color="#000000" stop-opacity="0.68"/>',
    '<stop offset="100%" stop-color="#000000" stop-opacity="0.96"/>',
    '</linearGradient>',
    '<radialGradient id="bottomRightFade" cx="100%" cy="100%" r="70%">',
    '<stop offset="0%" stop-color="#000000" stop-opacity="0.34"/>',
    '<stop offset="55%" stop-color="#000000" stop-opacity="0.14"/>',
    '<stop offset="100%" stop-color="#000000" stop-opacity="0"/>',
    '</radialGradient>',
    '</defs>',
    '<rect width="' + layout.width + '" height="' + layout.height + '" fill="url(#bottomFade)"/>',
    '<rect width="' + layout.width + '" height="' + layout.height + '" fill="url(#bottomRightFade)"/>',
    '<circle cx="' + (layout.photoInset.x + layout.photoInset.width / 2) +
      '" cy="' + (layout.photoInset.y + layout.photoInset.height / 2) +
      '" r="' + (layout.photoInset.width / 2) +
      '" fill="none" stroke="' + NEWS_PRIMARY + '" stroke-width="' + (10 * scale) + '"/>',
    '<text x="' + layout.photoCredit.x + '" y="' + (layout.photoCredit.y + 21 * scale) +
      '" fill="' + NEWS_WHITE + '" font-family="DejaVu Sans, sans-serif" font-size="' + (16 * scale) +
      '" font-weight="700">',
    'Photo credit: ' + escapeXml(photoCredit),
    '</text>',
    renderBrandLockup({ box: layout.brand }),
    '<g>' + headline.svg + '</g>',
    '<text x="' + (layout.source.x + layout.source.width / 2) +
      '" y="' + (layout.source.y + 22 * scale) +
      '" text-anchor="middle" fill="' + NEWS_WHITE +
      '" font-family="DejaVu Sans, sans-serif" font-size="' + (16 * scale) +
      '" font-weight="700">',
    'Source: ' + escapeXml(sourceDomain),
    '</text>',
    '</svg>'
  ].join('\n');
}

async function resolveMagickCommand() {
  for (const command of ['magick', 'convert']) {
    try {
      await execFileAsync(command, ['-version']);
      return command;
    } catch {
      // Try the next executable.
    }
  }
  throw new Error('ImageMagick is required to render Fresh News images.');
}

async function prepareBackground(command, inputPath, outputPath, width, height) {
  await execFileAsync(command, [
    inputPath,
    '-auto-orient',
    '-resize', width + 'x' + height + '^',
    '-gravity', 'center',
    '-extent', width + 'x' + height,
    '-strip',
    '-quality', '92',
    outputPath
  ]);
}

async function prepareCircularInset(command, inputPath, outputPath, size, innerRadius) {
  const dir = await mkdtemp('/tmp/a-little-better-inset-');
  const squarePath = join(dir, 'square.jpg');
  const maskPath = join(dir, 'mask.png');

  try {
    await execFileAsync(command, [
      inputPath,
      '-auto-orient',
      '-resize', size + 'x' + size + '^',
      '-gravity', 'center',
      '-extent', size + 'x' + size,
      '-strip',
      '-quality', '92',
      squarePath
    ]);

    await execFileAsync(command, [
      '-size', size + 'x' + size,
      'xc:none',
      '-fill', 'white',
      '-draw', 'circle ' + (size / 2) + ',' + (size / 2) + ' ' + (size / 2) + ',' + (size / 2 - innerRadius),
      maskPath
    ]);

    await execFileAsync(command, [
      squarePath,
      maskPath,
      '-alpha', 'off',
      '-compose', 'CopyOpacity',
      '-composite',
      '-strip',
      outputPath
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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
  const inputPath = join(dir, 'source-input');
  const backgroundPath = join(dir, 'background.jpg');
  const insetPath = join(dir, 'inset-circle.png');
  const composedPath = join(dir, 'composed.png');
  const overlaySvgPath = join(dir, 'overlay.svg');
  const overlayPngPath = join(dir, 'overlay.png');

  try {
    await writeFile(inputPath, imageBuffer);

    const command = await resolveMagickCommand();
    const layout = calculateNewsLayout(template);

    await prepareBackground(
      command,
      inputPath,
      backgroundPath,
      layout.width,
      layout.height
    );

    const insetSize = Math.round(layout.photoInset.width);
    const innerRadius = Math.max(1, insetSize / 2 - Math.round(10 * (layout.width / 1080)));

    await prepareCircularInset(
      command,
      inputPath,
      insetPath,
      insetSize,
      innerRadius
    );

    await execFileAsync(command, [
      backgroundPath,
      insetPath,
      '-geometry', '+' + Math.round(layout.photoInset.x) + '+' + Math.round(layout.photoInset.y),
      '-compose', 'Over',
      '-composite',
      composedPath
    ]);

    const headlineFit = await fitRenderedHeadline(command, title, layout.headline);

    const overlaySvg = buildNewsSvg({
      imageDataBase64: '',
      hook,
      title,
      sourceDomain,
      angle,
      photoCredit,
      template,
      headlineFit
    });

    await writeFile(overlaySvgPath, overlaySvg, 'utf8');

    await execFileAsync(command, [
      overlaySvgPath,
      '-background', 'none',
      '-alpha', 'on',
      overlayPngPath
    ]);

    await execFileAsync(command, [
      composedPath,
      overlayPngPath,
      '-compose', 'Over',
      '-composite',
      outputPath
    ]);

    const { stdout } = await execFileAsync(command, [
      outputPath,
      '-format', '%wx%h',
      'info:'
    ]);

    const expected = layout.width + 'x' + layout.height;
    if (stdout.trim() !== expected) {
      throw new Error('Rendered image dimensions are ' + stdout.trim() + ', expected ' + expected + '.');
    }

    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
