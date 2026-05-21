import { useEffect, useRef } from "react";
import rough from "roughjs";
import { def, type Props } from "../registry/registry";
import type { BodyType } from "../scene/scene";

const INK = "#2b2b2b";

/** A small doodle rendering of a body type, for palette items and drag ghosts. */
export function BodyPreview({ type, size = 52 }: { type: BodyType; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const rc = rough.canvas(canvas);
    const d = def(type);
    const props = d.defaults as Props;

    // Scale the body's largest extent to fill most of the preview box.
    let ext = 0.1;
    for (const s of d.shapes(props)) {
      ext = Math.max(ext, s.kind === "circle" ? s.radius : Math.max(s.halfWidth, s.halfHeight));
    }
    const scale = (size * 0.4) / ext;
    const opts = { stroke: INK, strokeWidth: 1.5, roughness: 1.2, seed: 7 };

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    for (const s of d.shapes(props)) {
      if (s.kind === "circle") {
        rc.circle(0, 0, s.radius * scale * 2, { ...opts, fill: d.style.fill, fillStyle: d.style.fillStyle });
      } else {
        rc.rectangle(-s.halfWidth * scale, -s.halfHeight * scale, s.halfWidth * 2 * scale, s.halfHeight * 2 * scale, {
          ...opts,
          fill: d.style.fill,
          fillStyle: d.style.fillStyle,
        });
      }
    }
    for (const m of d.marks?.(props) ?? []) {
      rc.line(m.a.x * scale, -m.a.y * scale, m.b.x * scale, -m.b.y * scale, opts);
    }
    ctx.restore();
  }, [type, size]);

  return <canvas ref={ref} width={size} height={size} />;
}
