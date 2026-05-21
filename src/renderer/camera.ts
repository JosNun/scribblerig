/**
 * Camera transform: maps world coordinates (meters, y-up) to screen
 * coordinates (pixels, y-down). Pure math, kept separate from the canvas
 * renderer so it can be tested and, later, extended for pan/zoom.
 */

import type { Vec2 } from "../scene/scene";

export interface Camera {
  /** Pixels per meter. */
  scale: number;
  /** Screen pixel position of world origin (0, 0). */
  originX: number;
  originY: number;
}

export function createCamera(camera: Camera): Camera {
  return { ...camera };
}

export function worldToScreen(camera: Camera, world: Vec2): Vec2 {
  return {
    x: camera.originX + world.x * camera.scale,
    y: camera.originY - world.y * camera.scale,
  };
}

export function screenToWorld(camera: Camera, screen: Vec2): Vec2 {
  return {
    x: (screen.x - camera.originX) / camera.scale,
    y: (camera.originY - screen.y) / camera.scale,
  };
}

/**
 * Fit a room of `roomW × roomH` meters into a `viewW × viewH` pixel viewport,
 * preserving aspect ratio (contain) and centering it. The room spans world
 * x ∈ [-roomW/2, roomW/2] and y ∈ [0, roomH] (floor at y = 0).
 */
export function fitCamera(
  roomW: number,
  roomH: number,
  viewW: number,
  viewH: number,
): Camera {
  const scale = Math.min(viewW / roomW, viewH / roomH);
  return {
    scale,
    originX: viewW / 2,
    // world y=0 (floor) maps to the bottom edge of the centered room rectangle.
    originY: (viewH + roomH * scale) / 2,
  };
}
