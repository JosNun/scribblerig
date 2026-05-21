# 06 — Motor connector with live tuning

Status: ready-for-agent

## Parent

`.scratch/physics-sandbox/PRD.md`

## What to build

The motor connector: a driven revolute joint, plus live tuning while the simulation runs.

A motor is a connector (revolute joint + torque), **not a body** — it has no collision shape; it just spins whatever body is attached. Like all connectors, each endpoint is a point on a body or a fixed world point, so a motor can be mounted to another body **or float in mid-air mounted to nothing** (a fixed world point).

- **`registry` / `sim`** — motor type compiling to a Rapier RevoluteJoint with the motor enabled; properties: target speed, max torque, direction.
- **Live tuning** — motor speed (and direction) is editable during run mode: the property panel writes to `scene` and `sim` pushes the single changed value into the live joint without restarting the run.

## Acceptance criteria

- [ ] A motor can be attached between two bodies, or mounted to a fixed world point in mid-air to spin a single attached body.
- [ ] Speed, max torque, and direction properties affect the spin.
- [ ] Adjusting motor speed while the simulation is running changes the spin immediately, without a Reset.
- [ ] The motor itself never collides with anything; only attached bodies have physics.
- [ ] `sim` structural test confirms a motor connector yields a revolute joint with the motor enabled at the configured speed.

## Blocked by

- `.scratch/physics-sandbox/issues/05-connector-framework-spring-weld-pin.md`
