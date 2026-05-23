# ADR-0010 — Shortlinks + worker-rendered OG previews

Status: accepted
Date: 2026-05-23

## Context

The parent PRD ([CONTEXT.md](../../CONTEXT.md),
[scribblerig/PRD.md](../../.scratch/scribblerig/PRD.md)) commits to
**serverless sharing**: a scene encodes into the URL, anyone with the URL
gets the scene, no account, no backend. [ADR-0008](0008-tolerant-share-and-autosave.md)
fleshes that out: encode → deflate → base64url → `#…` fragment, with
tolerant decode on the way back in.

This works, but three product frictions have emerged:

1. **No OG previews** — fragments aren't sent to servers, so crawlers
   (Twitter, Discord, Slack) see only the bare index.html and render
   shares as blank link cards.
2. **No way to name a build** — creators can't expose what their
   creation *is* outside opening the link.
3. **URL length** — non-trivial scenes encode to 1.5–5 KB. Some chat
   apps mishandle URLs of that size, and link-preview crawlers may
   truncate before reading the fragment.

The parent PRD anticipated the third one: *"A future fallback (out of
scope for v1) is a tiny key-value store… returns a short id when a
scene exceeds practical URL length."* This ADR records the architectural
shift to add that fallback **and** uses it as the substrate for OG
previews and naming.

## Decision

Introduce a **single Cloudflare Worker** in front of the existing static
SPA, plus a single **Cloudflare KV namespace** (`SHARES`) as the optional
backing store. The relationship to ADR-0008's URL-share design is
**additive**: today's `#…` and a new `?s=…` form continue to work without
touching the worker or KV; the worker only adds work where it adds value.

Concretely:

- **Two URL forms for shares, both honoured at read time.**
  - `?s=<encoded>` — same payload shape as today's `#…`, just in the
    query string so crawlers can read it. Default for un-named scenes
    under a size cap. **No backend dependency for this path.**
  - `/s/<id>` — opaque 10-char base62 id backed by KV. Default for
    named scenes, and the silent auto-fallback when an un-named scene
    would encode to over ~1500 chars.
  - The old `#…` form keeps working forever on the reader side. Every
    link already in the wild stays valid.
- **Scenes own their title.** `scene.title?: string` on the design graph.
  Survives autosave, codec round-trip, and copy/paste alike. Naming is
  a property of the build, not of one share.
- **Worker dispatches by path.** Static-asset prefixes (`/assets/*`)
  bypass the worker before any work runs (preserves free-tier
  invocation budget). The worker only runs meaningfully for
  `/?s=...`, `/s/<id>`, `/og.svg?s=...`, `/s/<id>/og.svg`, and
  `POST /api/share`.
- **HTMLRewriter injects OG meta and an inline scene blob** for both
  `?s=` and `/s/<id>` HTML responses. Crawlers get the right preview;
  the SPA hydrates from the same inline blob it would otherwise have
  fetched separately — one round trip per visit.
- **Shortlinks are immutable.** Once minted, a `/s/<id>` represents one
  frozen scene forever. "Editing" produces a new ID. This lets
  `Cache-Control: public, max-age=31536000, immutable` apply uniformly
  to both HTML and SVG responses; Cloudflare's edge handles bursts for
  free; and v1 dodges all the editing-and-auth questions.
- **Rate-limited minting.** `POST /api/share` checks a per-IP counter
  in KV (`rate:<ip>`, `expirationTtl: 60`) and rejects above 10
  requests/minute with 429.
- **Pure SVG renderer** lives in `src/og/renderSvg.ts`. Imports only
  from `roughjs/bin/generator` (no DOM). Mirrors the canvas renderer's
  geometry decisions so the OG image is recognisably the same drawing.
  Selection / playback overlays (dot grid, motor arrowhead, spring
  rest-length marker) are deliberately dropped — they're not part of a
  thumbnail.
- **SVG is the v1 OG format.** PNG (via `@resvg/resvg-wasm`) is a known
  follow-up to widen platform compatibility (Twitter in particular).

## Consequences

### What stays true from ADR-0008

- The codec module (`src/share/codec.ts`) is unchanged. Encoding,
  deflating, base64url, tolerant decode: all the same. Both URL forms
  carry the same `<encoded>` payload; the URL form is just where the
  bytes sit. ADR-0008's degradation rules (unknown type dropped, props
  coerced/defaulted, dangling connectors dropped, `nextId` advanced)
  still mediate every read regardless of which URL form delivered the
  bytes.
- `SCENE_VERSION` still travels in the payload, no engine version
  pinning.
