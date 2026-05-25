/**
 * The design graph: the serializable source of truth for a build.
 *
 * Bodies and connectors are stored in *ordered arrays* so that the `sim`
 * compile step can iterate them deterministically (never hash/Set order).
 * Operations are pure: they return a new Scene rather than mutating in place,
 * which keeps the graph easy to test and to drive from React state.
 */

export type Vec2 = { x: number; y: number };

export type BodyType = "ball" | "platform" | "spawner";

/**
 * The contents a spawner emits during sim: a self-contained subgraph in the
 * spawner's local frame, with the emit point at template-local (0, 0). Nested
 * spawners are not allowed (sanitizer strips them) and connectors must
 * reference only bodies inside the template (sanitizer drops cross-scope refs).
 */
export interface BodyTemplate {
  bodies: Body[];
  connectors: Connector[];
}

export interface Body {
  id: string;
  type: BodyType;
  /** Center position in world meters. */
  position: Vec2;
  /** Rotation in radians. */
  rotation: number;
  /** Schema-driven properties (radius, restitution, friction, static?, …). */
  props: Record<string, number | boolean>;
  /** Spawner-only: the bodies + connectors emitted as copies during sim. */
  template?: BodyTemplate;
}

export type ConnectorType = "spring" | "weld" | "pin" | "motor";

/**
 * One end of a connector: either a point on a body (in that body's local
 * coordinates) or a fixed point in world space. The world-point form lets a
 * connector ground to nothing (e.g. a pendulum hung from a fixed point).
 */
export type Endpoint = { body: string; local: Vec2 } | { world: Vec2 };

/**
 * A constraint between two endpoints. No collision geometry of its own — only
 * the bodies it joins collide. Compiles to a Rapier joint in `sim`.
 */
export interface Connector {
  id: string;
  type: ConnectorType;
  a: Endpoint;
  b: Endpoint;
  /** Schema-driven properties (spring: stiffness, restLength, damping). */
  props: Record<string, number | boolean>;
}

/** Narrowing helper: is this endpoint anchored to a body? */
export function isBodyEndpoint(e: Endpoint): e is { body: string; local: Vec2 } {
  return "body" in e;
}

export interface RoomSettings {
  /** Gravity in m/s². */
  gravity: Vec2;
  walls: { floor: boolean; ceiling: boolean; left: boolean; right: boolean };
  /** Room extent in meters. */
  size: { width: number; height: number };
  /** Whether placement/drag snaps to the grid. */
  snap: boolean;
}

export interface Room {
  settings: RoomSettings;
  bodies: Body[];
  connectors: Connector[];
}

export interface Scene {
  /** Scene format version, for forward compatibility of share payloads. */
  version: number;
  /** Monotonic counter used to mint unique element ids deterministically. */
  nextId: number;
  rooms: Room[];
  /**
   * Optional human-readable name for the build (used in OpenGraph previews
   * and shortlink titles). Sanitised on every codec read — capped to 80
   * chars, control characters and angle brackets stripped — so anything
   * persisted is safe to render as plain text in meta tags. See
   * `.scratch/og-share/PRD.md`.
   */
  title?: string;
}

export const SCENE_VERSION = 1;

export function defaultRoomSettings(): RoomSettings {
  return {
    gravity: { x: 0, y: -9.81 },
    walls: { floor: true, ceiling: false, left: false, right: false },
    // A square play area, framed on screen; the floor sits at y = 0.
    size: { width: 12, height: 12 },
    snap: false,
  };
}

/** An empty scene: a single room with default settings and no elements. */
export function createScene(): Scene {
  return {
    version: SCENE_VERSION,
    nextId: 1,
    rooms: [{ settings: defaultRoomSettings(), bodies: [], connectors: [] }],
  };
}

/**
 * The hardcoded tracer-bullet scene: one room with a floor and a single ball
 * dropped from above it. The floor is a room boundary (room settings), not a
 * body — only the ball is a body. This is what Issue 01 animates end to end.
 */
export function tracerScene(): Scene {
  const empty = createScene();
  const { scene } = addBody(empty, 0, {
    type: "ball",
    position: { x: 0, y: 6 },
    rotation: 0,
    props: { radius: 0.5, restitution: 0.7, density: 1 },
  });
  return scene;
}

function replaceRoom(scene: Scene, roomIndex: number, room: Room): Scene {
  const rooms = scene.rooms.slice();
  rooms[roomIndex] = room;
  return { ...scene, rooms };
}

