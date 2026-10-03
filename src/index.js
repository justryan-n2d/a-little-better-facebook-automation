import { resolve } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { getDailyPost, getPhilippineDate } from './content.js';
import { renderPostImage } from './image.js';
import { publishPhoto } from './facebook.js';
import { addPost, hasPostedOnDate, loadHistory, saveHistory } from './history.js';
import { shouldPublishAtHour } from './timing.js';

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function isTrue(name) {
  return ['1', 'true', 'yes', 'on'].includes((process.env[name] || '').toLowerCase());
}

const date = getPhilippineDate();
const historyPath = resolve(process.env.HISTORY_PATH || 'data/posting-history.json');
const history = await loadHistory(historyPath);

const analyticsPath = resolve(process.env.ANALYTICS_PATH || 'data/growth-analytics.json');
let analytics = {};
try {
  analytics = JSON.parse(await readFile(analyticsPath, 'utf8'));
} catch {
  analytics = {};
}

const dryRun = isTrue('DRY_RUN');
const scheduledRun = isTrue('SCHEDULED_RUN');
const enforceTiming = scheduledRun || isTrue('WATCHDOG_RECOVERY');

if (enforceTiming && !dryRun && !shouldPublishAtHour(new Date().toISOString())) {
  await mkdir(resolve('artifacts'), { recursive: true });
  await writeFile(
    resolve('artifacts/publish-status.json'),
    JSON.stringify({ published: false, reason: 'timing-slot', date }, null, 2)
  );
  console.log(`Timing experiment slot: ${date} is scheduled for a different publishing hour. Skipping.`);
  process.exit(0);
}

if (hasPostedOnDate(history, date) && !isTrue('FORCE_POST') && !dryRun) {
  console.log(`Already posted for ${date}. Nothing to do.`);
  process.exit(0);
}

const post = getDailyPost(date, history.posts, analytics);
console.log(`Selected ${post.category} content: ${post.contentId}`);

const imageStyle = post.experiment?.contentTraits?.visualVariant || 'mint';
const image = await renderPostImage({ imageText: post.imageText, variant: imageStyle });
console.log(`Generated ${Math.round(image.length / 1024)} KB PNG.`);
const previewDir = resolve('artifacts');
await mkdir(previewDir, { recursive: true });
const previewPath = resolve(previewDir, `a-little-better-${post.date}-${post.contentId}.png`);
await writeFile(previewPath, image);
console.log(`Saved preview image: ${previewPath}`);

if (dryRun) {
  console.log('DRY_RUN=true, so Facebook publishing is skipped.');
  console.log(JSON.stringify({ date: post.date, contentId: post.contentId, category: post.category }, null, 2));
  process.exit(0);
}

const result = await publishPhoto({
  pageId: requiredEnv('FB_PAGE_ID'),
  pageAccessToken: requiredEnv('FB_PAGE_ACCESS_TOKEN'),
  message: post.caption,
  image,
  graphVersion: process.env.META_GRAPH_VERSION || 'v26.0'
});

const updatedHistory = addPost(history, {
  date: post.date,
  contentId: post.contentId,
  category: post.category,
  experiment: post.experiment,
  facebookPostId: result.postId,
  publishedAt: new Date().toISOString()
});
await saveHistory(historyPath, updatedHistory);
await mkdir(resolve('artifacts'), { recursive: true });
await writeFile(
  resolve('artifacts/publish-status.json'),
  JSON.stringify({ published: true, date: post.date, contentId: post.contentId, facebookPostId: result.postId }, null, 2)
);

console.log(`Published successfully. Facebook post/photo id: ${result.postId}`);