- Startup precedence remains tolerant: worker-injected `og-data` blob
  takes priority on `/s/<id>` visits; otherwise `?s=` → `#` → autosave
  → default. The SPA strips the share fragment / query from the URL
  after import so a later refresh restores the user's autosaved edits.

### What this ADR adds

- The Cloudflare Worker enters the architecture. Until now the SPA was
  pure static assets; now a worker mediates `index.html` for shares.
  This is the new operational dependency.
- KV writes happen on Share button clicks when a scene is named or
  oversized. KV reads happen the first time each region's edge serves
  a `/s/<id>` URL (everything after is cache hits).
- One scene property (`title`) is new on the design graph; the
  registry / sanitizer flow gains a string-coercion step for it
  (sanitised to 80 chars, control chars stripped, no HTML).
- A second renderer module exists in the codebase (canvas renderer +
  SVG renderer), each owning its own geometry decisions but sharing
  the same world-coordinate math via `renderer/camera`. They must
  evolve together when shape definitions change. The renderer
  registry [ADR-0006](0006-registry-geometry-descriptors.md) is the
  shared contract that keeps this honest — both renderers consume the
  same `Shape` descriptors.

### Tradeoffs we accept

- **The "no backend" PRD claim becomes "no required backend."** Un-named
  small scenes still share without touching KV at all. Named or oversized
  scenes do depend on Cloudflare KV staying up — the conscious price for
  named, short URLs. The parent PRD's *Out of Scope* line gets moved
  into-scope and the wording updated to reflect this nuance.
- **Worker invocation cost.** Static-asset bypass keeps this minimal,
  but `/?s=…` and `/s/<id>` requests now invoke the worker every time
  they aren't cache hits. Free-tier headroom (100k req/day) absorbs
  this trivially for a hobby app.
- **Forever-immutable shortlinks.** Cannot be edited or revoked in v1.
  Takedown becomes an operational concern eventually (delete the KV
  row); cache poisoning isn't a worry because rows are immutable, so
  edge cache content can never disagree with KV. v2 editing — if ever
  added — will need new IDs or a new URL convention, not in-place
  rewrites.
- **SVG-only OG.** Twitter's card crawler is known to reject SVG.
  Other major platforms accept it. We accept partial coverage in v1
  and treat PNG as the next step rather than blocking v1.
- **Two renderers to maintain.** Adding a new body/connector type
  means updating both. Mitigated by the shared `Shape` registry
  ([ADR-0006](0006-registry-geometry-descriptors.md)) and by tests in
  each renderer.

## Alternatives considered

- **Bake the title into the URL alongside the scene** (e.g.
  `?s=ENC&t=Title`). Solves the OG-title problem without KV. Doesn't
  solve URL length, doesn't shorten anything, and the title still gets
  truncated by long-URL-unfriendly crawlers. Strictly worse than the
  hybrid.
- **Always mint a shortlink** for every share (no `?s=` path).
  Maximises URL cleanliness, sacrifices the no-backend property for
  every share including throwaway ones, and creates DB pressure
  proportional to share-button clicks instead of just to named shares.
  Rejected.
- **Per-scene editable shortlinks** (cookie or signed-URL ownership).
  A real feature with real value, but a much bigger surface — auth,
  ownership, edit history, cache invalidation. Deferred to a later
  iteration; v1 commits to immutability and gets simpler caching as
  the reward.
- **PNG output via `@resvg/resvg-wasm` in v1.** Covers Twitter
  properly. Adds WASM bundle weight and a separate render pipeline.
  Deliberately deferred so the SVG path proves out first; pure
  addition when added.
- **Use D1 instead of KV.** Relational, ACID. We have no relational
  data — one table of opaque blobs. KV is the right granularity, with
  edge replication built in. D1 reachable later if views/forks/lineage
  ever justify it.

## References

- Parent context: [CONTEXT.md](../../CONTEXT.md),
  [scribblerig/PRD.md](../../.scratch/scribblerig/PRD.md).
- Feature PRD: [og-share/PRD.md](../../.scratch/og-share/PRD.md).
- Foundational share design: [ADR-0008](0008-tolerant-share-and-autosave.md).
- Shape descriptors keeping the two renderers honest:
  [ADR-0006](0006-registry-geometry-descriptors.md).
- Implementation issues:
  [01-svg-og-for-url-shares](../../.scratch/og-share/issues/01-svg-og-for-url-shares.md),
  [02-named-scenes-kv-shortlinks](../../.scratch/og-share/issues/02-named-scenes-kv-shortlinks.md),
  [03-share-popover-naming-ui](../../.scratch/og-share/issues/03-share-popover-naming-ui.md).
