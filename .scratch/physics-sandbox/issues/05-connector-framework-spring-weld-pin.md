# 05 — Connector framework + spring / weld / pin

Status: done

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

- [x] A spring can be created between two bodies; adjusting stiffness/rest length/damping changes its behavior.
- [x] A weld rigidly fuses two platforms so they move as one body.
- [x] A pin lets a body rotate freely about a shared point (e.g. a pendulum hung from a fixed world point).
- [x] Dragging a connector endpoint snaps to a named anchor when near one, else binds to an arbitrary point on the body, else to a fixed world point in empty space; candidate anchors highlight while dragging.
- [x] Bodies joined by a connector do not collide with each other at the joint.
- [x] Tests: `snapping` (correct nearest anchor within threshold, deterministic tie-break, no-snap outside threshold, fallback to body point / world point).

## Blocked by

- `.scratch/physics-sandbox/issues/03-configure-body-properties.md`

## Comments

### 2026-05-21 — Implemented (TDD)

57 tests passing. See [ADR-0007](../../../docs/adr/0007-connector-joint-compilation.md).

- `scene`: `Connector { type, a, b, props }` with `Endpoint = {body,local} | {world}`;
  pure `addConnector`/`removeConnector`/`updateConnector` and
  `removeBodyAndConnectors` (deleting a body drops its connectors).
- `registry`: spring/weld/pin type defs (defaults + prop schema); `makeConnector`.
- `snapping` (new, pure) — `snap()`: nearest named anchor within threshold →
  body point → fixed world point, deterministic tie-break. 6 required tests.
- `sim`: connectors compile to Rapier joints — spring→`spring`, pin→`revolute`,
  weld→`fixed` (relative frame preserves current pose). World endpoints get a
  static anchor body; every joint sets `contactsEnabled = false`. Behavioural
  tests: pendulum swings at fixed arm length, weld keeps relative pose, spring
  contracts toward rest length.
- `renderer`: draws connectors from live endpoint positions (spring = zigzag,
  weld = bar + rivets, pin = ring) with a non-Rough stroke so they don't shimmer;
  plus a draw-time overlay (rubber-band preview + snap highlight).
- `editor`: `connectorAtPoint` (pick a connector by its line) + `endpointWorld`.
- `ui`/`App`: a connector tool (click Spring/Weld/Pin to arm, drag start→end to
  draw; Esc cancels). `PropertyPanel` generalized to drive body *and* connector
  props. Connectors are selectable and deletable like bodies.

Verified in-browser: drew a pin pendulum (swings on Play), drew a spring
(zigzag; panel shows Stiffness/Rest length/Damping). Weld covered by sim test.

Follow-ups: connector endpoints aren't re-editable after creation (delete + redraw);
no live tuning yet (motor + live tuning is issue 06).
