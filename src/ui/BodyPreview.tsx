import { useEffect, useRef } from "react";
import rough from "roughjs";
import { def, type Props } from "../registry/registry";
import type { BodyType } from "../scene/scene";

const INK = "#2b2b2b";
// Matches the renderer's TEXT_INK so the "Aa" palette glyph reads at the
// same weight the dropped label will.
const TEXT_INK = "#5a5a5a";

/** Largest half-extent of a body type's geometry, in meters. */
function extentMeters(type: BodyType): number {
  const d = def(type);
  let ext = 0.1;
  for (const s of d.shapes(d.defaults as Props)) {
    ext = Math.max(ext, s.kind === "circle" ? s.radius : Math.max(s.halfWidth, s.halfHeight));
  }
  // Text bodies have no collider — fall back to the default size so the
  // palette tile and drag ghost reserve a visible footprint.
  if (type === "text") {
    const size = typeof d.defaults.size === "number" ? d.defaults.size : 0.4;
    ext = Math.max(ext, size);
  }
  return ext;
}

/**
 * A small doodle rendering of a body type, for palette items and drag ghosts.
 *
 * - Palette icon: pass `size` (a fixed box); the body is scaled to fill it.
 * - Drag ghost: pass `scale` (pixels per meter, the camera's scale) and the
 *   preview renders at the body's true on-canvas size.
 */
export function BodyPreview({
  type,
  size = 52,
  scale,
}: {
  type: BodyType;
  size?: number;
  scale?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ext = extentMeters(type);
  // pixels per meter, and the square canvas box that fits the body + padding.
  const pad = 8;
  const pxPerMeter = scale ?? (size * 0.4) / ext;
  const box = scale ? Math.ceil(ext * 2 * pxPerMeter) + pad : size;

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const rc = rough.canvas(canvas);
    const d = def(type);
    const props = d.defaults as Props;
    const opts = { stroke: INK, strokeWidth: 1.5, roughness: 1.2, seed: 7 };

    ctx.clearRect(0, 0, box, box);
    ctx.save();
    ctx.translate(box / 2, box / 2);
    // Text body: draw a small "Aa" glyph in the same Mynerve font as labels,
    // so the palette tile and drag ghost read as "text" rather than empty.
    if (type === "text") {
      const sizePx = box * 0.55;
      ctx.font = `${sizePx}px Mynerve, sans-serif`;
      ctx.fillStyle = TEXT_INK;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Aa", 0, 0);
      ctx.restore();
      return;
    }
    for (const s of d.shapes(props)) {
      if (s.kind === "circle") {
        rc.circle(0, 0, s.radius * pxPerMeter * 2, { ...opts, fill: d.style.fill, fillStyle: d.style.fillStyle });
      } else {
        rc.rectangle(-s.halfWidth * pxPerMeter, -s.halfHeight * pxPerMeter, s.halfWidth * 2 * pxPerMeter, s.halfHeight * 2 * pxPerMeter, {
          ...opts,
          fill: d.style.fill,
          fillStyle: d.style.fillStyle,
        });
      }
    }
    for (const m of d.marks?.(props) ?? []) {
      rc.line(m.a.x * pxPerMeter, -m.a.y * pxPerMeter, m.b.x * pxPerMeter, -m.b.y * pxPerMeter, opts);
    }
    ctx.restore();
  }, [type, box, pxPerMeter]);

  return <canvas ref={ref} width={box} height={box} />;
}
