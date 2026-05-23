import { describe, expect, it } from "vitest";
import {
  encodedLength,
  sceneFromUrl,
  strippedUrl,
} from "./storage";
import { encodeScene } from "./codec";
import { addBody, createScene, type Scene } from "../scene/scene";
import { makeBody } from "../registry/registry";

/**
 * Pure URL-shape helpers. The impure boot/share/clipboard surface in
 * `storage.ts` reaches into `location`/`history` and is exercised through
 * the running app instead; what's locked in here is the URL-format
 * contract that flows into the worker, the OG renderer, and the SPA boot.
 */
function sample(): Scene {
  let s = createScene();
  s = addBody(s, 0, makeBody("ball", { x: 0, y: 1 })).scene;
  return s;
}

describe("sceneFromUrl", () => {
  it("reads a scene from a `?s=` query parameter", () => {
    const enc = encodeScene(sample());
    const url = `https://example.com/path?s=${enc}`;
    expect(sceneFromUrl(url)).toBeTruthy();
  });

  it("falls back to the legacy `#…` fragment when `?s=` is absent", () => {
    const enc = encodeScene(sample());
    const url = `https://example.com/path#${enc}`;
    expect(sceneFromUrl(url)).toBeTruthy();
  });

  it("prefers `?s=` over `#` when both are present", () => {
    let withTitle = sample();
    withTitle.title = "via query";
    const encQ = encodeScene(withTitle);
    const encH = encodeScene(sample());
    const url = `https://example.com/path?s=${encQ}#${encH}`;
    expect(sceneFromUrl(url)?.title).toBe("via query");
  });

  it("returns null when the URL has no share payload", () => {
    expect(sceneFromUrl("https://example.com/path")).toBeNull();
    expect(sceneFromUrl("https://example.com/path?other=1")).toBeNull();
    expect(sceneFromUrl("https://example.com/path#")).toBeNull();
  });

  it("returns null for an unparseable URL string", () => {
    expect(sceneFromUrl("not a url")).toBeNull();
  });
});

describe("strippedUrl", () => {
  it("removes the `s` query parameter", () => {
    expect(strippedUrl("https://example.com/path?s=ENCODED")).toBe("/path");
  });

  it("removes a `#…` fragment", () => {
    expect(strippedUrl("https://example.com/path#ENCODED")).toBe("/path");
  });

  it("removes both forms in one pass when present together", () => {
    expect(strippedUrl("https://example.com/path?s=A#B")).toBe("/path");
  });

  it("preserves other query parameters", () => {
    expect(strippedUrl("https://example.com/path?other=1&s=ENC")).toBe("/path?other=1");
    expect(strippedUrl("https://example.com/path?s=ENC&other=1")).toBe("/path?other=1");
  });

  it("leaves a URL without share payload unchanged", () => {
    expect(strippedUrl("https://example.com/path?other=1")).toBe("/path?other=1");
    expect(strippedUrl("https://example.com/path")).toBe("/path");
  });
});

describe("encodedLength", () => {
  it("returns the same byte count as encodeScene(scene).length", () => {
    const s = sample();
    expect(encodedLength(s)).toBe(encodeScene(s).length);
  });

  it("is positive for any non-empty scene", () => {
    expect(encodedLength(sample())).toBeGreaterThan(0);
    expect(encodedLength(createScene())).toBeGreaterThan(0);
  });

  it("grows with the size of the scene", () => {
    const small = encodedLength(createScene());
    let big = createScene();
    for (let i = 0; i < 30; i++) {
      big = addBody(big, 0, makeBody("ball", { x: i, y: 1 })).scene;
    }
    expect(encodedLength(big)).toBeGreaterThan(small);
  });
});
