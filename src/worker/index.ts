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

import { decodeScene, sanitizeTitle } from "../share/codec";
import { renderSceneToSvg } from "../og/renderSvg";
import { renderSvgToPng } from "../og/renderPng";
import { deriveTitle } from "../og/deriveTitle";
import type { Scene } from "../scene/scene";
import { nextShortlinkId } from "./id";

export interface Env {
  /** Static assets binding from `wrangler.jsonc`'s `assets` field. */
  ASSETS: Fetcher;
  /**
   * KV namespace holding shortlink rows. Key = 10-char base62 ID, value =
   * JSON-encoded {@link ShortlinkRow}. Bound via `[[kv_namespaces]]` in
   * `wrangler.jsonc`. See og-share issue 02 + ADR-0010.
   */
  SHARES: KVNamespace;
}

/** What we persist per shortlink. */
export interface ShortlinkRow {
  /** Base64url-encoded scene blob — same payload as the `?s=` URL form. */
  sceneEnc: string;
  /** Optional sanitised title, falls back to `deriveTitle(scene)` at render. */
  title?: string;
  /** ms since epoch when the shortlink was minted. */
  createdAt: number;
}

/** Path prefixes that bypass the worker entirely. */
const STATIC_PREFIXES = ["/assets/"];

const SHARE_PARAM = "s";

const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

/** Per-IP rate-limit window for `POST /api/share`, in seconds. */
const RATE_WINDOW_SECONDS = 60;
/** Max `POST /api/share` requests per IP per window. Above this → 429. */
const RATE_LIMIT = 10;
/** Largest accepted base64url payload for a single share (bytes). */
const MAX_SCENE_ENC_LENGTH = 64 * 1024;
/** base64url character set — for validating incoming `sceneEnc`. */
const BASE64URL = /^[A-Za-z0-9_-]+$/;

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

    // GET /og.png?s=ENC — same image rasterised to PNG (Twitter / X
    // rejects SVG for card images, hence both formats).
    if (url.pathname === "/og.png") {
      return handleOgPng(url);
    }

    // GET / (with ?s=ENC) — inject OG meta into index.html so crawlers see
    // a preview. Without ?s= we just pass through to the static asset.
    if (url.pathname === "/" && url.searchParams.get(SHARE_PARAM)) {
      return handleRootShare(url, env, request);
    }

    // POST /api/share — mint a shortlink row for a named (or oversized)
    // scene. Rate-limited per IP.
    if (url.pathname === "/api/share" && request.method === "POST") {
      return handleMintShortlink(request, env);
    }

    // GET /s/<id>/og.svg — render the SVG OG image for a stored shortlink.
    const ogSvgMatch = url.pathname.match(/^\/s\/([A-Za-z0-9]+)\/og\.svg$/);
    if (ogSvgMatch) {
      return handleShortlinkOgSvg(ogSvgMatch[1], env);
    }

    // GET /s/<id>/og.png — PNG version (preferred by Twitter / X).
    const ogPngMatch = url.pathname.match(/^\/s\/([A-Za-z0-9]+)\/og\.png$/);
    if (ogPngMatch) {
      return handleShortlinkOgPng(ogPngMatch[1], env);
    }

    // GET /s/<id> — serve the SPA HTML with og:* meta + an inline scene
    // blob so the SPA can hydrate without a second round trip.
    const shortlinkMatch = url.pathname.match(/^\/s\/([A-Za-z0-9]+)$/);
    if (shortlinkMatch) {
      return handleShortlinkHtml(shortlinkMatch[1], url, env, request);
    }

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
 * Render the OG image for a URL-encoded scene as PNG (Twitter / X
 * prefers PNG over SVG for card images). Same immutable caching as the
 * SVG path — the encoded scene is content-addressable, so once the edge
 * has rasterised it, it never needs to again.
 */
async function handleOgPng(url: URL): Promise<Response> {
  const encoded = url.searchParams.get(SHARE_PARAM);
  if (!encoded) {
    return new Response("Missing ?s= scene parameter", { status: 400 });
  }
  const scene = decodeScene(encoded);
  if (!scene) {
    return new Response("Could not decode scene", { status: 400 });
  }
  const svg = renderSceneToSvg(scene);
  const png = await renderSvgToPng(svg);
  return pngResponse(png);
}

