import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { Body, BodyTemplate, Vec2 } from "../scene/scene";
import { def, type Props } from "../registry/registry";
import { bodyAtPoint } from "../editor/editor";
import { fitCamera, screenToWorld, type Camera } from "../renderer/camera";
import { createRenderer, type Renderer } from "../renderer/renderer";
import type { BodyTransform } from "../sim/sim";

/**
 * Small popover anchored to a selected spawner's glyph, showing a read-only
 * mini-canvas of its template (issue 19). Deliberately small — the size
 * itself is a soft nudge toward small templates. Open while a spawner is
 * selected in design mode; hidden while the spawner is being dragged or
 * rotated (parent controls via `hidden`).
 *
 * Two interaction surfaces beyond a static view:
 *
 *  - **Cross-scope drops from the main palette.** App.tsx queries
 *    {@link SpawnerPopoverHandle.pointToTemplate} during the palette
 *    pointerup to test if the pointer is over this popover's canvas; a hit
 *    routes the new body into the template instead of the scene.
 *  - **In-popover drag-to-move.** Pointerdown on a template body starts a
 *    drag; the parent receives `onBeginGesture` / `onMoveBody` / `onCommitGesture`
 *    so the move lands as one undo entry, the same lifecycle that root-scene
 *    body drags use.
 *
 *  Items are removed via the × in the list below the canvas. Click-to-select
 *  with editable props inside the popover is a follow-up.
 */
const POPOVER_W = 220;
const POPOVER_H = 220;
const CANVAS_W = 200;
const CANVAS_H = 130;
/** Minimum framed area (meters) in the mini canvas — keeps an empty template
 *  from showing as a void and gives the crosshair some breathing room. */
const MIN_FRAME = 2.0;
/** Margin (px) between the popover and the spawner glyph. */
const ANCHOR_GAP = 14;

export interface SpawnerPopoverHandle {
  /**
   * If `(clientX, clientY)` lies over the mini-canvas, return the
   * corresponding template-local coordinate (in spawner-local meters with
   * the emit point at the origin). Otherwise null. Used by the cross-scope
   * palette-drop detection in App.tsx.
   */
  pointToTemplate(clientX: number, clientY: number): Vec2 | null;
}

