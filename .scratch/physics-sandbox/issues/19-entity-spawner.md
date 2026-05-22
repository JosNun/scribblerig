# 19 — Entity spawner

Status: needs-triage

## Parent

`.scratch/physics-sandbox/PRD.md`

## Problem

Every contraption today is a fixed set of bodies. There's no way to make a
*stream* of objects — a fountain of balls, a conveyor feed, a Rube-Goldberg
hopper that drips one thing at a time. We want a **spawner**: a placeable device
that emits copies of a little template of entities at a configurable interval
while the simulation runs.

## Concept

- A **spawner** is a small device you drop into the room like any other body.
- **Configure its contents** by opening its **little canvas** — a miniature
  build surface. Anything you place into that canvas (bodies + connectors) is a
  *template*, not live: it is the blueprint of what gets emitted.
- While **running**, the spawner emits a fresh copy of the template into the
  room every *interval* seconds, at the spawner's current position/angle, fired
  along the way the spawner is facing at a configurable launch speed (rotate the
  spawner to aim it).
- **Grouping / round-robin.** Within the template, entities that are **attached
  to each other** (joined by connectors) spawn together as **one item**. Two
  separate, unconnected groups are two items; the spawner **round-robins**
  through the separate items, emitting the next one each interval.
- **Bounded population.** Each spawner has a **max-alive** count; once reached,
  the **oldest** emitted item is removed as the next one appears, so the stream
  is steady and the count is predictable.

## Decisions (from the developer)

These three forks are settled; the rest is open for triage (see below).

- **Lifecycle = max-alive cap, recycle oldest.** A per-spawner `maxAlive` count.
  When `alive >= maxAlive`, removing the oldest item makes room for the new one.
  (No per-item lifetime in v1.)
- **Launch = aim by rotation + a speed property.** The launch direction **is the
  spawner's own rotation** (rotate the spawner to aim it) — there is no separate
  `direction` property. The only launch property is `speed` (m/s): `speed = 0`
  → a passive dropper; `speed > 0` → a cannon / fountain fired along the
  spawner's facing.
- **Spawner is a movable, connectable body.** It can be placed, dragged,
  rotated, and joined with connectors — so it can ride a motorised arm and spray
  items in a rotating fan, or swing on a pin. Each emitted item inherits the
  spawner's **current world position and angle** at the moment of emission.

## How it fits the architecture

The spawner sits cleanly inside the **design-graph → compiled-simulation**
split ([PRD](../PRD.md), [ADR-0001](../../docs/adr/0001-design-graph-source-of-truth.md)):

- The spawner's **config is design** — its props (`interval`, `maxAlive`,
  `speed`) and its **template sub-scene** live in the serialized
  design graph.
- The **emitted items are simulation** — ephemeral live bodies that exist only
  in the running Rapier world. They are **never written back into the design
  graph**. On **Reset** they vanish and the spawner re-emits from t=0, so
  same-machine reset-replay still reproduces the run exactly
  ([ADR-0003](../../docs/adr/0003-best-effort-determinism.md)): emission is
  driven by the fixed-timestep loop, and each spawner's timer + round-robin
  index reset at compile.

## What to build

### Scene / registry

