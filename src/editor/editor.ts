/**
 * Build-mode editing logic, kept pure so it can be tested without the DOM.
 * Pointer/event plumbing lives in the React layer; everything that decides
 * *what mutation happens* lives here and in `scene`.
 */

import type { Body, Endpoint, Scene, Vec2 } from "../scene/scene";
import { isBodyEndpoint } from "../scene/scene";
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

/** All bodies whose geometry contains `worldPoint`, topmost (last-drawn) first. */
export function bodiesAtPoint(scene: Scene, roomIndex: number, worldPoint: Vec2): string[] {
  const bodies = scene.rooms[roomIndex].bodies;
  const hits: string[] = [];
  for (let i = bodies.length - 1; i >= 0; i--) {
    const body = bodies[i];
    const local = toLocal(worldPoint, body.position, body.rotation);
    if (def(body.type).shapes(body.props as Props).some((s) => containsLocal(s, local))) {
      hits.push(body.id);
    }
  }
  return hits;
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

// ----- transform helpers -----

/** Transform a world point into a body's local frame. */
export function bodyToLocal(body: Body, world: Vec2): Vec2 {
  return toLocal(world, body.position, body.rotation);
}

/** Transform a body-local point into world space (rotate then translate). */
export function bodyToWorld(body: Body, local: Vec2): Vec2 {
  const cos = Math.cos(body.rotation);
  const sin = Math.sin(body.rotation);
  return {
    x: body.position.x + local.x * cos - local.y * sin,
    y: body.position.y + local.x * sin + local.y * cos,
  };
}

/**
 * Clamp a body's center so its whole (rotation-aware) bounding box stays
 * inside the room rectangle: x ∈ [-W/2, W/2], y ∈ [0, H]. Used to keep
 * placement and dragging within the framed play area. If the body is larger
 * than the room on an axis, it's centered on that axis.
 */
export function clampInsideRoom(
  size: { width: number; height: number },
  body: Pick<Body, "type" | "props" | "rotation">,
  position: Vec2,
): Vec2 {
  const { hw, hh } = halfExtents(body as Body);
  const c = Math.abs(Math.cos(body.rotation));
  const s = Math.abs(Math.sin(body.rotation));
  const ax = hw * c + hh * s; // world-axis half-width of the rotated box
  const ay = hw * s + hh * c; // world-axis half-height
  return {
    x: clampRange(position.x, -size.width / 2 + ax, size.width / 2 - ax),
    y: clampRange(position.y, ay, size.height - ay),
  };
}

/** Clamp `v` to [lo, hi]; if the interval is empty (body too big), return its midpoint. */
function clampRange(v: number, lo: number, hi: number): number {
  if (lo > hi) return (lo + hi) / 2;
  return Math.min(hi, Math.max(lo, v));
}

// ----- on-canvas resize / rotate handles -----

export type HandleId = "rotate" | "nw" | "ne" | "se" | "sw" | "radius";
export interface Handle {
  id: HandleId;
  local: Vec2;
}

/** Gap (meters) between a body's top edge and its rotation handle. */
const ROTATE_GAP = 0.8;

/** Bounding half-extents of a body's collision shapes, in local meters. */
function halfExtents(body: Body): { hw: number; hh: number } {
  let hw = 0;
  let hh = 0;
  for (const s of def(body.type).shapes(body.props as Props)) {
    if (s.kind === "circle") {
      hw = Math.max(hw, s.radius);
      hh = Math.max(hh, s.radius);
    } else {
      hw = Math.max(hw, s.halfWidth);
      hh = Math.max(hh, s.halfHeight);
    }
  }
  return { hw, hh };
}

function isCircle(body: Body): boolean {
  const shapes = def(body.type).shapes(body.props as Props);
  return shapes.length === 1 && shapes[0].kind === "circle";
}

/** Manipulation handles for a body, in body-local coords. */
export function bodyHandles(body: Body): Handle[] {
  const { hw, hh } = halfExtents(body);
  const handles: Handle[] = [{ id: "rotate", local: { x: 0, y: hh + ROTATE_GAP } }];
  if (isCircle(body)) {
    handles.push({ id: "radius", local: { x: hw, y: 0 } });
  } else {
    handles.push(
      { id: "nw", local: { x: -hw, y: hh } },
      { id: "ne", local: { x: hw, y: hh } },
      { id: "se", local: { x: hw, y: -hh } },
      { id: "sw", local: { x: -hw, y: -hh } },
    );
  }
  return handles;
}

/** The handle whose world position is nearest `world` within `worldTol`, else null. */
export function handleAtPoint(body: Body, world: Vec2, worldTol: number): HandleId | null {
  let best: HandleId | null = null;
  let bestDist = worldTol;
  for (const h of bodyHandles(body)) {
    const w = bodyToWorld(body, h.local);
    const d = Math.hypot(w.x - world.x, w.y - world.y);
    if (d <= bestDist) {
      best = h.id;
      bestDist = d;
    }
  }
  return best;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Min/max for a numeric prop from the type's schema, defaulting wide. */
function range(body: Body, key: string): { min: number; max: number } {
  const field = def(body.type).propSchema.find((f) => f.key === key);
  return { min: field?.min ?? 0.1, max: field?.max ?? Infinity };
}

/** Local-frame direction signs of a box corner handle (e.g. ne = +x, +y). */
const HANDLE_DIR: Record<"nw" | "ne" | "se" | "sw", { sx: number; sy: number }> = {
  ne: { sx: 1, sy: 1 },
  nw: { sx: -1, sy: 1 },
  se: { sx: 1, sy: -1 },
  sw: { sx: -1, sy: -1 },
};

/**
 * New geometry from dragging a resize handle to `pointerWorld`. Returns both the
 * size `props` and the body `position` (which moves for an anchored resize).
 *
 * - **Default (anchored)** — dragging a box corner moves *that* corner while the
 *   opposite corner stays pinned in world space, so the body recenters. Math is
 *   done in the body's local frame, so it works for a rotated box; rotation is
 *   unchanged. Clamping a dimension keeps the anchor fixed (the center is
 *   recomputed from the clamped size).
 * - **Symmetric (`symmetric`, Alt held)** — both sides resize about a fixed
 *   center, the original behaviour.
 * - **Circles** — resize by distance from center; the center never moves and
 *   `symmetric` is a no-op.
 */
export function applyResize(
  body: Body,
  handle: HandleId,
  pointerWorld: Vec2,
  symmetric = false,
): { props: Props; position: Vec2 } {
  const local = toLocal(pointerWorld, body.position, body.rotation);
  if (handle === "radius") {
    const r = range(body, "radius");
    return { props: { radius: clamp(Math.hypot(local.x, local.y), r.min, r.max) }, position: body.position };
  }
  const w = range(body, "width");
  const h = range(body, "height");
  if (symmetric || !(handle in HANDLE_DIR)) {
    return {
      props: {
        width: clamp(Math.abs(local.x) * 2, w.min, w.max),
        height: clamp(Math.abs(local.y) * 2, h.min, h.max),
      },
      position: body.position,
    };
  }
  // Anchored: pin the opposite corner. Its offset from the *current* center,
  // in local coords, is the negated handle direction times the half-extents.
  const { sx, sy } = HANDLE_DIR[handle as "nw" | "ne" | "se" | "sw"];
  const { hw, hh } = halfExtents(body);
  const anchorLocal = { x: -sx * hw, y: -sy * hh };
  const width = clamp(Math.abs(local.x - anchorLocal.x), w.min, w.max);
  const height = clamp(Math.abs(local.y - anchorLocal.y), h.min, h.max);
  // The new center sits half a (clamped) box from the anchor along the drag
  // direction. Expressed as an offset from the old center, then mapped to world
  // through the body's rotation — so the pinned corner lands exactly where it
  // was even after a dimension clamps.
  const centerOffsetLocal = { x: sx * (width / 2 - hw), y: sy * (height / 2 - hh) };
  return { props: { width, height }, position: bodyToWorld(body, centerOffsetLocal) };
}

/** New rotation (radians) so the upward rotation handle points at `pointerWorld`. */
export function applyRotation(body: Body, pointerWorld: Vec2): number {
  const dx = pointerWorld.x - body.position.x;
  const dy = pointerWorld.y - body.position.y;
  return Math.atan2(dy, dx) - Math.PI / 2;
}

// ----- connectors -----

/** World position of a connector endpoint given the design-graph body poses. */
export function endpointWorld(scene: Scene, roomIndex: number, ep: Endpoint): Vec2 | null {
  if (!isBodyEndpoint(ep)) return ep.world;
  const body = scene.rooms[roomIndex].bodies.find((b) => b.id === ep.body);
  return body ? bodyToWorld(body, ep.local) : null;
}

/** Id of the topmost connector whose line passes within `tol` of `point`, else null. */
export function connectorAtPoint(
  scene: Scene,
  roomIndex: number,
  point: Vec2,
  tol: number,
): string | null {
  const conns = scene.rooms[roomIndex].connectors;
  for (let i = conns.length - 1; i >= 0; i--) {
    const a = endpointWorld(scene, roomIndex, conns[i].a);
    const b = endpointWorld(scene, roomIndex, conns[i].b);
    if (a && b && distToSegment(point, a, b) <= tol) return conns[i].id;
  }
  return null;
}

/** All connectors within `tol` of `point`, topmost (last-drawn) first. */
export function connectorsAtPoint(
  scene: Scene,
  roomIndex: number,
  point: Vec2,
  tol: number,
): string[] {
  const conns = scene.rooms[roomIndex].connectors;
  const hits: string[] = [];
  for (let i = conns.length - 1; i >= 0; i--) {
    const a = endpointWorld(scene, roomIndex, conns[i].a);
    const b = endpointWorld(scene, roomIndex, conns[i].b);
    if (a && b && distToSegment(point, a, b) <= tol) hits.push(conns[i].id);
  }
  return hits;
}

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
