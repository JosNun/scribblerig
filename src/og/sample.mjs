/**
 * Eyeball script: emit a sample OG render to stdout. Not part of the build.
 *
 *   bun run src/og/sample.mjs > /tmp/og-sample.svg
 *   open /tmp/og-sample.svg
 *
 * Useful while iterating on `renderSvg.ts` — change settings or scene below,
 * regenerate, peek in the browser.
 */
import { renderSceneToSvg } from "./renderSvg.ts";
import { addBody, addConnector, createScene } from "../scene/scene.ts";
import { makeBody, makeConnector } from "../registry/registry.ts";

let s = createScene();
s.title = "Demo scene";

const platform = addBody(s, 0, makeBody("platform", { x: 0, y: 2 }));
s = platform.scene;
const ballA = addBody(s, 0, makeBody("ball", { x: -2, y: 5 }));
s = ballA.scene;
const ballB = addBody(s, 0, makeBody("ball", { x: 2, y: 5 }));
s = ballB.scene;

s = addConnector(
  s,
  0,
  makeConnector(
    "spring",
    { body: ballA.id, local: { x: 0, y: 0 } },
    { body: ballB.id, local: { x: 0, y: 0 } },
  ),
).scene;

s = addConnector(
  s,
  0,
  makeConnector(
    "motor",
    { body: ballA.id, local: { x: 0, y: 0 } },
    { world: { x: -2, y: 5 } },
  ),
).scene;

process.stdout.write(renderSceneToSvg(s));
