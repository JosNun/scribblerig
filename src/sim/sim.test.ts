import { describe, it, expect, beforeAll } from "vitest";
import { initSim, compile } from "./sim";
import { createScene, addBody, updateRoomSettings, tracerScene } from "../scene/scene";
import { makeBody } from "../registry/registry";

beforeAll(async () => {
  await initSim();
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
    // width 8), so its center stays clear of the right boundary.
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
    expect(maxX).toBeLessThan(8);
    world.free();
  });
});
