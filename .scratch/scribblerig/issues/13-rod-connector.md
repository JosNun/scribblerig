# 13 — Rod connector (rigid link with per-end joint modes)

Status: needs-triage

## Parent

`.scratch/scribblerig/PRD.md`

## What to build

A **rod**: a rigid link of fixed length between two *separated* points (unlike
`pin`, which is now a single shared-point hinge — see
[ADR-0007](../../adr/0007-connector-joint-compilation.md) / issue 05). The rod is
the rigid cousin of the spring (which is the elastic version of the same "two
separated endpoints" shape). It's listed in the PRD's connector set
(spring, motor, **rod**, weld, pin).

Each **end** can be configured independently:

- **pivot** — the rod is free to rotate where it attaches (a revolute at that end), or
- **anchored** — the rod is rigidly fixed to the body at that end (welded).

So one connector covers: rigid rod with two pivots (a linkage bar), a rod welded
at one end and pivoting at the other (an arm), etc. This is the generalization
the developer sketched ("a stick where you set each end to spin or be anchored").

## Sketch

- New connector type `rod` with a fixed length (default = creation distance) and a
  `endA` / `endB` mode each in `{ pivot, fixed }`.
- `sim` compiles it — likely a short rigid body for the bar plus a revolute or
  fixed joint at each end (or a fixed-distance constraint with the chosen end
  behaviours). Needs research against the Rapier joint set.
- Drawn as a straight rigid bar; ends marked pivot (ring) vs fixed (rivet).
- Drawn/created with the existing drag-to-draw gesture (two separated points),
  like the spring.

## Open questions (triage)

- Best Rapier construction for "rigid bar, per-end pivot/fixed" — explicit bar
  body + two joints, vs. a constraint pair? Mass of the bar?
- Property panel UI for the two per-end mode toggles.

## Acceptance criteria (draft)

- [ ] A rod rigidly links two separated bodies/points at a fixed length.
- [ ] Each end can be set to pivot or anchored, and the simulation honours it.

## Blocked by

- `.scratch/scribblerig/issues/05-connector-framework-spring-weld-pin.md` (done)
