import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Body, BodyTemplate, Vec2 } from "../scene/scene";
import { bodyTypes, def, type Props } from "../registry/registry";
import { fitCamera, type Camera } from "../renderer/camera";
import { createRenderer, type Renderer } from "../renderer/renderer";
import type { BodyTransform } from "../sim/sim";
import { BodyPreview } from "./BodyPreview";

/**
 * Small popover anchored to a selected spawner's glyph, showing a read-only
 * mini-canvas of its template plus a row of body-type tiles for authoring
 * (issue 19). Deliberately small — the size itself is a soft nudge toward
 * small templates. Open while a spawner is selected in design mode; hidden
 * while the spawner is being dragged or rotated (parent controls via
 * `hidden`).
 *
 * MVP author flow: click a tile to add that body type at template (0, 0);
 * click an item's × in the list to remove it. Drag-from-palette and
 * full in-canvas editing (drag, select) are a follow-up.
 */
const POPOVER_W = 220;
const POPOVER_H = 220;
const CANVAS_W = 200;
const CANVAS_H = 130;
/** Always-visible logical area in the mini-canvas (meters). Items can be
 *  smaller; this is the minimum framing so an empty template doesn't show as
 *  a void. */
const MIN_FRAME = 2.0;
/** Margin (px) between the popover and the spawner glyph. */
const ANCHOR_GAP = 14;

export function SpawnerPopover({
  template,
  anchor,
  hidden,
  onAdd,
  onRemove,
}: {
  template: BodyTemplate;
  /** Spawner glyph's screen position (computed from main camera). */
  anchor: { x: number; y: number };
  /** True while the spawner is being dragged/rotated; popover hides briefly. */
  hidden?: boolean;
  onAdd: (type: Body["type"], position: Vec2) => void;
  onRemove: (bodyId: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  // The popover's screen position is computed each layout to keep it on-screen.
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Position the popover next to the anchor with edge-flip.
  useLayoutEffect(() => {
    const margin = 8;
    const w = POPOVER_W;
    const h = POPOVER_H;
    let left = anchor.x + ANCHOR_GAP;
    let top = anchor.y - h / 2;
    if (left + w > window.innerWidth - margin) {
      left = anchor.x - ANCHOR_GAP - w;
    }
    if (left < margin) left = margin;
    if (top < margin) top = margin;
    if (top + h > window.innerHeight - margin) {
      top = window.innerHeight - margin - h;
    }
    setPos({ left, top });
  }, [anchor.x, anchor.y]);

  // Build the mini-renderer the first time the canvas mounts.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const cam = fitTemplate(template.bodies, CANVAS_W, CANVAS_H);
    cameraRef.current = cam;
    rendererRef.current = createRenderer(canvas, cam, { grid: false });
  }, []);

  // Re-fit + redraw whenever the template changes.
  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    const cam = fitTemplate(template.bodies, CANVAS_W, CANVAS_H);
    cameraRef.current = cam;
    r.setCamera(cam);
    // Draw the template as a "scene": one room, no walls, no grid. We pass the
    // template's bodies + connectors through a synthesised scene so the existing
    // renderer can iterate it unchanged.
    r.draw(
      synthScene(template),
      designTransforms(template.bodies),
      null,
      undefined,
    );
  }, [template]);

  if (hidden) return null;

  return (
    <div
      ref={popoverRef}
      className="spawner-popover"
      style={{ left: pos.left, top: pos.top, width: POPOVER_W }}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="spawner-popover-head">
        <span className="spawner-popover-title">Template</span>
      </div>
      <div className="spawner-popover-canvas-wrap">
        <canvas ref={canvasRef} className="spawner-popover-canvas" />
        {/* Crosshair + aim arrow drawn as CSS overlays so they sit on top of
            the canvas regardless of camera scale. */}
        <span className="spawner-popover-crosshair" aria-hidden />
        <span className="spawner-popover-aim" aria-hidden>→</span>
      </div>
      <div className="spawner-popover-add" role="toolbar" aria-label="Add to template">
        {bodyTypes()
          .filter((d) => d.type !== "spawner") // no nested spawners
          .map((d) => (
            <button
              key={d.type}
              type="button"
              className="spawner-popover-tile"
              title={`Add a ${d.label.toLowerCase()} to the template`}
              onClick={() => onAdd(d.type, { x: 0, y: 0 })}
            >
              <BodyPreview type={d.type} size={28} />
              <span>{d.label}</span>
            </button>
          ))}
      </div>
      {template.bodies.length > 0 && (
        <ul className="spawner-popover-items">
          {template.bodies.map((b) => (
            <li key={b.id} className="spawner-popover-item">
              <span className="spawner-popover-item-label">{def(b.type).label}</span>
              <button
                type="button"
                className="spawner-popover-item-del"
                aria-label={`Remove ${def(b.type).label}`}
                onClick={() => onRemove(b.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {template.bodies.length === 0 && (
        <div className="spawner-popover-empty">
          Place items here to emit on Play.
        </div>
      )}
    </div>
  );
}

/** Center the template in the mini-canvas at a comfortable scale. */
function fitTemplate(bodies: Body[], w: number, h: number): Camera {
  if (bodies.length === 0) {
    return fitCamera(MIN_FRAME, MIN_FRAME, w, h, 0.1);
  }
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
    const sn = Math.abs(Math.sin(b.rotation));
    const ax = bhw * c + bhh * sn;
    const ay = bhw * sn + bhh * c;
    minX = Math.min(minX, b.position.x - ax);
    maxX = Math.max(maxX, b.position.x + ax);
    minY = Math.min(minY, b.position.y - ay);
    maxY = Math.max(maxY, b.position.y + ay);
  }
  const bw = Math.max(MIN_FRAME, (maxX - minX) + 1.0);
  const bh = Math.max(MIN_FRAME, (maxY - minY) + 1.0);
  const cam = fitCamera(bw, bh, w, h, 0.1);
  // fitCamera assumes the room sits at y ∈ [0, h], centered on x = 0. Our
  // template is in spawner-local coords with origin at (0, 0). Recenter the
  // camera so (0, 0) is at the canvas middle instead of the room frame center.
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    scale: cam.scale,
    originX: w / 2 - cx * cam.scale,
    originY: h / 2 + cy * cam.scale,
  };
}

/** A throwaway scene wrapping the template, used to feed the existing Renderer. */
function synthScene(template: BodyTemplate) {
  return {
    version: 1,
    nextId: 1,
    rooms: [
      {
        settings: {
          gravity: { x: 0, y: 0 },
          walls: { floor: false, ceiling: false, left: false, right: false },
          size: { width: 0.1, height: 0.1 },
          snap: false,
        },
        bodies: template.bodies,
        connectors: template.connectors,
      },
    ],
  };
}

function designTransforms(bodies: Body[]): Map<string, BodyTransform> {
  const m = new Map<string, BodyTransform>();
  for (const b of bodies) m.set(b.id, { position: b.position, rotation: b.rotation });
  return m;
}
