# 07 — Pan & zoom camera

Status: ready-for-agent

## Parent

`.scratch/physics-sandbox/PRD.md`

## What to build

Interactive camera controls over the room, extending the fixed camera transform established in slice 01.

- **`renderer` / `ui`** — pan (drag) and zoom (wheel / pinch-equivalent) the view; the camera applies a meters → pixels transform with adjustable offset and scale.
- Camera state is **local-only** — it is not part of the serialized scene and is not shared via the URL.

This slice is independent of the editing/connector work and can run in parallel after slice 01.

## Acceptance criteria

- [ ] The user can pan the view by dragging and zoom in/out, in both build and run modes.
- [ ] Placement, dragging, and snapping continue to work correctly under pan/zoom (screen ↔ world coordinate conversion is correct).
- [ ] Camera state is not serialized into the scene or the share URL.
- [ ] Camera transform math (screen ↔ world conversion) is covered by tests.

## Blocked by

- `.scratch/physics-sandbox/issues/01-falling-ball-tracer-bullet.md`
