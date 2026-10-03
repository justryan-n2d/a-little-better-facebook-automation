const DAY_MS = 24 * 60 * 60 * 1000;

export function getContentBankStatus(contentBank, history = []) {
  const posts = Array.isArray(contentBank) ? contentBank : [];
  const usedIds = new Set(
    (Array.isArray(history) ? history : [])
      .map(entry => entry?.contentId)
      .filter(Boolean)
  );

  const uniqueIds = [...new Set(posts.map(post => post?.id).filter(Boolean))];
  const remainingIds = uniqueIds.filter(id => !usedIds.has(id));

  return {
    total: uniqueIds.length,
    used: uniqueIds.length - remainingIds.length,
    remaining: remainingIds.length
  };
}

export function parseExpirationTime(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    const milliseconds = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
    return Number.isFinite(new Date(milliseconds).getTime()) ? milliseconds : null;
  }

  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getExpirationWarning({
  now,
  expiresAt,
  thresholds = [7, 5, 2, 1, 0]
}) {
  const nowMs = new Date(now).getTime();
  const expiryMs = parseExpirationTime(expiresAt);

  if (!Number.isFinite(nowMs) || expiryMs === null) return null;

  const daysLeft = Math.ceil((expiryMs - nowMs) / DAY_MS);
  const normalized = [...new Set(thresholds)]
    .filter(value => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);

  const threshold = normalized.find(value => daysLeft <= value);
  if (threshold === undefined) return null;

  return {
    daysLeft,
    threshold,
    expiresAt: new Date(expiryMs).toISOString(),
    expired: expiryMs <= nowMs
  };
}

export function getThresholdWarning(value, thresholds) {
  const normalized = [...new Set(thresholds)]
    .filter(item => Number.isFinite(item) && item >= 0)
    .sort((a, b) => a - b);

  if (!normalized.includes(value)) return null;
  return { value };
}
