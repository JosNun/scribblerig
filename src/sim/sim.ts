/**
 * The physics boundary. This is the ONLY module that imports Rapier; every
 * other module speaks the design-graph vocabulary from `scene`. Swapping the
 * engine means rewriting this file and nothing else.
 *
 * `compile` turns a design graph (the source of truth) into a disposable live
 * world. Bodies and connectors are iterated in array order so the compile is
 * deterministic — never hash/Set iteration order — which underpins
 * same-machine reset-replay.
 */

import RAPIER from "@dimforge/rapier2d-compat";
import type { Body, Connector, Endpoint, Scene, Vec2 } from "../scene/scene";
import { isBodyEndpoint } from "../scene/scene";
import { def, type Props, type Shape } from "../registry/registry";

const FIXED_DT = 1 / 60;
/** Thickness of the floor/ceiling/wall boundary colliders, in meters. */
const WALL_THICKNESS = 0.5;

export interface BodyTransform {
  position: Vec2;
  rotation: number;
}

export interface SimWorld {
  /** Advance the simulation by exactly one fixed timestep. */
  step(): void;
  /** Current transform of every body, keyed by design-graph body id. */
  readTransforms(): Map<string, BodyTransform>;
  /** Stable checksum of full world state; equal iff the states are identical. */
  checksum(): string;
  /** Release the underlying Rapier world. */
  free(): void;
}

let initialized = false;

/** Load the Rapier WASM module. Must be awaited once before `compile`. */
export async function initSim(): Promise<void> {
  if (initialized) return;
  await RAPIER.init();
  initialized = true;
}

/** Compile a design graph into a live Rapier world. */
export function compile(scene: Scene): SimWorld {
  const room = scene.rooms[0];
  const world = new RAPIER.World(room.settings.gravity);
  world.timestep = FIXED_DT;

  buildBoundaries(world, room.settings.walls, room.settings.size);

  // Body id → rigid body, in array order, so reads map back to the graph.
  const handles = new Map<string, RAPIER.RigidBody>();
  for (const body of room.bodies) {
    handles.set(body.id, compileBody(world, body));
  }

  // Connectors compile to joints, in array order, after all bodies exist.
  for (const conn of room.connectors) {
    compileConnector(world, conn, room.bodies, handles);
  }

  return {
    step: () => world.step(),
    readTransforms: () => {
      const out = new Map<string, BodyTransform>();
      for (const [id, rb] of handles) {
        const t = rb.translation();
        out.set(id, { position: { x: t.x, y: t.y }, rotation: rb.rotation() });
      }
      return out;
    },
    checksum: () => fnv1a(world.takeSnapshot()),
    free: () => world.free(),
  };
}

/** Compile one design-graph body into a rigid body + its colliders. */
function compileBody(world: RAPIER.World, body: Body): RAPIER.RigidBody {
  const typeDef = def(body.type);
  const props = body.props as Props;

  const rbDesc = (
    typeDef.isStatic(props)
      ? RAPIER.RigidBodyDesc.fixed()
      : RAPIER.RigidBodyDesc.dynamic()
  )
    .setTranslation(body.position.x, body.position.y)
    .setRotation(body.rotation);
  const rb = world.createRigidBody(rbDesc);

  for (const shape of typeDef.shapes(props)) {
    const collider = colliderDesc(shape)
      .setRestitution(num(props.restitution, 0))
      .setFriction(num(props.friction, 0.5))
      .setDensity(num(props.density, 1));
    world.createCollider(collider, rb);
  }
  return rb;
}

/** World transform of an endpoint's host (a body, or a static anchor body). */
interface EndHost {
  rb: RAPIER.RigidBody;
  pos: Vec2;
  rot: number;
}

/**
 * Compile a connector into a Rapier joint. World-point endpoints get a static
 * anchor body. Joined bodies don't collide at the joint (contactsEnabled off).
 */
