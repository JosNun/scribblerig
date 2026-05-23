import { useState } from "react";
import type { Drawable } from "roughjs/bin/core";
import type { RoughGenerator } from "roughjs/bin/generator";

const INK = "#2b2b2b";

/**
 * Stable per-instance random seed for Rough.js drawables. Stored once at
 * mount via `useState`'s lazy initialiser, so two instances of the same
 * control rendered side-by-side don't share a wobble. Pass the returned
 * number into `gen.<shape>(…, { seed })`.
 *
 * Stability: the seed is fixed for the component's lifetime; the drawable
 * only re-rolls when something *else* in its memoization key changes
 * (e.g. size). Matches the PRD's "no shimmer" rule.
 */
export function useInstanceSeed(): number {
  return useState(() => Math.floor(Math.random() * 1_000_000))[0];
}

/**
 * Renders a Rough.js `Drawable` as a group of React `<path>` elements based on
 * the drawable's op-sets. Shared by every doodle control (NumberScrubber,
 * DoodleCheckbox, DoodleDial) so the rendering rules — which set type is
 * stroked, which is filled, which uses `fillWeight` vs `strokeWidth` — live in
 * exactly one place.
 *
 * Set types Rough.js emits:
 *  - `"path"`        — main outline; stroked with `strokeWidth`.
 *  - `"fillPath"`    — solid fill polygon; filled, not stroked.
 *  - `"fillSketch"`  — hachure / sketch lines; stroked with `fillWeight`.
 */
export function RoughGroup({
  gen,
  drawable,
  opacity = 1,
}: {
  gen: RoughGenerator;
  drawable: Drawable;
  opacity?: number;
}) {
  const opts = drawable.options;
  return (
    <g opacity={opacity}>
      {drawable.sets.map((set, i) => {
        const d = gen.opsToPath(set);
        if (set.type === "fillPath") {
          return (
            <path
              key={i}
              d={d}
              fill={opts.fill ?? "none"}
              stroke="none"
              fillRule="evenodd"
            />
          );
        }
        return (
          <path
            key={i}
            d={d}
            stroke={opts.stroke ?? INK}
            strokeWidth={
              set.type === "fillSketch"
                ? (opts.fillWeight ?? 1)
                : (opts.strokeWidth ?? 1)
            }
            fill="none"
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
}
