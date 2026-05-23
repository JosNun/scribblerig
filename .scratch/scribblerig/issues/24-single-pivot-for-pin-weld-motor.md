# 24 — Single pivot point for pin / weld / motor (no anchor drift on move)

Status: done

## Parent

`.scratch/scribblerig/PRD.md`

## Problem

When a body that's pinned, welded, or motored to another body is dragged in the
editor, two things look wrong:

- A stray connector line / pivot axis stretches across the gap between the
  bodies.
- On Play, pin and motor make the bodies **snap together** — the solver yanks
  them to satisfy the joint.

Root cause is structural. Today each connector endpoint stores its **own**
local anchor on its body ([scene.ts:32](../../src/scene/scene.ts) —
`Endpoint = { body, local } | { world }`), computed once at placement so both
ends coincide at the click point ([App.tsx:701](../../src/App.tsx)). Nothing
re-couples them when a body moves: `updateBody` just changes pose, and the two
anchors drift apart in their respective body frames.

- **Render** ([renderer.ts:140](../../src/renderer/renderer.ts)) reads each
  anchor's live world position and draws between them — the stray line.
- **Compile** ([sim.ts:267](../../src/sim/sim.ts)) feeds the two diverged
  anchors to `revolute(anchorA, anchorB)`, which forces them coincident — the
  snap.

Weld is the only point-coincident type that doesn't snap, because it compiles
to a compound body from each member's *pose* (not its anchors) — but its
overlay still draws the stray line.

## The one organizing idea

For pin, weld, and motor, **there is only one point** — they're
point-coincident constraints. The bug is a direct consequence of representing
that one point as two independent anchors that can desync. Collapse them:
store the point **once**, anchored to one of the bodies, and **derive** the
partner's local anchor at compile and render time from each body's current
pose. The two ends are then coincident by construction, no matter how either
body is moved. Spring keeps its two-anchor representation — it's a *distance*
between two distinct points and genuinely needs them.

This makes "reproject the partner anchor when a body moves" automatic and
stateless: it falls out of `worldToLocal(partner, pivot)` being evaluated from
the single source of truth on every compile / draw, rather than being
maintained by move logic.

## Decisions (from the developer)

- **Spring is unchanged.** It stays two `Endpoint`s with independent locals.
- **Pin / weld / motor collapse to one stored point.** The point is anchored
  to the connector's **primary body (`a`)**. Moving that body carries the
  pivot with it; moving the partner (`b`) leaves the pivot in place and the
  partner's effective anchor re-derives. (World-fixed alternative considered
  and rejected: it makes the pin appear to slide along a body as you drag it,
  rather than travel with the assembly.)
- **World-anchored single-body case stays as it is.** A pin / weld / motor
  dropped on a *single* body still anchors to a fixed world point (today's
  behaviour — `placeOverlap` already produces `{ world }` for `ids.length ===
  1`). That endpoint already represents one point.
- **No scene-format migration.** Pre-ship; we can change the on-disk shape.
  Existing saves are throwaway.
- **Pin / weld / motor pop off when the pivot leaves a connected body.** If a
  move or resize puts the pivot's world position outside the shape of any
  body the connector references (either the primary, if resized, or the
  partner, if moved away), the connector is **removed**. Matches the
  placement semantic — the click went through those bodies; pull them apart
  and the pin falls out. Springs are *not* subject to this rule (their
  anchors can sit anywhere).

## What to build

1. **Data model** ([scene.ts](../../src/scene/scene.ts)) — change pin / weld /
   motor connectors so they carry **one** stored anchor instead of two
   independent `Endpoint`s. Two viable shapes; pick during implementation:
   - **(a)** Keep `a` and `b` as today but make `b.local` derived/ignored for
     these types; treat `a` as the canonical point. Minimal churn; `b.local`
     becomes vestigial.
   - **(b)** Replace the pair with `bodies: [idA, idB]` plus a single
     `anchor: Endpoint` on the connector. Cleanest model; touches a few more
     call sites.
   - (b) is preferred unless it spirals; either is acceptable. Whichever is
     chosen, `placeOverlap` ([App.tsx:698](../../src/App.tsx)) writes a single
     point per connector.

2. **Render** ([renderer.ts:140](../../src/renderer/renderer.ts)) — for pin /
   weld / motor, resolve **one** world point from the canonical anchor and:
   - **weld**: one square marker at that point (drop the line + second
     square).
   - **pin / motor**: one pivot ring at that point (drop the divergent axis
     line entirely).
   - The motor's direction-aware arc ([renderer.ts:172](../../src/renderer/renderer.ts))
     still draws around that single pivot.

