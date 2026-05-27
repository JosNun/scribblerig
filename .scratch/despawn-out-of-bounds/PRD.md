# PRD: Despawn ephemerals that escape the room

Status: needs-triage

## Parent

`.scratch/scribblerig/PRD.md`

## Problem

Spawner-emitted bodies are ephemeral (live only during sim), but they
have no upper bound on **where** they can go. When a wall is off (the
default — only the floor is on), an emitted ball can fly off the side
of the room and keep coordinates accumulating forever. The renderer
clips at the room frame so the user doesn't *see* it, but it stays
alive in the sim, costs Rapier step time, and counts against the
spawner's `maxAlive` cap (so the spawner sometimes stops emitting
fresh items because old ones are off-screen but still "alive").

This came up while building the tutorial: spawned balls fly off the
side of the room and the spawner appears to stop after maxAlive runs
of off-screen invisible items.

## Solution

After each sim step, drop any **ephemeral** body whose world position
is more than a small margin outside the room rect. Default margin
~2 m (enough that a body briefly leaving and bouncing back via a
spring/pin isn't culled, but a one-way exit triggers cleanup).

Concretely:

- New helper in `src/sim/sim.ts` (or alongside `stepSpawner`):
  iterates `spawner.alive`, checks each item's rigid-body world
  position against the room AABB ± margin, and despawns items outside.
- Runs once per `step()` after the spawner emit loop, so cleanup
  happens before the next frame's render.

Design-scene bodies (the user's own) are **not** affected — they're
clamped inside the room by the editor (`clampInsideRoom`) and can't
escape during edit. Run-mode bodies are only at risk because the sim
doesn't clamp them; we leave that alone for now and just cull what
ephemerals escape.

## Out of scope

- Despawning design-scene bodies that escape (rare; would need a
  Reset-replay-safety story).
- A configurable per-spawner "world bounds" prop (the default room
  margin is enough).

## Tests

- `sim.test.ts`: spawn balls aimed sideways with no walls; step until
  one leaves the room; assert `world.readEphemerals().bodies` no
  longer contains it.
- Margin tunable from a constant so we can adjust without touching
  the test logic.

## Notes

- Repro discovered while testing the tutorial's spawner. Tangentially
  exacerbated by `maxAlive: 1` configurations: one ball escapes, the
  spawner waits for its slot to free up but the ball never dies.
- Margin should account for the spawner's launch speed × a frame or
  two so a ball still in-flight inside its launch arc isn't culled.
