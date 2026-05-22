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
  /**
   * Live-update a motor connector's drive from its props, without recompiling —
   * so motor speed/direction can be tuned mid-run. No-op for unknown ids or
   * non-motor connectors.
   */
  setMotor(connectorId: string, props: Props): void;
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

  // Welded bodies compile into a *single* compound rigid body (ADR-0009), so a
  // body id maps to its compound's rigid body plus its offset within it.
  const placements = buildBodies(world, room.bodies, room.connectors);

  // Connectors compile to joints, in array order, after all bodies exist.
  // Keep the joints by connector id so motors can be re-tuned live.
  const joints = new Map<string, RAPIER.ImpulseJoint>();
  for (const conn of room.connectors) {
    const joint = compileConnector(world, conn, placements);
    if (joint) joints.set(conn.id, joint);
  }

  return {
    step: () => world.step(),
    readTransforms: () => {
      const out = new Map<string, BodyTransform>();
      for (const [id, pl] of placements) out.set(id, expandTransform(pl));
      return out;
    },
    setMotor: (connectorId, props) => {
      const joint = joints.get(connectorId);
      if (joint && joint.type() === RAPIER.JointType.Revolute) {
        configureMotor(joint as RAPIER.RevoluteImpulseJoint, props);
      }
    },
    checksum: () => fnv1a(world.takeSnapshot()),
    free: () => world.free(),
  };
}

/**
 * Connected components of bodies joined by welds (ADR-0009). Each component is
 * one compound rigid body at compile time. Only welds **between two bodies**
 * merge — a weld to a fixed world point anchors a single body and is left as a
 * joint. Bodies are returned in design-array order within each component, and
 * components in order of first appearance, so compilation stays deterministic.
 */
export function weldComponents(bodies: Body[], connectors: Connector[]): string[][] {
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
    if (c.type !== "weld" || !isBodyEndpoint(c.a) || !isBodyEndpoint(c.b)) continue;
    if (!parent.has(c.a.body) || !parent.has(c.b.body)) continue;
    const ra = find(c.a.body);
    const rb = find(c.b.body);
    if (ra !== rb) parent.set(ra, rb);
  }
  const groups = new Map<string, string[]>();
  const order: string[] = [];
  for (const b of bodies) {
    const root = find(b.id);
    if (!groups.has(root)) {
      groups.set(root, []);
      order.push(root);
    }
    groups.get(root)!.push(b.id);
  }
  return order.map((root) => groups.get(root)!);
}

/** A design body's place in the live world: its (possibly shared) rigid body
 *  and its fixed offset within that body's frame. */
interface Placement {
  rb: RAPIER.RigidBody;
  localPos: Vec2;
  localRot: number;
}

/**
 * Build the rigid bodies, merging each weld component into one compound body
 * with a collider per member at the member's offset. Returns each design body's
 * placement. A compound is fixed if **any** member is static (ADR-0009).
 */
function buildBodies(
  world: RAPIER.World,
  bodies: Body[],
  connectors: Connector[],
): Map<string, Placement> {
  const byId = new Map(bodies.map((b) => [b.id, b]));
  const placements = new Map<string, Placement>();

  for (const group of weldComponents(bodies, connectors)) {
    const members = group.map((id) => byId.get(id)!);
    const ref = members[0]; // the component's reference frame is its first body
    const fixed = members.some((m) => def(m.type).isStatic(m.props as Props));

    const rb = world.createRigidBody(
      (fixed ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic())
        .setTranslation(ref.position.x, ref.position.y)
        .setRotation(ref.rotation),
    );

    for (const m of members) {
      const { localPos, localRot } = memberOffset(ref, m);
      const props = m.props as Props;
      for (const shape of def(m.type).shapes(props)) {
        world.createCollider(
          colliderDesc(shape)
            .setRestitution(num(props.restitution, 0))
            .setFriction(num(props.friction, 0.5))
            .setDensity(num(props.density, 1))
            .setTranslation(localPos.x, localPos.y)
            .setRotation(localRot),
          rb,
        );
      }
      placements.set(m.id, { rb, localPos, localRot });
    }
  }
  return placements;
}

/** A member body's pose expressed in its compound's (reference body's) frame. */
function memberOffset(ref: Body, member: Body): { localPos: Vec2; localRot: number } {
  const dx = member.position.x - ref.position.x;
  const dy = member.position.y - ref.position.y;
  const c = Math.cos(-ref.rotation);
  const s = Math.sin(-ref.rotation);
  return {
    localPos: { x: dx * c - dy * s, y: dx * s + dy * c },
    localRot: member.rotation - ref.rotation,
  };
}

