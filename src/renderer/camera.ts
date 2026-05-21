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
  margin = 0,
): Camera {
  // Fit the room plus a margin (meters) on every side, so the boundary walls —
  // which sit just outside the play area — stay visible and the room is framed.
  const scale = Math.min(viewW / (roomW + 2 * margin), viewH / (roomH + 2 * margin));
  return {
    scale,
    originX: viewW / 2,
    // Room's vertical center (y = roomH/2) maps to the viewport center.
    originY: viewH / 2 + (roomH / 2) * scale,
  };
}
