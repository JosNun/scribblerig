# 02 — Named scenes with KV shortlinks

Status: ready

## Parent

[`.scratch/og-share/PRD.md`](../PRD.md)

## Architecture

[ADR-0010 — Shortlinks + worker-rendered OG previews](../../../docs/adr/0010-shortlinks-and-worker-og.md)

## Problem

Issue 01 puts OG previews behind `?s=<encoded>` URLs but doesn't introduce
any backing store. This issue adds the **shortlink layer**: an opaque
10-char ID backed by Cloudflare KV that holds the same encoded scene plus
a title. Visiting `/s/<id>` gets the same OG + SPA experience as
`/?s=ENC`, just over a short, content-addressable URL.

Ships when end-to-end works via `curl` and `wrangler dev`. **No UI
changes in this issue** — that's [issue 03](03-share-popover-naming-ui.md).
The Share button in `master` still copies a `?s=` URL until issue 03
lands.

## What to build

### 1. KV namespace + wrangler binding

- `wrangler.jsonc` gains an `[[kv_namespaces]]` entry. Binding name:
  `SHARES`.
- `Env` interface in `src/worker/index.ts` (from issue 01) gains
  `SHARES: KVNamespace`.
- Document the production / preview namespace IDs in this issue's
  Notes section (filled in when the namespace is provisioned).

### 2. ID generation

- New file `src/worker/id.ts`. Pure helper:
  `nextShortlinkId() → string` returning a 10-char base62 ID.
- Uses Web Crypto (`crypto.getRandomValues`) which is available in
  workers. **Don't pull in `nanoid` if avoidable** — saves a dep; if
  you do, it must be the workers-compatible build.
- Tests: length, charset, distribution sanity (not collision; just
  "uses the documented alphabet").

### 3. Mint endpoint

- `POST /api/share` route in the worker.
- Request body: `{ sceneEnc: string, title?: string }` (JSON).
  - `sceneEnc` is the **already-encoded** scene (same base64url payload
    that goes in `?s=`). Client encodes once on its side; worker stores
    bytes as-is.
- Server-side validation:
  - `sceneEnc` is a non-empty string, base64url charset only, length
    sane (cap at e.g. 64 KB — pathologically large scenes are rejected).
  - `title` if present runs through the same sanitiser as the scene's
    `scene.title` field (80 char cap, no control chars, no HTML).
- Rate limit before write:
  - Per-IP counter in KV, key `rate:<ip>` (use `cf-connecting-ip`
    header), `expirationTtl: 60` (seconds), increment via read-modify-
    write. KV is eventually-consistent but this is good enough for v1
    spam control.
  - Above **10 per minute**: return `429 Too Many Requests` with a
    `Retry-After: 60` header.
- ID generation + write:
  - `nextShortlinkId()` → mint ID.
  - Read first to check for collision (vanishingly unlikely; if it ever
    happens, retry once with a fresh ID then give up with 500).
  - Write: `{ sceneEnc, title?, createdAt: Date.now() }` as JSON.
- Response: `{ id, url }` where `url` is absolute (`https://<host>/s/<id>`).

### 4. Resolution: `/s/<id>`

- `GET /s/<id>/og.svg`:
  - KV read for `<id>`. Missing → 404.
  - Decode `sceneEnc` via the codec, call `renderSceneToSvg`, return
    `image/svg+xml` with `Cache-Control: public, max-age=31536000,
    immutable`.
- `GET /s/<id>`:
  - KV read. Missing → 404 (worker generates a small "share not found"
    HTML response, OR delegates to `env.ASSETS` 404 if cleaner — pick
    one).
  - Fetch `index.html` via `env.ASSETS`. HTMLRewriter injects:
    - All the `og:*` and `twitter:*` meta tags from issue 01, but with
      `og:title` set from the **stored** `title` (or `deriveTitle(scene)`
      if absent), `og:image` pointing at `/s/<id>/og.svg`, `og:url`
      pointing at `/s/<id>`.
    - A `<script type="application/json" id="og-data">` element inside
      `<head>` containing `{"sceneEnc": "<bytes>"}`. The SPA reads this
      on boot.
  - Response: HTML with `Cache-Control: public, max-age=31536000,
    immutable` (the shortlink is forever-immutable per ADR-0010).

