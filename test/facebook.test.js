import test from 'node:test';
import assert from 'node:assert/strict';
import { publishPhoto, normalizeMetaError } from '../src/facebook.js';

test('publishes a photo to the configured Facebook Page endpoint', async () => {
  let calledUrl = '';
  let calledBody;
  const fakeFetch = async (url, options) => {
    calledUrl = url;
    calledBody = options.body;
    return new Response(JSON.stringify({ id: '123_456', post_id: 'post_789' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  const result = await publishPhoto({
    pageId: 'page-123',
    pageAccessToken: 'token',
    graphVersion: 'v26.0',
    message: 'Hello from A Little Better',
    image: Buffer.from('fake-image'),
    fetchImpl: fakeFetch
  });

  assert.equal(result.postId, 'post_789');
  assert.equal(calledUrl, 'https://graph.facebook.com/v26.0/page-123/photos');
  assert.ok(calledBody instanceof FormData);
  assert.equal(calledBody.get('caption'), 'Hello from A Little Better');
  assert.equal(calledBody.get('published'), 'true');
  assert.equal(calledBody.get('access_token'), 'token');
  assert.ok(calledBody.get('source') instanceof Blob);
});


test('publishes a Reel through the Meta upload and finish flow', async () => {
  const facebook = await import('../src/facebook.js');
  assert.equal(typeof facebook.publishReel, 'function');

  const calls = [];
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url, options });

    if (url.includes('video_reels') && url.includes('upload_phase=start')) {
      return new Response(JSON.stringify({
        video_id: 'video-123',
        upload_url: 'https://rupload.facebook.com/video-upload/v26.0/video-123'
      }), { status: 200 });
    }

    if (url.startsWith('https://rupload.facebook.com/')) {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };

  const result = await facebook.publishReel({
    pageAccessToken: 'token',
    graphVersion: 'v26.0',
    title: 'Keep going.',
    description: 'Follow A Little Better for daily reminders.',
    video: Buffer.from('fake-mp4'),
    fetchImpl: fakeFetch
  });

  assert.equal(result.videoId, 'video-123');
  assert.equal(calls.length, 3);

  const start = calls[0];
  assert.match(start.url, /\/v26\.0\/me\/video_reels/);
  assert.match(start.url, /upload_phase=start/);

  const upload = calls[1];
  assert.equal(upload.options.headers.Authorization, 'OAuth token');
  assert.equal(upload.options.headers.offset, '0');
  assert.equal(upload.options.headers.file_size, '8');
  assert.equal(upload.options.headers['Content-Type'], 'application/octet-stream');

  const finish = calls[2];
  assert.match(finish.url, /upload_phase=finish/);
  assert.match(finish.url, /video_state=PUBLISHED/);
  assert.match(finish.url, /video_id=video-123/);
  assert.match(finish.url, /title=Keep%20going\./);
});

test('rejects a Reel publish when Meta returns an upload error', async () => {
  const facebook = await import('../src/facebook.js');

  await assert.rejects(
    facebook.publishReel({
      pageAccessToken: 'token',
      video: Buffer.from('fake-mp4'),
      fetchImpl: async () => new Response(
        JSON.stringify({ error: { message: 'Upload failed', code: 100 } }),
        { status: 400 }
      )
    }),
    /Upload failed/
  );
});


test('turns Meta API errors into a useful message', () => {
  const error = normalizeMetaError({
    error: { message: 'Invalid OAuth access token.', type: 'OAuthException', code: 190 }
  });
  assert.match(error, /Invalid OAuth access token/);
  assert.match(error, /190/);
});
