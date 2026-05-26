import { describe, it, expect, beforeAll } from "vitest";
import { initSim, compile, weldComponents } from "./sim";
import {
  createScene,
  addBody,
  addConnector,
  updateBody,
  updateRoomSettings,
  tracerScene,
  type Body,
  type Connector,
} from "../scene/scene";
import { makeBody } from "../registry/registry";

beforeAll(async () => {
  await initSim();
});

describe("weldComponents (compound grouping)", () => {
  const weld = (a: string, b: string) => ({
    type: "weld" as const,
    a: { body: a, local: { x: 0, y: 0 } },
    b: { body: b, local: { x: 0, y: 0 } },
    props: {},
  });

  it("groups each body alone when there are no welds", () => {
    let s = createScene();
    const a = addBody(s, 0, makeBody("ball", { x: 0, y: 0 })); s = a.scene;
    const b = addBody(s, 0, makeBody("ball", { x: 1, y: 0 })); s = b.scene;
    expect(weldComponents(s.rooms[0].bodies, s.rooms[0].connectors)).toEqual([[a.id], [b.id]]);
  });

  it("merges two welded bodies into one component, leaving others alone", () => {
    let s = createScene();
    const a = addBody(s, 0, makeBody("ball", { x: 0, y: 0 })); s = a.scene;
    const b = addBody(s, 0, makeBody("ball", { x: 1, y: 0 })); s = b.scene;
    const c = addBody(s, 0, makeBody("ball", { x: 5, y: 0 })); s = c.scene;
    s = addConnector(s, 0, weld(a.id, b.id)).scene;
    expect(weldComponents(s.rooms[0].bodies, s.rooms[0].connectors)).toEqual([[a.id, b.id], [c.id]]);
  });

  it("transitively merges a weld chain into one component", () => {
    let s = createScene();
    const a = addBody(s, 0, makeBody("ball", { x: 0, y: 0 })); s = a.scene;
    const b = addBody(s, 0, makeBody("ball", { x: 1, y: 0 })); s = b.scene;
    const c = addBody(s, 0, makeBody("ball", { x: 2, y: 0 })); s = c.scene;
    s = addConnector(s, 0, weld(a.id, b.id)).scene;
    s = addConnector(s, 0, weld(b.id, c.id)).scene;
    expect(weldComponents(s.rooms[0].bodies, s.rooms[0].connectors)).toEqual([[a.id, b.id, c.id]]);
  });

  it("does not merge a weld anchored to a world point (single body)", () => {
    let s = createScene();
    const a = addBody(s, 0, makeBody("ball", { x: 0, y: 0 })); s = a.scene;
    s = addConnector(s, 0, {
      type: "weld",
      a: { body: a.id, local: { x: 0, y: 0 } },
      b: { world: { x: 0, y: 0 } },
      props: {},
    }).scene;
    expect(weldComponents(s.rooms[0].bodies, s.rooms[0].connectors)).toEqual([[a.id]]);
  });

  it("only welds merge — a pin between bodies leaves them separate", () => {
    let s = createScene();
    const a = addBody(s, 0, makeBody("ball", { x: 0, y: 0 })); s = a.scene;
    const b = addBody(s, 0, makeBody("ball", { x: 1, y: 0 })); s = b.scene;
    s = addConnector(s, 0, {
      type: "pin",
      a: { body: a.id, local: { x: 0, y: 0 } },
      b: { body: b.id, local: { x: 0, y: 0 } },
      props: {},
    }).scene;
    expect(weldComponents(s.rooms[0].bodies, s.rooms[0].connectors)).toEqual([[a.id], [b.id]]);
  });
});

describe("compile (structural)", () => {
  it("exposes one transform per body, keyed by body id, at its start position", () => {
    const scene = tracerScene();
    const ballId = scene.rooms[0].bodies[0].id;

    const world = compile(scene);
    const transforms = world.readTransforms();

    expect([...transforms.keys()]).toEqual([ballId]);
    expect(transforms.get(ballId)!.position.y).toBeCloseTo(6, 5);
    world.free();
  });
});

