/**
 * Canvas 2D renderer in a hand-drawn doodle style via Rough.js.
 *
 * The shimmer trap: Rough.js adds random wobble every time it draws a shape, so
 * re-roughening each frame makes a moving body crawl with noise. We avoid that
 * by generating each shape's rough *drawable once* and caching it; per frame we
 * only translate/rotate the canvas context and redraw the cached drawable, so
 * the wobble is baked into the shape and moves rigidly with the body.
 */

import rough from "roughjs";
import type { Drawable } from "roughjs/bin/core";
import type { Body, Connector, ConnectorType, Endpoint, Scene, Vec2 } from "../scene/scene";
import { isBodyEndpoint } from "../scene/scene";
import type { BodyTransform, EphemeralFrame } from "../sim/sim";
import { def, connectorDef, type Props, type Shape } from "../registry/registry";
import { bodyHandles, bodyToWorld } from "../editor/editor";
import { type Camera, worldToScreen, screenToWorld } from "./camera";

/** Transient draw-time overlay for the connector-draw interaction. */
export interface DrawOverlay {
  /** Rubber-band preview line (world coords) while drawing a connector. */
  preview?: { a: Vec2; b: Vec2; type: ConnectorType };
  /** World point the endpoint will snap to, highlighted as you drag. */
  snap?: Vec2;
}

const WALL_THICKNESS = 0.5; // meters; mirrors the floor collider in sim

const INK = "#2b2b2b";
const FLOOR_FILL = "#9b8466";

/**
 * Hachure/cross-hatch fill spacing & line thickness, expressed in **world
 * meters** so the fill is painted onto the body and scales with it on zoom
 * (issue 20). Rough.js defaults are fixed pixels, which makes the fill "swim"
 * relative to the shape as the camera scale changes. These values reproduce
 * Rough's default look (gap ≈ 8px, weight ≈ 1px) at the typical fit zoom
 * (~55 px/m for a 12 m room). The pixel floor keeps the fill from vanishing
 * when zoomed far out.
 */
const FILL_GAP_WORLD = 0.15;
const FILL_WEIGHT_WORLD = 0.018;
const FILL_WEIGHT_MIN_PX = 0.6;

/** Fill sizing options (gap/weight) locked to world space at the given scale. */
function worldFillOptions(scale: number): { hachureGap: number; fillWeight: number } {
  return {
    hachureGap: FILL_GAP_WORLD * scale,
    fillWeight: Math.max(FILL_WEIGHT_WORLD * scale, FILL_WEIGHT_MIN_PX),
  };
}

/** Dot-grid spacing in meters (matches the editor snap grid). */
const GRID_SIZE = 0.5;
const GRID_DOT = "rgba(43, 43, 43, 0.13)";
/** Below this on-screen spacing the grid is just noise, so skip it (and the
 *  dot count would balloon when zoomed far out). */
const GRID_MIN_SPACING_PX = 7;

export interface Renderer {
  draw(
    scene: Scene,
    transforms: Map<string, BodyTransform>,
    selectedId?: string | null,
    overlay?: DrawOverlay,
    /**
     * Spawner-emitted bodies + connectors alive this tick (issue 19). Drawn
     * on top of the design layer; never enter the picking pool.
     */
    ephemerals?: EphemeralFrame,
  ): void;
  /** Swap the camera (e.g. on window resize). Invalidates the drawable cache. */
  setCamera(camera: Camera): void;
}

const SELECT_COLOR = "#1f7a3d";

