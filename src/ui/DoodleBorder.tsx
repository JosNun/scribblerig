import { useEffect, useMemo, useRef, useState } from "react";
import rough from "roughjs";
import { RoughGroup, useInstanceSeed } from "./rough-react";

const INK = "#2b2b2b";

/**
 * Hand-drawn border that paints itself around its **parent** element.
 *
 * Drop one inside any container (a `<button>`, a `.panel` div, an `<input>`'s
 * wrapper span) and it absolutely-positions a Rough.js rectangle behind the
 * parent's content. The parent provides positioning, padding, background; the
 * border just adds the doodle outline. No DOM wrapping required, so existing
 * layout is preserved.
 *
 * Sizing — uses `ResizeObserver` on the parent's `borderBoxSize` so the frame
 * fills the full visible box (padding included). The drawable is memoized per
 * (size, strokeWidth, roughness, seed); resize triggers a fresh draw, but mere
 * background-colour or content changes don't.
 *
 * Stability — every instance gets a per-instance seed (via `useInstanceSeed`),
 * so two panels of the same size don't share a wobble. Passing an explicit
 * `seed` prop overrides this.
 *
 * Interactive — when `interactive` is true, the border attaches hover
 * listeners to the parent: on `mouseenter` the seed shifts (lines settle into
 * a different pattern, same roughness — same character), and CSS rules
 * targeting `:active` thicken the stroke. Use for buttons; leave off for
 * static frames (panels, inputs).
 */
export function DoodleBorder({
  interactive = false,
  strokeWidth = 2,
  roughness = 1.3,
  bowing = 1.4,
  seed,
}: {
  interactive?: boolean;
  strokeWidth?: number;
  roughness?: number;
  bowing?: number;
  seed?: number;
}) {
  const placeholderRef = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const parent = placeholderRef.current?.parentElement;
    if (!parent) return;
    // Seed the initial size synchronously — the parent has already laid out
    // by the time this effect fires, so `getBoundingClientRect` returns its
    // real dimensions. (Relying on `ResizeObserver`'s initial callback was
    // flaky in dev; we still attach it for subsequent resize events.)
    const initial = parent.getBoundingClientRect();
    setSize({ w: Math.round(initial.width), h: Math.round(initial.height) });
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      const box = entry.borderBoxSize?.[0];
      const w = box ? box.inlineSize : entry.contentRect.width;
      const h = box ? box.blockSize : entry.contentRect.height;
      setSize({ w: Math.round(w), h: Math.round(h) });
    });
    ro.observe(parent);

    if (!interactive) return () => ro.disconnect();

    const onEnter = () => setHovered(true);
    const onLeave = () => setHovered(false);
    parent.addEventListener("mouseenter", onEnter);
    parent.addEventListener("mouseleave", onLeave);
    return () => {
      ro.disconnect();
      parent.removeEventListener("mouseenter", onEnter);
      parent.removeEventListener("mouseleave", onLeave);
    };
  }, [interactive]);

  const gen = useMemo(() => rough.generator(), []);
  const baseSeed = useInstanceSeed();

  const drawable = useMemo(() => {
    if (size.w < 6 || size.h < 6) return null;
    const inset = strokeWidth / 2 + 0.5;
    // Shift seed by a large prime on hover so the wobble moves visibly but
    // the character (roughness, stroke width) stays identical — it looks like
    // the lines just settled into another natural draw, not "got angrier".
    const effectiveSeed = (seed ?? baseSeed) + (interactive && hovered ? 49157 : 0);
    return gen.rectangle(inset, inset, size.w - inset * 2, size.h - inset * 2, {
      stroke: INK,
      strokeWidth,
      roughness,
      bowing,
      seed: effectiveSeed,
    });
  }, [
    gen,
    size.w,
    size.h,
    strokeWidth,
    roughness,
    bowing,
    seed,
    baseSeed,
    interactive,
    hovered,
  ]);

  // The placeholder span is invisible; it just gives us a ref to find the
  // parent. The actual border SVG renders right after.
  return (
    <>
      <span ref={placeholderRef} className="doodle-border__anchor" aria-hidden="true" />
      {drawable && (
        <svg
          className={`doodle-border${interactive ? " interactive" : ""}`}
          width={size.w}
          height={size.h}
          aria-hidden="true"
        >
          <RoughGroup gen={gen} drawable={drawable} />
        </svg>
      )}
    </>
  );
}
