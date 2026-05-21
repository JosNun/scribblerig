/**
 * Build-mode editing logic, kept pure so it can be tested without the DOM.
 * Pointer/event plumbing lives in the React layer; everything that decides
 * *what mutation happens* lives here and in `scene`.
 */

import type { Scene, Vec2 } from "../scene/scene";
import { def, type Props, type Shape } from "../registry/registry";

/** Round a world point to the nearest grid multiple. Size 0 disables snapping. */
export function snapToGrid(point: Vec2, gridSize: number): Vec2 {
  if (gridSize <= 0) return point;
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
  };
}

/**
 * The id of the topmost body whose geometry contains `worldPoint`, or null.
 * Iterates bodies in reverse so the last-added (drawn on top) wins overlaps.
 */
export function bodyAtPoint(
  scene: Scene,
  roomIndex: number,
  worldPoint: Vec2,
): string | null {
  const bodies = scene.rooms[roomIndex].bodies;
  for (let i = bodies.length - 1; i >= 0; i--) {
    const body = bodies[i];
    const local = toLocal(worldPoint, body.position, body.rotation);
    const shapes = def(body.type).shapes(body.props as Props);
    if (shapes.some((s) => containsLocal(s, local))) return body.id;
  }
  return null;
}

/** Transform a world point into a body's local frame (inverse translate+rotate). */
function toLocal(world: Vec2, origin: Vec2, rotation: number): Vec2 {
  const dx = world.x - origin.x;
  const dy = world.y - origin.y;
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

function containsLocal(shape: Shape, local: Vec2): boolean {
  if (shape.kind === "circle") {
    return local.x * local.x + local.y * local.y <= shape.radius * shape.radius;
  }
  return (
    Math.abs(local.x) <= shape.halfWidth && Math.abs(local.y) <= shape.halfHeight
  );
}
