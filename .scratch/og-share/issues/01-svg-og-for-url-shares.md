# 01 — SVG OG previews for URL-shared scenes

Status: done

## Parent

[`.scratch/og-share/PRD.md`](../PRD.md)

## Architecture

[ADR-0010 — Shortlinks + worker-rendered OG previews](../../../docs/adr/0010-shortlinks-and-worker-og.md)

## Problem

Today's `#…` share URLs leave no preview for social/chat crawlers, which
only see `index.html`'s title and no image. We need to:

1. Move share URLs to `?s=<encoded>` so crawlers can read them, while
   keeping `#…` decoding for backwards compatibility.
2. Build a DOM-free SVG renderer that produces a doodle preview of any
   scene.
3. Stand up a Cloudflare Worker that injects OG meta tags into
   `index.html` for `?s=…` requests and serves rendered SVG at
   `/og.svg?s=…`.

**Important:** This issue introduces **zero KV / backend state**. Every
share is still URL-encoded; we just give it crawler-readable form and a
preview. Issue 02 builds the shortlink layer on top.

## What to build

### 1. Scene `title` field

- Add `title?: string` to the scene model. Decide placement (root `Scene`
  vs first `Room`) — the parent PRD currently anchors scene-wide settings
  on the room; the title might fit best on the scene root since it's
  *about the build* not about any one room.
- Sanitize on read in the codec / sanitizer layer (already tolerant per
  [ADR-0008](../../../docs/adr/0008-tolerant-share-and-autosave.md)):
  cap at **80 chars**, strip control chars (`\x00-\x1f`, `\x7f`), refuse
  HTML — store plain text only.
- Update `share/codec.test.ts`: `decode(encode({...scene, title: "Foo"}))`
  deep-equals the original; oversized / control-charactered / HTML-tag
  titles get sanitised; missing title is fine.
- No UI yet — that's issue 03. The field just needs to exist so the
  worker can read and render it.

### 2. Pure SVG renderer

- New file `src/og/renderSvg.ts`. Imports only `roughjs/bin/generator`
  (no DOM, no `roughjs` main, no canvas, no React).
- Signature: `renderSceneToSvg(scene: Scene, opts?: { width?: number; height?: number }) → string`.
  Default size 1200×630 (OG-standard aspect ratio).
- Geometry decisions mirror `src/renderer/renderer.ts`:
  - Room frame (paper background, dashed bounds).
  - Walls when enabled, hatched like the canvas.
  - Bodies — each shape from `Shape` descriptors via the registry
    ([ADR-0006](../../../docs/adr/0006-registry-geometry-descriptors.md)).
    Same hachure / cross-hatch fills at the world-locked weight.
  - Connectors — spring zigzag, pin / weld / motor pivots, hand-rolled
    as SVG primitives (`<path>`, `<circle>`, `<rect>`) since they're
    short enough not to need the Rough generator.
- **Deliberately omitted** vs canvas renderer:
  - The dot grid (canvas-only).
  - Motor's directional arrowhead and spring's rest-length marker (both
    are selection / playback overlays, not thumbnail content).
- Output budget: typical scenes encode to ~20–200 KB SVG. Acceptable.
- Camera math: reuse `src/renderer/camera.ts`' `fitCamera` and
  `worldToScreen` so the framing matches what the canvas does.
- Tests in `src/og/renderSvg.test.ts`:
  - Empty scene returns valid SVG (just the room frame).
  - Single ball / single platform renders the expected shape group.
  - Scene with bodies + a spring renders both.
  - Output is parseable as SVG (well-formed XML start).
  - No DOM imports (one test asserts the source file doesn't import from
    "roughjs" main or "react" — grep against the file contents).

### 3. Derived titles

- New file `src/og/deriveTitle.ts`, pure.
- Signature: `deriveTitle(scene: Scene) → string`.
- Output style: `"3 balls · 2 platforms · 1 motor"`. Pluralisation
  ("ball" vs "balls"), Oxford-comma-style separator (` · `), order
  matches the registry order.
- Empty scene → `"Empty room"`.
- Tests cover counts, pluralisation, order, empty case.
- Used by the worker when a scene has no `title` field.

### 4. Share URL format change

- `src/share/storage.ts`:
  - `shareUrl(scene)` writes `?s=<encoded>` (was `#…`).
  - The reader accepts **both** `?s=` and `#`. On boot, both are
    tried in order: `?s=` first (so worker-handled visits keep
    consistency), `#` second (old in-the-wild links).
  - Add a helper `encodedLength(scene) → number` that gives the
    URL-encoded length without actually building the URL. Used by
    issue 03's auto-promotion logic; expose here so worker code can
    use it too if helpful.
- `src/App.tsx`: strip `?s=` from the URL after import, same way it
  already strips `#`.
- Tests: round-trip both URL forms; explicit assertion that a `#…` URL
  with an existing encoded payload still decodes.

### 5. Cloudflare Worker

- New file `src/worker/index.ts`.
- Env interface:
  ```ts
  interface Env {
    ASSETS: Fetcher; // static assets binding from wrangler
  }
  ```
