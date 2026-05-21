import { useEffect, useRef, useState } from "react";
import {
  tracerScene,
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
import { createClock, type Clock, type ClockState } from "./clock/clock";
import { initSim, compile, type SimWorld, type BodyTransform } from "./sim/sim";
import { type Camera, fitCamera, screenToWorld } from "./renderer/camera";
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
  bodyAtPoint,
  connectorAtPoint,
  endpointWorld,
  handleAtPoint,
  applyResize,
  applyRotation,
  type HandleId,
} from "./editor/editor";
import { snap as snapEndpoint, endpointOf, type SnapResult } from "./snapping/snapping";
import { BodyPreview } from "./ui/BodyPreview";
import { PropertyPanel } from "./ui/PropertyPanel";
import { RoomSettingsPanel } from "./ui/RoomSettingsPanel";

/** Click tolerance (px) for grabbing a resize/rotate handle. */
const HANDLE_PX = 12;
/** Snap radius (px) for binding a connector endpoint to a named anchor. */
const ANCHOR_PX = 20;
/** Pick tolerance (px) for selecting a connector by its line. */
const CONNECTOR_PX = 10;
/** Grab tolerance (px) for a selected connector's endpoint handle. */
const ENDPOINT_PX = 12;

const FIXED_DT = 1 / 60;
const GRID_SIZE = 0.5; // meters
/** Framing margin (meters) around the room so the boundary walls stay visible. */
const VIEW_MARGIN = 1.2;

function capture(el: Element | null, pointerId: number) {
  try {
    el?.setPointerCapture(pointerId);
  } catch {
    /* no-op */
  }
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

  const sceneRef = useRef<Scene>(tracerScene());
  const selectedRef = useRef<string | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const handleDragRef = useRef<HandleId | null>(null);
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

  const [ready, setReady] = useState(false);
  const [state, setState] = useState<ClockState>("build");
  const [selected, setSelected] = useState<string | null>(null);
  const [connectorTool, setConnectorTool] = useState<ConnectorType | null>(null);
  const [ghost, setGhost] = useState<{ type: BodyType; x: number; y: number; droppable: boolean } | null>(null);
  const [, setRevision] = useState(0);
  const bump = () => setRevision((r) => r + 1);

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
      const size = sceneRef.current.rooms[0].settings.size;
      cameraRef.current = fitCamera(size.width, size.height, canvas.width, canvas.height, VIEW_MARGIN);
      rendererRef.current?.setCamera(cameraRef.current);
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
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      worldRef.current?.free();
      worldRef.current = null;
    };
  }, []);

  // Delete/Backspace removes the selection; Escape cancels a connector draw.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") deleteSelectedRef.current();
      else if (e.key === "Escape") cancelConnectorRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

  const onCanvasPointerDown = (e: React.PointerEvent) => {
    if (!building) return;
    const raw = worldAt(e);

    // Connector tool armed → begin drawing from the snapped start point.
    if (connectorToolRef.current) {
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
        capture(canvasRef.current, e.pointerId);
        return;
      }
    }

    // Else select+drag a body, else select a connector, else deselect.
    const world = snapOn() ? snapToGrid(raw, GRID_SIZE) : raw;
    const hitBody = bodyAtPoint(sceneRef.current, 0, world);
    if (hitBody) {
      select(hitBody);
      const body = bodyById(hitBody)!;
      dragOffsetRef.current = { x: body.position.x - world.x, y: body.position.y - world.y };
      capture(canvasRef.current, e.pointerId);
      return;
    }
    const hitConn = connectorAtPoint(sceneRef.current, 0, raw, CONNECTOR_PX / cameraRef.current.scale);
    select(hitConn);
  };

  const onCanvasPointerMove = (e: React.PointerEvent) => {
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
      sceneRef.current = updateBody(sceneRef.current, 0, id, {
        position: snapOn() ? snapToGrid(moved, GRID_SIZE) : moved,
      });
    }
  };

  const onCanvasPointerUp = (e: React.PointerEvent) => {
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
    if (canvasRef.current?.hasPointerCapture(e.pointerId)) {
      canvasRef.current.releasePointerCapture(e.pointerId);
    }
  };

  /** Create a connector from two snap results, unless it's degenerate. */
  const finishConnector = (type: ConnectorType, a: SnapResult, b: SnapResult) => {
    const epA = endpointOf(a);
    const epB = endpointOf(b);
    // No self-joints, and no zero-length connector in empty space.
    const sameBody = isBodyEndpoint(epA) && isBodyEndpoint(epB) && epA.body === epB.body;
    const gap = Math.hypot(a.world.x - b.world.x, a.world.y - b.world.y);
    if (sameBody || (gap < 0.05 && type !== "pin")) return;

    const conn = makeConnector(type, epA, epB);
    if (type === "spring") conn.props.restLength = Math.max(0.1, gap);
    const added = addConnector(sceneRef.current, 0, conn);
    sceneRef.current = added.scene;
    select(added.id);
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
      sceneRef.current = updateConnector(sceneRef.current, 0, id, { props: { ...conn.props, ...patch } });
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
    const added = addBody(sceneRef.current, 0, makeBody(type, world));
    sceneRef.current = added.scene;
    select(added.id);
  };

  const onRoomChange = (patch: Partial<RoomSettings>) => {
    sceneRef.current = updateRoomSettings(sceneRef.current, 0, patch);
    bump();
  };
  const toggleSnap = () => onRoomChange({ snap: !snapOn() });

  return (
    <div className="app">
      <canvas
        ref={canvasRef}
        className="stage"
        style={{ cursor: connectorTool ? "crosshair" : "default" }}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}
      />

      {/* Transport — floating top-center */}
      <div className="panel transport">
        <button onClick={play} disabled={!ready || state === "running"} title="Play">▶</button>
        <button onClick={pause} disabled={!ready || state !== "running"} title="Pause">⏸</button>
        <button onClick={reset} disabled={!ready || state === "build"} title="Reset">↺</button>
        <span className="state">{ready ? state : "loading…"}</span>
      </div>

      {/* Palette — floating left: drag a body in; click a connector to draw it */}
      <div className="panel palette" aria-disabled={!building}>
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
            title={`${c.help}\n\nDraw it: drag from one point to another.`}
            disabled={!building}
            onClick={() => armConnector(c.type)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Contextual actions — floating bottom-center */}
      <div className="panel actions">
        <button onClick={deleteSelected} disabled={!building || !selected}>🗑 Delete</button>
        <label className="snap">
          <input type="checkbox" checked={snap} onChange={toggleSnap} disabled={!building} />
          Grid snap
        </label>
        <span className="tip">
          {!building
            ? "Press ↺ to edit"
            : connectorTool
              ? `Drawing ${connectorTool} — drag from one anchor to another (Esc to cancel)`
              : "Drag a shape in · click to select · drag to move"}
        </span>
      </div>

      {/* Right panel — properties for the selected body/connector, else room */}
      {building &&
        (selectedBody ? (
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
        ))}

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
