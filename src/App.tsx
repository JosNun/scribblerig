import { useEffect, useRef, useState } from "react";
import {
  tracerScene,
  addBody,
  removeBody,
  updateBody,
  updateRoomSettings,
  type Scene,
  type BodyType,
  type RoomSettings,
} from "./scene/scene";
import { createClock, type Clock, type ClockState } from "./clock/clock";
import { initSim, compile, type SimWorld, type BodyTransform } from "./sim/sim";
import { type Camera, fitCamera, screenToWorld } from "./renderer/camera";
import { createRenderer, type Renderer } from "./renderer/renderer";
import { bodyTypes, makeBody, type Props } from "./registry/registry";
import {
  snapToGrid,
  bodyAtPoint,
  handleAtPoint,
  applyResize,
  applyRotation,
  type HandleId,
} from "./editor/editor";
import { BodyPreview } from "./ui/BodyPreview";
import { PropertyPanel } from "./ui/PropertyPanel";
import { RoomSettingsPanel } from "./ui/RoomSettingsPanel";

/** Click tolerance (px) for grabbing a resize/rotate handle. */
const HANDLE_PX = 12;

const FIXED_DT = 1 / 60;
const GRID_SIZE = 0.5; // meters
/** Framing margin (meters) around the room so the boundary walls stay visible. */
const VIEW_MARGIN = 1.2;

