# 07 — Pan & zoom camera

Status: done

## Parent

`.scratch/scribblerig/PRD.md`

## What to build

Interactive camera controls over the room, extending the fixed camera transform established in slice 01.

- **`renderer` / `ui`** — pan (drag) and zoom (wheel / pinch-equivalent) the view; the camera applies a meters → pixels transform with adjustable offset and scale.
- Camera state is **local-only** — it is not part of the serialized scene and is not shared via the URL.

This slice is independent of the editing/connector work and can run in parallel after slice 01.

## Acceptance criteria

- [x] The user can pan the view by dragging and zoom in/out, in both build and run modes.
- [x] Placement, dragging, and snapping continue to work correctly under pan/zoom (screen ↔ world coordinate conversion is correct).
- [x] Camera state is not serialized into the scene or the share URL.
- [x] Camera transform math (screen ↔ world conversion) is covered by tests.

## Blocked by

- `.scratch/scribblerig/issues/01-falling-ball-tracer-bullet.md`

## Comments

### 2026-05-21 — Implemented (with mobile pass)

Camera is now mutable: pure `zoomAt(camera, screenPoint, factor)` and
`panBy(camera, dx, dy)` in `camera.ts` (tested); `fitCamera` is the
initial/"Fit" reset (⤢ in the transport). Gesture model:

- **Touch** — one finger edits as before; **two fingers pan + pinch-zoom**
  (tracked via a pointer map + a pinch midpoint/distance gesture). A second
  finger cancels any in-progress single-finger edit.
- **Desktop** — wheel zooms toward the cursor; **middle-button drag** pans.

Zoom is clamped to [8, 600] px/m. The view auto-fits on resize only until the
user pans/zooms, so a stray mobile resize (URL-bar show/hide) won't reset the
view mid-build. Camera state stays local (never in the scene). Done alongside
a square room + boundary frame and the mobile bottom-sheet UI (see the
mobile-friendliness issue).
