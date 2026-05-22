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
import type { BodyTransform } from "../sim/sim";
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
  ): void;
  /** Swap the camera (e.g. on window resize). Invalidates the drawable cache. */
  setCamera(camera: Camera): void;
}

const SELECT_COLOR = "#1f7a3d";

export function createRenderer(
  canvas: HTMLCanvasElement,
  initialCamera: Camera,
): Renderer {
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
    draw(scene, transforms, selectedId, overlay) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const room = scene.rooms[0];

      drawGrid();
      drawRoomFrame(room.settings.size);
      drawWalls(room.settings.walls, room.settings.size);

      // Connectors under the bodies they join.
      for (const conn of room.connectors) drawConnector(conn, transforms, conn.id === selectedId);

      for (const body of room.bodies) {
        const t = transforms.get(body.id);
        if (!t) continue;
        drawBody(body, t);
        if (body.id === selectedId) {
          drawSelection(body, t);
          drawHandles(body, t);
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

  function drawConnector(conn: Connector, transforms: Map<string, BodyTransform>, selected: boolean): void {
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
      strokeSpring(pa, pb);
    } else if (conn.type === "weld") {
      line(pa, pb);
      square(pa, 4);
      square(pb, 4);
    } else {
      ctx.globalAlpha = 0.5;
      line(pa, pb);
      ctx.globalAlpha = 1;
      const pivotWorld = !isBodyEndpoint(conn.a) ? aw : !isBodyEndpoint(conn.b) ? bw : aw;
      ring(worldToScreen(cam, pivotWorld), 6);
    }
    // Draggable endpoint handles when selected.
    if (selected) {
      ctx.fillStyle = SELECT_COLOR;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      for (const p of [pa, pb]) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
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

  function drawBody(body: Body, t: BodyTransform): void {
    const typeDef = def(body.type);
    const props = body.props as Props;
    const seed = hashSeed(body.id);
    const p = worldToScreen(cam, t.position);

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-t.rotation); // screen y is flipped, so negate rotation
    typeDef.shapes(props).forEach((shape, i) => {
      const key = `${body.id}:${i}:${shapeSig(shape)}`;
      const drawable = cached(key, () =>
        roughShape(shape, {
          fill: typeDef.style.fill,
          fillStyle: typeDef.style.fillStyle,
          stroke: INK,
          strokeWidth: 2,
          roughness: 1.4,
          seed,
        }),
      );
      rc.draw(drawable);
    });
    (typeDef.marks?.(props) ?? []).forEach((mark, i) => {
      const key = `${body.id}:mark${i}`;
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
