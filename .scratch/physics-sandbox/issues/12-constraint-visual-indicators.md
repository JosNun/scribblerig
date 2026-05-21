# 12 — Visual indicators for connector constraints

Status: needs-triage

## Parent

`.scratch/physics-sandbox/PRD.md`

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

## Open questions (triage)

- Always-on, selected-only, or hover-only?
- Static (build-mode) indicator vs live (run-mode) stretch feedback — both?

## Acceptance criteria (draft)

- [ ] A selected spring shows its rest length visually, so the meaning of the
      number is obvious without reading it.
- [ ] Indicators are subtle and on-aesthetic.

## Blocked by

- `.scratch/physics-sandbox/issues/05-connector-framework-spring-weld-pin.md` (done)
