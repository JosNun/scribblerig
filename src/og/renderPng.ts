/// <reference types="@cloudflare/workers-types" />

/**
 * Rasterise a Scene's SVG OG image to PNG bytes, via @resvg/resvg-wasm.
 *
 * Why PNG: Twitter / X is known to reject `image/svg+xml` for card images
 * outright, and a few smaller crawlers do the same. PNG is the universally-
 * accepted Open Graph format. We keep the SVG renderer (cheaper, no WASM
 * dependency) for the in-app thumbnail / debug path, and add this PNG
 * conversion as a thin worker-side wrapper that crawlers can hit.
 *
 * Initialisation: `resvg-wasm` needs `initWasm` to be called once per
 * Worker isolate before any rasterisation. We lazy-init on the first
 * request and memoise the resulting promise — so subsequent requests
 * within the same isolate share the same already-resolved init, and
 * cold-start latency only hits the first request after a new isolate
 * comes up.
 *
 * Fonts: the SVG renderer doesn't currently emit any `<text>` elements
 * (titles live in HTML meta, not in the image), so we disable system-
 * font loading to save startup time and shrink the runtime memory
 * footprint.
 *
 * See [og-share PRD](.scratch/og-share/PRD.md) §"PNG output" follow-up.
 */

import { Resvg, initWasm } from "@resvg/resvg-wasm";
// Cloudflare Workers / wrangler bundles .wasm imports as a
// `WebAssembly.Module` at build time; the type declaration lives in
// `src/vite-env.d.ts`.
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";

let initPromise: Promise<void> | null = null;

/**
 * Lazy-initialise resvg's wasm module. Idempotent — repeat calls share
 * the same promise, so concurrent requests during a cold start don't
 * race each other into double-init (which `initWasm` would reject).
 */
function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = initWasm(resvgWasm as unknown as WebAssembly.Module);
  }
  return initPromise;
}

export interface RenderPngOptions {
  /** Output width in pixels. Height scales from the SVG's viewBox. */
  width?: number;
}

/**
 * Convert an SVG string to PNG bytes at the requested width. The SVG's
 * own viewBox determines the aspect ratio; we render at the requested
 * pixel width, letting height scale proportionally.
 *
 * Memory: `Resvg` + `RenderedImage` instances each hold a wasm pointer
 * — we `free()` both eagerly so the worker doesn't accumulate
 * un-released wasm memory across requests.
 */
export async function renderSvgToPng(
  svg: string,
  opts: RenderPngOptions = {},
): Promise<Uint8Array> {
  await ensureInit();
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: opts.width ?? 1200 },
    // No text in our SVG → skip the system-font loader; it'd be a waste
    // of cold-start time and runtime memory.
    font: { loadSystemFonts: false },
  });
  const rendered = resvg.render();
  try {
    return rendered.asPng();
  } finally {
    rendered.free();
    resvg.free();
  }
}
