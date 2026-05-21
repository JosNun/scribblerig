import { describe, it, expect } from "vitest";
import { snapToGrid, bodyAtPoint } from "./editor";
import { createScene, addBody } from "../scene/scene";
import { makeBody } from "../registry/registry";

describe("snapToGrid", () => {
  it("rounds a point to the nearest grid multiple", () => {
    expect(snapToGrid({ x: 1.2, y: -0.4 }, 0.5)).toEqual({ x: 1, y: -0.5 });
  });

  it("is a no-op when the grid size is zero (snapping off)", () => {
    expect(snapToGrid({ x: 1.23, y: 4.56 }, 0)).toEqual({ x: 1.23, y: 4.56 });
  });
});

describe("bodyAtPoint", () => {
  it("returns the id of a ball when the point is inside its radius", () => {
    let s = createScene();
    const ball = addBody(s, 0, { ...makeBody("ball", { x: 0, y: 0 }) }); // radius 0.5
    s = ball.scene;

    expect(bodyAtPoint(s, 0, { x: 0.3, y: 0.3 })).toBe(ball.id); // dist < 0.5
    expect(bodyAtPoint(s, 0, { x: 1, y: 1 })).toBeNull(); // outside
  });

  it("hit-tests a platform's box and returns the topmost body when overlapping", () => {
    let s = createScene();
    const plat = addBody(s, 0, { ...makeBody("platform", { x: 0, y: 0 }) }); // 3 × 0.4
    s = plat.scene;
    const ball = addBody(s, 0, { ...makeBody("ball", { x: 0, y: 0 }) });
    s = ball.scene;

    // Point only inside the wide platform, not the small ball.
    expect(bodyAtPoint(s, 0, { x: 1.3, y: 0 })).toBe(plat.id);
    // Point inside both: the later-added body (drawn on top) wins.
    expect(bodyAtPoint(s, 0, { x: 0, y: 0 })).toBe(ball.id);
  });
});
