# PRD: Lower the minimum size for platforms and balls

Status: needs-triage

## Parent

`.scratch/scribblerig/PRD.md`

## Problem

The current registry prop schema caps minimum sizes for the most
common bodies higher than is comfortable for fine-grained builds:

- **Ball** `radius` min = 0.1 m
- **Platform** `width` min = 0.5 m, `height` min = 0.1 m

Building the tutorial chain surfaced cases where the user wants a
small "marble" (radius ~0.05 m), a thin floor strip (height ~0.05 m),
or a narrow gate (width ~0.2 m). The minimums force a coarser
geometry than the design wants.

## Solution

Lower the schema mins in `src/registry/registry.ts`:

| Field             | Current min | Proposed min |
| ----------------- | ----------- | ------------ |
| `ball.radius`     | 0.1         | 0.02         |
| `platform.width`  | 0.5         | 0.1          |
| `platform.height` | 0.1         | 0.02         |

(Maxes unchanged.)

## Out of scope

- Lowering minimums on `spawner` (template behavior assumes a sane
  emit-shape size).
- Lowering on `text` (the `size` floor is driven by glyph-readability,
  not physics).

## Tuning watch

- Very small dynamic bodies can tunnel through static colliders at
  fixed timestep. Rapier's CCD isn't on by default. If we drop ball
  radius to 0.02 m and a user makes one go fast, it may pass through
  thin platforms. Likely fine for v1 (the user's complaint will be
  visual/clarity, not collision-quality), but worth flagging.

- The on-screen pixel size at the default room zoom (~55 px/m) makes
  a 0.02 m body ~1 px wide. That's tiny but selectable via the
  property panel; on-canvas drag/select gets fiddly. Acceptable
  tradeoff for the niche case where the user wanted small in the
  first place.

## Tests

- `registry.test.ts`: each prop's min in the schema matches what's
  written here.
- No sim test required — Rapier doesn't enforce minimums.

## Notes

- Came up while authoring the onboarding tutorial: the trampoline
  pad's height (0.2 m) and spring puck's radius (0.35 m) felt too
  fat. Smaller minimums let the author tune the chain visually
  without bumping into the schema floor.
