import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function wrapLines(text, maxChars = 32) {
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

function buildSvg({ imageText }) {
  const lines = wrapLines(imageText, 33);
  const startY = 455 - Math.max(0, lines.length - 4) * 24;
  const body = lines.map((line, i) => {
    const y = startY + i * 76;
    return `<text x="540" y="${y}" text-anchor="middle" class="quote">${escapeXml(line || ' ')}</text>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <rect width="1080" height="1350" rx="54" fill="#FFF9F0"/>
  <rect x="58" y="58" width="964" height="1234" rx="44" fill="#FFFDF9" stroke="#E6D9C8" stroke-width="3"/>
  <circle cx="116" cy="116" r="12" fill="#B89455"/>
  <text x="150" y="128" class="brand">A LITTLE BETTER</text>
  <text x="150" y="163" class="tagline">one small step at a time</text>
  <line x1="120" y1="245" x2="960" y2="245" stroke="#E6D9C8" stroke-width="3"/>
  <g font-family="DejaVu Sans, sans-serif" fill="#2F2A24">
    ${body}
  </g>
  <text x="540" y="1065" text-anchor="middle" class="small">You do not need to be perfect.</text>
  <text x="540" y="1105" text-anchor="middle" class="small">Just keep becoming a little better.</text>
  <text x="540" y="1215" text-anchor="middle" class="footer">A LITTLE BETTER</text>
  <style>
    .brand { font: 700 30px 'DejaVu Sans'; letter-spacing: 4px; fill: #2F2A24; }
    .tagline { font: 400 19px 'DejaVu Sans'; letter-spacing: 1.5px; fill: #8D7A65; }
    .quote { font: 700 46px 'DejaVu Sans'; fill: #2F2A24; }
    .small { font: 400 25px 'DejaVu Sans'; fill: #6F6255; }
    .footer { font: 700 23px 'DejaVu Sans'; letter-spacing: 3px; fill: #B89455; }
  </style>
</svg>`;

}

export async function renderPostImage({ imageText }) {
  const dir = await mkdtemp(join(tmpdir(), 'a-little-better-'));
  const svgPath = join(dir, 'post.svg');
  const pngPath = join(dir, 'post.png');
  try {
    await writeFile(svgPath, buildSvg({ imageText }), 'utf8');
    let command = 'magick';
    try {
      await execFileAsync(command, ['-version']);
    } catch {
      command = 'convert';
    }
    await execFileAsync(command, [svgPath, '-background', 'white', '-resize', '1080x1350!', pngPath]);
    return await readFile(pngPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export { buildSvg, wrapLines };
