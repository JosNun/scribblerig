# ADR-0009 — Welded clusters compile to compound rigid bodies

Status: accepted
Date: 2026-05-22

## Context

A connector dropped where several bodies overlap should act on **every** body the
point passes through, not just the top two ([issue 23](../../.scratch/scribblerig/issues/23-connector-through-stack-joins-all.md)).
For a **weld** the desired result is a single *solid entity*: the members move as
one rigid piece **and** do not collide with each other (while still colliding with
the world).

[ADR-0007](0007-connector-joint-compilation.md) compiles each connector to a
Rapier joint, and collision between two joined bodies is governed per-joint
(`joint.setContactsEnabled`). That model can only suppress collision for pairs
that actually have a joint. Making *all* members of a cluster mutually
non-colliding therefore forces an unhappy choice:

- a fixed joint between **every pair** — `C(N,2)` joints, quadratic and visually
  cluttered, and it doesn't even generalise (you can't have N motors driving one
  stack); or
- Rapier **collision-group bitmasks** — only 16 groups exist, they need
  allocation and lifecycle management, and a body that belongs to more than one
  cluster needs careful bit juggling.

Both fight the grain. A welded cluster is conceptually *one body*, and Rapier
already gives us that: **a rigid body can own many colliders, and colliders on the
same body never contact each other.**

## Decision

A maximal set of bodies connected by welds — a **connected component over the weld
edges** — compiles to **one Rapier rigid body with one collider per member**, each
placed at that member's pose relative to the compound's reference frame. Rigidity
and "no internal collision" then hold *by construction*: there are no internal
joints to be compliant, and same-body colliders never collide. **No fixed joints
between welded members, and no collision groups anywhere in the feature.**

- **Weld** carries no `collide` prop (already true — its registry `defaults`/
  `propSchema` are empty), so every weld between two bodies merges. A weld to a
  fixed **world point** (a single body) is not a merge; it stays a joint/anchor as
  in ADR-0007.
- **Motor** through a stack uses the same compound as the **rotor**, plus a
  velocity-driven revolute to a world anchor: the whole assembly spins as one rigid
  piece about the pivot. (The point passes through every stacked body, so there is
  no body left to be the stator — it drives against the world.)
- **Pin** does *not* merge: a hinge must let its bodies rotate independently.
  Instead it creates an **all-pairs revolute** at the shared point, reusing the
  existing contacts-disabled behaviour to keep the members from clashing. This is
  deliberately **not** collision groups — keeping the whole feature group-free is
  worth the redundant (but bounded) joints at this app's stack sizes. If large
  pinned stacks ever matter, the compile step can switch to fan-of-pins +
  collision groups **without touching the design graph**.
- **Mixed clusters**: if any member is static, the whole compound is **fixed**.

The merge is **compile-time only**. The design graph keeps the individual bodies
and weld connectors, so editing, selection, sharing, and Reset/replay are
unchanged ([ADR-0001](0001-design-graph-source-of-truth.md)); the engine knowledge
stays inside `sim` ([ADR-0002](0002-rapier-behind-sim-boundary.md)). To bridge the
two views, `sim` records each member's local offset within its compound and uses
it to:

- **expand** the compound's pose back into per-member world transforms, so
  `readTransforms` still returns one transform per design body and the renderer
  draws each in its own doodle style; and
- **redirect** any connector endpoint that references a merged body (a spring, or a
  pin/motor anchored to a body that got welded in) onto the compound rigid body,
  with the local anchor transformed into the compound frame.

Components and offsets are derived from the graph in **array order** on every
compile, so same-machine reset-replay determinism
([ADR-0003](0003-best-effort-determinism.md)) is preserved.

## Consequences

- Perfectly rigid welds (no fixed-joint compliance or jitter), cheaper to solve,
  and free of the 16-group collision-mask limit. Because weld components are
  disjoint, **a body belongs to exactly one compound** — the multi-cluster
  bit-allocation problem simply doesn't arise.
- This is the one place the system deviates from the otherwise-implied "one design
  body → one rigid body" mapping. `compile` gains connected-component grouping,
  compound assembly, transform expansion, and endpoint redirection — the bulk of
  issue 23's work, and all contained in `sim`.
- **Supersedes part of ADR-0007**: a weld joining two bodies no longer compiles to
  a Rapier *fixed joint* — it becomes shared membership in a compound body. The
  pin and motor revolute compilation, world-point static anchors, body-order rule,
  and spring handling from ADR-0007 are unchanged.
- The renderer and the rest of the app are unaffected: they still see one transform
  per body.
