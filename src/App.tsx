import { useEffect, useRef, useState } from "react";
import { Drawer } from "vaul";
import {
  addBody,
  updateBody,
  duplicateBody,
  updateRoomSettings,
  addConnector,
  removeConnector,
  updateConnector,
  removeBodyAndConnectors,
  addBodyToTemplate,
  removeBodyFromTemplate,
  updateBodyInTemplate,
  isBodyEndpoint,
  type Scene,
  type Body,
  type Vec2,
  type BodyType,
  type ConnectorType,
  type RoomSettings,
} from "./scene/scene";
import {
  bootSession,
  hasSharedScene,
  saveSession,
  strippedUrl,
  bodyToShareText,
  bodyFromShareText,
  listSessions,
  loadSession,
  adoptSession,
  newSession,
  deleteSession,
  renameSession,
  loadThumbnail,
} from "./share/storage";
import { type SessionMeta } from "./share/sessions";
import { createClock, type Clock, type ClockState } from "./clock/clock";
import { initSim, compile, type SimWorld, type BodyTransform } from "./sim/sim";
import { type Camera, fitCamera, screenToWorld, worldToScreen, zoomAt, panBy } from "./renderer/camera";
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
  pruneDetachedConnectors,
  type HandleId,
} from "./editor/editor";
import { snap as snapEndpoint, endpointOf, type SnapResult } from "./snapping/snapping";
import { createHistory } from "./history/history";
import { BodyPreview } from "./ui/BodyPreview";
import { ConnectorPreview } from "./ui/ConnectorPreview";
import { DoodleBorder } from "./ui/DoodleBorder";
import { DoodleTooltip, DoodleTooltipProvider } from "./ui/DoodleTooltip";
import { Icon } from "./ui/Icon";
import { PropertyPanel } from "./ui/PropertyPanel";
import { RoomSettingsPanel } from "./ui/RoomSettingsPanel";
import { SharePopover } from "./ui/SharePopover";
import { SpawnerPopover, type SpawnerPopoverHandle } from "./ui/SpawnerPopover";

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

/** Longest edge (px) of a saved-build preview thumbnail. */
const THUMB_MAX = 200;

/**
 * Render the scene fit-to-room into a small offscreen canvas and return a PNG
 * data URL — a stable preview independent of the live camera's pan/zoom. The
 * PNG is transparent (paper colour comes from CSS behind the <img>).
 */
