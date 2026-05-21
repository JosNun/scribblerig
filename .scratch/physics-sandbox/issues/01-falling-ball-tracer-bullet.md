# 01 — Falling-ball tracer bullet

Status: done

## Parent

`.scratch/physics-sandbox/PRD.md`

## What to build

The foundational end-to-end tracer bullet: the thinnest complete path through every layer, proving the core loop and the hand-drawn doodle feel.

Scaffold the app (Vite + TypeScript + React + Vitest) and stand up minimal versions of the core modules so a single hardcoded ball falls under gravity, bounces off the room floor, and is drawn in a stable hand-drawn style — with working play/pause/reset.

- **`scene`** — minimal design graph: one room with a floor boundary and one hardcoded ball. Bodies/connectors stored as ordered arrays.
- **`sim`** — wrap Rapier (2D, WASM) behind a clean interface: `compile(scene) → world`, `step(dt)`, `readTransforms()`. World units are meters; bodies sized in the ~0.1–10 range. Iterate the graph in deterministic (array) order when compiling.
- **`clock`** — fixed-timestep accumulator (1/60s) decoupled from render framerate, plus a play/pause/reset state machine. Reset discards the live `sim` instance and recompiles from the unchanged `scene`.
- **`renderer`** — Canvas 2D + Rough.js. Generate each shape's rough drawable **once** and cache it; each frame translate/rotate the context and redraw the cached drawable (no per-frame re-roughening, so the wobble doesn't shimmer). Apply a (fixed, for now) camera transform mapping meters → pixels.

This is intentionally the one "thick" slice because no thinner cut is demoable; everything after this edits or extends these modules.

## Acceptance criteria

- [x] App builds and runs locally via the Vite toolchain (React + TypeScript), with Vitest wired up.
- [x] A hardcoded ball falls under gravity and bounces off the room floor in a live Rapier simulation.
- [x] The scene is rendered with Rough.js cached drawables on Canvas 2D; line wobble stays stable (does not shimmer) as the ball moves.
- [x] Play, Pause, and Reset controls work; Reset returns the ball to its exact starting state.
- [x] On the same machine, Reset replays the run identically (fixed timestep, deterministic compile order).
- [x] Rapier is referenced only inside `sim`; no other module imports it.
- [x] Tests: `scene` (graph construction/ops), `clock` (accumulator advances the correct number of fixed steps incl. catch-up + remainder; state-machine transitions), `sim` (structural — expected bodies/joints created; same-machine replay checksum over N steps).

## Blocked by

- None - can start immediately

## Comments

### 2026-05-21 — Implemented (TDD)

Scaffolded Vite + React + TypeScript + Vitest and built the four core modules. 16 tests passing.

Modules:
- `src/scene/scene.ts` — design graph (`createScene`, `addBody`/`removeBody`/`updateBody`, `tracerScene`); pure, ordered arrays, deterministic ids via a `nextId` counter.
- `src/clock/clock.ts` — fixed-timestep accumulator (epsilon-tolerant at the step boundary so FP drift never leaks a step) + `build`/`running`/`paused` state machine.
- `src/sim/sim.ts` — the **only** Rapier importer (`@dimforge/rapier2d-compat`). `initSim`, `compile`, `step`, `readTransforms`, `checksum` (FNV-1a over `world.takeSnapshot()`). Walls built as static colliders; floor top sits at world y=0.
- `src/renderer/camera.ts` (pure, tested) + `src/renderer/renderer.ts` — Rough.js drawables generated once and cached, redrawn under a per-body canvas transform so the wobble is baked and does not shimmer.
- `src/App.tsx` — Play/Pause/Reset + rAF loop driving clock → sim → renderer. Reset frees the live world and recompiles from the unchanged graph.

Notes / decisions:
- World units are meters; camera is a fixed 50 px/m, y-flipped.
- Rapier's soft contacts allow ~0.1 m penetration at high impact speed; the `sim` test asserts the ball stays clear of the floor surface (no tunneling) and rebounds, rather than zero penetration.
- Verified in-browser: ball falls, bounces, settles; Reset returns it to the exact start (y=6).

Follow-ups (out of scope here): bundle is one large chunk (Rapier WASM embedded by the compat build) — fine for now; `CONTEXT.md` + `docs/adr/` not yet created.
