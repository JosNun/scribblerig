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
import type { Body, Scene } from "../scene/scene";
import type { BodyTransform } from "../sim/sim";
import { def, type Props, type Shape } from "../registry/registry";
import { bodyHandles, bodyToWorld } from "../editor/editor";
import { type Camera, worldToScreen } from "./camera";

const WALL_THICKNESS = 0.5; // meters; mirrors the floor collider in sim

const INK = "#2b2b2b";
const FLOOR_FILL = "#9b8466";

export interface Renderer {
  draw(
    scene: Scene,
    transforms: Map<string, BodyTransform>,
    selectedId?: string | null,
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
    draw(scene, transforms, selectedId) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const room = scene.rooms[0];

      if (room.settings.walls.floor) drawFloor(room.settings.size.width);

      for (const body of room.bodies) {
        const t = transforms.get(body.id);
        if (!t) continue;
        drawBody(body, t);
        if (body.id === selectedId) {
          drawSelection(body, t);
          drawHandles(body, t);
        }
      }
    },
  };

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

  function drawFloor(width: number): void {
    const topLeft = worldToScreen(cam, { x: -width / 2, y: 0 });
    const w = width * cam.scale;
    const h = WALL_THICKNESS * cam.scale;
    const drawable = cached(`floor:${width}`, () =>
      rc.generator.rectangle(topLeft.x, topLeft.y, w, h, {
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
