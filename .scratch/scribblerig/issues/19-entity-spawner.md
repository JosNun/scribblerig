# 19 — Entity spawner

Status: done

## Parent

`.scratch/scribblerig/PRD.md`

## Problem

Every contraption today is a fixed set of bodies. There's no way to make a
*stream* of objects — a fountain of balls, a conveyor feed, a Rube-Goldberg
hopper that drips one thing at a time. We want a **spawner**: a placeable
device that emits copies of a little template of entities at a configurable
interval while the simulation runs.

## Concept

- A **spawner** is a small fixed-size device you drop into the room like any
  other body.
- **Configure its contents** by selecting it — a small **popover canvas**
  opens anchored to the glyph, showing a miniature build surface. Anything
  you place into that canvas (bodies + connectors) is a *template*, not
  live: it is the blueprint of what gets emitted.
- While **running**, the spawner emits a fresh copy of the template into
  the room every *interval* seconds, at the spawner's current position /
  angle, fired along the spawner's facing at a configurable launch speed
  (rotate the spawner to aim it).
- **Grouping / round-robin.** Within the template, entities **attached to
  each other** (joined by connectors) spawn together as **one item**. Two
  separate, unconnected groups are two items; the spawner **round-robins**
  through them, emitting the next one each interval.
- **Bounded population.** Each spawner has a **max-alive** count; when the
  cap is hit, the **oldest** emitted item is removed *before* the next one
  is emitted (atomic swap, never over cap).

## How it fits the architecture

The spawner sits cleanly inside the **design-graph → compiled-simulation**
split ([PRD](../PRD.md), [ADR-0001](../../adr/0001-design-graph-source-of-truth.md)):

- The spawner's **config is design** — its props (`interval`, `maxAlive`,
  `speed`, `static`) and its **template sub-scene** live in the serialized
  design graph.
- The **emitted items are simulation** — ephemeral live bodies that exist
  only in the running Rapier world. They are **never written back into the
  design graph**. On **Reset** they vanish and the spawner re-emits from
  t = 0, so same-machine reset-replay still reproduces the run exactly
  ([ADR-0003](../../adr/0003-best-effort-determinism.md)): emission is
  driven by the fixed-timestep loop, and each spawner's timer +
  round-robin index reset at compile.

## Decisions

### Spawner body

- Fixed small glyph (~0.5m). Rotatable, **not** resizable.
- A regular body in the design scene: placeable, draggable, rotatable,
  connectable. `static` prop defaults to `false` (so it falls / hangs
  unless held by a connector — same semantics as other bodies).
