import { describe, it, expect } from "vitest";
import { encodeScene, decodeScene, sanitizeScene } from "./codec";
import {
  createScene,
  addBody,
  addConnector,
  updateRoomSettings,
  type Scene,
} from "../scene/scene";
import { makeBody, makeConnector } from "../registry/registry";

/** A representative scene: tweaked room, a few bodies, and connectors. */
function sampleScene(): Scene {
  let s = createScene();
  s = updateRoomSettings(s, 0, {
    gravity: { x: 1, y: -5 },
    walls: { floor: true, ceiling: true, left: false, right: true },
    size: { width: 10, height: 8 },
    snap: true,
  });
  const ball = addBody(s, 0, makeBody("ball", { x: 2, y: 3 }));
  s = ball.scene;
  const platform = addBody(s, 0, makeBody("platform", { x: -1, y: 1 }));
  s = platform.scene;
  s = addConnector(
    s,
    0,
    makeConnector("motor", { body: ball.id, local: { x: 0, y: 0 } }, { world: { x: 2, y: 3 } }),
  ).scene;
  s = addConnector(
    s,
    0,
    makeConnector("spring", { body: ball.id, local: { x: 0, y: 0 } }, { body: platform.id, local: { x: 0, y: 0 } }),
  ).scene;
  return s;
}

describe("share codec", () => {
  it("round-trips a scene through encode → decode", () => {
    const s = sampleScene();
    expect(decodeScene(encodeScene(s))).toEqual(s);
  });

  it("returns null for malformed, truncated, or empty input", () => {
    expect(decodeScene("")).toBeNull();
    expect(decodeScene("not valid base64url !@#$%")).toBeNull();
    expect(decodeScene(encodeScene(sampleScene()).slice(0, 12))).toBeNull(); // truncated
  });
});

describe("sanitizeScene (tolerant import)", () => {
  it("rejects input that isn't a scene-shaped object", () => {
    expect(sanitizeScene(42)).toBeNull();
    expect(sanitizeScene(null)).toBeNull();
    expect(sanitizeScene("scene")).toBeNull();
    expect(sanitizeScene({})).toBeNull(); // no rooms
    expect(sanitizeScene({ rooms: [] })).toBeNull(); // empty rooms
  });

  it("drops bodies of an unknown type and keeps the rest", () => {
    const out = sanitizeScene({
      rooms: [
        {
          bodies: [
            { id: "b1", type: "ball", position: { x: 0, y: 1 }, rotation: 0, props: {} },
            { id: "b2", type: "hovercraft", position: { x: 1, y: 1 }, rotation: 0, props: {} },
          ],
          connectors: [],
        },
      ],
    })!;
    expect(out.rooms[0].bodies.map((b) => b.id)).toEqual(["b1"]);
  });

  it("fills missing props with registry defaults, ignores unknown ones, and coerces bad types", () => {
    const out = sanitizeScene({
      rooms: [
        {
          bodies: [
            {
              id: "b1",
              type: "ball",
              position: { x: 0, y: 1 },
              rotation: 0,
              // radius valid; restitution wrong type; friction/density missing; gloss unknown
              props: { radius: 0.9, restitution: "high", gloss: 7 },
            },
          ],
          connectors: [],
        },
      ],
    })!;
    expect(out.rooms[0].bodies[0].props).toEqual({
      radius: 0.9,
      friction: 0.5,
      restitution: 0.5,
      density: 1,
    });
  });

  it("drops connectors whose endpoint references a missing/dropped body", () => {
    const out = sanitizeScene({
      rooms: [
        {
          bodies: [{ id: "b1", type: "ball", position: { x: 0, y: 1 }, rotation: 0, props: {} }],
          connectors: [
            // valid: b1 → a world point
            { id: "c1", type: "spring", a: { body: "b1", local: { x: 0, y: 0 } }, b: { world: { x: 3, y: 1 } }, props: {} },
            // dangling: references b9 which doesn't exist
            { id: "c2", type: "spring", a: { body: "b1", local: { x: 0, y: 0 } }, b: { body: "b9", local: { x: 0, y: 0 } }, props: {} },
          ],
        },
      ],
    })!;
    expect(out.rooms[0].connectors.map((c) => c.id)).toEqual(["c1"]);
  });

  it("advances nextId past every surviving id so later edits don't collide", () => {
    const out = sanitizeScene({
      nextId: 2, // stale/too low
      rooms: [
        {
          bodies: [{ id: "b7", type: "ball", position: { x: 0, y: 1 }, rotation: 0, props: {} }],
          connectors: [{ id: "c4", type: "weld", a: { body: "b7", local: { x: 0, y: 0 } }, b: { world: { x: 1, y: 1 } }, props: {} }],
        },
      ],
    })!;
    expect(out.nextId).toBe(8); // max(2, 7+1, 4+1)
  });
});
