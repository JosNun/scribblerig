# ADR-0001 — Design graph is the source of truth; the simulation is compiled

Status: accepted
Date: 2026-05-21

## Context

A physics sandbox could let the physics engine own the canonical state and treat the
engine's world as the document. But the product's core promise is **serverless
sharing**: the thing a user shares must be a small, stable, serializable description
of their *build* — not a snapshot of engine internals, and not a recording.

## Decision

The **design graph** (the `Scene`: ordered rooms, bodies, connectors) is the source
of truth. The live physics world is a **disposable instance compiled from it**:

- **Play** compiles the graph into a `sim` world.
- **Reset** discards the live world and recompiles from the *unchanged* graph.
- Serialization, sharing, and editing operate only on the design graph.
- The engine never holds canonical state.

`scene` is pure and holds the graph; `sim.compile(scene)` produces the world.

## Consequences

- Sharing is just "serialize the graph" — see the share-codec work (issue 08).
- Reset is trivially correct: recompile the same input → the same starting state.
- Edits split cleanly: structural edits happen in Build mode against the graph;
  only whitelisted live-tweakable props (e.g. motor speed) reach into the running
  world.
- The graph must be iterated deterministically when compiling — see
  [ADR-0003](0003-best-effort-determinism.md).
