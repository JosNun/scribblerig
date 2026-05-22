# 14 — Mobile-friendly room, bounds, and bottom-sheet UI

Status: done

## Parent

`.scratch/scribblerig/PRD.md`

## Problem

The sandbox was built desktop-first: a wide 16×9 room, floating panels that
eat a phone's screen, no touch pan/zoom, and nothing stopping bodies from being
placed off in empty space outside the play area. On a phone it was cramped and
fiddly.

## What was built

- **Square, framed room.** Default room is now 12×12 m. The renderer draws an
  always-on doodle **boundary frame** (independent of which walls collide) so
  the play area reads as a defined space.
- **Placement bounds.** `editor.clampInsideRoom(size, body, position)` (pure,
  rotation-aware) keeps a body's whole bounding box inside the frame; wired into
  both palette drops and body dragging.
- **Pan & zoom** — see [issue 07](07-pan-and-zoom-camera.md). Two-finger
  pan/pinch on touch, wheel-zoom + middle-drag pan on desktop, a "Fit" (⤢)
  button, and zoom clamped to [8, 600] px/m.
- **Bottom-sheet UI on small screens** (`max-width: 720px`). Palette becomes a
  horizontal scrolling strip pinned at the base; a grabber expands the sheet to
  reveal the actions row and the selected body/connector/room properties.
  Selecting something auto-opens the sheet. Desktop keeps the floating panels.
- **Touch hardening.** Viewport meta locks page zoom; `overscroll-behavior:
  none` + `touch-action: none` stop scroll/pull-to-refresh from stealing
  gestures; hit tolerances and buttons enlarge on coarse pointers
  (`pointer: coarse`).

## Decisions (from the user)

- Touch model: **two-finger pan + pinch zoom**; one finger always edits.
- Panels collapse into a **bottom sheet** on phones.
- Extras chosen: responsive layout, page-gesture lock, bigger touch targets.
  (Double-tap-to-zoom was *not* selected.)

## Acceptance criteria

- [x] Room is square with a visible boundary; bodies can only be placed/dragged
      inside it.
- [x] The view pans and zooms on both touch and desktop, and the camera stays
      local (not serialized).
- [x] On a phone, panels collapse out of the way and the canvas is the focus.
- [x] The page itself doesn't scroll/zoom while interacting with the canvas.

## Comments

### 2026-05-21 — Implemented

65 tests pass; build clean. New pure helpers (`zoomAt`, `panBy`,
`clampInsideRoom`) are unit-tested. Verified in-browser at desktop and mobile
(375×812): square framed room, collapsed/expanded bottom sheet, wheel-zoom, and
a synthetic two-finger gesture all behaving with no console errors.

### 2026-05-21 — Drawer refined (vaul, default closed)

Replaced the custom sheet with **vaul** (`Drawer`, non-modal) for native drag
physics, and made it **default closed**. Because vaul owns vertical drag
gestures (conflicting with drag-to-place), the **mobile palette is now
tap-to-place**: tapping a body drops it in the room center; tapping a connector
arms the tool to draw on the canvas. Desktop keeps its floating panels and
drag-to-place untouched.

### 2026-05-21 — Separated palette from properties

Split the two concerns (per the chosen "palette strip + properties drawer"
design):

- **Palette strip** — a thin, always-visible bar pinned at the very bottom
  (tap-to-place). No button.
- **Properties drawer** — opened by an always-visible **handle bar** sitting
  just above the strip; the bar shows a **context label** of what's editable
  ("Room settings" / "Ball" / "Spring" …). Tapping it slides the vaul drawer up
  *over* the canvas (native drag-to-dismiss) with the selected item's props +
  actions. This removed the "Tools" button entirely.

Note: vaul's `snapPoints` were tried for an always-peeking handle but its snap
translate assumes the content fills the viewport (it translated a
content-height drawer off-screen), so the always-visible handle is a separate
bar that opens a plain (non-snap) vaul drawer instead. Verified in-browser:
closed state (handle + strip), tap-to-place updating the context label, and the
drawer sliding over the palette with the right properties — no console errors.

### 2026-05-21 — Single peek/expand drawer + drag-to-place

Final iteration (replaces the tap-to-open handle bar). One vaul drawer with
**snap points**: the peek shows the **handle + a horizontally-scrolling palette
row**; dragging the handle up reveals the selected item's **properties** (with
a context label) below the palette. Key details learned:

- vaul's snap translate is `viewportHeight − snap`, so the `Drawer.Content`
  must be **full viewport height** (`height: 100%`) — a content-height drawer
  snaps off-screen. The peek then shows the top (handle + palette).
- **`handleOnly`** on `Drawer.Root` makes vaul start drags only from the
  handle; otherwise its `onPress` captures the pointer on *every* pointerdown
  in the drawer (before the `data-vaul-no-drag` check) and fights placement.
- **Drag-to-place is back** (tap-to-place felt wrong): palette bodies use the
  pointer handlers with deferred capture + direction detection — a sideways
  swipe scrolls the strip (`touch-action: pan-x`), an upward drag lifts the
  shape onto the canvas. Palette buttons carry `data-vaul-no-drag`.

Verified in-browser: peek shows handle + scrollable palette (all six items
reachable), dragging a shape up places it (context label updates), and the
expanded drawer shows properties — no console errors.

### 2026-05-21 — Sheet body scrolls as one; palette fades when expanded

The palette and properties now live in a **single scroll container**, so the
palette scrolls off the top as you scroll the properties (instead of the
properties scrolling within a fixed sub-region). When the sheet is **expanded**
(full snap), the palette **fades** (opacity 0.3) since it's not the focus while
editing. Verified: forcing overflow scrolls the palette off the top, and the
expanded sheet dims the palette.
