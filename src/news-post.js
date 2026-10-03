import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { publishPhoto } from './facebook.js';
import {
  buildNewsCaption,
  buildNewsHook,
  buildPhotoCredit,
  downloadImage,
  extractImageQuery,
  findOpenverseImage,
  searchGdelt,
  selectFreshStory
} from './news.js';
import { renderNewsImage } from './news-image.js';

function isTrue(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase());
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function loadJson(path, fallback) {
  return readFile(path, 'utf8')
    .then(text => JSON.parse(text))
    .catch(() => fallback);
}

async function saveNewsHistory(path, history) {
  await mkdir(resolve(path, '..'), { recursive: true });
  const normalized = {
    version: 1,
    stories: Array.isArray(history.stories) ? history.stories.slice(-180) : []
  };
  await writeFile(path, `${JSON.stringify(normalized, null, 2)}\\n`, 'utf8');
}

function alreadyPublishedToday(history, date) {
  return history.stories.some(item => item.date === date && item.published);
}

function usedStoryValues(history) {
  return {
    usedUrls: history.stories.slice(-60).map(item => item.url).filter(Boolean),
    usedTitles: history.stories.slice(-60).map(item => item.title).filter(Boolean)
  };
}

function daysOld(dateString, today) {
  const a = new Date(`${dateString}T00:00:00+08:00`).getTime();
  const b = new Date(${today}T00:00:00+08:00).getTime();
  return Math.floor((b - a) / 86400000);
}

export async function runNewsPost({
  today,
  autoPublish,
  fetchImpl = fetch,
  historyPath = 'data/news-history.json'
} = {}) {
  const date = today || new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila'
  }).format(new Date());

  const history = await loadJson(historyPath, { version: 1, stories: [] });
  if (autoPublish && alreadyPublishedToday(history, date)) {
    return { skipped: true, reason: 'already-published-today', date };
  }

  const articles = await searchGdelt({ fetchImpl });
  const story = selectFreshStory(articles, usedStoryValues(history));
  if (!story) {
    throw new Error('No safe fresh news story was found.');
  }

  const imageQuery = extractImageQuery(story.title);
  const imageMeta = await findOpenverseImage(imageQuery || 'people community inspiration', { fetchImpl });
  if (!imageMeta) {
    throw new Error(`No eligible Openverse image found for query: ${imageQuery}`);
  }

  const imageBuffer = await downloadImage(imageMeta.url, { fetchImpl });
  const hook = buildNewsHook(story.title);
  const photoCredit = buildPhotoCredit(imageMeta);
  const sourceDomain = story.domain || 'news source';

  await mkdir('artifacts', { recursive: true });
  const imagePath = resolve('artifacts', `fresh-news-${date}.png`);
  const metadataPath = resolve('artifacts', `fresh-news-${date}.json`);

  await renderNewsImage({
    imageBuffer,
    hook,
    title: story.title,
    sourceDomain,
    photoCredit,
    outputPath: imagePath
  });

  const record = {
    date,
    title: story.title,
    url: story.url,
    sourceDomain,
    sourceCount: story.sourceCount,
    discoveryScore: story.score,
    published: false,
    image: {
      provider: imageMeta.provider,
      title: imageMeta.title,
      creator: imageMeta.creator,
      license: imageMeta.license,
      licenseVersion: imageMeta.licenseVersion,
      licenseUrl: imageMeta.licenseUrl,
      landingUrl: imageMeta.landingUrl
    },
    hook,
    generatedAt: new Date().toISOString()
  };

  const caption = buildNewsCaption({
    title: story.title,
    sourceDomain,
    sourceUrl: story.url,
    hook,
    photoCredit
  });

  let publishedPostId = null;
  if (autoPublish) {
    publishedPostId = (await publishPhoto({
      pageId: requiredEnv('FB_PAGE_ID'),
      pageAccessToken: requiredEnv('FB_PAGE_ACCESS_TOKEN'),
      message: `${caption}\\n\\n${story.url}`,
      image: await readFile(imagePath),
      graphVersion: process.env.META_GRAPH_VERSION || 'v26.0'
    })).postId;

    record.published = true;
    record.facebookPostId = publishedPostId;
    record.publishedAt = new Date().toISOString();
  }

  const nextHistory = {
    version: 1,
    stories: [
      ...(Array.isArray(history.stories) ? history.stories : []),
      record
    ]
  };
  await saveNewsHistory(historyPath, nextHistory);

  await writeFile(metadataPath, `${JSON.stringify({ ...record, caption, sourceUrl: story.url }, null, 2)}\\n`, 'utf8');
  await writeFile(
    resolve('artifacts', 'fresh-news-status.json'),
    `${JSON.stringify({ published: record.published, date, facebookPostId: publishedPostId }, null, 2)}\\n`,
    'utf8'
  );

  return {
    skipped: false,
    date,
    published: record.published,
    title: story.title,
    sourceDomain,
    imageProvider: imageMeta.provider,
    imageLicense: imageMeta.license,
    imageCredit: photoCredit,
    score: story.score,
    sourceCount: story.sourceCount,
    facebookPostId: publishedPostId
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runNewsPost({
    autoPublish: isTrue(process.env.NEWS_AUTO_PUBLISH),
    historyPath: resolve(process.env.NEWS_HISTORY_PATH || 'data/news-history.json')
  })
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => {
      console.error(error instanceof Error ? error.stack || error.message : String(error));
      process.exit(1);
    });
}