/** PNG variant of `handleShortlinkOgSvg`. */
async function handleShortlinkOgPng(id: string, env: Env): Promise<Response> {
  const row = await readShortlinkRow(env.SHARES, id);
  if (!row) return new Response("Not found", { status: 404 });
  const scene = decodeScene(row.sceneEnc);
  if (!scene) return new Response("Could not decode stored scene", { status: 500 });
  const svg = renderSceneToSvg(scene);
  const png = await renderSvgToPng(svg);
  return pngResponse(png);
}

function pngResponse(bytes: Uint8Array): Response {
  // Copy into a fresh ArrayBuffer so the Response body owns memory
  // independent of the wasm-owned source. Also sidesteps TS's strict
  // BodyInit typing which would otherwise reject Uint8Array<ArrayBufferLike>.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Response(copy.buffer, {
    headers: {
      "content-type": "image/png",
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
 * `POST /api/share` — accept an encoded scene + optional title, rate-limit
 * by IP, mint a 10-char shortlink ID, write the row to KV, return the
 * absolute share URL.
 *
 * Request body: `{ sceneEnc: string; title?: string }`.
 * Response: `{ id: string; url: string }`. 429 over rate limit. 400 on bad
 * input. 500 on the astronomically-unlikely persistent ID collision.
 */
async function handleMintShortlink(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get("cf-connecting-ip") ?? "anonymous";
  if (await isRateLimited(env.SHARES, ip)) {
    return json({ error: "Too many shares — slow down" }, {
      status: 429,
      headers: { "retry-after": String(RATE_WINDOW_SECONDS) },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body must be JSON" }, { status: 400 });
  }
  const parsed = parseShareBody(body);
  if (!parsed.ok) return json({ error: parsed.error }, { status: 400 });

  // Try once to mint a fresh ID, then retry once more if KV says it's
  // taken. With a 10-char base62 alphabet the second collision is
  // vanishingly unlikely, so 500 after two strikes is fine.
  for (let attempt = 0; attempt < 2; attempt++) {
    const id = nextShortlinkId();
    const existing = await env.SHARES.get(id);
    if (existing) continue;
    const row: ShortlinkRow = {
      sceneEnc: parsed.value.sceneEnc,
      ...(parsed.value.title ? { title: parsed.value.title } : {}),
      createdAt: Date.now(),
    };
    await env.SHARES.put(id, JSON.stringify(row));
    const url = new URL(request.url);
    return json({ id, url: `${url.origin}/s/${id}` }, { status: 201 });
  }
  return json({ error: "Could not mint shortlink — try again" }, { status: 500 });
}

/**
 * Validate the POST /api/share body. Returns either the cleaned payload
 * (with title sanitised through the same path as `scene.title`) or an
 * error string suitable for a 400 response.
 */
type ParsedShare =
  | { ok: true; value: { sceneEnc: string; title?: string } }
  | { ok: false; error: string };
export function parseShareBody(body: unknown): ParsedShare {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;
  const sceneEnc = b.sceneEnc;
  if (typeof sceneEnc !== "string" || sceneEnc.length === 0) {
    return { ok: false, error: "Missing sceneEnc" };
  }
  if (sceneEnc.length > MAX_SCENE_ENC_LENGTH) {
    return { ok: false, error: "sceneEnc too large" };
  }
  if (!BASE64URL.test(sceneEnc)) {
    return { ok: false, error: "sceneEnc has invalid characters" };
  }
  // sanitizeTitle handles non-strings, control chars, length cap, etc.
  const title = sanitizeTitle(b.title);
  return { ok: true, value: { sceneEnc, ...(title ? { title } : {}) } };
}

/**
 * Per-IP rate limit using a KV counter with a 60-second TTL. Eventually
 * consistent — a determined attacker can briefly burst, but the counter
 * catches up across regions within a few seconds. Sufficient for v1's
 * spam control.
 */
async function isRateLimited(kv: KVNamespace, ip: string): Promise<boolean> {
  const key = `rate:${ip}`;
  const raw = await kv.get(key);
  const count = raw ? parseInt(raw, 10) || 0 : 0;
  if (count >= RATE_LIMIT) return true;
  await kv.put(key, String(count + 1), { expirationTtl: RATE_WINDOW_SECONDS });
  return false;
}

/**
 * Look up a stored shortlink and render its OG SVG. Same immutable cache
 * policy as `/og.svg?s=…`. 404 if the ID is unknown.
 */
async function handleShortlinkOgSvg(id: string, env: Env): Promise<Response> {
  const row = await readShortlinkRow(env.SHARES, id);
  if (!row) return new Response("Not found", { status: 404 });
  const scene = decodeScene(row.sceneEnc);
  if (!scene) return new Response("Could not decode stored scene", { status: 500 });
  const svg = renderSceneToSvg(scene);
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": IMMUTABLE_CACHE,
    },
  });
}

/**
 * Look up a stored shortlink, fetch index.html via the assets binding,
 * and splice in both:
 *  - the `og:*` / `twitter:*` meta tags (so crawlers see a preview),
 *  - a `<script type="application/json" id="og-data">` carrying the
 *    encoded scene (so the SPA can hydrate without a second round trip).
 *
 * 404 if the ID is unknown. Immutable cache once we have a hit — stored
 * shortlinks are forever-frozen in v1 (ADR-0010).
 */
async function handleShortlinkHtml(
  id: string,
  url: URL,
  env: Env,
  request: Request,
): Promise<Response> {
  const row = await readShortlinkRow(env.SHARES, id);
  if (!row) return new Response("Shortlink not found", { status: 404 });

  const scene = decodeScene(row.sceneEnc);
  if (!scene) {
    return new Response("Could not decode stored scene", { status: 500 });
  }

  // Override scene.title with the stored title (if any) so the OG meta
  // uses the explicit name even if it didn't ride in the encoded blob.
  if (row.title) scene.title = row.title;

  const indexResp = await env.ASSETS.fetch(new Request(new URL("/", url).toString(), request));
  if (!indexResp.ok) return indexResp;

  const html = await indexResp.text();
  const meta = buildShortlinkMeta(scene, url, id);
  const dataScript = buildOgDataScript(row.sceneEnc);
  const merged = injectMetaIntoHead(html, meta + dataScript);
  return new Response(merged, {
    status: indexResp.status,
    headers: {
      "content-type": indexResp.headers.get("content-type") ?? "text/html; charset=utf-8",
      "cache-control": IMMUTABLE_CACHE,
    },
  });
}

/**
 * Meta tags for `/s/<id>` — same shape as `buildOgMeta` but with the
 * canonical URL pointing at the shortlink rather than the `?s=` form.
 */
export function buildShortlinkMeta(scene: Scene, requestUrl: URL, id: string): string {
  const title = (scene.title && scene.title.trim()) || deriveTitle(scene);
  const description = `${title} — a ScribbleRig build.`;
  // PNG by default for crawler compatibility (see buildOgMeta).
  const og = `${requestUrl.origin}/s/${id}/og.png`;
  const canonical = `${requestUrl.origin}/s/${id}`;
  return [
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:image" content="${esc(og)}">`,
    `<meta property="og:image:type" content="image/png">`,
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
 * Build the inline `<script id="og-data" type="application/json">` blob
 * the SPA reads on boot. Carries the encoded scene so opening `/s/<id>`
 * costs one round trip rather than two (no separate scene fetch).
 *
 * The blob is JSON-encoded and escaped against `</script>` — pure
 * defence in depth, since `sceneEnc` is base64url and can't contain `<`.
 */
export function buildOgDataScript(sceneEnc: string): string {
  const payload = JSON.stringify({ sceneEnc }).replace(/<\/script/gi, "<\\/script");
  return `<script type="application/json" id="og-data">${payload}</script>`;
}

/** Read + parse a `ShortlinkRow` from KV, or null if missing / malformed. */
async function readShortlinkRow(
  kv: KVNamespace,
  id: string,
): Promise<ShortlinkRow | null> {
  const raw = await kv.get(id);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ShortlinkRow;
    if (typeof parsed.sceneEnc !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function json(payload: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(payload), { ...init, headers });
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
  // We point at the PNG endpoint by default — Twitter / X rejects SVG card
  // images, and PNG works on every other platform too. The SVG endpoint
  // remains available at /og.svg?s=... for anyone who wants it.
  const og = `${requestUrl.origin}/og.png?s=${encoded}`;
  const canonical = `${requestUrl.origin}/?s=${encoded}`;
  return [
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:image" content="${esc(og)}">`,
    `<meta property="og:image:type" content="image/png">`,
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
