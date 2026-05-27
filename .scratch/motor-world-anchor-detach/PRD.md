# PRD: Motor with world anchor detaches when moved

Status: needs-triage

## Parent

`.scratch/scribblerig/PRD.md`

## Problem

When a motor connects a body to a fixed point in world space (one
endpoint = `{world: …}`, the other = `{body: …, local: …}`), dragging
the body away from the world anchor appears to **unhook** the motor —
the spin stops working / the joint pops off, even though the user
hasn't touched the connector itself.

Other connectors with a world endpoint (springs, pins) don't show the
same problem, which makes the motor case feel like a bug rather than
the intended pin/weld "you moved off the pivot, your joint pops" rule
documented in [`editor.pruneDetachedConnectors`].

## Reproduce

1. Drop a Ball, then a Motor connector placed on the ball (single-body
   placement → motor pinned at world point under the ball's center).
2. Press Play, watch the ball spin. Good.
3. Press Reset. Drag the ball anywhere else on the canvas.
4. Press Play. The ball no longer spins / is detached from the motor.

## Hypotheses

- `pruneDetachedConnectors` may be over-aggressive for motors: the
  pivot's body-local coordinate is `(0,0)` (the body's center anchor),
  but after a drag the body's *world* position has moved and the
  motor's world endpoint hasn't, so the world↔body distance is now
  non-zero. If prune treats that as "pivot point left the body," it
  removes the joint — even though for motors the world anchor *should*
  follow the body (the motor's whole point is to pin to that body's
  center).

  See `src/editor/editor.ts` for the prune logic and
  `src/share/registry.ts` for the motor placement rules.

- Alternative: prune behaves correctly, but the motor's compile path
  in `src/sim/sim.ts` treats world+body as a fixed-frame joint and
  fails to track the body's new pose at compile time.

## Solution sketch

Diagnose first — likely either:

(a) Tighten `pruneDetachedConnectors` so the "pivot left the body"
    check accounts for a motor's world endpoint being a logical pivot
    *of* the body, not an independent anchor — i.e., when a body is
    dragged, the motor's world endpoint should *follow* (or at least
    not cause a detach). The drag-time `updateBody` could shift the
    world endpoint by the same delta.

(b) Make motor world-anchors **track the connected body's center** at
    compile, so the world endpoint is recomputed from the body's
    current pose rather than the original placement.

Either way, the multi-select drag path I just shipped (group drag
translates world endpoints) is the analogue we want for single-body
drag too — a motor's world anchor should ride along with the body it
spins.

## Out of scope

- Spring/pin world anchors — those represent a deliberate "fixed point
  in world" and shouldn't follow the body.

## Notes

- Repro discovered while building the onboarding-tutorial scene.
- The fix may interact with the recently-added multi-drag world-anchor
  translation in `App.tsx` — keep the single-body path consistent.
