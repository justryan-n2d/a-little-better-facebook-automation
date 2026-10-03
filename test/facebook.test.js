import test from 'node:test';
import assert from 'node:assert/strict';
import { publishPhoto, normalizeMetaError } from '../src/facebook.js';

test('publishes a photo to the configured Facebook Page endpoint', async () => {
  let calledUrl = '';
  let calledBody;
  const fakeFetch = async (url, options) => {
    calledUrl = url;
    calledBody = options.body;
    return new Response(JSON.stringify({ id: '123_456' }), {
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

  assert.equal(result.postId, '123_456');
  assert.equal(calledUrl, 'https://graph.facebook.com/v26.0/page-123/photos');
  assert.ok(calledBody instanceof FormData);
  assert.equal(calledBody.get('message'), 'Hello from A Little Better');
  assert.equal(calledBody.get('access_token'), 'token');
  assert.ok(calledBody.get('source') instanceof Blob);
});

test('turns Meta API errors into a useful message', () => {
  const error = normalizeMetaError({
    error: { message: 'Invalid OAuth access token.', type: 'OAuthException', code: 190 }
  });
  assert.match(error, /Invalid OAuth access token/);
  assert.match(error, /190/);
});