- Each spawner gets its own Rapier **interaction group**. It **ignores its
  own emissions** (a cannon doesn't recoil from its own shot) but collides
  with everything else, including items from *other* spawners.

### Template

- Stored as `Body.template?: { bodies: Body[]; connectors: Connector[] }`.
  **Not** a full `Room` — no sub-gravity, no walls.
- **Unbounded.** Items can be authored at any offset from origin. Origin
  maps to the spawner's current world transform at emit time.
- **Self-contained.**
  - Template connectors may only reference bodies in the same template.
  - Templates may not contain another spawner.
  - Sanitizer enforces both: drops cross-scope connector refs, strips any
    nested spawner.
- **Grouping** = connected components of the template's connector graph
  (bodies with no connector are singleton items). Items are ordered by
  template array order; round-robin starts at index 0 and is stable across
  template edits that don't reorder.
- **Aggregate-bbox cue:** in the main canvas, render a faint hachured
  outline around the spawner sized to the union of template item bounds,
  so users see what'll come out without opening the popover.

### Emission

- Per-spawner runtime state on compile: timer accumulator, round-robin
  index, FIFO list of alive item handles.
- Each fixed step, advance the timer; on fire:
  1. If `alive >= maxAlive`, despawn the oldest item (its bodies + their
     joints). This happens **before** the new emission — never over cap.
  2. Instantiate the next round-robin item: clone its bodies + the
     connectors among them, transformed by the spawner's current world
     transform.
  3. Initial linear velocity per emitted body:
     `v = spawner_lin_vel + spawner_ang_vel × (item_world_pos − spawner_pos) + speed × spawner_facing`.
     Items inherit the spawner's motion at the emit point so a rotating
     fan naturally flings them outward.
- All items emitted by one spawner share that spawner's interaction group.

### Sim ↔ render seam (the new piece)

Extend `SimWorld` so the renderer can draw ephemeral bodies alongside the
design scene:

```ts
interface Frame {
  transforms: Map<id, { position; rotation }>; // design bodies
  ephemerals: Array<{
    id: string;     // sim-generated, e.g. "ephem:<spawnerId>:<seq>"
    type: BodyType;
    props: Props;
    transform: { position; rotation };
    connectors: Array<{ type; props; a; b }>; // refs scoped to this spawn
  }>;
}
```

The step loop produces a single atomic `Frame` snapshot per tick. The
renderer iterates `scene.bodies` for design draws, then iterates
`frame.ephemerals` and draws each through the existing registry — same
doodle style, no special case. Ephemerals are **never** written back to
the scene and are invisible to picking and the props panel.

### UI: popover and scope

- Selecting a spawner in **design mode** opens a small **popover** anchored
  to its glyph on the canvas. The popover contains only:
  - Its own canvas surface (own `Camera`, own `Renderer` instance).
  - An origin crosshair at template (0, 0).
  - An aim arrow pointing along the spawner's +x facing.
- Edge-flips to stay on-screen.
- The popover is **small by design** — it nudges users toward small
  templates. It hosts no palette and no props panel.
- **Drag / rotate the spawner** → hide the popover for the duration of the
  gesture; show again on pointerup.
- **Click outside the popover** (or on any non-spawner body) → pop scope
  back to root, popover closes. **Click another spawner** → popover
  switches to its template.
- **Play mode** is read-only across the editor; the popover does not open
  during Play.
- The **main right-panel** reflects whichever entity is currently selected
  in the active scope:
  - Spawner selected → spawner props (`interval`, `maxAlive`, `speed`,
    `static`).
  - Item inside the template selected → that item's normal props.
- Active-scope stack has depth 1: either `root` or `template:<spawnerId>`.

### UI: palette and drop-target scope

- One main palette (existing). Drop-target scope is decided by which
  canvas element the pointer is over at **pointerup**:
  - Drop over the popover canvas → added to `template.bodies`.
  - Drop over the main canvas → added to `scene.bodies` as today.
- Connector draws follow the same rule: the canvas where the gesture
  **starts** defines the scope. Crossing the popover boundary mid-gesture
  doesn't move the new connector between scopes.

### Serialization (tolerant — [ADR-0008](../../adr/0008-tolerant-share-and-autosave.md))

- `sanitizeScene` recurses into `body.template` once:
  - Sanitize each nested body via the same per-body sanitizer (unknown
    types dropped, props coerced / defaulted).
  - Sanitize each nested connector; drop any whose endpoints don't resolve
    inside the template (no cross-scope refs).
  - Strip any nested body of type `spawner` (no nesting).
- An older build that doesn't know the `spawner` type drops the spawner
  gracefully like any unknown body — no schema break.

### Defaults & warnings

- New spawner: `interval = 1.0s`, `maxAlive = 10`, `speed = 0`, `static = false`.
  This is a passive dropper — calm first-Play behaviour, easy to crank up.
- Per-spawner cap only. No global ceiling.
- When `maxAlive > 100`, show a small `⚠ large values may slow the sim`
  hint next to the field in the props panel.

## What to build (file map)

### Scene / registry

- `src/scene/scene.ts`
  - Extend `Body` with `template?: { bodies: Body[]; connectors: Connector[] }`.
  - Extend `BodyType` to include `"spawner"`.
  - New helper `cloneItem(bodies, connectors)` generalising the existing
    `duplicateBody`: clones a set of bodies and the connectors among them
    with fresh ids, returning `{ bodies, connectors, idMap }`. Reused by
    emit *and* by the existing duplicate / paste paths in `App.tsx`.

- `src/registry/registry.ts`
  - One new `BodyTypeDef` entry in `ORDER` + `BY_TYPE`. Label "Spawner".
  - `propSchema` for `interval` (s), `maxAlive` (count), `speed` (m/s),
    `static` (bool). `defaults` per the table above.
  - `shapes()` returns the glyph; `anchors()` for connector attachment;
    `isStatic()` returns `props.static`.

### Sim

- `src/sim/sim.ts`
  - Per-spawner runtime state on `compile`: timer, RR index, FIFO of alive
    item handles, allocated Rapier interaction group.
  - Replace `readTransforms()` callers with `readFrame()`; the new method
    returns the `Frame` shape above.
  - Step loop: per fixed timestep, advance each spawner's timer; on fire,
    despawn-oldest-then-emit-next per the formula above. Tag emitted
    bodies with the spawner's interaction group.
  - Sequence ids for ephemerals: `ephem:<spawnerId>:<seq++>`.

### Renderer

- `src/renderer/renderer.ts`
  - After the design-body pass, iterate `frame.ephemerals` and draw each
    through the registry exactly like a design body, then draw its
    connectors.
  - Draw the aggregate-bbox outline around each spawner in the main view
    (faint hachure, computed from template item bounds; cached per scene
    edit, not per frame).

### UI

- `src/ui/SpawnerPopover.tsx` (new)
  - Floating panel, own canvas element, own `Camera`, own `Renderer`,
    anchored via the spawner's screen position with edge-flip.
  - Renders the template scene + origin crosshair + aim arrow.
  - Forwards palette drop / connector draw / item drag / item selection
    events to the same handlers as the main canvas, scoped to
    `activeScope: { kind: 'template', spawnerId }`.

- `src/App.tsx`
  - Track `activeScope` ref. Branch palette-drop and connector-draw
    handlers on the canvas the pointer is over.
  - Hide popover during spawner drag / rotate gestures; show on
    pointerup. Gate popover open by design vs run mode.
  - Selection: clicking outside popover pops scope to root and closes
    popover; clicking another body either switches the popover (if also a
    spawner) or closes it.

- `src/ui/PropertyPanel.tsx`
  - Add a per-field warning slot (optional render under a `PropField`),
    used by `maxAlive` when value > 100. Keep it generic so future props
    can reuse it.

### Serialization

- `src/share/codec.ts`
  - `sanitizeBody` checks for `body.template` and recurses: sanitize
    nested bodies (drop nested spawners explicitly), then sanitize nested
    connectors against the *post-sanitize* nested-body id set.

### Tests

- `src/scene/scene.test.ts` — `cloneItem` produces fresh ids and remaps
  connector refs; existing duplicate path still works after the refactor.
- `src/sim/sim.test.ts` — emission timing on a fixed timestep, round-robin
  order, atomic despawn-then-emit at cap, velocity inheritance formula
  (including angular term), per-spawner interaction-group filtering.
- `src/share/codec.test.ts` — `sanitizeScene` drops cross-scope connector
  refs in a template, strips nested spawners, and a spawner with a valid
  template round-trips losslessly.

## Acceptance criteria

- [ ] A spawner can be placed, dragged, rotated, and connected like any body.
- [ ] Selecting a spawner in design mode opens a small popover anchored to
      its glyph showing the template canvas with an origin crosshair and
      aim arrow.
- [ ] Dragging or rotating the spawner hides the popover until pointerup;
      deselecting closes it; clicking another spawner switches to its
      popover.
- [ ] In Play mode the popover does not open (editor is read-only).
- [ ] Dropping a palette tile over the popover canvas adds it to the
      spawner's `template`; dropping over the main canvas adds it to the
      scene as today.
- [ ] Connector draws started inside the popover stay scoped to the
      template even if the gesture crosses out.
- [ ] An item inside the popover, when selected, drives the main
      right-panel to show its props (and only its props).
- [ ] On Play, the spawner emits a copy of the next round-robin item every
      `interval` seconds at its current world transform, with initial
      velocity `spawner_lin + ω × offset + speed × facing`.
- [ ] Connected template entities spawn together as one item; unconnected
      groups round-robin one per interval in template array order.
- [ ] Never more than `maxAlive` items from a spawner are alive at once;
      the oldest is despawned *before* the new one appears (no over-cap
      frame).
- [ ] A spawner mounted on a moving body (e.g. a motor arm) emits items
      that follow its current transform and inherit its motion at the
      emit point — the rotating-fan case visibly works.
- [ ] Items emitted by a spawner do not collide with that spawner; they
      do collide with other bodies, other spawners, and items from other
      spawners.
- [ ] A spawner with no template emits nothing on Play (no errors).
- [ ] Reset clears all emitted items; the spawner re-emits identically
      from t = 0.
- [ ] Emitted (ephemeral) bodies render in the doodle style like design
      bodies and never enter the design scene or the picking pool.
- [ ] A faint aggregate-bbox outline is drawn around the spawner in the
      main canvas, sized to the union of template item bounds.
- [ ] `maxAlive > 100` surfaces a "may slow the sim" hint next to the
      field in the props panel.
- [ ] An old share / autosave without the `spawner` type still decodes
      (the spawner is dropped); a build with a malformed template
      degrades gracefully (cross-scope refs dropped, nested spawners
      stripped).

## Notes

- Likely warrants its own ADR for the design-graph `template` field plus
  the `readFrame()` ephemeral-rendering seam — these are the two genuinely
  new architectural pieces.
- The `cloneItem` helper unifies what `duplicateBody` does today
  ([issue 17](17-copy-paste-duplicate.md)) with what emit needs — share
  the id-remap logic rather than reimplementing it.
