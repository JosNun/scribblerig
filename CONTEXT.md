# ScribbleRig — Context

ScribbleRig is a browser-based 2D physics sandbox in the spirit of *The Incredible
Machine*: drop bodies into a room, connect them, hit Play, watch physics unfold —
rendered in a hand-drawn doodle style and shareable via a URL with no account.
Un-named scenes ride entirely in the URL; named ones mint an opt-in `/s/<id>`
shortlink served by a small Cloudflare Worker.

Full product spec: [`.scratch/scribblerig/PRD.md`](.scratch/scribblerig/PRD.md).

## The one organizing idea

The **design graph is the source of truth**; the running simulation is a disposable
instance **compiled** from it. Serialization, sharing, and editing all operate on
the design graph. The physics engine never owns canonical state — Play compiles the
graph into a live world, Reset discards it and recompiles from the unchanged graph.
See [ADR-0001](docs/adr/0001-design-graph-source-of-truth.md).

## Glossary

Use these exact terms in code, tests, issue titles, and hypotheses. Don't drift to
synonyms.

- **Design graph** — the serializable scene that is the source of truth. The thing
  that gets shared. *Not* "the model" or "the state."
- **Scene** — the root design-graph object: `{ version, rooms[] }`. Holds ordered
  collections so compilation is deterministic.
- **Room** — a bounded play area with its own `settings` (gravity, walls, size),
  `bodies[]`, and `connectors[]`. v1 builds a single room; the schema accommodates
  many (+ portals) for v2 without rework.
- **Body** — has a position and rotation on the room. Most body types (ball,
  platform, spawner) also have mass and a collision shape; **text is the
  exception — a body that participates only in rendering and selection, never
  in collisions.** Bodies (when they have collision shapes) are still the only
  things that collide. Placed directly on a room. (The ball is the single
  circular body — radius, friction, bounciness, density — covering what were
  once separate ball and wheel types.)
- **Connector** — a constraint between two **endpoints** (spring, motor, rod, weld,
  pin). A joint, not a property of a body. **A connector has no collision geometry**
  — a motor just spins, it cannot collide.
- **Endpoint** — one end of a connector: either a **point on a body**
  (`{body, localPoint}`) or a **fixed point in world space** (`{worldPoint}`). The
  world-point form lets a connector ground to nothing.
- **Anchor** — a named attachment point a body type exposes (platform corners/center,
  ball center, rod ends). Connectors prefer-snap to nearby anchors.
- **Wall / boundary** — floor/ceiling/left/right of a room. Static collision
  boundaries (bodies bounce off them), **not** special anchor targets. To pin at a
  wall, place a fixed world-point endpoint there. Distinct from the **room frame**:
  an always-drawn outline of the square play area (default 12×12 m) that bodies
  are clamped inside (`editor.clampInsideRoom`), regardless of which walls collide.
- **Build mode / Run mode** — Build edits the design graph (physics paused). Run
  steps a compiled simulation forward. Certain props (e.g. motor speed) are
  live-editable during Run.
- **Compile** — turn the design graph into a live physics world, iterating bodies
  and connectors in **array order** (never hash/Set order) so the result is
  deterministic.
- **Fixed timestep / accumulator** — the sim advances in fixed 1/60s steps via an
  accumulator, decoupled from render framerate. Gives same-machine reset-replay.
  See [ADR-0003](docs/adr/0003-best-effort-determinism.md).
- **World units** — meters (MKS), not pixels. Bodies sized ~0.1–10 units. The
  renderer's camera scales meters → pixels.
- **Camera (view)** — pure meters→pixels transform with `scale` + origin
  (`camera.ts`: `zoomAt`, `panBy`, `fitCamera`). Zoom is wheel or pinch; pan is
  two-finger, middle-drag, right-drag, or Space + left-drag (Space only arms
  while the cursor is over the canvas, so it keeps its normal meaning
  elsewhere). Both work in build *and* run mode, and are **local-only** — never
  serialized into the scene or URL.
- **Drawable cache** — each shape's Rough.js drawable is generated **once** and
  cached; per frame only the canvas transform changes. Keeps the wobble from
  shimmering. See [ADR-0004](docs/adr/0004-roughjs-cached-drawables.md).

## Module boundaries

Pure modules carry the value and the tests; impure modules are thin shells.

| Module        | Purity | Responsibility |
| ------------- | ------ | -------------- |
| `scene`       | pure   | Design-graph data structures + operations. Source of truth. |
| `share/codec` | pure   | Scene ⇄ compressed base64url string. **Decode is tolerant** — rebuilds a clean scene through the registry, dropping unknown types/props and default-filling the rest, so format changes degrade instead of breaking. See [ADR-0008](docs/adr/0008-tolerant-share-and-autosave.md). |
| `share/sessions` | pure | Saved-build index logic: title derivation, upsert/sort/remove/most-recent. No browser deps. |
| `share/storage` | impure | Browser glue for **per-tab sessions**: `bootSession` (shared URL → this tab's session → lazy fork of the most-recent build), debounced per-session localStorage autosave, the builds list (load/new/delete/rename), and `shareUrl`. Tab id lives in `sessionStorage`. See [ADR-0008](docs/adr/0008-tolerant-share-and-autosave.md). |
| `registry`    | data   | Per-type declarations for bodies *and connectors*: geometry (shape descriptors), anchors, defaults, prop schema, style. The extensibility seam. See [ADR-0006](docs/adr/0006-registry-geometry-descriptors.md). |
| `snapping`    | pure   | Given a dragged endpoint + candidate anchors, choose the target: nearest named anchor (within threshold) → body point → fixed world point. Deterministic tie-break. |
| `clock`       | pure   | Fixed-timestep accumulator + play/pause/reset state machine. |
| `sim`         | impure | Wraps Rapier. compile → world, step, readTransforms, live setters. **The only Rapier importer.** See [ADR-0002](docs/adr/0002-rapier-behind-sim-boundary.md). |
| `renderer`    | impure | Draw cached Rough.js drawables under a camera transform (`camera` is pure + tested). |
| `editor`      | pure   | Build-mode logic: `snapToGrid`, `bodyAtPoint` hit-testing. Pointer/DOM plumbing lives in the React layer. |
| `ui`          | impure | Palette, schema-driven property panel, controls, share. *(in `App.tsx` for now)* |

## Tooling

- **bun** is the package manager and JS runtime ([ADR-0005](docs/adr/0005-bun-package-manager.md)).
  Vite + TypeScript + React for the app; **Vitest** for tests (`bun run test`).
- Run the app: `bun run dev`. Build: `bun run build`. Test: `bun run test`.
