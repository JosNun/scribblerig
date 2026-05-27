# PRD: Despawn bodies that escape the room

Status: done

## Parent

`.scratch/scribblerig/PRD.md`

## Problem

Both **ephemeral** (spawner-emitted) and **design** (user-authored) bodies
have no upper bound on where they can travel during a sim run. When walls
are off (the default — only the floor is on), a body can fly off the side
of the room and accumulate coordinates forever. The renderer clips at the
room frame so the user doesn't *see* it, but it stays alive in the sim,
costs Rapier step time, and (for ephemerals) burns a `maxAlive` slot so the
spawner sometimes stops emitting fresh items because old ones are
off-screen but still "alive".

Discovered while building the tutorial: spawned balls fly off the side of
the room and the spawner appears to stop after `maxAlive` runs of
off-screen invisible items. The same shape of bug exists for design
bodies — a user-placed ball launched by a motor or spring can leak off
into nowhere and the sim keeps stepping it forever.

## Solution

After each sim step, drop any **dynamic** body whose world position is
more than a margin outside the room AABB.

| Body kind                       | Margin                  | On Reset                                      |
| ------------------------------- | ----------------------- | --------------------------------------------- |
| Ephemeral (spawner emission)    | 2 m                     | Gone; spawner re-emits from t = 0             |
| Dynamic design body             | 50 m                    | Reappears at authored position                |
| Static design body              | exempt — never culled   | n/a                                           |

Two margins because the two cases have different tolerances:

- **Ephemerals** churn fast and want a tight cleanup (spawner's `maxAlive`
  slot needs to free up). 2 m gives a small hysteresis so a body briefly
  leaving and bouncing back via spring/pin isn't culled.
- **Design bodies** are intentional; a long pendulum or a deliberate
  ballistics arc may swing well past the room edge. 50 m is "really far"
  by any sensible measure — generous enough that no normal contraption
  trips it, tight enough that a runaway body still gets cleaned up within
  a few seconds.

### When a body is culled, its connectors go with it

For both ephemeral and design bodies, removing a body also removes any
connector attached to it. This mirrors how the existing spawner-despawn
path tears down welded compounds: the joint goes with its host. Avoids
dangling Rapier joints with one missing endpoint.

For multi-body compounds (welded together), removing one host removes the
welds attached to it; the other welded bodies are no longer part of the
compound but are not themselves removed unless they too escape the
margin. The dissolution is intentional — culling implies the runaway body
is "lost", and welds to a lost body don't survive the loss.

### Special case: spawner body itself escapes

A spawner is a design body. If it escapes the 50 m margin, it's culled
like any other design body — but **its already-emitted items stay alive**.
The spawner's runtime state (timer, RR index, alive FIFO) is destroyed;
no new emissions happen; existing emissions live out their natural lives
and are themselves culled when they cross the 2 m ephemeral margin.

Implementation note: the existing `alive` FIFO is owned by
`SpawnerRuntime`, so when the spawner is culled, the alive items need to
be transferred to a global "orphan ephemerals" pool that the step loop
still walks for cull checks and that `readEphemerals()` still reports.

On Reset, the spawner rebuilds from the design graph at its authored
position with a fresh runtime state, exactly like any other design
body — orphan ephemerals from the prior run are cleared.

### UI cue

**Silent**, same as today's ephemeral despawn-at-cap. The body is already
invisible off-screen, so its disappearance is invisible to the user.
Reset restores design bodies, so no permanent change to the build.

## How

- **One pass** in `step()` after `world.step()` + `stepSpawner` loop:
  - Walk all dynamic bodies in the world.
  - For each, get its world position.
  - If outside `roomAABB ± margin` (where margin depends on whether the
    body is ephemeral or design), call a unified `cullBody(world, id)`
    helper that:
    1. Removes any joint attached to it (collect from Rapier's joint set
       or maintain a side index — see `despawnItem` in `sim.ts:633` for
       prior art).
    2. Removes the rigid body and its colliders.
    3. Updates the appropriate tracking:
       - Ephemeral → remove from owning `SpawnerRuntime.alive` FIFO, **or** from
         the orphan-ephemerals pool.
       - Design dynamic → remove from the design-body tracking map; mark
         "culled this run" so the renderer skips it in Run-mode draws.
- **Static bodies are exempt** — they don't move under physics, and
  culling them would only fire from a numerical glitch. One branch in the
  helper skips them.
- **Margin constants** live next to the helper as named constants:
  ```ts
  const EPHEMERAL_CULL_MARGIN_M = 2;
  const DESIGN_CULL_MARGIN_M = 50;
  ```
  Adjustable without touching the test logic.
- **Spawner cull → orphan transfer**: when `cullBody` removes a design
  body of type `spawner`, transfer its `alive` FIFO to a world-level
  orphan-ephemerals list before tearing down the runtime. `readEphemerals()`
  walks both per-spawner alive lists *and* the orphan pool.

## File map

- `src/sim/sim.ts`
  - New `cullEscapees(world, room)` helper, called once per `step()` after
    `stepSpawner` loop (around line 207).
  - New `cullBody(world, id)` shared cleanup — replaces or reuses
    `despawnItem` (line 633).
  - New `orphanEphemerals: AliveItem[]` field on the compiled world;
    populated when a spawner is culled, drained by `cullEscapees`
    and by `readEphemerals()`.
  - Named margin constants at file top.
- `src/sim/sim.test.ts`
  - Ephemeral cull test (already specced).
  - Design body cull: place a ball, give it sideways velocity, no walls;
    step until it crosses 50 m; assert it's gone from the world and from
    the Run-mode transform map.
  - Connector cull: place two pinned balls, send the compound flying;
    assert both balls and the pin are gone.
  - Spawner self-cull: design-place a spawner outside the room (or push it
    out via a motor); assert its emissions remain alive in the orphan
    pool until they themselves escape.
  - Static exempt: place a static platform; (impossible to escape under
    physics, but) verify the helper doesn't touch it.
  - On Reset, all design bodies (including culled spawners) come back at
    their authored positions; orphan ephemerals are cleared.

## Out of scope

- A configurable per-spawner "world bounds" prop (default margin is
  enough).
- A visual cue at the cull point (puff, toast). Deliberately silent.
- A user-facing "show me what got culled this run" log.
- Culling on Pause (Pause is a frozen frame; no stepping = no cull).

## Notes

- Repro discovered while testing the tutorial's spawner. Tangentially
  exacerbated by `maxAlive: 1` configurations: one ball escapes, the
  spawner waits for its slot to free up but the ball never dies.
- Ephemeral margin (2 m) accounts for a body still in-flight inside its
  launch arc — at typical speeds, one frame's displacement is ≪ 2 m, so
  the bounce-back case is safe.
- Design margin (50 m) is "really far": a ball at typical launch speeds
  under Earth gravity takes ~3–5 seconds to cross 50 m past the edge.
  Generous but not absurd. Catches the runaway case without ever
  interrupting a normal contraption.
- The dissolution-on-cull rule for welded compounds is the cheapest
  consistent story. Alternative ("cull the whole compound atomically")
  is more code for an edge case.
