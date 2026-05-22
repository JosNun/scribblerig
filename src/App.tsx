import { useEffect, useRef, useState } from "react";
import { Drawer } from "vaul";
import {
  addBody,
  updateBody,
  updateRoomSettings,
  addConnector,
  removeConnector,
  updateConnector,
  removeBodyAndConnectors,
  isBodyEndpoint,
  type Scene,
  type BodyType,
  type ConnectorType,
  type RoomSettings,
} from "./scene/scene";
import {
  bootSession,
  hasSharedScene,
  saveSession,
  shareUrl,
  listSessions,
  loadSession,
  adoptSession,
  newSession,
  deleteSession,
  renameSession,
} from "./share/storage";
import { type SessionMeta } from "./share/sessions";
import { createClock, type Clock, type ClockState } from "./clock/clock";
import { initSim, compile, type SimWorld, type BodyTransform } from "./sim/sim";
import { type Camera, fitCamera, screenToWorld, zoomAt, panBy } from "./renderer/camera";
import { createRenderer, type Renderer, type DrawOverlay } from "./renderer/renderer";
import {
  bodyTypes,
  makeBody,
  connectorTypes,
  connectorDef,
  makeConnector,
  def,
  type Props,
} from "./registry/registry";
import {
  snapToGrid,
  bodiesAtPoint,
  bodyToLocal,
  connectorsAtPoint,
  endpointWorld,
  handleAtPoint,
  applyResize,
  applyRotation,
  clampInsideRoom,
  type HandleId,
} from "./editor/editor";
import { snap as snapEndpoint, endpointOf, type SnapResult } from "./snapping/snapping";
import { BodyPreview } from "./ui/BodyPreview";
import { Icon } from "./ui/Icon";
import { PropertyPanel } from "./ui/PropertyPanel";
import { RoomSettingsPanel } from "./ui/RoomSettingsPanel";

/** Coarse pointers (touch) get larger hit tolerances so fingers can grab handles. */
const COARSE = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
const TOUCH_BOOST = COARSE ? 1.8 : 1;

/** Click tolerance (px) for grabbing a resize/rotate handle. */
const HANDLE_PX = 12 * TOUCH_BOOST;
/** Snap radius (px) for binding a connector endpoint to a named anchor. */
const ANCHOR_PX = 20 * TOUCH_BOOST;
/** Pick tolerance (px) for selecting a connector by its line. */
const CONNECTOR_PX = 10 * TOUCH_BOOST;
/** Grab tolerance (px) for a selected connector's endpoint handle. */
const ENDPOINT_PX = 12 * TOUCH_BOOST;

const FIXED_DT = 1 / 60;
const GRID_SIZE = 0.5; // meters
/** Framing margin (meters) around the room so the boundary walls stay visible. */
const VIEW_MARGIN = 1.2;
/** Zoom limits (pixels per meter) for wheel/pinch zooming. */
const MIN_SCALE = 8;
const MAX_SCALE = 600;
/** Drawer snap points: peek (handle + palette strip) and a near-full open. */
const SNAP_PEEK = "150px";
const SNAP_FULL = 0.85;

function capture(el: Element | null, pointerId: number) {
  try {
    el?.setPointerCapture(pointerId);
  } catch {
    /* no-op */
  }
}

