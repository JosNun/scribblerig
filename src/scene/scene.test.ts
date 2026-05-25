import { describe, it, expect } from "vitest";
import {
  createScene,
  addBody,
  removeBody,
  updateBody,
  duplicateBody,
  updateRoomSettings,
  addConnector,
  removeConnector,
  updateConnector,
  removeBodyAndConnectors,
  tracerScene,
  cloneItem,
  type Body,
  type Connector,
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

describe("duplicateBody", () => {
  it("clones a body into an independent copy with a fresh id at the given position", () => {
    let s = createScene();
    const a = addBody(s, 0, {
      type: "ball",
      position: { x: 1, y: 2 },
      rotation: 0.3,
      props: { radius: 0.7, friction: 0.4 },
    });
    s = a.scene;

    const dup = duplicateBody(s, 0, a.id, { x: 4, y: 5 })!;
    s = dup.scene;

    const [orig, copy] = s.rooms[0].bodies;
    expect(s.rooms[0].bodies).toHaveLength(2);
    expect(copy.id).not.toBe(orig.id);
    expect(copy.type).toBe("ball");
    expect(copy.rotation).toBe(0.3);
    expect(copy.position).toEqual({ x: 4, y: 5 });
    expect(copy.props).toEqual({ radius: 0.7, friction: 0.4 });
  });

  it("deep-copies props so editing the copy does not touch the original", () => {
    let s = createScene();
    const a = addBody(s, 0, makeBody("ball", { x: 0, y: 0 }));
    s = a.scene;
    const dup = duplicateBody(s, 0, a.id, { x: 1, y: 1 })!;
    s = updateBody(dup.scene, 0, dup.id, { props: { radius: 99 } });

    const orig = s.rooms[0].bodies.find((b) => b.id === a.id)!;
    expect(orig.props.radius).not.toBe(99);
  });

  it("returns null for an unknown body id", () => {
    const s = createScene();
    expect(duplicateBody(s, 0, "nope", { x: 0, y: 0 })).toBeNull();
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

describe("cloneItem", () => {
  // A small mintId factory that closes over a counter, matching how the live
  // code wires scene.nextId or a per-spawner sequence into the clone.
  const minter = (start = 100) => {
    let n = start;
    return (kind: "b" | "c"): string => {
      const out = `${kind}${n}`;
      n += 1;
      return out;
    };
  };

  it("mints fresh ids for every body and connector", () => {
    const bodies: Body[] = [
      { id: "b1", type: "ball", position: { x: 0, y: 0 }, rotation: 0, props: { radius: 0.5 } },
      { id: "b2", type: "ball", position: { x: 1, y: 0 }, rotation: 0, props: { radius: 0.5 } },
    ];
    const connectors: Connector[] = [
      {
        id: "c1",
        type: "spring",
        a: { body: "b1", local: { x: 0, y: 0 } },
        b: { body: "b2", local: { x: 0, y: 0 } },
        props: { stiffness: 80 },
      },
    ];

    const out = cloneItem({ bodies, connectors }, minter(100));

    expect(out.bodies.map((b) => b.id)).toEqual(["b100", "b101"]);
    expect(out.connectors.map((c) => c.id)).toEqual(["c102"]);
    expect(out.idMap.get("b1")).toBe("b100");
    expect(out.idMap.get("b2")).toBe("b101");
  });

  it("remaps body-endpoint connectors to the cloned ids", () => {
    const bodies: Body[] = [
      { id: "b1", type: "ball", position: { x: 0, y: 0 }, rotation: 0, props: {} },
      { id: "b2", type: "ball", position: { x: 1, y: 0 }, rotation: 0, props: {} },
    ];
    const connectors: Connector[] = [
      {
        id: "c1",
        type: "spring",
        a: { body: "b1", local: { x: 0.1, y: 0 } },
        b: { body: "b2", local: { x: -0.1, y: 0 } },
        props: {},
      },
    ];

    const out = cloneItem({ bodies, connectors }, minter(100));

    const conn = out.connectors[0];
    expect((conn.a as { body: string }).body).toBe("b100");
    expect((conn.b as { body: string }).body).toBe("b101");
  });

  it("drops connectors whose endpoints reference bodies outside the cloned set", () => {
    const bodies: Body[] = [
      { id: "b1", type: "ball", position: { x: 0, y: 0 }, rotation: 0, props: {} },
    ];
    const connectors: Connector[] = [
      // self-contained: b1 ↔ world point — kept
      {
        id: "c1",
        type: "spring",
        a: { body: "b1", local: { x: 0, y: 0 } },
        b: { world: { x: 3, y: 3 } },
        props: {},
      },
      // cross-scope: references b99 which isn't being cloned — dropped
      {
        id: "c2",
        type: "spring",
        a: { body: "b1", local: { x: 0, y: 0 } },
        b: { body: "b99", local: { x: 0, y: 0 } },
        props: {},
      },
    ];

    const out = cloneItem({ bodies, connectors }, minter(100));

    expect(out.connectors).toHaveLength(1);
    expect(out.connectors[0].id).toBe("c101");
  });

  it("deep-copies props and positions so editing the clone does not touch the source", () => {
    const bodies: Body[] = [
      { id: "b1", type: "ball", position: { x: 1, y: 2 }, rotation: 0, props: { radius: 0.5 } },
    ];

    const out = cloneItem({ bodies, connectors: [] }, minter(100));
    out.bodies[0].position.x = 99;
    out.bodies[0].props.radius = 99;

    expect(bodies[0].position.x).toBe(1);
    expect(bodies[0].props.radius).toBe(0.5);
  });

  it("recursively clones a spawner's template with fresh nested ids", () => {
    const spawner: Body = {
      id: "b1",
      type: "spawner",
      position: { x: 0, y: 0 },
      rotation: 0,
      props: { interval: 1, maxAlive: 10, speed: 0 },
      template: {
        bodies: [
          { id: "b2", type: "ball", position: { x: 0, y: 0 }, rotation: 0, props: {} },
          { id: "b3", type: "ball", position: { x: 1, y: 0 }, rotation: 0, props: {} },
        ],
        connectors: [
          {
            id: "c4",
            type: "spring",
            a: { body: "b2", local: { x: 0, y: 0 } },
            b: { body: "b3", local: { x: 0, y: 0 } },
            props: {},
          },
        ],
      },
    };

    const out = cloneItem({ bodies: [spawner], connectors: [] }, minter(100));
    const clone = out.bodies[0];

    // The top-level spawner gets a fresh id; its template's nested bodies and
    // connectors also get fresh ids and connectors remap to the new nested ids.
    expect(clone.id).toBe("b100");
    expect(clone.template!.bodies.map((b) => b.id)).toEqual(["b101", "b102"]);
    expect(clone.template!.connectors[0].id).toBe("c103");
    expect((clone.template!.connectors[0].a as { body: string }).body).toBe("b101");
    expect((clone.template!.connectors[0].b as { body: string }).body).toBe("b102");
    // The source template is untouched.
    expect(spawner.template!.bodies.map((b) => b.id)).toEqual(["b2", "b3"]);
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
