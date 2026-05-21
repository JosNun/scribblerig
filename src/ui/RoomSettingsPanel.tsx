import { useState } from "react";
import type { RoomSettings, Vec2 } from "../scene/scene";

const RAD = Math.PI / 180;
type WallKey = keyof RoomSettings["walls"];
const WALLS: WallKey[] = ["floor", "ceiling", "left", "right"];

const strengthOf = (g: Vec2) => Math.hypot(g.x, g.y);
/** Gravity direction in degrees, 0 = straight down, increasing counter-clockwise. */
function angleOf(g: Vec2): number {
  if (strengthOf(g) < 1e-6) return 0;
  return (Math.atan2(g.x, -g.y) / RAD + 360) % 360;
}
/** Build a gravity vector from a strength and a direction (0° = down). */
function gravityVec(strength: number, deg: number): Vec2 {
  const a = deg * RAD;
  return { x: strength * Math.sin(a), y: -strength * Math.cos(a) };
}

/**
 * Room-level settings: gravity (strength + direction, including zero-g) and
 * which wall boundaries are enabled. Edits flow up to the design graph.
 */
export function RoomSettingsPanel({
  settings,
  onChange,
}: {
  settings: RoomSettings;
  onChange: (patch: Partial<RoomSettings>) => void;
}) {
  // Strength/angle held locally so a chosen direction survives zero strength.
  const [strength, setStrength] = useState(() => strengthOf(settings.gravity));
  const [angle, setAngle] = useState(() => angleOf(settings.gravity));

  const applyGravity = (s: number, a: number) => {
    setStrength(s);
    setAngle(a);
    onChange({ gravity: gravityVec(s, a) });
  };
  const toggleWall = (k: WallKey) =>
    onChange({ walls: { ...settings.walls, [k]: !settings.walls[k] } });

  return (
    <div className="panel properties">
      <div className="prop-title">Room</div>

      <label className="prop-row">
        <span className="prop-label">Gravity</span>
        <input
          type="range"
          min={0}
          max={20}
          step={0.5}
          value={strength}
          onChange={(e) => applyGravity(parseFloat(e.target.value), angle)}
        />
        <span className="prop-val">{strength.toFixed(1)}</span>
      </label>

      <label className="prop-row">
        <span className="prop-label">Direction</span>
        <input
          type="range"
          min={0}
          max={359}
          step={1}
          value={angle}
          disabled={strength < 1e-6}
          onChange={(e) => applyGravity(strength, parseFloat(e.target.value))}
        />
        <span className="prop-val">{Math.round(angle)}°</span>
      </label>

      <div className="prop-subtitle">Walls</div>
      {WALLS.map((k) => (
        <label key={k} className="prop-row toggle">
          <input type="checkbox" checked={settings.walls[k]} onChange={() => toggleWall(k)} />
          {k[0].toUpperCase() + k.slice(1)}
        </label>
      ))}
    </div>
  );
}
