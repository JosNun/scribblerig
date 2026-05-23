import { useMemo } from "react";
import rough from "roughjs";
import type { RoughGenerator } from "roughjs/bin/generator";
import { RoughGroup, useInstanceSeed } from "./rough-react";

const INK = "#2b2b2b";

/**
 * Doodle checkbox (issue 09). A sketchy square that gets a hand-drawn check
 * inside when toggled on.
 *
 * Accessibility — a real `<input type="checkbox">` sits invisibly over the
 * sketch, so keyboard focus, Space-to-toggle, screen-reader semantics, and the
 * surrounding `<label>` click-through all come for free. The SVG is purely a
 * visual; the input is the source of truth.
 *
 * Stability — both the box and check drawables are memoized, so the wobble is
 * baked. Toggling the value just shows/hides the pre-generated check; it never
 * re-rolls the box outline (matches the PRD "no shimmer" rule).
 */
export function DoodleCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const SIZE = 20;
  const PAD = 2.5;
  const gen: RoughGenerator = useMemo(() => rough.generator(), []);
  // Per-instance seeds so two checkboxes side-by-side don't have identical
  // wobble (would otherwise look mass-produced rather than hand-drawn).
  const boxSeed = useInstanceSeed();
  const checkSeed = useInstanceSeed();

  const boxDrawable = useMemo(
    () =>
      gen.rectangle(PAD, PAD, SIZE - PAD * 2, SIZE - PAD * 2, {
        // Transparent — let the paper colour show through, matching the
        // doodle frames on panels and number boxes.
        stroke: INK,
        strokeWidth: 2,
        roughness: 1.5,
        bowing: 1.4,
        seed: boxSeed,
      }),
    [gen, boxSeed],
  );

  // Two-segment check path: down-right then up-right. Rough.js wobbles the
  // strokes so it reads as drawn-in-ink rather than a CSS glyph.
  const checkDrawable = useMemo(
    () =>
      gen.path("M 5 11 L 9 15 L 16 5", {
        stroke: INK,
        strokeWidth: 2.4,
        roughness: 1.4,
        bowing: 2,
        seed: checkSeed,
      }),
    [gen, checkSeed],
  );

  return (
    <span className="doodle-check">
      <input
        type="checkbox"
        className="doodle-check__input"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <svg
        width={SIZE}
        height={SIZE}
        className="doodle-check__svg"
        aria-hidden="true"
      >
        <RoughGroup gen={gen} drawable={boxDrawable} />
        {checked && <RoughGroup gen={gen} drawable={checkDrawable} />}
      </svg>
    </span>
  );
}
