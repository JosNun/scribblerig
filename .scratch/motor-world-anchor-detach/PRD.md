# PRD: Pin / weld / motor world anchor detaches when body is dragged

Status: done

## Parent

`.scratch/scribblerig/PRD.md`

## Problem

When a pin / weld / motor is placed on a single body, the placement
path creates one body endpoint (`{body, local}`) coincident with one
world endpoint (`{world}`). Dragging the body anywhere else moves the
body but leaves the world endpoint behind, so `pruneDetachedConnectors`
sees the pivot fall outside the body and removes the connector —
even though the user never touched the joint itself.

This is shared by all three point-coincident connector types (pin,
weld, motor); the existing `editor.test.ts` "removes a world-anchored
pin/weld/motor when the body moves off its world point" test enshrines
the current buggy behaviour. Springs are unaffected (they have no
single pivot — `connectorPivot` returns `null` for them).

## Reproduce

1. Drop a Ball, then place a Motor (or Pin, or Weld) on the ball.
   Single-body placement pins the connector at a world point under
   the ball's center.
2. Press Play — the joint works (motor spins, pin holds).
3. Press Reset. Drag the ball somewhere else on the canvas.
4. The connector silently vanishes; Play has nothing to drive.

## Root cause

`buildOverlapConnectors` (editor.ts) creates `b: { world: point }`
for the single-body case. `pruneDetachedConnectors` then enforces
"pivot must lie inside every referenced body" on every drag /
resize / rotate (`App.tsx`). The body-local endpoint is at `(0,0)`,
so after a drag the world pivot is no longer inside the body and
the connector is pruned.

The recently-shipped multi-select drag path already handles this
correctly: `multiDragRef` captures world endpoints at pointerdown
and translates them by the same delta as the body (App.tsx:1153).
The single-body drag path doesn't do the analogous translation —
that's the gap.

## Solution

Mirror the multi-drag pattern on the single-body drag path: at
pointerdown, capture every world endpoint belonging to a connector
that references the dragged body; on pointermove, translate each
captured world endpoint by the body's drag delta before
`pruneDetachedConnectors` runs — so the pivot follows the body and
prune passes naturally.

Apply the same idea to multi-drag too: a user can shift-click a body
into a multi-selection without selecting its attached connector, then
drag — the connector's world anchor needs to ride along even though
the connector itself isn't in the selection. Dedup keeps already-
captured (selected) endpoints from translating twice.

This is a behaviour change for users who *want* the joint to detach
when they drag the body away. They keep the same out: explicitly
drag the connector's endpoint handle off the body.

## Acceptance

- Place a motor on a ball, drag the ball, press Play → ball still
  spins.
- Same for pin and weld on a single body.
- Shift-click a body that has a (world-anchored) pin/weld/motor into
  a multi-selection without selecting the connector, drag → connector
  still attached.
- Existing multi-select drag of explicitly-selected world endpoints
  still translates them exactly once (no double-move).
- Spring drags unchanged (springs have no pivot, never pruned, never
  carried).
- The editor.test.ts "removes a world-anchored pin/weld/motor when
  the body moves off its world point" test still asserts that
  `pruneDetachedConnectors` itself behaves the same — the fix is at
  the call site (drag handlers), not in prune.

## Out of scope

- Resize / rotate paths: in principle a resize or rotate that shifts
  the body's pivot in world space has the same issue, but the
  user-reported case is drag. Track separately if it surfaces.
- Sim-time compile changes — not needed; design-graph world endpoints
  staying coincident with the body is enough.

## Notes

- Repro discovered while building the onboarding-tutorial scene.
