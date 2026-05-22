import { describe, it, expect } from "vitest";
import {
  createScene,
  addBody,
  removeBody,
  updateBody,
  updateRoomSettings,
  addConnector,
  removeConnector,
  updateConnector,
  removeBodyAndConnectors,
  tracerScene,
} from "./scene";
import { makeBody } from "../registry/registry";

describe("createScene", () => {
  it("starts with exactly one room holding empty, ordered body and connector arrays", () => {
    const scene = createScene();

    expect(scene.rooms).toHaveLength(1);
    expect(scene.rooms[0].bodies).toEqual([]);
    expect(scene.rooms[0].connectors).toEqual([]);
    expect(scene.version).toBe(1);
  });
});

describe("addBody", () => {
  it("appends bodies in insertion order, each with a unique id", () => {
    let scene = createScene();
    const ball = addBody(scene, 0, {
      type: "ball",
      position: { x: 1, y: 5 },
      rotation: 0,
      props: { radius: 0.5 },
    });
    scene = ball.scene;
    const platform = addBody(scene, 0, {
      type: "platform",
      position: { x: 0, y: 0 },
      rotation: 0,
      props: { static: true },
    });
    scene = platform.scene;

    const bodies = scene.rooms[0].bodies;
    expect(bodies.map((b) => b.id)).toEqual([ball.id, platform.id]);
    expect(ball.id).not.toBe(platform.id);
    expect(bodies[0].type).toBe("ball");
    expect(bodies[1].type).toBe("platform");
  });

  it("does not mutate the input scene", () => {
    const scene = createScene();
    addBody(scene, 0, { type: "ball", position: { x: 0, y: 0 }, rotation: 0, props: {} });
    expect(scene.rooms[0].bodies).toEqual([]);
  });
});

describe("removeBody", () => {
  it("removes the matching body and preserves the order of the rest", () => {
    let s = createScene();
    const a = addBody(s, 0, { type: "ball", position: { x: 0, y: 0 }, rotation: 0, props: {} });
    s = a.scene;
    const b = addBody(s, 0, { type: "ball", position: { x: 1, y: 1 }, rotation: 0, props: {} });
    s = b.scene;
    const c = addBody(s, 0, { type: "ball", position: { x: 2, y: 2 }, rotation: 0, props: {} });
    s = c.scene;

    s = removeBody(s, 0, b.id);

    expect(s.rooms[0].bodies.map((x) => x.id)).toEqual([a.id, c.id]);
  });
});

describe("updateBody", () => {
  it("patches the matching body's fields, leaving others untouched", () => {
    let s = createScene();
    const a = addBody(s, 0, {
      type: "ball",
      position: { x: 0, y: 0 },
      rotation: 0,
      props: { radius: 0.5 },
    });
    s = a.scene;

    s = updateBody(s, 0, a.id, { position: { x: 3, y: 4 }, props: { radius: 1 } });

    const body = s.rooms[0].bodies[0];
    expect(body.position).toEqual({ x: 3, y: 4 });
    expect(body.props.radius).toBe(1);
    expect(body.type).toBe("ball");
  });
});

describe("default room", () => {
  it("opens with a floor, downward gravity, and grid snap off", () => {
    const settings = createScene().rooms[0].settings;
    expect(settings.walls.floor).toBe(true);
    expect(settings.gravity).toEqual({ x: 0, y: -9.81 });
    expect(settings.snap).toBe(false);
  });
});

describe("updateRoomSettings", () => {
  it("merges a settings patch without mutating the input scene", () => {
    const scene = createScene();
    const next = updateRoomSettings(scene, 0, {
      gravity: { x: 9.81, y: 0 },
      snap: false,
    });

    expect(next.rooms[0].settings.gravity).toEqual({ x: 9.81, y: 0 });
    expect(next.rooms[0].settings.snap).toBe(false);
    // Untouched fields are preserved; the input scene is unchanged.
    expect(next.rooms[0].settings.walls.floor).toBe(true);
    expect(scene.rooms[0].settings.gravity).toEqual({ x: 0, y: -9.81 });
  });
});

describe("connector operations", () => {
  const spring = (aBody: string, bBody: string) => ({
    type: "spring" as const,
    a: { body: aBody, local: { x: 0, y: 0 } },
    b: { body: bBody, local: { x: 0, y: 0 } },
    props: { stiffness: 50 },
  });

  it("addConnector appends with a unique 'c' id, ordered", () => {
    let s = createScene();
    const a = addBody(s, 0, makeBody("ball", { x: 0, y: 0 }));
    s = a.scene;
    const b = addBody(s, 0, makeBody("ball", { x: 2, y: 0 }));
    s = b.scene;

    const c1 = addConnector(s, 0, spring(a.id, b.id));
    s = c1.scene;
    expect(c1.id).toMatch(/^c\d+$/);
    expect(s.rooms[0].connectors.map((c) => c.id)).toEqual([c1.id]);
    expect(s.rooms[0].connectors[0].type).toBe("spring");
  });

  it("removeConnector and updateConnector behave like the body ops", () => {
    let s = createScene();
    const c = addConnector(s, 0, spring("b1", "b2"));
    s = c.scene;

    s = updateConnector(s, 0, c.id, { props: { stiffness: 200 } });
    expect(s.rooms[0].connectors[0].props.stiffness).toBe(200);

    s = removeConnector(s, 0, c.id);
    expect(s.rooms[0].connectors).toEqual([]);
  });

  it("removeBodyAndConnectors drops connectors that referenced the body", () => {
    let s = createScene();
    const a = addBody(s, 0, makeBody("ball", { x: 0, y: 0 }));
    s = a.scene;
    const b = addBody(s, 0, makeBody("ball", { x: 2, y: 0 }));
    s = b.scene;
    s = addConnector(s, 0, spring(a.id, b.id)).scene;
    // A connector to a fixed world point should survive removing an unrelated body.
    s = addConnector(s, 0, {
      type: "pin",
      a: { body: b.id, local: { x: 0, y: 0 } },
      b: { world: { x: 5, y: 5 } },
      props: {},
    }).scene;

    s = removeBodyAndConnectors(s, 0, a.id);

    expect(s.rooms[0].bodies.map((x) => x.id)).toEqual([b.id]);
    // Only the spring (which referenced a) is gone; the pin on b remains.
    expect(s.rooms[0].connectors.map((c) => c.type)).toEqual(["pin"]);
  });
});

describe("tracerScene", () => {
  it("has a floor enabled, downward gravity, and a single ball above the floor", () => {
    const s = tracerScene();
    const room = s.rooms[0];

    expect(room.settings.walls.floor).toBe(true);
    expect(room.settings.gravity.y).toBeLessThan(0);

    const balls = room.bodies.filter((b) => b.type === "ball");
    expect(balls).toHaveLength(1);
    expect(typeof balls[0].props.radius).toBe("number");
    // Ball starts above the floor (floor sits at y = 0).
    expect(balls[0].position.y).toBeGreaterThan(0);
  });
});
