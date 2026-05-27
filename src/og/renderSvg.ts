/**
 * DOM-free SVG renderer for OpenGraph previews and shortlink thumbnails.
 *
 * Mirrors the canvas renderer's geometry decisions (`src/renderer/renderer.ts`)
 * — room frame, walls, body fills, connector glyphs — so an OG image is
 * recognisably the same drawing. The differences are deliberate:
 *
 * - **No DOM.** Imports only the bare `RoughGenerator` class (not `roughjs`'s
 *   main entry, which transitively pulls in canvas / svg helpers that touch
 *   browser globals). Output is a string.
 * - **Skipped overlays.** The dot grid (canvas-only), the motor's directional
 *   arrowhead, and the spring's rest-length marker are selection / playback
 *   overlays — irrelevant to a thumbnail. The motor's 270° arc still draws.
 * - **Fixed camera.** `fitCamera` frames the room inside the OG canvas; no
 *   pan/zoom and no live drag handles.
 *
 * See [og-share PRD](.scratch/og-share/PRD.md) and
 * [ADR-0010](docs/adr/0010-shortlinks-and-worker-og.md).
 */

import { RoughGenerator } from "roughjs/bin/generator";
import type { Drawable, OpSet, Options } from "roughjs/bin/core";
import type { Body, Connector, Endpoint, Scene, Vec2 } from "../scene/scene";
import { isBodyEndpoint } from "../scene/scene";
import { connectorDef, def, type Props, type Shape } from "../registry/registry";
import { fitCamera, worldToScreen, type Camera } from "../renderer/camera";
import { textLines, textSizeMeters } from "../registry/text-bounds";

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 630;
const ROOM_MARGIN = 1; // meters around the room when fitting

const INK = "#2b2b2b";
const PAPER = "#fdf6e3";
const FLOOR_FILL = "#9b8466";
// Mirrors the canvas renderer's text colour — slightly lighter than INK so
// labels read as ink-on-paper rather than competing with the body strokes.
const TEXT_INK = "#5a5a5a";

// Mirrors `renderer.ts`'s wall thickness so the OG image lines up with the sim.
const WALL_THICKNESS = 0.5;

// Hachure / cross-hatch tuning (mirrors renderer.ts: gap & weight expressed in
// world meters so the fill scales with the body, not the screen).
const FILL_GAP_WORLD = 0.15;
const FILL_WEIGHT_WORLD = 0.018;
const FILL_WEIGHT_MIN_PX = 0.6;

function worldFillOptions(scale: number): {
  hachureGap: number;
  fillWeight: number;
} {
  return {
    hachureGap: FILL_GAP_WORLD * scale,
    fillWeight: Math.max(FILL_WEIGHT_WORLD * scale, FILL_WEIGHT_MIN_PX),
  };
}

export interface RenderSvgOptions {
  width?: number;
  height?: number;
  /**
   * When false, skip the room frame and walls — bodies and connectors render
   * over `paper` (or transparency). Useful for the OG default where the
   * frame distracts from a tight content crop, and for the favicon where it
   * would dominate at 16–32px. Default true.
   */
  chrome?: boolean;
  /**
   * When false, omit the paper-coloured background rect — the SVG renders
   * with transparent background. Defaults to whatever `chrome` is, so the
   * favicon (chrome:false) gets transparency for free while the OG default
   * (chrome:false, paper:true) keeps the card background.
   */
  paper?: boolean;
  /**
   * World-meter margin around the room when fitting the camera. The default
   * leaves room for walls and "breathing space" around the scene; the
   * favicon overrides it to ~0 so the body fills the canvas.
   */
  margin?: number;
  /**
   * World-space rectangle to fill the canvas with, overriding the default
   * room-based fit. `width`/`height` should match the canvas aspect ratio
   * or the scene will stretch. Useful for cropping to the content bbox
   * instead of the whole room (the default OG asset uses this).
   */
  viewport?: { centerX: number; centerY: number; width: number; height: number };
  /**
   * Override the pixels-per-meter scale used for hachure / cross-hatch fills
   * (gap width, stroke weight). Default tracks `camera.scale`, which keeps
   * fill density consistent per-body across the canvas renderer. At extreme
   * zoom-ins (e.g. the OG default crops a small region to a 1200px canvas),
   * the world-scaled gaps grow to 20–30 px, revealing individual hatch lines
   * instead of reading as a fill — passing a smaller fillScale here restores
   * the dense look the canvas renderer shows at its typical zoom.
   */
  fillScale?: number;
}

/**
 * Render a scene to an SVG string. Always returns valid SVG — even an empty
 * or no-room scene produces a single paper-coloured background.
 */
