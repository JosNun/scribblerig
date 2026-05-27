# Tutorial chain — authoring sketch

Living build plan for the Rube-Goldberg scene specified by [PRD.md](PRD.md).
Stage-by-stage props, coordinates, and tuning notes. Iterate here while
playtesting; the final scene lives in `src/share/tutorialScene.ts`.

## Frame

- Room 12×12, floor at `y = 0`, walls off (floor on). Usable area
  `x ∈ [-6, 6]`, `y ∈ [0, 12]`.
- Gravity `(0, -9.81)`.
- Rotation in radians, CCW positive. Spawner chute is `+x` in body-local.

## The chain at a glance

```
  (1) Spawner (-5, 10) ── drops ball
        │
        ▼
  (2) ── Ramp tilted left-down (-3.5, 8.5) ──╲
                                              ╲ ball rolls right, falls
                                               ●
  (3) Lever pinned center (0, 5); heavy ball welded to TOP-LEFT end.
      Ball lands on the elevated RIGHT side → tips lever → welded
      ball arcs up & right into…
                                                 ╲
                                                  ●  (4) Spring-loaded
                                                       ball at (3, 6),
                                                       anchored to
                                                       fixed world
                                                       point (5.5, 6.5)
                                       launched ↙
  (5) Motor paddle (ball hub + welded blade) at (0, 1.5), spinning.
      Sweeps incoming ball sideways…
                                       ↘
                              ──────────────●  (6) Goal platform
                                               at (4, 0.5)
```

## Stage 1 — Spawner

`Spawner` at `(-5, 10)`, rotation `-π/2` (chute points down).

- `interval: 3` — 3 s between drops; only one ball in flight at a time.
- `maxAlive: 1` — single ball per reset (chain is single-shot, not a stream).
- `speed: 0` — drops from rest; gravity does the work.
- `static: true`.

Template (one item): `Ball` `radius: 0.3, friction: 0.5, restitution: 0.5,
density: 1` at template-local `(0, 0)`.

**Teaches:** automatic emission, the spawner popover (click to edit
template), rotation aims the chute.

Label below at `(-5, 9.2)`, size `0.32`:
> *Spawner — click to edit what it emits. Rotate to aim.*

## Stage 2 — Ramp

`Platform` at `(-3.5, 8.5)`, rotation `+0.35` rad (~20°, left side high),
`width: 4, height: 0.3, friction: 0.4, static: true`.

Ball lands on the upper-left half of the ramp, rolls right, falls off the
right edge. Right edge ends around `(-1.5, 7.8)`.

**Teaches:** platforms can rotate and be made static / non-static.

Label at `(-3.5, 9.4)`, size `0.32`:
> *Platforms can rotate. Toggle Static in the panel.*

## Stage 3 — Pinned lever + welded counterweight

`Platform` (lever arm) at `(0, 5)`, rotation `+0.12` rad (slight left-down
tilt at rest), `width: 5, height: 0.25, friction: 0.5, static: false`.

`Pin` connector: world point `(0, 5)` ↔ lever's `center` anchor.

`Ball` (counterweight) welded on top of the LEFT end at `(-2.4, 5.2)`,
`radius: 0.45, friction: 0.6, restitution: 0.3, density: 4`. The heavy
density makes the lever rest with its left side down at start.

`Weld` connector: ball `center` anchor ↔ lever `topLeft` anchor.

**Dynamics:** Heavy ball pulls left side down → right side starts elevated.
Falling ball from stage 2 lands on the elevated right side, pushes it
down, the left side (with welded ball) swings UP and to the right. The
welded ball traces an arc that rises above and to the right of the lever's
pivot — that's the swing that strikes stage 4.

**Teaches:** Pin is a free hinge, Weld is rigid fuse. Non-static
platforms. Density matters (heavier counterweight).

Labels:
- Near pin at `(0, 5.7)`, size `0.32`: *Pin = free hinge.*
- Near weld at `(-2.4, 4.4)`, size `0.32`: *Weld = rigid fuse.*

## Stage 4 — Spring-loaded ball

`Ball` at `(3, 6)`, `radius: 0.35, friction: 0.4, restitution: 0.4, density: 1`.

`Spring` connector: world point `(5.5, 6.5)` ↔ ball center.
- `stiffness: 60`
- `restLength: 1.5` — distance from anchor to ball's start position is
  `√(2.5² + 0.5²) ≈ 2.55`, so the spring starts stretched. The ball will
  settle toward the anchor before being struck — author may need to nudge
  the start position OR raise `restLength` to ~2.5 so it's neutral.
