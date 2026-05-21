# 03 — Configure body properties + rotate

Status: ready-for-agent

## Parent

`.scratch/physics-sandbox/PRD.md`

## What to build

A schema-driven property panel so a selected body can be configured, plus rotation.

- **`ui`** — a generic property panel that renders editors from the selected body type's `propSchema` in the `registry`. No per-type panel code.
- **`registry`** — flesh out property schemas: platform (friction, static?), ball (radius, restitution, density), wheel (radius, density, friction).
- **`editor`** — rotate the selected body (free rotation; angle is part of the body's transform in `scene`).
- Property edits in build mode write to `scene`; the next Play compiles them into `sim`.

Property serialization comes for free from the schema, keeping the scene fully serializable for later sharing.

## Acceptance criteria

- [ ] Selecting a body shows a property panel generated from its schema.
- [ ] Editing platform friction/static, ball radius/restitution, and wheel properties changes simulation behavior on the next run.
- [ ] A body can be rotated in build mode and its angle persists in the scene and into the simulation.
- [ ] Toggling a platform to static makes it immovable in the simulation.
- [ ] The property panel is fully driven by `registry` schemas (adding a property to a schema surfaces it with no panel code change).

## Blocked by

- `.scratch/physics-sandbox/issues/02-place-drag-delete-bodies.md`