export const SpawnerPopover = forwardRef<SpawnerPopoverHandle, {
  template: BodyTemplate;
  /** Spawner glyph's screen position (computed from main camera). */
  anchor: { x: number; y: number };
  /** Spawner's world rotation (radians); the popover's aim arrow tracks it. */
  rotation: number;
  /** True while the spawner is being dragged/rotated; popover hides briefly. */
  hidden?: boolean;
  /** Called once on pointerdown when an in-popover drag is about to start. */
  onBeginGesture: () => void;
  /** Called on every drag move with the new template-local position. */
  onMoveBody: (bodyId: string, position: Vec2) => void;
  /** Called once on pointerup so the parent can commit one undo entry. */
  onCommitGesture: () => void;
  /** Called on pointerup-outside-canvas instead of onCommitGesture — reverts
   *  the in-flight move drafts so the subsequent remove lands as a single
   *  undo entry (drag-out-to-remove). */
  onCancelGesture: () => void;
  onRemove: (bodyId: string) => void;
}>(function SpawnerPopoverInner(
  { template, anchor, rotation, hidden, onBeginGesture, onMoveBody, onCommitGesture, onCancelGesture, onRemove },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  // `outOfBounds` tracks whether the pointer is currently outside the popover
  // canvas during a drag. While out, we hold the body at its last in-bounds
  // position (extrapolated template coords would shoot the aggregate-bbox cue
  // to millions of pixels, freezing the Rough.js hachure pass on the main
  // canvas). Pointerup-while-out triggers a remove (drag-out-to-remove).
  const dragRef = useRef<{ bodyId: string; offset: Vec2; outOfBounds: boolean } | null>(null);
  const [outOfBounds, setOutOfBounds] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  // Position the popover next to the anchor with edge-flip.
  useLayoutEffect(() => {
    const margin = 8;
    const w = POPOVER_W;
    const h = POPOVER_H;
    let left = anchor.x + ANCHOR_GAP;
    let top = anchor.y - h / 2;
    if (left + w > window.innerWidth - margin) left = anchor.x - ANCHOR_GAP - w;
    if (left < margin) left = margin;
    if (top < margin) top = margin;
    if (top + h > window.innerHeight - margin) top = window.innerHeight - margin - h;
    setPos({ left, top });
  }, [anchor.x, anchor.y]);

  // Build the mini-renderer on first mount.
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
    r.draw(synthScene(template), designTransforms(template.bodies), null, undefined);
  }, [template]);

  // Expose the screen→template conversion to App.tsx so cross-scope palette
  // drops can ask "is this pointer over me, and where in the template?".
  useImperativeHandle(
    ref,
    (): SpawnerPopoverHandle => ({
      pointToTemplate: (clientX, clientY) => {
        const canvas = canvasRef.current;
        const cam = cameraRef.current;
        if (!canvas || !cam) return null;
        const rect = canvas.getBoundingClientRect();
        if (
          clientX < rect.left || clientX > rect.right ||
          clientY < rect.top || clientY > rect.bottom
        ) {
          return null;
        }
        return screenToWorld(cam, { x: clientX - rect.left, y: clientY - rect.top });
      },
    }),
    [],
  );

  // Template-local point under a pointer, OR null if the pointer is outside
  // the popover canvas (the drag-pause / drag-out-to-remove signal).
  const eventToTemplateInside = (e: React.PointerEvent): Vec2 | null => {
    const canvas = canvasRef.current;
    const cam = cameraRef.current;
    if (!canvas || !cam) return null;
    const rect = canvas.getBoundingClientRect();
    if (
      e.clientX < rect.left || e.clientX > rect.right ||
      e.clientY < rect.top || e.clientY > rect.bottom
    ) {
      return null;
    }
    return screenToWorld(cam, { x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const onCanvasPointerDown = (e: React.PointerEvent) => {
    if (template.bodies.length === 0) return;
    const point = eventToTemplateInside(e);
    if (!point) return;
    const id = bodyAtPoint(synthScene(template), 0, point);
    if (!id) return;
    const body = template.bodies.find((b) => b.id === id)!;
    dragRef.current = {
      bodyId: id,
      offset: { x: body.position.x - point.x, y: body.position.y - point.y },
      outOfBounds: false,
    };
    setOutOfBounds(false);
    // Pointer capture can throw if the pointer id is unknown (the element
    // was just remounted, or the event was synthesized in a test). Guard so
    // an exception here doesn't abort the rest of the gesture setup —
    // onBeginGesture must run for the cancel/commit lifecycle to work.
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
    e.preventDefault();
    onBeginGesture();
  };

  const onCanvasPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const point = eventToTemplateInside(e);
    if (!point) {
      // Outside the canvas: hold the body's last in-bounds position and arm
      // remove-on-release. Updating with extrapolated coords here was what
      // froze the app — the aggregate-bbox cue on the main canvas would try
      // to draw a million-pixel hachured rectangle every frame.
      if (!d.outOfBounds) {
        d.outOfBounds = true;
        setOutOfBounds(true);
      }
      return;
    }
    if (d.outOfBounds) {
      d.outOfBounds = false;
      setOutOfBounds(false);
    }
    onMoveBody(d.bodyId, { x: point.x + d.offset.x, y: point.y + d.offset.y });
  };

  const onCanvasPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    setOutOfBounds(false);
    // Same guarded release as the capture call above — a thrown exception
    // here would short-circuit the cancel/commit branch below.
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
    if (d.outOfBounds) {
      // Discard the move drafts, then remove — the whole gesture lands as a
      // single "removed body" undo entry rather than "moved a bunch + removed".
      onCancelGesture();
      onRemove(d.bodyId);
    } else {
      onCommitGesture();
    }
  };

  // Toggle visibility via CSS rather than unmounting — keeps the canvas DOM
  // node and the renderer/camera refs alive across the drag-hide cycle, so
  // the next show doesn't need to rebuild the renderer or re-fit the camera.
  return (
    <div
      className="spawner-popover"
      style={{
        left: pos.left,
        top: pos.top,
        width: POPOVER_W,
        visibility: hidden ? "hidden" : "visible",
        pointerEvents: hidden ? "none" : "auto",
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="spawner-popover-head">
        <span className="spawner-popover-title">Template</span>
      </div>
      <div
        className={`spawner-popover-canvas-wrap${outOfBounds ? " removing" : ""}`}
      >
        <canvas
          ref={canvasRef}
          className="spawner-popover-canvas"
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerCancel={onCanvasPointerUp}
        />
        {/* Crosshair at the emit origin + aim arrow that rotates with the
            spawner's world facing, so the launch direction is unambiguous in
            the popover regardless of how the glyph is oriented. */}
        <span className="spawner-popover-crosshair" aria-hidden />
        <span
          className="spawner-popover-aim"
          aria-hidden
          style={{ transform: `translateY(-50%) rotate(${-rotation}rad)` }}
        >
          →
        </span>
      </div>
      {template.bodies.length > 0 ? (
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
      ) : (
        <div className="spawner-popover-empty">
          Drag a shape from the palette onto this canvas to add to the template.
        </div>
      )}
    </div>
  );
});

/** Center the template in the mini-canvas at a comfortable scale. */
function fitTemplate(bodies: Body[], w: number, h: number): Camera {
  if (bodies.length === 0) {
    return centeredCamera(MIN_FRAME, MIN_FRAME, w, h);
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
  // Always include the origin and add a margin so newly-added items aren't
  // glued to the edge as the frame grows.
  const halfExtent = Math.max(
    MIN_FRAME / 2,
    Math.abs(minX), Math.abs(maxX), Math.abs(minY), Math.abs(maxY),
  ) + 0.5;
  return centeredCamera(halfExtent * 2, halfExtent * 2, w, h);
}

/** A camera centered on template (0, 0) framing a `fw × fh` meter area. */
function centeredCamera(fw: number, fh: number, viewW: number, viewH: number): Camera {
  // Reuse fitCamera's scale math (it'd put the room frame's center off because
  // it assumes y ∈ [0, fh]), then override originX/originY to put template
  // (0, 0) at the canvas middle.
  const cam = fitCamera(fw, fh, viewW, viewH, 0.1);
  return { scale: cam.scale, originX: viewW / 2, originY: viewH / 2 };
}

/** A throwaway scene wrapping the template, used to feed the existing Renderer
 *  and the editor's `bodyAtPoint` picker. */
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
