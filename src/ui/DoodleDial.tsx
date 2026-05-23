import { useMemo, useRef } from "react";
import rough from "roughjs";
import type { RoughGenerator } from "roughjs/bin/generator";
import { RoughGroup, useInstanceSeed } from "./rough-react";

const INK = "#2b2b2b";
const ACCENT = "#1f7a3d";
const RAD = Math.PI / 180;

/**
 * Doodle dial — Rough.js version of the angle control. Used both by the
 * schema-driven property panel (for any `PropField` of `kind: "angle"`) and
 * by RoomSettingsPanel for gravity direction.
 *
 * Angle convention matches the original DirectionDial it replaces:
 *  - 0°  = arrow points straight **down**
 *  - 90° = arrow points right
 *  - increasing CCW (when looking at the screen)
 *
 * Stability — the dial face, tick marks, and the arrow itself are all
 * memoized. To show a value, the arrow group is rotated via SVG
 * `transform`; the underlying drawables never regenerate, so the wobble
 * stays stable (PRD "no shimmer" rule).
 *
 * Accessibility — implements the WAI-ARIA slider pattern over [0, 360).
 * Pointer scrub by drag (pointer captured); arrow keys nudge by a small step.
 */
export function DoodleDial({
  value,
  onChange,
  size = 72,
  disabled = false,
  label,
  step = 5,
}: {
  value: number;
  onChange: (deg: number) => void;
  size?: number;
  disabled?: boolean;
  label?: string;
  step?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const r = size / 2;
  const faceRadius = r - 8; // inner radius, matches DirectionDial
  const reach = faceRadius - 2;

  const gen: RoughGenerator = useMemo(() => rough.generator(), []);
  const seed = useInstanceSeed();

  // Dial face — a hand-drawn paper-fill disc.
  const faceDrawable = useMemo(
    () =>
      gen.circle(r, r, faceRadius * 2, {
        stroke: INK,
        strokeWidth: 2.2,
        fill: "#fff",
        fillStyle: "solid",
        roughness: 1.5,
        bowing: 1.4,
        seed: seed + 31,
      }),
    [gen, r, faceRadius, seed],
  );

  // Cardinal tick marks at 0/90/180/270 — same convention as the dial value.
  const tickDrawables = useMemo(
    () =>
      [0, 90, 180, 270].map((d, i) => {
        const t = d * RAD;
        const x1 = r + Math.sin(t) * (faceRadius - 5);
        const y1 = r + Math.cos(t) * (faceRadius - 5);
        const x2 = r + Math.sin(t) * faceRadius;
        const y2 = r + Math.cos(t) * faceRadius;
        return gen.line(x1, y1, x2, y2, {
          stroke: INK,
          strokeWidth: 1.3,
          roughness: 1.5,
          seed: seed + 40 + i,
        });
      }),
    [gen, r, faceRadius, seed],
  );

  // Arrow stem — drawn pointing **down** at zero rotation. We rotate the whole
  // arrow group to position the tip at the live value.
  const armDrawable = useMemo(
    () =>
      gen.line(r, r, r, r + reach, {
        stroke: INK,
        strokeWidth: 2.6,
        roughness: 1.3,
        bowing: 1.2,
        seed: seed + 17,
      }),
    [gen, r, reach, seed],
  );

  // Tip blob — a small accent-coloured circle at the end of the arm. Drawn at
  // the arm's tip (cx, cy+reach) in the unrotated frame.
  const tipDrawable = useMemo(
    () =>
      gen.circle(r, r + reach, 13, {
        stroke: INK,
        strokeWidth: 1.6,
        fill: ACCENT,
        fillStyle: "solid",
        roughness: 1.1,
        seed: seed + 23,
      }),
    [gen, r, reach, seed],
  );

  // Center pivot — a tiny ink dot.
  const pivotDrawable = useMemo(
    () =>
      gen.circle(r, r, 5, {
        stroke: INK,
        strokeWidth: 1.4,
        fill: INK,
        fillStyle: "solid",
        roughness: 0.7,
        seed: seed + 19,
      }),
    [gen, r, seed],
  );

  // SVG rotate is clockwise-positive in screen coords. Our angle convention is
  // CCW-positive (0°=down → 90°=right). Going "down → right" is a 90° CCW
  // rotation in screen coords, so SVG rotation = `-value`.
  const transform = `rotate(${-value} ${r} ${r})`;

  const angleFromEvent = (clientX: number, clientY: number) => {
    const box = ref.current!.getBoundingClientRect();
    const dx = clientX - (box.left + box.width / 2);
    const dy = clientY - (box.top + box.height / 2);
    if (dx === 0 && dy === 0) return value;
    // atan2(dx, dy) matches the (sin, cos) convention: 0° = down, CCW positive.
    return ((Math.atan2(dx, dy) / RAD) + 360) % 360;
  };

  const onDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
    onChange(angleFromEvent(e.clientX, e.clientY));
  };
  const onMove = (e: React.PointerEvent) => {
    if (disabled || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    onChange(angleFromEvent(e.clientX, e.clientY));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      onChange((value - step + 360) % 360);
      e.preventDefault();
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      onChange((value + step) % 360);
      e.preventDefault();
    }
  };

  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      className={`doodle-dial${disabled ? " disabled" : ""}`}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={value}
      tabIndex={disabled ? -1 : 0}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onKeyDown={onKey}
    >
      <RoughGroup gen={gen} drawable={faceDrawable} />
      {tickDrawables.map((d, i) => (
        <RoughGroup key={`tick-${i}`} gen={gen} drawable={d} opacity={0.55} />
      ))}
      <g transform={transform}>
        <RoughGroup gen={gen} drawable={armDrawable} />
        <RoughGroup gen={gen} drawable={tipDrawable} />
      </g>
      <RoughGroup gen={gen} drawable={pivotDrawable} />
    </svg>
  );
}
