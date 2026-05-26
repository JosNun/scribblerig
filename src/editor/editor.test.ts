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
  pointInBody,
  connectorPivot,
  pruneDetachedConnectors,
} from "./editor";
import { createScene, addBody, addConnector, updateBody } from "../scene/scene";
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

  it("picks a text body via its measured glyph bbox (no collider to fall back on)", () => {
    let s = createScene();
    // A text body has shapes() === [], so it would otherwise be unpickable.
    // The editor measures the glyph bbox so a click on the label still hits.
    const label = addBody(s, 0, makeBody("text", { x: 0, y: 0 }));
    s = label.scene;
    // A click near the center lands inside the bbox.
    expect(bodyAtPoint(s, 0, { x: 0, y: 0 })).toBe(label.id);
    // A click far outside the label misses.
    expect(bodyAtPoint(s, 0, { x: 10, y: 10 })).toBeNull();
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
  // The world position of a box corner, given its handle direction signs.
  const cornerWorld = (b: Body, sx: number, sy: number) =>
    bodyToWorld(b, { x: (sx * (b.props.width as number)) / 2, y: (sy * (b.props.height as number)) / 2 });

  it("anchors the opposite corner by default, moving the center", () => {
    // Platform is 3 × 0.4 at the origin. Drag the ne corner to (2, 1): the sw
    // corner (-1.5, -0.2) must stay put, so the box spans (-1.5,-0.2)→(2,1).
    const { props, position } = applyResize(platform(), "ne", { x: 2, y: 1 });
    expect(props).toMatchObject({ width: 3.5, height: 1.2 });
    expect(position.x).toBeCloseTo(0.25, 6);
    expect(position.y).toBeCloseTo(0.4, 6);
  });

  it("keeps the opposite corner fixed on a rotated box", () => {
    const b = platform({ rotation: Math.PI / 4, position: { x: 1, y: 2 } });
    const anchorBefore = cornerWorld(b, -1, -1); // sw, opposite the ne handle
    const { props, position } = applyResize(b, "ne", { x: 3, y: 4 });
    const resized = { ...b, position, props: { ...b.props, ...props } };
    const anchorAfter = cornerWorld(resized, -1, -1);
    expect(anchorAfter.x).toBeCloseTo(anchorBefore.x, 6);
    expect(anchorAfter.y).toBeCloseTo(anchorBefore.y, 6);
  });

  it("keeps the anchor corner fixed when a dimension clamps", () => {
    const b = platform(); // width 3 (max 12), height 0.4 (min 0.1)
    const anchorBefore = cornerWorld(b, -1, -1);
    const { props, position } = applyResize(b, "ne", { x: 50, y: -0.15 });
    expect(props.width).toBe(12); // clamped to schema max
    expect(props.height).toBe(0.1); // clamped to schema min
    const resized = { ...b, position, props: { ...b.props, ...props } };
    const anchorAfter = cornerWorld(resized, -1, -1);
    expect(anchorAfter.x).toBeCloseTo(anchorBefore.x, 6);
    expect(anchorAfter.y).toBeCloseTo(anchorBefore.y, 6);
  });

  it("resizes symmetrically about the center when Alt is held", () => {
    const { props, position } = applyResize(platform(), "ne", { x: 2, y: 0.6 }, true);
    expect(props).toMatchObject({ width: 4, height: 1.2 });
    expect(position).toEqual({ x: 0, y: 0 }); // center unchanged
  });

  it("clamps box dimensions to the schema range (symmetric)", () => {
    const { props } = applyResize(platform(), "ne", { x: 50, y: 0.01 }, true);
    expect(props.width).toBe(12); // schema max
    expect(props.height).toBe(0.1); // schema min
  });

  it("resizes a circle by distance from center (Alt is a no-op)", () => {
    const sym = applyResize(ball(), "radius", { x: 1.2, y: 0 }, true);
    const anchored = applyResize(ball(), "radius", { x: 1.2, y: 0 });
    expect(sym.props).toMatchObject({ radius: 1.2 });
    expect(anchored.props).toMatchObject({ radius: 1.2 });
    expect(sym.position).toEqual({ x: 0, y: 0 }); // center fixed for circles
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

describe("pointInBody", () => {
  it("is true for a point inside a ball's radius and false outside", () => {
    const b = ball({ position: { x: 2, y: 3 } }); // radius 0.5
    expect(pointInBody(b, { x: 2.3, y: 3 })).toBe(true);
    expect(pointInBody(b, { x: 2.6, y: 3 })).toBe(false);
  });

  it("respects a box's rotated extent", () => {
    // A 3×0.4 platform rotated 90° lies along the y axis: ~3 tall, 0.4 wide.
    const b = platform({ rotation: Math.PI / 2, position: { x: 0, y: 0 } });
    expect(pointInBody(b, { x: 0, y: 1 })).toBe(true);
    expect(pointInBody(b, { x: 1, y: 0 })).toBe(false);
  });
});

describe("connectorPivot", () => {
  it("returns null for a spring (no single pivot)", () => {
    let s = createScene();
    const a = addBody(s, 0, makeBody("ball", { x: 0, y: 0 })); s = a.scene;
    const c = addConnector(s, 0, {
      type: "spring",
      a: { body: a.id, local: { x: 0, y: 0 } },
      b: { world: { x: 3, y: 0 } },
      props: {},
    });
    s = c.scene;
    expect(connectorPivot(s, 0, s.rooms[0].connectors[0])).toBeNull();
  });

  it("returns the world endpoint when one side is a fixed world point", () => {
    let s = createScene();
    const a = addBody(s, 0, makeBody("ball", { x: 5, y: 5 })); s = a.scene;
    const c = addConnector(s, 0, {
      type: "pin",
      a: { body: a.id, local: { x: 0, y: 0 } },
      b: { world: { x: 2, y: 3 } }, // world wins
      props: {},
    });
    s = c.scene;
    expect(connectorPivot(s, 0, s.rooms[0].connectors[0])).toEqual({ x: 2, y: 3 });
  });

  it("returns body `a`'s anchor world position when both ends are body-anchored", () => {
    let s = createScene();
    const a = addBody(s, 0, makeBody("ball", { x: 0, y: 5 })); s = a.scene;
    const b = addBody(s, 0, makeBody("ball", { x: 0, y: 5 })); s = b.scene;
    const c = addConnector(s, 0, {
      type: "pin",
      a: { body: a.id, local: { x: 0, y: 0 } },
      b: { body: b.id, local: { x: 0, y: 0 } },
      props: {},
    });
    s = c.scene;
    // Moving b leaves the canonical pivot on a.
    s = updateBody(s, 0, b.id, { position: { x: 3, y: 5 } });
    expect(connectorPivot(s, 0, s.rooms[0].connectors[0])).toEqual({ x: 0, y: 5 });
  });
});

describe("pruneDetachedConnectors (issue 24)", () => {
  it("removes a pin whose partner has been moved away from the pivot", () => {
    let s = createScene();
    const a = addBody(s, 0, makeBody("ball", { x: 0, y: 5 })); s = a.scene;
    const b = addBody(s, 0, makeBody("ball", { x: 0, y: 5 })); s = b.scene;
    const c = addConnector(s, 0, {
      type: "pin",
      a: { body: a.id, local: { x: 0, y: 0 } },
      b: { body: b.id, local: { x: 0, y: 0 } },
      props: {},
    });
    s = c.scene;
    // Move b far away; pivot (on a at world (0,5)) is now outside b's radius.
    s = updateBody(s, 0, b.id, { position: { x: 3, y: 5 } });
    s = pruneDetachedConnectors(s, 0);
    expect(s.rooms[0].connectors).toEqual([]);
  });

  it("keeps a pin whose pivot is still inside both bodies", () => {
    let s = createScene();
    const a = addBody(s, 0, makeBody("ball", { x: 0, y: 5 })); s = a.scene;
    const b = addBody(s, 0, makeBody("ball", { x: 0, y: 5 })); s = b.scene;
    const c = addConnector(s, 0, {
      type: "pin",
      a: { body: a.id, local: { x: 0, y: 0 } },
      b: { body: b.id, local: { x: 0, y: 0 } },
      props: {},
    });
    s = c.scene;
    // Nudge b by 0.2m — pivot at (0,5) still inside b (radius 0.5).
    s = updateBody(s, 0, b.id, { position: { x: 0.2, y: 5 } });
    s = pruneDetachedConnectors(s, 0);
    expect(s.rooms[0].connectors).toHaveLength(1);
  });

  it("never prunes a spring, regardless of anchor positions", () => {
    let s = createScene();
    const a = addBody(s, 0, makeBody("ball", { x: 0, y: 5 })); s = a.scene;
    const b = addBody(s, 0, makeBody("ball", { x: 5, y: 5 })); s = b.scene;
    s = addConnector(s, 0, {
      type: "spring",
      a: { body: a.id, local: { x: 0, y: 0 } },
      b: { body: b.id, local: { x: 0, y: 0 } },
      props: { restLength: 5 },
    }).scene;
    // Move the bodies further; a spring's anchors don't need to be inside.
    s = updateBody(s, 0, b.id, { position: { x: 50, y: 50 } });
    s = pruneDetachedConnectors(s, 0);
    expect(s.rooms[0].connectors).toHaveLength(1);
  });

  it("removes a world-anchored pin/weld/motor when the body moves off its world point", () => {
    let s = createScene();
    const a = addBody(s, 0, makeBody("ball", { x: 0, y: 5 })); s = a.scene;
    s = addConnector(s, 0, {
      type: "weld",
      a: { body: a.id, local: { x: 0, y: 0 } },
      b: { world: { x: 0, y: 5 } }, // anchored at the body's current spot
      props: {},
    }).scene;
    // Move the body away from the world anchor; weld falls off.
    s = updateBody(s, 0, a.id, { position: { x: 5, y: 5 } });
    s = pruneDetachedConnectors(s, 0);
    expect(s.rooms[0].connectors).toEqual([]);
  });
});