/**
 * Append a body to a room, minting a deterministic unique id from the scene's
 * counter. Returns the new scene and the id of the body that was added.
 */
export function addBody(
  scene: Scene,
  roomIndex: number,
  body: Omit<Body, "id">,
): { scene: Scene; id: string } {
  const id = `b${scene.nextId}`;
  const room = scene.rooms[roomIndex];
  const next = replaceRoom(
    { ...scene, nextId: scene.nextId + 1 },
    roomIndex,
    { ...room, bodies: [...room.bodies, { ...body, id }] },
  );
  return { scene: next, id };
}

/** Remove a body by id, preserving the order of the remaining bodies. */
export function removeBody(scene: Scene, roomIndex: number, id: string): Scene {
  const room = scene.rooms[roomIndex];
  return replaceRoom(scene, roomIndex, {
    ...room,
    bodies: room.bodies.filter((b) => b.id !== id),
  });
}

/** Shallow-merge a patch into a room's settings. */
export function updateRoomSettings(
  scene: Scene,
  roomIndex: number,
  patch: Partial<RoomSettings>,
): Scene {
  const room = scene.rooms[roomIndex];
  return replaceRoom(scene, roomIndex, {
    ...room,
    settings: { ...room.settings, ...patch },
  });
}

/** Shallow-merge a patch into the body with the given id. */
export function updateBody(
  scene: Scene,
  roomIndex: number,
  id: string,
  patch: Partial<Omit<Body, "id">>,
): Scene {
  const room = scene.rooms[roomIndex];
  return replaceRoom(scene, roomIndex, {
    ...room,
    bodies: room.bodies.map((b) => (b.id === id ? { ...b, ...patch } : b)),
  });
}

/**
 * Deep-clone a self-contained subgraph of bodies + the connectors among them
 * with fresh ids minted by `mintId`. Connector endpoints whose body isn't in
 * the cloned set are **dropped** (so the function never produces cross-scope
 * refs). A spawner's `template` field is recursively cloned with the same
 * mintId, so the copy is fully independent. The returned `idMap` is from old
 * → new id for the top-level bodies; nested template ids are remapped
 * internally and don't escape.
 *
 * Used by copy / paste / duplicate (top-level scene clones) and by the sim's
 * emit step (cloning a template item into the live world each interval).
 */
export function cloneItem(
  src: { bodies: Body[]; connectors: Connector[] },
  mintId: (kind: "b" | "c") => string,
): { bodies: Body[]; connectors: Connector[]; idMap: Map<string, string> } {
  const idMap = new Map<string, string>();
  const bodies = src.bodies.map((b) => cloneBody(b, mintId, idMap));
  const connectors: Connector[] = [];
  for (const c of src.connectors) {
    const a = remapEndpoint(c.a, idMap);
    const b = remapEndpoint(c.b, idMap);
    if (!a || !b) continue;
    connectors.push({ ...c, id: mintId("c"), a, b, props: { ...c.props } });
  }
  return { bodies, connectors, idMap };
}

function cloneBody(b: Body, mintId: (kind: "b" | "c") => string, idMap: Map<string, string>): Body {
  const id = mintId("b");
  idMap.set(b.id, id);
  const clone: Body = {
    ...b,
    id,
    position: { ...b.position },
    props: { ...b.props },
  };
  if (b.template) {
    const sub = cloneItem(b.template, mintId);
    clone.template = { bodies: sub.bodies, connectors: sub.connectors };
  }
  return clone;
}

function remapEndpoint(ep: Endpoint, idMap: Map<string, string>): Endpoint | null {
  if (isBodyEndpoint(ep)) {
    const newId = idMap.get(ep.body);
    if (!newId) return null;
    return { body: newId, local: { ...ep.local } };
  }
  return { world: { ...ep.world } };
}

/**
 * Clone a body into an independent copy at `position`, minting a fresh id and
 * deep-copying its props (and `template`, for spawners) so editing the copy
 * never touches the original. Returns null if no body matches `id`. Wraps
 * {@link cloneItem} so all duplicate paths share the same id-remap logic.
 */
