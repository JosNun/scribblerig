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

// Type-only namespace import — stripped at build time, so it doesn't pull
// the 1.5 MB Rapier ES bundle into the initial chunk. The runtime namespace
// is loaded by `initSim()` below into `R`; every value-position use in this
// file goes through `R.X`, while type-position uses stay `RAPIER.X`.
import type * as RAPIER from "@dimforge/rapier2d-compat";
import type {
  Body,
  BodyType,
  Connector,
  ConnectorType,
  Endpoint,
  Scene,
  Vec2,
} from "../scene/scene";
import { cloneItem, isBodyEndpoint, templateItems, type TemplateItem } from "../scene/scene";
import { def, type Props, type Shape } from "../registry/registry";

const FIXED_DT = 1 / 60;
/** Thickness of the floor/ceiling/wall boundary colliders, in meters. */
const WALL_THICKNESS = 0.5;

/**
 * Collision groups for the spawner / emitted-item ignore-self rule (issue 19).
 *
 * Rapier interaction groups encode `(memberships << 16) | filter` as a u32.
 * Two colliders interact iff `(A.memberOf & B.filter) != 0` **and** the
 * symmetric AND is also nonzero.
 *
 * Scheme: each spawner gets a 1-bit membership tag `1 << bit`. Items emitted
 * by that spawner take that bit as their *only* membership; the spawner takes
 * full membership but **excludes** that bit from its filter. The asymmetric
 * filter exclusion is enough — Rapier requires both directions to pass, so
 * one zero direction kills the pair. Net effect: spawner ignores its own
 * items, items collide with each other and with everything else.
 *
 * 16 membership bits → 16 distinct spawners before wraparound. Beyond that
 * the bits cycle and overlapping pairs share the rule (a soft degradation
 * we're happy to accept — 16 spawners is well past any reasonable scene).
 */
const SPAWNER_BIT_COUNT = 16;
const ALL_BITS = 0xffff;
const DEFAULT_GROUPS = (ALL_BITS << 16) | ALL_BITS;
function spawnerGroups(bit: number): number {
  return (ALL_BITS << 16) | (ALL_BITS ^ (1 << bit));
}
function emittedItemGroups(bit: number): number {
  return ((1 << bit) << 16) | ALL_BITS;
}

export interface BodyTransform {
  position: Vec2;
  rotation: number;
}

/** A spawner-emitted body's live state for the renderer (no design counterpart). */
export interface EphemeralBody {
  id: string;
  type: BodyType;
  props: Props;
  transform: BodyTransform;
}

/** A joint between two ephemeral bodies, drawn the same way design connectors are. */
export interface EphemeralConnector {
  type: ConnectorType;
  props: Props;
  a: Endpoint;
  b: Endpoint;
}

/** Snapshot of every alive spawner emission this tick. Flat for renderer ease. */
export interface EphemeralFrame {
  bodies: EphemeralBody[];
  connectors: EphemeralConnector[];
}

