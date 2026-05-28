/**
 * Build-mode editing logic, kept pure so it can be tested without the DOM.
 * Pointer/event plumbing lives in the React layer; everything that decides
 * *what mutation happens* lives here and in `scene`.
 */

import type { Body, Connector, Endpoint, Scene, Vec2 } from "../scene/scene";
import { isBodyEndpoint, updateBody, updateConnector } from "../scene/scene";
import { connectorDef, def, type Props, type Shape } from "../registry/registry";
import { textBoundsLocal } from "../registry/text-bounds";

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
    if (containsBody(body, worldPoint)) return body.id;
  }
  return null;
}

/** All bodies whose geometry contains `worldPoint`, topmost (last-drawn) first. */
export function bodiesAtPoint(scene: Scene, roomIndex: number, worldPoint: Vec2): string[] {
  const bodies = scene.rooms[roomIndex].bodies;
  const hits: string[] = [];
  for (let i = bodies.length - 1; i >= 0; i--) {
    const body = bodies[i];
    if (containsBody(body, worldPoint)) hits.push(body.id);
  }
  return hits;
}

/**
 * Hit-test a single body. Text bodies have no collider shapes, so the test
 * runs against their measured text bbox (the same one the dashed selection
 * rectangle wraps, so the clickable area lines up with what the user sees).
 */
