# 23 — A connector through a stack joins every body it passes through

Status: ready-for-agent

## Parent

`.scratch/scribblerig/PRD.md`

## Problem

Click-to-place connectors (`placeOverlap` in [App.tsx](../../src/App.tsx)) only
ever join the **top two** bodies under the point — `ids[0]` and `ids[1]` from
`bodiesAtPoint`. So dropping a weld through **three** stacked bodies welds just
the top two; the third is left loose and still collides with the others.

The expected behaviour: when the click point passes through *all* the stacked
bodies, the connector should act on **all of them** — but only those the point
actually goes through (`bodiesAtPoint` already returns exactly that set, topmost
first). A welded stack should become **one solid entity**: rigid, and with no
collisions *between* its members (while still colliding with the world).

## The one organizing idea

A welded cluster is **compiled into a single Rapier rigid body with multiple
colliders**, not into separate bodies wired together with fixed joints. Colliders
on the same rigid body never contact each other, so "rigid + no internal
collision" comes for free — no fixed-joint compliance, no collision-group
bitmasks, no 16-group limit. The **design graph is unchanged**: bodies and weld
connectors stay distinct for editing, selection, and sharing
([ADR-0001](../../docs/adr/0001-design-graph-source-of-truth.md)). The merge
happens **only at compile time** ([ADR-0002](../../docs/adr/0002-rapier-behind-sim-boundary.md)),
so Reset/replay stays deterministic.

## Decisions (from the developer)

Scope is **all three** click-to-place connectors, but they split into two
mechanisms:

- **Weld → compound rigid body.** Compute connected components over the weld
  edges (deterministic, array order). Each component compiles to one rigid body
  whose colliders are each member's shape(s) placed at that member's pose
  relative to a chosen reference frame. Singletons compile as today.
  - **No collide toggle on weld** (this already holds — weld's registry
    `defaults`/`propSchema` are empty). Two welded bodies are fixed relative to
    each other, so there is no relative motion for a contact to resolve, and a
    compound body has no internal contacts anyway. So **every weld merges**;
    there is no "weld set to collide" fallback to handle.

- **Motor → compound rotor, driven vs. the world.** A motor through a stack welds
  the members into one rigid rotor (the same compound machinery) and drives that
  rotor about the pivot. Because the point passes through *all* the stacked
  bodies, there is no body left to be the stator, so it spins relative to the
  **world** — a fixed axle in space, the whole assembly turning as one piece.
  (Driving a stack relative to a base is naturally the existing two-body motor:
  the case where the pivot does *not* pass through the base.)

- **Pin → all-pairs shared axle.** A pin must keep the bodies free to rotate
  independently, so it does **not** merge them. Instead, create a pin between
  **every pair** at the point. Each pin's existing `collide = false` keeps that
  pair from clashing, so all pairs stop colliding while every body still rotates
  freely about the one shared pivot (a revolute only constrains the anchor points
  to coincide, not rotation). Redundant joints (C(N,2)), but it reuses all
  existing machinery and keeps the whole feature **free of collision groups** —
  the consistent choice given weld/motor use compound bodies. Fine at this app's
  stack sizes (2–4); if large pinned stacks ever matter, the compile step can be
  swapped to fan-of-pins + collision groups without touching the design graph.

### Static / mixed clusters

- If **any** member of a welded (or motor) compound is static (a platform with
  `static: true`), the **whole compound is fixed**. Welding to a static body
  anchors the cluster — the intuitive result.

## What to build

1. **`placeOverlap`** ([App.tsx](../../src/App.tsx)) — stop slicing to the top
   two. Use the full `bodiesAtPoint` list:
   - weld/motor: add the connectors that mark the whole set as one cluster (see
     "design-graph representation" below);
   - pin: add a pin for every pair at the point.
   - The single-body case (point through one body) keeps today's behaviour: weld
     locks it to a world point, pin pivots it about a world point, motor drives
     it about a world point.

2. **`sim` compile** ([sim.ts](../../src/sim/sim.ts)) — before creating bodies,
   group bodies by weld-connected component. Build one rigid body per component
   with all members' colliders at their relative poses; compute the reference
   pose and let Rapier derive mass/inertia from the colliders (density per
   member). A motor cluster is the same compound plus the powered joint to world.

3. **`sim.readTransforms`** — expand each compound's pose back to **per-member
   world transforms** so the renderer can still draw each body in its doodle
   style at the right place. `sim` tracks each member's local offset within its
   compound.

4. **Endpoint redirection** — any connector that references a merged body (a
   spring, or a pin/motor anchored to a body that got welded into a compound)
   must resolve to the **compound** rigid body, with its local anchor point
   transformed into the compound's frame.

### Design-graph representation (decide during implementation)

The graph must record "these bodies are one weld cluster" so `compile` can find
the components and `sanitizeScene` round-trips it. Prefer **reusing the existing
weld connectors as the cluster edges** (a weld is already "these two are rigid"),
so a stack of 3 stores 2 (or all-pairs) weld connectors and the compiler derives
the component — no new schema. Confirm the topology written for weld (chain vs.
fan vs. all-pairs *edges*) is enough for the component walk; edges only need to
connect the component, so a fan or chain of weld connectors is sufficient
(collision and rigidity come from the compound, not the weld count).

## Acceptance criteria

- [ ] A weld dropped where **N** bodies overlap welds **all N** into one rigid
      assembly that moves as a unit and whose members do **not** collide with
      each other (but still collide with the world and other bodies).
- [ ] Only the bodies the point actually passes through are joined (matches
      `bodiesAtPoint`); a point through only some of a loose pile leaves the rest
      untouched.
- [ ] A motor through a stack spins the whole stack as one rigid rotor about the
      pivot.
- [ ] A pin through a stack lets every body rotate freely about the shared pivot
      without the members clashing.
- [ ] Welding any body to a static body anchors the whole cluster in place.
- [ ] Each member still renders distinctly in its doodle style; selecting,
      editing, deleting, and sharing operate on the individual bodies/connectors
      as before. Reset replays the assembly identically.
- [ ] Weld still exposes no "Bodies collide" toggle (unchanged).

## Notes

- Builds on the connector framework
  ([issue 05](05-connector-framework-spring-weld-pin.md)), motor
  ([issue 06](06-motor-connector-live-tuning.md)), and per-connector collision
  ([issue 11](11-configurable-connector-collision.md), whose `collide` flag we
  now remove for weld). Relevant ADRs:
  [0007 connector joint compilation](../../docs/adr/0007-connector-joint-compilation.md),
  [0002 rapier behind sim](../../docs/adr/0002-rapier-behind-sim-boundary.md).
- Multi-collider rigid bodies are already used for multi-shape bodies in
  `compileBody`; this generalises that to multi-**body** compounds.
- `sim` is impure; verify in-browser (stack 3 balls, weld → they move as one and
  don't jiggle apart; motor → the stack spins; pin → they swing on a shared
  axle). Cover the pure parts (component grouping, transform expansion) with sim
  tests where practical.
- The compilation approach is recorded in
  [ADR-0009](../../docs/adr/0009-compound-bodies-for-welded-clusters.md).