export function createRenderer(
  canvas: HTMLCanvasElement,
  initialCamera: Camera,
  options: { grid?: boolean } = {},
): Renderer {
  const showGrid = options.grid !== false; // on by default; off for thumbnails
  const ctx = canvas.getContext("2d")!;
  const rc = rough.canvas(canvas);
  let cam = initialCamera;
  // Drawables cached by a signature that captures everything affecting shape.
  // Pixel sizes are baked in, so the cache is cleared whenever the camera scale
  // changes (setCamera).
  const cache = new Map<string, Drawable>();

  const cached = (key: string, make: () => Drawable): Drawable => {
    let d = cache.get(key);
    if (!d) {
      d = make();
      cache.set(key, d);
    }
    return d;
  };

  return {
    setCamera(next) {
      cam = next;
      cache.clear();
    },
    draw(scene, transforms, selectedId, overlay, ephemerals) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const room = scene.rooms[0];

      if (showGrid) drawGrid();
      drawRoomFrame(room.settings.size);
      drawWalls(room.settings.walls, room.settings.size);

      // Faint outline around each spawner showing the aggregate bbox of its
      // template's items — a "what comes out of this" cue (issue 19). Drawn
      // before design bodies so it sits behind them.
      for (const body of room.bodies) {
        if (body.type !== "spawner" || !body.template) continue;
        const t = transforms.get(body.id);
        if (t) drawTemplateBbox(body.template.bodies, t);
      }

      // Connectors under the bodies they join.
      for (const conn of room.connectors) drawConnector(conn, transforms, conn.id === selectedId);

      for (const body of room.bodies) {
        const t = transforms.get(body.id);
        if (!t) continue;
        drawBody(body.type, body.id, body.props as Props, t);
        if (body.id === selectedId) {
          drawSelection(body, t);
          drawHandles(body, t);
        }
      }

      // Ephemerals: emitted items live in the sim, not the design scene. Draw
      // each through the same registry path (so they look identical to design
      // bodies of the same type) and draw their connectors over them.
      if (ephemerals && ephemerals.bodies.length > 0) {
        const ephTransforms = new Map<string, BodyTransform>();
        for (const eb of ephemerals.bodies) ephTransforms.set(eb.id, eb.transform);
        for (const ec of ephemerals.connectors) drawConnector(ec, ephTransforms, false);
        for (const eb of ephemerals.bodies) {
          drawBody(eb.type, `ephem:${eb.type}`, eb.props, eb.transform);
        }
      }

      if (overlay) drawDrawOverlay(overlay);
    },
  };

  /** World position of a connector endpoint using the live transforms. */
  function endpointWorld(ep: Endpoint, transforms: Map<string, BodyTransform>): Vec2 | null {
    if (!isBodyEndpoint(ep)) return ep.world;
    const t = transforms.get(ep.body);
    if (!t) return null;
    const c = Math.cos(t.rotation);
    const s = Math.sin(t.rotation);
    return {
      x: t.position.x + ep.local.x * c - ep.local.y * s,
      y: t.position.y + ep.local.x * s + ep.local.y * c,
    };
  }

  // Connector shape accepted by drawConnector: design Connector or an ephemeral
  // (issue 19, no id). The body of the function never reads `id`, so both
  // shapes work uniformly.
  function drawConnector(conn: Pick<Connector, "type" | "props" | "a" | "b">, transforms: Map<string, BodyTransform>, selected: boolean): void {
    const aw = endpointWorld(conn.a, transforms);
    const bw = endpointWorld(conn.b, transforms);
    if (!aw || !bw) return;
    const pa = worldToScreen(cam, aw);
    const pb = worldToScreen(cam, bw);
    const color = selected ? SELECT_COLOR : connectorDef(conn.type).stroke;
    const width = selected ? 4 : 2.5;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    if (conn.type === "spring") {
      // The rest-length marker is for the selected spring only (issue 12).
      if (selected) drawSpringRest(aw, bw, conn.props as Props);
      strokeSpring(pa, pb);
      // Two anchors → two draggable endpoint handles when selected.
      if (selected) drawEndpointHandles([pa, pb]);
    } else {
      // pin / weld / motor — a single shared point (issue 24). The world endpoint
      // wins (it's a fixed pivot); otherwise body `a`'s anchor is canonical. The
      // partner's anchor derives from this same point at compile, so the joint is
      // already satisfied — no line to draw between drifted anchors.
      const pivotWorld = !isBodyEndpoint(conn.a) ? aw : !isBodyEndpoint(conn.b) ? bw : aw;
      const pivot = worldToScreen(cam, pivotWorld);
      if (conn.type === "weld") {
        square(pivot, 4);
      } else {
        ring(pivot, 6);
        // Arrow follows the motor's actual direction: a non-reversed motor spins
        // the body counter-clockwise; `reverse` flips it (issue 12).
        if (conn.type === "motor") motorArc(pivot, 11, conn.props.reverse !== true);
      }
      if (selected) drawEndpointHandles([pivot]);
    }
    ctx.restore();
  }

  /** Filled circle handles at each endpoint of the selected connector. */
  function drawEndpointHandles(points: Vec2[]): void {
    ctx.fillStyle = SELECT_COLOR;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    for (const p of points) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  function drawDrawOverlay(overlay: DrawOverlay): void {
    ctx.save();
    if (overlay.preview) {
      const pa = worldToScreen(cam, overlay.preview.a);
      const pb = worldToScreen(cam, overlay.preview.b);
      ctx.strokeStyle = connectorDef(overlay.preview.type).stroke;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      line(pa, pb);
      ctx.setLineDash([]);
    }
    if (overlay.snap) {
      ctx.strokeStyle = SELECT_COLOR;
      ctx.fillStyle = "rgba(31,122,61,0.25)";
      ctx.lineWidth = 2;
      const p = worldToScreen(cam, overlay.snap);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function line(a: Vec2, b: Vec2): void {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  function square(p: Vec2, r: number): void {
    ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  }
  function ring(p: Vec2, r: number): void {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.stroke();
  }
  /**
   * A ~270° arc with an arrowhead — a "this spins" cue around a motor pivot,
   * drawn in the motor's actual spin direction (issue 12). `ccw` = the body
   * turns counter-clockwise on screen (a positive/non-reversed motor); the arc
   * sweeps that way and the arrowhead points along the travel direction.
   */
  function motorArc(p: Vec2, r: number, ccw: boolean): void {
    const start = -Math.PI / 2; // top of the ring
    const end = start + (ccw ? -1 : 1) * (1.5 * Math.PI); // 270°, signed by direction
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, start, end, ccw); // anticlockwise flag = ccw
    ctx.stroke();
    // Tip at the swept end; travel tangent there points the way the arc is going.
    const ex = p.x + r * Math.cos(end);
    const ey = p.y + r * Math.sin(end);
    const tx = ccw ? Math.sin(end) : -Math.sin(end);
    const ty = ccw ? -Math.cos(end) : Math.cos(end);
    const nx = -ty;
    const ny = tx;
    const h = 5;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - tx * h + nx * h * 0.6, ey - ty * h + ny * h * 0.6);
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - tx * h - nx * h * 0.6, ey - ty * h - ny * h * 0.6);
    ctx.stroke();
  }
  /**
   * Faint rest-length marker for a selected spring (issue 12): a dashed segment
   * of the spring's natural length, centred on the live midpoint, with end
   * ticks. The gap between the live endpoints and these ticks reads as how
   * stretched (ticks inside) or compressed (ticks outside) the spring is.
   */
  function drawSpringRest(aw: Vec2, bw: Vec2, props: Props): void {
    const rest = typeof props.restLength === "number" ? props.restLength : 0;
    if (rest <= 0) return;
    const dx = bw.x - aw.x;
    const dy = bw.y - aw.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const mx = (aw.x + bw.x) / 2;
    const my = (aw.y + bw.y) / 2;
    const half = rest / 2;
    const e1 = worldToScreen(cam, { x: mx - ux * half, y: my - uy * half });
    const e2 = worldToScreen(cam, { x: mx + ux * half, y: my + uy * half });
    // Perpendicular in screen space, for the end ticks.
    const sdx = e2.x - e1.x;
    const sdy = e2.y - e1.y;
    const slen = Math.hypot(sdx, sdy) || 1;
    const nx = -sdy / slen;
    const ny = sdx / slen;
    const tick = 5;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = connectorDef("spring").stroke;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    line(e1, e2);
    ctx.setLineDash([]);
    for (const e of [e1, e2]) {
      line({ x: e.x - nx * tick, y: e.y - ny * tick }, { x: e.x + nx * tick, y: e.y + ny * tick });
    }
    ctx.restore();
  }

  /** A zigzag coil between two screen points (deterministic — no shimmer). */
  function strokeSpring(a: Vec2, b: Vec2): void {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    const coils = 6;
    const amp = 7;
    const lead = Math.min(12, len * 0.2);
    const startX = a.x + ux * lead;
    const startY = a.y + uy * lead;
    const endX = b.x - ux * lead;
    const endY = b.y - uy * lead;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(startX, startY);
    const steps = coils * 2;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const side = i % 2 === 0 ? 0 : i % 4 === 1 ? 1 : -1;
      ctx.lineTo(startX + (endX - startX) * t + nx * amp * side, startY + (endY - startY) * t + ny * amp * side);
    }
    ctx.lineTo(endX, endY);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  /** Crisp resize/rotate handles for the selected body (a UI overlay). */
  function drawHandles(body: Body, t: BodyTransform): void {
    const posed = { ...body, position: t.position, rotation: t.rotation };
    const center = worldToScreen(cam, t.position);
    ctx.save();
    for (const h of bodyHandles(posed)) {
      const p = worldToScreen(cam, bodyToWorld(posed, h.local));
      if (h.id === "rotate") {
        ctx.strokeStyle = SELECT_COLOR;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(center.x, center.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = h.id === "rotate" ? SELECT_COLOR : "#fff";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = h.id === "rotate" ? SELECT_COLOR : "#2b2b2b";
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Crisp dashed bounding box marking the selected body (a UI overlay). */
  function drawSelection(body: Body, t: BodyTransform): void {
    const props = body.props as Props;
    let hw = 0;
    let hh = 0;
    for (const s of def(body.type).shapes(props)) {
      if (s.kind === "circle") {
        hw = Math.max(hw, s.radius);
        hh = Math.max(hh, s.radius);
      } else {
        hw = Math.max(hw, s.halfWidth);
        hh = Math.max(hh, s.halfHeight);
      }
    }
    const pad = 6;
    const w = hw * 2 * cam.scale + pad * 2;
    const h = hh * 2 * cam.scale + pad * 2;
    const p = worldToScreen(cam, t.position);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-t.rotation);
    ctx.strokeStyle = SELECT_COLOR;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }

  // Body draw is keyed by `cacheId` so design bodies cache per-id (so each one
  // wobbles uniquely) but ephemerals can share a per-type cache key (issue 19)
  // and reuse one drawable across every copy of the same template shape.
  function drawBody(type: Body["type"], cacheId: string, props: Props, t: BodyTransform): void {
    const typeDef = def(type);
    const seed = hashSeed(cacheId);
    const p = worldToScreen(cam, t.position);

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-t.rotation); // screen y is flipped, so negate rotation
    typeDef.shapes(props).forEach((shape, i) => {
      const key = `${cacheId}:${i}:${shapeSig(shape)}`;
      const drawable = cached(key, () =>
        roughShape(shape, {
          fill: typeDef.style.fill,
          fillStyle: typeDef.style.fillStyle,
          stroke: INK,
          strokeWidth: 2,
          roughness: 1.4,
          seed,
          ...worldFillOptions(cam.scale),
        }),
      );
      rc.draw(drawable);
    });
    (typeDef.marks?.(props) ?? []).forEach((mark, i) => {
      const key = `${cacheId}:mark${i}`;
      const drawable = cached(key, () =>
        rc.generator.line(
          mark.a.x * cam.scale,
          -mark.a.y * cam.scale,
          mark.b.x * cam.scale,
          -mark.b.y * cam.scale,
          { stroke: INK, strokeWidth: 2, roughness: 1.2, seed },
        ),
      );
      rc.draw(drawable);
    });
    ctx.restore();
  }

  /**
   * Faint outline showing the aggregate bbox of a spawner's template items
   * (issue 19). Drawn in the spawner's world frame so it rotates with the
   * spawner. No outline if the template is empty.
   */
  function drawTemplateBbox(bodies: Body[], t: BodyTransform): void {
    const bbox = templateAggregateBbox(bodies);
    if (!bbox) return;
    const p = worldToScreen(cam, t.position);
    const w = bbox.hw * 2 * cam.scale;
    const h = bbox.hh * 2 * cam.scale;
    const ox = bbox.cx * cam.scale;
    const oy = -bbox.cy * cam.scale; // screen y is flipped
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-t.rotation);
    const key = `template-bbox:${w.toFixed(1)}x${h.toFixed(1)}@${ox.toFixed(1)},${oy.toFixed(1)}`;
    const drawable = cached(key, () =>
      rc.generator.rectangle(ox - w / 2, oy - h / 2, w, h, {
        stroke: "#5e7a9c",
        strokeWidth: 1,
        roughness: 1.8,
        seed: 19,
        fill: "#5e7a9c",
        fillStyle: "hachure",
        hachureGap: Math.max(4, FILL_GAP_WORLD * cam.scale * 1.5),
        fillWeight: Math.max(0.5, FILL_WEIGHT_WORLD * cam.scale * 0.7),
      }),
    );
    ctx.globalAlpha = 0.22;
    rc.draw(drawable);
    ctx.restore();
  }

  /** Build a cached Rough.js drawable for a shape, centered on the body origin. */
  function roughShape(shape: Shape, options: object): Drawable {
    if (shape.kind === "circle") {
      return rc.generator.circle(0, 0, shape.radius * cam.scale * 2, options);
    }
    const w = shape.halfWidth * 2 * cam.scale;
    const h = shape.halfHeight * 2 * cam.scale;
    // Rough.rectangle takes the top-left corner; offset so it's centered.
    return rc.generator.rectangle(-w / 2, -h / 2, w, h, options);
  }

  /**
   * Dot grid drawn on the canvas under the camera (not a CSS background), so it
   * pans and zooms pixel-for-pixel with the scene — graph paper the scene sits
   * on. Dots land on world multiples of GRID_SIZE (the snap grid). Skipped when
   * too dense to read (also bounds the dot count when zoomed far out).
   */
  function drawGrid(): void {
    const spacing = GRID_SIZE * cam.scale;
    if (spacing < GRID_MIN_SPACING_PX) return;
    // Visible world bounds (corners), expanded to whole grid steps.
    const tl = screenToWorld(cam, { x: 0, y: 0 });
    const br = screenToWorld(cam, { x: canvas.width, y: canvas.height });
    const i0 = Math.floor(Math.min(tl.x, br.x) / GRID_SIZE);
    const i1 = Math.ceil(Math.max(tl.x, br.x) / GRID_SIZE);
    const j0 = Math.floor(Math.min(tl.y, br.y) / GRID_SIZE);
    const j1 = Math.ceil(Math.max(tl.y, br.y) / GRID_SIZE);

    ctx.fillStyle = GRID_DOT;
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const p = worldToScreen(cam, { x: i * GRID_SIZE, y: j * GRID_SIZE });
        // A ~2px square reads the same as a dot at this size and is far cheaper
        // than an arc when there are thousands of them.
        ctx.rect(p.x - 1, p.y - 1, 2, 2);
      }
    }
    ctx.fill();
  }

  /**
   * The play-area boundary, drawn regardless of which walls collide, so the
   * room reads as a defined space and matches where placement is clamped.
   * World rect x ∈ [-w/2, w/2], y ∈ [0, h]; top-left in world is (-w/2, h).
   */
  function drawRoomFrame(size: { width: number; height: number }): void {
    const w = size.width;
    const h = size.height;
    const topLeft = worldToScreen(cam, { x: -w / 2, y: h });
    const drawable = cached(`frame:${w}x${h}`, () =>
      rc.generator.rectangle(topLeft.x, topLeft.y, w * cam.scale, h * cam.scale, {
        stroke: INK,
        strokeWidth: 2.5,
        roughness: 1.2,
        seed: 7,
      }),
    );
    rc.draw(drawable);
  }

  function drawWalls(
    walls: { floor: boolean; ceiling: boolean; left: boolean; right: boolean },
    size: { width: number; height: number },
  ): void {
    const w = size.width;
    const h = size.height;
    const t = WALL_THICKNESS;
    // Each wall as a world-space box [minX, maxY (top-left), width, height],
    // sitting just outside the play area to match sim's boundary colliders.
    if (walls.floor) drawWall("floor", -w / 2, 0, w, t);
    if (walls.ceiling) drawWall("ceiling", -w / 2, h + t, w, t);
    if (walls.left) drawWall("left", -w / 2 - t, h, t, h);
    if (walls.right) drawWall("right", w / 2, h, t, h);
  }

  function drawWall(key: string, minX: number, maxY: number, wM: number, hM: number): void {
    const topLeft = worldToScreen(cam, { x: minX, y: maxY });
    const drawable = cached(`wall:${key}:${wM}x${hM}`, () =>
      rc.generator.rectangle(topLeft.x, topLeft.y, wM * cam.scale, hM * cam.scale, {
        fill: FLOOR_FILL,
        fillStyle: "cross-hatch",
        stroke: INK,
        strokeWidth: 2,
        roughness: 1.4,
        seed: 1,
        ...worldFillOptions(cam.scale),
      }),
    );
    rc.draw(drawable);
  }
}

