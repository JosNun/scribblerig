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
import {
  applyResize,
  applyRotation,
  bodyAtPoint,
  handleAtPoint,
  type HandleId,
} from "../editor/editor";
import { screenToWorld, type Camera } from "../renderer/camera";
import { createRenderer, type Renderer } from "../renderer/renderer";
import type { BodyTransform } from "../sim/sim";

/**
 * Small popover anchored to a selected spawner's glyph, showing a mini editor
 * for its template (issue 19). Deliberately small — the size itself is a soft
 * nudge toward small templates. Open while a spawner is selected in design
 * mode; hidden while the spawner is being dragged or rotated (parent
 * controls via `hidden`).
 *
 * Interactions inside the popover canvas mirror the main canvas, scoped to
 * the template:
 *
 *  - **Click** picks a body and surfaces it through `onSelect` so the parent
 *    can show its props in the main right-panel. Clicking empty deselects.
 *  - **Drag a body** translates it (template-local positions are layout-only
 *    on emit, but they drive the popover-canvas layout).
 *  - **Drag a handle on the selected body** runs the same resize / rotate
 *    helpers as the main canvas (`applyResize` / `applyRotation`).
 *  - **Drag a body outside the popover canvas** arms remove-on-release; the
 *    wrap turns red to telegraph it.
 *
 * Cross-scope drops from the main palette: App.tsx queries
 * {@link SpawnerPopoverHandle.pointToTemplate} during the palette pointerup
 * to route hits into the template.
 */
const POPOVER_W = 220;
const POPOVER_H = 220;
const CANVAS_W = 200;
const CANVAS_H = 130;
/** Margin (px) between the popover and the spawner glyph. */
const ANCHOR_GAP = 14;
/** Pixel tolerance for grabbing a handle on the selected template body. */
const HANDLE_TOL_PX = 14;

export interface SpawnerPopoverHandle {
  /**
   * If `(clientX, clientY)` lies over the mini-canvas, return the
   * corresponding template-local coordinate (in spawner-local meters with
   * the emit point at the origin). Otherwise null. Used by the cross-scope
   * palette-drop detection in App.tsx.
   */
  pointToTemplate(clientX: number, clientY: number): Vec2 | null;
}

/** All the gesture flavors that can run inside the popover canvas. */
type DragState =
  | { kind: "move"; bodyId: string; offset: Vec2; outOfBounds: boolean }
  | { kind: "rotate"; bodyId: string; startBody: Body; outOfBounds: boolean }
  | { kind: "resize"; bodyId: string; handle: HandleId; startBody: Body; outOfBounds: boolean };

