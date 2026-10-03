import sharp from 'sharp';

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
  return String(text || '').length * size * 0.56;
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
  maxFontSize = 66,
  minFontSize = 34,
  lineHeight = 1.08,
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
    4 * scale
  );

  const circleRadius = 178 * scale;
  const circleCenterX = 250 * scale;
  const circleCenterY = 268 * scale;
  const photoInset = rect(
    circleCenterX - circleRadius,
    circleCenterY - circleRadius,
    circleRadius * 2,
    circleRadius * 2,
    'photo-inset',
    10 * scale
  );

  const brandWidth = 430 * scale;
  const brandHeight = 70 * scale;

  const source = rect(
    NEWS_SAFE * scale,
    height - 70 * scale,
    width - NEWS_SAFE * 2 * scale,
    30 * scale,
    'source',
    4 * scale
  );

  const headlineHeight = Math.min(
    330 * scale,
    Math.max(210 * scale, height * 0.21)
  );
  const headline = rect(
    NEWS_SAFE * scale,
    source.y - 34 * scale - headlineHeight,
    width - NEWS_SAFE * 2 * scale,
    headlineHeight,
    'headline',
    10 * scale
  );

  const brand = rect(
    (width - brandWidth) / 2,
    headline.y - 98 * scale,
    brandWidth,
    brandHeight,
    'branding',
    5 * scale
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
  const fontSize = Math.max(14, Math.min(18, 17 * (w / 430)));

  return [
    '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + h / 2 + '" fill="' + NEWS_PRIMARY + '"/>',
    '<g>',
    '<path d="M' + (x + 35) + ' ' + (centerY + 7) + ' C' + (x + 35) + ' ' + (centerY - 18) + ' ' + (x + 51) + ' ' + (centerY - 31) + ' ' + (x + 69) + ' ' + (centerY - 32) + ' C' + (x + 68) + ' ' + (centerY - 11) + ' ' + (x + 57) + ' ' + (centerY + 4) + ' ' + (x + 35) + ' ' + (centerY + 7) + 'Z" fill="' + NEWS_DARK + '"/>',
    '<path d="M' + (x + 37) + ' ' + (centerY + 6) + ' C' + (x + 26) + ' ' + (centerY - 5) + ' ' + (x + 18) + ' ' + (centerY - 8) + ' ' + (x + 9) + ' ' + (centerY - 7) + ' C' + (x + 12) + ' ' + (centerY + 6) + ' ' + (x + 22) + ' ' + (centerY + 12) + ' ' + (x + 37) + ' ' + (centerY + 6) + 'Z" fill="' + NEWS_DARK + '"/>',
    '<path d="M' + (x + 37) + ' ' + (centerY + 6) + ' V' + (centerY + 22) + '" stroke="' + NEWS_DARK + '" stroke-width="3" stroke-linecap="round"/>',
    '<text x="' + (x + 96) + '" y="' + (centerY + 6) + '" fill="' + NEWS_DARK + '" font-family="DejaVu Sans, sans-serif" font-size="' + fontSize + '" font-weight="800" letter-spacing="2.5">',
    'A LITTLE BETTER',
    '</text>',
    '</g>'
  ].join('');
}

