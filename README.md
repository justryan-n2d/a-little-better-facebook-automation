# A Little Better Facebook Automation

This private repository automates one daily post for the A Little Better Facebook Page.

Schedule:
- 9:00 AM Asia/Manila every day
- one original content item per run
- one 1080 x 1350 PNG image
- Facebook Page publishing through Meta Graph API
- posting history recorded after a successful publish

The first version is intentionally free of paid AI APIs. It selects from an original local content bank and renders the image locally on the GitHub runner. An AI generator can be added later without changing the Facebook publishing layer.

GitHub Secrets

Create these repository secrets under Settings -> Secrets and variables -> Actions:

FB_PAGE_ID
The Facebook Page ID.

FB_PAGE_ACCESS_TOKEN
A Page access token with the Meta permissions required to publish to your Page.

Never put the access token in source code or a normal repository file.

Meta setup

Create and configure a Meta app and obtain a Page access token that is authorized to publish to the Page. The workflow is pinned to Graph API v26.0. The version is configurable in the workflow if your app needs another supported version.

References:
- https://developers.facebook.com/docs/graph-api/
- https://developers.facebook.com/docs/pages-api/
- https://developers.facebook.com/terms/

Testing

1. Add the two secrets.
2. Open Actions -> Daily A Little Better Facebook Post -> Run workflow.
3. Leave dry_run enabled.
4. Confirm the job generates the image and skips Facebook.
5. Run it again with dry_run disabled after the Meta credentials are ready.

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

Content rotation:
Monday: motivation
Tuesday: mindset
Wednesday: Bible
Thursday: student struggles
Friday: self-improvement
Saturday: casual
Sunday: encouragement

Every generated caption includes the A Little Better call to action.