3. **Compile** ([sim.ts:227](../../src/sim/sim.ts)) — `compileConnector` for
   pin / motor derives both `anchorA` and `anchorB` from the single stored
   point: `anchorA = toLocal(hostA, point)`, `anchorB = toLocal(hostB,
   point)`. By construction `toWorld(hostA, anchorA) === toWorld(hostB,
   anchorB) === point`, so the revolute has nothing to snap. Weld's compound
   assembly already ignores anchors; only the stored-point shape changes.

4. **Spring path unchanged** — it keeps its two-anchor compile and the
   rest-length marker ([renderer.ts:262](../../src/renderer/renderer.ts)) on
   the selected spring.

5. **Existing call sites that read `conn.b` as an `Endpoint`** for pin / weld
   / motor (selection / drag handles on connector endpoints, share codec,
   sanitize) — update to the new shape. The "draggable endpoint handles when
   selected" ([renderer.ts:175](../../src/renderer/renderer.ts)) collapses to
   one handle for these types.

## Acceptance criteria

- [ ] Dragging a body that's pinned / welded / motored to another body shows
      **one** pivot/marker that stays glued to the primary body; no stray
      line spans the gap.
- [ ] On Play, the pinned / motored bodies do not snap or fling — they
      already start in a valid joint configuration because both ends derive
      from the same point.
- [ ] A weld between two bodies still merges them into one compound (issue
      23 / ADR-0009), unchanged.
- [ ] A pin / weld / motor dropped on a single body still anchors to a fixed
      world point (today's behaviour).
- [ ] Springs are unaffected: two independent endpoints, rest-length marker
      on the selected spring still renders.
- [ ] Share / sanitize round-trips the new shape; the property panel still
      works on these connectors.
- [ ] Moving / resizing so the pivot leaves either connected body's shape
      removes the pin / weld / motor connector. Springs are unaffected.

## Blocked by

- `.scratch/scribblerig/issues/23-connector-through-stack-joins-all.md`
  (done — establishes the compound-body model these connectors live in)

## Notes

- Relevant ADRs:
  [0007 connector joint compilation](../../docs/adr/0007-connector-joint-compilation.md),
  [0009 compound bodies for welded clusters](../../docs/adr/0009-compound-bodies-for-welded-clusters.md).
  The single-point model is **compatible** with both — it's a representation
  change in the design graph; the compile output (revolute for pin/motor,
  compound for weld) is unchanged.
- Worth a short ADR alongside the implementation if shape (b) is chosen,
  since it's a real schema break.
- Verify in-browser: place pin/weld/motor through stacked bodies, drag one
  body away in build mode, confirm the pivot stays attached and on Play the
  bodies don't snap. Cover pure parts (anchor derivation, share round-trip)
  with tests.

## Comments

### 2026-05-22 — Implemented

Went with shape (a) from "What to build" — kept the two-`Endpoint` schema, made
`b.local` vestigial for pin/weld/motor. No scene-format change needed.

- **Sim** ([sim.ts](../../src/sim/sim.ts:227)): `compileConnector` computes a
  single `canonicalWorld` for non-spring connectors (world endpoint wins, else
  body `a`) *before* the fixed-first reorder, then derives both `anchorA` and
  `anchorB` from it via `toLocalPt`. The revolute / fixed joint then has
  nothing to snap — anchors are coincident by construction however the design
  bodies have moved.
- **Editor** ([editor.ts](../../src/editor/editor.ts)): added pure helpers
  `pointInBody`, `connectorPivot`, `pruneDetachedConnectors`. The prune walks
  every pin/weld/motor connector and removes any whose pivot is no longer
  inside every referenced body. Springs are skipped.
- **Renderer** ([renderer.ts](../../src/renderer/renderer.ts:140)): pin /
  weld / motor now draw one pivot marker at the canonical point — no axis
  line, no second handle. Motor's direction-aware arc still sits on that
  one pivot. Spring path unchanged.
- **App** ([App.tsx](../../src/App.tsx)): `pruneDetachedConnectors` is
  called after every `updateBody` / `updateConnector` that can change
  geometry (drag, rotate, resize, prop edit, endpoint re-aim).

Tests: +1 in `sim.test.ts` proving anchors stay coincident after a body
move (the no-snap behaviour) and +9 in `editor.test.ts` covering
`pointInBody`, `connectorPivot`, and `pruneDetachedConnectors` for the
pin / spring / world-anchored cases. 109 passing, build clean.

Verified in-browser: single-body weld renders as one square (no line);
pin through two overlapping balls shows one ring; nudging a body keeps the
pin attached; dragging it well past the other ball's radius removes the
connector cleanly; motor's direction-aware arc still draws (issue 12
regression check). No console errors.
