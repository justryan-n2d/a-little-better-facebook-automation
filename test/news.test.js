import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import sharp from 'sharp';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
import {
  buildNewsHook,
  buildNewsAngle,
  buildDisplayHeadline,
  buildImageQueries,
  extractGdeltArticles,
  extractGoogleNewsRssArticles,
  searchGdelt,
  searchFreshNews,
  searchGoogleNewsTopStoriesRss,
  findOpenverseImage,
  findSourceArticleImage,
  resolveArticleUrl,
  downloadImage,
  isPhotoLikeOpenverseImage,
  isSafeNewsCandidate,
  isLittleBetterTopic,
  getLittleBetterTopic,
  isHeartwarmingHumanStory,
  selectFreshStory
} from '../src/news.js';
import { buildNewsSvg, calculateNewsLayout, fitTextToBox, NEWS_PRIMARY, rectanglesOverlap, renderNewsImage } from '../src/news-image.js';
import { runNewsPost } from '../src/news-post.js';

test('rejects unsafe or obviously graphic headlines', () => {
  assert.equal(isSafeNewsCandidate('Community volunteers help families after a storm'), true);
  assert.equal(isSafeNewsCandidate('Graphic murder scene shocks city'), false);
  assert.equal(isSafeNewsCandidate('Student arrested after campus incident'), false);
  assert.equal(isSafeNewsCandidate('Tiny update'), false);
});

