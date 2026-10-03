import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const CANVAS = { width: 1080, height: 1350 };
const COLORS = {
  mint: '#A6D8B8',
  white: '#FFFFFF'
};

const SAFE = 108;

const LAYOUTS = {
  mint: {
    headline: { x: 126, y: 300, width: 816, height: 500 },
    support: { x: 150, y: 865, width: 780, height: 90 },
    brand: { x: 360, y: 1156, width: 360, height: 60 }
  },
  alternate: {
    headline: { x: 126, y: 300, width: 810, height: 500 },
    support: { x: 150, y: 875, width: 780, height: 90 },
    brand: { x: 360, y: 1156, width: 360, height: 60 }
  }
};

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function wrapLines(text, maxChars = 20) {
  return String(text)
    .split(/\r?\n/)
    .flatMap(line => {
      if (!line.trim()) return [''];
      const words = line.trim().split(/\s+/);
      const lines = [];
      let current = '';

      for (const word of words) {
        if (word.length > maxChars) {
          if (current) {
            lines.push(current);
            current = '';
          }
          for (let i = 0; i < word.length; i += maxChars) {
            lines.push(word.slice(i, i + maxChars));
          }
          continue;
        }

        const next = current ? `${current} ${word}` : word;
        if (next.length > maxChars && current) {
          lines.push(current);
          current = word;
        } else {
          current = next;
        }
      }

      if (current) lines.push(current);
      return lines;
    });
}

