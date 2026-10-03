import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const MINT = '#A6D8B8';
const WHITE = '#FFFFFF';

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function wrapLines(text, maxChars = 27) {
  return String(text)
    .split(/\r?\n/)
    .flatMap(line => {
      if (!line.trim()) return [''];
      const words = line.trim().split(/\s+/);
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
      return lines;
    });
}

function getFontSize(lineCount) {
  if (lineCount <= 2) return 86;
  if (lineCount === 3) return 78;
  if (lineCount === 4) return 68;
  if (lineCount === 5) return 60;
  return 54;
}

function buildMintSvg({ imageText }) {
  const lines = wrapLines(imageText, 27).filter(Boolean);
  const fontSize = getFontSize(lines.length);
  const lineGap = Math.round(fontSize * 1.16);
  const totalHeight = Math.max(fontSize, lines.length * lineGap);
  const startY = 610 - totalHeight / 2 + fontSize;

  const body = lines.map((line, i) => {
    const y = startY + i * lineGap;
    return `<text x="540" y="${y}" text-anchor="middle" class="quote" style="font-size:${fontSize}px">${escapeXml(line)}</text>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <rect width="1080" height="1350" fill="${MINT}"/>

  <g stroke="${WHITE}" stroke-width="8" stroke-linecap="round" fill="none" opacity="0.95">
    <path d="M145 405 l-34 -18 M153 376 l-10 -38 M185 397 l28 -30"/>
    <path d="M935 760 l35 -12 M945 790 l28 28 M918 785 l-5 37"/>
  </g>

  <g font-family="DejaVu Sans, sans-serif" fill="${WHITE}">
    ${body}
  </g>

  <text x="540" y="840" text-anchor="middle" class="support">Take it one day at a time.</text>
  <path d="M405 875 Q540 905 675 875" stroke="${WHITE}" stroke-width="6" stroke-linecap="round" fill="none"/>

  <g transform="translate(392 1188)" stroke="${WHITE}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M32 38 C32 20 43 10 58 7 C58 24 49 38 32 38Z"/>
    <path d="M32 38 C22 23 12 20 3 21 C7 34 17 41 32 38Z"/>
    <path d="M32 38 V55"/>
  </g>
  <text x="470" y="1230" class="brand">A LITTLE BETTER</text>

  <style>
    .quote {
      font: 600 78px 'DejaVu Sans';
      letter-spacing: 0.2px;
    }
    .support {
      font: 400 34px 'DejaVu Sans';
      letter-spacing: 0.3px;
    }
    .brand {
      font: 700 23px 'DejaVu Sans';
      letter-spacing: 6px;
      fill: ${WHITE};
    }
  </style>
</svg>`;
}

function buildAlternateSvg({ imageText }) {
  const lines = wrapLines(imageText, 31).filter(Boolean);
  const fontSize = getFontSize(lines.length);
  const lineGap = Math.round(fontSize * 1.18);
  const totalHeight = Math.max(fontSize, lines.length * lineGap);
  const startY = 595 - totalHeight / 2 + fontSize;

  const body = lines.map((line, i) => {
    const y = startY + i * lineGap;
    return `<text x="540" y="${y}" text-anchor="middle" class="quote" style="font-size:${fontSize}px">${escapeXml(line)}</text>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <rect width="1080" height="1350" fill="${MINT}"/>
  <rect x="58" y="58" width="964" height="1234" rx="48" fill="none" stroke="${WHITE}" stroke-width="3" opacity="0.35"/>
  <circle cx="95" cy="95" r="10" fill="${WHITE}" opacity="0.85"/>
  <circle cx="985" cy="1255" r="10" fill="${WHITE}" opacity="0.85"/>

  <g font-family="DejaVu Sans, sans-serif" fill="${WHITE}">
    ${body}
  </g>

  <text x="540" y="1090" text-anchor="middle" class="support">A little better, one day at a time.</text>
  <text x="540" y="1230" text-anchor="middle" class="brand">A LITTLE BETTER</text>

  <style>
    .quote {
      font: 600 78px 'DejaVu Sans';
    }
    .support {
      font: 400 31px 'DejaVu Sans';
    }
    .brand {
      font: 700 22px 'DejaVu Sans';
      letter-spacing: 6px;
      fill: ${WHITE};
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
    await execFileAsync(command, [svgPath, '-background', MINT, '-resize', '1080x1350!', pngPath]);
    return await readFile(pngPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export { wrapLines };
