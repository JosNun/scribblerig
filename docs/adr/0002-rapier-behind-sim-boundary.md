# ADR-0002 — Rapier (WASM) as the physics engine, behind the `sim` boundary

Status: accepted
Date: 2026-05-21

## Context

We need a 2D physics engine. Candidates: Rapier (Rust→WASM) and pure-JS engines
(Planck.js/Box2D ports). The connector model (spring, motor, rod, weld, pin) maps
directly to native joints, and shipping one WASM binary that every browser runs
gives the best shot at identical simulations across machines.

## Decision

Use **Rapier 2D (WASM)**, via `@dimforge/rapier2d-compat`, and **fully encapsulate
it in the `sim` module**. No other module imports Rapier. Every connector type maps
1:1 to a native joint:

- weld → WeldJoint, pin → RevoluteJoint, motor → RevoluteJoint + motor,
  spring → DistanceJoint (frequency/damping).

`sim`'s public surface speaks design-graph vocabulary: `initSim()`, `compile(scene)`,
`step()`, `readTransforms()`, `checksum()`, and live setters (e.g. `setMotorSpeed`).

We use the **`-compat`** build (WASM embedded as base64, `await RAPIER.init()`) so the
same init path works in the browser (Vite) and in tests (Vitest/node) without
separate WASM-loading plumbing.

## Consequences

- The engine is swappable: relaxing determinism (see
  [ADR-0003](0003-best-effort-determinism.md)) reopened the door to a pure-JS engine,
  but the boundary means revisiting that is cheap — rewrite one file.
- World units are **meters** (MKS), bodies sized ~0.1–10 units; the renderer scales
  meters → pixels. Feeding pixel-scale numbers to the solver causes instability and
  tunneling, so this is enforced at the boundary.
- The compat build embeds the WASM, producing one large JS chunk (~1.7 MB). Accepted
  for now; revisit with code-splitting if load time matters.
- A guard is worth keeping: only `src/sim/**` may reference `rapier` (grep-checkable).
