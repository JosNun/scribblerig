# 15 — Spring to a static body ignores rest length

Status: done

## Parent

`.scratch/scribblerig/PRD.md`

## Problem

Attaching a spring from a dynamic body to a **static** body just pulled the two
together (gap → ~0) instead of holding the spring's rest length.

## Root cause

Order-dependent Rapier quirk: an impulse joint only enforces its constraint
when a **fixed body is the joint's first body**. A *dynamic-then-fixed* pair
leaves a spring unenforced, collapsing to ~0 length. Drawing a spring *from* a
dynamic body *to* a static one yields exactly that order (`conn.a` = dynamic,
`conn.b` = static), so it broke; drawing the other direction worked. The bug
was invisible to the existing spring test, which only asserted the gap shrank
(a collapse passes that), and which happened to use the static body first.

## Fix

`sim.compileConnector` now reorders so the fixed body is first when exactly one
endpoint is fixed, swapping both bodies and their anchors (an identical
constraint). See [ADR-0007](../../adr/0007-connector-joint-compilation.md).

## Acceptance criteria

- [x] A spring from a dynamic body to a static body (either draw direction)
      settles at its rest length.
- [x] Regression test covers the dynamic-first → static-second order.

## Comments

### 2026-05-21 — Fixed

Added a sim regression test (`a` = dynamic ball, `b` = static platform,
restLength 3) asserting the ball settles ~3 m away, not pulled to the platform.
66 tests pass. Verified in-browser: a spring drawn ball→platform now hangs the
ball at its rest length instead of collapsing up to the platform.
