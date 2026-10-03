# Phase 4: Story + Visual Accuracy Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add true image/story semantic verification and final visual QA so Fresh News can reject a visually misleading post before artifact upload.

**Architecture:** Keep the existing deterministic article-image extraction and keyword scoring as the first filter. Add `src/visual-verify.js` as an isolated vision service using the OpenAI Responses API with image input, with `required`, `optional`, and `metadata` modes. The source-image selector will verify downloaded candidate photos, and the post runner will verify the rendered Facebook graphic before it can be uploaded or published.

**Tech Stack:** Node.js 20+, native fetch, Sharp 0.34.x, GitHub Actions, OpenAI Responses API.

## Global Constraints

- Preserve the existing one-story → one-source → one-context → one-matching-visual rule.
- Reject generic artwork, graphics, logos, screenshots, or visually unrelated images.
- Fail safely in `required` mode rather than publishing an unverified or rejected image.
- Keep the workflow usable without an AI secret by falling back to the existing metadata-only checks in `metadata` mode.
- Do not add an SDK dependency; use the existing Node 20 fetch runtime and Sharp.
- Record verification results in the news history/metadata so decisions are auditable.
- Keep visual verification separate from Facebook publishing.

---

### Task 1: Vision semantic verifier

**Files:**
- Create: `src/visual-verify.js`
- Test: `test/visual-verify.test.js`

**Interfaces:**
- Consumes: image Buffer, story title, source domain, candidate context, display headline, verification mode, API key, model, fetch implementation.
- Produces: normalized verification result with method, status, scores, detected subjects/context, rejection reason, and optional API error.

- [ ] **Step 1: Add the focused failing test**

Create tests that assert:
1. A mocked Responses API result with `approved: true`, high story alignment, readable graphic, and `generic_graphic: false` returns `verified: true`.
2. A mocked result with low story alignment returns `verified: false` even when the model says `approved: true`.
3. `required` mode without an API key rejects before any network request.
4. `metadata` mode performs no vision request and returns `method: "metadata-only"`.

- [ ] **Step 2: Verify the relevant failure**

Run: `node --test test/visual-verify.test.js`
Expected: the test file fails because `../src/visual-verify.js` and its exported verifier do not yet exist.

- [ ] **Step 3: Implement the minimum behavior**

Implement image preparation with Sharp (rotate, fit inside 1280px, JPEG quality 80), send a Responses API request containing `input_text` plus `input_image`, request conservative JSON fields, parse the response, and enforce local thresholds:
- source image story alignment >= 70/100 and not generic;
- final graphic story alignment >= 65/100, readability >= 75/100, and not generic;
- any explicit unsafe flag rejects;
- `required` mode throws for missing key or API failure;
- `optional` mode uses vision when a key is present and otherwise reports metadata-only;
- `metadata` mode never calls the API.

- [ ] **Step 4: Verify the focused pass**

Run: `node --test test/visual-verify.test.js`
Expected: all focused verifier tests pass.

- [ ] **Step 5: Run the affected integration check**

Run: `node --test test/visual-verify.test.js test/news.test.js`
Expected: all existing news/image tests plus the new verifier tests pass.

- [ ] **Step 6: Commit the passing deliverable**

```bash
git add src/visual-verify.js test/visual-verify.test.js
git commit -m "feat: add vision-based story image verifier"
```

### Task 2: Gate source images and rendered graphics

**Files:**
- Modify: `src/news.js`
- Modify: `src/news-post.js`
- Test: `test/news.test.js`

**Interfaces:**
- Consumes: `findSourceArticleImage(story, { fetchImpl, visualVerificationMode, openaiApiKey, openaiVisionModel })` and `runNewsPost({ visualVerificationMode, openaiApiKey, openaiVisionModel })`.
- Produces: source-image metadata with `visualVerification`, plus a post record with source and final-graphic verification results.

- [ ] **Step 1: Add the focused failing test**

Extend source-image tests so two article photos have good metadata, but the vision mock rejects the first and approves the second. Assert the second photo is returned and its verification says `verified: true`.

Add a runner integration test that returns a mocked article/image and two successful vision decisions, then asserts the saved history contains `visualVerification.source` and `visualVerification.graphic`.