- A **`spawner`** body type in the registry: a small fixed shape (a nozzle / box
  glyph), with a `BodyPreview`-style doodle. Its `propSchema` exposes
  `interval` (s), `maxAlive` (count), and `speed` (m/s), plus whether the device
  itself is `static`. (No `direction` property — aim is the spawner's rotation.)
- Extend the scene `Body` model with an optional **`template`**: a nested
  mini-scene (its own `bodies` + `connectors`, in spawner-local coordinates,
  origin at the emit point). Reuses the existing scene/registry types so a
  template is authored, validated, and serialized with the same machinery.

### Sim (engine-encapsulated)

- On compile, give each spawner runtime state: a timer accumulator, a
  round-robin index, and an ordered list of currently-alive emitted items.
- Precompute the template's **items** = connected components of the template
  connector graph (bodies with no connector are singleton items). Item order is
  deterministic (template array order) so round-robin is stable.
- Each fixed step: advance the timer; when it fires, if `alive >= maxAlive`
  remove the oldest item (despawn its bodies/joints), then instantiate the next
  round-robin item — its bodies + the connectors among them — into the Rapier
  world, transformed by the spawner's current world transform, with initial
  linear velocity of `speed` along the spawner's current facing (its rotation).

### Rendering of ephemeral bodies (architectural addition)

Emitted bodies are **not** in the design scene, so the renderer can't find them
by iterating `scene`. The `sim` step must expose, alongside the existing
`transforms`, a list of **ephemeral instances** (body type + props + transform,
and their connectors) so the renderer can draw them through the registry exactly
like design bodies. This is the one genuinely new seam the feature introduces.

### UI

- Selecting a spawner shows its props **plus an "Edit contents" affordance** that
  opens the **little canvas**: a miniature build surface (modal/overlay) that
  reuses the palette, placement, drag, rotate, and connector tools, scoped to
  template-local coordinates and a small bounded area. A direction arrow shows
  the launch aim. Works in desktop and the mobile drawer.
- The template canvas writes back into the selected spawner's `template`.
  Because aim follows the spawner's rotation, the launch arrow tracks the rotate
  gesture directly — no separate aim control.

### Serialization (must stay tolerant — [ADR-0008](../../docs/adr/0008-tolerant-share-and-autosave.md))

- The tolerant `sanitizeScene` must **recurse into `template`**: nested
  bodies/connectors of unknown type are dropped, props coerced/defaulted,
  dangling nested connectors dropped. An older build that doesn't know the
  `spawner` type drops it gracefully like any unknown body.

## Acceptance criteria

- [ ] A spawner can be placed, dragged, rotated, and connected like any body.
- [ ] Opening its little canvas lets you place bodies and connect them; the
      template persists with the build (autosave + share).
- [ ] On Play, the spawner emits a copy of the template every `interval`
      seconds at its current position/angle, launched at `speed` along the
      spawner's facing (`speed = 0` drops at rest); rotating the spawner re-aims
      it.
- [ ] Connected template entities spawn together as one item; multiple separate
      items round-robin one per interval.
- [ ] Never more than `maxAlive` items from a spawner are alive at once; the
      oldest is recycled when the cap is hit.
- [ ] Reset clears all emitted items and the spawner re-emits identically.
- [ ] Emitted (ephemeral) bodies render in the doodle style like design bodies.
- [ ] A spawner mounted on a moving body (e.g. a motor arm) emits items that
      follow its current transform — the "rotating fan" case.
- [ ] An old share/autosave without the `spawner` type still decodes (the
      spawner is simply dropped); a build with a malformed template degrades.

## Open questions (triage)

- **Little-canvas UX**: modal overlay vs. side panel; how its bounds/scale are
  shown; whether it previews the launch arrow live.
- **Ephemeral-body interaction during run**: are emitted items selectable /
  inspectable, or purely observed? (Leaning: observed only.)
- **Collisions**: do emitted items collide with each other and with the spawner?
  (Leaning: yes with each other; spawner non-colliding or a thin nozzle.)
- **Velocity inheritance**: should an item inherit the spawner's *linear*
  velocity at emit (so a fast-moving spawner throws items forward) in addition to
  the aim launch? (Nice-to-have for the rotating-fan feel.)
- **Defaults**: starting `interval`, `maxAlive`, `speed`.
- **Global budget**: interplay of several spawners' caps and overall body-count
  performance ceiling.

## Notes

- New, larger feature — extends the PRD beyond the v1 body/connector set. Likely
  warrants its own ADR for the design-graph `template` + ephemeral-body
  rendering seam once triaged.
- Related precedent: copy/paste & duplicate ([issue 17](17-copy-paste-duplicate.md))
  also instantiates fresh copies of entities — the "clone an item (bodies +
  their connectors), remap ids" logic likely overlaps with emitting a template
  item and could be shared.
