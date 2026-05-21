# ADR-0003 — Determinism is best-effort via fixed timestep + single binary

Status: accepted
Date: 2026-05-21

## Context

The "share the build, not a recording" model means each viewer re-simulates from the
design graph. If simulations were byte-identical everywhere, sharing would gain
recording-like fidelity for free. But guaranteeing cross-browser/cross-device
determinism is expensive (engine version pinning, CI harnesses, floating-point
lockstep) and not required for the product to work.

## Decision

Treat determinism as **best-effort, not a guarantee**:

- The sim runs on a **fixed 1/60s timestep** via an accumulator in `clock`, decoupled
  from render framerate. This is plain-correct architecture, not "determinism work."
- `sim.compile` iterates bodies and connectors in **array order** — never hash/Set
  iteration order.
- Together these give **same-machine reset-replay**: stepping a fixed scene N times
  twice yields identical world-state checksums (`sim.checksum()` over Rapier's
  snapshot). A test locks this in.
- Cross-machine byte-identical simulation is a **nice-to-have bonus**. If two machines
  diverge, the shared *build* is still identical and fully usable — only the
  "identical run" property degrades.
- The share payload carries a **scene format version** but **not** an engine version.
  A future Rapier upgrade may make an old link simulate slightly differently; accepted.

## Consequences

- No cross-browser determinism CI harness in v1.
- No loading of old Rapier versions for old share links.
- The `clock` accumulator must be robust to floating-point drift at the step boundary
  (an accumulator landing a hair under `fixedDt`, e.g. `0.05 + 0.05 = 0.0999…9`, must
  still fire) or it slowly leaks fixed steps and breaks replay. Implemented with an
  epsilon tolerance.
