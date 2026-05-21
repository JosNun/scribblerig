# 04 — Room settings (gravity, walls, grid)

Status: ready-for-agent

## Parent

`.scratch/physics-sandbox/PRD.md`

## What to build

Expose per-room settings, stored on the room in `scene` and applied by `sim`.

- **Gravity** — adjustable strength **and** direction (supports normal, sideways, and zero gravity).
- **Walls** — toggle floor, ceiling, left, and right boundaries independently. Walls are static collision boundaries (bodies bounce off them); they are not anchor targets.
- **Grid / snapping** — toggle grid snapping for the room.
- **Sensible default room** on startup (floor present, normal downward gravity, grid snap on) so the user can start building immediately.

Settings live in `room.settings` and feed the `sim` compile step. The fixed room size is a single sensible default for v1 (resizing is out of scope).

## Acceptance criteria

- [ ] Gravity strength and direction are adjustable and visibly change simulation behavior (including a zero-gravity room).
- [ ] Floor, ceiling, and side walls can each be toggled on/off and bodies collide with the enabled ones.
- [ ] Grid snapping can be toggled for the room.
- [ ] A fresh session opens a sensible default room (floor, normal gravity, grid snap on).
- [ ] Room settings are stored in `scene` and survive a Reset / re-compile.

## Blocked by

- `.scratch/physics-sandbox/issues/02-place-drag-delete-bodies.md`
