# PRD: Pause should resume, not restart

Status: done

## Parent

`.scratch/scribblerig/PRD.md`

## Problem

The transport has three buttons: ▶ Play, ❚❚ Pause, ⏹ Reset. The
intent is clearly "Play starts/runs, Pause halts, Reset returns to
build mode." But in practice, after hitting Pause, hitting Play
**re-compiles the world from scratch** — same as Reset → Play.
So Pause + Play and Reset + Play are indistinguishable, and Pause's
only meaningful difference from Reset is that the bodies stay
visually frozen mid-air on screen.

That collapses three buttons into effectively two ("Stop and replay
from start" vs. "Stop and freeze"). Pause loses its useful function:
let me look at a moment in the simulation, then continue from there.

## Reproduce

1. Press Play. Watch bodies fall / a chain run.
2. Press Pause partway through.
3. Press Play again.
4. Bodies snap back to their build positions and the sim restarts.

Expected: bodies stay where they were when Pause was pressed, and
the sim picks up from there.

## Where the bug lives

`App.tsx`'s transport:

```ts
const play = () => {
  worldRef.current?.free();
  worldRef.current = compile(sceneRef.current);
  clockRef.current.play();
  setState("running");
};
```

`play()` unconditionally frees the existing world and recompiles —
regardless of whether the user was paused (world still alive, ready
to resume) vs. in build mode (no world). The clock's state machine
in `src/clock/clock.ts` already distinguishes `build` / `paused` /
`running`, so the transport just needs to honor it.

## Solution sketch

Branch on the current state:

```ts
const play = () => {
  if (clockRef.current.state === "paused" && worldRef.current) {
    // Resume: keep the world, just unfreeze the clock.
    clockRef.current.play();
    setState("running");
    return;
  }
  worldRef.current?.free();
  worldRef.current = compile(sceneRef.current);
  clockRef.current.play();
  setState("running");
};
```

`pause()` already only halts the clock without freeing the world,
so the world is sitting ready when this kicks in.

## Out of scope

- Step-forward-one-frame button while paused (would be nice but
  separate scope).
- Editing during pause. Right now Build mode is the only edit
  mode; while paused, the design graph is technically editable but
  the live world wouldn't reflect the edits until Reset. Define
  later — for v1, "pause is read-only" is fine.

## Tests

- `App.tsx` doesn't have render-level tests for the transport; this
  is best verified manually (Play → Pause → Play and confirm bodies
  stay where they were).
- `clock.test.ts` already covers the state-machine transitions; no
  changes there.

## Notes

- Without resume, the transport has effectively two modes ("running"
  and "frozen"). With resume, Pause becomes a useful sub-state of
  Run rather than a synonym for Reset.
