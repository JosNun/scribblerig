import { describe, it, expect } from "vitest";
import { snap, endpointOf } from "./snapping";
import { createScene, addBody, type Scene } from "../scene/scene";
import { makeBody } from "../registry/registry";

/** Build a scene from a list of [type, x, y] bodies, returning scene + ids. */
function sceneWith(specs: Array<["ball" | "platform", number, number]>) {
  let s: Scene = createScene();
  const ids: string[] = [];
  for (const [type, x, y] of specs) {
    const r = addBody(s, 0, makeBody(type, { x, y }));
    s = r.scene;
    ids.push(r.id);
  }
  return { scene: s, ids };
}

describe("snap", () => {
  it("snaps to the nearest named anchor within the threshold", () => {
    // Platform at origin: center + four corners (hw 1.5, hh 0.2).
    const { scene, ids } = sceneWith([["platform", 0, 0]]);
    const result = snap(scene, 0, { x: 1.45, y: 0.18 }, 0.3);

    expect(result.kind).toBe("anchor");
    if (result.kind === "anchor") {
      expect(result.body).toBe(ids[0]);
      expect(result.name).toBe("topRight"); // local (1.5, 0.2)
      expect(result.local).toEqual({ x: 1.5, y: 0.2 });
    }
  });

  it("resolves ties to the first body / anchor in order", () => {
    // Two balls equidistant from the origin; their centers tie at distance 1.
    const { scene, ids } = sceneWith([["ball", -1, 0], ["ball", 1, 0]]);
    const result = snap(scene, 0, { x: 0, y: 0 }, 2);

    expect(result.kind).toBe("anchor");
    if (result.kind === "anchor") expect(result.body).toBe(ids[0]); // first added wins
  });

  it("ignores anchors outside the threshold and falls through", () => {
    const { scene } = sceneWith([["ball", 5, 5]]); // far away
    const result = snap(scene, 0, { x: 0, y: 0 }, 0.3);
    expect(result.kind).toBe("world");
  });

  it("binds to an arbitrary body point when over a body but not near an anchor", () => {
    // Wide platform: a point on its surface is inside the body but >0.3 from any
    // anchor (corners at x = ±1.5, center at 0).
    const { scene, ids } = sceneWith([["platform", 0, 0]]);
    const result = snap(scene, 0, { x: 0.75, y: 0 }, 0.3);

    expect(result.kind).toBe("body");
    if (result.kind === "body") {
      expect(result.body).toBe(ids[0]);
      expect(result.local).toEqual({ x: 0.75, y: 0 });
    }
  });

  it("falls back to a fixed world point in empty space", () => {
    const { scene } = sceneWith([["ball", 5, 5]]);
    const result = snap(scene, 0, { x: -3, y: 2 }, 0.3);
    expect(result).toEqual({ kind: "world", world: { x: -3, y: 2 } });
  });

  it("endpointOf maps a snap result to a connector endpoint", () => {
    expect(endpointOf({ kind: "world", world: { x: 1, y: 2 } })).toEqual({
      world: { x: 1, y: 2 },
    });
    expect(
      endpointOf({ kind: "anchor", body: "b1", name: "center", local: { x: 0, y: 0 }, world: { x: 0, y: 0 } }),
    ).toEqual({ body: "b1", local: { x: 0, y: 0 } });
  });
});