export const SpawnerPopover = forwardRef<SpawnerPopoverHandle, {
  template: BodyTemplate;
  /** Spawner glyph's screen position (computed from main camera). */
  anchor: { x: number; y: number };
  /** Pixels-per-meter of the main canvas. The popover renders the template at
   *  this exact scale so an item's preview size matches what comes out in the
   *  room — no more "items emerge bigger than they looked here". */
  mainScale: number;
  /** Currently-selected template body id, or null. Drives the selection
   *  chrome + handles drawn by the mini renderer. */
  selectedId: string | null;
  /** True while the spawner is being dragged/rotated; popover hides briefly. */
  hidden?: boolean;
  onSelect: (bodyId: string | null) => void;
  /** Called once on pointerdown when an in-popover gesture is about to start. */
  onBeginGesture: () => void;
  /** Generic patch entry point used by move / rotate / resize. */
  onUpdateBody: (bodyId: string, patch: Partial<Omit<Body, "id">>) => void;
  /** Called once on pointerup so the parent can commit one undo entry. */
  onCommitGesture: () => void;
  /** Called on pointerup-outside-canvas instead of onCommitGesture — reverts
   *  the in-flight drafts so the subsequent remove lands as a single undo
   *  entry (drag-out-to-remove). */
  onCancelGesture: () => void;
  onRemove: (bodyId: string) => void;
}>(function SpawnerPopoverInner(
  {
    template,
    anchor,
    mainScale,
    selectedId,
    hidden,
    onSelect,
    onBeginGesture,
    onUpdateBody,
    onCommitGesture,
    onCancelGesture,
    onRemove,
  },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  // `outOfBounds` tracks whether the pointer is currently outside the popover
  // canvas during a drag. While out, we hold the body's last in-bounds state
  // (extrapolated template coords would shoot the cue past the soft caps and
  // freeze the renderer). Pointerup-while-out triggers a remove
  // (drag-out-to-remove).
  const dragRef = useRef<DragState | null>(null);
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
    const cam = popoverCamera(mainScale, CANVAS_W, CANVAS_H);
    cameraRef.current = cam;
    rendererRef.current = createRenderer(canvas, cam, { grid: false, frame: false });
  }, []);

  // Mirror the main canvas's px/m exactly. Origin sits at the canvas center,
  // so template (0, 0) is the visible chute reference. Tracking the main
  // scale also means pan/zoom on the main canvas updates the preview, which
  // matters because App.tsx bumps on every applyCamera so this effect re-runs.
  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    const cam = popoverCamera(mainScale, CANVAS_W, CANVAS_H);
    cameraRef.current = cam;
    r.setCamera(cam);
    r.draw(synthScene(template), designTransforms(template.bodies), selectedId);
  }, [template, selectedId, mainScale]);

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
    const point = eventToTemplateInside(e);
    if (!point) return;
    const cam = cameraRef.current;
    const tol = cam ? HANDLE_TOL_PX / cam.scale : 0.2;

    // 1. If a body is already selected, check for a handle hit first — that
    //    way the rotate / resize handles win over picking through to the body
    //    beneath them (matches the main canvas).
    if (selectedId) {
      const sel = template.bodies.find((b) => b.id === selectedId);
      if (sel) {
        const handle = handleAtPoint(sel, point, tol);
        if (handle) {
          const kind = handle === "rotate" ? "rotate" : "resize";
          dragRef.current =
            kind === "rotate"
              ? { kind: "rotate", bodyId: sel.id, startBody: cloneStartBody(sel), outOfBounds: false }
              : { kind: "resize", bodyId: sel.id, handle, startBody: cloneStartBody(sel), outOfBounds: false };
          beginGesture(e);
          return;
        }
      }
    }

    // 2. Pick a body at the point and select it. If a body is picked, also
    //    arm a move drag so click-and-drag works in one gesture.
    const id = bodyAtPoint(synthScene(template), 0, point);
    if (id) {
      if (id !== selectedId) onSelect(id);
      const body = template.bodies.find((b) => b.id === id)!;
      dragRef.current = {
        kind: "move",
        bodyId: id,
        offset: { x: body.position.x - point.x, y: body.position.y - point.y },
        outOfBounds: false,
      };
      beginGesture(e);
      return;
    }

    // 3. Empty space → deselect within the template (popover stays open;
    //    the spawner itself remains selected in the main scope).
    if (selectedId) onSelect(null);
  };

  const beginGesture = (e: React.PointerEvent) => {
    setOutOfBounds(false);
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
    if (d.kind === "move") {
      onUpdateBody(d.bodyId, {
        position: { x: point.x + d.offset.x, y: point.y + d.offset.y },
      });
    } else if (d.kind === "rotate") {
      onUpdateBody(d.bodyId, { rotation: applyRotation(d.startBody, point) });
    } else {
      const result = applyResize(d.startBody, d.handle, point, e.altKey);
      onUpdateBody(d.bodyId, {
        position: result.position,
        props: { ...(d.startBody.props as Props), ...result.props },
      });
    }
  };

  const onCanvasPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    setOutOfBounds(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
    // Out-of-bounds applies only to moves — handles can't sensibly mean
    // "remove" (you'd never finish a resize that way). For move drags, ending
    // outside cancels the drafts and removes the body.
    if (d.kind === "move" && d.outOfBounds) {
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
      </div>
      {template.bodies.length > 0 ? (
        <ul className="spawner-popover-items">
          {template.bodies.map((b) => (
            <li
              key={b.id}
              className={`spawner-popover-item${b.id === selectedId ? " selected" : ""}`}
            >
              <button
                type="button"
                className="spawner-popover-item-label"
                onClick={() => onSelect(b.id)}
              >
                {def(b.type).label}
              </button>
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

/** Snapshot a body for use across an in-flight gesture. The editor helpers
 *  consume the body's *starting* state on every move call and return a fresh
 *  result, so the snapshot must be a deep enough copy that subsequent App.tsx
 *  patches don't mutate it under us. */
function cloneStartBody(b: Body): Body {
  return {
    ...b,
    position: { ...b.position },
    props: { ...b.props },
  };
}

/** A camera at the main canvas's px/m, centered on template (0, 0). The
 *  popover is intentionally small; if the template ever grew larger than
 *  what fits at this scale, items would extend past the edge — a soft
 *  reminder to keep templates compact. */
function popoverCamera(mainScale: number, viewW: number, viewH: number): Camera {
  return { scale: mainScale, originX: viewW / 2, originY: viewH / 2 };
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