describe("simulation behavior", () => {
  it("lets the ball fall under gravity and the floor stops it", () => {
    const scene = tracerScene();
    const ballId = scene.rooms[0].bodies[0].id;
    const startY = scene.rooms[0].bodies[0].position.y;

    const world = compile(scene);

    // A few steps in, the ball is clearly falling.
    for (let i = 0; i < 10; i++) world.step();
    expect(world.readTransforms().get(ballId)!.position.y).toBeLessThan(startY);

    // After enough steps to reach the floor, it never tunnels through it.
    // Rapier's soft contacts allow some penetration at high impact speed, so
    // the ball center dips below `radius` a little — but stays well clear of
    // the floor's top surface at y = 0 (i.e. it bounces, not passes through).
    let minY = Infinity;
    for (let i = 0; i < 600; i++) {
      world.step();
      minY = Math.min(minY, world.readTransforms().get(ballId)!.position.y);
    }
    expect(minY).toBeGreaterThan(0.25);
    world.free();
  });

  it("bounces back up after hitting the floor", () => {
    const scene = tracerScene();
    const ballId = scene.rooms[0].bodies[0].id;
    const world = compile(scene);

    // Find the first low point (floor contact), then confirm it rebounds.
    let prevY = world.readTransforms().get(ballId)!.position.y;
    let bottomedAt = -1;
    for (let i = 0; i < 240; i++) {
      world.step();
      const y = world.readTransforms().get(ballId)!.position.y;
      if (bottomedAt < 0 && y > prevY) bottomedAt = i; // started rising again
      prevY = y;
    }
    expect(bottomedAt).toBeGreaterThan(0);
    world.free();
  });
});

describe("same-machine replay", () => {
  it("produces an identical checksum when the same scene is stepped twice", () => {
    const run = (steps: number): string => {
      const world = compile(tracerScene());
      for (let i = 0; i < steps; i++) world.step();
      const sum = world.checksum();
      world.free();
      return sum;
    };

    expect(run(300)).toBe(run(300));
  });

  it("diverges (different checksum) at different step counts", () => {
    const run = (steps: number): string => {
      const world = compile(tracerScene());
      for (let i = 0; i < steps; i++) world.step();
      const sum = world.checksum();
      world.free();
      return sum;
    };

    expect(run(50)).not.toBe(run(300));
  });
});

describe("registry-driven body types", () => {
  it("keeps a static platform fixed while a ball falls and rests on it", () => {
    let scene = createScene();
    const plat = addBody(scene, 0, { ...makeBody("platform", { x: 0, y: 2 }) });
    scene = plat.scene;
    const ball = addBody(scene, 0, { ...makeBody("ball", { x: 0, y: 5 }) });
    scene = ball.scene;

    const world = compile(scene);
    for (let i = 0; i < 300; i++) world.step();
    const transforms = world.readTransforms();

    // The static platform never moves.
    expect(transforms.get(plat.id)!.position.y).toBeCloseTo(2, 5);
    // The ball lands on top of the platform (above its center at y = 2).
    expect(transforms.get(ball.id)!.position.y).toBeGreaterThan(2);
    expect(transforms.get(ball.id)!.position.y).toBeLessThan(5);
    world.free();
  });
});

describe("room settings feed the simulation", () => {
  it("leaves a body floating under zero gravity", () => {
    let scene = tracerScene();
    scene = updateRoomSettings(scene, 0, { gravity: { x: 0, y: 0 } });
    const id = scene.rooms[0].bodies[0].id;
    const startY = scene.rooms[0].bodies[0].position.y;

    const world = compile(scene);
    for (let i = 0; i < 120; i++) world.step();

    expect(world.readTransforms().get(id)!.position.y).toBeCloseTo(startY, 2);
    world.free();
  });

  it("pulls a body sideways under sideways gravity", () => {
    let scene = tracerScene();
    scene = updateRoomSettings(scene, 0, { gravity: { x: 9.81, y: 0 } });
    const id = scene.rooms[0].bodies[0].id;

    const world = compile(scene);
    for (let i = 0; i < 30; i++) world.step();

    expect(world.readTransforms().get(id)!.position.x).toBeGreaterThan(0.1);
    world.free();
  });

  it("stops a body at an enabled side wall", () => {
    // Rightward gravity + a right wall: the ball can't leave the room (half
    // width 6), so its center stays clear of the right boundary.
    let scene = tracerScene();
    scene = updateRoomSettings(scene, 0, {
      gravity: { x: 9.81, y: 0 },
      walls: { floor: true, ceiling: false, left: false, right: true },
    });
    const id = scene.rooms[0].bodies[0].id;

    const world = compile(scene);
    let maxX = -Infinity;
    for (let i = 0; i < 600; i++) {
      world.step();
      maxX = Math.max(maxX, world.readTransforms().get(id)!.position.x);
    }
    expect(maxX).toBeLessThan(6);
    world.free();
  });
});