export interface SimWorld {
  /** Advance the simulation by exactly one fixed timestep. */
  step(): void;
  /** Current transform of every body, keyed by design-graph body id. */
  readTransforms(): Map<string, BodyTransform>;
  /** Bodies + connectors emitted by spawners, alive this tick (issue 19). */
  readEphemerals(): EphemeralFrame;
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

/**
 * Runtime Rapier namespace, lazily populated by `initSim()`. `compile` and
 * everything below assumes `initSim()` has already been awaited (the App
 * boot path enforces this), so the non-null assertion `R!` reflects that
 * invariant — using it before `initSim()` resolves is a programmer error.
 */
let R: typeof RAPIER | undefined;
let initialized = false;

/**
 * Load the Rapier WASM module. Must be awaited once before `compile`.
 *
 * Bundle size: Rapier's ES bundle is ~1.5 MB on its own — by far the
 * heaviest dependency. Static-importing it would put that weight on the
 * SPA's initial JS payload (every page load, every visitor); dynamic-
 * importing here moves it into its own chunk, fetched only when the user
 * actually enters play mode.
 */
export async function initSim(): Promise<void> {
  if (initialized) return;
  const mod = await import("@dimforge/rapier2d-compat");
  await mod.init();
  R = mod;
  initialized = true;
}

/** Compile a design graph into a live Rapier world. */
export function compile(scene: Scene): SimWorld {
  const room = scene.rooms[0];
  const world = new R!.World(room.settings.gravity);
  world.timestep = FIXED_DT;

  buildBoundaries(world, room.settings.walls, room.settings.size);

  // Per-spawner state: a 1-bit collision tag, a timer/round-robin cursor, and
  // a FIFO of currently-alive emissions. Bit assignment is in design array
  // order so it's deterministic across compiles (and recompiles after edits).
  const spawnerBitFor = new Map<string, number>();
  let bit = 0;
  for (const b of room.bodies) {
    if (b.type === "spawner") {
      spawnerBitFor.set(b.id, bit % SPAWNER_BIT_COUNT);
      bit += 1;
    }
  }

  // Welded bodies compile into a *single* compound rigid body (ADR-0009), so a
  // body id maps to its compound's rigid body plus its offset within it.
  const placements = buildBodies(
    world,
    room.bodies,
    room.connectors,
    (id) => {
      const bit = spawnerBitFor.get(id);
      return bit === undefined ? DEFAULT_GROUPS : spawnerGroups(bit);
    },
  );

  // Connectors compile to joints, in array order, after all bodies exist.
  // Keep the joints by connector id so motors can be re-tuned live.
  const joints = new Map<string, RAPIER.ImpulseJoint>();
  for (const conn of room.connectors) {
    const joint = compileConnector(world, conn, placements);
    if (joint) joints.set(conn.id, joint);
  }

  const spawners: SpawnerRuntime[] = room.bodies
    .filter((b) => b.type === "spawner")
    .map((b) => ({
      body: b,
      placement: placements.get(b.id)!,
      bit: spawnerBitFor.get(b.id)!,
      items: templateItems(b.template?.bodies ?? [], b.template?.connectors ?? []),
      timer: 0,
      rrIndex: 0,
      alive: [],
      nextSeq: 1,
    }));

  return {
    step: () => {
      world.step();
      for (const sp of spawners) stepSpawner(world, sp);
    },
    readTransforms: () => {
      const out = new Map<string, BodyTransform>();
      for (const [id, pl] of placements) out.set(id, expandTransform(pl));
      return out;
    },
    readEphemerals: () => collectEphemerals(spawners),
    setMotor: (connectorId, props) => {
      const joint = joints.get(connectorId);
      if (joint && joint.type() === R!.JointType.Revolute) {
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
 *
 * `groupFor` is consulted **per member** so colliders that share a compound
 * with a spawner (or are themselves a spawner) can still carry their own
 * collision-group rule. Defaults to {@link DEFAULT_GROUPS} (collide with all).
 */
function buildBodies(
  world: RAPIER.World,
  bodies: Body[],
  connectors: Connector[],
  groupFor: (bodyId: string) => number = () => DEFAULT_GROUPS,
): Map<string, Placement> {
  const byId = new Map(bodies.map((b) => [b.id, b]));
  const placements = new Map<string, Placement>();

  for (const group of weldComponents(bodies, connectors)) {
    const members = group.map((id) => byId.get(id)!);
    const ref = members[0]; // the component's reference frame is its first body
    const fixed = members.some((m) => def(m.type).isStatic(m.props as Props));

    const rb = world.createRigidBody(
      (fixed ? R!.RigidBodyDesc.fixed() : R!.RigidBodyDesc.dynamic())
        .setTranslation(ref.position.x, ref.position.y)
        .setRotation(ref.rotation),
    );

    for (const m of members) {
      const { localPos, localRot } = memberOffset(ref, m);
      const props = m.props as Props;
      const groups = groupFor(m.id);
      for (const shape of def(m.type).shapes(props)) {
        world.createCollider(
          colliderDesc(shape)
            .setRestitution(num(props.restitution, 0))
            .setFriction(num(props.friction, 0.5))
            .setDensity(num(props.density, 1))
            .setCollisionGroups(groups)
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

  // Pin / weld / motor are point-coincident: they describe a single shared
  // point, not two independent anchors. Storing two locals lets them drift
  // when a body is moved post-placement (issue 24); deriving both from one
  // canonical world point keeps them coincident by construction, so the
  // revolute / fixed joint has nothing to snap. The world endpoint wins (it
  // *is* a fixed point); otherwise body `a`'s anchor is canonical. Computed
  // before the fixed-first reorder so the source of truth is preserved.
  const canonicalWorld: Vec2 | null =
    conn.type === "spring"
      ? null
      : !isBodyEndpoint(conn.a)
        ? toWorld(hostA, hostA.anchor)
        : !isBodyEndpoint(conn.b)
          ? toWorld(hostB, hostB.anchor)
          : toWorld(hostA, hostA.anchor);

  // Rapier's joints (notably the spring) only enforce their constraint when a
  // fixed body is the *first* body — a dynamic-then-fixed pair collapses to
  // zero length instead of holding the rest length. Drawing a spring *from* a
  // dynamic body *to* a static one produced exactly that order, so put the
  // fixed body first. Swapping both bodies and their anchors yields the
  // identical constraint.
  if (!hostA.rb.isFixed() && hostB.rb.isFixed()) {
    [hostA, hostB] = [hostB, hostA];
  }

  const anchorA = canonicalWorld ? toLocalPt(hostA, canonicalWorld) : hostA.anchor;
  const anchorB = canonicalWorld ? toLocalPt(hostB, canonicalWorld) : hostB.anchor;
  const worldA = toWorld(hostA, anchorA);
  const worldB = toWorld(hostB, anchorB);
  const props = conn.props as Props;

  let jointData: RAPIER.JointData;
  if (conn.type === "spring") {
    const restLength = num(props.restLength, dist(worldA, worldB));
    jointData = R!.JointData.spring(
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
    jointData = R!.JointData.revolute(anchorA, anchorB);
  } else {
    // weld to a fixed world point (a body welded to nothing): lock the body in
    // its current pose. Welds *between two bodies* never reach here — they merge
    // into one compound body and are skipped by the same-rigid-body guard above.
    const weldPt = worldA;
    jointData = R!.JointData.fixed(
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
  joint.configureMotorModel(R!.MotorModel.AccelerationBased);
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
    R!.RigidBodyDesc.fixed().setTranslation(ep.world.x, ep.world.y),
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
      return R!.ColliderDesc.ball(shape.radius);
    case "box":
      return R!.ColliderDesc.cuboid(shape.halfWidth, shape.halfHeight);
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
    R!.RigidBodyDesc.fixed().setTranslation(cx, cy),
  );
  world.createCollider(R!.ColliderDesc.cuboid(halfX, halfY), rb);
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

// ----- spawner runtime (issue 19) -----

/** One alive item the renderer needs to see; tracked for despawn-at-cap. */
interface AliveItem {
  /** Per-spawner emission sequence number (for stable ephemeral ids). */
  seq: number;
  /** Cloned design-shape bodies (positions/rotations in world frame at emit). */
  bodies: Body[];
  /** Cloned connectors with endpoints remapped to the cloned body ids. */
  connectors: Connector[];
  /** Distinct rigid bodies to remove on despawn (deduped across weld compounds). */
  rbs: RAPIER.RigidBody[];
  /** Per-body placement (rb + local offset within the compound) captured at
   *  emit time. Cached here so collectEphemerals doesn't re-run weldComponents
   *  every frame to recover the offsets — they're geometrically static once
   *  the item is built. */
  placements: Map<string, Placement>;
}

interface SpawnerRuntime {
  body: Body;
  placement: Placement;
  bit: number;
  items: TemplateItem[];
  /** Accumulated seconds; fires emission when ≥ interval. */
  timer: number;
  /** Next template item index in round-robin order. */
  rrIndex: number;
  /** FIFO of currently-alive emissions, oldest first. */
  alive: AliveItem[];
  nextSeq: number;
}

/**
 * Advance one spawner by a fixed timestep. When the timer crosses its
 * interval, despawn the oldest alive item (if at cap) **before** the new
 * emission lands — so the world never exceeds `maxAlive` for a frame.
 */
/** Cap on emissions per step so a long pause (tab unhide, slow frame) plus a
 *  tiny interval can't dump a huge backlog of items into one frame. After the
 *  cap we drop the residual timer to its modulo so the next step resumes
 *  cleanly rather than fighting a backlog. */
const MAX_EMITS_PER_STEP = 8;
function stepSpawner(world: RAPIER.World, sp: SpawnerRuntime): void {
  if (sp.items.length === 0) return; // empty template — nothing to emit
  const interval = num(sp.body.props.interval, 1);
  if (!(interval > 0)) return; // guard against 0 / negative
  sp.timer += FIXED_DT;
  let emits = 0;
  while (sp.timer >= interval && emits < MAX_EMITS_PER_STEP) {
    sp.timer -= interval;
    emits += 1;
    const maxAlive = Math.max(1, Math.floor(num(sp.body.props.maxAlive, 10)));
    while (sp.alive.length >= maxAlive) {
      despawnItem(world, sp.alive.shift()!);
    }
    const item = sp.items[sp.rrIndex % sp.items.length];
    sp.rrIndex = (sp.rrIndex + 1) % sp.items.length;
    const seq = sp.nextSeq++;
    const emitted = emitItem(world, sp, item, seq);
    if (emitted) sp.alive.push(emitted);
  }
  // Hit the cap — drop the backlog so we don't keep firing on every subsequent
  // step trying to catch up. The user sees a one-frame burst, then steady-state.
  if (sp.timer >= interval) sp.timer = sp.timer % interval;
}

/** Remove every distinct rigid body for an alive item; joints cascade-remove. */
function despawnItem(world: RAPIER.World, item: AliveItem): void {
  for (const rb of item.rbs) world.removeRigidBody(rb);
}

/**
 * Instantiate one template item into the live world at the spawner's current
 * pose. Each ephemeral body gets the spawner's emit-point velocity contribution
 * (`spawner_lin + ω × offset + speed × facing`). Returns the alive-item record
 * for despawn tracking, or null if the item produced no rigid bodies (e.g. an
 * item whose only connectors were world-anchor and skipped).
 */
/**
 * Distance from the spawner's center to the chute, in spawner-local meters
 * along +x. Set slightly past the spawner's +x edge (halfWidth = 0.3) so
 * emitted items visibly emerge from the chute rather than appearing on top
 * of the glyph. Spawner ↔ items collision is already disabled by the
 * per-spawner interaction group, so the offset is purely visual.
 */
const CHUTE_OFFSET = 0.4;

function emitItem(
  world: RAPIER.World,
  sp: SpawnerRuntime,
  item: TemplateItem,
  seq: number,
): AliveItem | null {
  const pose = expandTransform(sp.placement);
  const cos = Math.cos(pose.rotation);
  const sin = Math.sin(pose.rotation);
  // Chute = pose.position + R(pose.rotation) * (CHUTE_OFFSET, 0)
  const chuteX = pose.position.x + cos * CHUTE_OFFSET;
  const chuteY = pose.position.y + sin * CHUTE_OFFSET;
  const ephemSeq = { v: 0 };
  const mintId = (kind: "b" | "c"): string =>
    `ephem:${sp.body.id}:${seq}:${kind}${++ephemSeq.v}`;

  // Clone the item with fresh ephemeral ids; deep-copies props and positions
  // so the original template is never mutated.
  const cloned = cloneItem({ bodies: item.bodies, connectors: item.connectors }, mintId);

  // Re-anchor the item on its centroid so every emission emerges at the
  // chute regardless of where the user laid the bodies out in the template
  // canvas (template position is purely a layout choice). For a single-body
  // item the body lands at the chute; for a multi-body item the bodies
  // preserve their relative geometry but the item's centroid sits at the
  // chute.
  let centroidX = 0;
  let centroidY = 0;
  for (const b of cloned.bodies) {
    centroidX += b.position.x;
    centroidY += b.position.y;
  }
  centroidX /= cloned.bodies.length;
  centroidY /= cloned.bodies.length;

  // Place every body at the chute, translated only — items emerge **upright**
  // in their authored template orientation regardless of how the spawner is
  // aimed. The spawner's rotation still drives where the chute *is* (and
  // which way `speed * facing` points), but not how an item looks. Mental
  // model: a cannon barrel pivots to aim, but the ball comes out unrotated.
  for (const b of cloned.bodies) {
    b.position = { x: chuteX + (b.position.x - centroidX), y: chuteY + (b.position.y - centroidY) };
    // Rotation kept as authored — no spawner-rotation composition.
  }

  // World-endpoint connectors inside a template are a v1 corner case: their
  // `world` coords are ambiguous (template-local? world?) and the static anchor
  // body Rapier creates for them isn't tracked for despawn. Skip them at emit
  // and rely on user-authored body-to-body joints for templated structure.
  const transformedConnectors = cloned.connectors.filter(
    (c) => isBodyEndpoint(c.a) && isBodyEndpoint(c.b),
  );

  // Build the rigid bodies (with weld compounding) under this spawner's
  // emission collision group, so they ignore the spawner but collide with
  // everything else.
  const itemGroup = emittedItemGroups(sp.bit);
  const placements = buildBodies(
    world,
    cloned.bodies,
    transformedConnectors,
    () => itemGroup,
  );
  if (placements.size === 0) return null;

  // Apply the launch + inheritance velocity to each *distinct* rigid body.
  // For weld-compounded items, several "bodies" share one rb; setting once
  // is enough (and avoids overwriting with stale offsets).
  //
  // The ω×r tangential term must be measured from the spawner's *compound
  // rb origin* — not from the spawner's design world pose. They only differ
  // when the spawner is welded into a compound where it's not the reference
  // body (the rb origin is at the *first* welded body); in that case the
  // rb's linvel/angvel are stored at the compound origin, so r must also be
  // relative to that origin. Using pose.position skips the radial-arm
  // contribution and items inherit too little tangential velocity.
  const rbOrigin = sp.placement.rb.translation();
  const lin = sp.placement.rb.linvel();
  const ang = sp.placement.rb.angvel();
  const speed = num(sp.body.props.speed, 0);
  const facing = { x: cos, y: sin };
  const seenRbs = new Set<RAPIER.RigidBody>();
  const rbList: RAPIER.RigidBody[] = [];
  for (const pl of placements.values()) {
    if (seenRbs.has(pl.rb)) continue;
    seenRbs.add(pl.rb);
    rbList.push(pl.rb);
    if (pl.rb.isFixed()) continue;
    const t = expandTransform(pl);
    const dx = t.position.x - rbOrigin.x;
    const dy = t.position.y - rbOrigin.y;
    pl.rb.setLinvel(
      { x: lin.x - ang * dy + speed * facing.x, y: lin.y + ang * dx + speed * facing.y },
      true,
    );
  }

  // Build joints last (matches the design path).
  for (const c of transformedConnectors) {
    compileConnector(world, c, placements);
  }

  return {
    seq,
    bodies: cloned.bodies,
    connectors: transformedConnectors,
    rbs: rbList,
    placements,
  };
}

/** Flatten every alive item into a single frame for the renderer to draw. */
function collectEphemerals(spawners: SpawnerRuntime[]): EphemeralFrame {
  const bodies: EphemeralBody[] = [];
  const connectors: EphemeralConnector[] = [];
  for (const sp of spawners) {
    // Re-read the live placement each tick — these are the freshly-stepped
    // transforms, not the emit-time snapshot.
    for (const item of sp.alive) {
      // Placements were cached on the AliveItem at emit time — the per-body
      // local offset within the compound rb is geometrically static, only
      // the rb's *world* transform changes per frame. expandTransform reads
      // the live rb pose each call.
      for (const b of item.bodies) {
        const pl = item.placements.get(b.id);
        if (!pl) continue;
        bodies.push({
          id: b.id,
          type: b.type,
          props: b.props as Props,
          transform: expandTransform(pl),
        });
      }
      for (const c of item.connectors) {
        connectors.push({ type: c.type, props: c.props as Props, a: c.a, b: c.b });
      }
    }
  }
  return { bodies, connectors };
}