- Dispatch by URL path:
  - Anything under `/assets/` (or other static prefixes Vite emits) →
    `env.ASSETS.fetch(request)` verbatim. No further work.
  - `GET /og.svg?s=ENC` → decode via `share/codec.ts` (re-exported in a
    DOM-free way — sanity-check it's DOM-free, if it isn't, refactor),
    call `renderSceneToSvg`, return `image/svg+xml` with
    `Cache-Control: public, max-age=31536000, immutable`. Bad / missing
    `s` returns 400.
  - `GET /?s=ENC` → fetch `index.html` via `env.ASSETS`, pipe through
    `HTMLRewriter` to inject `<meta>` tags in `<head>`:
    - `og:title` — use `scene.title` if present, else
      `deriveTitle(scene)`.
    - `og:description` — short hand-crafted description, scene-aware
      ("3 balls · 1 motor in a ScribbleRig room").
    - `og:image` — absolute URL to `/og.svg?s=ENC`.
    - `og:image:width=1200`, `og:image:height=630`, `og:image:type=image/svg+xml`.
    - `og:url`, `og:type=website`.
    - `twitter:card=summary_large_image`, `twitter:title`,
      `twitter:image`, `twitter:description` — mirror the og:* set.
    Return HTML as-is otherwise (no extra cache header; defer to
    static-asset cache headers from `env.ASSETS`).
  - `GET /` (no `s`) → pass through to `env.ASSETS`.
  - Anything else → pass through to `env.ASSETS` (lets normal 404s
    happen from the asset binding).
- The worker file gets a unit test (`src/worker/index.test.ts`) using
  a mocked `Env.ASSETS` fetcher. Covers: static-asset bypass, OG SVG
  render path, HTMLRewriter injection. Vitest can run worker code if we
  type the runtime against `@cloudflare/workers-types` — already in
  deps (commit `8c2b4e6`).

### 6. wrangler.jsonc

- Add `main: "src/worker/index.ts"`.
- Keep the existing `assets` binding (probably named `ASSETS`) if it
  already exists from prior work; add it if not.
- **Set `assets.run_worker_first: true`.** Without this flag,
  Cloudflare's asset router serves any path that matches a built asset
  *before* the worker ever runs. The root path `/` matches `index.html`,
  so without `run_worker_first` the OG-meta injection branch for
  `/?s=ENC` is silently bypassed (the asset router returns `index.html`
  with `cf-cache-status: HIT` and the worker never sees the request).
  Verified in production deploy — without the flag, `GET /?s=ENC` has
  zero `og:` meta in the response; with the flag, all twelve `og:*` /
  `twitter:*` tags appear as designed. The worker's own
  `STATIC_PREFIXES` check (in `src/worker/index.ts`) still delegates
  `/assets/*` back to `env.ASSETS.fetch` for the fast path on hashed
  bundles.

  An earlier draft of this issue said "do not add `run_worker_first` —
  the worker short-circuits static assets explicitly." That was wrong:
  the short-circuit only matters if the worker actually runs. Fixed in
  the deploy that landed with `run_worker_first: true`.

## Acceptance criteria

- [ ] `scene.title` exists, is sanitised on every codec read, round-trips
      through `decode(encode())`.
- [ ] `src/og/renderSvg.ts` exists, has no DOM imports, returns valid SVG
      for empty / minimal / typical scenes; tests pass.
- [ ] `deriveTitle()` returns the documented format with correct
      pluralisation and order; tests pass.
- [ ] `shareUrl(scene)` produces `?s=<encoded>`; both `?s=` and `#` URLs
      decode on boot; existing `#…` links still load.
- [ ] `GET /?s=ENC` in the worker injects `og:*` and `twitter:*` meta
      tags pointing at `/og.svg?s=ENC`.
- [ ] `GET /og.svg?s=ENC` returns the SVG with `Cache-Control: public,
      max-age=31536000, immutable`.
- [ ] `/assets/*` requests are routed to `env.ASSETS.fetch` without any
      other worker work.
- [ ] No regression on existing tests (currently 128 passing).
- [ ] `bun run build` clean. `wrangler dev` boots without errors.

## Smoke test

```bash
bun run build
bunx wrangler dev --port 8788
# Open the app in browser, build a small scene, click Share to copy
# a `?s=...` URL, paste here:
SHARE='<paste a real ?s= value here>'
curl -s "http://127.0.0.1:8788/og.svg?$SHARE" > /tmp/og.svg
curl -s "http://127.0.0.1:8788/?$SHARE" | grep -E 'og:|twitter:'
```

Visual sanity-check `/tmp/og.svg` in a browser. The meta-tag dump from
the second curl should show six og: tags and four twitter: tags.

## Blocked by

- Nothing.

## Blocks

- [Issue 02](02-named-scenes-kv-shortlinks.md) (depends on the worker
  scaffolding + SVG renderer existing in master).
- [Issue 03](03-share-popover-naming-ui.md) (depends on the title field
  and URL change being in place).

## Notes

- The earlier agent's sketch at `.claude/worktrees/og-image-sketch/`
  built a similar shape and left useful notes in
  `SKETCH.md` (HTMLRewriter chunk-boundary gotcha, content-type
  observations for `index.html` under `wrangler dev`). Worth a glance,
  not worth merging — that branch sits on an older base.
- Free-tier Cloudflare counts: 100k worker req/day, plenty for hobby
  load.
- The SVG output is intentionally large-ish (20–200 KB). That's fine for
  OG; PNG is the next step if we ever want smaller bytes and Twitter
  compatibility (deferred per the PRD).