/** Live world transform of a member, from its compound's pose + its offset. */
function expandTransform(pl: Placement): BodyTransform {
  const p = pl.rb.translation();
  const theta = pl.rb.rotation();
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return {
    position: {
      x: p.x + pl.localPos.x * c - pl.localPos.y * s,
      y: p.y + pl.localPos.x * s + pl.localPos.y * c,
    },
    rotation: theta + pl.localRot,
  };
}

/**
 * A resolved connector endpoint: the rigid body it acts on (a body's compound,
 * or a static world anchor), that body's reference pose, and the anchor in the
 * rigid body's local frame.
 */
interface EndHost {
  rb: RAPIER.RigidBody;
  pos: Vec2;
  rot: number;
  anchor: Vec2;
}

/**
 * Compile a connector into a Rapier joint. World-point endpoints get a static
 * anchor body. Joined bodies don't collide at the joint (contactsEnabled off).
 * A connector whose endpoints resolve to the **same** rigid body is internal to
 * a weld compound (e.g. the weld edges themselves) and produces no joint.
 */
function compileConnector(
  world: RAPIER.World,
  conn: Connector,
  placements: Map<string, Placement>,
): RAPIER.ImpulseJoint | null {
  let hostA = endHost(world, conn.a, placements);
  let hostB = endHost(world, conn.b, placements);
  if (!hostA || !hostB) return null; // a referenced body was deleted
  if (hostA.rb === hostB.rb) return null; // both ends in one compound — no joint

  // Rapier's joints (notably the spring) only enforce their constraint when a
  // fixed body is the *first* body — a dynamic-then-fixed pair collapses to
  // zero length instead of holding the rest length. Drawing a spring *from* a
  // dynamic body *to* a static one produced exactly that order, so put the
  // fixed body first. Swapping both bodies and their anchors yields the
  // identical constraint.
  if (!hostA.rb.isFixed() && hostB.rb.isFixed()) {
    [hostA, hostB] = [hostB, hostA];
  }

  const anchorA = hostA.anchor;
  const anchorB = hostB.anchor;
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
  } else if (conn.type === "pin" || conn.type === "motor") {
    // A hinge: each body is anchored at its own attach point, and the joint
    // holds those points coincident (click-to-place makes them the same point).
    // A motor is the same revolute joint with a velocity drive added below.
    jointData = RAPIER.JointData.revolute(anchorA, anchorB);
  } else {
    // weld to a fixed world point (a body welded to nothing): lock the body in
    // its current pose. Welds *between two bodies* never reach here — they merge
    // into one compound body and are skipped by the same-rigid-body guard above.
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
  // (spring defaults on; pin/weld/motor off so overlapping parts don't fight).
  joint.setContactsEnabled(props.collide === true);

  // The motor drives body2 relative to body1. The "fixed body first" reorder
  // above means a body-mounted-on-a-fixed-pivot motor has the body as body2,
  // so a positive speed spins it counter-clockwise (the intuitive direction).
  if (conn.type === "motor") {
    configureMotor(joint as RAPIER.RevoluteImpulseJoint, props);
  }
  return joint;
}

/**
 * Configure a revolute joint's velocity motor from motor props. Acceleration-
 * based so the body reaches the target speed regardless of its mass; `torque`
 * is the drive factor (how hard it tracks the target), `reverse` flips it.
 */
function configureMotor(joint: RAPIER.RevoluteImpulseJoint, props: Props): void {
  const target = (props.reverse === true ? -1 : 1) * num(props.speed, 0);
  joint.configureMotorModel(RAPIER.MotorModel.AccelerationBased);
  joint.configureMotorVelocity(target, num(props.torque, 1));
}

function endHost(
  world: RAPIER.World,
  ep: Endpoint,
  placements: Map<string, Placement>,
): EndHost | null {
  if (isBodyEndpoint(ep)) {
    const pl = placements.get(ep.body);
    if (!pl) return null;
    // The endpoint's anchor is in the design body's local frame; map it into the
    // (possibly shared) compound rigid body's frame, then express the host pose
    // in that same frame so toWorld/toLocalPt stay consistent.
    const c = Math.cos(pl.localRot);
    const s = Math.sin(pl.localRot);
    const anchor = {
      x: pl.localPos.x + ep.local.x * c - ep.local.y * s,
      y: pl.localPos.y + ep.local.x * s + ep.local.y * c,
    };
    const t = pl.rb.translation();
    return { rb: pl.rb, pos: { x: t.x, y: t.y }, rot: pl.rb.rotation(), anchor };
  }
  const rb = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(ep.world.x, ep.world.y),
  );
  return { rb, pos: ep.world, rot: 0, anchor: { x: 0, y: 0 } };
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
