import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getLatestPostSnapshots, performanceScore } from './analytics.js';
import { getPhilippineDate, contentBank } from './content.js';
import { getWeekStart } from './growth-report.js';
import { wrapLines, calculateFontSize } from './image.js';

const execFileAsync = promisify(execFile);

const WIDTH = 1080;
const HEIGHT = 1920;
const SLIDE_DURATION_SECONDS = 3;

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getWeekEnd(weekStart) {
  return addDays(weekStart, 6);
}

export function buildReelStoryboard({ imageText = '' } = {}) {
  const lines = String(imageText)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const hook = lines[0] || 'Keep going.';
  const message = lines.slice(1).join('\n\n') || hook;

  return [
    { role: 'hook', text: hook },
    { role: 'message', text: message },
    { role: 'cta', text: 'Follow A Little Better for daily reminders to keep going.' }
  ];
}

export function buildReelSvg({ role = 'message', text = '' } = {}) {
  const maxFont = role === 'hook' ? 72 : role === 'cta' ? 62 : 58;
  const lines = wrapLines(text, 24).filter(Boolean);
  const fontSize = calculateFontSize(lines, 860, 780, {
    max: maxFont,
    min: 30,
    lineHeightRatio: 1.08
  });
  const lineGap = Math.round(fontSize * 1.12);
  const totalHeight = fontSize + Math.max(0, lines.length - 1) * lineGap;
  const firstBaseline = 520 + (780 - totalHeight) / 2 + fontSize * 0.84;

  const body = lines.map((line, index) => {
    const y = firstBaseline + index * lineGap;
    return `<text x="540" y="${y}" text-anchor="middle" class="headline" font-size="${fontSize}">${escapeXml(line)}</text>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#A6D8B8"/>
  <rect x="86" y="360" width="908" height="1050" rx="64" fill="none" stroke="#FFFFFF" stroke-width="4" opacity="0.45"/>
  <g fill="#FFFFFF" font-family="DejaVu Sans, sans-serif">
    ${body}
    <text x="540" y="1370" text-anchor="middle" class="support">A little better, one day at a time.</text>
    <text x="540" y="1765" text-anchor="middle" class="brand">A LITTLE BETTER</text>
  </g>
  <style>
    .headline { font-family: 'DejaVu Sans'; font-weight: 700; }
    .support { font-family: 'DejaVu Sans'; font-size: 26px; font-weight: 400; }
    .brand { font-family: 'DejaVu Sans'; font-size: 26px; font-weight: 700; letter-spacing: 5px; }
  </style>
</svg>`;
}

export function selectTopReelPost({
  weekStart,
  weekEnd,
  history = [],
  analytics = {}
} = {}) {
  const weeklyPosts = (Array.isArray(history) ? history : [])
    .filter(post => post?.date >= weekStart && post?.date <= weekEnd && post?.facebookPostId);

  const weeklyIds = new Set(weeklyPosts.map(post => post.facebookPostId));
  const latest = getLatestPostSnapshots(
    (Array.isArray(analytics?.snapshots) ? analytics.snapshots : [])
      .filter(snapshot => weeklyIds.has(snapshot.facebookPostId))
  );

  const sorted = [...latest].sort((a, b) =>
    performanceScore(b) - performanceScore(a) ||
    Number(b.engagement || 0) - Number(a.engagement || 0) ||
    String(b.facebookPostId).localeCompare(String(a.facebookPostId))
  );

  const source = sorted[0];
  if (!source) return null;

  const historyPost = weeklyPosts.find(post => post.facebookPostId === source.facebookPostId);
  const content = contentBank.find(post => post.id === historyPost?.contentId);

  return {
    ...source,
    date: historyPost?.date || source.postDate,
    category: historyPost?.category || source.category,
    imageText: content?.imageText || '',
    caption: content?.caption || ''
  };
}

async function findCommand(primary, fallback) {
  try {
    await execFileAsync(primary, ['-version']);
    return primary;
  } catch {
    await execFileAsync(fallback, ['-version']);
    return fallback;
  }
}

export async function renderReelVideo({
  storyboard,
  outputPath,
  imageMagickCommand = null,
  ffmpegCommand = 'ffmpeg'
} = {}) {
  if (!Array.isArray(storyboard) || storyboard.length !== 3) {
    throw new Error('A Reel storyboard must contain exactly three slides.');
  }
  if (!outputPath) throw new Error('outputPath is required.');

  const magick = imageMagickCommand || await findCommand('magick', 'convert');
  await execFileAsync(ffmpegCommand, ['-version']);

  const dir = await mkdtemp(join(tmpdir(), 'a-little-better-reel-'));
  await mkdir(dirname(resolve(outputPath)), { recursive: true });

  try {
    const files = [];

    for (let index = 0; index < storyboard.length; index += 1) {
      const svgPath = join(dir, `slide-${index + 1}.svg`);
      const pngPath = join(dir, `slide-${index + 1}.png`);
      await writeFile(svgPath, buildReelSvg(storyboard[index]), 'utf8');
      await execFileAsync(magick, [
        svgPath,
        '-background', '#A6D8B8',
        '-resize', `${WIDTH}x${HEIGHT}!`,
        pngPath
      ]);
      files.push(pngPath);
    }

    const concatPath = join(dir, 'concat.txt');
    const concatLines = [];
    for (const file of files) {
      concatLines.push(`file '${file.replaceAll("'", "'\\''")}'`);
      concatLines.push(`duration ${SLIDE_DURATION_SECONDS}`);
    }
    concatLines.push(`file '${files.at(-1).replaceAll("'", "'\\''")}'`);
    await writeFile(concatPath, `${concatLines.join('\n')}\n`, 'utf8');

    await execFileAsync(ffmpegCommand, [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatPath,
      '-r', '30',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      outputPath
    ]);

    return resolve(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  const today = getPhilippineDate();
  const weekStart = getWeekStart(today);
  const weekEnd = getWeekEnd(weekStart);

  const history = JSON.parse(await readFile(resolve('data/posting-history.json'), 'utf8'));
  const analytics = JSON.parse(await readFile(resolve('data/growth-analytics.json'), 'utf8'));

  const topPost = selectTopReelPost({
    weekStart,
    weekEnd,
    history: history.posts,
    analytics
  });

  if (!topPost) {
    console.log(`No measured post available for Reel generation for ${weekStart} to ${weekEnd}.`);
    process.exit(0);
  }

  const storyboard = buildReelStoryboard({ imageText: topPost.imageText });
  const outputPath = resolve(`artifacts/reel-${weekEnd}-${topPost.contentId}.mp4`);
  await renderReelVideo({ storyboard, outputPath });

  console.log(`Generated Reel draft from ${topPost.contentId}: ${outputPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}
