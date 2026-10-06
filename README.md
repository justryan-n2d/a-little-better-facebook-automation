# A Little Better Facebook Automation

This private repository automates one daily post for the A Little Better Facebook Page.

Schedule:
- 11:00 AM Asia/Manila every day: Fresh News
- 4:00 PM Asia/Manila every day: regular daily post
- one Fresh News item and one regular content item per day
- one 1080 x 1350 PNG image
- Facebook Page publishing through Meta Graph API
- posting history recorded after a successful publish

The first version is intentionally free of paid AI APIs. It selects from an original local content bank and renders the image locally on the GitHub runner. An AI generator can be added later without changing the Facebook publishing layer.

## Growth system

The repository now also runs a measurement and learning loop around the daily publisher:

- 6:00 PM Asia/Manila daily: collect recent post reactions, comments, shares, available Meta insight metrics, and follower snapshots
- Sunday 8:00 PM Asia/Manila: create a weekly GitHub Issue growth report
- The report identifies top-performing posts, category performance, follower change when available, a Reel-ready draft, and practical manual distribution actions
- Analytics are stored in `data/growth-analytics.json`
- The collector keeps a bounded history so the repository does not grow without limit
- The existing watchdog keeps the daily publisher protected and now alerts when the content bank reaches 5, 2, or 0 unused posts
- The existing Meta data-access reminder remains at 7, 5, 2, 1, and 0 days

The growth report uses a simple comparison score for post-level engagement:

`reactions + 2 x comments + 3 x shares`

When post reach is available, the collector also records engagement rate plus reaction, comment, share, and engaged-user rates. Missing reach does not produce a fake zero rate.

The daily selector now uses the latest performance data to prefer stronger eligible content after a 28-day reuse cooldown. New or unmeasured content remains eligible, so the system can still explore instead of repeating the same winner every day.

Generated images now rotate among four deterministic visual treatments: mint, alternate, minimal, and framed. The treatment is derived from the content ID and is recorded in experiment metadata, so the same content always gets the same visual treatment.

On every 4th eligible publishing day, the selector deliberately gives an unmeasured eligible post a chance. This creates a controlled 1-in-4 exploration cadence while the other days favor measured performance.

Reels and group/community distribution remain manual actions. The weekly report prepares the Reel concept, and the separate Sunday 9:00 PM workflow generates a 1080 x 1920 MP4 draft from the strongest measured post. The Reel artifact is uploaded to GitHub Actions for manual review and is never published automatically.

## GitHub Secrets

Create these repository secrets under Settings -> Secrets and variables -> Actions:

FB_PAGE_ID
The Facebook Page ID.

FB_PAGE_ACCESS_TOKEN
A Page access token with the Meta permissions required to publish to your Page.

Never put the access token in source code or a normal repository file.

## Meta setup

Create and configure a Meta app and obtain a Page access token that is authorized to publish to the Page. The current workflow is pinned to Graph API v26.0. The version is configurable in the workflow if your app needs another supported version.

The analytics collector uses the same Page credentials. If a configured insight metric is unavailable for the token or API version, that metric is recorded as unavailable instead of stopping the collection of the other engagement data.

References:
- https://developers.facebook.com/docs/graph-api/
- https://developers.facebook.com/docs/pages-api/
- https://developers.facebook.com/terms/

## Testing

1. Add the two secrets.
2. Open Actions -> Daily A Little Better Facebook Post -> Run workflow.
3. Leave dry_run enabled.
4. Confirm the job generates the image and skips Facebook.
5. Run it again with dry_run disabled after the Meta credentials are ready.
6. Run the Facebook Growth Analytics workflow manually to confirm the Page token can read the available metrics.
7. Run the weekly growth report workflow manually after at least one analytics collection.

Scheduled runs use dry_run=false, so after setup the workflow will publish automatically each day.

Local requirements:
- Node.js 20+
- ImageMagick with magick or convert

Local commands:
npm test
DRY_RUN=true node src/index.js

Safety behavior:
- if today's date is already recorded, a normal rerun does not post again
- FORCE_POST=true is required to intentionally override that protection
- only a successful Facebook publish is written to posting history
- history is capped at 500 records to avoid unbounded repository growth
- analytics history is bounded separately in data/growth-analytics.json

Content rotation:
Monday: motivation
Tuesday: mindset
Wednesday: Bible
Thursday: student struggles
Friday: self-improvement
Saturday: casual
Sunday: encouragement

Every generated caption includes the A Little Better call to action.

<!-- GitHub Actions runner verification: 2026-10-06 -->
