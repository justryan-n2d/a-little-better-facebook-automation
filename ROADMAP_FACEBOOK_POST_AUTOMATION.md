# 🌱 A Little Better Facebook Post Automation Roadmap

This document records the design, implementation history, lessons learned, and next steps for the **A Little Better** Facebook post automation system.

## 1. Product goal

**Page:** 🌱 A LITTLE BETTER

Content identity:
- encouragement
- kindness
- love and compassion
- hope
- positive progress
- real-world stories showing people helping people
- "the world is healing" style news

The automation should make every post feel like it belongs to A Little Better, not like a generic news page.

### Core content principle

> **One story → one source → one context → one matching visual**

The headline and image must clearly refer to the same story.

---

## 2. Current architecture

The production story pipeline is now:

```
Find story
   ↓
Agent-Reach Story Scout
   ↓
Candidate ranking
   ↓
Resolve original article
   ↓
Extract article-declared images
   ↓
Free image quality checks
   ↓
Story ↔ image context score
   ↓
Reject if weak
   ↓
Create A LITTLE BETTER graphic
   ↓
Free visual/layout QA
   ↓
Publish only if passed
```

Agent-Reach Web Search is the discovery eyes. It finds candidate stories but does not decide that a story is safe to publish and has no publishing authority.

The existing GDELT + Google News RSS + Top Stories path remains as the free fallback when the Story Scout has no usable candidate or the Agent-Reach search path is unavailable.

## 3. News discovery

### Primary discovery

- Agent-Reach Web Search
- Exa Web Search through the free hosted MCP endpoint
- Four diverse semantic search queries
- Eight results per query
- No EXA_API_KEY
- No paid search API

The workflow installs the pinned MCPORTER client and the Story Scout calls the free hosted Exa MCP endpoint directly. No credentials are stored in the repository.

### Free fallbacks

- GDELT
- Google News RSS
- Google News Top Stories RSS

The fallback path is preserved so a temporary Agent-Reach or Exa availability problem does not become a publishing dependency.

## 4. Story selection

Earlier versions focused on general positive categories such as:
- awards
- student achievements
- sports milestones
- science breakthroughs
- community progress

Those remain possible topics, but testing showed that the strongest match for the page is **simple, relatable human kindness**.

### Preferred stories

Examples:
- strangers helping strangers
- someone sharing food
- someone comforting another person
- someone helping a child, family, senior, neighbor, or survivor
- a journalist reacting emotionally to an act of kindness
- small acts of generosity with a clear emotional result

### Preferred structure

**Person → situation → act of kindness → emotional/result**

This lets a Facebook user understand the story quickly while scrolling.

---

## 5. Content safety

The selector blocks or avoids:
- graphic violence
- murder
- sexual assault
- terrorism
- war
- serious crime
- political campaigns
- elections
- partisan political content
- protests and riots
- scandals
- controversial disputes

A positive keyword should not override a negative main story.

---

## 6. Headline design

The graphic headline must be:
- complete
- clear
- emotionally understandable
- short enough for the graphic
- faithful to the source

### Never

Do not produce incomplete text such as:
- "...to turn..."
- "...because..."

Long source headlines are converted into complete display headlines without changing the underlying story.

---

## 7. Visual design

### Supported formats

- 4:5 → 1080 × 1350
- 1:1 → 1080 × 1080
- 9:16 → 1080 × 1920

Primary Facebook news format: **4:5**

### Layout

```
┌─────────────────────────────┐
│ Photo credit                │
│                             │
│ Circular source-photo inset │
│                             │
│        News photo           │
│                             │
│      A LITTLE BETTER        │
│          branding           │
│                             │
│        Headline             │
│                             │
│          Source             │
└─────────────────────────────┘
```

---

## 8. Image rendering

The renderer was rebuilt around a **Sharp raster-first pipeline** after earlier SVG/ImageMagick approaches produced black backgrounds and overlapping text.

Current flow:
1. decode source photo
2. prepare full-bleed background
3. create the circular inset from the same source photo
4. composite the photo layers
5. add fade layers
6. add branding
7. add headline
8. add source and credit
9. validate dimensions and visible image content
10. save the PNG