/** Pointer capture, tolerant of sequences where the pointer isn't capturable. */
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
  // Drag-from-palette: the origin button's rect and whether the pointer has
  // actually left it. A plain click never leaves the button, so it places
  // nothing.
  const paletteOriginRef = useRef<DOMRect | null>(null);
  const draggedOffRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [state, setState] = useState<ClockState>("build");
  const [selected, setSelected] = useState<string | null>(null);
  // `droppable` = the cursor is currently over open stage (a valid drop); when
  // false (back over the palette/panels) the ghost animates out.
  const [ghost, setGhost] = useState<{
    type: BodyType;
    x: number;
    y: number;
    droppable: boolean;
  } | null>(null);
  // Bumped on scene-ref edits the UI must reflect (the canvas redraws from the
  // ref every frame regardless, but React panels need a nudge).
  const [, setRevision] = useState(0);
  const bump = () => setRevision((r) => r + 1);

  const building = state === "build";
  const roomSettings = sceneRef.current.rooms[0].settings;
  const snap = roomSettings.snap;
  const selectedBody = selected
    ? (sceneRef.current.rooms[0].bodies.find((b) => b.id === selected) ?? null)
    : null;
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
      const room = sceneRef.current.rooms[0].settings.size;
      cameraRef.current = fitCamera(room.width, room.height, canvas.width, canvas.height, VIEW_MARGIN);
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
        const transforms =
          world && clock.state !== "build"
            ? world.readTransforms()
            : designTransforms(sceneRef.current);
        rendererRef.current?.draw(
          sceneRef.current,
          transforms,
          clock.state === "build" ? selectedRef.current : null,
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

  // Delete/Backspace removes the selected body in build mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && deleteSelectedRef.current) {
        deleteSelectedRef.current();
      }
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
  const canvasWorld = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const world = screenToWorld(cameraRef.current, { x: clientX - rect.left, y: clientY - rect.top });
    return snapOn() ? snapToGrid(world, GRID_SIZE) : world;
  };

  const bodyById = (id: string) => sceneRef.current.rooms[0].bodies.find((b) => b.id === id);

  // Modeless: a resize/rotate handle on the selected body takes priority; else
  // clicking a body selects+drags it; clicking empty space deselects.
  const onCanvasPointerDown = (e: React.PointerEvent) => {
    if (!building) return;
    const raw = screenToWorld(cameraRef.current, pointerInCanvas(e));

    const sel = selectedRef.current ? bodyById(selectedRef.current) : null;
    if (sel) {
      const handle = handleAtPoint(sel, raw, HANDLE_PX / cameraRef.current.scale);
      if (handle) {
        handleDragRef.current = handle;
        capture(canvasRef.current, e.pointerId);
        return;
      }
    }

    const world = snapOn() ? snapToGrid(raw, GRID_SIZE) : raw;
    const hit = bodyAtPoint(sceneRef.current, 0, world);
    select(hit);
    if (hit) {
      const body = bodyById(hit)!;
      dragOffsetRef.current = { x: body.position.x - world.x, y: body.position.y - world.y };
      capture(canvasRef.current, e.pointerId);
    }
  };
  const onCanvasPointerMove = (e: React.PointerEvent) => {
    if (!building || !selectedRef.current) return;
    const raw = screenToWorld(cameraRef.current, pointerInCanvas(e));
    const id = selectedRef.current;
    const body = bodyById(id);
    if (!body) return;

    if (handleDragRef.current) {
      // Resize/rotate: free (un-snapped) for smooth manipulation.
      if (handleDragRef.current === "rotate") {
        sceneRef.current = updateBody(sceneRef.current, 0, id, { rotation: applyRotation(body, raw) });
      } else {
        const props = { ...body.props, ...applyResize(body, handleDragRef.current, raw) };
        sceneRef.current = updateBody(sceneRef.current, 0, id, { props });
      }
      bump();
      return;
    }
    if (dragOffsetRef.current) {
      const off = dragOffsetRef.current;
      const moved = { x: raw.x + off.x, y: raw.y + off.y };
      const next = snapOn() ? snapToGrid(moved, GRID_SIZE) : moved;
      sceneRef.current = updateBody(sceneRef.current, 0, id, { position: next });
    }
  };
  const onCanvasPointerUp = (e: React.PointerEvent) => {
    dragOffsetRef.current = null;
    handleDragRef.current = null;
    if (canvasRef.current?.hasPointerCapture(e.pointerId)) {
      canvasRef.current.releasePointerCapture(e.pointerId);
    }
  };
  const pointerInCanvas = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPropChange = (patch: Props) => {
    const id = selectedRef.current;
    const body = id ? bodyById(id) : null;
    if (!id || !body) return;
    sceneRef.current = updateBody(sceneRef.current, 0, id, { props: { ...body.props, ...patch } });
    bump();
  };

  const deleteSelected = () => {
    if (!building || !selectedRef.current) return;
    sceneRef.current = removeBody(sceneRef.current, 0, selectedRef.current);
    select(null);
  };
  const deleteSelectedRef = useRef(deleteSelected);
  deleteSelectedRef.current = deleteSelected;

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
    // Show the ghost once the drag has left the button; it stays mounted while
    // dragging and animates in/out as the cursor enters/leaves the stage.
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
    // Drop only over open stage — not over a floating panel.
    if (document.elementFromPoint(e.clientX, e.clientY) !== canvasRef.current) return;
    const world = canvasWorld(e.clientX, e.clientY);
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

      {/* Palette — floating left, drag a shape onto the stage */}
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
      </div>

      {/* Contextual actions — floating bottom-center */}
      <div className="panel actions">
        <button onClick={deleteSelected} disabled={!building || !selected}>🗑 Delete</button>
        <label className="snap">
          <input type="checkbox" checked={snap} onChange={toggleSnap} disabled={!building} />
          Grid snap
        </label>
        <span className="tip">
          {building ? "Drag a shape in · click to select · drag to move" : "Press ↺ to edit"}
        </span>
      </div>

      {/* Right panel — selected body's properties, or room settings if none */}
      {building &&
        (selectedBody ? (
          <PropertyPanel body={selectedBody} onChange={onPropChange} />
        ) : (
          <RoomSettingsPanel settings={roomSettings} onChange={onRoomChange} />
        ))}

      {/* Drag ghost following the cursor, sized to the body's true scale.
          Shrinks/fades out when it's not over a droppable area. */}
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
