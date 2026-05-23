# 03 — Share popover with naming UI

Status: done

## Parent

[`.scratch/og-share/PRD.md`](../PRD.md)

## Architecture

[ADR-0010 — Shortlinks + worker-rendered OG previews](../../../docs/adr/0010-shortlinks-and-worker-og.md)

## Problem

Issues 01 and 02 build the substrate: OG previews for `?s=` URLs, plus
KV-backed shortlinks at `/s/<id>`. This issue is the **user-facing
surface**: a Share popover with an optional name input, a Copy button,
and the auto-promotion logic that picks the right URL form behind the
scenes.

## What to build

### 1. Share popover component

- Replace the bare Share button click-to-copy behaviour with a small
  doodle popover (use the existing `DoodleBorder` chrome from issue 09
  follow-up).
- Layout:
  - Header: "Share this build"
  - Name input (optional). Pre-filled with `scene.title` if set.
    Placeholder: `"Name it (optional)"`. Capped at 80 chars in the
    `<input maxlength>`. On change, updates `scene.title` via the same
    `onRoomChange` path room-settings edits use (so naming autosaves
    immediately).
  - URL display (read-only `<input>` showing the resulting URL).
  - "Copy link" button — uses today's `copyLink` clipboard logic.
- Behaviour:
  - If `scene.title` is **empty** AND the encoded URL length ≤ ~1500
    chars → URL is `?s=ENC` (no backend hit).
  - Else (named OR oversized) → POST `/api/share` with
    `{ sceneEnc, title? }`, show the returned `/s/<id>` URL.
    - While the request is in flight: spinner / disable Copy button.
    - On 429: friendly "slow down" message.
    - On network failure: fall back to copying `?s=ENC` (degrades to
      today's behaviour) and surface a small note.
- Mount via the existing right-side panel infrastructure or a small
  overlay positioned near the Share button. Decide during
  implementation — whichever fits the existing layout best.

### 2. Auto-promotion threshold

- Use the `encodedLength(scene)` helper added in issue 01.
- Threshold: `1500` chars. The URL is `?s=` + the base64url payload + the
  hostname; 1500 leaves headroom under crawler limits and chat-app
  truncation.
- The threshold is a constant in `src/share/storage.ts`; tests check the
  promotion decision (deterministic small / large scenes).

### 3. Persistence

- `scene.title` autosaves with the rest of the design graph (already
  true once the codec round-trips it from issue 01).
- After clicking Copy: nothing else to persist beyond the field already
  being on the scene.

### 4. Mobile

- The Share popover must also work in the mobile drawer. The existing
  `actionsEls` rendering covers both layouts via the same JSX; verify
  the popover anchors cleanly inside `.sheet-actions`.

### 5. PRD update (parent)

- In `.scratch/scribblerig/PRD.md`:
  - Move the "Key-value store fallback for oversized scenes" bullet
    from **Out of Scope** to a new "Implemented in follow-up" section,
    with a link to `.scratch/og-share/PRD.md`.
  - Soften user story 33 to: "*As a tinkerer, I want sharing to work
    without creating an account, so that my creations don't depend on
    me having an account.*" — drops the "no backend" wording, which is
    no longer strictly true for named/oversized scenes (ADR-0010
    spells out the nuance).

### 6. Tests

- `src/share/storage.test.ts` (new or extended) — `urlLengthFor` and
  the promotion decision function.
- Component test for the popover via `renderToStaticMarkup` (matching
  the pattern of `PropertyPanel.test.tsx`): asserts the name input is
  pre-filled, the URL display renders, and the appropriate URL is
  shown for small-vs-large scenes.

## Acceptance criteria

- [ ] Clicking Share opens a popover with an optional name field, a
      URL display, and a Copy button.
- [ ] An un-named small scene's popover shows a `?s=…` URL; copying
      that URL works.
- [ ] A named scene's popover shows a `/s/<id>` URL after a single mint
      request.
- [ ] An un-named oversized scene auto-promotes silently to a
      shortlink with a derived title.
- [ ] Naming a scene autosaves immediately (scene round-trip preserves
      title; reopening in a new tab keeps the name).
- [ ] Mobile drawer layout still works.
- [ ] Parent PRD updated.

## Smoke test

- Build a small scene, click Share, leave the name blank, copy → paste
  in browser → scene loads, blank-named OG works (derived title).
- Build the same scene, name it "Test", click Share → URL is
  `/s/<id>`, paste → scene loads, browser tab shows "Test".
- Build a big scene with many bodies, leave the name blank, click
  Share → URL is `/s/<id>` (auto-promoted), works.

## Blocked by

- [Issue 01](01-svg-og-for-url-shares.md)
- [Issue 02](02-named-scenes-kv-shortlinks.md)

## Blocks

- Nothing in the v1 plan. Follow-ups (PNG output, public gallery)
  build on top but aren't blocked by this issue's exact details.

## Notes

- The "Copied!" affordance from today's Share button stays. Keep the
  same UX of click → URL on the clipboard → small confirmation toast.
- v2 ideas this enables (deliberately not built here): a "recently
  shared" list, view counts on shortlinks, fork / remix lineage. All
  are pure additions on top of the KV row shape; the data model
  doesn't need rework.
