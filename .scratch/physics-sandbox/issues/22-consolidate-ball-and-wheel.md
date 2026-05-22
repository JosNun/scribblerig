# 22 — Consolidate Ball and Wheel into one circular body

Status: done

## Parent

`.scratch/physics-sandbox/PRD.md`

## Problem

`Ball` and `Wheel` are two body types that differ only in which properties they
expose and how they look:

- **Ball** — `radius`, `restitution` (bounciness), `density`; orange hachure
  fill; no spokes.
- **Wheel** — `radius`, `friction`, `density`; blue zigzag fill; crossed spokes
  so its spin is visible.

That split is artificial: a wheel is just a ball you can grip, and a ball is a
wheel that doesn't. Any round body can roll, bounce, and be driven by a motor.
Collapse them into **one circular body** carrying **all four** properties:
`radius`, `friction`, `bounciness` (restitution), and `density`.

## What to build

- A single circular body type with `propSchema` = radius, friction, bounciness,
  density (merge the two existing schemas; keep the friendly `help` text).
- Sensible merged `defaults` (e.g. `radius 0.5`, `friction 0.5`, `bounciness
  0.4`, `density 1` — tune during triage).
- One palette tile replacing the two.
- The `sim` collider already reads friction/restitution/density per body, so the
  consolidated type just needs to supply all three; verify the compile path uses
  each.

## Migration — not needed (pre-ship breaking change)

The app **hasn't shipped**, so there are no real share links or autosaves in the
wild to preserve. This is a straightforward **breaking change**: drop the
`"ball"`/`"wheel"` types and don't write alias/migration code. Any stale local
autosave that referenced them simply degrades via the existing tolerant decoder
(the unknown bodies drop) — acceptable, since it's only the developer's own
scratch state.

The tolerant-decode design ([ADR-0008](../../docs/adr/0008-tolerant-share-and-autosave.md))
still stands for *future, post-ship* format changes; it just isn't a blocker
here. (Revisit migration discipline once the app ships.)

## Open questions (triage)

- **Name** of the merged type/label: `Ball`, `Wheel`, or a neutral `Disc`/
  `Circle`? (Leaning `Ball` as the generic round body.)
- **Spin visibility**: the wheel's spokes existed so rotation reads while it
  spins (it can be motor-driven). On the merged body, keep crossed spokes
  always, drop them, or show a single subtle orientation mark (a dot/one radius
  line) so spin is visible without it always looking like a wheel? (Leaning: a
  single faint orientation mark.)
- **Fill**: pick one style/colour (ball's orange hachure vs wheel's blue zigzag)
  for the unified body.

## Acceptance criteria

- [ ] One circular body type exposes radius, friction, bounciness, and density;
      the palette shows a single tile.
- [ ] The body rolls (friction), bounces (restitution), and can be motor-driven,
      all from the one type.
- [ ] No migration/alias code for `ball`/`wheel` (pre-ship breaking change);
      stale autosaves referencing them simply drop those bodies.

## Decisions (triage) + outcome

- **Name**: kept `Ball` (type `"ball"`, label "Ball") as the generic round body.
- **Spin visibility**: **no mark at all**. The hachure fill rotates with the
  body (the drawable is cached and the canvas is rotated when drawing), so the
  ball's spin is already visible — the wheel's spokes / an orientation line are
  redundant.
- **Fill**: kept the ball's orange hachure.
- **Defaults**: `radius 0.5`, `friction 0.5`, `bounciness 0.5`, `density 1`.

## Comments

### 2026-05-22 — Implemented

Merged `Wheel` into `Ball`: removed the `WHEEL` registry def and the `"wheel"`
`BodyType`; the `Ball` now carries radius, friction, bounciness, density. No
orientation mark — the hachure fill rotates with the body, so spin is already
visible (no spokes/line needed). No sim change — the collider already reads
friction/restitution/density per body. No migration/back-compat (pre-ship
breaking change); the codec's type-keyed sanitizer drops any stale `wheel`
automatically. Updated tests across registry/editor/sim/sessions/codec/snapping
(84 pass) and the prose in `CONTEXT.md` + `PRD.md`. Verified in-browser: one
Ball palette tile, a plain hachure ball, and selecting it exposes
Radius / Friction / Bounciness / Density.

## Notes

- Touches the registry (`registry.ts`), the `BodyType` union (`scene.ts`), and
  the palette. Renderer needs only the chosen fill/marks. The codec's
  `BodyType`-keyed sanitizer drops the removed types automatically — no codec
  changes required.
- Pre-ship, so no back-compat work is in scope (see the Migration section).
- Related: configure body properties ([issue 03](03-configure-body-properties.md))
  defined the per-type property panel this rides on.