The renderer rejects effectively black results instead of silently creating a broken post.

---

## 9. Same-source / same-context rule

This became a major requirement after bad previews showed:
- a student story paired with an unrelated historical painting
- an NFL kindness story paired with a patriotic mask graphic
- volunteer stories paired with generic unrelated images

### Required behavior

The automation should:
1. resolve the original news article
2. inspect images declared by that article
3. consider Open Graph, Twitter image, article image tags, and JSON-LD image data
4. compare candidate image context with the story
5. reject generic/unrelated graphics
6. use the matching article image for both the background and circular inset
7. fail rather than create a misleading post when no suitable image exists

**Same publisher is not enough.**

The image must also match the story.

---

## 10. Branding

Brand:
**🌱 A LITTLE BETTER**

Rules:
- visible
- relatively small
- horizontally centered
- consistent position
- does not cover important photo content
- primary brand color: **#A3D4C0**

The branding should act like a signature, not the main subject.

---

## 11. Readability and layout protection

Separate layout zones exist for:
- photo credit
- circular image
- branding
- headline
- source

The code checks for zone collisions and fits headlines inside a strict bounding box.

This was added after failures involving:
- stacked letters
- overlapping lines
- unreadable source text
- branding collisions

### Product rule

> **CI validates the code. Visual inspection validates the product.**

Both are required.

---

## 12. Facebook publishing

The publishing layer uses the **Meta Graph API**.

Fresh News supports:
- draft generation
- optional publishing
- source/history recording

Manual dispatch defaults to:

**auto_publish = false**

This allows the generated graphic to be reviewed before public posting.

---

## 13. Automation schedule

Current Fresh News schedule:

**11:00 AM Asia/Manila every day**

The workflow can also be manually triggered through GitHub Actions.

---

## 14. History and retention

Fresh News history is stored in:

`data/news-history.json`

It helps:
- avoid duplicate stories
- track used content
- support audits
- support future performance analysis

History is bounded so the repository does not grow without limit.

---

## 15. Growth and engagement direction

The content system should focus on **meaningful reactions**, not just publishing frequency.

Preferred posts have:
- immediate emotional context
- relatable human situations
- visible kindness
- reasons to share or tag someone
- captions that encourage natural conversation

A user should understand the basic story even when seeing only the image in the Facebook feed.

---

# 16. Roadmap by phase

## Phase 1 — Foundation ✅

- [x] GitHub Actions automation
- [x] Daily Facebook posting workflow
- [x] Meta Graph API publishing
- [x] Content history
- [x] Draft mode
- [x] Automated tests

## Phase 2 — Fresh News ✅

- [x] Agent-Reach semantic Web Search discovery
- [x] Agent-Reach Story Scout candidate pool
- [x] Candidate ranking
- [x] Candidate deduplication across search queries
- [x] GDELT fallback
- [x] Google News RSS fallback
- [x] Top Stories fallback
- [x] Recent-story scoring
- [x] Positive-content filtering
- [x] Unsafe/divisive content blocking
- [x] Free-only search configuration with no EXA_API_KEY

### Agent-Reach Story Scout

The Story Scout searches for recent, heartwarming, relatable stories using semantic discovery instead of relying only on exact keywords.

The Scout ranks candidates using:
- A Little Better topic fit
- human-kindness strength
- positive and human-context signals
- freshness
- query diversity
- headline quality
- a small boost for public social-source candidates

The Scout score is recorded in Fresh News metadata for later analysis.

If no eligible Agent-Reach result survives ranking, the system falls back to the existing free news providers.

### Public Social Story Discovery ✅ on the development branch

The first Agent-Reach discovery query is now a public-web social discovery query covering:
- X / Twitter
- Instagram
- Facebook
- TikTok
- YouTube
- Reddit
- Threads

The query uses public search indexing with `site:` filters. It does not require social-media logins, browser sessions, cookies, or paid APIs.

Each returned candidate is classified with:
- `sourceType: public-social`
- `socialPlatform`

This means a story such as a dog protecting a baby can be recognized as a high-fit A Little Better human-kindness story even when the discovery lead comes from TikTok, Instagram, X, Facebook, or another public social page.