describe("connectors compile to joints", () => {
  const distTo = (t: { position: { x: number; y: number } }, x: number, y: number) =>
    Math.hypot(t.position.x - x, t.position.y - y);

  it("a pin hinges a body at its anchor point so it swings about it (lever)", () => {
    let scene = createScene();
    // A 4m platform; pin its left end to the fixed world point it sits at.
    const plat = addBody(scene, 0, {
      ...makeBody("platform", { x: 0, y: 6 }),
      props: { width: 4, height: 0.4, friction: 0.6, static: false },
    });
    scene = plat.scene;
    scene = addConnector(scene, 0, {
      type: "pin",
      a: { body: plat.id, local: { x: -2, y: 0 } }, // left end, in body-local
      b: { world: { x: -2, y: 6 } }, // same world spot
      props: {},
    }).scene;

    const leftEnd = (t: { position: { x: number; y: number }; rotation: number }) => ({
      x: t.position.x + -2 * Math.cos(t.rotation),
      y: t.position.y + -2 * Math.sin(t.rotation),
    });

    const world = compile(scene);
    let minCenterY = Infinity;
    let maxPivotErr = 0;
    for (let i = 0; i < 90; i++) {
      world.step();
      const t = world.readTransforms().get(plat.id)!;
      const e = leftEnd(t);
      maxPivotErr = Math.max(maxPivotErr, Math.hypot(e.x - -2, e.y - 6));
      minCenterY = Math.min(minCenterY, t.position.y);
    }
    // The pinned end stays put at the world pivot…
    expect(maxPivotErr).toBeLessThan(0.1);
    // …while the platform swings down about it under gravity.
    expect(minCenterY).toBeLessThan(5.5);
    world.free();
  });

  it("a weld keeps two bodies in their relative pose as they fall together", () => {
    let scene = createScene();
    const a = addBody(scene, 0, { ...makeBody("platform", { x: 0, y: 6 }), props: { width: 3, height: 0.4, friction: 0.6, static: false } });
    scene = a.scene;
    const b = addBody(scene, 0, { ...makeBody("platform", { x: 2, y: 6 }), props: { width: 3, height: 0.4, friction: 0.6, static: false } });
    scene = b.scene;
    scene = addConnector(scene, 0, {
      type: "weld",
      a: { body: a.id, local: { x: 0, y: 0 } },
      b: { body: b.id, local: { x: 0, y: 0 } },
      props: {},
    }).scene;

    const world = compile(scene);
    for (let i = 0; i < 30; i++) world.step();
    const ta = world.readTransforms().get(a.id)!;
    const tb = world.readTransforms().get(b.id)!;

    // Both fell, and their relative offset is preserved (still ~ (2, 0)).
    expect(ta.position.y).toBeLessThan(6);
    expect(tb.position.x - ta.position.x).toBeCloseTo(2, 1);
    expect(tb.position.y - ta.position.y).toBeCloseTo(0, 1);
    world.free();
  });

  it("welds a stack of three into one rigid body that falls together (issue 23)", () => {
    const weld = (x: string, y: string) => ({
      type: "weld" as const,
      a: { body: x, local: { x: 0, y: 0 } },
      b: { body: y, local: { x: 0, y: 0 } },
      props: {},
    });
    let s = createScene();
    const a = addBody(s, 0, makeBody("ball", { x: 0, y: 6 })); s = a.scene;
    const b = addBody(s, 0, makeBody("ball", { x: 0, y: 7 })); s = b.scene;
    const c = addBody(s, 0, makeBody("ball", { x: 0, y: 8 })); s = c.scene;
    s = addConnector(s, 0, weld(a.id, b.id)).scene; // chain a–b–c → one compound
    s = addConnector(s, 0, weld(b.id, c.id)).scene;

    const world = compile(s);
    for (let i = 0; i < 60; i++) world.step();
    const ta = world.readTransforms().get(a.id)!;
    const tb = world.readTransforms().get(b.id)!;
    const tc = world.readTransforms().get(c.id)!;

    expect(ta.position.y).toBeLessThan(6); // fell
    // The 0/1/2 vertical stacking is held exactly (rigid), and stays aligned.
    expect(tb.position.y - ta.position.y).toBeCloseTo(1, 3);
    expect(tc.position.y - ta.position.y).toBeCloseTo(2, 3);
    expect(Math.abs(tb.position.x - ta.position.x)).toBeLessThan(1e-3);
    world.free();
  });

  it("anchors the whole cluster in place when one welded member is static (issue 23)", () => {
    let s = createScene();
    const plat = addBody(s, 0, { ...makeBody("platform", { x: 0, y: 3 }), props: { width: 3, height: 0.4, friction: 0.6, static: true } });
    s = plat.scene;
    const ball = addBody(s, 0, makeBody("ball", { x: 0, y: 3.5 })); s = ball.scene;
    s = addConnector(s, 0, {
      type: "weld",
      a: { body: plat.id, local: { x: 0, y: 0 } },
      b: { body: ball.id, local: { x: 0, y: 0 } },
      props: {},
    }).scene;

    const world = compile(s);
    for (let i = 0; i < 120; i++) world.step();
    const t = world.readTransforms();
    // A static member fixes the compound: neither body moves.
    expect(t.get(plat.id)!.position.y).toBeCloseTo(3, 5);
    expect(t.get(ball.id)!.position.y).toBeCloseTo(3.5, 5);
    world.free();
  });

  it("places a rotated welded member at its correct world pose (issue 23)", () => {
    let s = createScene();
    const base = addBody(s, 0, { ...makeBody("platform", { x: 0, y: 6 }), props: { width: 3, height: 0.4, friction: 0.6, static: false } });
    s = base.scene;
    const arm = addBody(s, 0, { ...makeBody("platform", { x: 2, y: 6 }), rotation: Math.PI / 2, props: { width: 3, height: 0.4, friction: 0.6, static: false } });
    s = arm.scene;
    s = addConnector(s, 0, {
      type: "weld",
      a: { body: base.id, local: { x: 0, y: 0 } },
      b: { body: arm.id, local: { x: 0, y: 0 } },
      props: {},
    }).scene;

    const world = compile(s);
    // Right after compile (no steps): each member sits at its design pose,
    // confirming the compound frame + offset math.
    const t0 = world.readTransforms();
    expect(t0.get(arm.id)!.position.x).toBeCloseTo(2, 5);
    expect(t0.get(arm.id)!.position.y).toBeCloseTo(6, 5);
    expect(t0.get(arm.id)!.rotation).toBeCloseTo(Math.PI / 2, 5);
    expect(t0.get(base.id)!.rotation).toBeCloseTo(0, 5);

    // After falling, the 90° relative rotation is still held.
    for (let i = 0; i < 30; i++) world.step();
    const t = world.readTransforms();
    const dr = t.get(arm.id)!.rotation - t.get(base.id)!.rotation;
    expect(Math.atan2(Math.sin(dr), Math.cos(dr))).toBeCloseTo(Math.PI / 2, 3);
    world.free();
  });

  it("a pin's anchors stay coincident after a body is moved post-placement (issue 24)", () => {
    // Drift bug: placing a pin between two bodies stores a local anchor on
    // each. Moving one body in the editor separated those anchors in world
    // space; on compile the revolute then yanked the bodies together to
    // satisfy the constraint. With single-pivot derivation, both anchors are
    // re-derived from one canonical world point at compile, so the joint is
    // already satisfied and nothing snaps.
    let scene = updateRoomSettings(createScene(), 0, { gravity: { x: 0, y: 0 } });
    const a = addBody(scene, 0, makeBody("ball", { x: 0, y: 5 }));
    scene = a.scene;
    const b = addBody(scene, 0, makeBody("ball", { x: 0, y: 5 }));
    scene = b.scene;
    // Pin placed where both bodies overlap (world (0, 5) = each body's center).
    scene = addConnector(scene, 0, {
      type: "pin",
      a: { body: a.id, local: { x: 0, y: 0 } },
      b: { body: b.id, local: { x: 0, y: 0 } },
      props: {},
    }).scene;
    // Now move body b in the editor — stale b.local (0, 0) would drift to
    // world (3, 5) under the old two-anchor model.
    scene = updateBody(scene, 0, b.id, { position: { x: 3, y: 5 } });

    const world = compile(scene);
    for (let i = 0; i < 5; i++) world.step();
    const ta = world.readTransforms().get(a.id)!;
    const tb = world.readTransforms().get(b.id)!;
    // Both bodies remain at their design positions (no gravity, no snap).
    expect(ta.position.x).toBeCloseTo(0, 3);
    expect(ta.position.y).toBeCloseTo(5, 3);
    expect(tb.position.x).toBeCloseTo(3, 3);
    expect(tb.position.y).toBeCloseTo(5, 3);
    world.free();
  });

  it("a spring pulls two bodies toward its rest length", () => {
    let scene = createScene();
    scene = updateRoomSettings(scene, 0, { gravity: { x: 0, y: 0 } }); // isolate the spring
    const a = addBody(scene, 0, makeBody("ball", { x: -2, y: 6 }));
    scene = a.scene;
    const b = addBody(scene, 0, makeBody("ball", { x: 2, y: 6 }));
    scene = b.scene;
    scene = addConnector(scene, 0, {
      type: "spring",
      a: { body: a.id, local: { x: 0, y: 0 } },
      b: { body: b.id, local: { x: 0, y: 0 } },
      props: { stiffness: 200, restLength: 1, damping: 1 },
    }).scene;

    const world = compile(scene);
    const startGap = 4;
    for (let i = 0; i < 60; i++) world.step();
    const ta = world.readTransforms().get(a.id)!;
    const tb = world.readTransforms().get(b.id)!;

    // Rest length 1 < initial gap 4, so the spring contracts them closer.
    expect(distTo(ta, tb.position.x, tb.position.y)).toBeLessThan(startGap);
    world.free();
  });

  it("a spring drawn from a dynamic body to a STATIC body still holds rest length", () => {
    // Regression: Rapier only enforces a joint when a fixed body is body1, so a
    // dynamic-then-fixed pair (the order you get drawing a spring *from* a ball
    // *to* a static platform) used to collapse to ~0 instead of the rest length.
    // `sim` now reorders the fixed body first.
    let scene = updateRoomSettings(createScene(), 0, { gravity: { x: 0, y: 0 } });
    const ball = addBody(scene, 0, makeBody("ball", { x: 0, y: 4 }));
    scene = ball.scene;
    const plat = addBody(scene, 0, {
      ...makeBody("platform", { x: 0, y: 8 }),
      props: { width: 3, height: 0.4, friction: 0.6, static: true },
    });
    scene = plat.scene;
    // a = dynamic ball first, b = static platform second (the buggy order).
    scene = addConnector(scene, 0, {
      type: "spring",
      a: { body: ball.id, local: { x: 0, y: 0 } },
      b: { body: plat.id, local: { x: 0, y: 0 } },
      props: { stiffness: 120, restLength: 3, damping: 4, collide: false },
    }).scene;

    const world = compile(scene);
    for (let i = 0; i < 300; i++) world.step();
    const t = world.readTransforms();
    // The platform is static (never moves); the ball settles ~3m below it,
    // not pulled all the way up to it.
    expect(t.get(plat.id)!.position.y).toBeCloseTo(8, 5);
    const gap = 8 - t.get(ball.id)!.position.y;
    expect(gap).toBeGreaterThan(2.7);
    expect(gap).toBeLessThan(3.3);
    world.free();
  });

  it("honours the connector's collide flag between the two joined bodies", () => {
    // Two unit-diameter balls (radius 0.5) hard-sprung toward rest length 0.3,
    // in zero gravity. Apart they want to reach 0.3, but if they collide they
    // can't get closer than ~1.0 (touching).
    const build = (collide: boolean) => {
      let scene = updateRoomSettings(createScene(), 0, { gravity: { x: 0, y: 0 } });
      const a = addBody(scene, 0, makeBody("ball", { x: -2, y: 6 }));
      scene = a.scene;
      const b = addBody(scene, 0, makeBody("ball", { x: 2, y: 6 }));
      scene = b.scene;
      scene = addConnector(scene, 0, {
        type: "spring",
        a: { body: a.id, local: { x: 0, y: 0 } },
        b: { body: b.id, local: { x: 0, y: 0 } },
        props: { stiffness: 300, restLength: 0.3, damping: 2, collide },
      }).scene;
      const world = compile(scene);
      for (let i = 0; i < 120; i++) world.step();
      const t = world.readTransforms();
      const gap = distTo(t.get(a.id)!, t.get(b.id)!.position.x, t.get(b.id)!.position.y);
      world.free();
      return gap;
    };

    expect(build(true)).toBeGreaterThan(0.9); // collide → can't overlap (touch ~1.0)
    expect(build(false)).toBeLessThan(0.6); // no collision → reaches near rest length
  });
});

