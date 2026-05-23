import { describe, expect, it, vi } from "vitest";
import worker, { buildOgMeta, injectMetaIntoHead, isStaticAsset, type Env } from "./index";
import { encodeScene } from "../share/codec";
import { addBody, createScene, type Scene } from "../scene/scene";
import { makeBody } from "../registry/registry";

function sampleScene(title?: string): Scene {
  let s = createScene();
  s = addBody(s, 0, makeBody("ball", { x: 0, y: 3 })).scene;
  if (title) s.title = title;
  return s;
}

function makeEnvWithIndexHtml(html: string) {
  const assetsFetch = vi.fn(async (req: Request) => {
    const url = new URL(req.url);
    if (url.pathname === "/" || url.pathname.endsWith("/index.html")) {
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    return new Response("asset:" + url.pathname);
  });
  return {
    env: { ASSETS: { fetch: assetsFetch as unknown as Fetcher["fetch"] } as Fetcher } satisfies Env,
    assetsFetch,
  };
}

/**
 * Worker dispatch tests. We exercise the `fetch` entry point with a
 * mocked `ASSETS` binding, verifying that requests land on the right
 * branch — currently:
 *
 *  - static assets bypass the worker entirely (cheap path);
 *  - everything else passes through to the SPA's index.html.
 *
 * Branches added by later issues (OG-6 OG meta injection, OG-7 mint
 * endpoint, OG-8 `/s/<id>` resolution) extend this file.
 */
function makeEnv(): { env: Env; assetsFetch: ReturnType<typeof vi.fn> } {
  const assetsFetch = vi.fn(async (req: Request) => new Response("asset:" + new URL(req.url).pathname));
  const env: Env = { ASSETS: { fetch: assetsFetch as unknown as Fetcher["fetch"] } as Fetcher };
  return { env, assetsFetch };
}

describe("isStaticAsset", () => {
  it("matches paths under /assets/", () => {
    expect(isStaticAsset("/assets/index-abc.js")).toBe(true);
    expect(isStaticAsset("/assets/index-abc.css")).toBe(true);
    expect(isStaticAsset("/assets/some-icon.svg")).toBe(true);
  });

  it("does not match the root or share paths", () => {
    expect(isStaticAsset("/")).toBe(false);
    expect(isStaticAsset("/s/abc123")).toBe(false);
    expect(isStaticAsset("/og.svg")).toBe(false);
    expect(isStaticAsset("/api/share")).toBe(false);
  });

  it("does not match paths that merely contain 'assets' later in the URL", () => {
    expect(isStaticAsset("/api/assets")).toBe(false);
    expect(isStaticAsset("/s/myassets")).toBe(false);
  });
});

describe("worker fetch dispatch", () => {
  it("routes /assets/* directly to env.ASSETS.fetch", async () => {
    const { env, assetsFetch } = makeEnv();
    const req = new Request("https://example.com/assets/index-abc.js");
    const res = await worker.fetch(req, env);
    expect(assetsFetch).toHaveBeenCalledOnce();
    expect(assetsFetch.mock.calls[0][0]).toBe(req);
    expect(await res.text()).toContain("/assets/index-abc.js");
  });

  it("routes the root path through to env.ASSETS for SPA hydration", async () => {
    const { env, assetsFetch } = makeEnv();
    const req = new Request("https://example.com/");
    await worker.fetch(req, env);
    expect(assetsFetch).toHaveBeenCalledOnce();
  });

  it("routes unknown paths through to env.ASSETS (SPA history routes)", async () => {
    const { env, assetsFetch } = makeEnv();
    const req = new Request("https://example.com/unknown-route");
    await worker.fetch(req, env);
    expect(assetsFetch).toHaveBeenCalledOnce();
  });

  it("preserves the original Request reference when delegating", async () => {
    const { env, assetsFetch } = makeEnv();
    const req = new Request("https://example.com/some-path");
    await worker.fetch(req, env);
    // Identity check — we pass through the same Request object, not a copy.
    expect(assetsFetch.mock.calls[0][0]).toBe(req);
  });
});

// ----------------------------------------------------------------------
// OG-6: SVG render at /og.svg and HTMLRewriter injection at /?s=
// ----------------------------------------------------------------------

describe("GET /og.svg?s=ENC", () => {
  it("returns a rendered SVG with immutable caching", async () => {
    const { env } = makeEnv();
    const enc = encodeScene(sampleScene());
    const res = await worker.fetch(
      new Request(`https://example.com/og.svg?s=${enc}`),
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^image\/svg\+xml/);
    expect(res.headers.get("cache-control")).toContain("immutable");
    const body = await res.text();
    expect(body.startsWith("<svg ")).toBe(true);
    expect(body.endsWith("</svg>")).toBe(true);
  });

  it("returns 400 when the `s` parameter is missing", async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(new Request("https://example.com/og.svg"), env);
    expect(res.status).toBe(400);
  });

  it("returns 400 when the scene fails to decode", async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(
      new Request("https://example.com/og.svg?s=not-a-real-payload"),
      env,
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /?s=ENC HTML rewriting", () => {
  const INDEX_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ScribbleRig</title></head><body><div id="root"></div></body></html>`;

  it("injects og: meta tags with the scene's title when set", async () => {
    const { env } = makeEnvWithIndexHtml(INDEX_HTML);
    const enc = encodeScene(sampleScene("My machine"));
    const res = await worker.fetch(
      new Request(`https://example.com/?s=${enc}`),
      env,
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(`property="og:title"`);
    expect(html).toContain(`content="My machine"`);
    expect(html).toContain(`property="og:image"`);
    // og:image points to /og.svg with the same encoded payload.
    expect(html).toContain(`/og.svg?s=${enc}`);
  });

  it("falls back to deriveTitle when no scene.title is set", async () => {
    const { env } = makeEnvWithIndexHtml(INDEX_HTML);
    const enc = encodeScene(sampleScene()); // 1 ball, no title
    const res = await worker.fetch(
      new Request(`https://example.com/?s=${enc}`),
      env,
    );
    const html = await res.text();
    expect(html).toContain(`content="1 ball"`);
  });

  it("includes twitter:* tags alongside og:*", async () => {
    const { env } = makeEnvWithIndexHtml(INDEX_HTML);
    const enc = encodeScene(sampleScene("Foo"));
    const res = await worker.fetch(
      new Request(`https://example.com/?s=${enc}`),
      env,
    );
    const html = await res.text();
    expect(html).toContain(`name="twitter:card"`);
    expect(html).toContain(`name="twitter:title"`);
    expect(html).toContain(`name="twitter:image"`);
  });

  it("falls through to env.ASSETS when the share fails to decode", async () => {
    const { env, assetsFetch } = makeEnvWithIndexHtml(INDEX_HTML);
    await worker.fetch(
      new Request("https://example.com/?s=garbage-payload"),
      env,
    );
    expect(assetsFetch).toHaveBeenCalled();
  });

  it("passes the root through to ASSETS when no `s` param is present", async () => {
    const { env, assetsFetch } = makeEnvWithIndexHtml(INDEX_HTML);
    await worker.fetch(new Request("https://example.com/"), env);
    expect(assetsFetch).toHaveBeenCalled();
  });
});

