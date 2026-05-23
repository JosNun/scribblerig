/**
 * Share codec: scene ⇄ a compact, URL-safe string.
 *
 * `encodeScene` serializes the design graph to JSON, deflates it (pako), and
 * base64url-encodes the bytes so the result drops straight into a URL fragment.
 * `decodeScene` reverses that. Decoding is **tolerant**: a shared link or an
 * autosave may have been written by a different version of the app, so decode
 * never trusts the parsed JSON — it rebuilds a clean scene through the registry
 * (see `sanitizeScene`), dropping anything it no longer understands and filling
 * in anything that's missing. Malformed/truncated input yields `null`.
 */

import { deflate, inflate } from "pako";
import {
  SCENE_VERSION,
  defaultRoomSettings,
  type Scene,
  type RoomSettings,
  type Body,
  type Connector,
  type Endpoint,
  type Vec2,
  type BodyType,
  type ConnectorType,
} from "../scene/scene";
import { def, connectorDef, type Props, type PropField } from "../registry/registry";

/** Serialize a scene to a compressed, base64url string for a URL fragment. */
export function encodeScene(scene: Scene): string {
  return bytesToBase64Url(deflate(JSON.stringify(scene)));
}

/** Parse a string from `encodeScene` back into a scene, or `null` if unusable. */
export function decodeScene(encoded: string): Scene | null {
  try {
    const json = inflate(base64UrlToBytes(encoded), { to: "string" });
    return sanitizeScene(JSON.parse(json));
  } catch {
    return null;
  }
}

/**
 * Rebuild a clean, current-format scene from arbitrary parsed JSON, degrading
 * gracefully so format/feature changes never break import:
 *
 * - bodies/connectors of an unknown `type` are dropped (the registry is the
 *   authority on what types exist);
 * - props are coerced against each type's schema — unknown keys are ignored,
 *   missing or wrong-typed values fall back to the registry default;
 * - connectors whose endpoint references a body that didn't survive are dropped;
 * - `nextId` is advanced past every surviving id so later edits don't collide.
 *
 * Returns `null` only when the input isn't even scene-shaped (no usable room).
 */
export function sanitizeScene(raw: unknown): Scene | null {
  if (!isObj(raw) || !Array.isArray(raw.rooms) || raw.rooms.length === 0) return null;
  const room0 = raw.rooms[0];
  if (!isObj(room0)) return null;

  const settings = sanitizeSettings(room0.settings);
  const bodies = asArray(room0.bodies)
    .map(sanitizeBody)
    .filter((b): b is Body => b !== null);
  const bodyIds = new Set(bodies.map((b) => b.id));
  const connectors = asArray(room0.connectors)
    .map((c) => sanitizeConnector(c, bodyIds))
    .filter((c): c is Connector => c !== null);

  const title = sanitizeTitle(raw.title);
  return {
    version: SCENE_VERSION,
    nextId: computeNextId(raw.nextId, bodies, connectors),
    rooms: [{ settings, bodies, connectors }],
    ...(title !== undefined ? { title } : {}),
  };
}

/**
 * Squeeze any user-supplied value into a plain-text title suitable for
 * embedding in OpenGraph meta tags and shortlink rows.
 *
 *  - Non-strings → dropped (`undefined`).
 *  - ASCII control chars (`\x00-\x1f`, `\x7f`) stripped.
 *  - `<` and `>` stripped (HTMLRewriter would escape attribute values, but
 *    this is a cheap defence-in-depth).
 *  - Trimmed, then capped at 80 chars.
 *  - Whitespace-only result → dropped.
 */
const TITLE_MAX = 80;
export function sanitizeTitle(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  // eslint-disable-next-line no-control-regex
  const cleaned = v.replace(/[\x00-\x1f\x7f<>]/g, "").trim();
  if (!cleaned) return undefined;
  return cleaned.length > TITLE_MAX ? cleaned.slice(0, TITLE_MAX) : cleaned;
}

function sanitizeBody(raw: unknown): Body | null {
  if (!isObj(raw) || typeof raw.id !== "string") return null;
  const type = raw.type;
  if (!knownBody(type)) return null;
  const d = def(type);
  return {
    id: raw.id,
    type,
    position: vec2(raw.position, { x: 0, y: 0 }),
    rotation: num(raw.rotation, 0),
    props: sanitizeProps(d.propSchema, d.defaults, raw.props),
  };
}

function sanitizeConnector(raw: unknown, bodyIds: Set<string>): Connector | null {
  if (!isObj(raw) || typeof raw.id !== "string") return null;
  const type = raw.type;
  if (!knownConnector(type)) return null;
  const a = sanitizeEndpoint(raw.a, bodyIds);
  const b = sanitizeEndpoint(raw.b, bodyIds);
  if (!a || !b) return null;
  const d = connectorDef(type);
  return { id: raw.id, type, a, b, props: sanitizeProps(d.propSchema, d.defaults, raw.props) };
}

/** A body-anchored endpoint must point at a surviving body; world points pass. */
function sanitizeEndpoint(raw: unknown, bodyIds: Set<string>): Endpoint | null {
  if (!isObj(raw)) return null;
  if (typeof raw.body === "string") {
    return bodyIds.has(raw.body) ? { body: raw.body, local: vec2(raw.local, { x: 0, y: 0 }) } : null;
  }
  if (isObj(raw.world)) return { world: vec2(raw.world, { x: 0, y: 0 }) };
  return null;
}

/** Keep only schema-declared props, default-filling anything missing or bad. */
function sanitizeProps(schema: PropField[], defaults: Props, raw: unknown): Props {
  const out: Props = { ...defaults };
  if (isObj(raw)) {
    for (const f of schema) {
      const v = raw[f.key];
      if (f.kind === "number" && typeof v === "number" && Number.isFinite(v)) out[f.key] = v;
      else if (f.kind === "boolean" && typeof v === "boolean") out[f.key] = v;
    }
  }
  return out;
}

function sanitizeSettings(raw: unknown): RoomSettings {
  const d = defaultRoomSettings();
  if (!isObj(raw)) return d;
  const w = isObj(raw.walls) ? raw.walls : {};
  const sz = isObj(raw.size) ? raw.size : {};
  return {
    gravity: vec2(raw.gravity, d.gravity),
    walls: {
      floor: bool(w.floor, d.walls.floor),
      ceiling: bool(w.ceiling, d.walls.ceiling),
      left: bool(w.left, d.walls.left),
      right: bool(w.right, d.walls.right),
    },
    size: { width: posNum(sz.width, d.size.width), height: posNum(sz.height, d.size.height) },
    snap: bool(raw.snap, d.snap),
  };
}

/** Next free id = past the stored counter and past every surviving id's number. */
function computeNextId(rawNextId: unknown, bodies: Body[], connectors: Connector[]): number {
  let n = num(rawNextId, 1);
  for (const el of [...bodies, ...connectors]) {
    const m = /(\d+)$/.exec(el.id);
    if (m) n = Math.max(n, parseInt(m[1], 10) + 1);
  }
  return n;
}

// ----- small coercion helpers -----

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function posNum(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}
function vec2(v: unknown, fb: Vec2): Vec2 {
  return isObj(v) ? { x: num(v.x, fb.x), y: num(v.y, fb.y) } : { ...fb };
}
function knownBody(t: unknown): t is BodyType {
  return typeof t === "string" && !!def(t as BodyType);
}
function knownConnector(t: unknown): t is ConnectorType {
  return typeof t === "string" && !!connectorDef(t as ConnectorType);
}

// ----- base64url (works in browsers and Node; both expose atob/btoa) -----

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(s: string): Uint8Array {
  let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
