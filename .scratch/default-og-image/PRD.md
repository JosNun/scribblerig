# PRD: Default OpenGraph image for the bare homepage

Status: done

## Parent

`.scratch/scribblerig/PRD.md`

Related (already shipped): `.scratch/og-share/` — per-scene OG
previews for `/?s=ENC` and `/s/<id>` URLs.

## Problem

`og-share` made share URLs preview beautifully — every `/?s=…` and
`/s/<id>` link rendered through `src/worker/index.ts` gets `og:title`,
`og:description`, and an `og:image` spliced into `<head>` before the
HTML hits the crawler.

But a **plain** link to ScribbleRig (no scene attached) gets nothing:

- `src/worker/index.ts` routes `/` with a `?s=` to `handleRootShare`,
  but otherwise falls through to `env.ASSETS.fetch(request)`.
- `index.html` ships no `<meta property="og:*">` tags at all.

So when someone posts `https://scribblerig.app` into Slack / Discord /
iMessage / Twitter — exactly the moment they're trying to *introduce*
the product — the unfurl is hostname + title and nothing else. It
reads as a dead link next to scene shares that unfurl with a
hand-drawn preview.

## Solution

Two pieces:

### 1. A default OG image at `/og-default.png`

A single static `1200 × 630` PNG that represents ScribbleRig at rest.
Options (pick one in implementation):

- A handcrafted hero image: the wordmark in Mynerve over the
  Solarized base, plus a small scribbled scene (ball on a spring,
  motor-driven arm) to show what's inside.
- A pre-rendered "demo scene" passed through the same
  `renderSceneToSvg` pipeline used for share images, so the default
  reads in the same visual language as per-scene previews.

Drop the bytes in `public/og-default.png` so Vite serves them at the
web root. Worth shipping `og-default.svg` alongside it for clients
that prefer SVG, but the PNG is the load-bearing one (Twitter / X
won't render SVG card images — same constraint that drove the PNG
path in `og-share`).

### 2. Static OG meta tags in `index.html`

```html
<meta property="og:title" content="ScribbleRig" />
<meta property="og:description" content="A scribble-physics sandbox you can share by link." />
<meta property="og:image" content="https://scribblerig.app/og-default.png" />
<meta property="og:image:type" content="image/png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="ScribbleRig" />
<meta name="twitter:description" content="A scribble-physics sandbox you can share by link." />
<meta name="twitter:image" content="https://scribblerig.app/og-default.png" />
```

These sit in `<head>` as plain HTML. The worker's per-share
injection (`handleRootShare`, `handleShortlinkHtml`) appends its own
`og:*` tags into `<head>` — most crawlers honour the **last**
matching tag, so the per-scene image wins on share URLs without us
needing to strip the defaults first. Verify this assumption when
implementing; if a crawler honours the first match, switch the worker
from "append" to "replace" for the OG tags.

Pin the absolute URL (`https://scribblerig.app/og-default.png`) — OG
crawlers don't resolve relative paths reliably. If we ever host on
multiple domains, move the host into a build-time env var.

## Out of scope

- Dynamic / time-varying default images (e.g. "today's featured
  build"). Static is fine for v1.
- `apple-touch-icon` / PWA manifest icons — tracked under
  `.scratch/favicon/` (related, but a different surface).
- Restyling the existing share OG image template. This issue only
  fills the gap for URLs with no scene attached.

## Tests

- Manual: paste the bare homepage URL into Slack / Discord / iMessage
  and confirm the default preview renders.
- Manual: paste a `/?s=…` share URL and confirm the per-scene image
  still wins (i.e. the worker's late-injected tags override the
  static defaults). If they don't, that's a worker-side change, not
  a defaults-side one.
- The existing `src/og/renderSvg.test.ts` covers the share-image
  path; no new automated test needed unless we generate the default
  image at build time, in which case add a snapshot test for the
  generator.

## Notes

- Cheap, high-leverage. The homepage is the URL people share when
  they want to *introduce* the product to a friend; right now it
  unfurls worse than any individual scene that the friend would land
  on after clicking. Fixing this lifts every cold-share.
- The `og-share` worker already proves out the full crawler-rendering
  path; we're just plugging the one URL that bypasses it.