function renderHeadline({ box, title }) {
  const fit = fitTextToBox(title, {
    maxWidth: box.width - box.padding * 2,
    maxHeight: box.height - box.padding * 2,
    maxFontSize: 62,
    minFontSize: 38,
    lineHeight: 1.08,
    maxLines: 4
  });

  const lineGap = fit.fontSize * fit.lineHeight;
  const totalHeight = fit.lines.length * lineGap;
  const yStart = box.y + (box.height - totalHeight) / 2 + fit.fontSize * 0.8;
  const x = box.x + box.width / 2;

  const lines = fit.lines.map((line, lineIndex) => {
    const baseline = yStart + lineIndex * lineGap;
    const color = lineIndex === fit.lines.length - 1 ? NEWS_PRIMARY : NEWS_WHITE;
    const estimated = Math.min(
      box.width - box.padding * 2,
      Math.max(1, estimateWidth(line, fit.fontSize))
    );
    const textLength = estimated < box.width * 0.98 ? '' : ' textLength="' + estimated + '" lengthAdjust="spacingAndGlyphs"';

    return '<text x="' + x + '" y="' + baseline +
      '" text-anchor="middle" dominant-baseline="alphabetic" font-family="DejaVu Sans, sans-serif" font-size="' + fit.fontSize +
      '" font-weight="800" letter-spacing="-1.0" fill="' + color + '"' + textLength + '>' +
      escapeXml(line) +
      '</text>';
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
    '<stop offset="45%" stop-color="#000000" stop-opacity="0.04"/>',
    '<stop offset="70%" stop-color="#000000" stop-opacity="0.24"/>',
    '<stop offset="86%" stop-color="#000000" stop-opacity="0.62"/>',
    '<stop offset="100%" stop-color="#000000" stop-opacity="0.94"/>',
    '</linearGradient>',
    '<radialGradient id="bottomRightFade" cx="100%" cy="100%" r="70%">',
    '<stop offset="0%" stop-color="#000000" stop-opacity="0.42"/>',
    '<stop offset="55%" stop-color="#000000" stop-opacity="0.15"/>',
    '<stop offset="100%" stop-color="#000000" stop-opacity="0"/>',
    '</radialGradient>',
    '</defs>',
    '<rect width="' + layout.width + '" height="' + layout.height + '" fill="url(#bottomFade)"/>',
    '<rect width="' + layout.width + '" height="' + layout.height + '" fill="url(#bottomRightFade)"/>',
    '<circle cx="' + (layout.photoInset.x + layout.photoInset.width / 2) +
      '" cy="' + (layout.photoInset.y + layout.photoInset.height / 2) +
      '" r="' + (layout.photoInset.width / 2) +
      '" fill="none" stroke="' + NEWS_PRIMARY + '" stroke-width="' + (10 * scale) + '"/>',
    '<rect x="' + layout.photoCredit.x + '" y="' + (layout.photoCredit.y - 2 * scale) +
      '" width="' + layout.photoCredit.width + '" height="' + (30 * scale) +
      '" rx="' + (12 * scale) + '" fill="#000000" fill-opacity="0.45"/>',
    '<text x="' + (layout.photoCredit.x + 14 * scale) + '" y="' + (layout.photoCredit.y + 19 * scale) +
      '" fill="' + NEWS_WHITE + '" font-family="DejaVu Sans, sans-serif" font-size="' + (14 * scale) +
      '" font-weight="700">',
    'Photo credit: ' + escapeXml(photoCredit),
    '</text>',
    renderBrandLockup({ box: layout.brand }),
    '<g>' + headline.svg + '</g>',
    '<rect x="' + (layout.source.x + 180 * scale) + '" y="' + (layout.source.y - 3 * scale) +
      '" width="' + Math.max(120 * scale, layout.source.width - 360 * scale) + '" height="' + (29 * scale) +
      '" rx="' + (14 * scale) + '" fill="#000000" fill-opacity="0.36"/>',
    '<text x="' + (layout.source.x + layout.source.width / 2) +
      '" y="' + (layout.source.y + 18 * scale) +
      '" text-anchor="middle" fill="' + NEWS_WHITE +
      '" font-family="DejaVu Sans, sans-serif" font-size="' + (14 * scale) +
      '" font-weight="700">',
    'Source: ' + escapeXml(sourceDomain),
    '</text>',
    '</svg>'
  ].join('\n');
}

async function prepareBackground(imageBuffer, width, height) {
  return sharp(imageBuffer, { failOn: 'error' })
    .rotate()
    .resize({
      width,
      height,
      fit: 'cover',
      position: 'attention',
      withoutEnlargement: false
    })
    .removeAlpha()
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toBuffer();
}

async function prepareCircularInset(imageBuffer, size) {
  const photo = await sharp(imageBuffer, { failOn: 'error' })
    .rotate()
    .resize({ width: size, height: size, fit: 'cover', position: 'attention' })
    .removeAlpha()
    .png()
    .toBuffer();

  const mask = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '">' +
    '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + (size / 2 - 2) + '" fill="white"/>' +
    '</svg>'
  );

  return sharp(photo)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

async function imageMean(buffer) {
  const stats = await sharp(buffer).stats();
  const channels = stats.channels || [];
  if (!channels.length) return 0;
  return channels.reduce((sum, channel) => sum + channel.mean, 0) / channels.length;
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
  const layout = calculateNewsLayout(template);
  const background = await prepareBackground(imageBuffer, layout.width, layout.height);
  const inset = await prepareCircularInset(imageBuffer, Math.round(layout.photoInset.width));
  const overlaySvg = buildNewsSvg({
    imageDataBase64: '',
    hook,
    title,
    sourceDomain,
    angle,
    photoCredit,
    template
  });
  const overlay = Buffer.from(overlaySvg);

  const backgroundMean = await imageMean(background);
  if (backgroundMean < 4) {
    throw new Error('Source photo decoded as effectively black; refusing to create a black Fresh News graphic.');
  }

  const output = await sharp(background)
    .composite([
      {
        input: inset,
        left: Math.round(layout.photoInset.x),
        top: Math.round(layout.photoInset.y)
      },
      {
        input: overlay,
        left: 0,
        top: 0
      }
    ])
    .png()
    .toBuffer();

  const outputMean = await imageMean(output);
  if (outputMean < Math.max(4, backgroundMean * 0.12)) {
    throw new Error('Fresh News render lost the source photo; refusing to save the result.');
  }

  await sharp(output).png().toFile(outputPath);
  const metadata = await sharp(output).metadata();
  const expected = layout.width + 'x' + layout.height;
  const actual = metadata.width + 'x' + metadata.height;
  if (actual !== expected) {
    throw new Error('Rendered image dimensions are ' + actual + ', expected ' + expected + '.');
  }

  return output;
}
