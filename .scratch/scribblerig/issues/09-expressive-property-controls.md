# 09 — Expressive property controls (replace plain sliders/checkboxes)

Status: done

## Parent

`.scratch/scribblerig/PRD.md`

## What to build

The property panel (issue 03) currently renders plain HTML range sliders and
checkboxes. They work but feel generic and clash with the hand-drawn doodle
aesthetic (PRD stories 26–27). Replace them with more expressive, on-theme
controls — while keeping the schema-driven model so adding a property is still a
single `registry` entry with no per-type panel code.

This is a **design-led** item: the exact control vocabulary needs decisions
before implementation (hence `needs-triage`). Some directions to evaluate:

- Doodle-styled sliders/knobs/toggles drawn with Rough.js, consistent with the
  canvas.
- Direct value scrubbing (drag a number left/right to change it), so fine
  numeric control doesn't depend on slider pixel width.
- Richer control *kinds* in the schema beyond `number`/`boolean` — e.g. an angle
  dial, a 2D vector pad (useful for room gravity in issue 04), an enum/segmented
  control, a color/material swatch.

Precedent already in the codebase: `src/ui/DirectionDial.tsx` is a spinnable
radial control used for gravity direction in the room panel. It's a good model
for the "show the value, don't make the user read a number" direction — this
issue would bring that quality to the rest of the controls (and ideally fold a
dial-like `kind` into the schema so it's reusable).

## Open questions (resolve in triage)

- What's the target control set, and which properties use which?
- Custom-drawn (Rough.js/SVG) vs. styled native inputs — how far to go for the
  doodle look vs. accessibility/keyboard support?
- Does the `PropField` schema need new `kind`s (angle, vector, enum), and do
  those belong here or alongside the features that need them (room gravity =
  issue 04)?

## Decisions (from triage, 2026-05-23)

- **Scope.** Restyle the two existing kinds (`number`, `boolean`) **and** add a
  new `angle` kind. `vector` / `enum` are deferred — gravity stays
  strength + angle for now (two schema fields), not a single 2D pad.
- **Render approach.** Spike first: build the **number scrubber** twice —
  once as **custom SVG**, once as a **Rough.js generator** drawable rendered
  inline in React — and compare side-by-side in real context. Pick the winner;
  apply that style to scrubber, boolean toggle, and angle dial.
- **Numeric control.** Scrubber + typeable number box. Same mental model as
  today; only the slider gets a haircut.
- **Boolean control.** Doodle checkbox (sketchy square + hand-drawn check),
  not a toggle switch.
- **Stability.** The Rough.js wobble must be **stable** per control (memoize
  drawables; move the knob via SVG transform, never regenerate the drawable
  per value change) — matches the PRD's "no shimmer" rule for the canvas.
- **Spike location.** Two extra rows at the top of `PropertyPanel` labeled
  `[SVG]` and `[Rough]`, both wired to the first numeric field of the selected
  body. Visible only while the spike is live; removed when the winner is
  picked.

## Acceptance criteria

- [ ] Spike: both scrubber implementations render at the top of
      PropertyPanel, bound to the same prop; either feels distinct enough to
      pick a winner.
- [ ] Numeric properties are edited with the winning doodle-styled scrubber
      + a number box for precise values.
- [ ] Boolean properties are edited with a doodle-styled checkbox.
- [ ] New `PropField` kind `"angle"` exists and renders a doodle-styled dial
      in the generic panel.
- [ ] Room gravity direction flows through the schema as an `angle` field;
      `RoomSettingsPanel` no longer hand-wires `DirectionDial`.
- [ ] Panel stays fully schema-driven: adding a property to a `registry`
      schema surfaces an editor with no per-type panel code.
- [ ] Controls remain keyboard-accessible (arrow keys nudge by step) and
      usable with precise values via the number box.

## Blocked by

- `.scratch/scribblerig/issues/03-configure-body-properties.md` (done)

## Comments

### 2026-05-23 — Implemented

Phase 1 (spike): built `NumberScrubberSVG.tsx` (hand-rolled SVG, pre-baked
sine wobble) and `NumberScrubberRough.tsx` (rough.js generator, stable per
geometry). Mounted both at the top of `PropertyPanel` bound to the first
numeric field of the selected entity. **Rough.js won** — the SVG version
looked too clean and slidered-y; the rough one matched the canvas bodies.

Phase 2: promoted the Rough scrubber to the regular numeric control, deleted
the SVG version, removed the spike block. After feedback bumped the knob
(13 → 17px), beefed the track stroke (1.8 → 2.5), gave tick marks visible
wobble, and changed knob fill from `solid` ink to **hachure** ink — the
hachure reads obviously *filled* at the 17px scale where a solid disc
looked like just a thick outline (the roughness wobble overlapped the fill
edge). Hachure also matches the body fills (ball / platform) so the knob
looks part of the same drawing.

Built `DoodleCheckbox` — sketchy square with a hand-drawn check, real
`<input type="checkbox">` invisibly overlaid so Space / click / screen
reader / focus-visible all work natively (no `role=checkbox` re-implementation).

Added `PropField.kind: "angle"` and built `DoodleDial` — Rough.js dial
face + cardinal tick marks + an ink arrow with an accent-green tip blob.
The arrow is generated once pointing **down** at the origin and rotated by
`<g transform="rotate(-value, cx, cy)">` so the wobble is stable per the
PRD's no-shimmer rule (rotation isn't regeneration). Replaces the old
hand-rolled `DirectionDial.tsx`, which is deleted.

Refactored `RoomSettingsPanel` to route everything through the schema-driven
`PropertyPanel`: gravity decomposes into two `PropField`s — `gravityStrength`
(number, 0–20) and `gravityDirection` (angle). Walls become four boolean
fields. Direction is held in local state so a chosen angle survives a
strength → 0 collapse (the Vec2 stored in `RoomSettings` would otherwise
lose its angle when length is zero).

Extracted `RoughGroup` (the React renderer for `rough.generator()`
`Drawable`s) into `src/ui/rough-react.tsx` so scrubber / checkbox / dial all
share one rendering policy for `path` / `fillPath` / `fillSketch` op-sets.

Tests: +12 in `PropertyPanel.test.tsx` (boolean → DoodleCheckbox, number
→ scrubber, angle → DoodleDial, both kinds together, empty schema, and a
**sweep** asserting every registered body & connector type renders without
throwing — locks in the schema-driven invariant), +5 in
`RoomSettingsPanel.test.tsx` (gravity decomposition into strength + dial,
walls → 4 checkboxes). 126 passing, build clean.

Note: tests render via `renderToStaticMarkup` (node env, no jsdom) — assert
on the produced HTML structure. Click behaviour is exercised through the
real app; that surface is small enough to verify visually.