/** Signature capturing a shape's geometry, so the cache regenerates on change. */
function shapeSig(shape: Shape): string {
  return shape.kind === "circle"
    ? `c${shape.radius}`
    : `b${shape.halfWidth}x${shape.halfHeight}`;
}

/** Stable small integer seed from a body id, so each shape's wobble is fixed. */
function hashSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % 2 ** 31;
}

/**
 * Axis-aligned bounding box (in template-local coords) of a spawner's template
 * items, including each item's rotation. Returns null for an empty template.
 * The spawner draws this rotated with its own pose.
 */
function templateAggregateBbox(
  bodies: Body[],
): { cx: number; cy: number; hw: number; hh: number } | null {
  if (bodies.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const b of bodies) {
    let bhw = 0;
    let bhh = 0;
    for (const s of def(b.type).shapes(b.props as Props)) {
      if (s.kind === "circle") {
        bhw = Math.max(bhw, s.radius);
        bhh = Math.max(bhh, s.radius);
      } else {
        bhw = Math.max(bhw, s.halfWidth);
        bhh = Math.max(bhh, s.halfHeight);
      }
    }
    const c = Math.abs(Math.cos(b.rotation));
    const s = Math.abs(Math.sin(b.rotation));
    const ax = bhw * c + bhh * s;
    const ay = bhw * s + bhh * c;
    minX = Math.min(minX, b.position.x - ax);
    maxX = Math.max(maxX, b.position.x + ax);
    minY = Math.min(minY, b.position.y - ay);
    maxY = Math.max(maxY, b.position.y + ay);
  }
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    hw: (maxX - minX) / 2,
    hh: (maxY - minY) / 2,
  };
}
