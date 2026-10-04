import { corroborateSocialStory, scoutStories } from './story-scout.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { publishPhoto, publishPhotoStory } from './facebook.js';
import {
  buildNewsCaption,
  buildDisplayHeadline,
  buildNewsHook,
  buildNewsAngle,
  buildPhotoCredit,
  downloadImage,
  buildImageQueries,
  findRightsSafeStoryImage,
  findSourceArticleImage,
  selectFreshStory
} from './news.js';
import { renderNewsImage } from './news-image.js';
import { fetchArticleSummary } from './article-summary.js';

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
  execFileImpl,
  historyPath = 'data/news-history.json'
} = {}) {
  const date = today || new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila'
  }).format(new Date());

  const history = await loadJson(historyPath, { version: 1, stories: [] });
  if (autoPublish && alreadyPublishedToday(history, date)) {
    return { skipped: true, reason: 'already-published-today', date };
  }

  const configuredScoutQueries = Number(process.env.STORY_SCOUT_MAX_QUERIES);
  const discovery = await scoutStories({
    fetchImpl,
    execFileImpl,
    maxQueries: Number.isInteger(configuredScoutQueries) && configuredScoutQueries > 0
      ? configuredScoutQueries
      : undefined
  });
  const story = selectFreshStory(discovery.articles, usedStoryValues(history));
  if (!story) {
    throw new Error('No safe fresh news story was found.');
  }

  let publishingStory = story;
  let corroboration = null;
  let imageMeta;

  if (story.sourceType === 'public-social') {
    corroboration = await corroborateSocialStory(story, {
      execFileImpl
    });

    publishingStory = {
      ...story,
      url: corroboration.corroboratingSource.url,
      domain: corroboration.corroboratingSource.domain,
      publishedDate: corroboration.corroboratingSource.publishedDate,
      snippet: corroboration.corroboratingSource.snippet || story.snippet,
      corroboration
    };

    imageMeta = await findRightsSafeStoryImage(publishingStory, { fetchImpl });
  } else {
    imageMeta = await findSourceArticleImage(story, { fetchImpl });
  }

  const imageBuffer = await downloadImage(imageMeta.urlCandidates || imageMeta.url, { fetchImpl });
  const storyContext = [story.title, story.snippet].filter(Boolean).join(' ');
  const hook = buildNewsHook(storyContext);
  const angle = buildNewsAngle(storyContext);
  const photoCredit = buildPhotoCredit(imageMeta);
  const displayHeadline = buildDisplayHeadline(story.title);
  const sourceDomain = publishingStory.domain || story.domain || 'news source';
  const articleSummary = await fetchArticleSummary({
    story: publishingStory,
    fetchImpl
  });

  const caption = buildNewsCaption({
    title: story.title,
    sourceDomain,
    sourceUrl: articleSummary.url,
    hook,
    angle,
    summary: articleSummary.summary,
    photoCredit,
    sourceArticleText: articleSummary.sourceText,
    story: {
      ...publishingStory,
      trendScore: story.trendScore ?? null,
      sourceCount: story.sourceCount ?? 1
    }
  });

  await mkdir('artifacts', { recursive: true });
  const imagePath = resolve('artifacts', `fresh-news-${date}.png`);
  const storyImagePath = resolve('artifacts', `fresh-news-${date}-story.png`);
  const metadataPath = resolve('artifacts', `fresh-news-${date}.json`);

  await renderNewsImage({
    imageBuffer,
    hook,
    title: displayHeadline,
    sourceDomain,
    angle,
    photoCredit,
    outputPath: imagePath,
    template: '4:5'
  });

  await renderNewsImage({
    imageBuffer,
    hook,
    title: displayHeadline,
    sourceDomain,
    angle,
    photoCredit,
    outputPath: storyImagePath,
    template: '9:16'
  });

  const record = {
    date,
    title: story.title,
    url: publishingStory.url,
    sourceDomain,
    provider: discovery.provider,
    topic: story.topic,
    discoveryLead: story.sourceType === 'public-social'
      ? {
          url: story.url,
          platform: story.socialPlatform || null,
          title: story.title
        }
      : null,
    corroboration,
    displayHeadline,
    sourceCount: story.sourceCount,
    discoveryScore: story.score,
    scoutScore: story.scoutScore ?? null,
    published: false,
    storyPublished: false,
    facebookStoryId: null,
    facebookStoryPhotoId: null,
    storyPublishError: null,
    image: {
      provider: imageMeta.provider,
      title: imageMeta.title,
      creator: imageMeta.creator,
      license: imageMeta.license,
      licenseVersion: imageMeta.licenseVersion,
      licenseUrl: imageMeta.licenseUrl,
      landingUrl: imageMeta.landingUrl,
      rightsSafe: imageMeta.rightsSafe ?? false,
      visualRelation: imageMeta.visualRelation || 'source-event',
      rightsBasis: imageMeta.rightsBasis || null,
      semanticRelevanceScore: imageMeta.semanticRelevanceScore ?? null,
      semanticMatches: imageMeta.semanticMatches || [],
      semanticRelationshipMatch: imageMeta.semanticRelationshipMatch ?? null
    },
    hook,
    angle,
    summary: articleSummary.summary,
    storyPublishedAt: null,
    generatedAt: new Date().toISOString()
  };

  let publishedPostId = null;
  let storyPostId = null;
  if (autoPublish) {
    publishedPostId = (await publishPhoto({
      pageId: requiredEnv('FB_PAGE_ID'),
      pageAccessToken: requiredEnv('FB_PAGE_ACCESS_TOKEN'),
      message: `${caption}\n\n${publishingStory.url}`,
      image: await readFile(imagePath),
      graphVersion: process.env.META_GRAPH_VERSION || 'v26.0'
    })).postId;

    record.published = true;
    record.facebookPostId = publishedPostId;
    record.publishedAt = new Date().toISOString();
    await saveNewsHistory(historyPath, {
      version: 1,
      stories: [
        ...(Array.isArray(history.stories) ? history.stories : []),
        record
      ]
    });

    try {
      const storyResult = await publishPhotoStory({
        pageId: requiredEnv('FB_PAGE_ID'),
        pageAccessToken: requiredEnv('FB_PAGE_ACCESS_TOKEN'),
        image: await readFile(storyImagePath),
        graphVersion: process.env.META_GRAPH_VERSION || 'v26.0'
      });
      storyPostId = storyResult.storyPostId;
      record.storyPublished = true;
      record.facebookStoryId = storyResult.storyPostId;
      record.facebookStoryPhotoId = storyResult.photoId;
      record.storyPublishedAt = new Date().toISOString();
    } catch (error) {
      record.storyPublishError = error instanceof Error ? error.message : String(error);
      await saveNewsHistory(historyPath, {
        version: 1,
        stories: [
          ...(Array.isArray(history.stories) ? history.stories : []),
          record
        ]
      });
      await writeFile(
        resolve('artifacts', 'fresh-news-status.json'),
        `${JSON.stringify({
          published: true,
          storyPublished: false,
          date,
          facebookPostId: publishedPostId,
          facebookStoryId: null,
          error: record.storyPublishError
        }, null, 2)}\n`,
        'utf8'
      );
      throw error;
    }
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
    `${JSON.stringify({
      published: record.published,
      storyPublished: record.storyPublished,
      date,
      facebookPostId: publishedPostId,
      facebookStoryId: storyPostId
    }, null, 2)}\n`,
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
    summary: articleSummary.summary,
    facebookPostId: publishedPostId,
    facebookStoryId: storyPostId,
    storyPublished: record.storyPublished
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
