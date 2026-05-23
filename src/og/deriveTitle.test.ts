import { describe, expect, it } from "vitest";
import { addBody, addConnector, createScene, type Scene } from "../scene/scene";
import { makeBody, makeConnector } from "../registry/registry";
import { deriveTitle } from "./deriveTitle";

/**
 * `deriveTitle` is the fallback used by the worker when a scene has no
 * explicit `title` field. It's the only string a viewer sees on social
 * cards for un-named shares, so the format and ordering are part of the
 * contract.
 */
describe("deriveTitle", () => {
  it("returns 'Empty room' for a scene with no bodies and no connectors", () => {
    expect(deriveTitle(createScene())).toBe("Empty room");
  });

  it("returns 'Empty room' for a scene with no rooms at all", () => {
    const noRooms: Scene = { version: 1, nextId: 1, rooms: [] };
    expect(deriveTitle(noRooms)).toBe("Empty room");
  });

  it("counts a single body with the singular label", () => {
    let s = createScene();
    s = addBody(s, 0, makeBody("ball", { x: 0, y: 1 })).scene;
    expect(deriveTitle(s)).toBe("1 ball");
  });

  it("pluralizes when the count is more than one", () => {
    let s = createScene();
    s = addBody(s, 0, makeBody("ball", { x: 0, y: 1 })).scene;
    s = addBody(s, 0, makeBody("ball", { x: 1, y: 1 })).scene;
    s = addBody(s, 0, makeBody("ball", { x: 2, y: 1 })).scene;
    expect(deriveTitle(s)).toBe("3 balls");
  });

  it("joins multiple kinds with a mid-dot in registry order (bodies, then connectors)", () => {
    let s = createScene();
    s = addBody(s, 0, makeBody("platform", { x: 0, y: 1 })).scene;
    const ball = addBody(s, 0, makeBody("ball", { x: 0, y: 3 }));
    s = ball.scene;
    // ball first per the registry's body order (BALL before PLATFORM).
    expect(deriveTitle(s)).toBe("1 ball · 1 platform");
  });

  it("includes connectors after bodies, in connector-registry order", () => {
    let s = createScene();
    const ballA = addBody(s, 0, makeBody("ball", { x: -1, y: 3 }));
    s = ballA.scene;
    const ballB = addBody(s, 0, makeBody("ball", { x: 1, y: 3 }));
    s = ballB.scene;
    s = addConnector(
      s,
      0,
      makeConnector(
        "motor",
        { body: ballA.id, local: { x: 0, y: 0 } },
        { world: { x: -1, y: 3 } },
      ),
    ).scene;
    s = addConnector(
      s,
      0,
      makeConnector(
        "spring",
        { body: ballA.id, local: { x: 0, y: 0 } },
        { body: ballB.id, local: { x: 0, y: 0 } },
      ),
    ).scene;
    // Bodies first; connector order from registry is spring, motor, weld, pin
    // (see CONNECTOR_ORDER in registry.ts).
    expect(deriveTitle(s)).toBe("2 balls · 1 spring · 1 motor");
  });

  it("handles connectors-only scenes (no bodies) — still not 'Empty room'", () => {
    // Connectors can sit on world-anchored endpoints with no bodies.
    const scene: Scene = {
      version: 1,
      nextId: 99,
      rooms: [
        {
          settings: createScene().rooms[0].settings,
          bodies: [],
          connectors: [
            {
              id: "c1",
              type: "spring",
              a: { world: { x: 0, y: 0 } },
              b: { world: { x: 1, y: 1 } },
              props: { stiffness: 50, restLength: 1, damping: 1, collide: false },
            },
          ],
        },
      ],
    };
    expect(deriveTitle(scene)).toBe("1 spring");
  });

  it("doesn't emit zero-count groups", () => {
    let s = createScene();
    s = addBody(s, 0, makeBody("ball", { x: 0, y: 3 })).scene;
    // Only balls present — no platforms, no connectors. Result is just balls.
    expect(deriveTitle(s)).toBe("1 ball");
  });
});
