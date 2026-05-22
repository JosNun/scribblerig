# 21 — Corner resize should anchor the opposite corner (Alt = symmetric)

Status: done

## Parent

`.scratch/scribblerig/PRD.md`

## Problem

Dragging a box's corner handle currently resizes **symmetrically about the
body's center** — both sides grow/shrink together and the center stays put. That
isn't how direct manipulation usually feels: dragging a corner should **move
just that corner**, keeping the *opposite* corner pinned, so you can reshape from
an edge. Symmetric resize is still useful, so it should move to a **modifier**:
hold **Alt/Option** to resize symmetrically about the center.

## Current behaviour

[`applyResize`](../../src/editor/editor.ts) (`editor.ts`) computes, for a corner
handle, `width = |local.x| * 2` and `height = |local.y| * 2` — i.e. it mirrors
the dragged corner through the center. It returns only size `Props`; the body's
`position` is never touched, so the center is fixed and the resize is symmetric.

## Desired behaviour

- **Default (no modifier): anchor the opposite corner.** Dragging e.g. the `ne`
  handle keeps the `sw` corner fixed in world space; the dragged corner follows
  the pointer. The new size is the box spanned by the anchor corner and the
  pointer, and the body's **center moves** to the midpoint of the two corners.
- **Alt/Option held: symmetric about center** — today's behaviour (center fixed,
  both sides resize together).
- Works for a **rotated** body: do the math in the body's **local frame** (the
  opposite corner stays pinned along the body's own axes), then map the new
  center back to world. The rotation is unchanged.
- **Circles** keep their current radius-from-center behaviour — there's a single
  `radius` handle, so "anchor the opposite corner" doesn't apply. (Alt is a
  no-op for circles.)
- **Clamping**: when a dimension hits its schema min/max, the anchored corner
  must stay fixed (clamp the size, then recompute the center from the anchor, so
  the box doesn't drift).

## Implementation notes

- `applyResize` returns only `Props` today. Anchored resize also moves the
  center, so it needs to return a **position** as well — e.g. change it to return
  `{ props, position }` (symmetric mode returns the unchanged position). Update
  the handle-drag branch in `App.tsx` (around the `applyResize` call in
  `onCanvasPointerMove`) to apply both.
- Thread the **Alt** state from the pointer event (`e.altKey`) into the resize
  call. Touch pointers have no Alt, so touch gets the default anchored resize —
  which is the expected, natural behaviour there.
- Keep it a pure function so it stays unit-testable (see below).

## Acceptance criteria

- [ ] Dragging a box corner moves only that corner; the opposite corner stays
      put and the body recenters accordingly.
- [ ] Holding Alt/Option resizes symmetrically about the center (today's
      behaviour).
- [ ] Both modes behave correctly on a rotated box (opposite corner pinned along
      the body's local axes; rotation unchanged).
- [ ] Hitting a width/height min or max keeps the anchor corner fixed (no drift).
- [ ] Circles are unaffected (radius from center; Alt is a no-op).

## Notes

- `applyResize` is a pure, unit-tested function ([editor.test.ts](../../src/editor/editor.test.ts));
  this is a good TDD change — add tests for anchored resize (opposite corner
  fixed, center moves), the Alt symmetric path, the rotated-body case, and
  clamping-keeps-anchor, then update the existing symmetric-resize expectations.
- Related: place/drag/delete bodies ([issue 02](02-place-drag-delete-bodies.md))
  and configure-properties/rotate ([issue 03](03-configure-body-properties.md)),
  which introduced the handles.
