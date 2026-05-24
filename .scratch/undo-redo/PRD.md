# Undo / Redo

Status: drafting

## Goal

Add Cmd/Ctrl+Z (undo) and Cmd/Ctrl+Shift+Z (redo) to the build mode. The mental
model is "rewind the design graph" — every committed mutation of `Scene` enters
history; selection, camera, and the running simulation do not.

## User-facing behaviour

- **Tracked**: body CRUD, connector CRUD, body/connector prop changes, body
  drag/resize/rotate, connector endpoint drag, room settings (gravity, walls,
  size, snap), scene title. Anything that ends up in the persisted Scene.
- **Not tracked**: selection, camera pan/zoom/fit, simulation state (Play /
  Pause / Reset), drawer/panel UI state.
- **Granularity**: one history step per gesture or atomic action.
  - A drag (move, resize, rotate, endpoint re-aim) is one undo, committed on
    pointerup.
  - A slider scrub / number scrub is one undo, coalesced from the rapid
    `onChange` stream (same selection + same prop key + within ~600ms idle).
  - Alt-drag duplicate is one undo (rolls back the clone *and* its first move).
- **Sim boundary**: undo and redo are disabled outside build mode. Play /
  Pause / Reset never touch the stack — pause then undo and the build state
  rolls back as if the run never happened.
- **Session boundary**: opening a different saved build, loading from a
  shortlink, or starting from a forked snapshot clears history. Within a
  session, history survives indefinitely (capped, see below).

## Shortcuts and UI

- Cmd/Ctrl+Z → undo. Cmd/Ctrl+Shift+Z → redo. (Skip Cmd+Y; macOS norm is
  Shift+Z and the existing shortcuts in App.tsx already use the Mac idiom.)
- Desktop topbar Edit cluster: undo / redo icons, disabled when the
  respective stack is empty, tooltips show the shortcut.
- Mobile palette strip, in the existing "Edit" section after
  Duplicate / Delete: undo / redo tiles. Same disabled semantics.

## Architecture

### Module: `src/history/history.ts`

Pure module, no React.

```ts
export interface History {
  push(prev: Scene, next: Scene, opts?: { mergeKey?: string }): void;
  undo(current: Scene): Scene | null;
  redo(current: Scene): Scene | null;
  canUndo(): boolean;
  canRedo(): boolean;
  clear(): void;
}

export function createHistory(opts?: { capacity?: number }): History;
```

- Internally stores `{ undoPatches, redoPatches, mergeKey, timestamp }` per
  entry. A bounded ring (capacity ~100). Redo stack clears on any new push.
- `mergeKey` — if the new entry's key matches the top entry and is within the
  coalescing window (600ms), replace the top entry's `redoPatches` with the
  forward diff prev→next AND its `undoPatches` with diff(top.prev, next) (the
  net change over the whole gesture). Use mergeKey `"prop:<id>:<key>"` for
  prop scrubs, `"title"` for title typing, `"room:<key>"` for room sliders.

### Storage backend

Each entry holds the full Scene before and after the change. Scenes are
small (~1 KB typical, ~14 KB for a 70-body build, ~JSON.stringify size).
Scene ops are immutable-with-spread, so successive snapshots share the
unchanged sub-trees in memory — heap cost per entry is dominated by the
mutated body/connector, not the whole scene.

```ts
interface HistoryEntry {
  before: Scene;
  after: Scene;
  mergeKey?: string;
  timestamp: number;
}
```

Undo pops `top` from the undo stack, pushes it onto redo, returns
`top.before`. Redo is the mirror.

### App.tsx wiring

- `historyRef = useRef(createHistory())`.
- `gestureStartRef = useRef<Scene | null>(null)`.
- `commitScene(next: Scene, opts?: { mergeKey?: string })` — replaces every
  `sceneRef.current = next; bump()` pair. Computes diff against the current
  sceneRef before writing.
- Pointer handlers:
  - `pointerdown` on a draggable target captures
    `gestureStartRef.current = sceneRef.current`.
  - `pointermove` continues to write `sceneRef.current = …; bump()` directly
    (live preview, no history entry).
  - `pointerup` commits one entry `(gestureStart, current)` *iff* they
    differ by reference. Then clears `gestureStartRef`.
- `onPropChange` and friends call `commitScene(next, { mergeKey: "prop:<id>:<key>" })`.
- Cmd+Z / Cmd+Shift+Z handlers call `historyRef.current.undo/redo(sceneRef.current)`,
  set `sceneRef.current` to the result, and `bump()`. Disabled in run mode.
- Session-load path (`loadSession`, boot from URL) calls `historyRef.current.clear()`.

### Mutation sites to convert (App.tsx line refs from current HEAD)

Atomic (single commitScene call):
- 581 — Alt-drag duplicate (captured under the same gestureStart as the move
  it kicks off → one undo covers both)
- 732, 740-764 — pin/weld/motor placeOverlap
- 780 — spring finishConnector
- 811-813 — delete
- 833, 947, 999 — place body (palette tap / drop / spawn)
- duplicateSelection (Cmd+D / mobile button)
- paste

Gesture (gestureStart at pointerdown, commit at pointerup):
- 636 — connector endpoint drag
- 648 — body rotate
- 653 — body resize
- 666 — body move

Coalesced (mergeKey within commitScene):
- 791 — body prop change
- 800 — connector prop change
- 1059 — room settings
- 1067-1070 — title

Clears history:
- 1081 — loadSession

## Tests

- `src/history/history.test.ts` — push/undo/redo/clear, capacity rolloff,
  merge-key coalescing.
- Extend `editor.test.ts` or add a small integration test exercising
  commitScene-equivalent behaviour through pure helpers.
- Manual: drag-drop body, undo wipes it; drag move, undo restores position;
  prop scrub, undo restores starting value (not midpoint); play+pause+undo
  rewinds build state.

## Out of scope (v1)

- Multi-room undo (the app only has room 0 today).
- Persisting history into the saved session (history is per-tab session
  state; closing the tab clears it).
- A history panel / timeline UI.
- Undoing the Play→Pause→Reset cycle. Sim state stays orthogonal.
