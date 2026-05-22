# 06 — Motor connector with live tuning

Status: done

## Parent

`.scratch/scribblerig/PRD.md`

## What to build

The motor connector: a driven revolute joint, plus live tuning while the simulation runs.

A motor is a connector (revolute joint + torque), **not a body** — it has no collision shape; it just spins whatever body is attached. Like all connectors, each endpoint is a point on a body or a fixed world point, so a motor can be mounted to another body **or float in mid-air mounted to nothing** (a fixed world point).

- **`registry` / `sim`** — motor type compiling to a Rapier RevoluteJoint with the motor enabled; properties: target speed, max torque, direction.
- **Live tuning** — motor speed (and direction) is editable during run mode: the property panel writes to `scene` and `sim` pushes the single changed value into the live joint without restarting the run.

## Acceptance criteria

- [x] A motor can be attached between two bodies, or mounted to a fixed world point in mid-air to spin a single attached body.
- [x] Speed, max torque, and direction properties affect the spin.
- [x] Adjusting motor speed while the simulation is running changes the spin immediately, without a Reset.
- [x] The motor itself never collides with anything; only attached bodies have physics.
- [x] `sim` structural test confirms a motor connector yields a revolute joint with the motor enabled at the configured speed.

## Blocked by

- `.scratch/scribblerig/issues/05-connector-framework-spring-weld-pin.md`

## Comments

### 2026-05-22 — Implemented

Added a `motor` connector type (registry props: `speed`, `torque`, `reverse`).
It compiles to the same Rapier revolute joint as a pin, with an
**acceleration-based velocity motor** configured on the joint — so the body
reaches the set speed regardless of mass, which is predictable and testable.
`torque` is the motor's drive factor (how hard it tracks the target; the
rapier2d-compat API exposes no hard max-force cap), `reverse` flips the sign.
The existing "fixed body first" reorder makes a body-on-a-fixed-pivot motor spin
counter-clockwise for a positive speed (intuitive). Placed click-to-place like a
pin; rendered as a pivot ring with a small rotation-arrow cue.

**Live tuning**: `compile` now keeps a `connectorId → joint` map and
`SimWorld.setMotor(id, props)` re-applies the motor config to the live joint.
The property panel stays visible/editable for a selected motor during Run, and
edits write to both `scene` (so reset-replay stays consistent) and the live
joint. See [ADR-0007](../../adr/0007-connector-joint-compilation.md).

71 tests pass (3 sim: spins-to-speed-while-pinned, reverse, live-retarget; 2
registry). Verified in-browser: a wheel mounted on a fixed pivot stays pinned at
(0, 7.44) and spins; dragging the Speed slider mid-run changed its angular
velocity 4 → 12 rad/s with no Reset.

A sharp edge worth noting: the first sim test only asserted angular velocity,
which a *falling* (unpinned) wheel still satisfies — so it would have missed a
broken positional constraint. Added a pivot-position assertion to close that.
(During in-browser checks the app's default starter **ball** falling was briefly
mistaken for the wheel; the wheel was pinned correctly the whole time.)
