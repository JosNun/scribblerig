# ADR-0008 — Share via URL fragment + autosave, with tolerant decode

Status: accepted
Date: 2026-05-22

## Context

The product promise is a build that is **shareable with no account and no
backend** ([CONTEXT.md](../../CONTEXT.md)), plus not losing in-progress work to a
refresh. The design graph is already the serializable source of truth
([ADR-0001](0001-design-graph-source-of-truth.md)). A shared link or an autosave
may have been written by a **different version of the app** than the one opening
it — the schema (body/connector types, their props) evolves. Decoding must not
hard-fail when it meets data it doesn't fully recognize.

## Decision

A pure **`share/codec`** module and a thin impure **`share/storage`** shell.

- **Encoding** — `JSON.stringify(scene)` → deflate (`pako`) → **base64url**. The
  result drops into a URL fragment (`#…`), which is never sent to a server. The
  scene already carries `version: SCENE_VERSION`; we encode that, **not** an
  engine/Rapier version (re-simulation is best-effort per
  [ADR-0003](0003-best-effort-determinism.md), so pinning an engine version
  would buy nothing).
- **Tolerant decode** — `decodeScene` never trusts the parsed JSON. It runs
  `sanitizeScene`, which **rebuilds a clean current-format scene through the
  registry**:
  - bodies/connectors of an unknown `type` are **dropped** (the registry is the
    authority on what types exist);
  - props are coerced against each type's schema — **unknown keys ignored**,
    **missing or wrong-typed values fall back to the registry default**;
  - a connector whose endpoint references a body that didn't survive is dropped
    (no dangling joints, mirroring `removeBodyAndConnectors`);
  - `nextId` is advanced past every surviving id so later edits don't collide.

  So adding, removing, renaming, or retyping a body/connector/prop **degrades
  gracefully**: old links keep opening, just without the parts this build can't
  represent. Truncated/garbage input returns `null` and the caller falls back.
- **Startup precedence** (`loadInitialScene`): shared **URL fragment** →
  **localStorage autosave** → default scene. A fragment that decodes is imported
  and then **stripped from the URL** (`history.replaceState`) so a later refresh
  restores the user's autosaved edits instead of re-importing the original link.
- **Autosave** — debounced write of the encoded scene to localStorage on every
  scene mutation (keyed off the `revision` bump that all graph edits raise).
  Best-effort: failures (private mode, quota) are swallowed.

## Consequences

- The codec is pure and unit-tested: `decode(encode(scene))` deep-equals the
  original for valid scenes, malformed input yields `null`, and the degradation
  rules (drop unknown type, coerce/default props, drop dangling connectors,
  advance `nextId`) are each covered. Forward/backward compatibility lives in one
  tested place rather than scattered version checks.
- `SCENE_VERSION` is still carried for future *explicit* migrations (e.g. a value
  that needs rescaling), but the sanitizer means most schema changes need **no**
  migration code at all — unknown is simply dropped, missing is defaulted.
- Camera state stays local and unserialized (per CONTEXT), so a shared link
  reconstructs the *build*, not someone's viewport.
- New runtime dependency: `pako` (deflate). Chosen over the platform
  `CompressionStream` because it is synchronous and works identically in the
  browser and in Vitest (Node), keeping the codec a simple pure round-trip.

## Addendum — per-tab sessions (issue 18)

The single autosave key was generalized so **each browser tab holds its own
build** and past builds are browsable.

- **Tab identity in `sessionStorage`** (`physics-sandbox:sid`) — per-tab and
  reload-stable; a fresh tab has none and mints one.
- **Per-session scenes** under `physics-sandbox:scene:<id>`, plus a
  `physics-sandbox:sessions` index of `{ id, title, updatedAt }`. The old single
  `physics-sandbox:scene` key is migrated into a session on first boot. A
  **preview thumbnail** (the scene rendered fit-to-room into a small offscreen
  canvas, transparent PNG) is saved under `physics-sandbox:thumb:<id>` — its own
  key so the index stays small and a thumbnail write hitting quota can't lose the
  build.
- **`bootSession` precedence**: shared URL fragment (fresh session) → this tab's
  own persisted session (stable reload) → **lazy fork of the most-recent build**.
  The lazy fork shows the most-recent content under a new id but is *not* written
  until the first edit, so glance-and-close tabs leave no clutter and edits never
  clobber the source build. Autosave is therefore skipped until the first edit
  (`revision > 0`).
- **Pure vs. impure split** holds: index/title logic is the tested pure
  `share/sessions`; `share/storage` is the thin localStorage/sessionStorage shell.
- **Known edge**: localStorage is shared across tabs, so the session *index* is
  last-write-wins if two tabs save at the same instant — acceptable since each
  tab almost always touches only its own row. Camera stays local, so switching
  builds never carries a viewport.