- [ ] **Step 2: Verify the relevant failure**

Run: `node --test test/news.test.js`
Expected: the new tests fail because source selection and the post runner do not yet invoke the vision verifier or record its results.

- [ ] **Step 3: Implement the minimum behavior**

Update `findSourceArticleImage` to download each ranked candidate, invoke the verifier, reject vision-failed candidates, and return the first verified candidate in required mode. Preserve metadata-only acceptance when the workflow is not configured for vision.

Update `runNewsPost` to verify the rendered PNG before writing artifact metadata/history. In required mode, abort before artifact/history write when final visual QA rejects the graphic. Store source and final verification summaries in the record.

- [ ] **Step 4: Verify the focused pass**

Run: `node --test test/news.test.js`
Expected: all news tests pass.

- [ ] **Step 5: Run the affected integration check**

Run: `npm test`
Expected: the complete Node test suite passes.

- [ ] **Step 6: Commit the passing deliverable**

```bash
git add src/news.js src/news-post.js test/news.test.js
git commit -m "feat: gate fresh news images with visual QA"
```

### Task 3: Activate vision verification safely in GitHub Actions

**Files:**
- Modify: `.github/workflows/a-little-better-fresh-news.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: optional `OPENAI_API_KEY` repository secret and the existing Fresh News runner.
- Produces: automatic mode selection: `required` when the secret exists, otherwise `metadata`, plus clear configuration guidance.

- [ ] **Step 1: Add the focused failing test**

Extend the existing YAML validation coverage with a test/script assertion that the Fresh News workflow exposes `OPENAI_API_KEY` and a visual-verification mode to the news-post step.

- [ ] **Step 2: Verify the relevant failure**

Run: `npm test`
Expected: the new workflow assertion fails because those environment variables are not yet present.

- [ ] **Step 3: Implement the minimum behavior**

Add a workflow step that detects whether `OPENAI_API_KEY` exists and emits `required` or `metadata` as the verification mode. Pass both the key and mode to `node src/news-post.js`. Update README secret/configuration instructions and explain that missing AI configuration keeps the existing metadata-only safety path.

- [ ] **Step 4: Verify the focused pass**

Run: `npm test`
Expected: all tests pass and workflow YAML validation remains green.

- [ ] **Step 5: Run the affected integration check**

Run: `npm test`
Expected: complete suite passes with no regressions.

- [ ] **Step 6: Commit the passing deliverable**

```bash
git add .github/workflows/a-little-better-fresh-news.yml README.md
git commit -m "chore: wire visual verification into fresh news"
```

### Task 4: Record Phase 4 status and verification policy

**Files:**
- Modify: `ROADMAP_FACEBOOK_POST_AUTOMATION.md`

**Interfaces:**
- Consumes: implemented source-image verification and final-graphic QA.
- Produces: accurate Phase 4 checklist and explicit activation requirement.

- [ ] **Step 1: Add the focused failing test**

No code test is needed for this documentation-only task. Verify the roadmap against the implementation before editing.

- [ ] **Step 2: Verify the relevant failure**

Run: `git grep -n "Phase 4" ROADMAP_FACEBOOK_POST_AUTOMATION.md`
Expected: Phase 4 still shows semantic verification, automatic visual scoring, and pre-upload visual QA as incomplete.

- [ ] **Step 3: Implement the minimum behavior**

Mark the implemented capabilities complete, document that true vision checks are active when `OPENAI_API_KEY` is configured, and keep the provider-specific-format item open.

- [ ] **Step 4: Verify the focused pass**

Run: `git diff --check`
Expected: no whitespace errors.

- [ ] **Step 5: Run the affected integration check**

Run: `npm test`
Expected: complete suite remains green.

- [ ] **Step 6: Commit the passing deliverable**

```bash
git add ROADMAP_FACEBOOK_POST_AUTOMATION.md
git commit -m "docs: update Phase 4 visual accuracy status"
```

## Unresolved externally observable decisions

- The workflow can only use true vision verification when an `OPENAI_API_KEY` repository secret is available. Without it, the workflow deliberately stays on the existing metadata-only path rather than failing every daily post.
- `gpt-5-mini` is the default vision model; `OPENAI_VISION_MODEL` can override it without changing the workflow logic.