function renderThumbnail(scene: Scene): string | null {
  try {
    const { width, height } = scene.rooms[0].settings.size;
    const scale = THUMB_MAX / Math.max(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const cam = fitCamera(width, height, canvas.width, canvas.height, 1.04);
    createRenderer(canvas, cam, { grid: false }).draw(scene, designTransforms(scene), null, undefined);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
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
  // Undo/redo stack. Atomic mutations go through `commitScene`; drags capture
  // `gestureStartRef` at pointerdown so the whole gesture lands as one entry.
  const historyRef = useRef(createHistory());
  const gestureStartRef = useRef<Scene | null>(null);
  const selectedRef = useRef<string | null>(null);
  // Copy/paste/duplicate (issue 17). The in-app clipboard is a deep body
  // snapshot — the permission-free primary source for paste; copy also writes
  // share text to the system clipboard for cross-tab/external paste. The hover
  // ref is the last world point under the cursor while over the canvas (null
  // when off it), so paste can land at the pointer. The cascade counter steps
  // successive off-pointer pastes/duplicates so they don't stack exactly.
  const clipboardRef = useRef<Body | null>(null);
  const hoverWorldRef = useRef<Vec2 | null>(null);
  const cascadeRef = useRef(0);
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
  const stripRef = useRef<HTMLDivElement | null>(null);
  const expandRunningRef = useRef(false);
  const expandReleaseRef = useRef<number | null>(null);

  // `ready` is renderer-ready (the canvas + draw loop exist); set on first
  // frame. `simReady` is Rapier-WASM-loaded; set when the background
  // `initSim()` resolves. Splitting these two lets the editor be interactive
  // immediately while Rapier (~1.5 MB) streams in alongside — by the time
  // the user hits Play it's already loaded.
  const [ready, setReady] = useState(false);
  const [simReady, setSimReady] = useState(false);
  const [state, setState] = useState<ClockState>("build");
  const [selected, setSelected] = useState<string | null>(null);
  const [connectorTool, setConnectorTool] = useState<ConnectorType | null>(null);
  const [ghost, setGhost] = useState<{ type: BodyType; x: number; y: number; droppable: boolean } | null>(null);
  // Hide the spawner popover transiently while the user drags/rotates the
  // spawner glyph — the popover would otherwise lag the glyph by a frame
  // (React re-renders only on bump / state changes, not on every drag move).
  // Pointerup clears this; the popover reappears at the spawner's new pose.
  const [spawnerInteracting, setSpawnerInteracting] = useState(false);
  // The id of a body inside the currently-selected spawner's template, or
  // null. Driven by clicks inside the popover canvas; the main right-panel
  // shows this body's props when set (and the spawner's props otherwise).
  // Cleared on any selection change in the main scope so it never refers to
  // a body that doesn't belong to the now-selected spawner.
  const [templateSelected, setTemplateSelected] = useState<string | null>(null);
  // Imperative handle into the open SpawnerPopover so onPaletteUp/onStripUp
  // can ask "is the pointer over your mini-canvas, and if so where?" to
  // route cross-scope drops into the template instead of the scene.
  const spawnerPopoverRef = useRef<SpawnerPopoverHandle | null>(null);
  const [revision, setRevision] = useState(0);
  const bump = () => setRevision((r) => r + 1);

  /**
   * Atomic mutation entry point: write `next` to the live scene, push an undo
   * entry, re-render. `mergeKey` collapses a rapid stream of pushes — slider
   * scrubs, typing in the title — into one history step (see `history.ts`).
   */
  const commitScene = (next: Scene, opts?: { mergeKey?: string }) => {
    historyRef.current.push(sceneRef.current, next, opts);
    sceneRef.current = next;
    bump();
  };
  /**
   * Close out an in-progress gesture (drag, resize, rotate, endpoint re-aim,
   * connector draw). Pushes one undo entry spanning the whole gesture if the
   * scene actually changed; otherwise no-ops. The bump is essential — body
   * drag's pointermove deliberately skips re-renders (the render loop reads
   * sceneRef directly), so without it nothing else would tick the autosave
   * effect or refresh the Undo button's disabled state when the drag ends.
   */
  const commitGesture = () => {
    const start = gestureStartRef.current;
    gestureStartRef.current = null;
    if (start && start !== sceneRef.current) {
      historyRef.current.push(start, sceneRef.current);
      bump();
    }
  };
  const doUndo = () => {
    if (!building) return;
    const prev = historyRef.current.undo();
    if (!prev) return;
    sceneRef.current = prev;
    // Selection may have referenced something the undo removed.
    const sel = selectedRef.current;
    if (sel && !bodyById(sel) && !connById(sel)) select(null);
    bump();
  };
  const doRedo = () => {
    if (!building) return;
    const next = historyRef.current.redo();
    if (!next) return;
    sceneRef.current = next;
    const sel = selectedRef.current;
    if (sel && !bodyById(sel) && !connById(sel)) select(null);
    bump();
  };
  const undoRef = useRef(doUndo);
  undoRef.current = doUndo;
  const redoRef = useRef(doRedo);
  redoRef.current = doRedo;
  const [shareOpen, setShareOpen] = useState(false);
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
  const selectedBody = selected ? (room.bodies.find((b) => b.id === selected) ?? null) : null;
  const selectedConnector = selected ? (room.connectors.find((c) => c.id === selected) ?? null) : null;
  // Body inside the currently-selected spawner's template, when a template
  // item is selected via the popover canvas. Null otherwise.
  const templateBody =
    selectedBody?.type === "spawner" && templateSelected
      ? (selectedBody.template?.bodies.find((b) => b.id === templateSelected) ?? null)
      : null;
  const snapOn = () => sceneRef.current.rooms[0].settings.snap;
  // Read undo/redo availability fresh each render. `bump()` after every commit
  // re-renders, so the button disabled state stays in sync without separate
  // React state mirroring the history stack.
  const canUndo = building && historyRef.current.canUndo();
  const canRedo = building && historyRef.current.canRedo();

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
      // Renderer mounts immediately — it only needs the canvas, not Rapier.
      // The draw loop reads designTransforms() in build mode (no physics)
      // and only touches `worldRef.current` once Play has been pressed.
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
        const ephemerals = world && !isBuild ? world.readEphemerals() : undefined;
        rendererRef.current?.draw(
          sceneRef.current,
          transforms,
          isBuild ? selectedRef.current : null,
          isBuild ? (overlayRef.current ?? undefined) : undefined,
          ephemerals,
        );
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    })();

    // Kick off Rapier's WASM load in parallel — it doesn't gate the editor.
    // `initSim()` is idempotent, so calling it again from `play()` is a no-op
    // once this resolves; the Play button stays disabled until then so the
    // user can't try to compile before the world is available.
    initSim().then(() => {
      if (!disposed) setSimReady(true);
    });

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
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Escape") {
        cancelConnectorRef.current();
      } else if (typing) {
        return; // editing a property value — leave all other shortcuts inert
      } else if (mod && (e.key === "c" || e.key === "C")) {
        copyRef.current();
      } else if (mod && (e.key === "v" || e.key === "V")) {
        pasteRef.current();
      } else if (mod && (e.key === "d" || e.key === "D")) {
        e.preventDefault(); // don't trigger the browser's bookmark shortcut
        duplicateRef.current();
      } else if (mod && (e.key === "z" || e.key === "Z")) {
        e.preventDefault(); // don't trigger the browser's history navigation
        if (e.shiftKey) redoRef.current();
        else undoRef.current();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        deleteSelectedRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Autosave the design graph (debounced) so a refresh restores in-progress
  // work. Skipped until the first edit (revision 0) so a lazily-forked new tab
  // doesn't materialize a duplicate build just by being opened.
  useEffect(() => {
    if (revision === 0) return;
    const t = setTimeout(() => {
      const scene = sceneRef.current;
      saveSession(sessionIdRef.current, scene, renderThumbnail(scene));
    }, 500);
    return () => clearTimeout(t);
  }, [revision]);

  // A shared scene was already imported on init; strip it from the URL so a
  // later refresh restores the user's autosaved edits, not the original link.
  // Handles both the current `?s=` form and the legacy `#…` fragment, while
  // preserving any other query parameters the URL may carry.
  useEffect(() => {
    if (hasSharedScene()) history.replaceState(null, "", strippedUrl(location.href));
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
    // Any change to the main selection ends "I'm editing a template body" —
    // a non-spawner selection closes the popover entirely; re-selecting the
    // same spawner is an explicit "back to spawner" gesture.
    setTemplateSelected(null);
  };
  const bodyById = (id: string) => sceneRef.current.rooms[0].bodies.find((b) => b.id === id);
  const connById = (id: string) => sceneRef.current.rooms[0].connectors.find((c) => c.id === id);
  const pointerInCanvas = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const worldAt = (e: React.PointerEvent) => screenToWorld(cameraRef.current, pointerInCanvas(e));

  // ----- camera (pan / zoom) -----
  /** Adopt a new camera and redraw under it (marks the view as user-adjusted).
   *  Also bumps React so anything anchored to screen coordinates (the spawner
   *  popover's position + its mini-camera scale) tracks the new view. */
  const applyCamera = (next: Camera) => {
    viewAdjustedRef.current = true;
    cameraRef.current = next;
    rendererRef.current?.setCamera(next);
    bump();
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
    // A partial drag leaves the scene mutated; landing it as one undo entry
    // keeps the user in control even when the gesture was aborted.
    commitGesture();
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
    // Capture the pre-gesture scene up front so any mutation downstream — an
    // immediate Alt-drag duplicate, a placeOverlap click, or a many-step drag —
    // collapses into a single undo entry when the gesture ends.
    gestureStartRef.current = sceneRef.current;
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
        // Same rationale as the body-drag hide (issue 19): the popover anchor
        // and aim arrow would lag the glyph mid-gesture.
        if (sel.type === "spawner") setSpawnerInteracting(true);
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
    // Alt/Option-drag duplicates: leave the original in place and drag a fresh
    // copy instead (issue 17). The clone starts at the original's position, so
    // the drag offset — and the rest of the drag path — is identical.
    if (body && e.altKey) {
      const dup = duplicateBody(sceneRef.current, 0, target, body.position);
      if (dup) {
        sceneRef.current = dup.scene;
        select(dup.id);
        bump();
        dragOffsetRef.current = { x: body.position.x - world.x, y: body.position.y - world.y };
        // A fresh clone isn't part of the captured pick stack, so no cycling.
        selectDownRef.current = { picks: [dup.id], id: dup.id, wasOnPick: false, x: e.clientX, y: e.clientY };
        capture(canvasRef.current, e.pointerId);
        return;
      }
    }
    if (body) {
      dragOffsetRef.current = { x: body.position.x - world.x, y: body.position.y - world.y };
      // Hide the spawner popover transiently — it would otherwise lag the
      // glyph by a frame. Popover reappears on pointerup at the new pose.
      if (body.type === "spawner") setSpawnerInteracting(true);
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
    hoverWorldRef.current = raw; // remember where the cursor is, so paste lands here

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
      sceneRef.current = pruneDetachedConnectors(sceneRef.current, 0);
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
        // Default drags the corner (opposite corner pinned); Alt resizes
        // symmetrically about the center (issue 21).
        const { props: sized, position } = applyResize(body, handleDragRef.current, raw, e.altKey);
        sceneRef.current = updateBody(sceneRef.current, 0, id, {
          props: { ...body.props, ...sized },
          position,
        });
      }
      // A rotate/resize can move the pivot outside a connected body — issue 24.
      sceneRef.current = pruneDetachedConnectors(sceneRef.current, 0);
      bump();
    } else if (dragOffsetRef.current) {
      const off = dragOffsetRef.current;
      const moved = { x: raw.x + off.x, y: raw.y + off.y };
      const snapped = snapOn() ? snapToGrid(moved, GRID_SIZE) : moved;
      const size = sceneRef.current.rooms[0].settings.size;
      sceneRef.current = updateBody(sceneRef.current, 0, id, {
        position: clampInsideRoom(size, body, snapped),
      });
      // Moving a body off a pin/weld/motor pivot pops that connector off (issue 24).
      sceneRef.current = pruneDetachedConnectors(sceneRef.current, 0);
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
    // Unconditional — React no-ops if already false. A conditional read would
    // see the stale closure value when pointerdown + pointerup land in the
    // same React tick (e.g. very fast clicks, or scripted interactions).
    setSpawnerInteracting(false);
    // Land the gesture as one undo entry (no-op if nothing actually changed).
    commitGesture();

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
   * Click-to-place a pin, weld, or motor through the point — acting on **every**
   * body the point passes through (issue 23), or anchoring a lone body to a
   * fixed world point. A weld chains the whole stack into one rigid compound; a
   * pin joins every pair so they share one axle without clashing; a motor treats
   * the deepest body as the stator, welds the bodies above it into a rotor, and
   * drives that rotor about the pivot relative to the stator.
   */
  const placeOverlap = (type: "pin" | "weld" | "motor", p: { x: number; y: number }) => {
    const ids = bodiesAtPoint(sceneRef.current, 0, p); // topmost first … deepest last
    if (ids.length === 0) return;
    const ep = (id: string) => ({ body: id, local: bodyToLocal(bodyById(id)!, p) });

    // Lone body: anchor it to a fixed world point (pin pivots, weld locks, motor
    // drives it about that point).
    if (ids.length === 1) {
      const added = addConnector(sceneRef.current, 0, makeConnector(type, ep(ids[0]), { world: { x: p.x, y: p.y } }));
      sceneRef.current = added.scene;
      select(added.id);
      bump();
      return;
    }

    // Multiple bodies under the point.
    let scene = sceneRef.current;
    let selectId = "";
    const add = (t: ConnectorType, a: ReturnType<typeof ep>, b: ReturnType<typeof ep>) => {
      const added = addConnector(scene, 0, makeConnector(t, a, b));
      scene = added.scene;
      if (!selectId) selectId = added.id;
      return added.id;
    };
    if (type === "pin") {
      // All-pairs pins at the shared point: one axle, members don't clash.
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) add("pin", ep(ids[i]), ep(ids[j]));
    } else if (type === "weld") {
      // Chain the stack (n−1 welds) into a single rigid compound.
      for (let i = 0; i + 1 < ids.length; i++) add("weld", ep(ids[i]), ep(ids[i + 1]));
    } else {
      // Motor: the deepest body is the stator; weld the bodies above it into a
      // rotor (n−2 welds) and drive that rotor about the pivot relative to the
      // stator. With two bodies this is just a plain motor between them.
      const stator = ids[ids.length - 1];
      const rotor = ids.slice(0, -1);
      for (let i = 0; i + 1 < rotor.length; i++) add("weld", ep(rotor[i]), ep(rotor[i + 1]));
      selectId = add("motor", ep(rotor[0]), ep(stator)); // select the motor itself
    }
    sceneRef.current = scene;
    select(selectId);
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
    // Scrubbing one field fires many `onChange`s; the mergeKey collapses the
    // burst into one undo step per (selection, field key).
    const keys = Object.keys(patch).join(",");
    const body = bodyById(id);
    if (body) {
      let next = updateBody(sceneRef.current, 0, id, { props: { ...body.props, ...patch } });
      // Shrinking radius/width/height can move the pivot outside the shape (issue 24).
      next = pruneDetachedConnectors(next, 0);
      commitScene(next, { mergeKey: `prop:${id}:${keys}` });
      return;
    }
    const conn = connById(id);
    if (conn) {
      const props = { ...conn.props, ...patch };
      const next = updateConnector(sceneRef.current, 0, id, { props });
      // Push motor tuning into the live joint so speed/direction change mid-run
      // without a Reset. Writing to the scene too keeps a replay consistent.
      if (conn.type === "motor") worldRef.current?.setMotor(id, props);
      commitScene(next, { mergeKey: `cprop:${id}:${keys}` });
    }
  };

  const deleteSelected = () => {
    const id = selectedRef.current;
    if (!building || !id) return;
    const next = bodyById(id)
      ? removeBodyAndConnectors(sceneRef.current, 0, id)
      : removeConnector(sceneRef.current, 0, id);
    commitScene(next);
    select(null);
  };
  const deleteSelectedRef = useRef(deleteSelected);
  deleteSelectedRef.current = deleteSelected;

  // ----- copy / paste / duplicate (issue 17) -----
  /** Cascade step (meters) for off-pointer paste/duplicate so copies don't stack. */
  const CASCADE = 0.5;

  /** Add an independent copy of `snapshot` at `position` (clamped), and select it. */
  const spawnClone = (snapshot: Pick<Body, "type" | "rotation" | "props">, position: Vec2) => {
    const size = sceneRef.current.rooms[0].settings.size;
    const added = addBody(sceneRef.current, 0, {
      type: snapshot.type,
      rotation: snapshot.rotation,
      props: { ...snapshot.props },
      position: clampInsideRoom(size, snapshot, position),
    });
    commitScene(added.scene);
    select(added.id);
  };

  /** A position offset down-right from `from` by the next cascade step. */
  const cascadeFrom = (from: Vec2): Vec2 => {
    const step = (cascadeRef.current += 1) * CASCADE;
    return { x: from.x + step, y: from.y - step };
  };

  const copySelection = () => {
    const id = selectedRef.current;
    if (!building || !id) return;
    const body = bodyById(id); // connectors aren't copyable yet (single-select)
    if (!body) return;
    clipboardRef.current = { ...body, position: { ...body.position }, props: { ...body.props } };
    cascadeRef.current = 0;
    // Also carry it on the system clipboard for cross-tab/external paste.
    navigator.clipboard?.writeText(bodyToShareText(body)).catch(() => {});
  };

  const pasteClipboard = async () => {
    if (!building) return;
    let snapshot = clipboardRef.current;
    if (!snapshot) {
      // Nothing copied in this tab — fall back to the system clipboard.
      try {
        snapshot = bodyFromShareText(await navigator.clipboard.readText());
      } catch {
        snapshot = null;
      }
    }
    if (!snapshot) return;
    // At the pointer when it's over the canvas; otherwise cascade off the source.
    const at = hoverWorldRef.current ?? cascadeFrom(snapshot.position);
    spawnClone(snapshot, at);
  };

  /** Cmd/Ctrl+D and the mobile button: duplicate the current selection. */
  const duplicateSelection = () => {
    const id = selectedRef.current;
    if (!building || !id) return;
    const body = bodyById(id);
    if (!body) return;
    // Fixed step off the current selection — not the paste cascade. Because
    // spawnClone selects the new body, repeated Cmd+D walks a clean staircase
    // off whichever piece is selected now, so moving the selection (or picking
    // a different one) naturally rebases without the offset compounding.
    spawnClone(body, { x: body.position.x + CASCADE, y: body.position.y - CASCADE });
  };

  const copyRef = useRef(copySelection);
  copyRef.current = copySelection;
  const pasteRef = useRef(pasteClipboard);
  pasteRef.current = pasteClipboard;
  const duplicateRef = useRef(duplicateSelection);
  duplicateRef.current = duplicateSelection;

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
  // A drop is valid if the pointer lands on the main canvas OR on the open
  // spawner-popover canvas (which routes the body into the template — issue
  // 19 drop-target-decides-scope). Spawners can't be nested, so dragging a
  // Spawner tile over the popover reports "not droppable" — the ghost goes
  // red and the release becomes a no-op. Used by the palette ghost and the
  // drop handler below.
  const isDroppableAt = (clientX: number, clientY: number, type: BodyType): boolean => {
    if (document.elementFromPoint(clientX, clientY) === canvasRef.current) return true;
    const overPopover = spawnerPopoverRef.current?.pointToTemplate(clientX, clientY) != null;
    if (!overPopover) return false;
    return type !== "spawner"; // nested spawners are blocked at the UI too
  };

  /**
   * Drop one body at the pointer position. If the pointer is over the open
   * spawner popover, add to that spawner's template (in template-local
   * coords); otherwise add to the scene as today. Spawner-in-spawner drops
   * are blocked here so the UI can't author what the sanitizer would just
   * strip on round-trip. Selection moves to the newly-added body only for
   * scene drops — template drops leave the spawner selected so the popover
   * stays open and the user can keep authoring.
   */
  const dropBodyAtPointer = (type: BodyType, e: React.PointerEvent) => {
    if (!building) return;
    const selected = selectedRef.current ? bodyById(selectedRef.current) : null;
    if (selected?.type === "spawner") {
      const templatePoint = spawnerPopoverRef.current?.pointToTemplate(e.clientX, e.clientY);
      if (templatePoint) {
        if (type === "spawner") return; // no nested spawners (silently dropped)
        const newBody = makeBody(type, templatePoint);
        const added = addBodyToTemplate(sceneRef.current, 0, selected.id, newBody);
        if (added) commitScene(added.scene);
        return;
      }
    }
    if (document.elementFromPoint(e.clientX, e.clientY) !== canvasRef.current) return;
    const raw = worldAt(e);
    const world = snapOn() ? snapToGrid(raw, GRID_SIZE) : raw;
    const newBody = makeBody(type, world);
    const size = sceneRef.current.rooms[0].settings.size;
    const added = addBody(sceneRef.current, 0, {
      ...newBody,
      position: clampInsideRoom(size, newBody, world),
    });
    commitScene(added.scene);
    select(added.id);
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
    setGhost({ type: placingRef.current, x: e.clientX, y: e.clientY, droppable: isDroppableAt(e.clientX, e.clientY, placingRef.current!) });
  };
  const onPaletteUp = (e: React.PointerEvent) => {
    const type = placingRef.current;
    const draggedOff = draggedOffRef.current;
    placingRef.current = null;
    paletteOriginRef.current = null;
    draggedOffRef.current = false;
    setGhost(null);
    if (!type || !draggedOff) return;
    dropBodyAtPointer(type, e);
  };

  // Mobile palette drag-to-place. The strip is natively pan-x scrollable
  // (touch-action: pan-x), but iOS would commit to native horizontal pan as
  // soon as a touch starts on a tile — silently swallowing any subsequent
  // upward motion. To rescue the upward intent we attach a non-passive
  // touchmove listener (see the useEffect just below) that calls
  // preventDefault the moment vertical movement is detected, claiming the
  // gesture back from iOS before native scroll commits. Horizontal swipes
  // are left untouched, so native scroll handles them as before.
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
        mobileDragStartRef.current = null; // sideways → let native scroll
        return;
      }
      if (dy > -10) return; // wait for a deliberate upward lift
      placingRef.current = start.type;
      draggedOffRef.current = true;
      capture(e.currentTarget as HTMLElement, e.pointerId);
    }
    setGhost({ type: placingRef.current!, x: e.clientX, y: e.clientY, droppable: isDroppableAt(e.clientX, e.clientY, placingRef.current!) });
  };
  const onStripUp = (e: React.PointerEvent) => {
    const type = placingRef.current;
    mobileDragStartRef.current = null;
    placingRef.current = null;
    draggedOffRef.current = false;
    setGhost(null);
    if (!type) return;
    dropBodyAtPointer(type, e);
  };
  const onStripCancel = () => {
    mobileDragStartRef.current = null;
    placingRef.current = null;
    draggedOffRef.current = false;
    setGhost(null);
  };

  // Non-passive touchmove listener so we can preventDefault on vertical
  // intent. React event props attach passively for touch events, which on
  // iOS lets the browser commit to native pan-x scroll before our handlers
  // can react — and once committed, the rest of the upward gesture is
  // silently absorbed. We attach directly with `{ passive: false }` so we
  // can call preventDefault on the first vertical-dominant move, yanking
  // the gesture back to JS in time for onStripMove to drive the place.
  //
  // Critically this uses a *callback ref* rather than useEffect+stripRef,
  // because the strip-row lives inside a vaul Drawer.Portal that mounts
  // asynchronously — a useEffect with [] deps fires before the portal's
  // children land in the DOM, so the ref is still null and the listeners
  // would never attach. The callback fires the moment React commits the
  // node, no matter how the parent portal handles its children.
  const stripDetachRef = useRef<(() => void) | null>(null);
  const attachStrip = (el: HTMLDivElement | null) => {
    stripDetachRef.current?.();
    stripDetachRef.current = null;
    stripRef.current = el;
    if (!el) return;
    let startX = 0;
    let startY = 0;
    let decided = false;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      decided = false;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (decided || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (Math.abs(dy) >= Math.abs(dx) && Math.abs(dy) > 6) {
        e.preventDefault();
        decided = true;
      } else if (Math.abs(dx) > 6) {
        decided = true;
      }
    };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    stripDetachRef.current = () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
    };
  };

  const onRoomChange = (patch: Partial<RoomSettings>) => {
    commitScene(updateRoomSettings(sceneRef.current, 0, patch), { mergeKey: "room" });
  };

  // Set or clear `scene.title` (issue og-share/01). Routed through
  // `commitScene` so autosave picks it up immediately and typing collapses
  // into a single undo step.
  const renameScene = (title: string) => {
    const next = { ...sceneRef.current };
    if (title) next.title = title;
    else delete next.title;
    commitScene(next, { mergeKey: "title" });
  };

  // ----- saved builds (sessions) -----
  const openBuilds = () => setBuilds(listSessions());
  const refreshBuilds = () => setBuilds(listSessions());

  /** Switch this tab to a scene, dropping to build mode and reframing. */
  const adoptScene = (scene: Scene) => {
    reset();
    sceneRef.current = scene;
    // Different build = different timeline; carrying old undo entries forward
    // would let Cmd+Z replay them onto a scene they don't belong to.
    historyRef.current.clear();
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
      <div className="palette-label">Shapes</div>
      {bodyTypes().map((d) => (
        <DoodleTooltip key={d.type} content={`Drag to place a ${d.label.toLowerCase()}`}>
          <span className="doodle-tooltip-trigger">
            <button
              className="palette-item"
              disabled={!building}
              onPointerDown={onPaletteDown(d.type)}
              onPointerMove={onPaletteMove}
              onPointerUp={onPaletteUp}
            >
              <BodyPreview type={d.type} />
              <span>{d.label}</span>
            </button>
          </span>
        </DoodleTooltip>
      ))}
      <div className="palette-divider">Connect</div>
      {connectorTypes().map((c) => (
        <DoodleTooltip
          key={c.type}
          content={`${c.help}\n\n${
            c.type === "spring"
              ? "Draw it: drag from one point to another."
              : "Place it: click where two bodies overlap."
          }`}
        >
          <span className="doodle-tooltip-trigger">
            <button
              className={`palette-connector${connectorTool === c.type ? " active" : ""}`}
              disabled={!building}
              onClick={() => armConnector(c.type)}
            >
              <ConnectorPreview type={c.type} />
              <span>{c.label}</span>
            </button>
          </span>
        </DoodleTooltip>
      ))}
    </>
  );

  // Palette for the vaul drawer: bodies drag up onto the canvas to place;
  // connectors arm on tap. `data-vaul-no-drag` keeps vaul from treating these
  // gestures as a drawer drag, so our handlers own them. Duplicate/Delete
  // tail the strip so the most common edits are one tap away on the peek
  // snap — they don't live in the drawer's actions row on mobile.
  const mobilePaletteEls = (
    <>
      <div className="strip-section">Shapes</div>
      {bodyTypes().map((d) => (
        <DoodleTooltip key={d.type} content={`Drag up to place a ${d.label.toLowerCase()}`}>
          <span className="doodle-tooltip-trigger">
            <button
              className="palette-item"
              data-vaul-no-drag
              disabled={!building}
              onPointerDown={onStripDown(d.type)}
              onPointerMove={onStripMove}
              onPointerUp={onStripUp}
              onPointerCancel={onStripCancel}
            >
              <BodyPreview type={d.type} />
              <span>{d.label}</span>
            </button>
          </span>
        </DoodleTooltip>
      ))}
      <div className="strip-divider" aria-hidden />
      <div className="strip-section">Connect</div>
      {connectorTypes().map((c) => (
        <button
          key={c.type}
          className={`palette-connector${connectorTool === c.type ? " active" : ""}`}
          data-vaul-no-drag
          disabled={!building}
          onClick={() => armConnector(c.type)}
        >
          <ConnectorPreview type={c.type} />
          <span>{c.label}</span>
        </button>
      ))}
      <div className="strip-divider" aria-hidden />
      <div className="strip-section">Edit</div>
      <button
        className="palette-connector palette-action"
        data-vaul-no-drag
        disabled={!canUndo}
        onClick={doUndo}
        aria-label="Undo"
      >
        <span className="palette-action-glyph"><Icon name="undo" /></span>
        <span>Undo</span>
      </button>
      <button
        className="palette-connector palette-action"
        data-vaul-no-drag
        disabled={!canRedo}
        onClick={doRedo}
        aria-label="Redo"
      >
        <span className="palette-action-glyph"><Icon name="redo" /></span>
        <span>Redo</span>
      </button>
      <button
        className="palette-connector palette-action"
        data-vaul-no-drag
        disabled={!building || !selected || !bodyById(selected)}
        onClick={duplicateSelection}
        aria-label="Duplicate"
      >
        <span className="palette-action-glyph"><Icon name="copy" /></span>
        <span>Duplicate</span>
      </button>
      <button
        className="palette-connector palette-action"
        data-vaul-no-drag
        disabled={!building || !selected}
        onClick={deleteSelected}
        aria-label="Delete"
      >
        <span className="palette-action-glyph"><Icon name="delete" /></span>
        <span>Delete</span>
      </button>
    </>
  );

  // Desktop-only edit actions: on mobile these live as tiles at the tail of
  // the palette strip so they're reachable on the peek snap.
  const editActionsEls = (
    <>
      <DoodleTooltip content="Undo">
        <span className="doodle-tooltip-trigger">
          <button
            className="icon-btn"
            onClick={doUndo}
            disabled={!canUndo}
            aria-label="Undo"
          >
            <DoodleBorder interactive />
            <Icon name="undo" />
          </button>
        </span>
      </DoodleTooltip>
      <DoodleTooltip content="Redo">
        <span className="doodle-tooltip-trigger">
          <button
            className="icon-btn"
            onClick={doRedo}
            disabled={!canRedo}
            aria-label="Redo"
          >
            <DoodleBorder interactive />
            <Icon name="redo" />
          </button>
        </span>
      </DoodleTooltip>
      <DoodleTooltip content="Duplicate">
        <span className="doodle-tooltip-trigger">
          <button
            className="icon-btn"
            onClick={duplicateSelection}
            disabled={!building || !selected || !bodyById(selected)}
            aria-label="Duplicate"
          >
            <DoodleBorder interactive />
            <Icon name="copy" />
          </button>
        </span>
      </DoodleTooltip>
      <DoodleTooltip content="Delete">
        <span className="doodle-tooltip-trigger">
          <button
            className="icon-btn"
            onClick={deleteSelected}
            disabled={!building || !selected}
            aria-label="Delete"
          >
            <DoodleBorder interactive />
            <Icon name="delete" />
          </button>
        </span>
      </DoodleTooltip>
    </>
  );

  // Shared between mobile drawer and desktop actions panel.
  const shareActionsEls = (
    <>
      <DoodleTooltip content="Share this build">
        <button onClick={() => setShareOpen(true)} aria-label="Share this build">
          <DoodleBorder interactive />
          <Icon name="link" /> <span>Share</span>
        </button>
      </DoodleTooltip>
      <DoodleTooltip content="Browse your saved builds">
        <button onClick={openBuilds} aria-label="Browse your saved builds">
          <DoodleBorder interactive />
          <span>Builds</span>
        </button>
      </DoodleTooltip>
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

  // Editing a template body's props inside a spawner: route via
  // updateBodyInTemplate against the *currently-selected* spawner (which
  // owns the template body). Slider scrubs collapse into one undo step per
  // (template body, prop key) with the same mergeKey scheme as root bodies.
  const onTemplatePropChange = (patch: Props) => {
    if (!selectedBody || selectedBody.type !== "spawner" || !templateBody) return;
    const next = updateBodyInTemplate(sceneRef.current, 0, selectedBody.id, templateBody.id, {
      props: { ...templateBody.props, ...patch },
    });
    const keys = Object.keys(patch).join(",");
    commitScene(next, { mergeKey: `tprop:${templateBody.id}:${keys}` });
  };

  const rightPanelEl = liveMotor ? (
    <PropertyPanel
      title={connectorDef(liveMotor.type).label}
      schema={connectorDef(liveMotor.type).propSchema}
      props={liveMotor.props}
      onChange={onPropChange}
    />
  ) : (
    building && (
      templateBody ? (
        // A body inside the open spawner's template — its props panel takes
        // precedence over the spawner's so the user can tweak the item itself.
        <PropertyPanel
          title={def(templateBody.type).label}
          schema={def(templateBody.type).propSchema}
          props={templateBody.props}
          onChange={onTemplatePropChange}
        />
      ) : selectedBody ? (
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
              const thumb = loadThumbnail(s.id);
              return (
                <li key={s.id} className={`build-row${current ? " current" : ""}`}>
                  {thumb ? (
                    <img className="build-thumb" src={thumb} alt="" />
                  ) : (
                    <span className="build-thumb empty" />
                  )}
                  <div className="build-meta">
                    <input
                      className="build-title"
                      value={s.title}
                      onChange={(e) => renameBuild(s.id, e.target.value)}
                      aria-label="Build name"
                    />
                    <span className="build-time">{relTime(s.updatedAt)}</span>
                  </div>
                  <button onClick={() => openBuild(s.id)} disabled={current}>
                    {current ? "Current" : "Open"}
                  </button>
                  <DoodleTooltip content="Delete build">
                    <button
                      className="build-del"
                      onClick={() => removeBuild(s.id)}
                      aria-label="Delete build"
                    >
                      ×
                    </button>
                  </DoodleTooltip>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <DoodleTooltipProvider>
    <div className={`app${mobile ? " mobile" : ""}`}>
      <canvas
        ref={canvasRef}
        className="stage"
        style={{ cursor: connectorTool ? "crosshair" : "default" }}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}
        onPointerCancel={onCanvasPointerUp}
        onPointerLeave={() => (hoverWorldRef.current = null)}
      />

      {/* Transport — floating top-center */}
      <div className="panel transport">
        <DoodleBorder strokeWidth={2.5} />
        <DoodleTooltip content={simReady ? "Play" : "Loading physics…"}>
          <span className="doodle-tooltip-trigger">
            <button
              onClick={play}
              disabled={!simReady || state === "running"}
              aria-label="Play"
            >
              <DoodleBorder interactive />
              <Icon name="play" />
            </button>
          </span>
        </DoodleTooltip>
        <DoodleTooltip content="Pause">
          <span className="doodle-tooltip-trigger">
            <button
              onClick={pause}
              disabled={!ready || state !== "running"}
              aria-label="Pause"
            >
              <DoodleBorder interactive />
              <Icon name="pause" />
            </button>
          </span>
        </DoodleTooltip>
        <DoodleTooltip content="Reset">
          <span className="doodle-tooltip-trigger">
            <button
              onClick={reset}
              disabled={!ready || state === "build"}
              aria-label="Reset"
            >
              <DoodleBorder interactive />
              <Icon name="reset" />
            </button>
          </span>
        </DoodleTooltip>
        <DoodleTooltip content="Fit view to room">
          <span className="doodle-tooltip-trigger">
            <button onClick={fitView} disabled={!ready} aria-label="Fit view to room">
              <DoodleBorder interactive />
              <Icon name="fit" />
            </button>
          </span>
        </DoodleTooltip>
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
                <div ref={attachStrip} className="strip-row" aria-disabled={!building}>
                  {mobilePaletteEls}
                </div>
                <div className="drawer-props">
                  <div className="drawer-context">{contextLabel}</div>
                  <div className="sheet-actions">{shareActionsEls}</div>
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
            <DoodleBorder strokeWidth={2.5} />
            {paletteEls}
          </div>

          {/* Contextual actions — floating bottom-center */}
          <div className="panel actions">
            <DoodleBorder strokeWidth={2.5} />
            {editActionsEls}
            {shareActionsEls}
            <span className="tip">{tipText}</span>
          </div>

          {/* Right panel — properties for the selected body/connector, else room */}
          {rightPanelEl}
        </>
      )}

      {/* Saved-builds list (overlay), opened from the actions row. */}
      {buildsEl}

      {/* Share popover (og-share issue 03). Centered overlay; minting a
          shortlink only happens on Copy click, so opening this is cheap. */}
      {shareOpen && (
        <SharePopover
          scene={sceneRef.current}
          onRenameScene={renameScene}
          onClose={() => setShareOpen(false)}
        />
      )}

      {/* Spawner template popover (issue 19). Opens whenever a spawner is
          selected in design mode; hides transiently while the glyph is being
          dragged. Read-only canvas + a tiny tile palette for authoring the
          template. */}
      {building && selectedBody?.type === "spawner" && canvasRef.current && (
        <SpawnerPopover
          ref={spawnerPopoverRef}
          template={selectedBody.template ?? { bodies: [], connectors: [] }}
          anchor={(() => {
            const screen = worldToScreen(cameraRef.current, selectedBody.position);
            const rect = canvasRef.current.getBoundingClientRect();
            return { x: screen.x + rect.left, y: screen.y + rect.top };
          })()}
          mainScale={cameraRef.current.scale}
          selectedId={templateSelected}
          hidden={spawnerInteracting}
          onSelect={setTemplateSelected}
          onBeginGesture={() => {
            // Capture the pre-gesture scene so the whole gesture (move,
            // resize, or rotate inside the popover) lands as a single undo
            // entry, mirroring the canvas body-drag lifecycle.
            gestureStartRef.current = sceneRef.current;
          }}
          onUpdateBody={(bodyId, patch) => {
            sceneRef.current = updateBodyInTemplate(
              sceneRef.current,
              0,
              selectedBody.id,
              bodyId,
              patch,
            );
            bump();
          }}
          onCommitGesture={commitGesture}
          onCancelGesture={() => {
            // Drop the in-flight drafts and revert to the pre-gesture scene —
            // the subsequent onRemove records one clean undo entry.
            if (gestureStartRef.current) {
              sceneRef.current = gestureStartRef.current;
              gestureStartRef.current = null;
              bump();
            }
          }}
          onRemove={(bodyId) => {
            // Removing a template body also clears it from templateSelected
            // so the right-panel falls back to the spawner's own props.
            if (templateSelected === bodyId) setTemplateSelected(null);
            commitScene(removeBodyFromTemplate(sceneRef.current, 0, selectedBody.id, bodyId));
          }}
        />
      )}

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
    </DoodleTooltipProvider>
  );
}