export function renderSceneToSvg(scene: Scene, opts: RenderSvgOptions = {}): string {
  const width = opts.width ?? DEFAULT_WIDTH;
  const height = opts.height ?? DEFAULT_HEIGHT;
  const chrome = opts.chrome ?? true;
  const paper = opts.paper ?? chrome;
  const margin = opts.margin ?? ROOM_MARGIN;
  const room = scene.rooms[0];
  const gen = new RoughGenerator();
  const parts: string[] = [];

  parts.push(svgOpen(width, height));
  if (paper) parts.push(paperBackground(width, height));

  if (room) {
    const camera = opts.viewport
      ? viewportCamera(opts.viewport, width, height)
      : fitCamera(
          room.settings.size.width,
          room.settings.size.height,
          width,
          height,
          margin,
        );
    const fillScale = opts.fillScale ?? camera.scale;
    if (chrome) {
      drawRoomFrame(room.settings.size, camera, gen, parts);
      drawWalls(room.settings.walls, room.settings.size, camera, fillScale, gen, parts);
    }
    // Connectors paint under the bodies they join, matching the canvas
    // renderer order.
    for (const conn of room.connectors) {
      drawConnector(conn, room.bodies, camera, parts);
    }
    for (const body of room.bodies) {
      drawBody(body, camera, fillScale, gen, parts);
    }
  }

  parts.push("</svg>");
  return parts.join("");
}

// ---------- top-level chrome ---------------------------------------------

function svgOpen(width: number, height: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg"` +
    ` width="${width}" height="${height}"` +
    ` viewBox="0 0 ${width} ${height}">`
  );
}

function paperBackground(width: number, height: number): string {
  return `<rect x="0" y="0" width="${width}" height="${height}" fill="${PAPER}"/>`;
}

// ---------- room frame + walls -------------------------------------------

function drawRoomFrame(
  size: { width: number; height: number },
  camera: Camera,
  gen: RoughGenerator,
  parts: string[],
): void {
  const tl = worldToScreen(camera, { x: -size.width / 2, y: size.height });
  const drawable = gen.rectangle(
    tl.x,
    tl.y,
    size.width * camera.scale,
    size.height * camera.scale,
    { stroke: INK, strokeWidth: 2.5, roughness: 1.2, seed: 7 },
  );
  parts.push(drawableToSvg(gen, drawable));
}

function drawWalls(
  walls: { floor: boolean; ceiling: boolean; left: boolean; right: boolean },
  size: { width: number; height: number },
  camera: Camera,
  fillScale: number,
  gen: RoughGenerator,
  parts: string[],
): void {
  const w = size.width;
  const h = size.height;
  const t = WALL_THICKNESS;
  if (walls.floor) drawWall("floor", -w / 2, 0, w, t, camera, fillScale, gen, parts);
  if (walls.ceiling) drawWall("ceiling", -w / 2, h + t, w, t, camera, fillScale, gen, parts);
  if (walls.left) drawWall("left", -w / 2 - t, h, t, h, camera, fillScale, gen, parts);
  if (walls.right) drawWall("right", w / 2, h, t, h, camera, fillScale, gen, parts);
}

function drawWall(
  key: string,
  minX: number,
  maxY: number,
  wM: number,
  hM: number,
  camera: Camera,
  fillScale: number,
  gen: RoughGenerator,
  parts: string[],
): void {
  const tl = worldToScreen(camera, { x: minX, y: maxY });
  const drawable = gen.rectangle(tl.x, tl.y, wM * camera.scale, hM * camera.scale, {
    fill: FLOOR_FILL,
    fillStyle: "cross-hatch",
    stroke: INK,
    strokeWidth: 2,
    roughness: 1.4,
    seed: hashSeed(`wall-${key}`),
    ...worldFillOptions(fillScale),
  });
  parts.push(drawableToSvg(gen, drawable));
}

/**
 * Build a camera that fills the canvas with the given world-space rectangle.
 * No letterboxing — caller is responsible for matching the rectangle's aspect
 * to `canvasW`/`canvasH`.
 */
function viewportCamera(
  vp: { centerX: number; centerY: number; width: number; height: number },
  canvasW: number,
  canvasH: number,
): Camera {
  const scale = canvasW / vp.width;
  return {
    scale,
    originX: canvasW / 2 - vp.centerX * scale,
    originY: canvasH / 2 + vp.centerY * scale,
  };
}

// ---------- bodies --------------------------------------------------------

