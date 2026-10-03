import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  renderPostImage,
  wrapLines,
  calculateFontSize,
  validateLayout,
  buildSvg
} from '../src/image.js';

const execFileAsync = promisify(execFile);

test('renders the daily post as a Facebook-ready PNG', async () => {
  const png = await renderPostImage({
    imageText: 'Keep going.\nSmall steps count.'
  });
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
});

test('renderer uses the brand colors', () => {
  const svg = buildSvg({ imageText: 'Keep going.' });
  assert.match(svg, /#A6D8B8/g);
  assert.match(svg, /#FFFFFF/g);
});

test('long text wraps and reduces font size instead of overflowing', () => {
  const lines = wrapLines(
    'You do not have to have everything figured out. Take it one day at a time.',
    24
  );
  const fontSize = calculateFontSize(lines.length, 470, { max: 48, min: 26 });
  assert.ok(lines.length >= 3);
  assert.ok(fontSize <= 48);
});

test('layout validation rejects collisions and accepts the production layout', () => {
  assert.equal(validateLayout({
    headline: { x: 120, y: 330, width: 840, height: 470 },
    support: { x: 150, y: 865, width: 780, height: 90 },
    brand: { x: 360, y: 1185, width: 360, height: 60 }
  }), true);

  assert.throws(() => validateLayout({
    headline: { x: 120, y: 330, width: 840, height: 470 },
    support: { x: 150, y: 700, width: 780, height: 90 },
    brand: { x: 360, y: 1185, width: 360, height: 60 }
  }), /collision/i);
});

test('image renderer can find ImageMagick on the runner', async () => {
  try {
    await execFileAsync('magick', ['-version']);
  } catch {
    await execFileAsync('convert', ['-version']);
  }
});
