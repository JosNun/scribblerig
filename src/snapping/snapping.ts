/**
 * Pure geometry for binding a dragged connector endpoint to a target.
 *
 * Priority: a nearby **named anchor** wins (closest within threshold); else, if
 * the point is over a body, bind to that exact local point; else bind to a
 * fixed point in world space. Bodies and their anchors are iterated in array /
 * declaration order, and ties resolve to the first encountered — so the result
 * is deterministic.
 */

import type { Endpoint, Scene, Vec2 } from "../scene/scene";
import { def, type Props } from "../registry/registry";
import { bodyToWorld, bodyToLocal, bodyAtPoint } from "../editor/editor";

export type SnapResult =
  | { kind: "anchor"; body: string; name: string; local: Vec2; world: Vec2 }
  | { kind: "body"; body: string; local: Vec2; world: Vec2 }
  | { kind: "world"; world: Vec2 };

/** Choose the snap target for `point` (world meters). */
export function snap(
  scene: Scene,
  roomIndex: number,
  point: Vec2,
  anchorThreshold: number,
): SnapResult {
  const bodies = scene.rooms[roomIndex].bodies;

  // 1) Nearest named anchor within the threshold. Bodies with no anchors
  //    (e.g. text labels) contribute nothing here and are silently skipped.
  let best: { body: string; name: string; local: Vec2; world: Vec2 } | null = null;
  let bestDist = anchorThreshold;
  for (const body of bodies) {
    for (const anchor of def(body.type).anchors(body.props as Props)) {
      const world = bodyToWorld(body, anchor.local);
      const d = Math.hypot(world.x - point.x, world.y - point.y);
      if (d < bestDist) {
        best = { body: body.id, name: anchor.name, local: anchor.local, world };
        bestDist = d;
      }
    }
  }
  if (best) return { kind: "anchor", ...best };

  // 2) Over a body → bind to the exact local point under the cursor. Bodies
  //    that don't expose anchors aren't valid connector targets either (a
  //    spring shouldn't anchor to a label), so skip them here too.
  const hit = bodyAtPoint(scene, roomIndex, point);
  if (hit) {
    const body = bodies.find((b) => b.id === hit)!;
    if (def(body.type).anchors(body.props as Props).length > 0) {
      return { kind: "body", body: hit, local: bodyToLocal(body, point), world: point };
    }
  }

  // 3) Empty space → a fixed point in world space.
  return { kind: "world", world: point };
}

/** The endpoint a snap result binds to (for creating a connector). */
export function endpointOf(result: SnapResult): Endpoint {
  return result.kind === "world"
    ? { world: result.world }
    : { body: result.body, local: result.local };
}
