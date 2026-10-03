import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { renderPostImage } from '../src/image.js';

const execFileAsync = promisify(execFile);

test('renders the daily post as a Facebook-ready PNG', async () => {
  const png = await renderPostImage({
    imageText: 'Keep going.\nSmall steps count.'
  });
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const svg = (await import('../src/image.js')).buildSvg({ imageText: 'Keep going.' });
  assert.match(svg, /#A6D8B8/);
  assert.match(svg, /#FFFFFF/);
});

test('image renderer can find ImageMagick on the runner', async () => {
  try {
    await execFileAsync('magick', ['-version']);
  } catch {
    await execFileAsync('convert', ['-version']);
  }
});
