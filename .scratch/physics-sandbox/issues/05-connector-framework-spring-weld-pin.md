# 05 — Connector framework + spring / weld / pin

Status: ready-for-agent

## Parent

`.scratch/physics-sandbox/PRD.md`

## What to build

The connector model end-to-end, with three non-driven connector types and the snapping interaction that binds them.

Connectors are **jointless constraints with no collision geometry** — only bodies collide. A connector has two **endpoints**, each of which is either:
- a point on a body (a named anchor, or an arbitrary local point on the body), or
- a fixed point in world space.

- **`scene` / `registry`** — connector elements stored as an ordered array; declare spring (stiffness, restLength, damping), weld (rigid), and pin (free pivot) types, each compiling to the matching Rapier joint (DistanceJoint / WeldJoint / RevoluteJoint).
- **`snapping`** (pure) — given a dragged endpoint and candidate anchors, choose the target: nearby **named anchors** highlight and take priority; otherwise bind to the exact point on the body under the cursor; otherwise (empty space) bind to a fixed world point.
- **`editor` / `ui`** — drag a connector endpoint to attach; anchors highlight as you approach.
- Compile connectors with `collideConnected = false` so joined bodies don't fight at the pivot.

## Acceptance criteria

- [ ] A spring can be created between two bodies; adjusting stiffness/rest length/damping changes its behavior.
- [ ] A weld rigidly fuses two platforms so they move as one body.
- [ ] A pin lets a body rotate freely about a shared point (e.g. a pendulum hung from a fixed world point).
- [ ] Dragging a connector endpoint snaps to a named anchor when near one, else binds to an arbitrary point on the body, else to a fixed world point in empty space; candidate anchors highlight while dragging.
- [ ] Bodies joined by a connector do not collide with each other at the joint.
- [ ] Tests: `snapping` (correct nearest anchor within threshold, deterministic tie-break, no-snap outside threshold, fallback to body point / world point).

## Blocked by

- `.scratch/physics-sandbox/issues/03-configure-body-properties.md`
