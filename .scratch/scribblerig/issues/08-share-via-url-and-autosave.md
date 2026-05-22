# 08 — Share via URL + autosave

Status: done

## Parent

`.scratch/scribblerig/PRD.md`

## What to build

Serverless sharing of the build, plus local persistence so work is never lost.

- **`share-codec`** (pure) — `scene ⇄ compressed URL string`: serialize the scene to JSON, deflate (e.g. pako), encode base64url into the URL fragment, and reverse it. Carry a **scene format version** in the payload (but **not** an engine version).
- **`ui`** — a Copy Link button that produces the share URL; on startup, if the URL fragment contains a scene, load it into the editor.
- **Autosave** — persist the current scene to localStorage so a refresh restores in-progress work. (Live URL sync is out of scope — explicit Copy Link only.)

Each viewer's browser re-simulates from the shared design graph; with the fixed timestep and shared WASM binary, runs match in practice (best-effort, not guaranteed).

## Acceptance criteria

- [x] Copy Link produces a URL that encodes the full current scene (bodies, connectors, room settings).
- [x] Opening that URL in a fresh session reconstructs the identical build.
- [x] An opened shared build can be edited and re-shared as a new link.
- [x] In-progress work autosaves to localStorage and is restored on refresh.
- [x] Sharing works with no account and no server / persistence backend.
- [x] Tests: `share-codec` round-trip — `decode(encode(scene))` deep-equals the original for arbitrary valid scenes; malformed/truncated input is handled gracefully.

## Blocked by

- `.scratch/scribblerig/issues/04-room-settings.md`
- `.scratch/scribblerig/issues/06-motor-connector-live-tuning.md`

## Comments

### 2026-05-22 — Implemented

Two modules: pure **`share/codec`** (`encodeScene`/`decodeScene` via
JSON → pako deflate → base64url) and impure **`share/storage`**
(`loadInitialScene`, debounced `saveScene`, `shareUrl`). A **Copy link** button
in the actions row writes the URL to the clipboard (prompt fallback where
clipboard access is blocked).

Per the developer's note, decode is **tolerant** so format/feature changes
degrade gracefully rather than break — `sanitizeScene` rebuilds a clean scene
through the registry: unknown body/connector types dropped, props coerced to the
schema (unknown ignored, missing/bad → registry default), connectors with
dangling endpoints dropped, `nextId` advanced past survivors. See
[ADR-0008](../../adr/0008-tolerant-share-and-autosave.md).

Startup precedence: shared URL fragment → localStorage autosave → default. An
imported fragment is stripped from the URL (`history.replaceState`) so a later
refresh restores the user's edits, not the original link.

79 tests pass (7 new codec: round-trip, malformed→null, and the four
degradation rules). Verified in-browser: dragging a platform autosaves it
(decoded from localStorage); loading a URL fragment with localStorage cleared
reconstructs the platform and clears the hash; a plain refresh restores from
autosave.

Found and fixed a related bug along the way: placement and delete called
`select()` without `bump()`, so the `revision`-keyed autosave missed them — both
now bump so every graph edit is persisted.

Out of scope (as specced): live URL sync (explicit Copy link only). The
clipboard *write* itself is browser-gated (needs a trusted gesture / secure
context), so the "Copied!" confirmation couldn't be exercised via synthetic
events — the URL it produces was verified correct.
