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

test('long text wraps, fits width, and reduces font size instead of overflowing', () => {
  const lines = wrapLines(
    'You do not have to have everything figured out. Take it one day at a time.',
    20
  );
  const fontSize = calculateFontSize(lines, 812, 500, { max: 52, min: 26, lineHeightRatio: 1.12 });
  assert.ok(lines.length >= 3);
  assert.ok(fontSize <= 52);
});

test('layout validation rejects collisions and accepts the production layout', () => {
  assert.equal(validateLayout({
    headline: { x: 126, y: 300, width: 816, height: 500 },
    support: { x: 150, y: 865, width: 780, height: 90 },
    brand: { x: 360, y: 1156, width: 360, height: 60 }
  }), true);

  assert.throws(() => validateLayout({
    headline: { x: 126, y: 340, width: 816, height: 440 },
    support: { x: 150, y: 700, width: 780, height: 90 },
    brand: { x: 360, y: 1160, width: 360, height: 60 }
  }), /collision/i);
});

test('image renderer can find ImageMagick on the runner', async () => {
  try {
    await execFileAsync('magick', ['-version']);
  } catch {
    await execFileAsync('convert', ['-version']);
  }
});


test('dry-run mode is allowed to preview even when a date is already posted', async () => {
  const indexSource = await import('node:fs/promises').then(fs => fs.readFile('src/index.js', 'utf8'));
  assert.match(indexSource, /&& !isTrue\('FORCE_POST'\) && !dryRun/);
  assert.match(indexSource, /if \(dryRun\)/);
});


test('short headline uses the larger production font size', () => {
  const svg = buildSvg({ imageText: 'Keep going.\nSmall steps count.' });
  assert.match(svg, /font-size="56"/);
});

test('branding icon and text are a single centered lockup', () => {
  const svg = buildSvg({ imageText: 'Keep going.' });
  assert.ok(svg.includes('class="brand-lockup"'));
  assert.ok(svg.includes('translate(32 1160)'));
  assert.ok(svg.includes('translate(198.5 0)'));
  assert.equal((svg.match(/class="brand-lockup"/g) || []).length, 1);
  assert.ok(svg.includes('<text x="73" y="1195" text-anchor="start" class="brand">A LITTLE BETTER</text>'));
});

test('branding is centered at the bottom', () => {
  const svg = buildSvg({ imageText: 'Keep going.' });
  assert.match(svg, /class="brand-lockup"/);
  assert.match(svg, /A LITTLE BETTER/);
  assert.match(svg, /font-size: 21px/);
  assert.ok(svg.includes('translate(198.5 0)'));
});