describe("motor connector", () => {
  // A ball pinned through its center to a fixed world point, driven by a motor.
  // Gravity acts through the pivot (no torque), so the only motion is the spin.
  const drive = (props: Record<string, number | boolean>) => {
    const w = addBody(createScene(), 0, makeBody("ball", { x: 6, y: 6 }));
    const scene = addConnector(w.scene, 0, {
      type: "motor",
      a: { body: w.id, local: { x: 0, y: 0 } },
      b: { world: { x: 6, y: 6 } },
      props,
    });
    return { world: compile(scene.scene), id: w.id, connId: scene.id };
  };

  // Instantaneous angular velocity (rad/s) over one step, wrap-safe.
  const angVel = (world: ReturnType<typeof compile>, id: string) => {
    const r1 = world.readTransforms().get(id)!.rotation;
    world.step();
    const r2 = world.readTransforms().get(id)!.rotation;
    return Math.atan2(Math.sin(r2 - r1), Math.cos(r2 - r1)) * 60;
  };

  it("spins the attached body up to the configured speed while pinning it to the pivot", () => {
    const { world, id } = drive({ speed: 6, torque: 20, reverse: false });
    for (let i = 0; i < 120; i++) world.step(); // settle to steady state
    expect(angVel(world, id)).toBeCloseTo(6, 0); // ≈ target, CCW (positive)
    // The revolute joint holds the body at its pivot — it spins, it doesn't fall.
    const p = world.readTransforms().get(id)!.position;
    expect(Math.hypot(p.x - 6, p.y - 6)).toBeLessThan(0.2);
    world.free();
  });

  it("reverses the spin direction when reverse is on", () => {
    const { world, id } = drive({ speed: 6, torque: 20, reverse: true });
    for (let i = 0; i < 120; i++) world.step();
    expect(angVel(world, id)).toBeCloseTo(-6, 0); // ≈ -target, CW (negative)
    world.free();
  });

  it("retargets the live spin when the speed is tuned, without recompiling", () => {
    const { world, id, connId } = drive({ speed: 2, torque: 20, reverse: false });
    for (let i = 0; i < 120; i++) world.step();
    expect(angVel(world, id)).toBeCloseTo(2, 0);

    world.setMotor(connId, { speed: 8, torque: 20, reverse: false });
    for (let i = 0; i < 120; i++) world.step();
    expect(angVel(world, id)).toBeCloseTo(8, 0);
    world.free();
  });

  it("drives a body about a static mount (motor between two bodies, issue 23)", () => {
    // The wheel-on-a-static-platform case the stack 'bottom = stator' rule keeps
    // working: a motor between a ball and a static platform spins the ball about
    // the pivot while the platform stays put.
    let s = createScene();
    const plat = addBody(s, 0, { ...makeBody("platform", { x: 6, y: 6 }), props: { width: 3, height: 0.4, friction: 0.6, static: true } });
    s = plat.scene;
    const ball = addBody(s, 0, makeBody("ball", { x: 6, y: 6 })); s = ball.scene;
    s = addConnector(s, 0, {
      type: "motor",
      a: { body: ball.id, local: { x: 0, y: 0 } },
      b: { body: plat.id, local: { x: 0, y: 0 } },
      props: { speed: 6, torque: 20, reverse: false },
    }).scene;

    const world = compile(s);
    for (let i = 0; i < 120; i++) world.step();
    // The static platform never moves; the ball spins and stays at the pivot.
    expect(world.readTransforms().get(plat.id)!.position.y).toBeCloseTo(6, 5);
    expect(Math.abs(angVel(world, ball.id))).toBeGreaterThan(3);
    const p = world.readTransforms().get(ball.id)!.position;
    expect(Math.hypot(p.x - 6, p.y - 6)).toBeLessThan(0.3);
    world.free();
  });
});