function drawBody(
  body: Body,
  camera: Camera,
  fillScale: number,
  gen: RoughGenerator,
  parts: string[],
): void {
  // Text bodies are bare ink (no Rough.js path, no fill) — same convention as
  // the canvas renderer. Emit an SVG <text> element and skip the shape/mark
  // pipeline entirely.
  if (body.type === "text") {
    drawTextBody(body, camera, parts);
    return;
  }
  const typeDef = def(body.type);
  const props = body.props as Props;
  const seed = hashSeed(body.id);
  const p = worldToScreen(camera, body.position);
  // Screen-y is flipped vs world-y, so a body's CCW world rotation is CW on
  // screen. The canvas renderer negates with `ctx.rotate(-t.rotation)`; SVG
  // rotation is in degrees and clockwise-positive in screen space.
  const rotDeg = (-body.rotation * 180) / Math.PI;
  parts.push(
    `<g transform="translate(${num(p.x)} ${num(p.y)}) rotate(${num(rotDeg)})">`,
  );

  for (const shape of typeDef.shapes(props)) {
    const drawable = roughShape(gen, shape, camera.scale, {
      fill: typeDef.style.fill,
      fillStyle: typeDef.style.fillStyle,
      stroke: INK,
      strokeWidth: 2,
      roughness: 1.4,
      seed,
      ...worldFillOptions(fillScale),
    });
    parts.push(drawableToSvg(gen, drawable));
  }

  for (const mark of typeDef.marks?.(props) ?? []) {
    const drawable = gen.line(
      mark.a.x * camera.scale,
      -mark.a.y * camera.scale,
      mark.b.x * camera.scale,
      -mark.b.y * camera.scale,
      { stroke: INK, strokeWidth: 2, roughness: 1.2, seed },
    );
    parts.push(drawableToSvg(gen, drawable));
  }

  parts.push("</g>");
}

/**
 * Text body → one `<text>` element per line, stacked vertically in the body's
 * local space. Font size scales with the camera so text reads at the same
 * apparent scale as every other body. Mirrors `renderer.ts`'s `drawText`:
 * Mynerve, center-aligned, lines spaced by `sizePx`.
 *
 * No font is bundled into the SVG — callers that need a guaranteed-resolved
 * font (e.g. resvg rasterising to PNG) pass it through their own font
 * pipeline; browsers serving the SVG inherit Mynerve from index.html.
 */
function drawTextBody(body: Body, camera: Camera, parts: string[]): void {
  const props = body.props as { text?: string; size?: number };
  const lines = textLines(props);
  if (lines.length === 0) return;
  const sizePx = Math.max(1, textSizeMeters(props) * camera.scale);
  const p = worldToScreen(camera, body.position);
  const rotDeg = (-body.rotation * 180) / Math.PI;
  parts.push(
    `<g transform="translate(${num(p.x)} ${num(p.y)}) rotate(${num(rotDeg)})">`,
  );
  const totalH = lines.length * sizePx;
  for (let i = 0; i < lines.length; i++) {
    const y = -totalH / 2 + sizePx * (i + 0.5);
    parts.push(
      `<text x="0" y="${num(y)}" font-family="Mynerve, sans-serif"` +
        ` font-size="${num(sizePx)}" fill="${TEXT_INK}"` +
        ` text-anchor="middle" dominant-baseline="middle">${escText(lines[i])}</text>`,
    );
  }
  parts.push("</g>");
}

/** Minimal XML text-content escaper for the chars that break parsing. */
function escText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function roughShape(
  gen: RoughGenerator,
  shape: Shape,
  scale: number,
  options: Options,
): Drawable {
  if (shape.kind === "circle") {
    return gen.circle(0, 0, shape.radius * scale * 2, options);
  }
  const w = shape.halfWidth * 2 * scale;
  const h = shape.halfHeight * 2 * scale;
  return gen.rectangle(-w / 2, -h / 2, w, h, options);
}

// ---------- connectors ----------------------------------------------------

function drawConnector(
  conn: Connector,
  bodies: Body[],
  camera: Camera,
  parts: string[],
): void {
  const aw = endpointWorld(conn.a, bodies);
  const bw = endpointWorld(conn.b, bodies);
  if (!aw || !bw) return;
  const pa = worldToScreen(camera, aw);
  const pb = worldToScreen(camera, bw);
  const stroke = connectorDef(conn.type).stroke;

  if (conn.type === "spring") {
    parts.push(springSvg(pa, pb, stroke));
    return;
  }

  // pin / weld / motor — single shared point (issue 24). The world endpoint
  // wins (fixed pivot); otherwise body `a`'s anchor is canonical.
  const pivotWorld = !isBodyEndpoint(conn.a) ? aw : !isBodyEndpoint(conn.b) ? bw : aw;
  const pivot = worldToScreen(camera, pivotWorld);

  if (conn.type === "weld") {
    parts.push(weldSvg(pivot, stroke));
  } else {
    parts.push(pinRingSvg(pivot, stroke));
    if (conn.type === "motor") {
      const ccw = conn.props.reverse !== true;
      parts.push(motorArcSvg(pivot, 11, ccw, stroke));
    }
  }
}

