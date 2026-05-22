# 03 — Configure body properties + rotate

Status: done

## Parent

`.scratch/scribblerig/PRD.md`

## What to build

A schema-driven property panel so a selected body can be configured, plus rotation.

- **`ui`** — a generic property panel that renders editors from the selected body type's `propSchema` in the `registry`. No per-type panel code.
- **`registry`** — flesh out property schemas: platform (friction, static?), ball (radius, restitution, density), wheel (radius, density, friction).
- **`editor`** — rotate the selected body (free rotation; angle is part of the body's transform in `scene`).
- Property edits in build mode write to `scene`; the next Play compiles them into `sim`.

Property serialization comes for free from the schema, keeping the scene fully serializable for later sharing.

## Acceptance criteria

- [x] Selecting a body shows a property panel generated from its schema.
- [x] Editing platform friction/static, ball radius/restitution, and wheel properties changes simulation behavior on the next run.
- [x] A body can be rotated in build mode and its angle persists in the scene and into the simulation.
- [x] Toggling a platform to static makes it immovable in the simulation.
- [x] The property panel is fully driven by `registry` schemas (adding a property to a schema surfaces it with no panel code change).

## Blocked by

- `.scratch/scribblerig/issues/02-place-drag-delete-bodies.md`

## Comments

### 2026-05-21 — Implemented (TDD)

39 tests passing (13 new). Shipped the schema-driven panel **plus** on-canvas
direct-manipulation handles (resize corners + rotate), beyond the issue's
panel-only scope, at the developer's request.

- `registry`: added `PropField` + a `propSchema` per type (ball/platform/wheel),
  and `width`/`height` to the platform so it's resizable. Invariant test: every
  schema field has a typed default.
- `editor` (pure): `bodyHandles` (corner/radius + rotate handle), `bodyToWorld`,
  `handleAtPoint`, `applyResize` (boxes symmetric about center, circles by
  distance, clamped to schema range), `applyRotation` (aligns the upward handle
  to the pointer).
- `ui/PropertyPanel.tsx`: generic editor rendering sliders/checkboxes from
  `propSchema` — zero per-type code.
- `renderer`: draws resize/rotate handles (crisp overlays) for the selected body.
- `App`: handle-drag takes priority over body-drag on pointerdown; a revision
  counter re-renders panels on scene-ref edits; resize/rotate are un-snapped for
  smoothness.

Verified in-browser: placed a platform, resized it via a corner (3×0.4 → 5.6×1.8,
panel updated live), rotated it via the handle (angle persisted), unchecked Static
and pressed Play — the now-dynamic platform fell, proving prop edits reach `sim`.

Follow-ups (out of scope): rotation is free (no angle-snap); no numeric entry for
position; connectors are issue 05.