describe("buildOgMeta", () => {
  it("escapes HTML-sensitive characters in titles defensively", () => {
    // The codec sanitiser strips `< >` already, but if anything ever leaks
    // through, the meta string still escapes.
    const scene = { ...sampleScene(), title: 'Bad "quote" title' };
    const meta = buildOgMeta(scene, new URL("https://example.com/?s=X"), "X");
    expect(meta).toContain("&quot;");
    expect(meta).not.toContain('"Bad "quote"');
  });

  it("uses absolute URLs derived from the request origin", () => {
    const meta = buildOgMeta(sampleScene("T"), new URL("https://example.com/?s=X"), "X");
    expect(meta).toContain('content="https://example.com/og.svg?s=X"');
    expect(meta).toContain('content="https://example.com/?s=X"');
  });
});

describe("injectMetaIntoHead", () => {
  it("splices meta just before </head>", () => {
    const out = injectMetaIntoHead(
      "<html><head><title>x</title></head><body></body></html>",
      `<meta property="og:title" content="Y">`,
    );
    expect(out).toBe(
      `<html><head><title>x</title><meta property="og:title" content="Y"></head><body></body></html>`,
    );
  });

  it("is case- and whitespace-tolerant on the </head> tag", () => {
    expect(injectMetaIntoHead("<head></HEAD >", "X")).toBe("<head>X</HEAD >");
  });

  it("appends to the end when no </head> tag exists (graceful degradation)", () => {
    expect(injectMetaIntoHead("no head here", "X")).toBe("no head hereX");
  });
});