// Spawners stream copies of a self-contained template into the live world at
// configured intervals (issue 19). Items are ephemeral — never written back to
// the scene; readEphemerals() exposes them so the renderer can draw them.
describe("spawner emission (issue 19)", () => {
  // A bare room with no walls so emitted items fall freely without bouncing.
  function spawnerScene(opts: {
    interval?: number;
    maxAlive?: number;
    speed?: number;
    rotation?: number;
    template?: { bodies: Body[]; connectors: Connector[] };
  } = {}) {
    let s = updateRoomSettings(createScene(), 0, {
      walls: { floor: false, ceiling: false, left: false, right: false },
    });
    const sp = addBody(s, 0, {
      type: "spawner",
      position: { x: 0, y: 5 },
      rotation: opts.rotation ?? 0,
      props: {
        interval: opts.interval ?? 1.0,
        maxAlive: opts.maxAlive ?? 10,
        speed: opts.speed ?? 0,
        static: true, // keep spawner pose stable so tests are deterministic
      },
      template: opts.template ?? {
        bodies: [
          { id: "tb1", type: "ball", position: { x: 0, y: 0 }, rotation: 0, props: { radius: 0.2, density: 1, friction: 0.5, restitution: 0.5 } },
        ],
        connectors: [],
      },
    });
    return { scene: sp.scene, spawnerId: sp.id };
  }

  it("emits nothing when the template is empty", () => {
    const { scene } = spawnerScene({ template: { bodies: [], connectors: [] } });
    const world = compile(scene);
    for (let i = 0; i < 120; i++) world.step();
    expect(world.readEphemerals().bodies).toHaveLength(0);
    world.free();
  });

  it("emits one item per interval; nothing emitted before the first tick fires", () => {
    const { scene } = spawnerScene({ interval: 0.5, maxAlive: 10 });
    const world = compile(scene);
    // 6 steps = 0.1s — well before the first interval fires.
    for (let i = 0; i < 6; i++) world.step();
    expect(world.readEphemerals().bodies).toHaveLength(0);
    // 96 steps = 1.6s → three intervals at 0.5s have fired.
    for (let i = 0; i < 90; i++) world.step();
    expect(world.readEphemerals().bodies).toHaveLength(3);
    world.free();
  });

  it("round-robins through items in template array order", () => {
    const { scene } = spawnerScene({
      interval: 0.5,
      maxAlive: 10,
      template: {
        bodies: [
          { id: "tb1", type: "ball", position: { x: 0, y: 0 }, rotation: 0, props: { radius: 0.2 } },
          { id: "tb2", type: "platform", position: { x: 0, y: 0 }, rotation: 0, props: { width: 0.5, height: 0.1, static: false } },
        ],
        connectors: [],
      },
    });
    const world = compile(scene);
    // Two intervals → first ball, then platform; order preserved in alive FIFO.
    for (let i = 0; i < 70; i++) world.step();
    const types = world.readEphemerals().bodies.map((b) => b.type);
    expect(types).toEqual(["ball", "platform"]);
    world.free();
  });

  it("never exceeds maxAlive; despawns oldest before emitting next", () => {
    const { scene } = spawnerScene({ interval: 0.5, maxAlive: 2 });
    const world = compile(scene);
    let everOverCap = false;
    // 150 steps = 2.5s → 5 emissions; alive count must never exceed 2.
    for (let i = 0; i < 150; i++) {
      world.step();
      if (world.readEphemerals().bodies.length > 2) everOverCap = true;
    }
    expect(everOverCap).toBe(false);
    expect(world.readEphemerals().bodies).toHaveLength(2);
    world.free();
  });

  it("speed prop launches items along the spawner's facing", () => {
    // Rotate the spawner 90° CCW so its +x facing points up (world +y). Items
    // emitted with speed=5 should be visibly *above* the spawner soon after
    // emission, before gravity has time to drag them back down.
    const { scene } = spawnerScene({
      interval: 0.1,
      maxAlive: 1,
      speed: 5,
      rotation: Math.PI / 2,
      template: {
        bodies: [
          { id: "tb1", type: "ball", position: { x: 0, y: 0 }, rotation: 0, props: { radius: 0.1, density: 1 } },
        ],
        connectors: [],
      },
    });
    const world = compile(scene);
    // 12 steps = 0.2s — first emit at frame 6, then 6 more frames of flight.
    for (let i = 0; i < 12; i++) world.step();
    const eph = world.readEphemerals().bodies;
    expect(eph).toHaveLength(1);
    expect(eph[0].transform.position.y).toBeGreaterThan(5);
    world.free();
  });

  it("emitted items carry stable ephemeral ids namespaced by their spawner and sequence", () => {
    const { scene, spawnerId } = spawnerScene({ interval: 0.1, maxAlive: 5 });
    const world = compile(scene);
    for (let i = 0; i < 30; i++) world.step();
    for (const b of world.readEphemerals().bodies) {
      expect(b.id.startsWith(`ephem:${spawnerId}:`)).toBe(true);
    }
    world.free();
  });
});

