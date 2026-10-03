const DEFAULT_GRAPH_VERSION = 'v26.0';

export function normalizeMetaError(payload) {
  if (payload?.error) {
    const { message, type, code, error_subcode: subcode } = payload.error;
    return `Meta API error${type ? ` (${type})` : ''}${code !== undefined ? ` [${code}${subcode !== undefined ? `/${subcode}` : ''}]` : ''}: ${message || 'Unknown error'}`;
  }
  return 'Meta API error: unknown response';
}

export async function publishPhoto({
  pageId,
  pageAccessToken,
  message,
  image,
  graphVersion = DEFAULT_GRAPH_VERSION,
  fetchImpl = fetch
}) {
  if (!pageId) throw new Error('FB_PAGE_ID is required.');
  if (!pageAccessToken) throw new Error('FB_PAGE_ACCESS_TOKEN is required.');
  if (!Buffer.isBuffer(image)) throw new Error('image must be a Buffer.');

  const url = `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(pageId)}/photos`;
  const form = new FormData();
  form.append('caption', message);
  form.append('published', 'true');
  form.append('access_token', pageAccessToken);
  form.append('source', new Blob([image], { type: 'image/png' }), 'a-little-better.png');

  const response = await fetchImpl(url, { method: 'POST', body: form });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.error) {
    throw new Error(normalizeMetaError(payload));
  }

  const postId = payload.post_id || payload.id;
  if (!postId) throw new Error('Meta API returned success but no post/photo id.');
  return { postId, photoId: payload.id || null, raw: payload };
}

export async function getPage({
  pageId,
  pageAccessToken,
  graphVersion = DEFAULT_GRAPH_VERSION,
  fetchImpl = fetch
}) {
  if (!pageId) throw new Error('FB_PAGE_ID is required.');
  if (!pageAccessToken) throw new Error('FB_PAGE_ACCESS_TOKEN is required.');
  const url = `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(pageId)}?fields=id,name&access_token=${encodeURIComponent(pageAccessToken)}`;
  const response = await fetchImpl(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) throw new Error(normalizeMetaError(payload));
  return payload;
}
