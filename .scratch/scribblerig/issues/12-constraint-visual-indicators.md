# 12 — Visual indicators for connector constraints

Status: done

## Parent

`.scratch/scribblerig/PRD.md`

## What to build

Numbers like "rest length: 2.0" are abstract. Visualize a connector's key
constraints in the viewport so they're legible at a glance and while editing:

- **Spring rest length** — show the natural (rest) length, e.g. a faint ghost
  coil/segment at rest length along the spring's axis, or tick marks, so the user
  sees how stretched/compressed the spring currently is vs its rest state.
- Possibly: pin pivot emphasis, weld rigidity cue, and a stretch/compression
  colour or thickness hint that updates live in run mode.

Should fit the hand-drawn doodle aesthetic and not clutter the scene (subtle,
maybe only for the selected connector or on hover).

## Decisions (from the developer)

- **Spring rest length** — shown **only when the spring is selected**, in both
  build and run mode (so a selected spring shows its rest span live as it
  stretches).
- **Motor direction** — make the existing always-on rotation arrow
  **direction-aware**: it curves clockwise when the motor drives clockwise and
  counter-clockwise when it drives counter-clockwise, reflecting the
  `reverse`/speed config. Always-on, in both build (configured direction) and run
  (live). This replaces the current fixed-direction arc.
- Pin pivot / weld rigidity cues are **deferred** for now.

## Acceptance criteria (draft)

- [x] A selected spring shows its rest length visually, so the meaning of the
      number is obvious without reading it.
- [x] Indicators are subtle and on-aesthetic.
- [x] The motor's rotation arrow points in its actual spin direction.

## Blocked by

- `.scratch/scribblerig/issues/05-connector-framework-spring-weld-pin.md` (done)

## Comments

### 2026-05-22 — Implemented

Renderer-only (`renderer.ts`). A selected spring draws a faint dashed segment of
its rest length, centred on the live midpoint, with end ticks — the gap between
the live endpoints and the ticks reads as stretch/compression. The motor arc is
now direction-aware: it sweeps (and its arrowhead points) counter-clockwise for a
non-reversed motor, clockwise when `reverse` is on, in both build and run. Pin
pivot / weld rigidity cues deferred. Verified in-browser (rest marker renders
selected-only; motor arc flips with the reverse toggle). 99 tests pass.