function endpointWorld(ep: Endpoint, bodies: Body[]): Vec2 | null {
  if (!isBodyEndpoint(ep)) return ep.world;
  const body = bodies.find((b) => b.id === ep.body);
  if (!body) return null;
  const c = Math.cos(body.rotation);
  const s = Math.sin(body.rotation);
  return {
    x: body.position.x + ep.local.x * c - ep.local.y * s,
    y: body.position.y + ep.local.x * s + ep.local.y * c,
  };
}

/**
 * A zigzag spring path in screen coords. Mirrors the canvas renderer's
 * `strokeSpring`. Deterministic — no randomness, so the shape is identical for
 * identical endpoints.
 */
function springSvg(a: Vec2, b: Vec2, stroke: string): string {
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
  const steps = coils * 2;
  const cmds: string[] = [`M ${num(a.x)} ${num(a.y)}`, `L ${num(startX)} ${num(startY)}`];
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const side = i % 2 === 0 ? 0 : i % 4 === 1 ? 1 : -1;
    cmds.push(
      `L ${num(startX + (endX - startX) * t + nx * amp * side)} ${num(startY + (endY - startY) * t + ny * amp * side)}`,
    );
  }
  cmds.push(`L ${num(endX)} ${num(endY)}`);
  cmds.push(`L ${num(b.x)} ${num(b.y)}`);
  return `<path d="${cmds.join(" ")}" stroke="${stroke}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
}

/** A small filled square at the weld point. */
function weldSvg(p: Vec2, fill: string): string {
  return `<rect x="${num(p.x - 4)}" y="${num(p.y - 4)}" width="8" height="8" fill="${fill}"/>`;
}

/** A white-filled ring at a pin / motor pivot. */
function pinRingSvg(p: Vec2, stroke: string): string {
  return (
    `<circle cx="${num(p.x)}" cy="${num(p.y)}" r="6"` +
    ` fill="#fff" stroke="${stroke}" stroke-width="2.5"/>`
  );
}

/**
 * The motor's 270° spin-indicator arc around the pivot. We deliberately drop
 * the directional arrowhead from the canvas renderer (issue 01 scope) since
 * a thumbnail doesn't need the live-direction cue.
 */
function motorArcSvg(p: Vec2, r: number, ccw: boolean, stroke: string): string {
  const start = -Math.PI / 2;
  const end = start + (ccw ? -1 : 1) * (1.5 * Math.PI);
  const startX = p.x + r * Math.cos(start);
  const startY = p.y + r * Math.sin(start);
  const endX = p.x + r * Math.cos(end);
  const endY = p.y + r * Math.sin(end);
  const largeArc = 1; // 270° is > 180°
  // SVG sweep flag: 1 = arc sweeps clockwise in screen coords. ccw==true means
  // we sweep counter-clockwise → sweep-flag 0.
  const sweep = ccw ? 0 : 1;
  return (
    `<path d="M ${num(startX)} ${num(startY)} A ${r} ${r} 0 ${largeArc} ${sweep} ${num(endX)} ${num(endY)}"` +
    ` stroke="${stroke}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`
  );
}

// ---------- Rough.js → SVG ------------------------------------------------

/**
 * Convert a Rough.js `Drawable` to its SVG `<path>` elements. Mirrors the
 * rendering rules in `src/ui/rough-react.tsx` so the OG image matches the
 * doodle controls visually.
 */
function drawableToSvg(gen: RoughGenerator, drawable: Drawable): string {
  const opts = drawable.options;
  const out: string[] = [];
  for (const set of drawable.sets) {
    const d = gen.opsToPath(set);
    if (set.type === "fillPath") {
      out.push(
        `<path d="${d}" fill="${opts.fill ?? "none"}" stroke="none" fill-rule="evenodd"/>`,
      );
    } else {
      // Hachure / cross-hatch sets ARE the fill — their stroke colour is the
      // body's fill colour, not its outline. Mirrors rough.js's own SVG
      // renderer (node_modules/roughjs/bin/svg.js#fillSketch). Without this,
      // the hatching paints in INK and the body reads as black-on-black.
      const sw =
        set.type === "fillSketch" ? (opts.fillWeight ?? 1) : (opts.strokeWidth ?? 1);
      const colour =
        set.type === "fillSketch" ? (opts.fill ?? INK) : (opts.stroke ?? INK);
      out.push(
        `<path d="${d}" stroke="${colour}" stroke-width="${sw}"` +
          ` fill="none" stroke-linecap="round"/>`,
      );
    }
  }
  return out.join("");
}

// ---------- helpers -------------------------------------------------------

/** Format a number with bounded precision so SVG output stays compact. */
function num(n: number): string {
  return n.toFixed(2);
}

/** Stable per-id seed so the wobble is deterministic for the same scene. */
function hashSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % 2 ** 31;
}

// `OpSet` is imported only for type completeness; the renderer never needs to
// distinguish op kinds beyond `set.type` checks above.
export type _OpSet = OpSet;
