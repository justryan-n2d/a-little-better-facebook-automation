const DEFAULT_SNAPSHOTS_LIMIT = 5000;

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export function engagementScore({
  reactions = 0,
  comments = 0,
  shares = 0
} = {}) {
  return asNumber(reactions) + (asNumber(comments) * 2) + (asNumber(shares) * 3);
}

export function getLatestContentPerformance(snapshots = []) {
  const latest = new Map();

  for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
    const contentId = snapshot?.contentId;
    if (!contentId) continue;

    const existing = latest.get(contentId);
    if (!existing) {
      latest.set(contentId, snapshot);
      continue;
    }

    const existingDate = String(existing.capturedDate || existing.capturedAt || '');
    const candidateDate = String(snapshot.capturedDate || snapshot.capturedAt || '');

    if (candidateDate > existingDate) {
      latest.set(contentId, snapshot);
    }
  }

  return latest;
}

export function performanceScore(snapshot = {}) {
  const engagementRate = Number(snapshot?.engagementRate);
  if (Number.isFinite(engagementRate) && engagementRate >= 0) return engagementRate;

  return asNumber(snapshot?.engagement);
}

export function getLatestPostSnapshots(snapshots = []) {
  const latest = new Map();

  for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
    const id = snapshot?.facebookPostId;
    if (!id) continue;

    const existing = latest.get(id);
    if (!existing) {
      latest.set(id, snapshot);
      continue;
    }

    const existingDate = String(existing.capturedDate || existing.capturedAt || '');
    const candidateDate = String(snapshot.capturedDate || snapshot.capturedAt || '');

    if (candidateDate > existingDate) {
      latest.set(id, snapshot);
    }
  }

  return [...latest.values()].sort((a, b) => {
    const aDate = String(a.capturedDate || a.capturedAt || '');
    const bDate = String(b.capturedDate || b.capturedAt || '');
    return aDate.localeCompare(bDate) || String(a.facebookPostId).localeCompare(String(b.facebookPostId));
  });
}

export function summarizeCategoryPerformance(snapshots = []) {
  const groups = new Map();

  for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
    const category = snapshot?.category || 'unknown';
    const engagement = asNumber(snapshot?.engagement ?? engagementScore(snapshot));
    const current = groups.get(category) || {
      category,
      posts: 0,
      totalEngagement: 0
    };

    current.posts += 1;
    current.totalEngagement += engagement;
    groups.set(category, current);
  }

  return [...groups.values()]
    .map(group => ({
      ...group,
      averageEngagement: Number((group.totalEngagement / group.posts).toFixed(2))
    }))
    .sort((a, b) =>
      a.averageEngagement - b.averageEngagement ||
      a.category.localeCompare(b.category)
    );
}

export function summarizeExperimentPerformance(snapshots = [], dimension) {
  const groups = new Map();

  for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
    const value = dimension === 'selectionMode'
      ? snapshot?.experiment?.selectionMode
      : snapshot?.experiment?.contentTraits?.[dimension];

    if (!value) continue;

    const engagement = asNumber(snapshot?.engagement ?? engagementScore(snapshot));
    const rate = Number(snapshot?.engagementRate);
    const current = groups.get(value) || {
      value,
      posts: 0,
      totalEngagement: 0,
      totalEngagementRate: 0,
      ratePosts: 0
    };

    current.posts += 1;
    current.totalEngagement += engagement;

    if (Number.isFinite(rate) && rate >= 0) {
      current.totalEngagementRate += rate;
      current.ratePosts += 1;
    }

    groups.set(value, current);
  }

  return [...groups.values()]
    .map(group => ({
      value: group.value,
      posts: group.posts,
      averageEngagement: Number((group.totalEngagement / group.posts).toFixed(2)),
      averageEngagementRate: group.ratePosts
        ? Number((group.totalEngagementRate / group.ratePosts).toFixed(4))
        : null
    }))
    .sort((a, b) =>
      (b.averageEngagementRate ?? -1) - (a.averageEngagementRate ?? -1) ||
      b.averageEngagement - a.averageEngagement ||
      a.value.localeCompare(b.value)
    );
}

export function getPhilippineHour(input) {
  if (input === null || input === undefined || input === '') return null;

  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return null;

  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    hourCycle: 'h23'
  }).format(date));

  return Number.isFinite(hour) ? hour : null;
}

export function summarizePublishHourPerformance(snapshots = []) {
  const groups = new Map();

  for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
    const hour = Number(snapshot?.publishHour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;

    const engagement = asNumber(snapshot?.engagement ?? engagementScore(snapshot));
    const rate = Number(snapshot?.engagementRate);
    const current = groups.get(hour) || {
      publishHour: hour,
      posts: 0,
      totalEngagement: 0,
      totalEngagementRate: 0,
      ratePosts: 0
    };

    current.posts += 1;
    current.totalEngagement += engagement;

    if (Number.isFinite(rate) && rate >= 0) {
      current.totalEngagementRate += rate;
      current.ratePosts += 1;
    }

    groups.set(hour, current);
  }

  return [...groups.values()]
    .map(group => ({
      publishHour: group.publishHour,
      posts: group.posts,
      averageEngagement: Number((group.totalEngagement / group.posts).toFixed(2)),
      averageEngagementRate: group.ratePosts
        ? Number((group.totalEngagementRate / group.ratePosts).toFixed(4))
        : null
    }))
    .sort((a, b) =>
      (b.averageEngagementRate ?? -1) - (a.averageEngagementRate ?? -1) ||
      b.averageEngagement - a.averageEngagement ||
      a.publishHour - b.publishHour
    );
}

export function getFollowerDelta(snapshots = []) {
  const available = (Array.isArray(snapshots) ? snapshots : [])
    .filter(snapshot => Number.isFinite(Number(snapshot?.followersCount)))
    .sort((a, b) => String(a.capturedAt || '').localeCompare(String(b.capturedAt || '')));

  if (available.length < 2) return null;

  return Number(available.at(-1).followersCount) - Number(available[0].followersCount);
}

export function normalizeAnalyticsStore(data = {}) {
  const snapshots = Array.isArray(data.snapshots) ? data.snapshots : [];
  const followerSnapshots = Array.isArray(data.followerSnapshots) ? data.followerSnapshots : [];
  const collectorRuns = Array.isArray(data.collectorRuns) ? data.collectorRuns : [];

  return {
    version: 1,
    snapshots: snapshots.slice(-DEFAULT_SNAPSHOTS_LIMIT),
    followerSnapshots: followerSnapshots.slice(-1000),
    collectorRuns: collectorRuns.slice(-180)
  };
}
