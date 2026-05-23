import { useState } from "react";
import type { Props, PropField } from "../registry/registry";
import type { RoomSettings, Vec2 } from "../scene/scene";
import { PropertyPanel } from "./PropertyPanel";

const RAD = Math.PI / 180;

const strengthOf = (g: Vec2) => Math.hypot(g.x, g.y);
/** Gravity direction in degrees, 0 = straight down, increasing counter-clockwise. */
function angleOf(g: Vec2): number {
  if (strengthOf(g) < 1e-6) return 0;
  return ((Math.atan2(g.x, -g.y) / RAD) + 360) % 360;
}
/** Build a gravity vector from a strength and a direction (0° = down). */
function gravityVec(strength: number, deg: number): Vec2 {
  const a = deg * RAD;
  return { x: strength * Math.sin(a), y: -strength * Math.cos(a) };
}

/**
 * Room-level settings, rendered through the generic schema-driven
 * `PropertyPanel`. Gravity decomposes into two schema fields — strength
 * (number) and direction (angle) — so the dial flows through the same control
 * vocabulary as body/connector properties (issue 09 acceptance criterion).
 *
 * RoomSettings stores gravity as a `Vec2` (the source of truth for the sim);
 * we translate Vec → (strength, direction) for editing, and recompose on every
 * patch. Direction is held in local state so a chosen angle survives a zero
 * strength (otherwise the angle would snap back to 0 when strength→0 makes the
 * vector collapse).
 */
const ROOM_SCHEMA: PropField[] = [
  {
    key: "gravityStrength",
    label: "Gravity",
    kind: "number",
    min: 0,
    max: 20,
    step: 0.5,
    help: "How strongly things fall. Zero is space.",
  },
  {
    key: "gravityDirection",
    label: "Direction",
    kind: "angle",
    help: "Which way gravity pulls. 0° is straight down.",
  },
  { key: "wallFloor", label: "Floor", kind: "boolean" },
  { key: "wallCeiling", label: "Ceiling", kind: "boolean" },
  { key: "wallLeft", label: "Left wall", kind: "boolean" },
  { key: "wallRight", label: "Right wall", kind: "boolean" },
];

export function RoomSettingsPanel({
  settings,
  onChange,
}: {
  settings: RoomSettings;
  onChange: (patch: Partial<RoomSettings>) => void;
}) {
  // Direction kept in local state so it survives strength→0 → vector collapse.
  const [angle, setAngle] = useState(() => angleOf(settings.gravity));

  const props: Props = {
    gravityStrength: strengthOf(settings.gravity),
    gravityDirection: angle,
    wallFloor: settings.walls.floor,
    wallCeiling: settings.walls.ceiling,
    wallLeft: settings.walls.left,
    wallRight: settings.walls.right,
  };

  const handlePatch = (patch: Props) => {
    if ("gravityStrength" in patch || "gravityDirection" in patch) {
      const s = (patch.gravityStrength as number | undefined) ?? props.gravityStrength as number;
      const a = (patch.gravityDirection as number | undefined) ?? props.gravityDirection as number;
      if (patch.gravityDirection !== undefined) setAngle(a);
      onChange({ gravity: gravityVec(s, a) });
      return;
    }
    const wallKey = Object.keys(patch).find((k) => k.startsWith("wall"));
    if (wallKey) {
      const key = wallKey.replace(/^wall/, "").toLowerCase() as keyof RoomSettings["walls"];
      onChange({ walls: { ...settings.walls, [key]: patch[wallKey] as boolean } });
    }
  };

  return <PropertyPanel title="Room" schema={ROOM_SCHEMA} props={props} onChange={handlePatch} />;
}