The production Fresh News workflow explicitly limits the default Agent-Reach search to one query per run to protect the free MCP request budget.

### Public social media rights boundary ✅

Public discovery is a **story lead**, not a blanket license to reuse the post or its media.

The automation must not assume that a public social photo or video is reusable.

For a public social lead, the production path now:
1. excludes the social platform URL from visual reuse
2. searches for an independent non-social corroborating source
3. rejects the lead when strong corroboration is not found
4. resolves a reusable visual through Openverse only
5. accepts only CC0, PDM, or CC BY image licenses
6. downloads the visual through the existing image validation guard
7. records the rights basis and marks the visual as illustrative
8. labels the photo credit as **Illustrative photo** so the audience is not misled into thinking it is the exact event image

The current social-media path therefore favors **verified story + rights-safe illustrative visual** over copying a public social-media image.


## Phase 3 — Visual System ✅

- [x] 1080 × 1350 graphics
- [x] Full-bleed photo background
- [x] Circular photo inset
- [x] Bottom fade
- [x] Branding lockup
- [x] Source line
- [x] Photo credit
- [x] Headline fitting
- [x] Collision checks
- [x] Sharp raster rendering

## Phase 4 — Story + Visual Accuracy 🚧

- [x] Original article resolution
- [x] Article-declared image extraction
- [x] Same-source image requirement
- [x] Same-context image matching
- [x] Reject unrelated artwork/graphics
- [x] Public social lead detection
- [x] Independent corroboration for public social leads
- [x] Social-media URL excluded from visual reuse
- [x] Rights-safe Openverse visual resolution
- [x] CC0 / PDM / CC BY license gate
- [x] Illustrative-photo transparency label
- [ ] Support more publisher-specific article formats
- [ ] Stronger semantic image/story matching
- [ ] Automatic visual relevance score
- [ ] Automatic visual QA before artifact upload

## Phase 5 — A Little Better Content Identity 🚧

- [x] Human-kindness category
- [x] Human-centered story priority
- [x] Warm hooks
- [x] Relatable story angles
- [ ] Stronger emotional-quality scoring
- [ ] Better story diversity
- [ ] Reduce repetitive story patterns
- [ ] Detect overly promotional stories
- [ ] Detect viral-bait headlines
- [ ] Improve caption naturalness

## Phase 6 — Visual Quality 🚧

- [x] Raster-first rendering
- [x] Source-photo preservation check
- [x] Headline layout protection
- [x] Centered branding
- [ ] Automatic contrast check
- [ ] Automatic text readability check
- [ ] Better photo crop/focal-point selection
- [ ] Stronger source/credit text fitting
- [ ] Automated preview image inspection

## Phase 7 — Reliability 🚧

- [x] GDELT fallback
- [x] Google News fallback
- [x] Image download fallback
- [x] Workflow tests
- [x] Workflow watchdog
- [ ] Automatic recovery after failed Fresh News runs
- [ ] Provider outage monitoring
- [ ] Better error classification
- [ ] Detailed failure alerts
- [ ] Low-content/history capacity alerts

## Phase 8 — Analytics and learning 🚧

- [x] Facebook growth analytics workflow
- [x] Post-performance collection
- [x] Weekly growth reporting
- [ ] Connect performance to story type
- [ ] Measure reactions by story format
- [ ] Measure shares/comments by story type
- [ ] Measure follower growth by content type
- [ ] Feed useful performance signals back into story selection

---

# 17. Public publishing quality gate

### Story
- [ ] real
- [ ] recent enough
- [ ] positive and suitable for A Little Better
- [ ] human and relatable when a suitable story exists
- [ ] credible original source

### Headline
- [ ] complete
- [ ] clear
- [ ] short
- [ ] faithful to the story
- [ ] no ellipsis truncation

### Image
- [ ] from the original article when possible
- [ ] same story
- [ ] same context
- [ ] same people/event/object
- [ ] no unrelated artwork
- [ ] no generic substitute

### Graphic
- [ ] background visible
- [ ] circle image visible
- [ ] fade working
- [ ] branding centered
- [ ] headline readable
- [ ] source readable
- [ ] credit readable
- [ ] no overlap

