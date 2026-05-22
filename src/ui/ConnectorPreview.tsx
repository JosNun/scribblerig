import { useEffect, useRef } from "react";
import rough from "roughjs";
import { connectorDef } from "../registry/registry";
import type { ConnectorType } from "../scene/scene";

const W = 56;
const H = 34;

/**
 * A small doodle of a connector type, for palette tiles. Mirrors the on-canvas
 * connector vocabulary (spring coil, weld seam, hinge ring, motor arc) so the
 * palette reads as the same illustrated toolset as the body tiles, painted in
 * the connector's own stroke colour.
 */
export function ConnectorPreview({ type }: { type: ConnectorType }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const color = connectorDef(type).stroke;

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const rc = rough.canvas(canvas);
    ctx.clearRect(0, 0, W, H);

    const cy = H / 2;
    const opts = { stroke: color, strokeWidth: 1.6, roughness: 1.3, seed: 7 };
    const fillSolid = { fill: color, fillStyle: "solid" as const };
    const ringFill = { fill: "#fff", fillStyle: "solid" as const };

    if (type === "spring") {
      // Two anchor dots with a zigzag coil between them.
      const x0 = 8;
      const x1 = W - 8;
      const lead = 6;
      const amp = 6;
      const coils = 5;
      const a = x0 + lead;
      const b = x1 - lead;
      const pts: [number, number][] = [[x0, cy], [a, cy]];
      const steps = coils * 2;
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const side = i % 2 === 0 ? 0 : i % 4 === 1 ? 1 : -1;
        pts.push([a + (b - a) * t, cy + amp * side]);
      }
      pts.push([b, cy], [x1, cy]);
      rc.linearPath(pts, opts);
      rc.circle(x0, cy, 5, { ...opts, ...fillSolid });
      rc.circle(x1, cy, 5, { ...opts, ...fillSolid });
    } else if (type === "weld") {
      // A rigid bar with the two fused points squared off at the ends.
      rc.line(12, cy, W - 12, cy, opts);
      rc.rectangle(8, cy - 4, 8, 8, { ...opts, ...fillSolid });
      rc.rectangle(W - 16, cy - 4, 8, 8, { ...opts, ...fillSolid });
    } else {
      // pin or motor: a hinge — a faint axis with a pivot ring at the centre.
      ctx.save();
      ctx.globalAlpha = 0.5;
      rc.line(8, cy, W - 8, cy, opts);
      ctx.restore();
      const cx = W / 2;
      rc.circle(cx, cy, 13, { ...opts, ...ringFill });
      if (type === "motor") motorArc(rc, cx, cy, 11, color);
    }
  }, [type, color]);

  return <canvas ref={ref} width={W} height={H} />;
}

/** A ~270° arc with an arrowhead around the pivot — the "this spins" cue. */
function motorArc(rc: ReturnType<typeof rough.canvas>, cx: number, cy: number, r: number, color: string) {
  const a0 = -Math.PI / 2;
  const a1 = Math.PI;
  rc.arc(cx, cy, r * 2, r * 2, a0, a1, false, { stroke: color, strokeWidth: 1.6, roughness: 1, seed: 7 });
  const ex = cx + r * Math.cos(a1);
  const ey = cy + r * Math.sin(a1);
  const tx = Math.sin(a1);
  const ty = -Math.cos(a1);
  const h = 4;
  rc.line(ex, ey, ex - (tx + ty) * h, ey - (ty - tx) * h, { stroke: color, strokeWidth: 1.6, roughness: 1, seed: 7 });
  rc.line(ex, ey, ex - (tx - ty) * h, ey - (ty + tx) * h, { stroke: color, strokeWidth: 1.6, roughness: 1, seed: 7 });
}
