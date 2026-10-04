import test from 'node:test';
import assert from 'node:assert/strict';
import { publishPhotoStory } from '../src/facebook.js';

test('publishes a fresh unpublished photo as a Facebook Page Story', async () => {
  const calls = [];

  const fakeFetch = async (url, options) => {
    calls.push({ url, options });

    if (calls.length === 1) {
      return new Response(JSON.stringify({ id: 'story-photo-123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true, post_id: 'story-post-456' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  const result = await publishPhotoStory({
    pageId: 'page-123',
    pageAccessToken: 'token',
    graphVersion: 'v26.0',
    image: Buffer.from('story-image'),
    fetchImpl: fakeFetch
  });

  assert.equal(result.storyPostId, 'story-post-456');
  assert.equal(result.photoId, 'story-photo-123');

  assert.equal(
    calls[0].url,
    'https://graph.facebook.com/v26.0/page-123/photos'
  );
  assert.ok(calls[0].options.body instanceof FormData);
  assert.equal(calls[0].options.body.get('published'), 'false');
  assert.equal(calls[0].options.body.get('access_token'), 'token');
  assert.ok(calls[0].options.body.get('source') instanceof Blob);

  assert.equal(
    calls[1].url,
    'https://graph.facebook.com/v26.0/page-123/photo_stories'
  );
  const storyBody = new URLSearchParams(calls[1].options.body);
  assert.equal(storyBody.get('photo_id'), 'story-photo-123');
  assert.equal(storyBody.get('access_token'), 'token');
});

test('regular daily posts include the Page Story publishing path', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile('src/index.js', 'utf8');
  assert.match(source, /publishPhotoStory/);
  assert.match(source, /renderPostStoryImage/);
});
