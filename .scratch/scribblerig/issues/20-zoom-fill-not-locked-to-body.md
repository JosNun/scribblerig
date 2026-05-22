# 20 — Hachure fill swims when zooming (not locked to the body)

Status: ready-for-agent

## Parent

`.scratch/scribblerig/PRD.md`

## Problem

When you zoom the camera, a body's **outline scales** with the view but its
**hachure fill does not** — the fill lines keep a constant on-screen spacing, so
they slide and redistribute across the shape as you zoom. The fill looks like
it's *moving* relative to the object instead of being painted onto it. It should
be **locked to the item**: zooming should scale the fill pattern along with the
body, like ink on paper.

## Diagnosis

Bodies are drawn as Rough.js drawables generated in **screen-pixel** space —
shape dimensions are multiplied by `cam.scale` in
[`roughShape`](../../src/renderer/renderer.ts) (`renderer.ts`), and the drawable
cache is cleared and regenerated whenever the camera scale changes
(`setCamera`). So the *geometry* rescales correctly on zoom.

But the **fill** options aren't scaled. Rough.js draws a hachure/cross-hatch
fill as parallel lines whose spacing (`hachureGap`) and thickness (`fillWeight`)
default to **fixed pixel values**, independent of `cam.scale`. So as the body
regenerates larger (zoom in) or smaller (zoom out), the fill lines keep the same
on-screen gap — their count and position *relative to the shape* change every
zoom step. That's the "swimming" fill.

The same applies to the cross-hatched **wall** fill (`drawWall`).

## Proposed fix

In `roughShape` (and the wall fill), set the fill options proportional to
`cam.scale` so the fill pattern is anchored in **world space** rather than
screen pixels:

- `hachureGap`: a world-space gap × `cam.scale` (pick a gap in meters that
  reproduces today's look at the default zoom).
- `fillWeight`: likewise scaled, with a sensible floor so very-zoomed-out fills
  don't vanish.

Because drawables are already keyed/regenerated per camera scale, scaling these
options is sufficient — the cache will hold the correct fill at each zoom level.
Keep the per-body `seed` so the doodle wobble stays stable (no shimmer, per
PRD story 27).

## Acceptance criteria

- [ ] Zooming in/out scales a body's hachure fill together with its outline; the
      fill stays locked to the shape (no sliding/redistributing lines).
- [ ] The look at default zoom is unchanged from today.
- [ ] The cross-hatched wall fill is locked the same way.
- [ ] Fill stays visible (doesn't collapse to nothing) when zoomed far out, and
      doesn't become a dense smear when zoomed far in.
- [ ] Doodle wobble remains stable across frames (no shimmer).

## Notes

- Renderer is impure (canvas); verify in-browser via the preview — zoom a filled
  ball/wheel/platform and watch the fill, rather than adding a unit test.
- Related: pan & zoom camera ([issue 07](07-pan-and-zoom-camera.md)); doodle
  rendering stability (PRD story 27, "line wobble stays stable, not shimmer").
