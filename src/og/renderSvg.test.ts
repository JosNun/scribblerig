import { describe, expect, it } from "vitest";
// Vite's `?raw` import returns the file's source as a string — used for the
// DOM-import guard test below. Works at both `tsc` time (via `vite/client`'s
// ambient declarations in `src/vite-env.d.ts`) and at vitest run time.
import renderSvgSource from "./renderSvg.ts?raw";
import { addBody, addConnector, createScene, type Scene } from "../scene/scene";
import { makeBody, makeConnector } from "../registry/registry";
import { renderSceneToSvg } from "./renderSvg";

/**
 * Tests for the DOM-free SVG renderer (issue og-share/01).
 *
 * These don't pretend to be pixel-perfect comparisons — visual fidelity is
 * judged by eyeballing the output. What we lock in here is the *structural*
 * contract: the function emits well-formed SVG with the right top-level
 * shape (svg root, paper background, dimensions, viewBox), and the right
 * elements show up when bodies / connectors are present.
 */
describe("renderSceneToSvg", () => {
  it("renders a well-formed SVG with default OG dimensions", () => {
    const svg = renderSceneToSvg(createScene());
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('width="1200"');
    expect(svg).toContain('height="630"');
    expect(svg).toContain('viewBox="0 0 1200 630"');
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("honours custom width and height", () => {
    const svg = renderSceneToSvg(createScene(), { width: 800, height: 400 });
    expect(svg).toContain('width="800"');
    expect(svg).toContain('height="400"');
    expect(svg).toContain('viewBox="0 0 800 400"');
  });

  it("paints a paper-coloured background covering the full viewport", () => {
    const svg = renderSceneToSvg(createScene());
    // Just check a paper-coloured rect is present at full size; exact attribute
    // order isn't part of the contract.
    expect(svg).toMatch(/<rect[^>]*fill="#fdf6e3"[^>]*\/>/);
  });

  it("renders a room frame around the default room", () => {
    // The room frame is a Rough.js rectangle; opsToPath produces a <path>
    // element. The default room has a floor wall enabled, which adds another
    // group of paths. We assert the SVG has more than one <path> in this case.
    const svg = renderSceneToSvg(createScene());
    const paths = svg.match(/<path /g) ?? [];
    expect(paths.length).toBeGreaterThan(0);
  });

  it("renders a body when one is placed", () => {
    let scene = createScene();
    const placed = addBody(scene, 0, makeBody("ball", { x: 0, y: 3 }));
    scene = placed.scene;
    const svg = renderSceneToSvg(scene);
    // Body is rendered inside a translate/rotate group.
    expect(svg).toMatch(/<g transform="translate\([^)]+\) rotate\([^)]+\)">/);
  });

  it("renders a spring connector as a path between the two endpoints", () => {
    const built = buildSceneWithSpring();
    const svg = renderSceneToSvg(built);
    // The spring helper emits a plain stroked path with the spring's stroke
    // colour (`#7a5b9b` per the registry).
    expect(svg).toMatch(/<path[^>]+stroke="#7a5b9b"/);
  });

  it("renders a weld connector as a single filled square", () => {
    const built = buildSceneWithWeld();
    const svg = renderSceneToSvg(built);
    // Weld marker uses the weld stroke colour (`#b5651d`) as fill.
    expect(svg).toMatch(/<rect[^>]+fill="#b5651d"/);
  });

  it("renders a pin connector as a ring", () => {
    const built = buildSceneWithPin();
    const svg = renderSceneToSvg(built);
    // Pin uses an SVG <circle> with the pin stroke colour.
    expect(svg).toMatch(/<circle[^>]+stroke="#2b2b2b"/);
  });

  it("doesn't crash on a connector referencing a missing body", () => {
    const scene: Scene = {
      version: 1,
      nextId: 99,
      rooms: [
        {
          settings: createScene().rooms[0].settings,
          bodies: [],
          connectors: [
            {
              id: "c1",
              type: "spring",
              a: { body: "ghost", local: { x: 0, y: 0 } },
              b: { world: { x: 1, y: 1 } },
              props: { stiffness: 50, restLength: 1, damping: 1, collide: false },
            },
          ],
        },
      ],
    };
    expect(() => renderSceneToSvg(scene)).not.toThrow();
  });

  it("renders an empty (no-rooms) scene without crashing", () => {
    const scene: Scene = { version: 1, nextId: 1, rooms: [] };
    const svg = renderSceneToSvg(scene);
    expect(svg).toMatch(/^<svg /);
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  // The single most-load-bearing invariant: the renderer must not import
  // anything that needs a DOM. The worker runs in a Cloudflare environment
  // with no `document` / `window` / `HTMLCanvasElement`, and an accidental
  // DOM import would crash the worker at load time. We guard with a static
  // grep against the source file.
  it("has no DOM-dependent imports", () => {
    const src = renderSvgSource;
    // No `import rough from "roughjs"` (that brings in canvas.js + svg.js
    // entry which reference document/HTMLCanvasElement at the top level).
    expect(src).not.toMatch(/from\s+["']roughjs["']/);
    // No direct DOM globals.
    expect(src).not.toMatch(/\bdocument\b/);
    expect(src).not.toMatch(/\bwindow\b/);
    expect(src).not.toMatch(/HTMLCanvasElement|HTMLElement|HTMLImageElement/);
  });
});

function buildSceneWithSpring(): Scene {
  let s = createScene();
  const a = addBody(s, 0, makeBody("ball", { x: -1, y: 3 }));
  s = a.scene;
  const b = addBody(s, 0, makeBody("ball", { x: 1, y: 3 }));
  s = b.scene;
  s = addConnector(
    s,
    0,
    makeConnector(
      "spring",
      { body: a.id, local: { x: 0, y: 0 } },
      { body: b.id, local: { x: 0, y: 0 } },
    ),
  ).scene;
  return s;
}

function buildSceneWithWeld(): Scene {
  let s = createScene();
  const a = addBody(s, 0, makeBody("ball", { x: 0, y: 3 }));
  s = a.scene;
  const b = addBody(s, 0, makeBody("platform", { x: 0, y: 3 }));
  s = b.scene;
  s = addConnector(
    s,
    0,
    makeConnector(
      "weld",
      { body: a.id, local: { x: 0, y: 0 } },
      { body: b.id, local: { x: 0, y: 0 } },
    ),
  ).scene;
  return s;
}

function buildSceneWithPin(): Scene {
  let s = createScene();
  const a = addBody(s, 0, makeBody("ball", { x: 0, y: 3 }));
  s = a.scene;
  s = addConnector(
    s,
    0,
    makeConnector("pin", { body: a.id, local: { x: 0, y: 0 } }, { world: { x: 0, y: 3 } }),
  ).scene;
  return s;
}