// Text bodies are an authoring annotation: the renderer needs to see their pose
// in both Build and Run modes, but Rapier must never know they exist. The sim
// strips them before `buildBodies` and seeds their static poses on the side so
// `readTransforms` still surfaces them.
describe("text bodies (PRD: text-object)", () => {
  it("creates no Rapier body but still exposes the text body's transform", () => {
    let s = createScene();
    const ball = addBody(s, 0, makeBody("ball", { x: 0, y: 6 }));
    s = ball.scene;
    const label = addBody(s, 0, {
      ...makeBody("text", { x: 3, y: 4 }),
      rotation: 0.5,
    });
    s = label.scene;

    const world = compile(s);
    // Step a frame so the ball moves but the text body stays put — proving the
    // text pose comes from the static side-table, not a rigid body that
    // accidentally got created.
    const before = world.readTransforms().get(label.id)!;
    for (let i = 0; i < 30; i++) world.step();
    const after = world.readTransforms().get(label.id)!;

    expect(before.position).toEqual({ x: 3, y: 4 });
    expect(before.rotation).toBeCloseTo(0.5, 5);
    expect(after.position).toEqual(before.position);
    expect(after.rotation).toBe(before.rotation);
    // The ball did fall, so the world is actually stepping — not a no-op.
    expect(world.readTransforms().get(ball.id)!.position.y).toBeLessThan(6);
    world.free();
  });

  it("ignores connectors that try to reference a text body (no anchors → drop)", () => {
    // The UI prevents this, but a hand-crafted scene shouldn't crash compile.
    let s = createScene();
    const ball = addBody(s, 0, makeBody("ball", { x: 0, y: 5 }));
    s = ball.scene;
    const label = addBody(s, 0, makeBody("text", { x: 0, y: 3 }));
    s = label.scene;
    s = addConnector(s, 0, {
      type: "spring",
      a: { body: ball.id, local: { x: 0, y: 0 } },
      b: { body: label.id, local: { x: 0, y: 0 } },
      props: { restLength: 1, stiffness: 10, damping: 1, collide: false },
    }).scene;

    const world = compile(s);
    // No throw, and the ball still falls — the dangling connector is silently
    // dropped because the text body has no Rapier counterpart.
    expect(() => {
      for (let i = 0; i < 10; i++) world.step();
    }).not.toThrow();
    expect(world.readTransforms().get(ball.id)!.position.y).toBeLessThan(5);
    world.free();
  });
});
