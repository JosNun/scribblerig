/**
 * Undo/redo history for the design graph.
 *
 * Storage is full-Scene snapshots per step. Scene ops produce new objects via
 * spread updates, so successive snapshots share the unchanged sub-trees in
 * memory — heap cost per entry is dominated by the mutated body/connector,
 * not the whole scene.
 *
 * Coalescing: callers tag rapid streams of changes (slider scrubs, title
 * typing) with a `mergeKey`. A new push within the merge window whose
 * `mergeKey` matches the top entry replaces that entry's `after` with the
 * new `next` while keeping the original `before` — so one scrub collapses
 * into one undo step.
 *
 * No React. Owns no Scene mutation; the caller writes `next` to its own
 * state and reports it here.
 */

import type { Scene } from "../scene/scene";

interface Entry {
  before: Scene;
  after: Scene;
  mergeKey?: string;
  /** `Date.now()` at push time. Used for the coalescing window. */
  timestamp: number;
}

export interface History {
  /**
   * Record that the scene changed from `prev` to `next`. Clears the redo
   * stack. If `opts.mergeKey` matches the top entry's key and falls within
   * the merge window, the top entry is extended in place instead of pushed.
   */
  push(prev: Scene, next: Scene, opts?: { mergeKey?: string }): void;
  /**
   * Pop the top of the undo stack onto the redo stack and return its
   * `before`. The caller writes the returned scene into its own state.
   * Returns `null` when the stack is empty.
   */
  undo(): Scene | null;
  /** Mirror of {@link undo}: returns the popped entry's `after`. */
  redo(): Scene | null;
  canUndo(): boolean;
  canRedo(): boolean;
  /** Drop both stacks. Called on session/scene replacement. */
  clear(): void;
}

export interface HistoryOptions {
  /** Max entries on the undo stack. Older entries fall off the back. */
  capacity?: number;
  /** Merge window for matching `mergeKey` pushes, in ms. */
  mergeWindowMs?: number;
  /** Test seam: override `Date.now()`. */
  now?: () => number;
}

const DEFAULT_CAPACITY = 100;
const DEFAULT_MERGE_WINDOW_MS = 600;

export function createHistory(opts: HistoryOptions = {}): History {
  const capacity = opts.capacity ?? DEFAULT_CAPACITY;
  const mergeWindow = opts.mergeWindowMs ?? DEFAULT_MERGE_WINDOW_MS;
  const now = opts.now ?? Date.now;

  const undoStack: Entry[] = [];
  const redoStack: Entry[] = [];

  return {
    push(prev, next, options) {
      // No-op pushes (caller didn't actually change the scene) shouldn't
      // pollute history.
      if (prev === next) return;
      const mergeKey = options?.mergeKey;
      const top = undoStack[undoStack.length - 1];
      if (
        top !== undefined &&
        mergeKey !== undefined &&
        top.mergeKey === mergeKey &&
        now() - top.timestamp <= mergeWindow
      ) {
        // Extend the existing entry: keep its `before` (the gesture's true
        // starting point), advance its `after` to the latest `next`. Bump
        // the timestamp so the merge window slides with continued activity.
        top.after = next;
        top.timestamp = now();
      } else {
        undoStack.push({ before: prev, after: next, mergeKey, timestamp: now() });
        if (undoStack.length > capacity) undoStack.shift();
      }
      // Any new mutation invalidates the redo branch.
      redoStack.length = 0;
    },
    undo() {
      const entry = undoStack.pop();
      if (!entry) return null;
      redoStack.push(entry);
      return entry.before;
    },
    redo() {
      const entry = redoStack.pop();
      if (!entry) return null;
      undoStack.push(entry);
      return entry.after;
    },
    canUndo() {
      return undoStack.length > 0;
    },
    canRedo() {
      return redoStack.length > 0;
    },
    clear() {
      undoStack.length = 0;
      redoStack.length = 0;
    },
  };
}
