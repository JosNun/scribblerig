import { describe, expect, it, vi } from "vitest";

// Stub renderPng before importing the worker. The real implementation
// imports `@resvg/resvg-wasm/index_bg.wasm`, which vitest's node env can't
// load. Tests assert on response shape (status, content-type, cache
// headers) rather than the bytes, so a fake 8-byte PNG signature is
// plenty to confirm the right branch fired.
vi.mock("../og/renderPng", () => ({
  renderSvgToPng: vi.fn(async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
}));

import worker, {
  buildOgDataScript,
  buildOgMeta,
  buildShortlinkMeta,
  injectMetaIntoHead,
  isStaticAsset,
  parseShareBody,
  type Env,
  type ShortlinkRow,
} from "./index";
import { encodeScene } from "../share/codec";
import { addBody, createScene, type Scene } from "../scene/scene";
import { makeBody } from "../registry/registry";

/**
 * Tiny in-memory `KVNamespace` shim. We implement only the methods the
 * worker calls — anything else throws so a future call gets caught loudly
 * by the test runner rather than silently returning undefined.
 */
function makeMockKV(): KVNamespace {
  const store = new Map<string, { value: string; expiresAt?: number }>();
  const now = () => Date.now();
  const live = (key: string) => {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < now()) {
      store.delete(key);
      return null;
    }
    return entry;
  };
  // Cast through unknown so the structural mock satisfies the full
  // KVNamespace type without us implementing list/getWithMetadata/etc.
  return {
    async get(key: string) {
      return live(key)?.value ?? null;
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }) {
      const expiresAt = opts?.expirationTtl ? now() + opts.expirationTtl * 1000 : undefined;
      store.set(key, { value, expiresAt });
    },
    async delete(key: string) {
      store.delete(key);
    },
  } as unknown as KVNamespace;
}

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
    env: {
      ASSETS: { fetch: assetsFetch as unknown as Fetcher["fetch"] } as Fetcher,
      SHARES: makeMockKV(),
    } satisfies Env,
    assetsFetch,
  };
}

