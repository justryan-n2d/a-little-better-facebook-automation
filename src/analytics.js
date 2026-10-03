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

  return {
    version: 1,
    snapshots: snapshots.slice(-DEFAULT_SNAPSHOTS_LIMIT),
    followerSnapshots: followerSnapshots.slice(-1000)
  };
}
