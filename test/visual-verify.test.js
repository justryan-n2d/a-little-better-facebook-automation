import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';

import {
  verifyImageStoryAlignment,
  verifyRenderedNewsGraphic
} from '../src/visual-verify.js';

async function makePhoto({
  width = 1200,
  height = 900,
  background = { r: 40, g: 120, b: 80 }
} = {}) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background
    }
  }).png().toBuffer();
}

async function makeGraphic() {
  return sharp({
    create: {
      width: 1080,
      height: 1350,
      channels: 3,
      background: { r: 24, g: 36, b: 48 }
    }
  }).png().toBuffer();
}

test('deterministic verifier approves a high-quality article image with matching context', async () => {
  const imageBuffer = await makePhoto();

  const result = await verifyImageStoryAlignment({
    imageBuffer,
    storyTitle: 'Neighbor helps family with groceries',
    sourceDomain: 'Example News',
    candidateContext: 'A neighbor carrying groceries to a family',
    candidateUrl: 'https://cdn.example/neighbor-family-groceries.jpg',
    candidateKind: 'article-image'
  });

  externalCall = externalCall;
  assert.equal(externalCall, false);
  assert.equal(result.verified, true);
  assert.equal(result.method, 'deterministic');
  assert.ok(result.storyAlignmentScore >= 50);
  assert.ok(result.photoQualityScore >= 70);
  assert.match(result.reason, /passed/i);
});

test('deterministic verifier rejects an unrelated image context', async () => {
  const imageBuffer = await makePhoto({ background: { r: 120, g: 60, b: 40 } });

  const result = await verifyImageStoryAlignment({
    imageBuffer,
    storyTitle: 'Neighbor helps family with groceries',
    sourceDomain: 'Example News',
    candidateContext: 'A football stadium with players and fans',
    candidateUrl: 'https://cdn.example/football-stadium.jpg',
    candidateKind: 'og:image'
  });

  assert.equal(result.verified, false);
  assert.ok(result.storyAlignmentScore < 50);
  assert.match(result.reason, /alignment|context|mismatch|generic/i);
});

test('deterministic verifier rejects a low-quality article image', async () => {
  const imageBuffer = await sharp({
    create: {
      width: 120,
      height: 90,
      channels: 3,
      background: { r: 0, g: 0, b: 0 }
    }
  }).png().toBuffer();

  const result = await verifyImageStoryAlignment({
    imageBuffer,
    storyTitle: 'Volunteer gives groceries to a family',
    sourceDomain: 'Example News',
    candidateContext: 'Volunteer gives groceries to a family',
    candidateUrl: 'https://cdn.example/volunteer-family.jpg',
    candidateKind: 'article-image'
  });

  assert.equal(result.verified, false);
  assert.match(result.reason, /quality|dimension|black|small/i);
});

test('final graphic verifier passes a valid 4:5 rendered graphic without external APIs', async () => {
  const imageBuffer = await makeGraphic();

  const result = await verifyRenderedNewsGraphic({
    imageBuffer,
    storyTitle: 'Neighbor helps a family with groceries',
    displayHeadline: 'A Neighbor Shows Up With Groceries',
    sourceDomain: 'Example News'
  });

  assert.equal(result.verified, true);
  assert.equal(result.method, 'deterministic');
  assert.equal(result.readabilityScore, 100);
  assert.match(result.reason, /passed/i);
});

test('final graphic verifier rejects the wrong canvas size', async () => {
  const imageBuffer = await sharp({
    create: {
      width: 1000,
      height: 1000,
      channels: 3,
      background: { r: 24, g: 36, b: 48 }
    }
  }).png().toBuffer();

  const result = await verifyRenderedNewsGraphic({
    imageBuffer,
    storyTitle: 'Neighbor helps a family with groceries',
    displayHeadline: 'A Neighbor Shows Up With Groceries',
    sourceDomain: 'Example News'
  });

  assert.equal(result.verified, false);
  assert.match(result.reason, /dimension|1080x1350/i);
});
