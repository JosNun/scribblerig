import { describe, it, expect } from "vitest";
import { createCamera, worldToScreen, screenToWorld, fitCamera } from "./camera";

describe("camera", () => {
  it("maps world meters to screen pixels and flips the y axis (world up = screen up)", () => {
    // 50 px per meter; world origin sits at screen (400, 450) — bottom-center.
    const cam = createCamera({ scale: 50, originX: 400, originY: 450 });

    // World origin maps to the screen origin point.
    expect(worldToScreen(cam, { x: 0, y: 0 })).toEqual({ x: 400, y: 450 });
    // Moving +1m right is +50px; moving +1m UP is -50px on screen (flip).
    expect(worldToScreen(cam, { x: 1, y: 2 })).toEqual({ x: 450, y: 350 });
  });

  it("screenToWorld inverts worldToScreen", () => {
    const cam = createCamera({ scale: 50, originX: 400, originY: 450 });
    const world = { x: -2.5, y: 3.5 };
    const screen = worldToScreen(cam, world);
    expect(screenToWorld(cam, screen)).toEqual(world);
  });

  it("fitCamera contains a 16×9 room in a matching viewport, floor at the bottom", () => {
    const cam = fitCamera(16, 9, 1600, 900);
    expect(cam.scale).toBe(100); // min(1600/16, 900/9)
    // Floor (y=0) at the bottom edge; ceiling height (y=9) at the top edge.
    expect(worldToScreen(cam, { x: 0, y: 0 })).toEqual({ x: 800, y: 900 });
    expect(worldToScreen(cam, { x: 0, y: 9 })).toEqual({ x: 800, y: 0 });
  });

  it("fitCamera letterboxes when the viewport is taller than the room aspect", () => {
    // 16:9 room in a 1600×1000 viewport: width-limited, so scale = 100.
    const cam = fitCamera(16, 9, 1600, 1000);
    expect(cam.scale).toBe(100);
    // Room is 900px tall, centered in 1000px → 50px margin top and bottom.
    expect(worldToScreen(cam, { x: 0, y: 0 }).y).toBe(950);
  });

  it("fitCamera with a margin shrinks the room and keeps the walls on-screen", () => {
    // 16×9 room + 1m margin each side → fit 18×11 into 1600×900.
    const cam = fitCamera(16, 9, 1600, 900, 1);
    expect(cam.scale).toBeCloseTo(Math.min(1600 / 18, 900 / 11), 5);
    // The floor (y=0) sits inside the viewport, not on its bottom edge.
    expect(worldToScreen(cam, { x: 0, y: 0 }).y).toBeLessThan(900);
  });
});