### 5. SPA boot — hydrate from `og-data` before falling back

- `src/App.tsx` boot order: `og-data` inline script → `?s=` query →
  `#` fragment → autosaved scene → default scene.
- Reading `og-data`:
  ```ts
  const el = document.getElementById("og-data");
  if (el && el.textContent) {
    const { sceneEnc } = JSON.parse(el.textContent);
    return decodeScene(sceneEnc);
  }
  ```
- **Don't strip the URL after import.** The URL is `/s/<id>` — that's
  the address the user wants to keep. Only `?s=` and `#` get stripped
  (existing behaviour).

### 6. Tests

- `src/worker/id.test.ts` — length / charset.
- `src/worker/index.test.ts` (extended from issue 01) — add cases for:
  - `POST /api/share` happy path with mocked KV `put`.
  - Rate limit: 11th request inside a minute returns 429.
  - Mint validation: oversized / bad-charset `sceneEnc` returns 400.
  - `GET /s/<id>` happy path with mocked KV `get` → meta injection +
    inline data blob in the HTML response.
  - `GET /s/<id>/og.svg` happy path → SVG bytes, immutable cache.
  - `GET /s/abc-does-not-exist` → 404.
- Mock KV: a small in-memory `Map<string, string>` that implements
  `get`/`put`/`delete` matching `KVNamespace`'s shape. No dep required.

## Acceptance criteria

- [ ] `SHARES` KV binding exists in `wrangler.jsonc`; worker compiles
      against the typed `Env`.
- [ ] `POST /api/share` mints, stores, rate-limits, and returns
      `{ id, url }`.
- [ ] `GET /s/<id>` returns HTML with OG meta + an inline scene blob,
      cache-immutable.
- [ ] `GET /s/<id>/og.svg` renders the scene to SVG, cache-immutable.
- [ ] Missing IDs return 404 cleanly.
- [ ] SPA boot reads the `og-data` script when present, falls back to
      `?s=` then `#` otherwise.
- [ ] All tests pass; no regression on issue 01's tests.
- [ ] `wrangler dev` smoke test: mint a shortlink via curl, fetch the
      `/s/<id>` URL in a browser, see the scene render with the title in
      the browser tab.

## Smoke test

```bash
# Encode a scene client-side (or copy from a Share URL):
ENC='<encoded scene>'
# Mint:
curl -s -X POST http://127.0.0.1:8788/api/share \
  -H 'content-type: application/json' \
  -d "{\"sceneEnc\":\"$ENC\",\"title\":\"My machine\"}"
# Response: {"id":"abcdef0123","url":"http://127.0.0.1:8788/s/abcdef0123"}
ID='abcdef0123'
curl -s http://127.0.0.1:8788/s/$ID | grep -E 'og:|og-data'
curl -s http://127.0.0.1:8788/s/$ID/og.svg > /tmp/s.svg
# Open /tmp/s.svg in a browser.
```

## Blocked by

- [Issue 01](01-svg-og-for-url-shares.md) — needs the worker, SVG
  renderer, scene `title` field, and `?s=` URL change in place.

## Blocks

- [Issue 03](03-share-popover-naming-ui.md) — the UI that lets users
  actually mint these depends on this endpoint existing.

## Notes

- KV namespace IDs (fill in when provisioned):
  - Production: `<TODO>`
  - Preview: `<TODO>`
- Cost: 1 write per share button click that names a scene + ~10 writes
  per IP per minute for the rate counter. Cloudflare free tier is 1k
  writes/day — plenty for hobby load.
- The two renderers (canvas + SVG from issue 01) keep evolving
  together; ADR-0010 spells out the shared-`Shape` invariant.
- v2 enhancements expressly out of scope: editing, deletion endpoints,
  view counts, ownership cookies.