function compileConnector(
  world: RAPIER.World,
  conn: Connector,
  bodies: Body[],
  handles: Map<string, RAPIER.RigidBody>,
): void {
  const hostA = endHost(world, conn.a, bodies, handles);
  const hostB = endHost(world, conn.b, bodies, handles);
  if (!hostA || !hostB) return; // a referenced body was deleted

  const anchorA = anchorLocal(conn.a);
  const anchorB = anchorLocal(conn.b);
  const worldA = toWorld(hostA, anchorA);
  const worldB = toWorld(hostB, anchorB);
  const props = conn.props as Props;

  let jointData: RAPIER.JointData;
  if (conn.type === "spring") {
    const restLength = num(props.restLength, dist(worldA, worldB));
    jointData = RAPIER.JointData.spring(
      restLength,
      num(props.stiffness, 80),
      num(props.damping, 3),
      anchorA,
      anchorB,
    );
  } else if (conn.type === "pin") {
    // A hinge: each body is anchored at its own attach point, and the joint
    // holds those points coincident (click-to-place makes them the same point).
    jointData = RAPIER.JointData.revolute(anchorA, anchorB);
  } else {
    // weld: lock the two bodies in their current relative pose (no snap).
    const weldPt = worldA;
    jointData = RAPIER.JointData.fixed(
      toLocalPt(hostA, weldPt),
      0,
      toLocalPt(hostB, weldPt),
      hostA.rot - hostB.rot,
    );
  }

  const joint = world.createImpulseJoint(jointData, hostA.rb, hostB.rb, true);
  // Whether the two joined bodies collide with each other is per-connector
  // (spring defaults on; pin/weld off so overlapping parts don't fight).
  (joint as RAPIER.ImpulseJoint).setContactsEnabled(props.collide === true);
}

function endHost(
  world: RAPIER.World,
  ep: Endpoint,
  bodies: Body[],
  handles: Map<string, RAPIER.RigidBody>,
): EndHost | null {
  if (isBodyEndpoint(ep)) {
    const rb = handles.get(ep.body);
    const body = bodies.find((b) => b.id === ep.body);
    if (!rb || !body) return null;
    return { rb, pos: body.position, rot: body.rotation };
  }
  const rb = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(ep.world.x, ep.world.y),
  );
  return { rb, pos: ep.world, rot: 0 };
}

/** The endpoint's anchor in its host's local frame. */
function anchorLocal(ep: Endpoint): Vec2 {
  return isBodyEndpoint(ep) ? ep.local : { x: 0, y: 0 };
}

function toWorld(host: EndHost, local: Vec2): Vec2 {
  const c = Math.cos(host.rot);
  const s = Math.sin(host.rot);
  return { x: host.pos.x + local.x * c - local.y * s, y: host.pos.y + local.x * s + local.y * c };
}

function toLocalPt(host: EndHost, world: Vec2): Vec2 {
  const dx = world.x - host.pos.x;
  const dy = world.y - host.pos.y;
  const c = Math.cos(-host.rot);
  const s = Math.sin(-host.rot);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Map a registry shape descriptor to a Rapier collider descriptor. */
function colliderDesc(shape: Shape): RAPIER.ColliderDesc {
  switch (shape.kind) {
    case "circle":
      return RAPIER.ColliderDesc.ball(shape.radius);
    case "box":
      return RAPIER.ColliderDesc.cuboid(shape.halfWidth, shape.halfHeight);
  }
}

/** Create static collider boundaries for the enabled room walls. */
function buildBoundaries(
  world: RAPIER.World,
  walls: { floor: boolean; ceiling: boolean; left: boolean; right: boolean },
  size: { width: number; height: number },
): void {
  const halfW = size.width / 2;
  const halfH = size.height / 2;
  const t = WALL_THICKNESS;
  // Floor's top surface sits at y = 0; the room rises to y = height.
  if (walls.floor) addWall(world, 0, -t, halfW, t);
  if (walls.ceiling) addWall(world, 0, size.height + t, halfW, t);
  if (walls.left) addWall(world, -halfW - t, halfH, t, halfH);
  if (walls.right) addWall(world, halfW + t, halfH, t, halfH);
}

function addWall(
  world: RAPIER.World,
  cx: number,
  cy: number,
  halfX: number,
  halfY: number,
): void {
  const rb = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy),
  );
  world.createCollider(RAPIER.ColliderDesc.cuboid(halfX, halfY), rb);
}

function num(value: number | boolean | undefined, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

/** FNV-1a hash over bytes → hex string. Cheap, stable, no crypto needed. */
function fnv1a(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
