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
  findRightsSafeStoryImage,
  findSourceArticleImage,
  downloadImage,
  isPhotoLikeOpenverseImage,
  isSafeNewsCandidate,
  isLittleBetterTopic,
  getLittleBetterTopic,
  isHeartwarmingHumanStory,
  buildPhotoCredit,
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

test('accepts the original article Open Graph image when context text is unavailable', async () => {
  const result = await findSourceArticleImage(
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
          return new Response(Buffer.alloc(12000, 9), {
            status: 200,
            headers: { 'content-type': 'image/jpeg' }
          });
        }

        return new Response('not found', { status: 404 });
      }
    }
  );

  assert.equal(result.url, 'https://cdn.baynews9.com/images/example-story.jpg');
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
            '<img src="https://media.example-cdn.test/josh-allen-kids.jpg" alt="Josh Allen reacts to children hospital patients MVP message">' +
            '</body></html>',
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        }

        if (url === 'https://media.example-cdn.test/josh-allen-kids.jpg') {
          return new Response(Buffer.alloc(12000, 9), {
            status: 200,
            headers: { 'content-type': 'image/jpeg' }
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

test('news post runner is importable', () => {
  assert.equal(typeof runNewsPost, 'function');
});


test('resolves a rights-safe illustrative visual for a public social story', async () => {
  const result = await findRightsSafeStoryImage({
    title: 'Dog stays beside baby and helps keep child safe',
    snippet: 'The family says their dog protected the baby and alerted them when the child needed help.',
    topic: 'human-kindness'
  }, {
    fetchImpl: async input => {
      const url = String(input);
      if (url.includes('api.openverse.org')) {
        return new Response(JSON.stringify({
          results: [{
            url: 'https://images.example/dog-baby.jpg',
            title: 'Dog with baby and family',
            description: 'A dog staying close to a baby with family nearby.',
            creator: 'Example Photographer',
            provider: 'Example Commons',
            license: 'cc0',
            width: 1600,
            height: 1067
          }]
        }), { status: 200 });
      }
      if (url === 'https://images.example/dog-baby.jpg') {
        return new Response(Buffer.alloc(12000, 9), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' }
        });
      }
      throw new Error('unexpected URL: ' + url);
    }
  });

  assert.equal(result.license, 'cc0');
  assert.equal(result.provider, 'Example Commons');
  assert.equal(result.rightsSafe, true);
  assert.equal(result.visualRelation, 'illustrative');
  assert.ok(result.landingUrl);
});

test('rejects rights-unsafe social media media instead of accepting it as the visual source', async () => {
  await assert.rejects(
    findRightsSafeStoryImage({
      title: 'Dog stays beside baby and helps keep child safe',
      snippet: 'A family dog helped keep the baby safe.',
      topic: 'human-kindness',
      url: 'https://www.tiktok.com/@example/video/123',
      sourceType: 'public-social'
    }, {
      fetchImpl: async input => {
        const url = String(input);
        if (url.includes('api.openverse.org')) {
          return new Response(JSON.stringify({ results: [] }), { status: 200 });
        }
        throw new Error('unexpected URL: ' + url);
      }
    }),
    /No rights-safe visual source could be resolved/i
  );
});


test('social story publishing path corroborates the lead and uses only the rights-safe visual', async () => {
  const dir = await mkdtemp('/tmp/a-little-better-social-story-test-');
  const historyPath = join(dir, 'history.json');
  const width = 400;
  const height = 400;
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 3;
      pixels[index] = (x * 17 + y * 11) % 256;
      pixels[index + 1] = (x * 7 + y * 19) % 256;
      pixels[index + 2] = (x * 23 + y * 5) % 256;
    }
  }
  const imageBuffer = await sharp(pixels, {
    raw: { width, height, channels: 3 }
  }).jpeg({ quality: 90 }).toBuffer();

  let searchCall = 0;
  const socialLead = [
    'Title: Dog stays beside baby and helps keep child safe',
    'URL: https://www.tiktok.com/@example/video/123',
    'Published: 2026-10-04T03:00:00Z',
    'Author: Example Creator',
    'Highlights:',
    'The family says their dog protected the baby and alerted them when the child needed help.'
  ].join('\n');

  const corroboratingArticle = [
    'Title: Family dog protects baby and alerts parents when child needs help',
    'URL: https://localnews.example/dog-baby-story',
    'Published: 2026-10-04T03:30:00Z',
    'Author: Example Reporter',
    'Highlights:',
    'A local news report says the family dog stayed close to the baby and alerted the parents when the child needed help.'
  ].join('\n');

  try {
    const result = await runNewsPost({
      today: '2026-10-04',
      autoPublish: false,
      historyPath,
      execFileImpl: async (_command, args) => {
        searchCall += 1;
        const query = JSON.parse(args[args.indexOf('--args') + 1]).query;
        if (searchCall === 1) {
          assert.match(query, /site:tiktok\.com/i);
          return { stdout: JSON.stringify({ content: [{ type: 'text', text: socialLead }] }), stderr: '' };
        }
        assert.match(query, /-site:tiktok\.com/i);
        return { stdout: JSON.stringify({ content: [{ type: 'text', text: corroboratingArticle }] }), stderr: '' };
      },
      fetchImpl: async input => {
        const url = String(input);
        if (url.includes('api.openverse.org')) {
          return new Response(JSON.stringify({
            results: [{
              url: 'https://images.example/right-safe-dog.jpg',
              title: 'Dog with baby and family',
              description: 'A dog staying close to a baby with family nearby.',
              creator: 'Example Photographer',
              provider: 'Example Commons',
              license: 'cc0',
              width: 1600,
              height: 1067
            }]
          }), { status: 200 });
        }
        if (url === 'https://images.example/right-safe-dog.jpg') {
          return new Response(imageBuffer, {
            status: 200,
            headers: { 'content-type': 'image/jpeg' }
          });
        }
        throw new Error('Social source must never be fetched for image reuse: ' + url);
      }
    });

    const history = JSON.parse(await readFile(historyPath, 'utf8'));
    assert.equal(searchCall, 2);
    assert.equal(result.sourceDomain, 'localnews.example');
    assert.equal(result.imageLicense, 'cc0');
    assert.equal(history.stories[0].discoveryLead.url, 'https://www.tiktok.com/@example/video/123');
    assert.equal(history.stories[0].corroboration.verified, true);
    assert.equal(history.stories[0].url, 'https://localnews.example/dog-baby-story');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});


test('labels rights-safe illustrative visuals as illustrative', () => {
  const credit = buildPhotoCredit({
    license: 'cc0',
    creator: 'Example Photographer',
    provider: 'Example Commons',
    visualRelation: 'illustrative'
  });

  assert.match(credit, /^Illustrative photo \/ Example Photographer \/ Example Commons \/ CC0$/);
});
