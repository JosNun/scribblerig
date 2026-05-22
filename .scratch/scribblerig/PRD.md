# PRD: ScribbleRig

Status: ready-for-agent

ScribbleRig is a browser-based physics sandbox in the spirit of *The Incredible Machine*, with a hand-drawn doodle aesthetic and serverless sharing.

## Problem Statement

People who want to tinker with simple 2D physics — building little contraptions out of platforms, balls, springs, and motors — have no lightweight, playful tool for it. Existing options are either heavyweight engineering simulators (too serious, too much setup) or locked behind accounts and servers. Someone who builds a fun little machine has no easy way to hand it to a friend and have them see *the same thing*, without signing up for anything or trusting a backend to keep their creation alive.

## Solution

A single-page browser app where the user drops bodies (platforms, balls) onto a bounded **room**, connects them with connectors (springs, motors, rods, welds, pins), tweaks their properties, and hits **Play** to watch physics unfold — all rendered in a minimal, hand-drawn sketch style. The entire creation is encoded into a shareable URL: no account, no server, no persistence backend. A friend who opens the link sees the identical build and, because the simulation runs on a fixed timestep over a shared physics engine binary, will in practice see the same run play out.

The app separates two concepts cleanly:
- **Build mode** — physics paused; the user edits the *design* (placing, dragging, connecting, configuring).
- **Run mode** — the design is compiled into a live physics simulation and stepped forward; the user observes (and may live-tweak certain properties like motor speed).

The **design is the source of truth**; the running simulation is a disposable instance compiled from it. This is what gets serialized and shared.

## User Stories

1. As a tinkerer, I want to drop a platform onto the room, so that I have a surface to build on.
2. As a tinkerer, I want to drop a ball into the room, so that I have something for gravity to act on.
3. As a tinkerer, I want a ball to roll, bounce, and be driven by a motor (one circular body with friction, bounciness, and density), so that I can build rotating mechanisms without a separate wheel type.
4. As a tinkerer, I want to drag a placed body to reposition it, so that I can arrange my contraption precisely.
5. As a tinkerer, I want to rotate a placed body, so that I can angle platforms and ramps.
6. As a tinkerer, I want to delete a placed body or connector, so that I can correct mistakes.
7. As a tinkerer, I want to select a body and see its adjustable properties, so that I can configure it.
8. As a tinkerer, I want to adjust a platform's friction and toggle whether it is static, so that I control how things slide and whether it falls.
9. As a tinkerer, I want to adjust a ball's radius and restitution (bounciness), so that I control how it behaves.
10. As a tinkerer, I want to connect two bodies with a spring, so that they pull toward each other elastically.
11. As a tinkerer, I want to adjust a spring's stiffness, rest length, and damping, so that I tune its behavior.
12. As a tinkerer, I want to weld two platforms together rigidly, so that they act as one larger body.
13. As a tinkerer, I want to pin a body at a point so it can rotate freely, so that I can make pendulums and levers.
14. As a tinkerer, I want to attach a motor at a pivot, so that I can drive a body to spin.
15. As a tinkerer, I want to set a motor's target speed, torque, and direction, so that I control the spin.
16. As a tinkerer, I want to attach a connector by dragging its endpoint to an anchor point on a body and have it snap into place, so that connecting things is easy and precise.
17. As a tinkerer, I want anchor points to highlight as I drag near them, so that I know where a connector will attach.
18. As a tinkerer, I want to set the room's gravity strength and direction, so that I can create normal, sideways, or zero-gravity rooms.
19. As a tinkerer, I want to toggle the room's floor, ceiling, and walls, so that I control the boundaries of play.
20. As a tinkerer, I want optional grid snapping when placing bodies, so that I can align things neatly.
21. As a tinkerer, I want to press Play to run the simulation, so that I can watch my contraption work.
22. As a tinkerer, I want to press Pause, so that I can stop and inspect a moment.
23. As a tinkerer, I want to press Reset, so that the simulation returns to my exact build and I can run it again.
24. As a tinkerer, I want Reset to replay the run identically on my machine, so that I can compare before/after a tweak without random variation.
25. As a tinkerer, I want to adjust a motor's speed while it is running and see the effect immediately, so that tuning feels live and playful.
26. As a tinkerer, I want the whole scene rendered in a hand-drawn doodle style, so that it feels playful rather than clinical.
27. As a tinkerer, I want the doodle line wobble to stay stable as bodies move (not shimmer), so that the aesthetic looks intentional.
28. As a tinkerer, I want to pan and zoom within the room, so that I can work on detail and see the whole picture.
29. As a tinkerer, I want to copy a share link for my creation, so that I can send it to a friend.
30. As a recipient, I want to open a share link and see the exact build the creator made, so that I can run and explore it.
31. As a recipient, I want to run the shared build and, in practice, see the same simulation play out, so that we share an experience, not just a static layout.
32. As a recipient, I want to edit a shared build and re-share my version, so that creations can be remixed.
33. As a tinkerer, I want sharing to work without creating an account or relying on a server, so that my creations are not dependent on a backend staying alive.
34. As a tinkerer, I want a sensible default room when I start (floor, normal gravity, grid snap on), so that I can begin building immediately.

