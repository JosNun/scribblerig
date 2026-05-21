/**
 * Per-type declarations for body widgets. This is the extensibility seam:
 * adding a body type means adding one entry here — `sim`, `renderer`, and the
 * palette all read from the registry generically and never branch on type.
 *
 * The registry is pure data + pure functions. It must NOT import Rapier or
 * Rough.js. Instead it declares geometry as primitive **shape descriptors**
 * (`circle`/`box`); `sim` turns those into colliders and `renderer` turns them
 * into drawables. The descriptor is the shared contract between the modules.
 */

import type { Body, BodyType, Vec2 } from "../scene/scene";

export type Props = Record<string, number | boolean>;

export type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "box"; halfWidth: number; halfHeight: number };

/**
 * Render-only decoration in body-local coords (meters). Has no collision
 * geometry — e.g. a wheel's spokes, which make rotation visible but don't
 * affect physics. `sim` ignores marks; only `renderer` draws them.
 */
export type Mark = { kind: "line"; a: Vec2; b: Vec2 };

/** A named attachment point in body-local coordinates (meters). */
export interface NamedAnchor {
  name: string;
  local: Vec2;
}

/**
 * One editable property. The property panel renders an editor from this with no
 * per-type code, and serialization is automatic since props live on the body.
 */
export interface PropField {
  key: string;
  label: string;
  kind: "number" | "boolean";
  min?: number;
  max?: number;
  step?: number;
}

export interface BodyTypeDef {
  type: BodyType;
  /** Display name for the palette. */
  label: string;
  defaults: Props;
  isStatic(props: Props): boolean;
  /** Collision + visual geometry in body-local coords, derived from props. */
  shapes(props: Props): Shape[];
  /** Render-only decorations (no collision), e.g. wheel spokes. */
  marks?(props: Props): Mark[];
  /** Editable properties, rendered by the generic property panel. */
  propSchema: PropField[];
  /** Named anchor points for connector snapping (used from issue 05 on). */
  anchors(props: Props): NamedAnchor[];
  /** Doodle rendering style. */
  style: { fill: string; fillStyle: string };
}

function n(props: Props, key: string, fallback: number): number {
  const v = props[key];
  return typeof v === "number" ? v : fallback;
}

const BALL: BodyTypeDef = {
  type: "ball",
  label: "Ball",
  defaults: { radius: 0.5, restitution: 0.7, density: 1 },
  isStatic: () => false,
  shapes: (p) => [{ kind: "circle", radius: n(p, "radius", 0.5) }],
  propSchema: [
    { key: "radius", label: "Radius", kind: "number", min: 0.1, max: 3, step: 0.1 },
    { key: "restitution", label: "Bounciness", kind: "number", min: 0, max: 1, step: 0.05 },
    { key: "density", label: "Density", kind: "number", min: 0.1, max: 5, step: 0.1 },
  ],
  anchors: () => [{ name: "center", local: { x: 0, y: 0 } }],
  style: { fill: "#e8743b", fillStyle: "hachure" },
};

const PLATFORM: BodyTypeDef = {
  type: "platform",
  label: "Platform",
  defaults: { width: 3, height: 0.4, friction: 0.6, static: true },
  isStatic: (p) => p.static !== false,
  shapes: (p) => [
    { kind: "box", halfWidth: n(p, "width", 3) / 2, halfHeight: n(p, "height", 0.4) / 2 },
  ],
  propSchema: [
    { key: "width", label: "Width", kind: "number", min: 0.5, max: 12, step: 0.1 },
    { key: "height", label: "Height", kind: "number", min: 0.1, max: 4, step: 0.1 },
    { key: "friction", label: "Friction", kind: "number", min: 0, max: 1, step: 0.05 },
    { key: "static", label: "Static (immovable)", kind: "boolean" },
  ],
  anchors: (p) => {
    const hw = n(p, "width", 3) / 2;
    const hh = n(p, "height", 0.4) / 2;
    return [
      { name: "center", local: { x: 0, y: 0 } },
      { name: "topLeft", local: { x: -hw, y: hh } },
      { name: "topRight", local: { x: hw, y: hh } },
      { name: "bottomLeft", local: { x: -hw, y: -hh } },
      { name: "bottomRight", local: { x: hw, y: -hh } },
    ];
  },
  style: { fill: "#9b8466", fillStyle: "cross-hatch" },
};

const WHEEL: BodyTypeDef = {
  type: "wheel",
  label: "Wheel",
  defaults: { radius: 0.6, friction: 0.8, density: 1 },
  isStatic: () => false,
  shapes: (p) => [{ kind: "circle", radius: n(p, "radius", 0.6) }],
  // Crossed spokes so the wheel's rotation is visible as it spins.
  marks: (p) => {
    const r = n(p, "radius", 0.6);
    return [
      { kind: "line", a: { x: -r, y: 0 }, b: { x: r, y: 0 } },
      { kind: "line", a: { x: 0, y: -r }, b: { x: 0, y: r } },
    ];
  },
  propSchema: [
    { key: "radius", label: "Radius", kind: "number", min: 0.1, max: 3, step: 0.1 },
    { key: "friction", label: "Friction", kind: "number", min: 0, max: 1, step: 0.05 },
    { key: "density", label: "Density", kind: "number", min: 0.1, max: 5, step: 0.1 },
  ],
  anchors: () => [{ name: "center", local: { x: 0, y: 0 } }],
  style: { fill: "#5b8fa3", fillStyle: "zigzag" },
};

/** Ordered registry; array order is the palette order and is deterministic. */
const ORDER: BodyTypeDef[] = [BALL, PLATFORM, WHEEL];
const BY_TYPE: Record<BodyType, BodyTypeDef> = {
  ball: BALL,
  platform: PLATFORM,
  wheel: WHEEL,
};

export function bodyTypes(): BodyTypeDef[] {
  return ORDER;
}

export function def(type: BodyType): BodyTypeDef {
  return BY_TYPE[type];
}

/** Build a new (id-less) body of a type at a position, with its default props. */
export function makeBody(type: BodyType, position: Vec2): Omit<Body, "id"> {
  return {
    type,
    position: { ...position },
    rotation: 0,
    props: { ...BY_TYPE[type].defaults },
  };
}
