# ADR-0007 — Connectors as two-endpoint constraints compiled to Rapier joints

Status: accepted
Date: 2026-05-21

## Context

Connectors (spring, weld, pin) are jointless constraints with no collision
geometry of their own — only bodies collide ([CONTEXT.md](../../CONTEXT.md)). The
PRD model: a connector has two **endpoints**, each either a point on a body
(`{body, local}`) or a fixed point in world space (`{world}`). The fixed-point
form lets a connector ground to nothing (a pendulum hung from a fixed point).
Rapier joints, though, always connect *two rigid bodies*.

## Decision

`scene` stores connectors as an ordered array of `{ type, a, b, props }`; `sim`
compiles them after all bodies exist, iterating in array order (determinism).

- **World-point endpoints** get a **static anchor rigid body** at that world
  position, with a local anchor of (0,0). So every endpoint resolves to a
  (rigid body, local anchor) pair and the "ground to nothing" case needs no
  special joint API.
- **spring** → `JointData.spring(restLength, stiffness, damping, anchorA,
  anchorB)`. The two endpoints stay distinct (the spring spans the gap); rest
  length defaults to the creation distance.
- **pin** → `JointData.revolute(localOf(pivot, A), localOf(pivot, B))`. Both
  anchors are recomputed from a single pivot point (the world endpoint if there
  is one, else endpoint A) so they coincide — a clean free pivot.
- **weld** → `JointData.fixed(anchorA, 0, anchorB, rotA − rotB)`. The relative
  frame `rotA − rotB` locks the bodies in their **current** relative pose, so a
  weld fuses two platforms where they sit rather than snapping them to a shared
  orientation.
- Every joint sets `contactsEnabled = false`, so joined bodies don't fight at
  the joint (`collideConnected = false`).
- Deleting a body also removes connectors that referenced it
  (`removeBodyAndConnectors`), so no joint dangles to a missing body.

The **`snapping`** module (pure) chooses what a dragged endpoint binds to:
nearest named anchor within a threshold → exact point on a body → fixed world
point, with deterministic tie-breaking. The editor turns a draw gesture into two
snap results and `endpointOf` maps each to an `Endpoint`.

## Consequences

- Determinism (same-machine replay, [ADR-0003](0003-best-effort-determinism.md))
  holds for connectors too, since compile order is the array order.
- Connector geometry is rendered with plain (non-Rough) strokes computed from the
  live endpoint positions — a spring is a deterministic zigzag, a pin a ring at
  the pivot — so they don't shimmer as bodies move (cached Rough drawables can't
  stretch between two moving points).
- The connector model is engine-agnostic at the `scene` layer; only `sim` knows
  the joint API, preserving the [ADR-0002](0002-rapier-behind-sim-boundary.md)
  boundary.
