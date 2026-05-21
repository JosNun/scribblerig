# ADR-0006 — Body types are registry entries; geometry is shared descriptors

Status: accepted
Date: 2026-05-21

## Context

Adding a body type (ball, platform, wheel, …) must not require editing `sim`,
`renderer`, and `editor` each. The PRD's requirement: *"adding a new body type
requires only a registry entry."* But `sim` needs colliders (Rapier) and `renderer`
needs drawables (Rough.js), and the registry must stay pure — it can't import either,
or it would breach the engine boundary ([ADR-0002](0002-rapier-behind-sim-boundary.md)).

## Decision

A **`registry`** module holds one `BodyTypeDef` per type: `label`, `defaults`,
`isStatic(props)`, `shapes(props)`, `anchors(props)`, and a doodle `style`. It is pure
data + pure functions — **no Rapier, no Rough.js imports.**

Geometry is declared as engine-agnostic **shape descriptors**:

```
type Shape = { kind: "circle"; radius } | { kind: "box"; halfWidth; halfHeight }
```

This descriptor is the shared contract:

- `sim.compile` maps each `Shape` → a Rapier collider (`ball`/`cuboid`), and reads
  `restitution`/`friction`/`density` from props generically.
- `renderer` maps each `Shape` → a cached Rough.js drawable, styled by `style`.
- `editor.bodyAtPoint` hit-tests against the same `shapes`, in the body's local frame.

None of these three branch on the body *type* — they iterate the descriptors. Adding
a type is a single registry entry. The `wheel` type was added this way with zero
changes to `sim`/`renderer`/`editor` internals, which validates the seam.

## Consequences

- `scene` stores bodies as `{ type, position, rotation, props }`; the registry
  interprets `type` + `props`. `scene` stays a dumb, serializable graph.
- `anchors(props)` already returns named attachment points (platform corners/center,
  wheel/ball center) so the connector/snapping work (issues 05+) has its data source.
- New shape kinds (polygon, capsule) extend the `Shape` union and require a case in
  `sim` and `renderer` — a deliberate, localized change, not per-type branching.
- A type may also declare render-only **`marks`** (e.g. a wheel's spokes): geometry
  the `renderer` draws but `sim` ignores, since it has no collision meaning. This is
  how a wheel reads as a wheel (and its rotation is visible) without being physically
  different from a ball.
- Props are currently untyped (`Record<string, number | boolean>`); a per-type prop
  schema for the property panel comes with issue 03.
