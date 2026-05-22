# 10 — Interactive demo popovers for properties

Status: needs-triage

## Parent

`.scratch/scribblerig/PRD.md`

## What to build

Static help text (issue: added inline) explains *what* a property is. This goes
further: clicking a property's help affordance opens a popover with a tiny
**side-by-side animated demo** showing the same scene with only that one property
differing — e.g. a spring at stiffness 100 vs 200, or a ball at restitution 0.2 vs
0.9 — both running so the difference is obvious at a glance.

## Sketch

- Each `PropField` (or a per-property entry) declares a small demo scene plus the
  two contrasting values to compare.
- The popover runs two miniature simulations (reuse `sim` + `renderer` at a small
  fixed canvas size, fixed timestep, looping) side by side, each labelled with its
  value.
- Likely a looped, auto-reset mini-clock so the comparison repeats.

## Open questions (triage)

- How are demo scenes authored — hand-built per property, or derived from defaults?
- Performance: several tiny Rapier worlds at once; do we cap how many run, pause
  off-screen ones, or pre-render to a short loop?
- Does this share the demo infrastructure with onboarding/examples later?

## Acceptance criteria (draft)

- [ ] Clicking a property's help opens a popover with two looping mini-demos that
      differ only in that property, each labelled with its value.
- [ ] The demos are readable and don't tank performance.

## Blocked by

- `.scratch/scribblerig/issues/03-configure-body-properties.md` (done)
