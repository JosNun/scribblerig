import { describe, it, expect } from "vitest";
import { createHistory } from "./history";
import { createScene, addBody, updateBody } from "../scene/scene";
import type { Scene } from "../scene/scene";

/** Three distinct scenes built from the empty one — enough for ordering tests. */
function threeScenes(): [Scene, Scene, Scene] {
  const a = createScene();
  const b = addBody(a, 0, {
    type: "ball",
    position: { x: 0, y: 5 },
    rotation: 0,
    props: { radius: 0.5, restitution: 0.7, density: 1 },
  }).scene;
  const id = b.rooms[0].bodies[0].id;
  const c = updateBody(b, 0, id, { position: { x: 1, y: 5 } });
  return [a, b, c];
}

describe("history.push/undo/redo", () => {
  it("returns null on undo/redo when empty", () => {
    const h = createHistory();
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
    expect(h.undo()).toBe(null);
    expect(h.redo()).toBe(null);
  });

  it("undo returns the `before` of the most recent push, then the prior", () => {
    const [a, b, c] = threeScenes();
    const h = createHistory();
    h.push(a, b);
    h.push(b, c);
    expect(h.canUndo()).toBe(true);
    expect(h.undo()).toBe(b);
    expect(h.undo()).toBe(a);
    expect(h.undo()).toBe(null);
  });

  it("redo replays in reverse order after undos", () => {
    const [a, b, c] = threeScenes();
    const h = createHistory();
    h.push(a, b);
    h.push(b, c);
    h.undo();
    h.undo();
    expect(h.canRedo()).toBe(true);
    expect(h.redo()).toBe(b);
    expect(h.redo()).toBe(c);
    expect(h.redo()).toBe(null);
  });

  it("a new push clears the redo branch", () => {
    const [a, b, c] = threeScenes();
    const h = createHistory();
    h.push(a, b);
    h.push(b, c);
    h.undo();
    expect(h.canRedo()).toBe(true);
    h.push(b, a);
    expect(h.canRedo()).toBe(false);
    expect(h.redo()).toBe(null);
  });

  it("skips no-op pushes where prev === next", () => {
    const [a] = threeScenes();
    const h = createHistory();
    h.push(a, a);
    expect(h.canUndo()).toBe(false);
  });

  it("clear empties both stacks", () => {
    const [a, b, c] = threeScenes();
    const h = createHistory();
    h.push(a, b);
    h.push(b, c);
    h.undo();
    h.clear();
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
  });
});

describe("history capacity", () => {
  it("drops the oldest entry when the stack exceeds capacity", () => {
    const [a, b, c] = threeScenes();
    const h = createHistory({ capacity: 2 });
    h.push(a, b);
    h.push(b, c);
    h.push(c, a); // a→b falls off
    expect(h.undo()).toBe(c);
    expect(h.undo()).toBe(b);
    expect(h.undo()).toBe(null); // a→b is gone
  });
});

describe("history mergeKey coalescing", () => {
  it("collapses successive pushes with the same key inside the window", () => {
    const [a, b, c] = threeScenes();
    let t = 0;
    const h = createHistory({ mergeWindowMs: 500, now: () => t });
    t = 0;
    h.push(a, b, { mergeKey: "prop:b1:radius" });
    t = 200;
    h.push(b, c, { mergeKey: "prop:b1:radius" });
    // One entry only; undo returns the original `before` of the merged run.
    expect(h.undo()).toBe(a);
    expect(h.undo()).toBe(null);
  });

  it("pushes a separate entry once the merge window elapses", () => {
    const [a, b, c] = threeScenes();
    let t = 0;
    const h = createHistory({ mergeWindowMs: 500, now: () => t });
    t = 0;
    h.push(a, b, { mergeKey: "prop:b1:radius" });
    t = 1000; // window has lapsed
    h.push(b, c, { mergeKey: "prop:b1:radius" });
    expect(h.undo()).toBe(b);
    expect(h.undo()).toBe(a);
  });

  it("does not merge pushes with different keys", () => {
    const [a, b, c] = threeScenes();
    let t = 0;
    const h = createHistory({ mergeWindowMs: 500, now: () => t });
    t = 0;
    h.push(a, b, { mergeKey: "prop:b1:radius" });
    t = 100;
    h.push(b, c, { mergeKey: "prop:b1:density" });
    expect(h.undo()).toBe(b);
    expect(h.undo()).toBe(a);
  });

  it("does not merge an unkeyed push into a keyed top entry", () => {
    const [a, b, c] = threeScenes();
    const h = createHistory();
    h.push(a, b, { mergeKey: "prop:b1:radius" });
    h.push(b, c); // no key — must be its own entry
    expect(h.undo()).toBe(b);
    expect(h.undo()).toBe(a);
  });

  it("merged-then-undone entry redoes to the merged `after`", () => {
    const [a, b, c] = threeScenes();
    let t = 0;
    const h = createHistory({ mergeWindowMs: 500, now: () => t });
    t = 0;
    h.push(a, b, { mergeKey: "prop:b1:radius" });
    t = 200;
    h.push(b, c, { mergeKey: "prop:b1:radius" });
    expect(h.undo()).toBe(a);
    expect(h.redo()).toBe(c); // the merged endpoint, not `b`
  });
});