export function duplicateBody(
  scene: Scene,
  roomIndex: number,
  id: string,
  position: Vec2,
): { scene: Scene; id: string } | null {
  const src = scene.rooms[roomIndex].bodies.find((b) => b.id === id);
  if (!src) return null;
  let nextId = scene.nextId;
  const mintId = (kind: "b" | "c"): string => {
    const out = `${kind}${nextId}`;
    nextId += 1;
    return out;
  };
  const cloned = cloneItem({ bodies: [src], connectors: [] }, mintId).bodies[0];
  const placed: Body = { ...cloned, position: { ...position } };
  const room = scene.rooms[roomIndex];
  const next = replaceRoom(
    { ...scene, nextId },
    roomIndex,
    { ...room, bodies: [...room.bodies, placed] },
  );
  return { scene: next, id: placed.id };
}

/** Append a connector to a room, minting a deterministic unique id. */
export function addConnector(
  scene: Scene,
  roomIndex: number,
  connector: Omit<Connector, "id">,
): { scene: Scene; id: string } {
  const id = `c${scene.nextId}`;
  const room = scene.rooms[roomIndex];
  const next = replaceRoom(
    { ...scene, nextId: scene.nextId + 1 },
    roomIndex,
    { ...room, connectors: [...room.connectors, { ...connector, id }] },
  );
  return { scene: next, id };
}

/** Remove a connector by id, preserving the order of the rest. */
export function removeConnector(scene: Scene, roomIndex: number, id: string): Scene {
  const room = scene.rooms[roomIndex];
  return replaceRoom(scene, roomIndex, {
    ...room,
    connectors: room.connectors.filter((c) => c.id !== id),
  });
}

/** Shallow-merge a patch into the connector with the given id. */
export function updateConnector(
  scene: Scene,
  roomIndex: number,
  id: string,
  patch: Partial<Omit<Connector, "id">>,
): Scene {
  const room = scene.rooms[roomIndex];
  return replaceRoom(scene, roomIndex, {
    ...room,
    connectors: room.connectors.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  });
}

// ----- spawner template ops (issue 19) -----

/** A single template item: a connected component of bodies + the connectors
 *  among them. Returned by {@link templateItems}. */
export interface TemplateItem {
  bodies: Body[];
  connectors: Connector[];
}

/**
 * Group a template's bodies into items via connected components of its
 * connector graph. A body with no connector is its own (singleton) item;
 * two bodies joined by **any** connector spawn together. Order follows the
 * template arrays so round-robin emission and the bbox preview cue stay
 * deterministic.
 */
export function templateItems(bodies: Body[], connectors: Connector[]): TemplateItem[] {
  const parent = new Map<string, string>();
  for (const b of bodies) parent.set(b.id, b.id);
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    while (parent.get(x) !== r) {
      const next = parent.get(x)!;
      parent.set(x, r);
      x = next;
    }
    return r;
  };
  for (const c of connectors) {
    if (!isBodyEndpoint(c.a) || !isBodyEndpoint(c.b)) continue;
    if (!parent.has(c.a.body) || !parent.has(c.b.body)) continue;
    const ra = find(c.a.body);
    const rb = find(c.b.body);
    if (ra !== rb) parent.set(ra, rb);
  }
  const order: string[] = [];
  const grouped = new Map<string, TemplateItem>();
  for (const b of bodies) {
    const root = find(b.id);
    if (!grouped.has(root)) {
      grouped.set(root, { bodies: [], connectors: [] });
      order.push(root);
    }
    grouped.get(root)!.bodies.push(b);
  }
  for (const c of connectors) {
    const anchor = isBodyEndpoint(c.a) ? c.a.body : isBodyEndpoint(c.b) ? c.b.body : null;
    if (!anchor || !parent.has(anchor)) continue;
    const root = find(anchor);
    grouped.get(root)?.connectors.push(c);
  }
  return order.map((r) => grouped.get(r)!);
}


/**
 * Append a body to a spawner's template, minting a fresh id from the same
 * scene-wide counter so ids stay globally unique. Returns the new scene and
 * the new body's id, mirroring {@link addBody}. No-op (returns null) if the
 * target body isn't a spawner.
 */
