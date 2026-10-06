import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { getPhilippineDate } from './content.js';
import { engagementScore, getPhilippineHour, normalizeAnalyticsStore } from './analytics.js';
import { loadHistory } from './history.js';

const DEFAULT_GRAPH_VERSION = 'v26.0';
const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_INSIGHT_METRICS = ['post_media_view'];

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function splitMetrics(value) {
  return String(value ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function numericOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function summaryCount(value) {
  if (Number.isFinite(Number(value))) return numericOrZero(value);
  return numericOrZero(value?.summary?.total_count ?? value?.count);
}

function daysBetween(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00+08:00`).getTime();
  const end = new Date(`${endDate}T00:00:00+08:00`).getTime();
  return Math.floor((end - start) / 86400000);
}

function metricAlias(name) {
  const aliases = {
    post_impressions_unique: 'reach',
    post_impressions: 'impressions',
    post_engaged_users: 'engagedUsers',
    post_media_view: 'mediaViews'
  };
  return aliases[name] || name;
}

async function metaGet({ graphVersion, path, params, fetchImpl = fetch }) {
  const url = new URL(`https://graph.facebook.com/${graphVersion}/${path.replace(/^\//, '')}`);
  for (const [key, value] of Object.entries(params || {})) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetchImpl(url);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.error) {
    const message = payload?.error?.message || `Meta request failed with HTTP ${response.status}`;
    const error = new Error(message);
    error.meta = payload?.error || null;
    throw error;
  }

  return payload;
}

export function parsePostMetrics(payload, {
  contentId,
  category,
  postDate,
  publishedAt = null,
  experiment = null
}) {
  const reactions = summaryCount(payload?.reactions);
  const comments = summaryCount(payload?.comments);
  const shares = summaryCount(payload?.shares);

  const result = {
    facebookPostId: payload?.id,
    contentId,
    category,
    postDate,
    permalinkUrl: payload?.permalink_url || null,
    reactions,
    comments,
    shares,
    engagement: engagementScore({ reactions, comments, shares })
  };

  const publishHour = getPhilippineHour(publishedAt);
  if (publishHour !== null) result.publishHour = publishHour;
  if (experiment) result.experiment = experiment;

  return result;
}

export function addDerivedPerformanceMetrics(snapshot = {}) {
  const reach = Number(snapshot?.reach);
  const engagement = Number(snapshot?.engagement);
  const reactions = Number(snapshot?.reactions);
  const comments = Number(snapshot?.comments);
  const shares = Number(snapshot?.shares);
  const engagedUsers = Number(snapshot?.engagedUsers);

  if (!Number.isFinite(reach) || reach <= 0) return { ...snapshot };

  return {
    ...snapshot,
    engagementRate: Number.isFinite(engagement) ? engagement / reach : null,
    reactionRate: Number.isFinite(reactions) ? reactions / reach : null,
    commentRate: Number.isFinite(comments) ? comments / reach : null,
    shareRate: Number.isFinite(shares) ? shares / reach : null,
    engagedUserRate: Number.isFinite(engagedUsers) ? engagedUsers / reach : null
  };
}

export function parsePageFollowerCount(payload) {
  const count = Number(payload?.followers_count);
  return Number.isFinite(count) && count >= 0 ? count : null;
}

export function parseInsightValues(payload) {
  const values = {};

  for (const metric of Array.isArray(payload?.data) ? payload.data : []) {
    const name = metric?.name;
    if (!name) continue;

    const points = Array.isArray(metric?.values) ? metric.values : [];
    const last = points.at(-1);
    const rawValue = last?.value ?? metric?.value;
    const numeric = Number(rawValue);

    if (Number.isFinite(numeric)) {
      values[metricAlias(name)] = numeric;
    }
  }

  return values;
}

export function upsertDailySnapshot(store, snapshot) {
  const normalized = normalizeAnalyticsStore(store);
  const key = `${snapshot.facebookPostId}|${snapshot.capturedDate}`;
  const snapshots = normalized.snapshots.filter(item =>
    `${item.facebookPostId}|${item.capturedDate}` !== key
  );

  snapshots.push(snapshot);

  return {
    ...normalized,
    snapshots
  };
}

function upsertFollowerSnapshot(store, snapshot) {
  const normalized = normalizeAnalyticsStore(store);
  const snapshots = normalized.followerSnapshots.filter(item =>
    item.capturedDate !== snapshot.capturedDate
  );

  snapshots.push(snapshot);

  return {
    ...normalized,
    followerSnapshots: snapshots
  };
}

async function loadAnalyticsStore(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return normalizeAnalyticsStore(JSON.parse(await readFile(filePath, 'utf8')));
  } catch {
    return normalizeAnalyticsStore({});
  }
}

