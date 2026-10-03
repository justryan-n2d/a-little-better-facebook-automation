import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  getFollowerDelta,
  getLatestPostSnapshots,
  summarizeCategoryPerformance
} from './analytics.js';
import { contentBank } from './content.js';

const DAYS_IN_WEEK = 7;

function parseManilaDate(dateString) {
  return new Date(`${dateString}T00:00:00+08:00`);
}

function addDays(dateString, days) {
  const date = parseManilaDate(dateString);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getWeekStart(dateString) {
  const date = parseManilaDate(dateString);
  const day = date.getUTCDay();
  const daysFromMonday = (day + 6) % 7;
  return addDays(dateString, -daysFromMonday);
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Number(value) || 0);
}

function formatMetric(snapshot, key, fallback = 'n/a') {
  const value = snapshot?.[key];
  return Number.isFinite(Number(value)) ? formatNumber(value) : fallback;
}

function buildReelDraft(topPost) {
  if (!topPost) {
    return 'No post has enough analytics yet to generate a Reel draft.';
  }

  const lines = String(topPost.imageText || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const hook = lines[0] || topPost.contentId;

  return [
    '**Hook:**',
    hook,
    '',
    '**On-screen text:**',
    ...lines.map(line => `- ${line}`),
    '',
    '**End card:**',
    'A Little Better',
    'Follow for daily reminders to keep going.'
  ].join('\n');
}

export function buildGrowthReport({
  weekStart,
  weekEnd,
  history = [],
  analytics = {}
}) {
  const weeklyPosts = (Array.isArray(history) ? history : [])
    .filter(post => post?.date >= weekStart && post?.date <= weekEnd);

  const weeklyIds = new Set(weeklyPosts.map(post => post.facebookPostId).filter(Boolean));
  const snapshots = Array.isArray(analytics.snapshots) ? analytics.snapshots : [];
  const latest = getLatestPostSnapshots(
    snapshots.filter(snapshot => weeklyIds.has(snapshot.facebookPostId))
  );

  const enriched = latest.map(snapshot => {
    const historyPost = weeklyPosts.find(post => post.facebookPostId === snapshot.facebookPostId);
    return {
      ...snapshot,
      imageText: contentBank.find(item => item.id === historyPost?.contentId)?.imageText || '',
      caption: contentBank.find(item => item.id === historyPost?.contentId)?.caption || ''
    };
  });

  const topPosts = [...enriched]
    .sort((a, b) =>
      Number(b.engagement || 0) - Number(a.engagement || 0) ||
      Number(b.shares || 0) - Number(a.shares || 0) ||
      Number(b.comments || 0) - Number(a.comments || 0)
    )
    .slice(0, 5);

  const categories = summarizeCategoryPerformance(enriched)
    .sort((a, b) => b.averageEngagement - a.averageEngagement || a.category.localeCompare(b.category));

  const followerSnapshots = (Array.isArray(analytics.followerSnapshots) ? analytics.followerSnapshots : [])
    .filter(snapshot => snapshot?.capturedDate >= weekStart && snapshot?.capturedDate <= weekEnd);

  const followerDelta = getFollowerDelta(followerSnapshots);

  const lines = [
    '# A Little Better Growth Report',
    `**Week:** ${weekStart} to ${weekEnd}`,
    '',
    '## Publishing',
    `Posts published this week: **${weeklyPosts.length}**`,
    `Posts with captured analytics: **${latest.length}/${weeklyPosts.length}**`,
    '',
    '## Top posts by engagement',
    topPosts.length
      ? topPosts.map((post, index) =>
          `${index + 1}. **${post.contentId}** (${post.category}) | engagement ${formatNumber(post.engagement)} | reactions ${formatNumber(post.reactions)} | comments ${formatNumber(post.comments)} | shares ${formatNumber(post.shares)} | reach ${formatMetric(post, 'reach')}`
        ).join('\n')
      : 'No post analytics were captured for this week yet.',
    '',
    '## Category performance',
    categories.length
      ? categories.map(category =>
          `- ${category.category}: ${category.posts} post(s), average engagement ${formatNumber(category.averageEngagement)}, total engagement ${formatNumber(category.totalEngagement)}`
        ).join('\n')
      : 'No category analytics are available yet.',
    '',
    '## Followers',
    followerDelta === null
      ? 'Follower change: **not available yet**. The collector needs at least two follower snapshots.'
      : `Follower change during the available weekly snapshots: **${followerDelta >= 0 ? '+' : ''}${formatNumber(followerDelta)}**`,
    '',
    '## What to test next',
    topPosts.length
      ? [
          `- Make 1-2 new posts that follow the **theme and structure** of ${topPosts[0].contentId}, without copying its wording.`,
          '- Turn the best-performing post into a short Reel using the draft below.',
          '- Keep the normal weekly category rotation so the experiment remains comparable.'
        ].join('\n')
      : [
          '- Keep publishing on schedule until enough analytics are collected.',
          '- Use the first week of data as the baseline.'
        ].join('\n'),
    '',
    '## Reel draft',
    buildReelDraft(topPosts[0]),
    '',
    '## Manual distribution checklist',
    '- Reply to real comments on the strongest post.',
    '- Share the strongest post to relevant communities only where Page sharing is allowed and useful.',
    '- Publish the Reel manually after reviewing the draft and adding suitable audio/visuals.',
    '',
    '_Engagement score used for comparison: reactions + 2×comments + 3×shares. Reach is shown only when the Meta insight is available._'
  ];

  return lines.join('\n');
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY?.trim();
  const githubToken = process.env.GITHUB_TOKEN?.trim();

  if (!repository) throw new Error('GITHUB_REPOSITORY is required.');
  if (!githubToken) throw new Error('GITHUB_TOKEN is required.');

  const now = new Date();
  const manilaDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);

  const weekStart = getWeekStart(manilaDate);
  const weekEnd = addDays(weekStart, DAYS_IN_WEEK - 1);

  const history = JSON.parse(await readFile(resolve('data/posting-history.json'), 'utf8'));
  const analytics = JSON.parse(await readFile(resolve('data/growth-analytics.json'), 'utf8'));

  const report = buildGrowthReport({
    weekStart,
    weekEnd,
    history: history.posts,
    analytics
  });

  await mkdir(resolve('artifacts'), { recursive: true });
  await writeFile(
    resolve(`artifacts/growth-report-${weekEnd}.md`),
    `${report}\n`,
    'utf8'
  );

  const apiBase = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
  const title = `[Growth Report] A Little Better - Week of ${weekStart}`;
  const query = encodeURIComponent(`repo:${repository} is:issue is:open in:title [Growth Report] A Little Better - Week of ${weekStart}`);

  const searchResponse = await fetch(`${apiBase}/search/issues?q=${query}&per_page=1`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${githubToken}`,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });

  if (!searchResponse.ok) {
    throw new Error(`GitHub issue search failed with HTTP ${searchResponse.status}`);
  }

  const searchPayload = await searchResponse.json();

  if (Number(searchPayload.total_count || 0) > 0) {
    console.log(`Weekly growth report already exists for ${weekStart}.`);
    return;
  }

  const createResponse = await fetch(`${apiBase}/repos/${repository}/issues`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${githubToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ title, body: report })
  });

  if (!createResponse.ok) {
    throw new Error(`GitHub issue creation failed with HTTP ${createResponse.status}`);
  }

  const issue = await createResponse.json();
  console.log(`Created weekly growth report: ${issue.html_url}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}
