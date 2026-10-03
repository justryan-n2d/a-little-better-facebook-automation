import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { getDailyPost, getPhilippineDate } from './content.js';
import { renderPostImage } from './image.js';
import { publishPhoto } from './facebook.js';
import { addPost, hasPostedOnDate, loadHistory, saveHistory } from './history.js';

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

if (hasPostedOnDate(history, date) && !isTrue('FORCE_POST')) {
  console.log(`Already posted for ${date}. Nothing to do.`);
  process.exit(0);
}

const post = getDailyPost(date, history.posts);
console.log(`Selected ${post.category} content: ${post.contentId}`);

const imageStyle = post.category === 'bible' ? 'alternate' : 'mint';
const image = await renderPostImage({ imageText: post.imageText, variant: imageStyle });
console.log(`Generated ${Math.round(image.length / 1024)} KB PNG.`);
const previewDir = resolve('artifacts');
await mkdir(previewDir, { recursive: true });
const previewPath = resolve(previewDir, `a-little-better-${post.date}-${post.contentId}.png`);
await writeFile(previewPath, image);
console.log(`Saved preview image: ${previewPath}`);

if (isTrue('DRY_RUN')) {
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
  facebookPostId: result.postId,
  publishedAt: new Date().toISOString()
});
await saveHistory(historyPath, updatedHistory);

console.log(`Published successfully. Facebook post/photo id: ${result.postId}`);
