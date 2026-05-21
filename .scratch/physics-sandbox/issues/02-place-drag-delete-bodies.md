# 02 — Place / drag / delete bodies from a palette

Status: done

## Parent

`.scratch/physics-sandbox/PRD.md`

## What to build

Make the scene editable in build mode instead of hardcoded. Introduce the widget **`registry`** and a palette so the user can build a contraption from real body types.

- **`registry`** — declare body types (platform, ball, wheel), each with geometry, named anchor points, a property schema (defaults are enough for this slice), a `compile` hook into `sim`, and a `draw` hook into `renderer`. Adding a body type should be a single registry entry.
- **`editor`** — build-mode input → `scene` mutations: click/drag from the palette to place a body, drag a placed body to reposition, click to select, delete the selected body. Optional grid snapping on placement/drag.
- **`ui`** — a palette of available body types and the build-mode chrome.

Bodies placed here flow through the existing `sim`/`renderer`/`clock` from slice 01, so placing bodies and hitting Play simulates them.

## Acceptance criteria

- [x] The palette lists platform, ball, and wheel; the user can place each into the room.
- [x] A placed body can be dragged to reposition it in build mode, selected, and deleted.
- [x] Grid snapping can be toggled and affects placement/drag alignment.
- [x] Placing bodies then pressing Play simulates exactly the placed scene; Reset restores the build.
- [x] Adding a new body type requires only a new `registry` entry (no changes to `editor`/`renderer`/`sim` internals).
- [x] `scene` mutation operations for add/remove/update bodies are covered by tests.

## Blocked by

- `.scratch/physics-sandbox/issues/01-falling-ball-tracer-bullet.md`

## Comments

### 2026-05-21 — Implemented (TDD)

26 tests passing (10 new). Switched the project to **bun** alongside this work (see ADR-0005).

New / changed modules:
- `src/registry/registry.ts` (new, pure) — `BodyTypeDef` per type (ball/platform/wheel) with `defaults`, `isStatic`, `shapes` (engine-agnostic `circle`/`box` descriptors), `anchors`, and doodle `style`. `bodyTypes()`, `def()`, `makeBody()`. The body-type extensibility seam — see [ADR-0006](../../../docs/adr/0006-registry-geometry-descriptors.md).
- `src/sim/sim.ts` — `compile` is now **registry-driven** (`compileBody` + `colliderDesc`); no per-type branching. Static bodies → fixed rigid bodies. `friction` now applied.
- `src/renderer/renderer.ts` — draws whatever `shapes` the registry declares, styled per type, still using the once-generated cached-drawable approach. Added a crisp dashed **selection** overlay (`draw(scene, transforms, selectedId?)`).
- `src/renderer/camera.ts` — added `screenToWorld` (inverse transform) for pointer → world.
- `src/editor/editor.ts` (new, pure) — `snapToGrid` and `bodyAtPoint` (rotation-aware hit-test against registry shapes, topmost-wins).
- `src/App.tsx` — real build/run editor: palette (Select + Ball/Platform/Wheel + Delete + Grid snap), pointer-driven place/drag/select, Delete key + button. Build mode draws design positions; Play compiles & simulates; Reset recompiles from the unchanged graph.

Verified in-browser: placed platform + wheel, dragged the wheel, pressed Play (ball + wheel fall and rest on the static platform), Reset restored the build exactly, deleted a body. Each type renders with a distinct doodle fill (hachure / cross-hatch / zigzag).

Extensibility check: `wheel` was added purely as a registry entry — no `sim`/`renderer`/`editor` internals changed for it.

Follow-ups (out of scope): rotate-body affordance (PRD story 5) not yet exposed in UI; property panel / per-type prop schema is issue 03; `ui` chrome currently lives in `App.tsx`.