/** Compact "time since" label for the builds list (e.g. "5m ago"). */
function relTime(t: number): string {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** Transforms straight from the design graph, for drawing in build mode. */
function designTransforms(scene: Scene): Map<string, BodyTransform> {
  const m = new Map<string, BodyTransform>();
  for (const b of scene.rooms[0].bodies) {
    m.set(b.id, { position: b.position, rotation: b.rotation });
  }
  return m;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const cameraRef = useRef<Camera>(
    fitCamera(16, 9, window.innerWidth, window.innerHeight, VIEW_MARGIN),
  );
  const clockRef = useRef<Clock>(createClock(FIXED_DT));
  const worldRef = useRef<SimWorld | null>(null);

  // Boot this tab's session once: shared link → own persisted session → a lazy
  // fork of the most-recent build (see share/storage). `useState` lazy init runs
  // bootSession exactly once.
  const [boot] = useState(bootSession);
  const sessionIdRef = useRef<string>(boot.id);
  const sceneRef = useRef<Scene>(boot.scene);
  const selectedRef = useRef<string | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const handleDragRef = useRef<HandleId | null>(null);
  // For click-cycling stacked objects: the pick list captured on pointerdown,
  // what was selected, whether it was already selected, and the press point (to
  // tell a click from a drag on pointerup).
  const selectDownRef = useRef<
    { picks: string[]; id: string; wasOnPick: boolean; x: number; y: number } | null
  >(null);
  const placingRef = useRef<BodyType | null>(null);
  const paletteOriginRef = useRef<DOMRect | null>(null);
  const draggedOffRef = useRef(false);
  // Connector drawing: the armed type, the in-progress start endpoint, and the
  // transient overlay (preview line + snap highlight) the render loop draws.
  const connectorToolRef = useRef<ConnectorType | null>(null);
  const connectorStartRef = useRef<SnapResult | null>(null);
  const overlayRef = useRef<DrawOverlay | null>(null);
  // Dragging an endpoint of an already-selected connector.
  const endpointDragRef = useRef<{ id: string; end: "a" | "b" } | null>(null);
  // Active touch points (canvas-local px) and the in-progress two-finger
  // pan/pinch gesture; once the user adjusts the view we stop auto-refitting.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gestureRef = useRef<{ mid: { x: number; y: number }; dist: number } | null>(null);
  const viewAdjustedRef = useRef(false);
  // Desktop drag-to-pan with the middle mouse button (last canvas px).
  const panDragRef = useRef<{ x: number; y: number } | null>(null);
  // Palette collapse driven by the drawer's live position (see trackExpand).
  const stripRef = useRef<HTMLDivElement>(null);
  const expandRunningRef = useRef(false);
  const expandReleaseRef = useRef<number | null>(null);

  const [ready, setReady] = useState(false);
  const [state, setState] = useState<ClockState>("build");
  const [selected, setSelected] = useState<string | null>(null);
  const [connectorTool, setConnectorTool] = useState<ConnectorType | null>(null);
  const [ghost, setGhost] = useState<{ type: BodyType; x: number; y: number; droppable: boolean } | null>(null);
  const [revision, setRevision] = useState(0);
  const bump = () => setRevision((r) => r + 1);
  const [copied, setCopied] = useState(false);
  // Builds list (saved sessions): null when closed, the snapshot list when open.
  const [builds, setBuilds] = useState<SessionMeta[] | null>(null);

  // On narrow screens the panels collapse into a bottom sheet.
  const [mobile, setMobile] = useState(() =>
    typeof matchMedia === "function" ? matchMedia("(max-width: 720px)").matches : false,
  );
  // The drawer rests at a peek (handle + palette) and drags up to reveal props.
  const [drawerSnap, setDrawerSnap] = useState<number | string | null>(SNAP_PEEK);
  useEffect(() => {
    const mq = matchMedia("(max-width: 720px)");
    const on = () => setMobile(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Drive the palette's collapse from the drawer's live transform so it folds
  // away *under the finger* as the sheet opens — one motion, not two. vaul
  // animates the sheet's translateY (during the drag and the release settle);
  // we read it each frame and map peek→full to `--expand` 0→1.
  const trackExpand = () => {
    const drawer = document.querySelector(".props-drawer") as HTMLElement | null;
    const strip = stripRef.current;
    if (drawer && strip) {
      const t = getComputedStyle(drawer).transform;
      if (t && t !== "none") {
        const y = new DOMMatrixReadOnly(t).m42;
        const vh = window.innerHeight;
        const peek = vh - parseFloat(SNAP_PEEK);
        const full = vh * (1 - SNAP_FULL);
        const p = Math.max(0, Math.min(1, (peek - y) / (peek - full || 1)));
        strip.style.setProperty("--expand", p.toFixed(3));
      }
    }
    const released = expandReleaseRef.current;
    if (released != null && performance.now() - released > 650) {
      expandRunningRef.current = false; // settle finished; stop reading
      return;
    }
    requestAnimationFrame(trackExpand);
  };
  const startExpandTracking = () => {
    expandReleaseRef.current = null; // a new drag cancels any pending stop
    if (expandRunningRef.current) return;
    expandRunningRef.current = true;
    requestAnimationFrame(trackExpand);
  };
  useEffect(() => {
    const onUp = () => {
      if (expandRunningRef.current) expandReleaseRef.current = performance.now();
    };
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const building = state === "build";
  const room = sceneRef.current.rooms[0];
  const roomSettings = room.settings;
  const snap = roomSettings.snap;
  const selectedBody = selected ? (room.bodies.find((b) => b.id === selected) ?? null) : null;
  const selectedConnector = selected ? (room.connectors.find((c) => c.id === selected) ?? null) : null;
  const snapOn = () => sceneRef.current.rooms[0].settings.snap;

  // ----- boot + resize + render loop -----
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let disposed = false;

    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      // Re-fit only while the user hasn't panned/zoomed, so a stray mobile
      // resize (URL bar hide/show) doesn't reset their view mid-build.
      if (!viewAdjustedRef.current) {
        const size = sceneRef.current.rooms[0].settings.size;
        cameraRef.current = fitCamera(size.width, size.height, canvas.width, canvas.height, VIEW_MARGIN);
      }
      rendererRef.current?.setCamera(cameraRef.current);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const at = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      applyCamera(zoomClamped(cameraRef.current, at, Math.exp(-e.deltaY * 0.0015)));
    };

    (async () => {
      await initSim();
      if (disposed || !canvasRef.current) return;
      rendererRef.current = createRenderer(canvasRef.current, cameraRef.current);
      resize();
      setReady(true);

      const frame = (now: number) => {
        const dt = (now - last) / 1000;
        last = now;
        const clock = clockRef.current;
        const world = worldRef.current;
        if (clock.state === "running" && world) {
          const steps = clock.advance(dt);
          for (let i = 0; i < steps; i++) world.step();
        }
        const isBuild = clock.state === "build";
        const transforms =
          world && !isBuild ? world.readTransforms() : designTransforms(sceneRef.current);
        rendererRef.current?.draw(
          sceneRef.current,
          transforms,
          isBuild ? selectedRef.current : null,
          isBuild ? (overlayRef.current ?? undefined) : undefined,
        );
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    })();

    window.addEventListener("resize", resize);
    // Native (non-passive) so we can preventDefault the page from scroll-zooming.
    canvasRef.current?.addEventListener("wheel", onWheel, { passive: false });
    const canvasEl = canvasRef.current;
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvasEl?.removeEventListener("wheel", onWheel);
      worldRef.current?.free();
      worldRef.current = null;
    };
  }, []);

  // Delete/Backspace removes the selection; Escape cancels a connector draw.
  // Skip Delete/Backspace while typing in a field, so editing a property value
  // (e.g. backspacing in the width box) doesn't delete the selected object.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (!typing && (e.key === "Delete" || e.key === "Backspace")) deleteSelectedRef.current();
      else if (e.key === "Escape") cancelConnectorRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Autosave the design graph (debounced) so a refresh restores in-progress
  // work. Skipped until the first edit (revision 0) so a lazily-forked new tab
  // doesn't materialize a duplicate build just by being opened.
  useEffect(() => {
    if (revision === 0) return;
    const t = setTimeout(() => saveSession(sessionIdRef.current, sceneRef.current), 500);
    return () => clearTimeout(t);
  }, [revision]);

  // A shared scene was already imported on init; strip it from the URL so a
  // later refresh restores the user's autosaved edits, not the original link.
  useEffect(() => {
    if (hasSharedScene()) history.replaceState(null, "", location.pathname + location.search);
  }, []);

  // ----- transport -----
  const play = () => {
    worldRef.current?.free();
    worldRef.current = compile(sceneRef.current);
    clockRef.current.play();
    setState("running");
  };
  const pause = () => {
    clockRef.current.pause();
    setState(clockRef.current.state);
  };
  const reset = () => {
    worldRef.current?.free();
    worldRef.current = null;
    clockRef.current.reset();
    setState("build");
  };

  // ----- selection / editing -----
  const select = (id: string | null) => {
    selectedRef.current = id;
    setSelected(id);
  };
  const bodyById = (id: string) => sceneRef.current.rooms[0].bodies.find((b) => b.id === id);
  const connById = (id: string) => sceneRef.current.rooms[0].connectors.find((c) => c.id === id);
  const pointerInCanvas = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const worldAt = (e: React.PointerEvent) => screenToWorld(cameraRef.current, pointerInCanvas(e));

  // ----- camera (pan / zoom) -----
  /** Adopt a new camera and redraw under it (marks the view as user-adjusted). */
  const applyCamera = (next: Camera) => {
    viewAdjustedRef.current = true;
    cameraRef.current = next;
    rendererRef.current?.setCamera(next);
  };
  /** Zoom about a point, holding the resulting scale within the zoom limits. */
  const zoomClamped = (cam: Camera, at: { x: number; y: number }, factor: number): Camera => {
    const target = Math.min(MAX_SCALE, Math.max(MIN_SCALE, cam.scale * factor));
    return zoomAt(cam, at, target / cam.scale);
  };
  /** Reset the view to frame the whole room (and resume auto-fit on resize). */
  const fitView = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = sceneRef.current.rooms[0].settings.size;
    cameraRef.current = fitCamera(size.width, size.height, canvas.width, canvas.height, VIEW_MARGIN);
    viewAdjustedRef.current = false;
    rendererRef.current?.setCamera(cameraRef.current);
  };

  /** Cancel any in-progress single-finger edit (when a 2nd finger lands). */
  const cancelActiveEdit = () => {
    connectorStartRef.current = null;
    endpointDragRef.current = null;
    dragOffsetRef.current = null;
    handleDragRef.current = null;
    overlayRef.current = null;
  };
  const pinchState = () => {
    const pts = [...pointersRef.current.values()];
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
    return { mid, dist };
  };

  const onCanvasPointerDown = (e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, pointerInCanvas(e));
    selectDownRef.current = null; // only the select branch below re-arms cycling
    // A second finger starts a two-finger pan/pinch; abandon any single-finger edit.
    if (pointersRef.current.size >= 2) {
      cancelActiveEdit();
      gestureRef.current = pinchState();
      return;
    }
    // Middle-button drag pans the view (works in build and run modes).
    if (e.button === 1) {
      panDragRef.current = pointerInCanvas(e);
      capture(canvasRef.current, e.pointerId);
      return;
    }
    if (!building) return;
    const raw = worldAt(e);

    // Connector tool armed → pin/weld are click-to-place (join overlapping
    // bodies at the click point); spring is drag-to-draw across a gap.
    if (connectorToolRef.current) {
      const tool = connectorToolRef.current;
      if (tool === "pin" || tool === "weld" || tool === "motor") {
        placeOverlap(tool, raw);
        connectorToolRef.current = null;
        setConnectorTool(null);
        return;
      }
      connectorStartRef.current = snapEndpoint(sceneRef.current, 0, raw, ANCHOR_PX / cameraRef.current.scale);
      overlayRef.current = { snap: connectorStartRef.current.world };
      capture(canvasRef.current, e.pointerId);
      return;
    }

    // A resize/rotate handle on the selected body takes priority.
    const sel = selectedRef.current ? bodyById(selectedRef.current) : null;
    if (sel) {
      const handle = handleAtPoint(sel, raw, HANDLE_PX / cameraRef.current.scale);
      if (handle) {
        handleDragRef.current = handle;
        capture(canvasRef.current, e.pointerId);
        return;
      }
    }

    // An endpoint handle of the selected connector takes priority too.
    const selConn = selectedRef.current ? connById(selectedRef.current) : null;
    if (selConn) {
      const tol = ENDPOINT_PX / cameraRef.current.scale;
      const near = (ep: typeof selConn.a) => {
        const w = endpointWorld(sceneRef.current, 0, ep);
        return w && Math.hypot(w.x - raw.x, w.y - raw.y) <= tol;
      };
      const end: "a" | "b" | null = near(selConn.a) ? "a" : near(selConn.b) ? "b" : null;
      if (end) {
        endpointDragRef.current = { id: selConn.id, end };
        overlayRef.current = { snap: raw };
        // A connector pinned at a body's center (e.g. a motor) puts its endpoint
        // handle right over that body, so a plain click here would always re-aim
        // and never reach the body. Arm cycling: a click (no drag) advances to
        // the next stacked object; an actual drag still re-aims the endpoint.
        const world = snapOn() ? snapToGrid(raw, GRID_SIZE) : raw;
        const picks = [
          ...bodiesAtPoint(sceneRef.current, 0, world),
          ...connectorsAtPoint(sceneRef.current, 0, raw, CONNECTOR_PX / cameraRef.current.scale),
        ];
        if (picks.length > 1) {
          selectDownRef.current = { picks, id: selConn.id, wasOnPick: true, x: e.clientX, y: e.clientY };
        }
        capture(canvasRef.current, e.pointerId);
        return;
      }
    }

    // Else select whatever's under the point. Stacked objects (e.g. a motor
    // hidden behind the wheel it spins) all become candidates, topmost first;
    // a body can be dragged, and clicking again without moving cycles to the
    // next layer (see the cycle-on-click in onCanvasPointerUp).
    const world = snapOn() ? snapToGrid(raw, GRID_SIZE) : raw;
    const tol = CONNECTOR_PX / cameraRef.current.scale;
    const picks = [
      ...bodiesAtPoint(sceneRef.current, 0, world),
      ...connectorsAtPoint(sceneRef.current, 0, raw, tol),
    ];
    if (picks.length === 0) {
      select(null);
      return;
    }
    // Keep the current selection if it's under the point (so a drag moves it
    // and a click advances the cycle); otherwise grab the topmost.
    const cur = selectedRef.current;
    const wasOnPick = !!cur && picks.includes(cur);
    const target = wasOnPick ? cur! : picks[0];
    select(target);
    const body = bodyById(target);
    if (body) {
      dragOffsetRef.current = { x: body.position.x - world.x, y: body.position.y - world.y };
    }
    selectDownRef.current = { picks, id: target, wasOnPick, x: e.clientX, y: e.clientY };
    capture(canvasRef.current, e.pointerId);
  };

  const onCanvasPointerMove = (e: React.PointerEvent) => {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, pointerInCanvas(e));
    }
    // Two fingers: pan by the midpoint shift, zoom by the pinch-distance ratio.
    if (gestureRef.current && pointersRef.current.size >= 2) {
      const prev = gestureRef.current;
      const now = pinchState();
      let cam = panBy(cameraRef.current, now.mid.x - prev.mid.x, now.mid.y - prev.mid.y);
      cam = zoomClamped(cam, now.mid, now.dist / prev.dist);
      gestureRef.current = now;
      applyCamera(cam);
      return;
    }
    if (panDragRef.current) {
      const p = pointerInCanvas(e);
      applyCamera(panBy(cameraRef.current, p.x - panDragRef.current.x, p.y - panDragRef.current.y));
      panDragRef.current = p;
      return;
    }

    if (!building) return;
    const raw = worldAt(e);

    if (connectorStartRef.current) {
      const end = snapEndpoint(sceneRef.current, 0, raw, ANCHOR_PX / cameraRef.current.scale);
      overlayRef.current = {
        preview: { a: connectorStartRef.current.world, b: end.world, type: connectorToolRef.current! },
        snap: end.world,
      };
      return;
    }

    // Re-aim a connector endpoint, re-snapping as you drag.
    if (endpointDragRef.current) {
      const { id, end } = endpointDragRef.current;
      const result = snapEndpoint(sceneRef.current, 0, raw, ANCHOR_PX / cameraRef.current.scale);
      sceneRef.current = updateConnector(sceneRef.current, 0, id, { [end]: endpointOf(result) });
      overlayRef.current = { snap: result.world };
      bump();
      return;
    }

    const id = selectedRef.current;
    const body = id ? bodyById(id) : null;
    if (!id || !body) return;
    if (handleDragRef.current) {
      if (handleDragRef.current === "rotate") {
        sceneRef.current = updateBody(sceneRef.current, 0, id, { rotation: applyRotation(body, raw) });
      } else {
        const props = { ...body.props, ...applyResize(body, handleDragRef.current, raw) };
        sceneRef.current = updateBody(sceneRef.current, 0, id, { props });
      }
      bump();
    } else if (dragOffsetRef.current) {
      const off = dragOffsetRef.current;
      const moved = { x: raw.x + off.x, y: raw.y + off.y };
      const snapped = snapOn() ? snapToGrid(moved, GRID_SIZE) : moved;
      const size = sceneRef.current.rooms[0].settings.size;
      sceneRef.current = updateBody(sceneRef.current, 0, id, {
        position: clampInsideRoom(size, body, snapped),
      });
    }
  };

  const onCanvasPointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    // Lifting below two fingers ends the pan/pinch; don't fall through to edits.
    if (gestureRef.current) {
      if (pointersRef.current.size < 2) gestureRef.current = null;
      else gestureRef.current = pinchState();
      return;
    }
    panDragRef.current = null;
    if (connectorStartRef.current && connectorToolRef.current) {
      const start = connectorStartRef.current;
      const end = snapEndpoint(sceneRef.current, 0, worldAt(e), ANCHOR_PX / cameraRef.current.scale);
      finishConnector(connectorToolRef.current, start, end);
      connectorStartRef.current = null;
      overlayRef.current = null;
      connectorToolRef.current = null;
      setConnectorTool(null);
    }
    if (endpointDragRef.current) {
      endpointDragRef.current = null;
      overlayRef.current = null;
    }
    dragOffsetRef.current = null;
    handleDragRef.current = null;

    // Cycle-select: a click (no real drag) on something already selected
    // advances to the next stacked object under the point.
    const sd = selectDownRef.current;
    selectDownRef.current = null;
    if (sd && sd.wasOnPick && sd.picks.length > 1) {
      const moved = Math.hypot(e.clientX - sd.x, e.clientY - sd.y) > 4;
      if (!moved) {
        const i = sd.picks.indexOf(sd.id);
        select(sd.picks[(i + 1) % sd.picks.length]);
      }
    }

    if (canvasRef.current?.hasPointerCapture(e.pointerId)) {
      canvasRef.current.releasePointerCapture(e.pointerId);
    }
  };

  /**
   * Click-to-place a pin, weld, or motor through the point. Joins the top two
   * bodies under the cursor at that shared point; if only one body is there,
   * anchors it to a fixed world point (a pin pivots, a weld locks, a motor
   * drives the body about that point).
   */
  const placeOverlap = (type: "pin" | "weld" | "motor", p: { x: number; y: number }) => {
    const ids = bodiesAtPoint(sceneRef.current, 0, p);
    if (ids.length === 0) return;
    const a = { body: ids[0], local: bodyToLocal(bodyById(ids[0])!, p) };
    const b =
      ids.length >= 2
        ? { body: ids[1], local: bodyToLocal(bodyById(ids[1])!, p) }
        : { world: { x: p.x, y: p.y } };
    const added = addConnector(sceneRef.current, 0, makeConnector(type, a, b));
    sceneRef.current = added.scene;
    select(added.id);
    bump();
  };

  /** Create a drag-drawn connector (spring) from two snap results, unless degenerate. */
  const finishConnector = (type: ConnectorType, a: SnapResult, b: SnapResult) => {
    const epA = endpointOf(a);
    const epB = endpointOf(b);
    // No self-joints, and no zero-length connector in empty space.
    const sameBody = isBodyEndpoint(epA) && isBodyEndpoint(epB) && epA.body === epB.body;
    const gap = Math.hypot(a.world.x - b.world.x, a.world.y - b.world.y);
    if (sameBody || gap < 0.05) return;

    const conn = makeConnector(type, epA, epB);
    if (type === "spring") conn.props.restLength = Math.max(0.1, gap);
    const added = addConnector(sceneRef.current, 0, conn);
    sceneRef.current = added.scene;
    select(added.id);
    bump();
  };

  const onPropChange = (patch: Props) => {
    const id = selectedRef.current;
    if (!id) return;
    const body = bodyById(id);
    if (body) {
      sceneRef.current = updateBody(sceneRef.current, 0, id, { props: { ...body.props, ...patch } });
      bump();
      return;
    }
    const conn = connById(id);
    if (conn) {
      const props = { ...conn.props, ...patch };
      sceneRef.current = updateConnector(sceneRef.current, 0, id, { props });
      // Push motor tuning into the live joint so speed/direction change mid-run
      // without a Reset. Writing to the scene too keeps a replay consistent.
      if (conn.type === "motor") worldRef.current?.setMotor(id, props);
      bump();
    }
  };

  const deleteSelected = () => {
    const id = selectedRef.current;
    if (!building || !id) return;
    sceneRef.current = bodyById(id)
      ? removeBodyAndConnectors(sceneRef.current, 0, id)
      : removeConnector(sceneRef.current, 0, id);
    select(null);
    bump();
  };
  const deleteSelectedRef = useRef(deleteSelected);
  deleteSelectedRef.current = deleteSelected;

  const cancelConnector = () => {
    connectorStartRef.current = null;
    overlayRef.current = null;
    connectorToolRef.current = null;
    setConnectorTool(null);
  };
  const cancelConnectorRef = useRef(cancelConnector);
  cancelConnectorRef.current = cancelConnector;

  const armConnector = (type: ConnectorType) => {
    const next = connectorTool === type ? null : type;
    connectorToolRef.current = next;
    setConnectorTool(next);
    if (next) select(null);
  };

  // ----- drag a body type from the palette onto the canvas -----
  const onPaletteDown = (type: BodyType) => (e: React.PointerEvent) => {
    if (!building) return;
    e.preventDefault();
    placingRef.current = type;
    paletteOriginRef.current = (e.currentTarget as HTMLElement).getBoundingClientRect();
    draggedOffRef.current = false;
    capture(e.currentTarget as HTMLElement, e.pointerId);
  };
  const onPaletteMove = (e: React.PointerEvent) => {
    if (!placingRef.current) return;
    const r = paletteOriginRef.current;
    if (r && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) {
      draggedOffRef.current = true;
    }
    if (!draggedOffRef.current) {
      setGhost(null);
      return;
    }
    const droppable = document.elementFromPoint(e.clientX, e.clientY) === canvasRef.current;
    setGhost({ type: placingRef.current, x: e.clientX, y: e.clientY, droppable });
  };
  const onPaletteUp = (e: React.PointerEvent) => {
    const type = placingRef.current;
    const draggedOff = draggedOffRef.current;
    placingRef.current = null;
    paletteOriginRef.current = null;
    draggedOffRef.current = false;
    setGhost(null);
    if (!type || !building || !draggedOff) return;
    if (document.elementFromPoint(e.clientX, e.clientY) !== canvasRef.current) return;
    const raw = worldAt(e);
    const world = snapOn() ? snapToGrid(raw, GRID_SIZE) : raw;
    const newBody = makeBody(type, world);
    const size = sceneRef.current.rooms[0].settings.size;
    const added = addBody(sceneRef.current, 0, {
      ...newBody,
      position: clampInsideRoom(size, newBody, world),
    });
    sceneRef.current = added.scene;
    select(added.id);
    bump();
  };

  // Mobile palette drag-to-place. The strip scrolls horizontally (touch-action
  // pan-x), so we wait to see an *upward* drag before committing — that way a
  // sideways swipe scrolls the strip and an up-drag lifts a shape onto the
  // canvas. Capture is deferred until commit so native scroll isn't blocked.
  const mobileDragStartRef = useRef<{ x: number; y: number; type: BodyType } | null>(null);
  const onStripDown = (type: BodyType) => (e: React.PointerEvent) => {
    if (!building) return;
    mobileDragStartRef.current = { x: e.clientX, y: e.clientY, type };
  };
  const onStripMove = (e: React.PointerEvent) => {
    const start = mobileDragStartRef.current;
    if (!start) return;
    if (!placingRef.current) {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        mobileDragStartRef.current = null; // sideways → let the strip scroll
        return;
      }
      if (dy > -10) return; // wait for a deliberate upward lift
      placingRef.current = start.type;
      draggedOffRef.current = true;
      capture(e.currentTarget as HTMLElement, e.pointerId);
    }
    const droppable = document.elementFromPoint(e.clientX, e.clientY) === canvasRef.current;
    setGhost({ type: placingRef.current!, x: e.clientX, y: e.clientY, droppable });
  };
  const onStripUp = (e: React.PointerEvent) => {
    const type = placingRef.current;
    mobileDragStartRef.current = null;
    placingRef.current = null;
    draggedOffRef.current = false;
    setGhost(null);
    if (!type || !building) return;
    if (document.elementFromPoint(e.clientX, e.clientY) !== canvasRef.current) return;
    const raw = worldAt(e);
    const world = snapOn() ? snapToGrid(raw, GRID_SIZE) : raw;
    const newBody = makeBody(type, world);
    const size = sceneRef.current.rooms[0].settings.size;
    const added = addBody(sceneRef.current, 0, {
      ...newBody,
      position: clampInsideRoom(size, newBody, world),
    });
    sceneRef.current = added.scene;
    select(added.id);
    bump();
  };
  const onStripCancel = () => {
    mobileDragStartRef.current = null;
    placingRef.current = null;
    draggedOffRef.current = false;
    setGhost(null);
  };

  const onRoomChange = (patch: Partial<RoomSettings>) => {
    sceneRef.current = updateRoomSettings(sceneRef.current, 0, patch);
    bump();
  };
  const toggleSnap = () => onRoomChange({ snap: !snapOn() });

  // Copy a shareable link (the scene encoded in the URL fragment) to the
  // clipboard, falling back to a prompt where clipboard access is blocked.
  const copyLink = async () => {
    const url = shareUrl(sceneRef.current);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this link:", url);
    }
  };

  // ----- saved builds (sessions) -----
  const openBuilds = () => setBuilds(listSessions());
  const refreshBuilds = () => setBuilds(listSessions());

  /** Switch this tab to a scene, dropping to build mode and reframing. */
  const adoptScene = (scene: Scene) => {
    reset();
    sceneRef.current = scene;
    select(null);
    fitView();
    setBuilds(null);
  };

  const openBuild = (id: string) => {
    const scene = loadSession(id);
    if (!scene) return;
    adoptSession(id);
    sessionIdRef.current = id;
    adoptScene(scene);
    bump(); // re-render; marks this build most-recent on the next autosave
  };

  const startNewBuild = () => {
    const fresh = newSession();
    sessionIdRef.current = fresh.id;
    adoptScene(fresh.scene); // stays lazy (no bump) until the first edit
  };

  const removeBuild = (id: string) => {
    deleteSession(id);
    refreshBuilds();
  };

  const renameBuild = (id: string, title: string) => {
    renameSession(id, title);
    setBuilds((list) => list && list.map((s) => (s.id === id ? { ...s, title } : s)));
  };

  // ----- shared panel fragments, rendered into either layout -----
  const paletteEls = (
    <>
      {bodyTypes().map((d) => (
        <button
          key={d.type}
          className="palette-item"
          title={`Drag to place a ${d.label.toLowerCase()}`}
          disabled={!building}
          onPointerDown={onPaletteDown(d.type)}
          onPointerMove={onPaletteMove}
          onPointerUp={onPaletteUp}
        >
          <BodyPreview type={d.type} />
          <span>{d.label}</span>
        </button>
      ))}
      <div className="palette-divider">Connect</div>
      {connectorTypes().map((c) => (
        <button
          key={c.type}
          className={`palette-connector${connectorTool === c.type ? " active" : ""}`}
          title={`${c.help}\n\n${
            c.type === "spring"
              ? "Draw it: drag from one point to another."
              : "Place it: click where two bodies overlap."
          }`}
          disabled={!building}
          onClick={() => armConnector(c.type)}
        >
          {c.label}
        </button>
      ))}
    </>
  );

  // Palette for the vaul drawer: bodies drag up onto the canvas to place;
  // connectors arm on tap. `data-vaul-no-drag` keeps vaul from treating these
  // gestures as a drawer drag, so our handlers own them.
  const mobilePaletteEls = (
    <>
      {bodyTypes().map((d) => (
        <button
          key={d.type}
          className="palette-item"
          data-vaul-no-drag
          title={`Drag up to place a ${d.label.toLowerCase()}`}
          disabled={!building}
          onPointerDown={onStripDown(d.type)}
          onPointerMove={onStripMove}
          onPointerUp={onStripUp}
          onPointerCancel={onStripCancel}
        >
          <BodyPreview type={d.type} />
          <span>{d.label}</span>
        </button>
      ))}
      <div className="palette-divider">Connect</div>
      {connectorTypes().map((c) => (
        <button
          key={c.type}
          className={`palette-connector${connectorTool === c.type ? " active" : ""}`}
          data-vaul-no-drag
          disabled={!building}
          onClick={() => armConnector(c.type)}
        >
          {c.label}
        </button>
      ))}
    </>
  );

  const actionsEls = (
    <>
      <button className="icon-btn" onClick={deleteSelected} disabled={!building || !selected} title="Delete"><Icon name="delete" /></button>
      <label className="snap">
        <input type="checkbox" checked={snap} onChange={toggleSnap} disabled={!building} />
        Grid snap
      </label>
      <button onClick={copyLink} title="Copy a shareable link to this build">
        <Icon name="link" /> {copied ? "Copied!" : "Copy link"}
      </button>
      <button onClick={openBuilds} title="Browse your saved builds">Builds</button>
    </>
  );

  const tipText = !building
    ? "Press Reset to edit"
    : connectorTool === "pin" || connectorTool === "weld"
      ? `Click where two bodies overlap to ${connectorTool} them — or click one body to anchor it in place (Esc to cancel)`
      : connectorTool === "motor"
        ? "Click a body to mount a motor and spin it — or click where two bodies overlap (Esc to cancel)"
        : connectorTool
          ? `Drawing ${connectorTool} — drag from one point to another (Esc to cancel)`
          : "Drag a shape in · click to select · drag to move";

  // A motor stays editable while the sim runs, so its speed/direction can be
  // tuned live; everything else is build-only.
  const liveMotor = !building && selectedConnector?.type === "motor" ? selectedConnector : null;

  // Shown on the drawer's peek so you know what dragging up will edit.
  const contextLabel = !building
    ? liveMotor
      ? "Motor (live)"
      : "Running"
    : selectedBody
      ? def(selectedBody.type).label
      : selectedConnector
        ? connectorDef(selectedConnector.type).label
        : "Room settings";

  const rightPanelEl = liveMotor ? (
    <PropertyPanel
      title={connectorDef(liveMotor.type).label}
      schema={connectorDef(liveMotor.type).propSchema}
      props={liveMotor.props}
      onChange={onPropChange}
    />
  ) : (
    building && (
      selectedBody ? (
        <PropertyPanel
          title={def(selectedBody.type).label}
          schema={def(selectedBody.type).propSchema}
          props={selectedBody.props}
          onChange={onPropChange}
        />
      ) : selectedConnector ? (
        <PropertyPanel
          title={connectorDef(selectedConnector.type).label}
          schema={connectorDef(selectedConnector.type).propSchema}
          props={selectedConnector.props}
          onChange={onPropChange}
        />
      ) : (
        <RoomSettingsPanel settings={roomSettings} onChange={onRoomChange} />
      )
    )
  );

  const buildsEl = builds && (
    <div className="builds-overlay" onPointerDown={() => setBuilds(null)}>
      <div className="builds-panel panel" onPointerDown={(e) => e.stopPropagation()}>
        <div className="builds-head">
          <span className="prop-title">Builds</span>
          <button onClick={startNewBuild}>+ New build</button>
        </div>
        {builds.length === 0 ? (
          <div className="prop-empty">No saved builds yet.</div>
        ) : (
          <ul className="builds-list">
            {builds.map((s) => {
              const current = s.id === sessionIdRef.current;
              return (
                <li key={s.id} className={`build-row${current ? " current" : ""}`}>
                  <input
                    className="build-title"
                    value={s.title}
                    onChange={(e) => renameBuild(s.id, e.target.value)}
                    aria-label="Build name"
                  />
                  <span className="build-time">{relTime(s.updatedAt)}</span>
                  <button onClick={() => openBuild(s.id)} disabled={current}>
                    {current ? "Current" : "Open"}
                  </button>
                  <button className="build-del" onClick={() => removeBuild(s.id)} title="Delete build">
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <div className={`app${mobile ? " mobile" : ""}`}>
      <canvas
        ref={canvasRef}
        className="stage"
        style={{ cursor: connectorTool ? "crosshair" : "default" }}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}
        onPointerCancel={onCanvasPointerUp}
      />

      {/* Transport — floating top-center */}
      <div className="panel transport">
        <button onClick={play} disabled={!ready || state === "running"} title="Play"><Icon name="play" /></button>
        <button onClick={pause} disabled={!ready || state !== "running"} title="Pause"><Icon name="pause" /></button>
        <button onClick={reset} disabled={!ready || state === "build"} title="Reset"><Icon name="reset" /></button>
        <button onClick={fitView} disabled={!ready} title="Fit view to room"><Icon name="fit" /></button>
        <span className="state">{ready ? state : "loading…"}</span>
      </div>

      {mobile ? (
        /* One drawer, always at least at the peek (handle + horizontal palette).
           Drag the handle up to reveal the properties for what's selected.
           Full-viewport height is required for vaul's snap-point math. */
        <Drawer.Root
          open
          dismissible={false}
          modal={false}
          handleOnly
          snapPoints={[SNAP_PEEK, SNAP_FULL]}
          activeSnapPoint={drawerSnap}
          setActiveSnapPoint={setDrawerSnap}
          onDrag={startExpandTracking}
        >
          <Drawer.Portal>
            <Drawer.Content className="drawer props-drawer">
              <Drawer.Handle className="drawer-handle" />
              <Drawer.Description className="sr-only">
                Drag shapes onto the canvas, or drag up to edit the selection or room.
              </Drawer.Description>
              <Drawer.Title className="sr-only">Tools and properties</Drawer.Title>
              {/* One scroll container: the palette scrolls off the top as the
                  properties scroll down. The palette fades while expanded. */}
              <div className="drawer-scroll">
                <div ref={stripRef} className="strip-row" aria-disabled={!building}>
                  {mobilePaletteEls}
                </div>
                <div className="drawer-props">
                  <div className="drawer-context">{contextLabel}</div>
                  <div className="sheet-actions">{actionsEls}</div>
                  {rightPanelEl}
                </div>
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      ) : (
        <>
          {/* Palette — floating left: drag a body in; click a connector to draw it */}
          <div className="panel palette" aria-disabled={!building}>
            {paletteEls}
          </div>

          {/* Contextual actions — floating bottom-center */}
          <div className="panel actions">
            {actionsEls}
            <span className="tip">{tipText}</span>
          </div>

          {/* Right panel — properties for the selected body/connector, else room */}
          {rightPanelEl}
        </>
      )}

      {/* Saved-builds list (overlay), opened from the actions row. */}
      {buildsEl}

      {/* Drag ghost following the cursor, sized to the body's true scale. */}
      {ghost && (
        <div
          className={`ghost${ghost.droppable ? "" : " leaving"}`}
          style={{ left: ghost.x, top: ghost.y }}
        >
          <BodyPreview type={ghost.type} scale={cameraRef.current.scale} />
        </div>
      )}
    </div>
  );
}