function containsBody(body: Body, worldPoint: Vec2): boolean {
  const local = toLocal(worldPoint, body.position, body.rotation);
  if (body.type === "text") {
    const { halfW, halfH } = textBoundsLocal(body.props);
    return Math.abs(local.x) <= halfW && Math.abs(local.y) <= halfH;
  }
  const shapes = def(body.type).shapes(body.props as Props);
  return shapes.some((s) => containsLocal(s, local));
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

/** Gap (meters) from the group's AABB top to the multi-selection rotation
 *  handle. Exported so the renderer (draws it) and the pointer layer (hit-
 *  tests it) stay in agreement on placement. */
export const GROUP_ROTATE_GAP = 0.8;

/** Bounding half-extents of a body's collision shapes, in local meters. */
function halfExtents(body: Body): { hw: number; hh: number } {
  // Text has no collider; use the measured text bbox so clamping / handle
  // placement match the rendered footprint.
  if (body.type === "text") {
    const b = textBoundsLocal(body.props);
    return { hw: b.halfW, hh: b.halfH };
  }
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

/**
 * World-space axis-aligned bounding box for a body — its rotated local
 * half-extents projected onto the world axes, plus its position. Used by
 * marquee selection: a body is "in" the marquee when its AABB overlaps the
 * marquee rect.
 */
export function bodyAABB(body: Body): { min: Vec2; max: Vec2 } {
  const { hw, hh } = halfExtents(body);
  const c = Math.abs(Math.cos(body.rotation));
  const s = Math.abs(Math.sin(body.rotation));
  const ax = hw * c + hh * s;
  const ay = hw * s + hh * c;
  return {
    min: { x: body.position.x - ax, y: body.position.y - ay },
    max: { x: body.position.x + ax, y: body.position.y + ay },
  };
}

/** Standard AABB-vs-AABB overlap (intersect semantics — any touch counts). */
export function rectsOverlap(
  a: { min: Vec2; max: Vec2 },
  b: { min: Vec2; max: Vec2 },
): boolean {
  return a.min.x <= b.max.x && a.max.x >= b.min.x && a.min.y <= b.max.y && a.max.y >= b.min.y;
}

/**
 * Union AABB of a multi-selection — every member body's AABB plus every
 * member connector's endpoint world position folded in. The renderer uses
 * this to position the group rotation handle, and the pointer layer uses it
 * to hit-test the handle. Returns null if the selection is empty.
 */
export function groupAABB(
  scene: Scene,
  roomIndex: number,
  ids: ReadonlySet<string>,
): { min: Vec2; max: Vec2 } | null {
  const room = scene.rooms[roomIndex];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let any = false;
  for (const id of ids) {
    const body = room.bodies.find((b) => b.id === id);
    if (body) {
      const a = bodyAABB(body);
      if (a.min.x < minX) minX = a.min.x;
      if (a.min.y < minY) minY = a.min.y;
      if (a.max.x > maxX) maxX = a.max.x;
      if (a.max.y > maxY) maxY = a.max.y;
      any = true;
      continue;
    }
    const conn = room.connectors.find((c) => c.id === id);
    if (!conn) continue;
    for (const ep of [conn.a, conn.b]) {
      const w = endpointWorld(scene, roomIndex, ep);
      if (!w) continue;
      if (w.x < minX) minX = w.x;
      if (w.y < minY) minY = w.y;
      if (w.x > maxX) maxX = w.x;
      if (w.y > maxY) maxY = w.y;
      any = true;
    }
  }
  return any ? { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } } : null;
}

function isCircle(body: Body): boolean {
  const shapes = def(body.type).shapes(body.props as Props);
  return shapes.length === 1 && shapes[0].kind === "circle";
}

/** Manipulation handles for a body, in body-local coords. */
export function bodyHandles(body: Body): Handle[] {
  const { hw, hh } = halfExtents(body);
  const handles: Handle[] = [{ id: "rotate", local: { x: 0, y: hh + ROTATE_GAP } }];
  // Text resizes via the `size` prop in the panel — no corner / radius handles
  // (a text body has only one scalar dimension, and dragging the corners of a
  // measured-glyph box would be confusing).
  if (body.type === "text") return handles;
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

/**
 * Compute the connectors a pin / weld / motor placement should produce at
 * `point` against `bodies`. Same rules as the canvas place behaviour
 * (issue 23): a lone body becomes anchored to a fixed world point; a stack
 * gets all-pairs pins, a chain of welds, or a motor with the deepest body
 * as stator. Returns an empty array if no body is under the point. Pure —
 * the caller persists the resulting connectors however it likes (room
 * scope or template scope).
 */
export function buildOverlapConnectors(
  type: "pin" | "weld" | "motor",
  point: Vec2,
  bodies: Body[],
): Array<Omit<Connector, "id">> {
  const ids: string[] = [];
  for (let i = bodies.length - 1; i >= 0; i--) {
    const body = bodies[i];
    const local = bodyToLocal(body, point);
    const shapes = def(body.type).shapes(body.props as Props);
    if (shapes.some((s) => containsLocal(s, local))) ids.push(body.id);
  }
  if (ids.length === 0) return [];

  const ep = (id: string) => ({
    body: id,
    local: bodyToLocal(bodies.find((b) => b.id === id)!, point),
  });
  const defaults = (t: "pin" | "weld" | "motor"): Props => ({ ...connectorDef(t).defaults });

  if (ids.length === 1) {
    return [
      {
        type,
        a: ep(ids[0]),
        b: { world: { x: point.x, y: point.y } },
        props: defaults(type),
      },
    ];
  }

  const out: Array<Omit<Connector, "id">> = [];
  if (type === "pin") {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        out.push({ type: "pin", a: ep(ids[i]), b: ep(ids[j]), props: defaults("pin") });
      }
    }
  } else if (type === "weld") {
    for (let i = 0; i + 1 < ids.length; i++) {
      out.push({ type: "weld", a: ep(ids[i]), b: ep(ids[i + 1]), props: defaults("weld") });
    }
  } else {
    // Motor: weld the rotor stack together, drive about the deepest body
    // (stator) at the shared pivot.
    const stator = ids[ids.length - 1];
    const rotor = ids.slice(0, -1);
    for (let i = 0; i + 1 < rotor.length; i++) {
      out.push({ type: "weld", a: ep(rotor[i]), b: ep(rotor[i + 1]), props: defaults("weld") });
    }
    out.push({ type: "motor", a: ep(rotor[0]), b: ep(stator), props: defaults("motor") });
  }
  return out;
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

/** True if `worldPoint` lies inside any of `body`'s collision shapes. */
export function pointInBody(body: Body, worldPoint: Vec2): boolean {
  const local = toLocal(worldPoint, body.position, body.rotation);
  return def(body.type).shapes(body.props as Props).some((s) => containsLocal(s, local));
}

/**
 * The single canonical pivot of a point-coincident connector (pin / weld /
 * motor) in world coords (issue 24). The world endpoint wins (it's already a
 * fixed point); otherwise body `a`'s anchor is canonical. Springs have no
 * single pivot — they're a distance between two anchors — so this returns
 * `null` for them.
 */
export function connectorPivot(
  scene: Scene,
  roomIndex: number,
  conn: Connector,
): Vec2 | null {
  if (conn.type === "spring") return null;
  const ep = !isBodyEndpoint(conn.a) ? conn.a : !isBodyEndpoint(conn.b) ? conn.b : conn.a;
  return endpointWorld(scene, roomIndex, ep);
}

/**
 * Move a body to `newPosition` and translate the world endpoint of every
 * pin / weld / motor that references it by the same delta. Without this,
 * a single-body placement (which seats the joint's world endpoint right
 * on the body) would have its pivot left behind on every drag — and
 * pruneDetachedConnectors would then remove the connector even though
 * the user only moved the body.
 *
 * Body-local endpoints follow their bodies' frames automatically, so
 * they need no translation. Springs have a world endpoint too, but
 * they're allowed to span arbitrary distances — translating their
 * anchor on every drag would yank the anchor along visually, so we
 * skip them.
 *
 * The caller should still run `pruneDetachedConnectors` after this if
 * a separate, multi-body pivot might have been broken by the move.
 */
export function moveBodyWithWorldAnchors(
  scene: Scene,
  roomIndex: number,
  bodyId: string,
  newPosition: Vec2,
): Scene {
  const body = scene.rooms[roomIndex].bodies.find((b) => b.id === bodyId);
  if (!body) return scene;
  const dx = newPosition.x - body.position.x;
  const dy = newPosition.y - body.position.y;
  let next = updateBody(scene, roomIndex, bodyId, { position: newPosition });
  if (dx === 0 && dy === 0) return next;
  for (const conn of next.rooms[roomIndex].connectors) {
    if (conn.type === "spring") continue;
    const refs =
      (isBodyEndpoint(conn.a) && conn.a.body === bodyId) ||
      (isBodyEndpoint(conn.b) && conn.b.body === bodyId);
    if (!refs) continue;
    const patch: Partial<Connector> = {};
    if (!isBodyEndpoint(conn.a)) {
      patch.a = { world: { x: conn.a.world.x + dx, y: conn.a.world.y + dy } };
    }
    if (!isBodyEndpoint(conn.b)) {
      patch.b = { world: { x: conn.b.world.x + dx, y: conn.b.world.y + dy } };
    }
    if (patch.a || patch.b) next = updateConnector(next, roomIndex, conn.id, patch);
  }
  return next;
}

/**
 * Remove pin / weld / motor connectors whose pivot no longer lies inside every
 * body they reference (issue 24). Matches the placement semantic — the click
 * went through these bodies, so pulling them apart "pops" the joint off.
 * Springs aren't pruned; their anchors are allowed to sit anywhere.
 */
export function pruneDetachedConnectors(scene: Scene, roomIndex: number): Scene {
  const room = scene.rooms[roomIndex];
  const byId = new Map(room.bodies.map((b) => [b.id, b]));
  const survivors = room.connectors.filter((c) => {
    const pivot = connectorPivot(scene, roomIndex, c);
    if (!pivot) return true; // spring, or its referenced body is gone (left alone)
    for (const ep of [c.a, c.b]) {
      if (!isBodyEndpoint(ep)) continue;
      const body = byId.get(ep.body);
      if (!body) return false; // body deleted — connector is dangling
      if (!pointInBody(body, pivot)) return false;
    }
    return true;
  });
  if (survivors.length === room.connectors.length) return scene;
  const rooms = scene.rooms.slice();
  rooms[roomIndex] = { ...room, connectors: survivors };
  return { ...scene, rooms };
}
