import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { Body, BodyTemplate, BodyType, Connector, ConnectorType, Vec2 } from "../scene/scene";
import { isBodyEndpoint } from "../scene/scene";
import { connectorDef, type Props } from "../registry/registry";
import {
  applyResize,
  applyRotation,
  bodiesAtPoint,
  buildOverlapConnectors,
  connectorsAtPoint,
  handleAtPoint,
  type HandleId,
} from "../editor/editor";
import { screenToWorld, type Camera } from "../renderer/camera";
import { createRenderer, type DrawOverlay, type Renderer } from "../renderer/renderer";
import { snap as snapEndpoint, endpointOf, type SnapResult } from "../snapping/snapping";
import type { BodyTransform } from "../sim/sim";
import { DoodleBorder } from "./DoodleBorder";

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
/** Pixel tolerance for snapping a connector endpoint to a body anchor. */
const ANCHOR_TOL_PX = 20;
/** Pick tolerance (px) for tapping a connector line in the popover canvas. */
const CONNECTOR_PICK_TOL_PX = 10;

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
  /** Currently-armed connector tool, or null. When set, the popover canvas
   *  routes pointerdown / drag to connector creation against the template. */
  connectorTool: ConnectorType | null;
  /** In-flight palette drag preview (type + client position) or null. When
   *  the pointer is over the popover canvas, this is rendered as a
   *  translucent silhouette so the user sees where the drop will land. */
  ghost: { type: BodyType; x: number; y: number } | null;
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
  /** Add one or more connectors to the spawner's template (a spring drag
   *  produces one; a pin/weld/motor click can produce many — all-pairs
   *  pins, chained welds, or a motor's rotor-stator welds plus the motor). */
  onAddTemplateConnectors: (connectors: Array<Omit<Connector, "id">>) => void;
}>(function SpawnerPopoverInner(
  {
    template,
    anchor,
    mainScale,
    selectedId,
    connectorTool,
    ghost,
    hidden,
    onSelect,
    onBeginGesture,
    onUpdateBody,
    onCommitGesture,
    onCancelGesture,
    onRemove,
    onAddTemplateConnectors,
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
  // Tap-cycle state: when pointerdown lands on a stack of bodies + connectors
  // we record the full pick list and which one we just selected. If pointerup
  // happens without a real drag and the same id was already selected, we
  // advance to the next layer in the stack — mirrors the canvas behaviour.
  const selectDownRef = useRef<
    | { picks: string[]; id: string; wasOnPick: boolean; x: number; y: number }
    | null
  >(null);
  // In-flight spring-drag: the captured starting endpoint and the latest
  // endpoint under the pointer. Drives the rubber-band overlay and feeds the
  // final connector on pointerup.
  const [springDrag, setSpringDrag] = useState<{ start: SnapResult; end: SnapResult } | null>(null);
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

  // Update the popover camera ONLY when mainScale changes. setCamera also
  // clears the rough.js drawable cache, so calling it on every ghost/spring
  // tick would regenerate every cached drawable per pointer event — fine on
  // desktop, jank on mobile.
  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    const cam = popoverCamera(mainScale, CANVAS_W, CANVAS_H);
    cameraRef.current = cam;
    r.setCamera(cam);
  }, [mainScale]);

  // Redraw on every template / selection / overlay change. No setCamera here
  // — the cache stays warm across ghost moves and spring drags.
  useEffect(() => {
    const r = rendererRef.current;
    const cam = cameraRef.current;
    if (!r || !cam) return;

    // Build the overlay: optional spring rubber-band + optional ghost preview
    // when the palette ghost is hovering over the popover canvas.
    let overlay: DrawOverlay | undefined = springDrag
      ? {
          preview: { a: springDrag.start.world, b: springDrag.end.world, type: "spring" },
          snap: springDrag.end.world,
        }
      : undefined;
    if (ghost) {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        if (
          ghost.x >= rect.left && ghost.x <= rect.right &&
          ghost.y >= rect.top && ghost.y <= rect.bottom
        ) {
          const pos = screenToWorld(cam, { x: ghost.x - rect.left, y: ghost.y - rect.top });
          overlay = { ...(overlay ?? {}), ghost: { type: ghost.type, position: pos } };
        }
      }
    }
    r.draw(synthScene(template), designTransforms(template.bodies), selectedId, overlay);
  }, [template, selectedId, springDrag, ghost, mainScale]);

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
    const anchorTol = cam ? ANCHOR_TOL_PX / cam.scale : 0.3;

    // 0. Connector tool armed → route this gesture to connector creation.
    //    Spring is a drag-to-draw; pin/weld/motor place at the click point.
    //    Templates only ever connect two (or more) bodies — connectors
    //    anchored to a world point are silently dropped at emit, so we
    //    refuse to author them here.
    if (connectorTool) {
      const synth = synthScene(template);
      if (connectorTool === "spring") {
        const startSnap = snapEndpoint(synth, 0, point, anchorTol);
        if (startSnap.kind === "world") {
          // Spring must originate on a body; empty space is a no-op.
          e.preventDefault();
          return;
        }
        setSpringDrag({ start: startSnap, end: startSnap });
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* no-op */
        }
        e.preventDefault();
        return;
      }
      // Pin / weld / motor: need at least two overlapping bodies. The
      // first entry that buildOverlapConnectors would return for a single
      // body would carry a world endpoint, which we forbid in templates.
      const conns = buildOverlapConnectors(connectorTool, point, template.bodies)
        .filter((c) => isBodyEndpoint(c.a) && isBodyEndpoint(c.b));
      if (conns.length > 0) onAddTemplateConnectors(conns);
      e.preventDefault();
      return;
    }

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

    // 2. Build the full pick stack — every body geometry at the point,
    //    topmost-first, then every connector line within tolerance. A click
    //    cycles through them on pointerup; if the current selection is
    //    already in the stack we *keep* it (so the drag handles the
    //    already-selected body) and the next tap-without-drag advances.
    const synth = synthScene(template);
    const connTol = cam ? CONNECTOR_PICK_TOL_PX / cam.scale : 0.2;
    const picks = [
      ...bodiesAtPoint(synth, 0, point),
      ...connectorsAtPoint(synth, 0, point, connTol),
    ];
    if (picks.length > 0) {
      const wasOnPick = !!selectedId && picks.includes(selectedId);
      const target = wasOnPick ? selectedId! : picks[0];
      if (target !== selectedId) onSelect(target);
      selectDownRef.current = { picks, id: target, wasOnPick, x: e.clientX, y: e.clientY };
      const body = template.bodies.find((b) => b.id === target);
      if (body) {
        // Arm a move drag — connectors don't have a drag gesture but bodies
        // do, so the same gesture either drags-to-move or, if it ends as a
        // click, cycles via the pointerup branch.
        dragRef.current = {
          kind: "move",
          bodyId: target,
          offset: { x: body.position.x - point.x, y: body.position.y - point.y },
          outOfBounds: false,
        };
        beginGesture(e);
      }
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
    if (springDrag) {
      const point = eventToTemplateInside(e);
      if (!point) return;
      const cam = cameraRef.current;
      const anchorTol = cam ? ANCHOR_TOL_PX / cam.scale : 0.3;
      const endSnap = snapEndpoint(synthScene(template), 0, point, anchorTol);
      setSpringDrag({ start: springDrag.start, end: endSnap });
      return;
    }
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
    if (springDrag) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* no-op */
      }
      const start = springDrag.start;
      const end = springDrag.end;
      setSpringDrag(null);
      const epA = endpointOf(start);
      const epB = endpointOf(end);
      // Both endpoints must be body-anchored: templates never carry
      // world-endpoint connectors (they'd be skipped at emit).
      if (!isBodyEndpoint(epA) || !isBodyEndpoint(epB)) return;
      const sameBody = epA.body === epB.body;
      const gap = Math.hypot(start.world.x - end.world.x, start.world.y - end.world.y);
      // Match the main-canvas finishConnector guards: no self-spring, no
      // zero-length spring.
      if (sameBody || gap < 0.05) return;
      onAddTemplateConnectors([
        {
          type: "spring",
          a: epA,
          b: epB,
          props: { ...connectorDef("spring").defaults, restLength: Math.max(0.1, gap) },
        },
      ]);
      return;
    }
    const d = dragRef.current;
    if (d) {
      dragRef.current = null;
      setOutOfBounds(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* no-op */
      }
      // Out-of-bounds applies only to moves — handles can't sensibly mean
      // "remove" (you'd never finish a resize that way). For move drags,
      // ending outside cancels the drafts and removes the body.
      if (d.kind === "move" && d.outOfBounds) {
        onCancelGesture();
        onRemove(d.bodyId);
      } else {
        onCommitGesture();
      }
    }
    // Cycle-on-click: if a real move didn't happen (release < 4 px from
    // press) and the press landed on the already-selected item, advance to
    // the next layer in the stacked pick. Mirrors the canvas behaviour so
    // overlapping bodies / connectors in a template can be tapped through.
    const sd = selectDownRef.current;
    selectDownRef.current = null;
    if (sd && sd.wasOnPick && sd.picks.length > 1) {
      const moved = Math.hypot(e.clientX - sd.x, e.clientY - sd.y) > 4;
      if (!moved) {
        const i = sd.picks.indexOf(sd.id);
        onSelect(sd.picks[(i + 1) % sd.picks.length]);
      }
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
      <DoodleBorder strokeWidth={2.5} />
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
      {template.bodies.length === 0 && (
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
