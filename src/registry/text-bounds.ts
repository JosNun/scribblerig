/**
 * Local-space bounding box for a text body's drawn label, in meters.
 *
 * Text bodies have an empty `shapes()` (no collider) so hit-testing and the
 * selection dashed rectangle need a different source of truth. Both the editor
 * (pointer pick) and the renderer (dashed box around selection) call this so
 * the visual selection chrome and the clickable area stay aligned.
 *
 * Width is measured with the same canvas API the renderer paints with
 * (`ctx.measureText` against the Mynerve font), so the box matches the rendered
 * glyphs. Height is `lineCount × sizeMeters` — Mynerve has consistent line
 * height, so the size prop drives it directly.
 *
 * Falls back to a character-count estimate when there's no canvas (unit tests
 * under node). The fallback is intentionally close to Mynerve's typical width
 * so the editor's hit area still matches what a user *sees* in the rare case
 * something tests it without a DOM.
 */

const FONT_FAMILY = "Mynerve, sans-serif";
const FALLBACK_CHAR_RATIO = 0.55; // ratio of avg char width to font size for Mynerve

/** A canvas context kept alive across calls so we don't reallocate each frame. */
let ctxCache: CanvasRenderingContext2D | null | undefined;
function measureCtx(): CanvasRenderingContext2D | null {
  if (ctxCache !== undefined) return ctxCache;
  try {
    const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
    ctxCache = canvas?.getContext("2d") ?? null;
  } catch {
    ctxCache = null;
  }
  return ctxCache;
}

/** The user-visible text of a text body, with a sane fallback. */
export function textOf(props: { text?: number | boolean | string }): string {
  return typeof props.text === "string" ? props.text : "";
}

/** Font size of a text body in meters, defaulting wide to a readable size. */
export function textSizeMeters(props: { size?: number | boolean | string }): number {
  return typeof props.size === "number" ? props.size : 0.4;
}

/** Split a text body's content into rendered lines (no auto-wrap). */
export function textLines(props: { text?: number | boolean | string }): string[] {
  const t = textOf(props);
  // An empty label still gets one line so the bbox doesn't collapse to nothing —
  // the user needs a clickable region while the property panel is being typed in.
  return t.length === 0 ? [""] : t.split("\n");
}

/**
 * Half-width and half-height of the laid-out text in body-local meters.
 * `halfW` is `max(lineWidth) / 2`; `halfH` is `(lineCount × sizeMeters) / 2`.
 *
 * Both have a small floor so an empty label still occupies a clickable
 * footprint (otherwise a freshly-placed label would be impossible to grab
 * back). Returned in *meters*, not pixels — callers multiply by camera scale.
 */
export function textBoundsLocal(props: {
  text?: number | boolean | string;
  size?: number | boolean | string;
}): { halfW: number; halfH: number } {
  const size = textSizeMeters(props);
  const lines = textLines(props);
  const minDim = size * 0.6; // empty-label clickable floor
  const widthMeters = Math.max(
    minDim,
    ...lines.map((line) => measureLineMeters(line, size)),
  );
  const heightMeters = Math.max(minDim, lines.length * size);
  return { halfW: widthMeters / 2, halfH: heightMeters / 2 };
}

/** Width of a single line at the given em-height, in meters. */
function measureLineMeters(line: string, sizeMeters: number): number {
  if (line.length === 0) return 0;
  const ctx = measureCtx();
  if (!ctx) return line.length * sizeMeters * FALLBACK_CHAR_RATIO;
  // Measure at a 100px reference em so we don't lose precision on small sizes;
  // scale back to meters by dividing out the reference and multiplying by the
  // body's size prop. measureText's `width` is em-proportional, so this is safe.
  const REF_PX = 100;
  ctx.font = `${REF_PX}px ${FONT_FAMILY}`;
  const widthPxAtRef = ctx.measureText(line).width;
  return (widthPxAtRef / REF_PX) * sizeMeters;
}