async function saveAnalyticsStore(filePath, store) {
  await mkdir(resolve(filePath, '..'), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(normalizeAnalyticsStore(store), null, 2)}\n`, 'utf8');
}

export async function collectGrowthAnalytics({
  pageId,
  pageAccessToken,
  graphVersion = DEFAULT_GRAPH_VERSION,
  historyPath = 'data/posting-history.json',
  analyticsPath = 'data/growth-analytics.json',
  capturedAt = new Date().toISOString(),
  lookbackDays = DEFAULT_LOOKBACK_DAYS,
  insightMetrics = DEFAULT_INSIGHT_METRICS,
  fetchImpl = fetch
}) {
  const history = await loadHistory(historyPath);
  const capturedDate = getPhilippineDate(new Date(capturedAt));
  const analyticsFile = resolve(analyticsPath);
  let store = await loadAnalyticsStore(analyticsFile);

  const posts = history.posts.filter(post => {
    if (!post?.facebookPostId || !post?.date) return false;
    const age = daysBetween(post.date, capturedDate);
    return age >= 0 && age <= lookbackDays;
  });

  let succeeded = 0;
  const errors = [];

  for (const post of posts) {
    try {
      const payload = await metaGet({
        graphVersion,
        path: post.facebookPostId,
        params: {
          fields: 'id,created_time,permalink_url,shares',
          access_token: pageAccessToken
        },
        fetchImpl
      });

      const edgeCounts = {};
      const edgeErrors = [];
      for (const [edgeName, fieldName] of [
        ['reactions', 'reactions'],
        ['comments', 'comments']
      ]) {
        try {
          const edgePayload = await metaGet({
            graphVersion,
            path: `${post.facebookPostId}/${edgeName}`,
            params: {
              limit: 0,
              summary: true,
              access_token: pageAccessToken
            },
            fetchImpl
          });
          edgeCounts[fieldName] = summaryCount(edgePayload?.summary);
        } catch (error) {
          edgeErrors.push({
            metric: edgeName,
            message: error instanceof Error ? error.message : String(error)
          });
          edgeCounts[fieldName] = 0;
        }
      }

      const snapshot = parsePostMetrics({
        ...payload,
        reactions: edgeCounts.reactions,
        comments: edgeCounts.comments
      }, {
        contentId: post.contentId,
        category: post.category,
        postDate: post.date,
        publishedAt: post.publishedAt || null,
        experiment: post.experiment || null
      });

      if (edgeErrors.length) snapshot.metricErrors = edgeErrors;

      const insights = {};
      for (const metric of insightMetrics) {
        try {
          const insightPayload = await metaGet({
            graphVersion,
            path: `${post.facebookPostId}/insights`,
            params: { metric, access_token: pageAccessToken },
            fetchImpl
          });
          Object.assign(insights, parseInsightValues(insightPayload));
        } catch (error) {
          insights.insightErrors = [
            ...(insights.insightErrors || []),
            { metric, message: error instanceof Error ? error.message : String(error) }
          ];
        }
      }

      store = upsertDailySnapshot(store, addDerivedPerformanceMetrics({
        ...snapshot,
        ...insights,
        capturedDate,
        capturedAt
      }));
      succeeded += 1;
    } catch (error) {
      errors.push({
        facebookPostId: post.facebookPostId,
        contentId: post.contentId,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  try {
    const pagePayload = await metaGet({
      graphVersion,
      path: pageId,
      params: {
        fields: 'id,name,followers_count',
        access_token: pageAccessToken
      },
      fetchImpl
    });

    const followersCount = parsePageFollowerCount(pagePayload);
    if (followersCount !== null) {
      store = upsertFollowerSnapshot(store, {
        capturedDate,
        capturedAt,
        followersCount
      });
    }
  } catch (error) {
    errors.push({
      scope: 'page',
      message: error instanceof Error ? error.message : String(error)
    });
  }

  const run = {
    capturedDate,
    capturedAt,
    attemptedPosts: posts.length,
    successfulPosts: succeeded,
    errorCount: errors.length,
    errors
  };

  store = {
    ...normalizeAnalyticsStore(store),
    collectorRuns: [
      ...(Array.isArray(store.collectorRuns) ? store.collectorRuns : []),
      run
    ].slice(-180)
  };

  if (posts.length > 0 && succeeded === 0) {
    throw new Error(`Growth analytics collected 0/${posts.length} posts. First error: ${errors[0]?.message || 'unknown error'}`);
  }

  await saveAnalyticsStore(analyticsFile, store);

  return {
    capturedDate,
    attemptedPosts: posts.length,
    successfulPosts: succeeded,
    errors,
    analyticsPath: analyticsFile
  };
}

async function main() {
  const result = await collectGrowthAnalytics({
    pageId: requiredEnv('FB_PAGE_ID'),
    pageAccessToken: requiredEnv('FB_PAGE_ACCESS_TOKEN'),
    graphVersion: process.env.META_GRAPH_VERSION || DEFAULT_GRAPH_VERSION,
    historyPath: resolve(process.env.HISTORY_PATH || 'data/posting-history.json'),
    analyticsPath: resolve(process.env.ANALYTICS_PATH || 'data/growth-analytics.json'),
    lookbackDays: Number(process.env.FB_ANALYTICS_LOOKBACK_DAYS || DEFAULT_LOOKBACK_DAYS),
    insightMetrics: splitMetrics(process.env.FB_POST_INSIGHT_METRICS) || DEFAULT_INSIGHT_METRICS
  });

  console.log(`Growth analytics ${result.capturedDate}: ${result.successfulPosts}/${result.attemptedPosts} posts collected.`);
  if (result.errors.length) {
    console.log(JSON.stringify({ collectionErrors: result.errors }, null, 2));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}
