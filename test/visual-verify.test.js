import test from 'node:test';
import assert from 'node:assert/strict';

import {
  verifyImageStoryAlignment,
  verifyRenderedNewsGraphic
} from '../src/visual-verify.js';

const approvedVisionResponse = {
  output_text: JSON.stringify({
    approved: true,
    story_alignment_score: 92,
    photo_quality_score: 88,
    readability_score: 94,
    generic_graphic: false,
    unsafe: false,
    visible_subjects: ['a father', 'a child'],
    visible_context: 'A parent helping a child with food',
    reason: 'The image visibly matches the human-helping story.'
  })
};

test('vision verifier approves a story-aligned image using the Responses API', async () => {
  const calls = [];

  const result = await verifyImageStoryAlignment({
    imageBuffer: Buffer.from('fake-image-bytes'),
    storyTitle: 'Father helps hungry child with a warm meal',
    sourceDomain: 'Example News',
    candidateContext: 'Father gives child food',
    mode: 'required',
    apiKey: 'test-key',
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify(approvedVisionResponse), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
  });

  assert.equal(result.verified, true);
  assert.equal(result.method, 'openai-vision');
  assert.equal(result.storyAlignmentScore, 92);
  assert.equal(result.readabilityScore, 94);
  assert.equal(calls.length, 1);
  assert.match(calls[0].init.headers.authorization, /^Bearer test-key$/);

  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, 'gpt-5-mini');
  assert.equal(body.input[0].content[0].type, 'input_text');
  assert.equal(body.input[0].content[1].type, 'input_image');
  assert.match(body.input[0].content[1].image_url, /^data:image\/jpeg;base64,/);
});

test('vision verifier rejects an image below the local story-alignment threshold', async () => {
  const result = await verifyImageStoryAlignment({
    imageBuffer: Buffer.from('fake-image-bytes'),
    storyTitle: 'Volunteers deliver meals to seniors',
    sourceDomain: 'Example News',
    candidateContext: 'Unrelated landscape photo',
    mode: 'required',
    apiKey: 'test-key',
    fetchImpl: async () => new Response(JSON.stringify({
      output_text: JSON.stringify({
        approved: true,
        story_alignment_score: 41,
        photo_quality_score: 90,
        readability_score: 90,
        generic_graphic: false,
        unsafe: false,
        visible_subjects: ['a landscape'],
        visible_context: 'A mountain landscape',
        reason: 'The image does not show the described people or action.'
      })
    }), { status: 200 })
  });

  assert.equal(result.verified, false);
  assert.match(result.reason, /alignment/i);
});

test('required vision verification fails closed when the API key is missing', async () => {
  let called = false;

  await assert.rejects(
    verifyImageStoryAlignment({
      imageBuffer: Buffer.from('fake-image-bytes'),
      storyTitle: 'Neighbor shares groceries with another family',
      sourceDomain: 'Example News',
      candidateContext: 'Neighbor shares groceries',
      mode: 'required',
      apiKey: '',
      fetchImpl: async () => {
        called = true;
        return new Response('{}', { status: 200 });
      }
    }),
    /OPENAI_API_KEY/i
  );

  assert.equal(called, false);
});

test('metadata mode skips the vision API and reports metadata-only verification', async () => {
  let called = false;

  const result = await verifyImageStoryAlignment({
    imageBuffer: Buffer.from('fake-image-bytes'),
    storyTitle: 'Neighbors help a family after a hard day',
    sourceDomain: 'Example News',
    candidateContext: 'Neighbors helping a family',
    mode: 'metadata',
    apiKey: '',
    fetchImpl: async () => {
      called = true;
      return new Response('{}', { status: 200 });
    }
  });

  assert.equal(result.verified, null);
  assert.equal(result.method, 'metadata-only');
  assert.equal(called, false);
});

test('rendered graphic verifier applies the final-graphic readability gate', async () => {
  const result = await verifyRenderedNewsGraphic({
    imageBuffer: Buffer.from('fake-rendered-image'),
    storyTitle: 'A neighbor helps a family with groceries',
    displayHeadline: 'A Neighbor Shows Up With Groceries',
    sourceDomain: 'Example News',
    mode: 'required',
    apiKey: 'test-key',
    fetchImpl: async () => new Response(JSON.stringify({
      output_text: JSON.stringify({
        approved: true,
        story_alignment_score: 82,
        photo_quality_score: 86,
        readability_score: 58,
        generic_graphic: false,
        unsafe: false,
        visible_subjects: ['a neighbor', 'a family'],
        visible_context: 'A person carrying groceries',
        reason: 'The photo matches, but the headline is difficult to read.'
      })
    }), { status: 200 })
  });

  assert.equal(result.verified, false);
  assert.match(result.reason, /readab/i);
});