export function addBodyToTemplate(
  scene: Scene,
  roomIndex: number,
  spawnerId: string,
  body: Omit<Body, "id">,
): { scene: Scene; id: string } | null {
  const room = scene.rooms[roomIndex];
  const spawner = room.bodies.find((b) => b.id === spawnerId);
  if (!spawner || spawner.type !== "spawner") return null;
  const id = `b${scene.nextId}`;
  const tmpl = spawner.template ?? { bodies: [], connectors: [] };
  const nextTemplate: BodyTemplate = {
    bodies: [...tmpl.bodies, { ...body, id }],
    connectors: tmpl.connectors,
  };
  const next = replaceRoom(
    { ...scene, nextId: scene.nextId + 1 },
    roomIndex,
    {
      ...room,
      bodies: room.bodies.map((b) =>
        b.id === spawnerId ? { ...b, template: nextTemplate } : b,
      ),
    },
  );
  return { scene: next, id };
}

/**
 * Append a connector to a spawner's template, minting a fresh id from the
 * scene-wide counter. Mirrors {@link addConnector} for the template scope.
 * No-op (returns null) if the target body isn't a spawner.
 */
export function addConnectorToTemplate(
  scene: Scene,
  roomIndex: number,
  spawnerId: string,
  connector: Omit<Connector, "id">,
): { scene: Scene; id: string } | null {
  const room = scene.rooms[roomIndex];
  const spawner = room.bodies.find((b) => b.id === spawnerId);
  if (!spawner || spawner.type !== "spawner") return null;
  const id = `c${scene.nextId}`;
  const tmpl = spawner.template ?? { bodies: [], connectors: [] };
  const nextTemplate: BodyTemplate = {
    bodies: tmpl.bodies,
    connectors: [...tmpl.connectors, { ...connector, id }],
  };
  const next = replaceRoom(
    { ...scene, nextId: scene.nextId + 1 },
    roomIndex,
    {
      ...room,
      bodies: room.bodies.map((b) =>
        b.id === spawnerId ? { ...b, template: nextTemplate } : b,
      ),
    },
  );
  return { scene: next, id };
}

/**
 * Patch a single body inside a spawner's template (position / rotation /
 * props). No-op if the spawner or the body isn't found. Mirrors
 * {@link updateBody} for the template scope.
 */
export function updateBodyInTemplate(
  scene: Scene,
  roomIndex: number,
  spawnerId: string,
  bodyId: string,
  patch: Partial<Omit<Body, "id">>,
): Scene {
  const room = scene.rooms[roomIndex];
  const spawner = room.bodies.find((b) => b.id === spawnerId);
  if (!spawner || spawner.type !== "spawner" || !spawner.template) return scene;
  const tmpl = spawner.template;
  if (!tmpl.bodies.some((b) => b.id === bodyId)) return scene;
  const nextTemplate: BodyTemplate = {
    bodies: tmpl.bodies.map((b) => (b.id === bodyId ? { ...b, ...patch } : b)),
    connectors: tmpl.connectors,
  };
  return replaceRoom(scene, roomIndex, {
    ...room,
    bodies: room.bodies.map((b) =>
      b.id === spawnerId ? { ...b, template: nextTemplate } : b,
    ),
  });
}

/**
 * Remove a body from a spawner's template, plus any template connectors
 * referencing it (no dangling joints).
 */
export function removeBodyFromTemplate(
  scene: Scene,
  roomIndex: number,
  spawnerId: string,
  bodyId: string,
): Scene {
  const room = scene.rooms[roomIndex];
  const spawner = room.bodies.find((b) => b.id === spawnerId);
  if (!spawner || spawner.type !== "spawner" || !spawner.template) return scene;
  const tmpl = spawner.template;
  const nextTemplate: BodyTemplate = {
    bodies: tmpl.bodies.filter((b) => b.id !== bodyId),
    connectors: tmpl.connectors.filter(
      (c) => !(isBodyEndpoint(c.a) && c.a.body === bodyId) && !(isBodyEndpoint(c.b) && c.b.body === bodyId),
    ),
  };
  return replaceRoom(scene, roomIndex, {
    ...room,
    bodies: room.bodies.map((b) =>
      b.id === spawnerId ? { ...b, template: nextTemplate } : b,
    ),
  });
}

/** Remove a body and any connectors that referenced it (no dangling joints). */
export function removeBodyAndConnectors(scene: Scene, roomIndex: number, id: string): Scene {
  const room = scene.rooms[roomIndex];
  return replaceRoom(scene, roomIndex, {
    ...room,
    bodies: room.bodies.filter((b) => b.id !== id),
    connectors: room.connectors.filter(
      (c) => !(isBodyEndpoint(c.a) && c.a.body === id) && !(isBodyEndpoint(c.b) && c.b.body === id),
    ),
  });
}