## Implementation Decisions

### Architecture: design graph → compiled simulation

The core organizing principle is that the **design graph** (the serializable scene) is the source of truth, and the **live simulation** is a disposable instance compiled from it on Play and discarded on Reset. Serialization, sharing, and editing all operate on the design graph; the physics engine never owns canonical state.

### Physics engine: Rapier (WASM), behind a compile boundary

- **Rapier** (2D, WASM) is the physics engine. Chosen because every connection type maps 1:1 to a native joint (weld → WeldJoint, pin → RevoluteJoint, motor → RevoluteJoint with motor enabled, spring → DistanceJoint with frequency/damping), and because shipping a single WASM binary that every browser runs gives the best practical shot at identical simulations across machines.
- The engine is fully encapsulated by the **`sim`** module. No other module references Rapier, so it remains swappable.
- World units are meters (Rapier/Box2D-style MKS), not pixels. Bodies are sized in the ~0.1–10 unit range; the renderer scales meters to pixels. This avoids instability and tunneling from feeding pixel-scale numbers to the solver.

### Determinism: best-effort, not a guarantee

- The simulation runs on a **fixed timestep** (e.g. 1/60s) via an accumulator, fully decoupled from render framerate. This is treated as plain correct architecture, not "determinism work": it gives **same-machine reset-replay** (Reset reproduces the run exactly) and clean before/after comparison when tweaking properties.
- The **`sim`** compile step iterates the design graph in a deterministic order (bodies and connectors stored as ordered arrays, compiled in array order — never hash/Set iteration order).
- Cross-browser/cross-device byte-identical simulation is a **nice-to-have bonus, not a requirement**. If two machines diverge, the shared *build* is still identical and fully usable; only the "identical run" property degrades.
- The share payload does **not** record or pin the Rapier version. A future Rapier upgrade may make an old link simulate slightly differently; this is accepted to avoid the complexity of loading old engine versions. No cross-browser determinism CI harness in v1.

### Scene model: bodies vs. connectors, organized into rooms

The design graph distinguishes two categories of element:
- **Bodies** — have mass and a collision shape (platform, ball — the ball is one circular body covering both rolling wheels and bouncing balls). Placed directly on a room. **Bodies are the only things that collide.**
- **Connectors** — constraints between two **endpoints** (spring, motor, rod, weld, pin). A connector is a joint, not a property of a single body, and **a connector has no collision geometry of its own** — e.g. a motor is purely a revolute joint plus torque; it cannot collide with anything, it just spins. Only the bodies attached to it have physics.

**A connector endpoint is one of two things:**
- a **point on a body** (`{body, localPoint}`), or
- a **fixed point in world space** (`{worldPoint}`).

The world-point endpoint is what lets a connector ground to nothing — e.g. a motor floating in the middle of the room, mounted to no body, or a pendulum hung from a fixed point. There is no separate "anchor body" requirement; a static body is still a valid endpoint, just never a *required* one. **Walls/floor/ceiling are static collision boundaries** (bodies bounce off them) — they are not special anchor targets; to pin at a wall you place a fixed world point there.

Bodies joined by a connector **do not collide with each other** by default (`collideConnected = false`), so a ball pinned to a platform doesn't fight the platform at the pivot.

The scene is organized as ordered collections:

```
Scene
 ├── rooms[]            ordered; each room has its own settings + bodies + connectors
 │     ├── settings   { gravity:{x,y}, walls:{floor,ceiling,left,right (+ ports)}, grid/snap }
 │     ├── bodies[]
 │     └── connectors[]
 └── portals[]          link roomA.exitPort ↔ roomB.entryPort (transfer position + velocity)  [v2]
```

For **v1, only a single room is built**, but the data model accommodates multiple rooms and portals so that v2 (multi-room + portals + per-room gravity feeding between rooms) requires no schema rework.

### Anchors and snapping

- Each body type exposes a small set of **named anchor points** (e.g. a platform exposes its corners and center; a ball exposes its center; a rod exposes both ends).
- A connector endpoint may bind to a named anchor, to an **arbitrary local point on a body** (e.g. a motor bolted anywhere along a platform, or a lever pinned mid-span), or to a **fixed world point**.
- Connecting is done by dragging a connector endpoint: nearby named anchors highlight and take priority; otherwise the endpoint binds to the exact point on the body under the cursor, or to a fixed world point if released over empty space. The snap-target selection is pure geometry, owned by the **`snapping`** module.

### Properties: schema-driven

- Each body/connector type declares a **property schema** in the **`registry`**. Examples: platform (friction, static?), ball (radius, restitution, density), spring (stiffness, restLength, damping), motor (speed, maxTorque, direction).
- A single generic property panel renders editors from the schema. Serialization of properties is automatic from the schema, so adding a new widget type requires only a registry entry (geometry, anchors, propSchema, compile, draw).
- Certain properties (notably motor speed) are **live-editable during run mode**: the property panel writes the change to the design graph, and `sim` pushes the single changed value into the live joint.

### Rendering: Canvas2D + cached Rough.js drawables

