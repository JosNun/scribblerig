import { useEffect, useMemo, useRef, useState } from "react";
import rough from "roughjs";
import { RoughGroup, useInstanceSeed } from "./rough-react";

const INK = "#2b2b2b";

/**
 * Hand-drawn underline for a text-style button. Drop one inside the parent
 * `<button>`; it positions itself just below the text baseline and is shown
 * only when the parent is `:hover`-ed or `:focus-visible`. The CSS handles
 * visibility; this component only renders the rough.js geometry.
 *
 * Mirrors {@link DoodleBorder}'s anchor-and-ResizeObserver pattern: the
 * placeholder span finds the parent, the SVG sizes to it, and the drawable
 * is memoized so the wobble stays stable until the parent's width changes.
 *
 * Parent must be `position: relative` (the `.panel button` rule already is,
 * which covers everywhere we use this today).
 */
export function DoodleUnderline({
  strokeWidth = 1.5,
  roughness = 1.2,
  seed,
}: {
  strokeWidth?: number;
  roughness?: number;
  seed?: number;
}) {
  const placeholderRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const parent = placeholderRef.current?.parentElement;
    if (!parent) return;
    const initial = parent.getBoundingClientRect();
    setWidth(Math.round(initial.width));
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      const box = entry.borderBoxSize?.[0];
      const w = box ? box.inlineSize : entry.contentRect.width;
      setWidth(Math.round(w));
    });
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  const gen = useMemo(() => rough.generator(), []);
  const baseSeed = useInstanceSeed();

  // The underline spans the parent's width inset by a small margin so the
  // ends don't hug the padding edge. Drawn near the top of an 8px-tall SVG
  // that sits just above the parent's bottom padding (see the CSS).
  const drawable = useMemo(() => {
    if (width < 6) return null;
    const margin = 4;
    return gen.line(margin, 3, width - margin, 3, {
      stroke: INK,
      strokeWidth,
      roughness,
      seed: seed ?? baseSeed,
    });
  }, [gen, width, strokeWidth, roughness, seed, baseSeed]);

  return (
    <>
      <span ref={placeholderRef} className="doodle-underline__anchor" aria-hidden="true" />
      {drawable && (
        <svg className="doodle-underline" width={width} height={8} aria-hidden="true">
          <RoughGroup gen={gen} drawable={drawable} />
        </svg>
      )}
    </>
  );
}
