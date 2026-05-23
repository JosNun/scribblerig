import { useMemo, useRef } from "react";
import rough from "roughjs";
import type { RoughGenerator } from "roughjs/bin/generator";
import { RoughGroup } from "./rough-react";

const INK = "#2b2b2b";

/**
 * Doodle number scrubber (issue 09).
 *
 * Uses `rough.generator()` to produce stable drawables for the track and the
 * knob, then renders the resulting op-sets as React `<path>` elements.
 * **Stability** — the wobble is *baked* per drawable and never regenerated on
 * value change. The knob's drawable is generated once at the origin and moved
 * with an SVG `transform="translate(…)"`, so its sketch lines slide as a rigid
 * group rather than re-rolling. This matches the PRD's "no shimmer" invariant
 * for hand-drawn marks.
 *
 * Interaction:
 *  - Pointer down + drag scrubs the value (pointer captured).
 *  - Keyboard: arrow keys nudge by `step`; Home/End jump to min/max.
 *  - Implements the WAI-ARIA slider pattern.
 */
export function NumberScrubber({
  value,
  min,
  max,
  step,
  onChange,
  width = 180,
  height = 28,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  width?: number;
  height?: number;
  label?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const pad = 10;
  const trackY = height / 2;
  const trackLeft = pad;
  const trackRight = width - pad;
  const trackLen = trackRight - trackLeft;

  const gen: RoughGenerator = useMemo(() => rough.generator(), []);

  // The track: one Rough line spanning the visible track. Memoized by geometry
  // so the wobble is fixed for the lifetime of the control's size.
  const trackDrawable = useMemo(
    () =>
      gen.line(trackLeft, trackY, trackRight, trackY, {
        stroke: INK,
        strokeWidth: 2.5,
        roughness: 1.5,
        bowing: 1.4,
        seed: 13,
      }),
    [gen, trackLeft, trackRight, trackY],
  );

  // The knob: a hachure-filled doodle disc drawn at the origin; an outer
  // transform moves it. Hachure (diagonal sketch stripes) reads as obviously
  // *filled* against the paper background — solid black at the same scale
  // looked like just a thick outline because the roughness wobble overlapped
  // where the fill ended. Hachure matches the body fills (ball / platform) so
  // the knob looks part of the same drawing.
  const knobDrawable = useMemo(
    () =>
      gen.circle(0, 0, 17, {
        stroke: INK,
        strokeWidth: 2.2,
        fill: INK,
        fillStyle: "hachure",
        fillWeight: 1.4,
        hachureGap: 2.6,
        hachureAngle: -45,
        roughness: 0.9,
        seed: 7,
      }),
    [gen],
  );

  // Tick marks at min, mid, max — drawn with Rough so they share the
  // hand-drawn look. Higher roughness here makes the doodle character visible
  // at this short length.
  const tickDrawables = useMemo(() => {
    const xs = [trackLeft, trackLeft + trackLen / 2, trackRight];
    return xs.map((x, i) =>
      gen.line(x, trackY - 5.5, x, trackY + 5.5, {
        stroke: INK,
        strokeWidth: 1.4,
        roughness: 1.8,
        bowing: 1.6,
        seed: 20 + i * 3,
      }),
    );
  }, [gen, trackLeft, trackRight, trackLen, trackY]);

  const t = (value - min) / (max - min);
  const knobX = trackLeft + Math.max(0, Math.min(1, t)) * trackLen;

  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const snap = (raw: number) => {
    if (step <= 0) return clamp(raw);
    const k = Math.round((raw - min) / step);
    return clamp(min + k * step);
  };

  const valueFromEvent = (clientX: number) => {
    const box = ref.current!.getBoundingClientRect();
    const u = (clientX - box.left - trackLeft) / trackLen;
    return snap(min + Math.max(0, Math.min(1, u)) * (max - min));
  };

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
    onChange(valueFromEvent(e.clientX));
  };
  const onMove = (e: React.PointerEvent) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    onChange(valueFromEvent(e.clientX));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      onChange(clamp(value - step));
      e.preventDefault();
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      onChange(clamp(value + step));
      e.preventDefault();
    } else if (e.key === "Home") {
      onChange(min);
      e.preventDefault();
    } else if (e.key === "End") {
      onChange(max);
      e.preventDefault();
    }
  };

  return (
    <svg
      ref={ref}
      width={width}
      height={height}
      className="scrubber scrubber-rough"
      role="slider"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onKeyDown={onKey}
    >
      {tickDrawables.map((d, i) => (
        <RoughGroup key={`tick-${i}`} gen={gen} drawable={d} opacity={0.4} />
      ))}
      <RoughGroup gen={gen} drawable={trackDrawable} />
      <g transform={`translate(${knobX} ${trackY})`}>
        <RoughGroup gen={gen} drawable={knobDrawable} />
      </g>
    </svg>
  );
}