- Rendering uses **Rough.js** over **Canvas 2D** (not SVG, not Rapier's built-in renderer) to achieve the hand-drawn doodle style.
- To avoid shimmering and per-frame cost, each shape's rough drawable is **generated once and cached**; each frame the renderer only translates/rotates the canvas context and redraws the cached drawable. The wobble is "baked" per shape and moves rigidly with the body.
- The renderer reads body transforms from `sim` each frame and applies a camera transform (pan/zoom). Camera math and the drawable cache are the unit-worthy parts.

### Lifecycle: build / run / reset state machine

- The **`clock`** module owns the play/pause/reset state machine and the fixed-timestep accumulator loop.
- Build mode edits the design graph (physics paused). Play compiles the graph into a `sim` instance. Reset discards the live instance and recompiles from the unchanged graph.
- Edits during run mode are limited to live-tweakable properties (e.g. motor speed); structural edits happen in build mode.

### Sharing: compressed JSON in the URL

- The scene serializes to JSON, is compressed (deflate, e.g. via pako), and encoded base64url into the URL fragment. Owned by the **`share-codec`** module as a pure, reversible transform.
- A future fallback (out of scope for v1) is a tiny key-value store that holds the blob and returns a short id when a scene exceeds practical URL length. v1 is URL-only.
- The share payload carries a **scene format version** for forward compatibility, but explicitly does **not** carry an engine version.

### Module boundaries

- **`scene`** (pure) — design graph data structures + operations (add/remove/update, validation). Source of truth.
- **`share-codec`** (pure) — scene ⇄ compressed URL string.
- **`registry`** (pure/data) — per-type declarations: geometry, anchors, propSchema, compile, draw.
- **`snapping`** (pure) — given a dragged point and candidate anchors, choose the snap target.
- **`clock`** (pure) — fixed-timestep accumulator + play/pause/reset state machine.
- **`sim`** (impure, wraps Rapier) — compile design graph → world; `step()`, `readTransforms()`, `setMotorSpeed()` and similar live setters. The engine-swap boundary.
- **`renderer`** (impure, Canvas2D + Rough.js) — draw cached drawables under a camera transform.
- **`editor`** (impure, input) — build-mode input → `scene` mutations; delegates snap logic to `snapping`.
- **`ui`** (impure, app chrome) — palette, schema-driven property panel, play/pause/reset, share button, room settings.

### Tech stack

- Static single-page app: Vite + TypeScript. UI chrome (palette, property panel) in a light framework; canvas rendering is framework-agnostic. No backend.

## Testing Decisions

Good tests here verify **external behavior through a module's public interface**, not internal representation. The pure, deep modules carry the bulk of the value because they can be tested without Rapier, Canvas, or DOM.

Modules to be tested (confirmed with the developer):

- **`scene`** — graph operations and validation. Adding/removing/updating bodies and connectors produces the expected graph; invalid operations (e.g. a connector referencing a non-existent anchor) are rejected. Tested purely as data-in/data-out.
- **`share-codec`** — **round-trip property tests**: for arbitrary valid scenes, `decode(encode(scene))` deep-equals the original. Guards against silent data loss in sharing, which is the highest-risk failure for the product's core promise. Also: malformed/truncated input is handled gracefully.
- **`snapping`** — geometry: given a dragged point and a set of candidate anchors, the correct nearest anchor (within threshold) is selected, ties resolve deterministically, and out-of-threshold returns no snap.
- **`clock`** — the fixed-timestep accumulator advances the right number of fixed steps for a given elapsed time (including catch-up and fractional remainder), and the play/pause/reset state machine transitions correctly.
- **`sim` (structural + replay)** — compiling a known design graph creates the expected set of bodies and joints (e.g. a motor connector yields a revolute joint with the motor enabled at the configured speed). Plus a **same-machine replay checksum**: stepping a fixed scene for N fixed steps twice yields identical world-state checksums (Rapier's snapshot is used to capture state). This locks in same-machine reproducibility without asserting cross-browser determinism.

Prior art: none yet — this is a greenfield repo, so these tests establish the conventions. Unit tests run under the Vite toolchain's test runner (e.g. Vitest). The pure modules need no mocking; `sim` tests initialize Rapier directly.

## Out of Scope

- **Multi-room and portals (v2).** v1 ships a single room. The scene schema accommodates `rooms[]` and `portals[]`, but only one room is built, and portal transfer logic is not implemented.
- **Per-room gravity feeding between rooms** — depends on portals; v2.
- **Key-value store fallback for oversized scenes.** v1 is URL-only; the KV short-link escape hatch is deferred.
- **Cross-browser/cross-device determinism guarantee** and any CI harness to verify it. Determinism is best-effort via fixed timestep + single WASM binary; not contractually guaranteed or tested across environments.
- **Engine-version pinning / loading old Rapier versions** for old share links.
- **Goals, puzzles, win conditions, levels.** This is a pure free-play sandbox.
- **Accounts, persistence backend, user galleries.**
- **Plotter / pen tool (future idea — see Further Notes).** Not in v1.

## Further Notes

- The "share the build, not a recording" model is what makes serverless sharing tractable: each viewer's browser re-simulates from the design graph. Determinism turns this into recording-like fidelity for free when it works, but the product does not depend on it.
- Keeping Rapier strictly behind the `sim` boundary is deliberate insurance: relaxing the determinism requirement reopened the door to a pure-JS engine (Planck.js), but Rapier was kept for superior native joint/motor support and the determinism bonus. The boundary means that decision is cheap to revisit.
- The bodies-vs-connectors split (a spring/motor is a placed connector — a jointless constraint with no collision shape — whose two endpoints are each either a point on a body or a fixed world point, not a property of one body) is the model that makes "attach things together" feel natural and handles grounded, mid-air, and body-mounted mechanisms uniformly. Only bodies collide; connectors just constrain/drive.
- Suggested v1 build order to de-risk feel early: `scene` + `sim` (Rapier + fixed timestep) + `renderer` (Rough.js cached drawables) proving a ball that falls and bounces in the doodle style, then `editor` + `registry` for placement and configuration, then connectors + `snapping`, then `share-codec`.
- **Future idea — plotter / pen tool.** A non-physical attachment ("pen" / "marker") bound to a body or a body anchor that deposits marks on a separate background layer as the simulation runs — continuous stroke for a curve, periodic for a dotted plot. Lets a falling ball or rotating platform "plot" its own (or an attachment's) path, giving spirograph/harmonograph-style traces. Fits the hand-drawn doodle aesthetic. Architecturally it is a non-colliding attachment that writes to a background render layer, independent of the physics bodies. Out of scope for v1; logged here so the renderer's layering and the attachment model leave room for it.
