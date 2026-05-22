/**
 * The design graph: the serializable source of truth for a build.
 *
 * Bodies and connectors are stored in *ordered arrays* so that the `sim`
 * compile step can iterate them deterministically (never hash/Set order).
 * Operations are pure: they return a new Scene rather than mutating in place,
 * which keeps the graph easy to test and to drive from React state.
 */

export type Vec2 = { x: number; y: number };

export type BodyType = "ball" | "platform" | "wheel";

export interface Body {
  id: string;
  type: BodyType;
  /** Center position in world meters. */
  position: Vec2;
  /** Rotation in radians. */
  rotation: number;
  /** Schema-driven properties (radius, restitution, friction, static?, …). */
  props: Record<string, number | boolean>;
}

export type ConnectorType = "spring" | "weld" | "pin";

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
