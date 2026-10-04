import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { publishPhoto } from './facebook.js';
import {
  buildNewsCaption,
  buildDisplayHeadline,
  buildNewsHook,
  buildNewsAngle,
  buildPhotoCredit,
  downloadImage,
  buildImageQueries,
  findSourceArticleImage,
  searchFreshNews,
  selectFreshStory
} from './news.js';
import { renderNewsImage } from './news-image.js';
import { verifyRenderedNewsGraphic } from './visual-verify.js';

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
  await writeFile(path, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
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

  const discovery = await searchFreshNews({ fetchImpl });
  const storyHistory = usedStoryValues(history);
  const attemptedUrls = new Set(storyHistory.usedUrls);
  let story = null;
  let imageMeta = null;
  let lastImageError = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = selectFreshStory(discovery.articles, {
      ...storyHistory,
      usedUrls: [...attemptedUrls]
    });

    if (!candidate) break;
    attemptedUrls.add(candidate.url);

    try {
      const candidateImage = await findSourceArticleImage(candidate, {
        fetchImpl
      });
      story = candidate;
      imageMeta = candidateImage;
      break;
    } catch (error) {
      lastImageError = error;
      console.log(
        'Fresh News skipped story after source-image verification failed for ' +
        candidate.url + ': ' +
        (error instanceof Error ? error.message : String(error))
      );
    }
  }

  if (!story || !imageMeta) {
    throw new Error(
      'No safe fresh news story with a verifiable source image was found.' +
      (lastImageError instanceof Error ? ' Last error: ' + lastImageError.message : '')
    );
  }

  const imageBuffer = await downloadImage(imageMeta.urlCandidates || imageMeta.url, { fetchImpl });
  const hook = buildNewsHook(story.title);
  const angle = buildNewsAngle(story.title);
  const photoCredit = buildPhotoCredit(imageMeta);
  const displayHeadline = buildDisplayHeadline(story.title);
  const sourceDomain = story.domain || 'news source';

  await mkdir('artifacts', { recursive: true });
  const imagePath = resolve('artifacts', `fresh-news-${date}.png`);
  const metadataPath = resolve('artifacts', `fresh-news-${date}.json`);

  const renderedImage = await renderNewsImage({
    imageBuffer,
    hook,
    title: displayHeadline,
    sourceDomain,
    angle,
    photoCredit,
    outputPath: imagePath
  });

  const graphicVerification = await verifyRenderedNewsGraphic({
    imageBuffer: renderedImage,
    storyTitle: story.title,
    sourceDomain,
    displayHeadline
  });

  if (graphicVerification.verified === false) {
    throw new Error(
      'Final Fresh News visual QA rejected the rendered graphic: ' +
      graphicVerification.reason
    );
  }

  const record = {
    date,
    title: story.title,
    url: story.url,
    sourceDomain,
    provider: discovery.provider,
    topic: story.topic,
    displayHeadline,
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
    visualVerification: {
      source: imageMeta.visualVerification || null,
      graphic: graphicVerification
    },
    hook,
    angle,
    generatedAt: new Date().toISOString()
  };

  const caption = buildNewsCaption({
    title: story.title,
    sourceDomain,
    sourceUrl: story.url,
    hook,
    angle,
    photoCredit
  });

  let publishedPostId = null;
  if (autoPublish) {
    publishedPostId = (await publishPhoto({
      pageId: requiredEnv('FB_PAGE_ID'),
      pageAccessToken: requiredEnv('FB_PAGE_ACCESS_TOKEN'),
      message: `${caption}\n\n${story.url}`,
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

  await writeFile(metadataPath, `${JSON.stringify({ ...record, caption, sourceUrl: story.url }, null, 2)}\n`, 'utf8');
  await writeFile(
    resolve('artifacts', 'fresh-news-status.json'),
    `${JSON.stringify({ published: record.published, date, facebookPostId: publishedPostId }, null, 2)}\n`,
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
    facebookPostId: publishedPostId,
    visualVerification: record.visualVerification
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
