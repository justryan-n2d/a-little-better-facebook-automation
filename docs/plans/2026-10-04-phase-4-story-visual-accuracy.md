# Phase 4: Story + Visual Accuracy

> Final architecture for the Fresh News pipeline. This phase intentionally uses no paid AI API.

## Goal

Prevent A Little Better from publishing a misleading news post by checking the article image, story-image context, rendered graphic, and layout before publication.

## Final architecture

```
Find story
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

## Implementation

### 1. Story discovery

- GDELT remains the primary provider.
- Google News RSS remains the fallback.
- Google News Top Stories remains the secondary fallback.
- Existing positive-content and unsafe-content filters remain active.
- Human-kindness stories keep priority.

### 2. Original article and image extraction

The source-image gate:
- resolves the original article URL;
- extracts Open Graph, Twitter, article-image, and JSON-LD image candidates;
- ranks candidates using story terms, candidate metadata, URL terms, and image type;
- downloads candidates directly from the article;
- never substitutes an unrelated stock image when the story requires a specific article photo.

### 3. Free image quality checks

`src/visual-verify.js` uses Sharp to inspect:
- decoded image validity;
- dimensions and total pixels;
- visible variation;
- contrast/standard deviation;
- entropy;
- generic artwork/graphic indicators;
- unsafe visual-context terms.

Very small, effectively blank, generic, or unsafe candidates are rejected.

### 4. Story ↔ image context score

The verifier compares the story title with:
- article image context such as alt text, title, captions, and tags;
- candidate image URL;
- candidate type.

The score uses:
- exact meaningful-token matches;
- shared context groups for people/helping/food/education/science/achievement/hope/environment;
- stronger weight for specific matches;
- hard rejection for generic artwork/graphics.

This is an evidence-based metadata/context check. It does not claim to literally see or understand the pixels like a vision model.

### 5. Final A LITTLE BETTER graphic

The existing Sharp raster-first renderer remains the production renderer:
- full-bleed source photo;
- circular inset from the same source photo;
- A LITTLE BETTER branding;
- headline;
- source and photo credit;
- 4:5 primary format at 1080 × 1350.

The same source photo is used throughout the graphic.

### 6. Free visual/layout QA

Before the post is accepted:
- rendered dimensions must match the selected template;
- rendered image must have visible variation and acceptable quality;
- text zones must not collide;
- headline must fit the allocated box;
- headline/story context must stay aligned;
- readability score must meet the threshold.

The post runner stops before history/publication when this gate fails.

### 7. Production schedule

Fresh News is scheduled three times per week:
- Tuesday 11:00 AM Asia/Manila
- Thursday 11:00 AM Asia/Manila
- Saturday 11:00 AM Asia/Manila

Manual workflow dispatch remains available.

### 8. Audit trail

The news history stores:
- source image metadata;
- source verification result;
- final graphic verification result.

History remains bounded.

## Phase 4 status

- [x] Original article resolution
- [x] Article-declared image extraction
- [x] Same-source image requirement
- [x] Same-context image matching
- [x] Reject unrelated artwork/graphics
- [ ] Support more publisher-specific article formats
- [x] Deterministic semantic story-image matching
- [x] Automatic image relevance score
- [x] Automatic final visual/layout QA before upload/publish

## Design policy

The system should fail safely.

No post is better than a post that:
- pairs a story with the wrong image;
- uses generic artwork for a specific real-world event;
- has an unreadable headline;
- has broken layout;
- weakens trust in A Little Better.

OpenAI is not part of the production dependency for Phase 4. A future optional AI layer could be added later, but the page must remain fully functional without paid AI access.