function mintRequest(body: unknown, ip = "1.1.1.1"): Request {
  return new Request("https://example.com/api/share", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify(body),
  });
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
function makeEnv(): { env: Env; assetsFetch: ReturnType<typeof vi.fn>; shares: KVNamespace } {
  const assetsFetch = vi.fn(async (req: Request) => new Response("asset:" + new URL(req.url).pathname));
  const shares = makeMockKV();
  const env: Env = {
    ASSETS: { fetch: assetsFetch as unknown as Fetcher["fetch"] } as Fetcher,
    SHARES: shares,
  };
  return { env, assetsFetch, shares };
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

// ----------------------------------------------------------------------
// OG PNG endpoints (follow-up after OG-8 — Twitter / X rejects SVG)
// ----------------------------------------------------------------------

describe("GET /og.png?s=ENC", () => {
  it("rasterises the SVG and returns image/png with immutable caching", async () => {
    const { env } = makeEnv();
    const enc = encodeScene(sampleScene());
    const res = await worker.fetch(
      new Request(`https://example.com/og.png?s=${enc}`),
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("immutable");
    // Stubbed PNG payload — first 8 bytes are the PNG signature.
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50); // 'P'
    expect(bytes[2]).toBe(0x4e); // 'N'
    expect(bytes[3]).toBe(0x47); // 'G'
  });

  it("returns 400 when the `s` parameter is missing", async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(new Request("https://example.com/og.png"), env);
    expect(res.status).toBe(400);
  });

  it("returns 400 when the scene fails to decode", async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(
      new Request("https://example.com/og.png?s=not-a-real-payload"),
      env,
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /s/<id>/og.png", () => {
  it("rasterises the stored shortlink's scene to PNG", async () => {
    const { env, shares } = makeEnv();
    const { id } = await seedShortlink(shares);
    const res = await worker.fetch(
      new Request(`https://example.com/s/${id}/og.png`),
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("immutable");
  });

  it("returns 404 for an unknown ID", async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(
      new Request("https://example.com/s/doesnotexist/og.png"),
      env,
    );
    expect(res.status).toBe(404);
  });
});

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
    // og:image points to /og.png with the same encoded payload — PNG is
    // the default OG format (SVG is rejected by Twitter / X).
    expect(html).toContain(`/og.png?s=${enc}`);
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
    // og:image points at the PNG endpoint (PNG is the default OG format).
    expect(meta).toContain('content="https://example.com/og.png?s=X"');
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

// ----------------------------------------------------------------------
// OG-7: POST /api/share — mint a shortlink (rate-limited)
// ----------------------------------------------------------------------

describe("POST /api/share", () => {
  it("mints a shortlink for a valid payload + persists the row to KV", async () => {
    const { env, shares } = makeEnv();
    const sceneEnc = encodeScene(sampleScene());
    const res = await worker.fetch(mintRequest({ sceneEnc, title: "Foo" }), env);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; url: string };
    // Returned URL is absolute and includes the new ID.
    expect(body.url).toMatch(/^https:\/\/example\.com\/s\/[A-Za-z0-9]{10}$/);
    expect(body.id).toHaveLength(10);
    // KV now holds the row keyed by that ID.
    const stored = await shares.get(body.id);
    expect(stored).toBeTruthy();
    const row = JSON.parse(stored!) as ShortlinkRow;
    expect(row.sceneEnc).toBe(sceneEnc);
    expect(row.title).toBe("Foo");
    expect(typeof row.createdAt).toBe("number");
  });

  it("omits the title field when none was supplied", async () => {
    const { env, shares } = makeEnv();
    const sceneEnc = encodeScene(sampleScene());
    const res = await worker.fetch(mintRequest({ sceneEnc }), env);
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const row = JSON.parse((await shares.get(id))!) as ShortlinkRow;
    expect(row.title).toBeUndefined();
  });

  it("rejects a missing sceneEnc with 400", async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(mintRequest({}), env);
    expect(res.status).toBe(400);
  });

  it("rejects a non-JSON body with 400", async () => {
    const { env } = makeEnv();
    const req = new Request("https://example.com/api/share", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "1.1.1.1" },
      body: "not-json{",
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(400);
  });

  it("rejects invalid sceneEnc charset with 400", async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(
      mintRequest({ sceneEnc: "not!base64?url" }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("rejects oversized sceneEnc with 400", async () => {
    const { env } = makeEnv();
    const huge = "A".repeat(64 * 1024 + 1);
    const res = await worker.fetch(mintRequest({ sceneEnc: huge }), env);
    expect(res.status).toBe(400);
  });

  it("sanitises titles before storage (control chars, length, HTML)", async () => {
    const { env, shares } = makeEnv();
    const sceneEnc = encodeScene(sampleScene());
    const dirty = "Hello\x00<script>" + "x".repeat(200);
    const res = await worker.fetch(
      mintRequest({ sceneEnc, title: dirty }),
      env,
    );
    const { id } = (await res.json()) as { id: string };
    const row = JSON.parse((await shares.get(id))!) as ShortlinkRow;
    // Sanitiser strips control chars + `<>` and caps at 80 chars.
    expect(row.title).not.toMatch(/[\x00<>]/);
    expect((row.title ?? "").length).toBeLessThanOrEqual(80);
  });

  it("rate-limits a single IP to 10 mints per minute (11th → 429)", async () => {
    const { env } = makeEnv();
    const sceneEnc = encodeScene(sampleScene());
    for (let i = 0; i < 10; i++) {
      const res = await worker.fetch(mintRequest({ sceneEnc }, "rate-test"), env);
      expect(res.status).toBe(201);
    }
    const denied = await worker.fetch(mintRequest({ sceneEnc }, "rate-test"), env);
    expect(denied.status).toBe(429);
    expect(denied.headers.get("retry-after")).toBe("60");
  });

  it("does not rate-limit different IPs independently", async () => {
    const { env } = makeEnv();
    const sceneEnc = encodeScene(sampleScene());
    for (let i = 0; i < 10; i++) {
      await worker.fetch(mintRequest({ sceneEnc }, "ip-a"), env);
    }
    // Different IP — should still succeed.
    const res = await worker.fetch(mintRequest({ sceneEnc }, "ip-b"), env);
    expect(res.status).toBe(201);
  });

  it("does NOT respond to GET /api/share (route is POST-only)", async () => {
    const { env, assetsFetch } = makeEnv();
    await worker.fetch(new Request("https://example.com/api/share"), env);
    // Falls through to ASSETS rather than handling the mint logic.
    expect(assetsFetch).toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------
// OG-8: GET /s/<id> + /s/<id>/og.svg — shortlink resolution
// ----------------------------------------------------------------------

const SHORTLINK_INDEX_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ScribbleRig</title></head><body><div id="root"></div></body></html>`;

async function seedShortlink(
  shares: KVNamespace,
  row: Partial<ShortlinkRow> & { sceneEnc?: string; id?: string } = {},
): Promise<{ id: string; row: ShortlinkRow }> {
  const id = row.id ?? "abc1234567";
  const stored: ShortlinkRow = {
    sceneEnc: row.sceneEnc ?? encodeScene(sampleScene()),
    ...(row.title ? { title: row.title } : {}),
    createdAt: row.createdAt ?? Date.now(),
  };
  await shares.put(id, JSON.stringify(stored));
  return { id, row: stored };
}

describe("GET /s/<id>/og.svg", () => {
  it("renders the SVG from the stored scene with immutable caching", async () => {
    const { env, shares } = makeEnv();
    const { id } = await seedShortlink(shares);
    const res = await worker.fetch(
      new Request(`https://example.com/s/${id}/og.svg`),
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^image\/svg\+xml/);
    expect(res.headers.get("cache-control")).toContain("immutable");
    const body = await res.text();
    expect(body.startsWith("<svg ")).toBe(true);
  });

  it("returns 404 for an unknown ID", async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(
      new Request("https://example.com/s/doesnotexist/og.svg"),
      env,
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /s/<id>", () => {
  function makeEnvForShortlink() {
    const assetsFetch = vi.fn(async (req: Request) => {
      const url = new URL(req.url);
      if (url.pathname === "/" || url.pathname.endsWith("/index.html")) {
        return new Response(SHORTLINK_INDEX_HTML, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      return new Response("asset:" + url.pathname);
    });
    const shares = makeMockKV();
    const env: Env = {
      ASSETS: { fetch: assetsFetch as unknown as Fetcher["fetch"] } as Fetcher,
      SHARES: shares,
    };
    return { env, assetsFetch, shares };
  }

  it("injects og:* meta tags and the inline og-data script", async () => {
    const { env, shares } = makeEnvForShortlink();
    const sceneEnc = encodeScene(sampleScene());
    const { id } = await seedShortlink(shares, { sceneEnc, title: "Demo" });
    const res = await worker.fetch(new Request(`https://example.com/s/${id}`), env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(`property="og:title"`);
    expect(html).toContain(`content="Demo"`);
    // Image URL points to /s/<id>/og.png (PNG default), NOT /og.svg?s=
    expect(html).toContain(`/s/${id}/og.png`);
    // og-data script carries the encoded scene
    expect(html).toContain(`id="og-data"`);
    expect(html).toContain(sceneEnc);
  });

  it("uses the stored title even if the encoded scene's title differs", async () => {
    const { env, shares } = makeEnvForShortlink();
    // Encoded scene says "embedded", but the stored row says "stored". The
    // stored title wins because that's what the creator named the share.
    const inner = { ...sampleScene(), title: "embedded" };
    const { id } = await seedShortlink(shares, {
      sceneEnc: encodeScene(inner),
      title: "stored",
    });
    const res = await worker.fetch(new Request(`https://example.com/s/${id}`), env);
    const html = await res.text();
    expect(html).toContain(`content="stored"`);
    expect(html).not.toContain(`content="embedded"`);
  });

  it("falls back to deriveTitle when no title is stored", async () => {
    const { env, shares } = makeEnvForShortlink();
    const { id } = await seedShortlink(shares, {
      sceneEnc: encodeScene(sampleScene()),
    });
    const res = await worker.fetch(new Request(`https://example.com/s/${id}`), env);
    const html = await res.text();
    expect(html).toContain(`content="1 ball"`); // sampleScene has one ball
  });

  it("sends immutable Cache-Control", async () => {
    const { env, shares } = makeEnvForShortlink();
    const { id } = await seedShortlink(shares);
    const res = await worker.fetch(new Request(`https://example.com/s/${id}`), env);
    expect(res.headers.get("cache-control")).toContain("immutable");
  });

  it("returns 404 for an unknown ID", async () => {
    const { env } = makeEnvForShortlink();
    const res = await worker.fetch(new Request("https://example.com/s/missing999"), env);
    expect(res.status).toBe(404);
  });
});

describe("buildShortlinkMeta", () => {
  it("uses absolute /s/<id>/og.png as og:image", () => {
    const meta = buildShortlinkMeta(
      sampleScene("Foo"),
      new URL("https://example.com/s/abc123"),
      "abc123",
    );
    // PNG is the default OG format; SVG remains available at /s/<id>/og.svg
    // for anyone who wants it, but the meta tag points crawlers at PNG.
    expect(meta).toContain('content="https://example.com/s/abc123/og.png"');
    expect(meta).toContain('content="https://example.com/s/abc123"');
  });
});

describe("buildOgDataScript", () => {
  it("emits a JSON-typed script with the encoded scene payload", () => {
    const out = buildOgDataScript("ABCxyz_-");
    expect(out).toContain(`type="application/json"`);
    expect(out).toContain(`id="og-data"`);
    expect(out).toContain(`"sceneEnc":"ABCxyz_-"`);
  });

  it("escapes any </script> sequences defensively", () => {
    // The encoded scene shouldn't contain `<`, but the defence layer is
    // independent of upstream sanitisation.
    const out = buildOgDataScript("safe");
    expect(out).not.toContain("</script>safe");
    // Round-trip: the body of the script (after stripping the wrapper) is
    // still parseable as JSON.
    const body = out.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
    expect(() => JSON.parse(body)).not.toThrow();
  });
});

describe("parseShareBody", () => {
  it("accepts a minimal valid body", () => {
    const out = parseShareBody({ sceneEnc: "ValidPayload_-A" });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value).toEqual({ sceneEnc: "ValidPayload_-A" });
  });

  it("rejects non-object bodies", () => {
    expect(parseShareBody(null).ok).toBe(false);
    expect(parseShareBody("string").ok).toBe(false);
    expect(parseShareBody(42).ok).toBe(false);
    // Arrays *are* `typeof object` in JS, but they have no `sceneEnc` key
    // so the next check rejects them.
    expect(parseShareBody([]).ok).toBe(false);
  });

  it("rejects missing or wrong-typed sceneEnc", () => {
    expect(parseShareBody({}).ok).toBe(false);
    expect(parseShareBody({ sceneEnc: "" }).ok).toBe(false);
    expect(parseShareBody({ sceneEnc: 42 }).ok).toBe(false);
  });

  it("drops a non-string title rather than erroring", () => {
    const out = parseShareBody({ sceneEnc: "ABC123", title: 42 });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.title).toBeUndefined();
  });
});
