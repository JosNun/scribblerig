# PRD: Rotate handle sits too far from selected items

Status: done

## Parent

`.scratch/scribblerig/PRD.md`

## Problem

Both the single-body rotate handle and the new group rotate handle
float ~0.8 m above the selection's AABB top, with a dashed leader
line bridging the gap. At the default room zoom (~55 px/m) that's
~44 px of empty space — much further away than feels natural for
"grab the handle and rotate."

In design tools (Figma/Sketch/Illustrator) the rotation affordance
sits right at the corner or a small fixed pixel offset outside the
bounding box. Ours feels disconnected from the thing it operates on.

## Solution

Start by **tightening the meter gap** — try 0.3 m as a first guess
(~17 px at default zoom). Both `editor.ts` constants are in one
place:

```ts
const ROTATE_GAP = 0.8;          // single-body
export const GROUP_ROTATE_GAP = 0.8;   // multi-select
```

Tune in the running app until it reads as "attached, not floating."

### Exploration: zoom-independent placement

A meter-based gap shrinks visually as you zoom out and grows as you
zoom in. At very low zoom the handle ends up inside the bounding box;
at very high zoom it drifts off-screen. A **pixel-based** offset
(e.g., 12 px regardless of zoom) is what design tools do, and would
keep the affordance consistent.

The renderer already knows the camera scale (it draws everything
through `worldToScreen(cam, ...)`); converting a pixel offset to a
world offset at draw time is straightforward:

```ts
const gapWorld = ROTATE_GAP_PX / cam.scale;
```

The pointer hit-test would mirror the same conversion, so the handle
hit area and visual position stay aligned.

Worth exploring after the initial meter-gap tightening lands. The
tradeoff: pixel-based feels right interactively, but a body in a
zoomed-out view ends up with its handle drawn outside its visual
bounds — could be confusing if the user is also zooming around with
the camera mid-rotate.

## Out of scope

- Re-styling the handle glyph itself (size, color, leader-line
  appearance). The complaint is about *distance*, not look.
- Adding *additional* handles to the group (resize handles for
  multi-select were intentionally skipped — a group's local frame
  isn't well-defined).

## Tests

- Visual / manual: zoom in and out, confirm the handle stays a
  comfortable distance and the dashed leader still reads as
  "this attaches to that."

## Notes

- Discovered while building the onboarding tutorial — group
  rotation feels usable but reaching for the handle takes more
  travel than expected.
- Both `ROTATE_GAP` and `GROUP_ROTATE_GAP` use the same value
  today (0.8 m). If we go zoom-independent, prefer one constant
  shared between single and group handles for consistency.