- `damping: 2`
- `collide: false` — anchor is a fixed point, no body to collide with anyway.

The welded ball from stage 3 arcs up and strikes this ball from below-left.
Impulse stretches the spring further; restoring force snaps the ball back
down-and-left, launching it toward stage 5.

**Tuning watch:** the spring's restoring direction is along the spring's
axis (anchor → ball). The launch trajectory is therefore constrained to
roughly that axis. If the trajectory doesn't reach the paddle, adjust the
anchor's position or the ball's start position rather than the spring
params alone.

**Teaches:** Spring connects to a fixed world point; stiffness / restLength
shape the behavior.

Label at `(4.3, 7.0)`, size `0.32`:
> *Spring — adjust stiffness in the panel.*

## Stage 5 — Motor-driven paddle

A compound paddle (ball hub + welded platform blade) on a motor.

- `Ball` (hub) at `(0, 1.5)`, `radius: 0.18, friction: 0.6, restitution: 0.2,
  density: 1`.
- `Platform` (blade) at `(0, 1.5)`, rotation `0`, `width: 1.8, height: 0.15,
  friction: 0.7, static: false`.
- `Weld` connector: hub center ↔ blade center.
- `Motor` connector: world point `(0, 1.5)` ↔ hub center. `speed: 4,
  torque: 30, reverse: false`.

The blade sweeps continuously around the pivot. The ball arriving from
stage 4 lands on or beside the paddle and gets flicked toward `+x` into
the goal.

**Tuning watch:** paddle radius (`blade width / 2 = 0.9` m) sets the strike
zone. Motor speed sets the strike frequency. Aim for the paddle to be
*roughly horizontal pointing right* when the ball arrives — slight phase
offset is fine because the motor is on continuously. If timing is too
sensitive, slow the motor down.

**Teaches:** Motor is a powered hinge; speed is editable while running;
weld composes a hub + blade into one rigid paddle.

Label at `(-0.2, 0.4)`, size `0.32`:
> *Motor — drag Speed while it's running.*

## Stage 6 — Goal platform

`Platform` at `(4, 0.5)`, rotation `-0.08` rad (slight rightward dip — acts
as a catch), `width: 3.5, height: 0.3, friction: 0.7, static: true`.

The ball arriving from stage 5 lands on this surface and comes to rest.

Label at `(4, 1.2)`, size `0.32`:
> *Goal.*

## Title

`Text` body at `(0, 11)`, size `0.55`:
> *Welcome to ScribbleRig — press ▶ Play, then tinker.*

## Concept coverage

| Type | Where it appears |
| --- | --- |
| Ball | spawner template (1), counterweight (3), sprung ball (4), paddle hub (5) |
| Platform | ramp (2), lever arm (3), paddle blade (5), goal (6) |
| Spawner | (1) |
| Text | title + 7 stage labels |
| Pin | lever pivot (3) |
| Weld | counterweight (3), paddle (5) |
| Spring | sprung ball (4) |
| Motor | paddle (5) |

All four body types and all four connector types appear; weld and ball
appear in two distinct roles which reinforces that "the same primitive
plays different parts depending on how you wire it."

## Tuning risks (carry into playtesting)

1. **Stage 2→3 landing position.** Ball needs to clear the lever's left
   (heavy) side and land on the elevated right side. Lever rotation at
   rest + ramp exit position together determine whether this happens.
2. **Stage 3→4 strike arc.** The welded ball's apex on the swing has to
   reach the sprung ball. Lever length, counterweight density, and pin
   position are the levers. If the apex undershoots, increase
   counterweight density or shorten the right side.
3. **Stage 4→5 launch direction.** Spring's restoring force is along its
   axis; the launch is therefore largely along that axis (mod the
   incoming impulse). Position the anchor so axis aims roughly at stage 5.
4. **Stage 5 paddle phase.** The motor never stops, so timing the strike
   is statistical — keep `speed` low enough that the paddle will sweep
   through the strike zone within a fraction of a second of the ball
   arriving.
5. **Determinism (ADR-0003).** Every same-machine reset must replay
   identically. If any stage has razor-thin margin, retune for slack
   before shipping.

## Authoring loop

PRD §"Where the tutorial scene lives" recommends building incrementally in
the running app: lay each stage out manually, share-URL → decode →
paste into the literal, then iterate in source. Do this stage-by-stage
rather than all at once — the determinism check at the end is much
faster when only one stage at a time can have drifted.
