/// <reference types="@cloudflare/workers-types" />

/**
 * Cloudflare Worker entry point.
 *
 * Sits in front of the static SPA assets binding and adds OpenGraph
 * previews / shortlink resolution to specific routes. Static assets
 * bypass the worker entirely via a path-prefix short-circuit so we
 * don't pay a worker invocation for every CSS / JS / image fetch.
 *
 * See [og-share PRD](.scratch/og-share/PRD.md) and
 * [ADR-0010](docs/adr/0010-shortlinks-and-worker-og.md).
 */

import { decodeScene } from "../share/codec";
import { renderSceneToSvg } from "../og/renderSvg";
import { deriveTitle } from "../og/deriveTitle";
import type { Scene } from "../scene/scene";

export interface Env {
  /** Static assets binding from `wrangler.jsonc`'s `assets` field. */
  ASSETS: Fetcher;
}

/** Path prefixes that bypass the worker entirely. */
const STATIC_PREFIXES = ["/assets/"];

const SHARE_PARAM = "s";

const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Static assets bypass — the cheapest exit path.
    if (isStaticAsset(url.pathname)) {
      return env.ASSETS.fetch(request);
    }

    // GET /og.svg?s=ENC — render the SVG OG image from a URL-encoded scene.
    if (url.pathname === "/og.svg") {
      return handleOgSvg(url);
    }

    // GET / (with ?s=ENC) — inject OG meta into index.html so crawlers see
    // a preview. Without ?s= we just pass through to the static asset.
    if (url.pathname === "/" && url.searchParams.get(SHARE_PARAM)) {
      return handleRootShare(url, env, request);
    }

    // TODO (OG-7): POST /api/share    → mint a shortlink (KV write + rate limit).
    // TODO (OG-8): GET /s/<id>        → KV.get + HTMLRewriter inject + inline scene.
    // TODO (OG-8): GET /s/<id>/og.svg → KV.get + render SVG.

    // Everything else passes through to the SPA's static assets so the app
    // still boots for unmatched routes. The `single-page-application` not-
    // found mode in wrangler.jsonc handles history routes by serving
    // index.html.
    return env.ASSETS.fetch(request);
  },
};

/** Whether `pathname` falls under one of the configured static prefixes. */
export function isStaticAsset(pathname: string): boolean {
  for (const prefix of STATIC_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Render an OG-image SVG for a URL-encoded scene. The Cache-Control is
 * `immutable` because the same `?s=` payload always yields the same bytes
 * — so once Cloudflare's edge has rendered it, it never needs to again.
 * Bad / missing `s` → 400.
 */
function handleOgSvg(url: URL): Response {
  const encoded = url.searchParams.get(SHARE_PARAM);
  if (!encoded) {
    return new Response("Missing ?s= scene parameter", { status: 400 });
  }
  const scene = decodeScene(encoded);
  if (!scene) {
    return new Response("Could not decode scene", { status: 400 });
  }
  const svg = renderSceneToSvg(scene);
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": IMMUTABLE_CACHE,
    },
  });
}

/**
 * For `/?s=ENC` visits: fetch `index.html` from the static assets, then
 * splice OG `<meta>` tags into `<head>` so crawlers see a real preview.
 * The SPA still hydrates from `?s=` client-side as before.
 *
 * We use a pure string splice rather than `HTMLRewriter` so the worker
 * can be unit-tested in vitest's node env (HTMLRewriter is a
 * workers-runtime-only global). For our index.html — small, known
 * structure — string injection is fine; we lose the streaming benefit
 * but the file is well under a single TCP segment.
 */
async function handleRootShare(url: URL, env: Env, request: Request): Promise<Response> {
  const encoded = url.searchParams.get(SHARE_PARAM)!;
  const scene = decodeScene(encoded);
  if (!scene) {
    // Couldn't decode — fall through to the static asset (SPA will show
    // whatever it falls back to when the share fails to import).
    return env.ASSETS.fetch(request);
  }

  // Fetch index.html via the assets binding so we don't lose Vite's
  // hashed asset references. Then layer meta tags on top.
  const indexResp = await env.ASSETS.fetch(new Request(new URL("/", url).toString(), request));
  if (!indexResp.ok) return indexResp;

  const html = await indexResp.text();
  const meta = buildOgMeta(scene, url, encoded);
  const merged = injectMetaIntoHead(html, meta);
  return new Response(merged, {
    status: indexResp.status,
    headers: {
      // Preserve the index.html content-type (with charset).
      "content-type": indexResp.headers.get("content-type") ?? "text/html; charset=utf-8",
    },
  });
}

/**
 * Splice `meta` HTML just before the closing `</head>` tag. If no
 * `</head>` is found (malformed HTML) we append at the end as a graceful
 * degradation; crawlers' meta parsers still pick the tags up.
 *
 * Pure — exported for direct unit testing.
 */
export function injectMetaIntoHead(html: string, meta: string): string {
  const idx = html.search(/<\/head\s*>/i);
  if (idx < 0) return html + meta;
  return html.slice(0, idx) + meta + html.slice(idx);
}

/**
 * Build the OpenGraph / Twitter meta tags for a scene + canonical URL.
 * Returned as a single HTML string so `HTMLRewriter.append` can splice it
 * into `<head>` in one shot.
 *
 * Title precedence: explicit `scene.title` (already sanitised in the
 * codec, see [ADR-0008](../../docs/adr/0008-tolerant-share-and-autosave.md))
 * → derived from scene content via `deriveTitle`.
 */
export function buildOgMeta(scene: Scene, requestUrl: URL, encoded: string): string {
  const title = (scene.title && scene.title.trim()) || deriveTitle(scene);
  const description = `${title} — a ScribbleRig build.`;
  // Absolute URLs are required by every major crawler. Build from the
  // request's own origin so previews and deploys both work without config.
  const og = `${requestUrl.origin}/og.svg?s=${encoded}`;
  const canonical = `${requestUrl.origin}/?s=${encoded}`;
  return [
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:image" content="${esc(og)}">`,
    `<meta property="og:image:type" content="image/svg+xml">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:url" content="${esc(canonical)}">`,
    `<meta property="og:type" content="website">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${esc(og)}">`,
  ].join("");
}

/**
 * Minimal HTML attribute-value escaper. The fields it covers (title,
 * description, URLs) are already sanitised by the codec / built from
 * trusted URL parts, but defence in depth.
 */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
