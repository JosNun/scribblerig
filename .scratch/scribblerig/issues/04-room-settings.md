# 04 — Room settings (gravity, walls, grid)

Status: done

## Parent

`.scratch/scribblerig/PRD.md`

## What to build

Expose per-room settings, stored on the room in `scene` and applied by `sim`.

- **Gravity** — adjustable strength **and** direction (supports normal, sideways, and zero gravity).
- **Walls** — toggle floor, ceiling, left, and right boundaries independently. Walls are static collision boundaries (bodies bounce off them); they are not anchor targets.
- **Grid / snapping** — toggle grid snapping for the room.
- **Sensible default room** on startup (floor present, normal downward gravity, grid snap on) so the user can start building immediately.

Settings live in `room.settings` and feed the `sim` compile step. The fixed room size is a single sensible default for v1 (resizing is out of scope).

## Acceptance criteria

- [x] Gravity strength and direction are adjustable and visibly change simulation behavior (including a zero-gravity room).
- [x] Floor, ceiling, and side walls can each be toggled on/off and bodies collide with the enabled ones.
- [x] Grid snapping can be toggled for the room.
- [x] A fresh session opens a sensible default room (floor, normal gravity, grid snap on).
- [x] Room settings are stored in `scene` and survive a Reset / re-compile.

## Blocked by

- `.scratch/scribblerig/issues/02-place-drag-delete-bodies.md`

## Comments

### 2026-05-21 — Implemented (TDD)

45 tests passing. Gravity and walls already fed `sim` from slice 01; this issue
added the editing UI, moved grid snap into the room, drew the walls, and locked
the behavior in with tests.

- `scene`: `RoomSettings.snap` (default true) + pure `updateRoomSettings`;
  default room is floor + downward gravity + snap on.
- `sim` tests: zero-g leaves a body floating, sideways gravity pulls it
  sideways, an enabled side wall keeps it in the room. (Gravity vector + wall
  colliders were already wired.)
- `renderer`: draws **all** enabled walls (floor/ceiling/left/right), not just
  the floor, matching the sim collider geometry.
- `camera.fitCamera`: added a framing **margin** so the boundary walls (which
  sit just outside the play area) stay on-screen instead of being clipped when
  the room exactly fills the viewport.
- `ui/RoomSettingsPanel`: gravity strength + direction (0° = down; direction
  disabled at zero-g) and the four wall toggles. Shown on the right when no body
  is selected; the body PropertyPanel takes over when one is.
- `App`: grid snap now reads/writes `room.settings.snap` (the design graph) so
  it survives Reset.

Verified in-browser: enabled all four walls (full framed room), set gravity to 0
and pressed Play (ball floats), Reset preserved gravity + walls.

Follow-ups: gravity direction control is a plain slider for now (issue 09 will
make controls expressive); room size is a fixed default (resizing out of scope).
