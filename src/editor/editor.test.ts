import { describe, it, expect } from "vitest";
import {
  snapToGrid,
  bodyAtPoint,
  bodyHandles,
  bodyToWorld,
  handleAtPoint,
  applyResize,
  applyRotation,
  clampInsideRoom,
  connectorsAtPoint,
} from "./editor";
import { createScene, addBody, addConnector } from "../scene/scene";
import { makeBody } from "../registry/registry";
import type { Body } from "../scene/scene";

const platform = (over: Partial<Body> = {}): Body => ({
  id: "p1",
  ...makeBody("platform", { x: 0, y: 0 }),
  ...over,
});
const ball = (over: Partial<Body> = {}): Body => ({
  id: "b1",
  ...makeBody("ball", { x: 0, y: 0 }),
  ...over,
});

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

describe("connectorsAtPoint", () => {
  it("returns every connector near the point, topmost (last-added) first", () => {
    // A ball at the origin with a motor pinned through its center, plus a
    // spring from the ball out to a separate point. Clicking the ball center
    // is on the motor's pivot but away from the spring's span.
    let s = createScene();
    const ball = addBody(s, 0, makeBody("ball", { x: 0, y: 0 }));
    s = ball.scene;
    const motor = addConnector(s, 0, {
      type: "motor",
      a: { body: ball.id, local: { x: 0, y: 0 } },
      b: { world: { x: 0, y: 0 } },
      props: {},
    });
    s = motor.scene;
    const spring = addConnector(s, 0, {
      type: "spring",
      a: { body: ball.id, local: { x: 0, y: 0 } },
      b: { world: { x: 5, y: 0 } },
      props: {},
    });
    s = spring.scene;

    // The motor's pivot sits at the origin; the spring runs through it too.
    expect(connectorsAtPoint(s, 0, { x: 0, y: 0 }, 0.2)).toEqual([spring.id, motor.id]);
    // Out along the spring (away from the pivot) only the spring is near.
    expect(connectorsAtPoint(s, 0, { x: 3, y: 0 }, 0.2)).toEqual([spring.id]);
    // Off in empty space, nothing.
    expect(connectorsAtPoint(s, 0, { x: 0, y: 5 }, 0.2)).toEqual([]);
  });
});

describe("handles", () => {
  it("gives a box body four corner handles and a rotation handle above it", () => {
    const hs = bodyHandles(platform()); // 3 × 0.4 → hw 1.5, hh 0.2
    const byId = Object.fromEntries(hs.map((h) => [h.id, h.local]));
    expect(byId.ne).toEqual({ x: 1.5, y: 0.2 });
    expect(byId.sw).toEqual({ x: -1.5, y: -0.2 });
    expect(byId.rotate.x).toBe(0);
    expect(byId.rotate.y).toBeGreaterThan(0.2); // above the top edge
  });

  it("gives a circle body a single radius handle plus a rotation handle", () => {
    const ids = bodyHandles(ball()).map((h) => h.id).sort();
    expect(ids).toEqual(["radius", "rotate"]);
  });

  it("bodyToWorld places a local point relative to the body's transform", () => {
    const b = platform({ position: { x: 2, y: 3 }, rotation: 0 });
    expect(bodyToWorld(b, { x: 1.5, y: 0.2 })).toEqual({ x: 3.5, y: 3.2 });
  });

  it("handleAtPoint detects a handle near a world point within tolerance", () => {
    const b = platform();
    expect(handleAtPoint(b, { x: 1.52, y: 0.19 }, 0.1)).toBe("ne");
    expect(handleAtPoint(b, { x: 0.5, y: 0.5 }, 0.1)).toBeNull();
  });
});

describe("applyResize", () => {
  it("resizes a box symmetrically about its center from a corner drag", () => {
    const next = applyResize(platform(), "ne", { x: 2, y: 0.6 });
    expect(next).toMatchObject({ width: 4, height: 1.2 });
  });

  it("clamps box dimensions to the schema range", () => {
    const next = applyResize(platform(), "ne", { x: 50, y: 0.01 });
    expect(next.width).toBe(12); // schema max
    expect(next.height).toBe(0.1); // schema min
  });

  it("resizes a circle by distance from center", () => {
    const next = applyResize(ball(), "radius", { x: 1.2, y: 0 });
    expect(next).toMatchObject({ radius: 1.2 });
  });
});

describe("applyRotation", () => {
  it("aligns the (upward) rotation handle toward the pointer", () => {
    const b = platform();
    expect(applyRotation(b, { x: 0, y: 1 })).toBeCloseTo(0, 5); // straight up
    expect(applyRotation(b, { x: 1, y: 0 })).toBeCloseTo(-Math.PI / 2, 5); // east
  });
});

describe("clampInsideRoom", () => {
  const size = { width: 12, height: 12 }; // x ∈ [-6, 6], y ∈ [0, 12]

  it("leaves a position that is already inside untouched", () => {
    const b = ball(); // radius 0.5
    expect(clampInsideRoom(size, b, { x: 1, y: 5 })).toEqual({ x: 1, y: 5 });
  });

  it("pulls the body in so its whole extent stays within the room", () => {
    const b = ball(); // radius 0.5 → center can't exceed 5.5
    expect(clampInsideRoom(size, b, { x: 100, y: -100 })).toEqual({ x: 5.5, y: 0.5 });
  });

  it("accounts for a wide platform's half-width", () => {
    const b = platform(); // width 3 → half-width 1.5, so x clamps to 4.5
    expect(clampInsideRoom(size, b, { x: 10, y: 6 }).x).toBeCloseTo(4.5, 5);
  });

  it("uses the rotated bounding box for a turned platform", () => {
    // A 3×0.4 platform rotated 90° is 0.4 wide and 3 tall in world axes,
    // so its world half-width is ~0.2 and it can sit much closer to the wall.
    const b = platform({ rotation: Math.PI / 2 });
    expect(clampInsideRoom(size, b, { x: 10, y: 6 }).x).toBeCloseTo(6 - 0.2, 5);
  });
});
