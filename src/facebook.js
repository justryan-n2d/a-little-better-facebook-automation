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

export async function publishPhotoStory({
  pageId,
  pageAccessToken,
  image,
  graphVersion = DEFAULT_GRAPH_VERSION,
  fetchImpl = fetch
}) {
  if (!pageId) throw new Error('FB_PAGE_ID is required.');
  if (!pageAccessToken) throw new Error('FB_PAGE_ACCESS_TOKEN is required.');
  if (!Buffer.isBuffer(image)) throw new Error('image must be a Buffer.');

  const photoUrl = `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(pageId)}/photos`;
  const photoForm = new FormData();
  photoForm.append('published', 'false');
  photoForm.append('access_token', pageAccessToken);
  photoForm.append('source', new Blob([image], { type: 'image/png' }), 'a-little-better-story.png');

  const uploadResponse = await fetchImpl(photoUrl, { method: 'POST', body: photoForm });
  const uploadPayload = await uploadResponse.json().catch(() => ({}));
  if (!uploadResponse.ok || uploadPayload.error) {
    throw new Error(normalizeMetaError(uploadPayload));
  }

  const photoId = uploadPayload.id;
  if (!photoId) throw new Error('Meta API returned success but no Story photo id.');

  const storyUrl = `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(pageId)}/photo_stories`;
  const storyForm = new URLSearchParams();
  storyForm.set('photo_id', photoId);
  storyForm.set('access_token', pageAccessToken);

  const storyResponse = await fetchImpl(storyUrl, {
    method: 'POST',
    body: storyForm
  });
  const storyPayload = await storyResponse.json().catch(() => ({}));
  if (!storyResponse.ok || storyPayload.error) {
    throw new Error(normalizeMetaError(storyPayload));
  }

  const storyPostId = storyPayload.post_id || storyPayload.id;
  if (!storyPayload.success && !storyPostId) {
    throw new Error('Meta API returned no successful Facebook Story publication result.');
  }

  return {
    storyPostId: storyPostId || null,
    photoId,
    raw: storyPayload
  };
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
