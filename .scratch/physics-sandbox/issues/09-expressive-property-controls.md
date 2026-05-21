# 09 — Expressive property controls (replace plain sliders/checkboxes)

Status: needs-triage

## Parent

`.scratch/physics-sandbox/PRD.md`

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

## Open questions (resolve in triage)

- What's the target control set, and which properties use which?
- Custom-drawn (Rough.js/SVG) vs. styled native inputs — how far to go for the
  doodle look vs. accessibility/keyboard support?
- Does the `PropField` schema need new `kind`s (angle, vector, enum), and do
  those belong here or alongside the features that need them (room gravity =
  issue 04)?

## Acceptance criteria (draft — firm up in triage)

- [ ] Numeric and boolean properties are edited with on-theme controls that fit
      the doodle aesthetic.
- [ ] The panel stays fully schema-driven: adding a property to a `registry`
      schema surfaces an editor with no panel code change.
- [ ] Controls remain keyboard-accessible and usable with precise values.

## Blocked by

- `.scratch/physics-sandbox/issues/03-configure-body-properties.md` (done)