export function estimateTextWidth(text, fontSize) {
  let units = 0;
  for (const char of String(text)) {
    if ('ilIjtfr'.includes(char)) units += 0.28;
    else if ('mwMW@#%&'.includes(char)) units += 0.95;
    else if ('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.includes(char)) units += 0.66;
    else if ('0123456789'.includes(char)) units += 0.60;
    else if ('.,:;!|'.includes(char)) units += 0.30;
    else units += 0.52;
  }
  return units * fontSize;
}

export function calculateFontSize(lines, boxWidth, boxHeight, {
  max = 38,
  min = 22,
  lineHeightRatio = 1.18
} = {}) {
  if (!lines.length) return max;

  let size = max;
  const fits = candidate => {
    const totalHeight = candidate + Math.max(0, lines.length - 1) * candidate * lineHeightRatio;
    const maxWidth = Math.max(...lines.map(line => estimateTextWidth(line, candidate)));
    return totalHeight <= boxHeight && maxWidth <= boxWidth;
  };

  while (size > min && !fits(size)) size -= 1;

  if (!fits(size)) {
    throw new Error(`Headline cannot fit in its bounding box: ${lines.length} lines.`);
  }

  return size;
}

function rectForBox(box, pad = 0) {
  return {
    left: box.x - pad,
    top: box.y - pad,
    right: box.x + box.width + pad,
    bottom: box.y + box.height + pad
  };
}

function overlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function validateLayout(layout) {
  const canvas = { left: 0, top: 0, right: CANVAS.width, bottom: CANVAS.height };
  const zones = {
    headline: rectForBox(layout.headline, 18),
    support: rectForBox(layout.support, 18),
    brand: rectForBox(layout.brand, 18)
  };

  for (const [name, zone] of Object.entries(zones)) {
    if (
      zone.left < SAFE ||
      zone.top < SAFE ||
      zone.right > canvas.right - SAFE ||
      zone.bottom > canvas.bottom - SAFE
    ) {
      throw new Error(`Layout zone outside safe margins: ${name}`);
    }
  }

  const pairs = [
    ['headline', 'support'],
    ['headline', 'brand'],
    ['support', 'brand']
  ];

  for (const [a, b] of pairs) {
    if (overlaps(zones[a], zones[b])) {
      throw new Error(`Layout collision: ${a} overlaps ${b}`);
    }
  }

  return true;
}

function buildHeadline({ lines, box, fontSize }) {
  const lineGap = Math.round(fontSize * 1.12);
  const totalHeight = fontSize + Math.max(0, lines.length - 1) * lineGap;
  const firstBaseline = box.y + (box.height - totalHeight) / 2 + fontSize * 0.84;
  return lines.map((line, i) => {
    const y = firstBaseline + i * lineGap;
    return `<text x="${box.x + box.width / 2}" y="${y}" text-anchor="middle" class="headline" font-size="${fontSize}">${escapeXml(line || ' ')}</text>`;
  }).join('\n');
}

function buildBrand(layout) {
  const box = layout.brand;
  return `
    <g transform="translate(${CANVAS.width / 2} 0)">
      <g transform="translate(-116 ${box.y + 4})" stroke="${COLORS.white}" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path d="M0 40 C0 23 11 10 27 7 C27 24 18 39 0 40Z"/>
        <path d="M1 40 C-10 26 -19 21 -32 22 C-28 36 -17 43 1 40Z"/>
        <path d="M1 40 V54"/>
      </g>
      <text x="-70" y="${box.y + 39}" text-anchor="start" class="brand">A LITTLE BETTER</text>
    </g>`;
}
function buildMintSvg({ imageText }) {
  const layout = LAYOUTS.mint;
  validateLayout(layout);

  const lines = wrapLines(imageText, 24).filter(Boolean);
  const fontSize = calculateFontSize(lines, layout.headline.width - 28, layout.headline.height, {
    max: 52,
    min: 26,
    lineHeightRatio: 1.12
  });

  const body = buildHeadline({ lines, box: layout.headline, fontSize });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <rect width="1080" height="1350" fill="${COLORS.mint}"/>

  <g stroke="${COLORS.white}" stroke-width="7" stroke-linecap="round" fill="none">
    <path d="M145 360 l-28 -16 M153 335 l-8 -32 M185 354 l27 -28"/>
    <path d="M935 790 l32 -10 M943 815 l26 25 M918 815 l-5 32"/>
  </g>

  <g fill="${COLORS.white}" font-family="DejaVu Sans, sans-serif">
    ${body}
    <text x="540" y="900" text-anchor="middle" class="support">Take it one day at a time.</text>
    <path d="M420 930 Q540 952 660 930" stroke="${COLORS.white}" stroke-width="5" stroke-linecap="round" fill="none"/>
    ${buildBrand(layout)}
  </g>

  <style>
    .headline {
      font-family: 'DejaVu Sans';
      font-weight: 500;
    }
    .support {
      font-family: 'DejaVu Sans';
      font-size: 24px;
      font-weight: 400;
    }
    .brand {
      font-family: 'DejaVu Sans';
      font-size: 21px;
      font-weight: 700;
      letter-spacing: 4px;
      fill: ${COLORS.white};
    }
  </style>
</svg>`;
}

function buildAlternateSvg({ imageText }) {
  const layout = LAYOUTS.alternate;
  validateLayout(layout);

  const lines = wrapLines(imageText, 24).filter(Boolean);
  const fontSize = calculateFontSize(lines, layout.headline.width - 28, layout.headline.height, {
    max: 50,
    min: 25,
    lineHeightRatio: 1.12
  });

  const body = buildHeadline({ lines, box: layout.headline, fontSize });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <rect width="1080" height="1350" fill="${COLORS.mint}"/>

  <rect x="96" y="245" width="888" height="730" rx="42" fill="none" stroke="${COLORS.white}" stroke-width="3" opacity="0.35"/>
  <circle cx="125" cy="275" r="9" fill="${COLORS.white}" opacity="0.9"/>
  <circle cx="955" cy="945" r="9" fill="${COLORS.white}" opacity="0.9"/>

  <g fill="${COLORS.white}" font-family="DejaVu Sans, sans-serif">
    ${body}
    <text x="540" y="910" text-anchor="middle" class="support">A little better, one day at a time.</text>
    ${buildBrand(layout)}
  </g>

  <style>
    .headline {
      font-family: 'DejaVu Sans';
      font-weight: 500;
    }
    .support {
      font-family: 'DejaVu Sans';
      font-size: 24px;
      font-weight: 400;
    }
    .brand {
      font-family: 'DejaVu Sans';
      font-size: 21px;
      font-weight: 700;
      letter-spacing: 4px;
      fill: ${COLORS.white};
    }
  </style>
</svg>`;
}

export function buildSvg({ imageText, variant = 'mint' }) {
  return variant === 'alternate'
    ? buildAlternateSvg({ imageText })
    : buildMintSvg({ imageText });
}

export async function renderPostImage({ imageText, variant = 'mint' }) {
  const dir = await mkdtemp(join(tmpdir(), 'a-little-better-'));
  const svgPath = join(dir, 'post.svg');
  const pngPath = join(dir, 'post.png');

  try {
    await writeFile(svgPath, buildSvg({ imageText, variant }), 'utf8');

    let command = 'magick';
    try {
      await execFileAsync(command, ['-version']);
    } catch {
      command = 'convert';
    }

    await execFileAsync(command, [
      svgPath,
      '-background', COLORS.mint,
      '-resize', '1080x1350!',
      pngPath
    ]);

    return await readFile(pngPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