### Publishing
- [ ] preview checked
- [ ] source recorded
- [ ] history updated
- [ ] no accidental duplicate

---

# 18. Long-term design principle

The automation should **fail safely**.

Publishing no post is preferable to publishing a post that:
- uses an unrelated image
- misrepresents the story
- has unreadable text
- looks broken
- confuses the audience
- reduces trust in A Little Better

The target is not:

> **"Post every day no matter what."**

The target is:

> **"Publish one genuinely good A Little Better story when the system can verify that it is good."**

---


## 19. Agent-Reach Story Scout implementation

### Implemented on feature branch

- [x] Added src/story-scout.js
- [x] Added focused Story Scout unit tests
- [x] Added four semantic recent-news queries
- [x] Added mcporter Exa MCP search invocation
- [x] Added robust mcporter JSON result parsing
- [x] Added candidate deduplication
- [x] Added candidate ranking and scoutScore
- [x] Reused the existing A Little Better topic and human-kindness filters
- [x] Added fallback to the existing free news providers
- [x] Wired Fresh News generation through the Story Scout
- [x] Configured the free Exa MCP endpoint in GitHub Actions
- [x] Configured the pinned MCPORTER client for scheduled GitHub Actions execution
- [x] Prevented EXA_API_KEY from being forwarded by Story Scout
- [x] Kept the Facebook publishing layer unchanged
- [x] Corroborated public social story leads before publishing
- [x] Resolved rights-safe Openverse visuals for public social leads
- [x] Recorded discovery lead, corroboration, and visual rights metadata
- [x] Prevented direct social-media media reuse

### Free-only policy

Agent-Reach Web Search must use the free MCP route only. The production workflow must not require an Exa API key, paid Exa API access, or a paid proxy for this Story Scout feature.

If the free search path is unavailable, the system uses the existing GDELT / Google News fallbacks instead of switching to a paid service automatically.

## Current status

**Repository:** `justryan-n2d/a-little-better-facebook-automation`

**Production branch:** `main`

**Active development branch:** `feat/agent-reach-story-scout`

The Agent-Reach Story Scout implementation is currently isolated on the development branch and has **not** been merged into `main`.

Verified on GitHub Actions:
- live connection to `https://mcp.exa.ai/mcp`
- `web_search_exa` returned a real recent news result
- no `EXA_API_KEY` was used
- Story Scout unit tests: 100/100 passed
- production publisher dry-run: passed
- workflow YAML validation: passed

The system currently includes:
- daily Fresh News automation
- human-kindness story prioritization
- Agent-Reach semantic story discovery
- same-source / same-context visual rules
- Sharp-based image rendering
- layout collision protection
- automated testing
- workflow watchdog
- growth analytics
- content/history tracking

### Real draft verification ✅

A real Fresh News draft was generated on the development branch using the live Agent-Reach Web Search path with Facebook publishing explicitly disabled.

Verified:
- Agent-Reach returned real recent news stories
- Story Scout selected a human-kindness story
- original KCTV5 article was resolved
- article-declared `og:image` was used
- story and image matched the same event
- display headline was shortened for feed readability
- hook and angle reflected the story context
- final graphic rendered at 1080 × 1350
- branding, source, credit, fade, and headline were visually inspected
- history and metadata were recorded
- `published: false` and no Facebook post ID was created

The test also exposed and fixed:
- free MCP rate-limit handling
- Agent-Reach MCP text-response parsing
- story-context loss during candidate selection
- title-only topic filtering
- overly long display headlines

The one-time draft preview workflow and debug logging were removed after verification.

### Next focus

The next major focus is automated **visual relevance and visual QA** before artifact upload.

For public social story leads, corroboration and rights-safe visual resolution are now implemented. The next safety-focused step is stronger semantic verification and visual relevance scoring so the selected illustrative image better matches the people, animal, object, or situation described in the verified story.

After that, continue with stronger emotional-quality scoring, story diversity, caption naturalness, and viral-bait detection.

Do not merge to `main` or publish to Facebook until the feature branch is reviewed.
