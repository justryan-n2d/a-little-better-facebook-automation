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

```
News discovery
   ↓
Safe / positive story filtering
   ↓
Heartwarming human-story priority
   ↓
Original article resolution
   ↓
Original article image extraction
   ↓
Same-story / same-context image validation
   ↓
Sharp image rendering
   ↓
Headline + branding + source overlay
   ↓
Draft artifact
   ↓
Optional Facebook publishing
   ↓
History recording
```

---

## 3. News discovery

### Providers

**Primary**
- GDELT

**Fallback**
- Google News RSS

**Secondary fallback**
- Google News Top Stories RSS

GDELT rate limiting was encountered during testing, so the fallback path is an important part of reliability.

---

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

- [x] GDELT discovery
- [x] Google News RSS fallback
- [x] Top Stories fallback
- [x] Recent-story filtering
- [x] Positive-content filtering
- [x] Unsafe/divisive content blocking

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

## Current status

**Repository:** `justryan-n2d/a-little-better-facebook-automation`

**Live branch:** `main`

The system currently includes:
- daily Fresh News automation
- human-kindness story prioritization
- same-source / same-context visual rules
- Sharp-based image rendering
- layout collision protection
- automated testing
- workflow watchdog
- growth analytics
- content/history tracking

The next major focus is making the **story, image, headline, and caption feel like one naturally connected, heartwarming Facebook post**.
