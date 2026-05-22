# 11 — Configurable connector collision (connected bodies)

Status: done

## Parent

`.scratch/physics-sandbox/PRD.md`

## Problem

Connectors compile with `collideConnected = false` (Rapier `contactsEnabled =
false`) — see [ADR-0007](../../adr/0007-connector-joint-compilation.md). This is
the PRD default so a wheel pinned to a platform doesn't fight the platform at the
pivot. But it surprises users in some cases:

- A **spring from a ball to a platform** pulls the ball straight *through* the
  platform (they don't collide), so the spring's rest length looks like it "does
  nothing" — the ball just buries itself in the platform.
- Two balls on a spring respect rest length (nothing blocks them) but also pass
  through each other, while still colliding with everything else.

For pins/welds, no-collision is almost always right. For **springs**, you often
want the joined bodies to still collide (a ball bouncing on a sprung platform).

## Direction to evaluate

- A per-connector **"collide"** toggle (boolean prop) surfaced in the property
  panel, defaulting per type: pin/weld → off, spring → **on** (or off, TBD).
- `sim` already has the hook: `joint.setContactsEnabled(...)` — wire it to the prop.
- Reconsider the spring default and document the rest-length semantics so it's not
  confusing (pairs well with issue 12's rest-length visualization).

## Open questions (triage)

- Default per connector type — should springs collide by default?
- Does enabling contacts on a pin reintroduce the "fighting at the pivot" problem
  the PRD warned about? (Probably yes — keep pin default off.)

## Acceptance criteria

- [x] A connector can be set to keep or drop collision between its two bodies, and
      the simulation honours it.
- [x] Sensible per-type defaults; rest-length behaviour is no longer surprising.

## Blocked by

- `.scratch/physics-sandbox/issues/05-connector-framework-spring-weld-pin.md` (done)

## Comments

### 2026-05-21 — Implemented

58 tests. Added a per-connector `collide` boolean prop (registry defaults: spring
**on**, pin/weld **off**) surfaced as a "Bodies collide" toggle in the property
panel. `sim` wires it to `joint.setContactsEnabled(props.collide === true)`.
Sim test verifies two hard-sprung balls can't overlap when collide is on but pass
through when off. ADR-0007 updated to note the deliberate deviation from the PRD's
blanket `collideConnected = false`.

Verified in-browser: a ball sprung to a platform now rests **on** it (spring
compresses) instead of burying itself through it. Confirmed the toggle appears in
the Spring panel, checked by default.