test('uses one combined GDELT request for all content themes', async () => {
  const calls = [];
  const result = await searchGdelt({
    queries: ['(student OR school) success', '(science OR innovation) discovery'],
    fetchImpl: async url => {
      calls.push(String(url));
      return new Response(JSON.stringify({
        articles: [{
          title: 'Student wins science award',
          url: 'https://example.com/story',
          domain: 'example.com',
          seendate: '20261003030000'
        }]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /student/i);
  assert.match(calls[0], /science/i);
  assert.equal(result.length, 1);
});

test('requires a clear A Little Better topic', () => {
  assert.equal(isLittleBetterTopic('Students win scholarship awards'), true);
  assert.equal(isLittleBetterTopic('Scientists announce a new breakthrough'), true);
  assert.equal(isLittleBetterTopic('Volunteers organize a community donation drive'), true);
  assert.equal(isLittleBetterTopic('Random celebrity spotted at an event'), false);
  assert.equal(isLittleBetterTopic('Student protests rattle France'), false);
  assert.equal(isLittleBetterTopic('Student wins scholarship awards'), true);
  assert.equal(getLittleBetterTopic('Students win scholarship awards')?.name, 'education-growth');
});

test('builds complete display headlines without ellipses', () => {
  assert.equal(
    buildDisplayHeadline('Bay Area author discusses skills students need for success beyond grades, test scores and college admissions - KCRA'),
    'Students Need More Than Good Grades'
  );

  const current = buildDisplayHeadline(
    'FAU graduate student uses Miss Fort Lauderdale crown to turn science into action - WPTV'
  );
  assert.equal(current, 'FAU Graduate Uses Her Crown for Coastal Conservation');
  assert.doesNotMatch(current, /\.\.\./);
});

test('rejects infographic-like Openverse assets', () => {
  assert.equal(isPhotoLikeOpenverseImage({
    url: 'https://images.example/graphic.jpg',
    title: '7 Measures of Quality in Online Learning',
    width: 1200,
    height: 900
  }), false);

  assert.equal(isPhotoLikeOpenverseImage({
    url: 'https://images.example/photo.jpg',
    title: 'Students celebrating an achievement',
    width: 1200,
    height: 900
  }), true);
});

test('builds story-specific image search queries before broad fallbacks', () => {
  const queries = buildImageQueries(
    'FAU graduate student uses Miss Fort Lauderdale crown to turn science into action',
    'education-growth'
  );
  assert.equal(queries[0], 'woman marine scientist fieldwork');
  assert.ok(queries.includes('student scientist laboratory'));
  assert.ok(queries.includes('students achievement education'));
  assert.ok(queries.some(query => query.includes('graduate student')));
  assert.ok(queries.includes('people community inspiration'));
});

test('keeps scholarship image queries relevant without truncating the story', () => {
  const queries = buildImageQueries('Students win a national scholarship award', 'education-growth');
  assert.ok(queries.includes('student receiving scholarship'));
  assert.ok(queries.includes('college scholarship student'));
  assert.ok(queries.includes('students achievement education'));
  assert.ok(queries.includes('Students national scholarship award'));
});

test('prefers story-relevant Openverse photos over unrelated exact-query results', async () => {
  const image = await findOpenverseImage(
    [
      'FAU graduate student Miss Fort Lauderdale crown turn science',
      'woman marine scientist fieldwork'
    ],
    {
      fetchImpl: async url => {
        const parsed = new URL(String(url));
        const q = parsed.searchParams.get('q');

        if (q === 'FAU graduate student Miss Fort Lauderdale crown turn science') {
          return new Response(JSON.stringify({
            results: [{
              url: 'https://images.example/painting.jpg',
              title: 'The Blue Gown oil painting',
              width: 3000,
              height: 2200,
              license: 'cc0',
              creator: 'Artist',
              provider: 'wikimedia'
            }]
          }), { status: 200 });
        }

        return new Response(JSON.stringify({
          results: [{
            url: 'https://images.example/scientist.jpg',
            title: 'Woman marine scientist fieldwork',
            description: 'Scientist doing environmental field research',
            width: 1600,
            height: 1067,
            license: 'cc0',
            creator: 'Scientist Photographer',
            provider: 'flickr'
          }]
        }), { status: 200 });
      }
    }
  );

  assert.equal(image?.url, 'https://images.example/scientist.jpg');
  assert.equal(image?.searchQuery, 'woman marine scientist fieldwork');
});

test('tries multiple Openverse queries before giving up', async () => {
  const calls = [];
  const image = await findOpenverseImage(
    ['Student Protests Rattle France', 'students celebrating success'],
    {
      fetchImpl: async url => {
        calls.push(String(url));
        const parsed = new URL(String(url));
        if (parsed.searchParams.get('q') === 'students celebrating success' && parsed.searchParams.get('license') === 'cc0') {
          return new Response(JSON.stringify({
            results: [{
              url: 'https://images.example/good.jpg',
              title: 'Students celebrating success',
              description: 'College students celebrating a successful achievement',
              creator: 'Creator',
              provider: 'Example',
              license: 'cc0',
              width: 1200,
              height: 900
            }]
          }), { status: 200 });
        }
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
    }
  );

  assert.equal(image?.url, 'https://images.example/good.jpg');
  assert.ok(calls.length > 1);
});

test('provides a direct StockSnap CDN fallback when available', async () => {
  const image = await findOpenverseImage(['education graduation'], {
    fetchImpl: async url => {
      return new Response(JSON.stringify({
        results: [{
          url: 'https://cdn.example/blocked.jpg',
          thumbnail: 'https://cdn.example/thumb.jpg',
          foreign_landing_url: 'https://stocksnap.io/photo/education-graduation-XAL3MIM3OC',
          creator: 'Candace McDaniel',
          provider: 'stocksnap',
          license: 'cc0',
          width: 4752,
          height: 3168
        }]
      }), { status: 200 });
    }
  });

  assert.deepEqual(image?.urlCandidates, [
    'https://cdn.example/blocked.jpg',
    'https://cdn.example/thumb.jpg',
    'https://cdn.stocksnap.io/img-thumbs/960w/education-graduation_XAL3MIM3OC.jpg'
  ]);
});

test('rejects an original article image when context evidence is unavailable', async () => {
  await assert.rejects(
    findSourceArticleImage(
      {
        url: 'https://news.google.com/rss/articles/example',
        domain: 'Bay News 9',
        title: 'Family shares story behind resurfaced memorial bench found in Bermuda'
      },
    {
      fetchImpl: async input => {
        const url = String(input);

        if (url.includes('news.google.com')) {
          return {
            ok: true,
            status: 200,
            url: 'https://www.baynews9.com/fl/tampa/news/example-story',
            text: async () => ''
          };
        }

        if (url.includes('baynews9.com/fl/tampa/news/example-story')) {
          return new Response(
            '<html><head>' +
            '<meta property="og:image" content="https://cdn.baynews9.com/images/example-story.jpg">' +
            '</head></html>',
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        }

        if (url.includes('cdn.baynews9.com/images/example-story.jpg')) {
          const raw = Buffer.alloc(700 * 500 * 3);
          for (let y = 0; y < 500; y += 1) {
            for (let x = 0; x < 700; x += 1) {
              const index = (y * 700 + x) * 3;
              raw[index] = (x * 3 + y) % 256;
              raw[index + 1] = (y * 4 + x) % 256;
              raw[index + 2] = (x + y) % 256;
            }
          }
          return new Response(await sharp(raw, {
            raw: { width: 700, height: 500, channels: 3 }
          }).png().toBuffer(), {
            status: 200,
            headers: { 'content-type': 'image/png' }
          });
        }

        return new Response('not found', { status: 404 });
      }
      }
    ),
    /context-matching.*image/i
  );
});

test('uses JSON-LD article metadata to verify a generic source image URL', async () => {
  const raw = Buffer.alloc(700 * 500 * 3);
  for (let y = 0; y < 500; y += 1) {
    for (let x = 0; x < 700; x += 1) {
      const index = (y * 700 + x) * 3;
      raw[index] = (x * 3 + y) % 256;
      raw[index + 1] = (y * 4 + x) % 256;
      raw[index + 2] = (x + y) % 256;
    }
  }
  const visual = await sharp(raw, {
    raw: { width: 700, height: 500, channels: 3 }
  }).png().toBuffer();

  const result = await findSourceArticleImage(
    {
      url: 'https://news.google.com/rss/articles/example',
      domain: 'The Vanderbilt Hustler',
      title: 'Vanderbilt students help children with school supplies'
    },
    {
      fetchImpl: async input => {
        const url = String(input);

        if (url.includes('news.google.com')) {
          return { ok: true, status: 200, url: 'https://vanderbilthustler.com/example-story', text: async () => '' };
        }

        if (url === 'https://vanderbilthustler.com/example-story') {
          return new Response(
            '<html><head>' +
            '<meta property="og:image" content="https://lh3.googleusercontent.com/example-image=s0-w300">' +
            '<script type="application/ld+json">' +
            JSON.stringify({
              '@type': 'NewsArticle',
              headline: 'Vanderbilt students help children with school supplies',
              description: 'Vanderbilt students help children with school supplies through a local community effort.',
              image: {
                '@type': 'ImageObject',
                url: 'https://lh3.googleusercontent.com/example-image=s0-w300',
                caption: 'Vanderbilt students help children with school supplies'
              }
            }) +
            '</script>' +
            '</head></html>',
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        }

        if (url.includes('lh3.googleusercontent.com')) {
          return new Response(visual, {
            status: 200,
            headers: { 'content-type': 'image/png' }
          });
        }

        return new Response('not found', { status: 404 });
      }
    }
  );

  assert.equal(result.visualVerification.verified, true);
  assert.ok(result.relevanceMatches.length > 0);
});

test('uses an article-declared featured image when page-level metadata matches', async () => {
  const raw = Buffer.alloc(700 * 500 * 3);
  for (let y = 0; y < 500; y += 1) {
    for (let x = 0; x < 700; x += 1) {
      const index = (y * 700 + x) * 3;
      raw[index] = (x * 3 + y) % 256;
      raw[index + 1] = (y * 4 + x) % 256;
      raw[index + 2] = (x + y) % 256;
    }
  }
  const visual = await sharp(raw, {
    raw: { width: 700, height: 500, channels: 3 }
  }).png().toBuffer();

  const result = await findSourceArticleImage(
    {
      url: 'https://news.google.com/rss/articles/example',
      domain: 'The Vanderbilt Hustler',
      title: 'Vanderbilt students help children with school supplies'
    },
    {
      fetchImpl: async input => {
        const url = String(input);

        if (url.includes('news.google.com')) {
          return { ok: true, status: 200, url: 'https://vanderbilthustler.com/example-story', text: async () => '' };
        }

        if (url === 'https://vanderbilthustler.com/example-story') {
          return new Response(
            '<html><head>' +
            '<title>Vanderbilt students help children with school supplies</title>' +
            '<meta property="og:title" content="Vanderbilt students help children with school supplies">' +
            '<meta name="description" content="Vanderbilt students help children with school supplies through a local community effort.">' +
            '<meta property="og:image" content="https://lh3.googleusercontent.com/example-image=s0-w300">' +
            '</head></html>',
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        }

        if (url.includes('lh3.googleusercontent.com')) {
          return new Response(visual, {
            status: 200,
            headers: { 'content-type': 'image/png' }
          });
        }

        return new Response('not found', { status: 404 });
      }
    }
  );

  assert.equal(result.visualVerification.verified, true);
  assert.equal(result.visualVerification.method, 'deterministic');
  assert.ok(result.visualVerification.photoQualityScore >= 60);
  assert.ok(result.visualVerification.storyAlignmentScore >= 50);
});



test('uses a Jina Reader article image when the publisher page hides its image markup', async () => {
  const raw = Buffer.alloc(700 * 500 * 3);
  for (let y = 0; y < 500; y += 1) {
    for (let x = 0; x < 700; x += 1) {
      const index = (y * 700 + x) * 3;
      raw[index] = (x * 3 + y) % 256;
      raw[index + 1] = (y * 4 + x) % 256;
      raw[index + 2] = (x + y) % 256;
    }
  }
  const visual = await sharp(raw, {
    raw: { width: 700, height: 500, channels: 3 }
  }).png().toBuffer();

  const result = await findSourceArticleImage(
    {
      url: 'https://news.google.com/rss/articles/example',
      domain: 'Example News',
      title: 'Community volunteers provide meals to seniors'
    },
    {
      fetchImpl: async (input, init = {}) => {
        const url = String(input);

        if (url.includes('news.google.com')) {
          return {
            ok: true,
            status: 200,
            url: 'https://example.com/story',
            text: async () => ''
          };
        }

        if (url === 'https://example.com/story') {
          return new Response(
            '<html><head><title>Community volunteers provide meals to seniors</title></head></html>',
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        }

        if (url === 'https://r.jina.ai/https://example.com/story') {
          assert.equal(init.headers?.['x-with-generated-alt'], 'true');
          return new Response(
            '# Community volunteers provide meals to seniors\n\n' +
            '![Community volunteers provide meals to seniors](https://cdn.example/real-photo.jpg)',
            { status: 200, headers: { 'content-type': 'text/plain' } }
          );
        }

        if (url === 'https://cdn.example/real-photo.jpg') {
          return new Response(visual, {
            status: 200,
            headers: { 'content-type': 'image/png' }
          });
        }

        return new Response('not found', { status: 404 });
      }
    }
  );

  assert.equal(result.url, 'https://cdn.example/real-photo.jpg');
  assert.equal(result.visualVerification.verified, true);
  assert.equal(result.visualVerification.method, 'deterministic');
});

test('uses the Google News RSS source image when the original article exposes no usable image', async () => {
  const raw = Buffer.alloc(700 * 500 * 3);
  for (let y = 0; y < 500; y += 1) {
    for (let x = 0; x < 700; x += 1) {
      const index = (y * 700 + x) * 3;
      raw[index] = (x * 3 + y) % 256;
      raw[index + 1] = (y * 4 + x) % 256;
      raw[index + 2] = (x + y) % 256;
    }
  }
  const visual = await sharp(raw, {
    raw: { width: 700, height: 500, channels: 3 }
  }).png().toBuffer();

  const result = await findSourceArticleImage(
    {
      url: 'https://news.google.com/rss/articles/example',
      domain: 'Example News',
      title: 'Community volunteers provide meals to seniors',
      socialimage: 'https://lh3.googleusercontent.com/source-photo=s0-w300'
    },
    {
      fetchImpl: async input => {
        const url = String(input);
        if (url.includes('news.google.com')) {
          return {
            ok: true,
            status: 200,
            url: 'https://example.com/story',
            text: async () => ''
          };
        }
        if (url === 'https://example.com/story') {
          return new Response(
            '<html><head><title>Community volunteers provide meals to seniors</title></head><body></body></html>',
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        }
        if (url.includes('lh3.googleusercontent.com')) {
          return new Response(visual, {
            status: 200,
            headers: { 'content-type': 'image/png' }
          });
        }
        return new Response('not found', { status: 404 });
      }
    }
  );

  assert.equal(result.url, 'https://lh3.googleusercontent.com/source-photo=s0-w300');
  assert.equal(result.visualVerification.verified, true);
  assert.equal(result.visualVerification.method, 'deterministic');
});

test('rejects a graphic Google News RSS source image instead of using it as a photo', async () => {
  const graphic = await sharp({
    create: {
      width: 700,
      height: 500,
      channels: 3,
      background: { r: 32, g: 120, b: 80 }
    }
  }).png().toBuffer();

  await assert.rejects(
    () => findSourceArticleImage(
      {
        url: 'https://news.google.com/rss/articles/example',
        domain: 'Example News',
        title: 'Community volunteers provide meals to seniors',
        socialimage: 'https://cdn.example/source-graphic.png'
      },
      {
        fetchImpl: async input => {
          const url = String(input);
          if (url.includes('news.google.com')) {
            return {
              ok: true,
              status: 200,
              url: 'https://example.com/story',
              text: async () => ''
            };
          }
          if (url === 'https://example.com/story') {
            return new Response('<html><head><title>Community volunteers provide meals to seniors</title></head></html>', {
              status: 200,
              headers: { 'content-type': 'text/html' }
            });
          }
          if (url.includes('cdn.example/source-graphic.png')) {
            return new Response(graphic, {
              status: 200,
              headers: { 'content-type': 'image/png' }
            });
          }
          return new Response('not found', { status: 404 });
        }
      }
    ),
    /context-matching.*image/i
  );
});

test('decodes a modern Google News RSS article URL to its real publisher URL', async () => {
  const calls = [];
  const googleUrl = 'https://news.google.com/rss/articles/CBMiTESTTOKEN?oc=5';

  const resolved = await resolveArticleUrl(googleUrl, {
    fetchImpl: async (input, init = {}) => {
      const url = String(input);
      calls.push({ url, method: init.method || 'GET' });

      if (url === googleUrl) {
        return {
          ok: true,
          status: 200,
          url,
          text: async () => '<html><body>Google News wrapper</body></html>'
        };
      }

      if (url.includes('news.google.com/_/DotsSplashUi/data/batchexecute')) {
        return new Response(
          '[["garturlres","https://example.com/story",null,null]]',
          { status: 200, headers: { 'content-type': 'text/plain' } }
        );
      }

      throw new Error('unexpected request: ' + url);
    }
  });

  assert.equal(resolved, 'https://example.com/story');
  assert.equal(
    calls.some(call =>
      call.url.includes('news.google.com/_/DotsSplashUi/data/batchexecute') &&
      call.method === 'POST'
    ),
    true
  );
});

test('resolves a Google News wrapper to the publisher article before image extraction', async () => {
  const calls = [];

  const result = await findSourceArticleImage(
    {
      url: 'https://news.google.com/rss/articles/example',
      domain: 'Example News',
      title: 'Community volunteers provide meals to seniors'
    },
    {
      fetchImpl: async (input, init = {}) => {
        const url = String(input);
        calls.push(url);

        if (url === 'https://news.google.com/rss/articles/example') {
          return {
            ok: true,
            status: 200,
            url,
            text: async () =>
              '<html><head><link href="https://fonts.googleapis.com/css?family=Google+Sans+Text:400,500,700"></head><body><a href="https://example.com/story">Open story</a></body></html>'
          };
        }

        if (url === 'https://example.com/story') {
          return new Response(
            '<html><head>' +
            '<title>Community volunteers provide meals to seniors</title>' +
            '<meta property="og:title" content="Community volunteers provide meals to seniors">' +
            '<meta property="og:image" content="https://cdn.example/community.jpg">' +
            '</head></html>',
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        }

        if (url === 'https://cdn.example/community.jpg') {
          const raw = Buffer.alloc(700 * 500 * 3);
          for (let y = 0; y < 500; y += 1) {
            for (let x = 0; x < 700; x += 1) {
              const index = (y * 700 + x) * 3;
              raw[index] = (x * 3 + y) % 256;
              raw[index + 1] = (y * 4 + x) % 256;
              raw[index + 2] = (x + y) % 256;
            }
          }
          const image = await sharp(raw, {
            raw: { width: 700, height: 500, channels: 3 }
          }).png().toBuffer();
          return new Response(image, {
            status: 200,
            headers: { 'content-type': 'image/png' }
          });
        }

        throw new Error('unexpected request: ' + url);
      }
    }
  );

  assert.equal(result.url, 'https://cdn.example/community.jpg');
  assert.ok(calls.includes('https://example.com/story'));
  assert.ok(!calls.some(url => url === 'https://r.jina.ai/https://news.google.com/rss/articles/example'));
});

test('uses the source article image that matches the story context', async () => {
  const calls = [];

  const result = await findSourceArticleImage(
    {
      url: 'https://news.google.com/rss/articles/example',
      domain: 'Buffalo Bills',
      title: "Buffalo Bills become first NFL team to win Cannes Corporate Media & TV Award with Josh Allen MVP reaction video"
    },
    {
      fetchImpl: async (input, init = {}) => {
        const url = String(input);
        calls.push({ url, redirect: init.redirect });

        if (url === 'https://news.google.com/rss/articles/example') {
          return {
            ok: true,
            status: 200,
            url: 'https://www.buffalobills.com/news/example-story',
            text: async () => ''
          };
        }

        if (url === 'https://www.buffalobills.com/news/example-story') {
          return new Response(
            '<html><head>' +
            '<meta property="og:image" content="https://media.example-cdn.test/patriot-mask.jpg">' +
            '<meta name="twitter:image" content="https://media.example-cdn.test/josh-allen-kids.jpg">' +
            '</head><body>' +
            '<img src="https://media.example-cdn.test/patriot-mask.jpg" alt="A Patriot Wear a Mask Be Smart Be Strong">' +
            '<img src="https://media.example-cdn.test/josh-allen-kids.jpg" alt="Josh Allen MVP reaction video for children hospital patients">' +
            '</body></html>',
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        }

        if (url === 'https://media.example-cdn.test/patriot-mask.jpg') {
          const raw = Buffer.alloc(700 * 500 * 3, 8);
          return new Response(await sharp(raw, {
            raw: { width: 700, height: 500, channels: 3 }
          }).png().toBuffer(), {
            status: 200,
            headers: { 'content-type': 'image/png' }
          });
        }

        if (url === 'https://media.example-cdn.test/josh-allen-kids.jpg') {
          const raw = Buffer.alloc(700 * 500 * 3);
          for (let y = 0; y < 500; y += 1) {
            for (let x = 0; x < 700; x += 1) {
              const index = (y * 700 + x) * 3;
              raw[index] = (x * 3 + y) % 256;
              raw[index + 1] = (y * 4 + x) % 256;
              raw[index + 2] = (x + y) % 256;
            }
          }
          return new Response(await sharp(raw, {
            raw: { width: 700, height: 500, channels: 3 }
          }).png().toBuffer(), {
            status: 200,
            headers: { 'content-type': 'image/png' }
          });
        }

        return new Response('not found', { status: 404 });
      }
    }
  );

  assert.equal(result.url, 'https://media.example-cdn.test/josh-allen-kids.jpg');
  assert.equal(result.provider, 'Buffalo Bills');
  assert.equal(result.license, 'article-image');
  assert.ok(result.relevanceMatches.includes('josh'));
  assert.ok(calls.some(item => item.url === 'https://www.buffalobills.com/news/example-story'));
});

test('upgrades Googleusercontent thumbnail URLs before downloading article images', async () => {
  const calls = [];

  const result = await downloadImage(
    'https://lh3.googleusercontent.com/example-image=s0-w300',
    {
      fetchImpl: async input => {
        const url = String(input);
        calls.push(url);
        if (url.endsWith('=s0-w300')) {
          return new Response('thumbnail', {
            status: 200,
            headers: { 'content-type': 'image/jpeg' }
          });
        }
        if (url.endsWith('=s0')) {
          return new Response(Buffer.alloc(12000, 7), {
            status: 200,
            headers: { 'content-type': 'image/jpeg' }
          });
        }
        return new Response('not found', { status: 404 });
      }
    }
  );

  assert.equal(result.length, 12000);
  assert.deepEqual(calls, [
    'https://lh3.googleusercontent.com/example-image=s0'
  ]);
});

test('tries the next image URL when the first image host fails', async () => {
  const calls = [];
  const payload = Buffer.alloc(12000, 7);

  const result = await downloadImage(
    ['https://images.example/blocked.jpg', 'https://cdn.example/good.jpg'],
    {
      fetchImpl: async url => {
        calls.push(String(url));
        if (String(url).includes('blocked')) {
          return new Response('nope', { status: 403 });
        }
        return new Response(payload, {
          status: 200,
          headers: { 'content-type': 'image/jpeg' }
        });
      }
    }
  );

  assert.equal(calls.length, 2);
  assert.equal(result.length, payload.length);
});

test('extracts GDELT article list', () => {
  const items = extractGdeltArticles({
    articles: [{ title: 'A story', url: 'https://example.com/a' }]
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'A story');
});

test('skips social-platform URLs when selecting a news source', () => {
  const selected = selectFreshStory([
    {
      title: 'Heartwarming student helps children with school supplies',
      url: 'https://www.facebook.com/example/story',
      domain: 'Example News',
      seendate: '20261004030000',
      rank: 1
    },
    {
      title: 'Heartwarming neighbor helps family with groceries',
      url: 'https://example.com/story',
      domain: 'Example News',
      seendate: '20261004020000',
      rank: 2
    }
  ], {
    now: new Date('2026-10-04T04:00:00Z')
  });

  assert.equal(selected?.url, 'https://example.com/story');
});

test('skips unrelated or negative stories even when they are ranked highly', () => {
  const selected = selectFreshStory([
    {
      title: 'Student arrested after campus incident',
      url: 'https://bad.example/story',
      domain: 'bad.example',
      seendate: '20261003030000',
      rank: 1
    },
    {
      title: 'Community volunteers create a positive change',
      url: 'https://good.example/story',
      domain: 'good.example',
      seendate: '20261003020000',
      rank: 2
    },
    {
      title: 'Random celebrity spotted at an event',
      url: 'https://noise.example/story',
      domain: 'noise.example',
      seendate: '20261003010000',
      rank: 3
    }
  ], {
    now: new Date('2026-10-03T04:00:00Z')
  });

  assert.equal(selected.domain, 'good.example');
  assert.equal(selected.topic, 'kindness-community');
});

test('selects a recent multi-source story and avoids used URLs', () => {
  const now = new Date('2026-10-03T04:00:00Z');
  const selected = selectFreshStory([
    {
      title: 'Student wins national science award',
      url: 'https://one.example/story',
      domain: 'one.example',
      seendate: '20261003030000',
      rank: 2
    },
    {
      title: 'Student wins national science award',
      url: 'https://two.example/story',
      domain: 'two.example',
      seendate: '20261003020000',
      rank: 4
    },
    {
      title: 'Student wins national science award',
      url: 'https://one.example/old',
      domain: 'one.example',
      seendate: '20260925020000',
      rank: 1
    }
  ], {
    now,
    usedUrls: []
  });

  assert.equal(selected.sourceCount, 2);
  assert.equal(selected.domain, 'one.example');
});

test('avoids previously used title fingerprints', () => {
  const selected = selectFreshStory([{
    title: 'A heartwarming community volunteer story',
    url: 'https://example.com/new',
    domain: 'example.com',
    seendate: '20261003030000',
    rank: 1
  }], {
    usedTitles: ['A heartwarming community volunteer story'],
    now: new Date('2026-10-03T04:00:00Z')
  });
  assert.equal(selected, null);
});

test('parses Google News RSS fallback articles', () => {
  const xml = '<rss><channel><item><title><![CDATA[Student wins national science award]]></title><link>https://example.com/story</link><pubDate>Sat, 03 Oct 2026 03:00:00 GMT</pubDate><source>Example News</source></item></channel></rss>';
  const items = extractGoogleNewsRssArticles(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Student wins national science award');
  assert.equal(items[0].domain, 'Example News');
});

test('extracts a source image from Google News RSS media or description markup', () => {
  const xml =
    '<rss><channel><item>' +
    '<title>Community volunteers help families</title>' +
    '<link>https://example.com/story</link>' +
    '<pubDate>Sat, 03 Oct 2026 03:00:00 GMT</pubDate>' +
    '<source>Example News</source>' +
    '<media:content url="https://lh3.googleusercontent.com/example-photo=s0-w300" medium="image" />' +
    '</item></channel></rss>';

  const items = extractGoogleNewsRssArticles(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].socialimage, 'https://lh3.googleusercontent.com/example-photo=s0-w300');
});

test('falls back to Google News RSS after a GDELT failure', async () => {
  const calls = [];
  const result = await searchFreshNews({
    queries: ['student success'],
    fetchImpl: async url => {
      calls.push(String(url));
      if (String(url).includes('gdeltproject.org')) {
        return new Response('rate limited', { status: 429 });
      }
      return new Response('<rss><channel><item><title>Student wins national science award</title><link>https://example.com/story</link><pubDate>Sat, 03 Oct 2026 03:00:00 GMT</pubDate><source>Example News</source></item></channel></rss>', { status: 200, headers: { 'content-type': 'application/rss+xml' } });
    }
  });
  assert.equal(result.provider, 'google-news-rss');
  assert.equal(result.articles.length, 1);
  assert.equal(calls.filter(url => url.includes('gdeltproject.org')).length, 1);
});



test('aggregates multiple Google News queries when GDELT is unavailable', async () => {
  const calls = [];
  const result = await searchFreshNews({
    queries: ['student success', 'community kindness'],
    maxRecords: 10,
    fetchImpl: async input => {
      const url = String(input);
      calls.push(url);

      if (url.includes('gdeltproject.org')) {
        return new Response('rate limited', { status: 429 });
      }

      if (url.includes('news.google.com/rss/search')) {
        const query = new URL(url).searchParams.get('q');
        if (query === 'student success') {
          return new Response(
            '<rss><channel><item>' +
            '<title>Student wins national science award</title>' +
            '<link>https://student.example/story</link>' +
            '<pubDate>Sat, 03 Oct 2026 03:00:00 GMT</pubDate>' +
            '<source>Student News</source>' +
            '</item></channel></rss>',
            { status: 200 }
          );
        }

        if (query === 'community kindness') {
          return new Response(
            '<rss><channel><item>' +
            '<title>Community volunteers provide meals to seniors</title>' +
            '<link>https://community.example/story</link>' +
            '<pubDate>Sat, 03 Oct 2026 02:00:00 GMT</pubDate>' +
            '<source>Community News</source>' +
            '</item></channel></rss>',
            { status: 200 }
          );
        }

        return new Response('<rss><channel></channel></rss>', { status: 200 });
      }

      if (url.includes('news.google.com/rss?')) {
        return new Response('<rss><channel></channel></rss>', { status: 200 });
      }

      throw new Error('unexpected URL: ' + url);
    }
  });

  assert.equal(result.provider, 'google-news-rss');
  assert.equal(result.articles.length, 2);
  assert.ok(calls.some(url => new URL(url).searchParams.get('q') === 'student success'));
  assert.ok(calls.some(url => new URL(url).searchParams.get('q') === 'community kindness'));
});

test('falls back from empty Google query to Top Stories', async () => {
  const calls = [];
  const result = await searchFreshNews({
    queries: ['student success'],
    fetchImpl: async url => {
      calls.push(String(url));
      if (String(url).includes('gdeltproject.org')) {
        return new Response('rate limited', { status: 429 });
      }
      if (String(url).includes('/rss/search')) {
        return new Response('<rss><channel></channel></rss>', { status: 200 });
      }
      return new Response('<rss><channel><item><title>Community volunteers create a positive change</title><link>https://example.com/story</link><pubDate>Sat, 03 Oct 2026 03:00:00 GMT</pubDate><source>Example News</source></item></channel></rss>', { status: 200 });
    }
  });
  assert.equal(result.provider, 'google-news-top-stories');
  assert.equal(result.articles.length, 1);
  assert.equal(calls.filter(url => url.includes('/rss')).length, 2);
});

test('parses Google News Top Stories RSS', async () => {
  const xml = '<rss><channel><item><title>Community volunteers create a positive change</title><link>https://example.com/story</link><pubDate>Sat, 03 Oct 2026 03:00:00 GMT</pubDate><source>Example News</source></item></channel></rss>';
  const items = await searchGoogleNewsTopStoriesRss({
    fetchImpl: async () => new Response(xml, { status: 200 })
  });
  assert.equal(items.length, 1);
});

test('classifies human kindness stories directly', () => {
  assert.equal(
    isHeartwarmingHumanStory('Journalist tears up after flood survivor offers her something to eat'),
    true
  );
  assert.equal(
    isHeartwarmingHumanStory('Buffalo Bills win Cannes Corporate Media award'),
    false
  );
});

test('prioritizes simple human kindness stories for A Little Better', () => {
  const selected = selectFreshStory([
    {
      title: 'Journalist tears up after flood survivor offers her something to eat',
      url: 'https://kind.example/story',
      domain: 'Kind News',
      seendate: '20261003030000',
      rank: 4
    },
    {
      title: 'Buffalo Bills win Cannes Corporate Media award',
      url: 'https://sports.example/story',
      domain: 'Sports News',
      seendate: '20261003020000',
      rank: 1
    }
  ], {
    now: new Date('2026-10-03T04:00:00Z')
  });

  assert.equal(selected.title, 'Journalist tears up after flood survivor offers her something to eat');
  assert.equal(selected.topic, 'human-kindness');
});

test('human kindness stories get a warm hook and relatable angle', () => {
  const title = 'Journalist tears up after flood survivor offers her something to eat';
  assert.match(buildNewsHook(title), /act of kindness/i);
  assert.match(buildNewsAngle(title), /hard day feel a little lighter/i);
});

test('does not prioritize achievement-only stories over human kindness', () => {
  const title = 'Buffalo Bills become first NFL team to win Cannes Corporate Media award';
  assert.notEqual(getLittleBetterTopic(title)?.name, 'human-kindness');
});

test('builds a category-aware hook and original angle', () => {
  assert.match(buildNewsHook('Student receives award for science project'), /student/i);
  assert.match(buildNewsHook('New science discovery changes how we see space'), /development/i);
  assert.match(buildNewsAngle('Student receives award for science project'), /achievements/i);
});

test('reference layout keeps text zones isolated across templates', () => {
  for (const template of ['4:5', '1:1', '9:16']) {
    const layout = calculateNewsLayout(template);
    const textZones = [layout.photoCredit, layout.brand, layout.headline, layout.source];

    for (let i = 0; i < textZones.length; i += 1) {
      for (let j = i + 1; j < textZones.length; j += 1) {
        assert.equal(rectanglesOverlap(textZones[i], textZones[j]), false);
      }
    }
  }
});

test('long headlines are fitted inside the strict headline box', () => {
  const layout = calculateNewsLayout('4:5');
  const fit = fitTextToBox(
    'Woman lands on roof after an unexpected fall and calmly calls for help',
    {
      maxWidth: layout.headline.width - layout.headline.padding * 2,
      maxHeight: layout.headline.height - layout.headline.padding * 2,
      maxFontSize: 72,
      minFontSize: 36,
      lineHeight: 1.07,
      maxLines: 5
    }
  );

  assert.ok(fit.fontSize >= 36);
  assert.ok(fit.width <= layout.headline.width - layout.headline.padding * 2);
  assert.ok(fit.height <= layout.headline.height - layout.headline.padding * 2);
});

test('news SVG contains the brand, source, and original angle', () => {
  const svg = buildNewsSvg({
    imageDataBase64: 'dGVzdA==',
    hook: 'A new story is catching attention today.',
    title: 'Student wins national science award',
    sourceDomain: 'example.com',
    angle: 'Small achievements can become big reasons for people to keep going.',
    photoCredit: 'Creator / Openverse / CC0'
  });
  assert.match(svg, /A LITTLE BETTER/);
  assert.match(svg, /Source: example.com/);
  assert.match(svg, /Photo credit:/);
  assert.match(svg, /bottomFade/);
  assert.doesNotMatch(svg, /<image\b/);
  assert.doesNotMatch(svg, /<tspan\b/);
  assert.equal(NEWS_PRIMARY, '#A3D4C0');
  assert.match(svg, /#A3D4C0/);
});

test('production renderer preserves the source photo and readable text layers', async () => {
  const dir = await mkdtemp('/tmp/a-little-better-render-test-');
  const input = await sharp({
    create: {
      width: 20,
      height: 20,
      channels: 3,
      background: { r: 220, g: 90, b: 40 }
    }
  }).png().toBuffer();
  const outputPath = join(dir, 'rendered.png');

  try {
    await renderNewsImage({
      imageBuffer: input,
      title: 'Students Celebrate a New Achievement',
      sourceDomain: 'example.com',
      photoCredit: 'Test Creator / Test Source / CC0',
      outputPath
    });

    const metadata = await sharp(outputPath).metadata();
    assert.equal(metadata.width + 'x' + metadata.height, '1080x1350');

    const upper = await sharp(outputPath)
      .extract({ left: 0, top: 0, width: 1080, height: 600 })
      .stats();
    const upperMean = upper.channels.reduce((sum, channel) => sum + channel.mean, 0) / upper.channels.length;
    assert.ok(upperMean > 10, 'rendered upper photo area should not be effectively black');

    const sample = await sharp(outputPath)
      .extract({ left: 450, top: 300, width: 100, height: 100 })
      .stats();
    const sampleMean = sample.channels.reduce((sum, channel) => sum + channel.mean, 0) / sample.channels.length;
    assert.ok(sampleMean > 20, 'source photo should remain visible in the rendered image');
    const bytes = await readFile(outputPath);
    assert.ok(bytes.length > 5000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects an unrelated article image and accepts the matching article image with deterministic checks', async () => {
  const result = await findSourceArticleImage(
    {
      url: 'https://news.google.com/rss/articles/example',
      domain: 'Example News',
      title: 'Neighbor helps family with groceries'
    },
    {
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('news.google.com')) {
          return { ok: true, status: 200, url: 'https://example.news/story', text: async () => '' };
        }

        if (url === 'https://example.news/story') {
          return new Response(
            '<html><head>' +
            '<meta property="og:image" content="https://cdn.example/football.jpg">' +
            '</head><body>' +
            '<img src="https://cdn.example/family.jpg" alt="A neighbor helps another person">' +
            '</body></html>',
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        }

        if (url.includes('cdn.example/football.jpg') || url.includes('cdn.example/family.jpg')) {
          const raw = Buffer.alloc(700 * 500 * 3);
          for (let y = 0; y < 500; y += 1) {
            for (let x = 0; x < 700; x += 1) {
              const index = (y * 700 + x) * 3;
              raw[index] = (x * 3) % 256;
              raw[index + 1] = (y * 4) % 256;
              raw[index + 2] = (x + y) % 256;
            }
          }
          const image = await sharp(raw, {
            raw: { width: 700, height: 500, channels: 3 }
          }).png().toBuffer();

          return new Response(image, {
            status: 200,
            headers: { 'content-type': 'image/png' }
          });
        }

        return new Response('not found', { status: 404 });
      }
    }
  );

  assert.equal(result.url, 'https://cdn.example/family.jpg');
  assert.equal(result.visualVerification.verified, true);
  assert.equal(result.visualVerification.method, 'deterministic');
  assert.ok(result.visualVerification.storyAlignmentScore >= 50);
});

test('fresh news runner tries the next safe story when the first source image fails', async () => {
  const tempDir = await mkdtemp('/tmp/a-little-better-retry-test-');
  const historyPath = join(tempDir, 'history.json');
  const raw = Buffer.alloc(700 * 500 * 3);
  for (let y = 0; y < 500; y += 1) {
    for (let x = 0; x < 700; x += 1) {
      const index = (y * 700 + x) * 3;
      raw[index] = (x * 3) % 256;
      raw[index + 1] = (y * 4) % 256;
      raw[index + 2] = (x + y) % 256;
    }
  }
  const visual = await sharp(raw, {
    raw: { width: 700, height: 500, channels: 3 }
  }).png().toBuffer();

  try {
    const result = await runNewsPost({
      today: '2099-12-30',
      autoPublish: false,
      historyPath,
      fetchImpl: async input => {
        const url = String(input);

        if (url.includes('gdeltproject.org')) {
          return new Response(JSON.stringify({
            articles: [
              {
                title: 'Neighbor helps family with groceries',
                url: 'https://first.example/story',
                domain: 'First News',
                seendate: '20991230030000',
                rank: 1
              },
              {
                title: 'Community volunteers provide meals to seniors',
                url: 'https://second.example/story',
                domain: 'Second News',
                seendate: '20991230020000',
                rank: 2
              }
            ]
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }

        if (url === 'https://first.example/story') {
          return new Response(
            '<html><head><meta property="og:image" content="https://cdn.example/first.png"></head></html>',
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        }

        if (url === 'https://second.example/story') {
          return new Response(
            '<html><head>' +
            '<title>Community volunteers provide meals to seniors</title>' +
            '<meta property="og:image" content="https://cdn.example/second.png">' +
            '</head><body>' +
            '<img src="https://cdn.example/second.png" alt="Community volunteers provide meals to seniors">' +
            '</body></html>',
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        }

        if (url === 'https://cdn.example/first.png' || url === 'https://cdn.example/second.png') {
          return new Response(visual, {
            status: 200,
            headers: { 'content-type': 'image/png' }
          });
        }

        return new Response('not found', { status: 404 });
      }
    });

    assert.equal(result.published, false);
    assert.equal(result.title, 'Community volunteers provide meals to seniors');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    await rm(join('artifacts', 'fresh-news-2099-12-30.png'), { force: true }).catch(() => {});
    await rm(join('artifacts', 'fresh-news-2099-12-30.json'), { force: true }).catch(() => {});
    await rm(join('artifacts', 'fresh-news-status.json'), { force: true }).catch(() => {});
  }
});

test('fresh news runner stores deterministic source and final visual verification results', async () => {
  const tempDir = await mkdtemp('/tmp/a-little-better-phase4-');
  const historyPath = join(tempDir, 'history.json');
  const outputDate = '2099-12-31';
  const raw = Buffer.alloc(700 * 500 * 3);
  for (let y = 0; y < 500; y += 1) {
    for (let x = 0; x < 700; x += 1) {
      const index = (y * 700 + x) * 3;
      raw[index] = (x * 3) % 256;
      raw[index + 1] = (y * 4) % 256;
      raw[index + 2] = (x + y) % 256;
    }
  }
  const visual = await sharp(raw, {
    raw: { width: 700, height: 500, channels: 3 }
  }).png().toBuffer();

  let storyUrlCalls = 0;

  try {
    const result = await runNewsPost({
      today: outputDate,
      autoPublish: false,
      historyPath,
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('gdeltproject.org')) {
          return new Response(JSON.stringify({
            articles: [{
              title: 'Neighbor helps family with groceries',
              url: 'https://example.news/story',
              domain: 'Example News',
              seendate: '20991231030000'
            }]
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === 'https://example.news/story') {
          storyUrlCalls += 1;
          if (storyUrlCalls === 1) {
            return { ok: true, status: 200, url, text: async () => '' };
          }
          return new Response(
            '<html><head><meta property="og:image" content="https://cdn.example/family.png"></head><body>' +
            '<img src="https://cdn.example/family.png" alt="A neighbor helps a family with groceries"></body></html>',
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        }

        if (url.includes('cdn.example')) {
          return new Response(visual, {
            status: 200,
            headers: { 'content-type': 'image/png' }
          });
        }

        return new Response(
          '<html><head><meta property="og:image" content="https://cdn.example/family.png"></head></html>',
          { status: 200, headers: { 'content-type': 'text/html' } }
        );
      }
    });

    const history = JSON.parse(await readFile(historyPath, 'utf8'));
    assert.equal(result.published, false);
    assert.equal(history.stories.at(-1).visualVerification.source.method, 'deterministic');
    assert.equal(history.stories.at(-1).visualVerification.graphic.method, 'deterministic');
    assert.equal(history.stories.at(-1).visualVerification.source.verified, true);
    assert.equal(history.stories.at(-1).visualVerification.graphic.verified, true);
    assert.ok(history.stories.at(-1).visualVerification.graphic.readabilityScore >= 75);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    await rm(join('artifacts', `fresh-news-${outputDate}.png`), { force: true }).catch(() => {});
    await rm(join('artifacts', `fresh-news-${outputDate}.json`), { force: true }).catch(() => {});
    await rm(join('artifacts', 'fresh-news-status.json'), { force: true }).catch(() => {});
  }
});

test('Fresh News feature-branch preview runs safely without publishing or recording history', async () => {
  const workflow = await readFile(
    '.github/workflows/a-little-better-fresh-news.yml',
    'utf8'
  );

  assert.match(workflow, /push:\s*\n\s*branches:\s*\n\s*- feat\/phase-4-story-visual-accuracy/);
  assert.match(workflow, /NEWS_AUTO_PUBLISH:.*\|\| 'false'/);
  assert.match(workflow, /- name: Record fresh news history\s+if:\s*\$\{\{ success\(\) && github\.event_name != 'push' \}\}/);
});

test('Fresh News workflow uses the free deterministic visual gate and runs three times weekly', async () => {
  const workflow = await readFile(
    '.github/workflows/a-little-better-fresh-news.yml',
    'utf8'
  );

  assert.doesNotMatch(workflow, /OPENAI_API_KEY/);
  assert.doesNotMatch(workflow, /OPENAI_VISION_MODEL/);
  assert.doesNotMatch(workflow, /Resolve visual verification mode/);
  assert.match(workflow, /cron: "0 11 \* \* 2,4,6"/);
  assert.match(workflow, /Generate fresh news post/);
});

test('news post runner is importable', () => {
  assert.equal(typeof runNewsPost, 'function');
});
