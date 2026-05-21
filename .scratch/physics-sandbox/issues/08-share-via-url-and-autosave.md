# 08 — Share via URL + autosave

Status: ready-for-agent

## Parent

`.scratch/physics-sandbox/PRD.md`

## What to build

Serverless sharing of the build, plus local persistence so work is never lost.

- **`share-codec`** (pure) — `scene ⇄ compressed URL string`: serialize the scene to JSON, deflate (e.g. pako), encode base64url into the URL fragment, and reverse it. Carry a **scene format version** in the payload (but **not** an engine version).
- **`ui`** — a Copy Link button that produces the share URL; on startup, if the URL fragment contains a scene, load it into the editor.
- **Autosave** — persist the current scene to localStorage so a refresh restores in-progress work. (Live URL sync is out of scope — explicit Copy Link only.)

Each viewer's browser re-simulates from the shared design graph; with the fixed timestep and shared WASM binary, runs match in practice (best-effort, not guaranteed).

## Acceptance criteria

- [ ] Copy Link produces a URL that encodes the full current scene (bodies, connectors, room settings).
- [ ] Opening that URL in a fresh session reconstructs the identical build.
- [ ] An opened shared build can be edited and re-shared as a new link.
- [ ] In-progress work autosaves to localStorage and is restored on refresh.
- [ ] Sharing works with no account and no server / persistence backend.
- [ ] Tests: `share-codec` round-trip — `decode(encode(scene))` deep-equals the original for arbitrary valid scenes; malformed/truncated input is handled gracefully.

## Blocked by

- `.scratch/physics-sandbox/issues/04-room-settings.md`
- `.scratch/physics-sandbox/issues/06-motor-connector-live-tuning.md`
