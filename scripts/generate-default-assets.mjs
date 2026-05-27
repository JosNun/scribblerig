/**
 * Generate the default OpenGraph image + favicon as static assets.
 *
 *   bun scripts/generate-default-assets.mjs
 *
 * Writes three files into `public/`:
 *
 * - `og-default.svg` — a curated scene rendered through `renderSceneToSvg`,
 *   1200×630 for the OG card slot. The scene itself is the source — it
 *   carries its own header as an in-scene text body, so this script doesn't
 *   need to overlay a wordmark.
 * - `og-default.png` — the SVG rasterised via @resvg/resvg-wasm. PNG is the
 *   load-bearing format because Twitter / X rejects SVG card images.
 * - `favicon.svg` — a single ball at near-zero margin so it fills the icon.
 *
 * The OG scene is the immutable shortlink iDQ52c99L3, hand-built in the app
 * — a car, ramp, pendulum, and hand-lettered header. Embedded here as its
 * base64url blob so the build is self-contained; decode at generation time.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderSceneToSvg } from "../src/og/renderSvg.ts";
import { decodeScene } from "../src/share/codec.ts";
import { addBody, createScene, updateRoomSettings } from "../src/scene/scene.ts";
import { makeBody } from "../src/registry/registry.ts";
import { Resvg, initWasm } from "@resvg/resvg-wasm";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const publicDir = join(root, "public");
const wasmPath = join(root, "node_modules/@resvg/resvg-wasm/index_bg.wasm");
const fontPath = join(publicDir, "fonts/Mynerve-Regular.ttf");

// The OG hero scene, exported from the live app as a shortlink. Immutable
// by design (see ADR-0010), so this blob is a stable reference. To swap
// the hero, build a new scene in the app, mint a new shortlink, and paste
// its `sceneEnc` here.
const OG_SCENE_ENC =
  "eJy9V9ty4kYQ_ZboGaumL9Mzwx-kKk_JY2ofMAivqjAiQl6v4_K_54xAXARbsJtkbT8gLPWc0336dOu9-FK127pZF1OaFOvqa_fropiyTIq2aZ63xfTP92JbdV29fsLFe_HUzr7U3Vv--LWYukmBjw-pjPQxKV5nq1V_03LVNG0x7dqXalLMq3qFp4vpcrba4npVLbvDRVs_fR6uEGFb_13lAK_1ovsMRDwpPle7W4jz_9ezzfHux2ZRVzuINUAXj1RMiu5tU-XPwIKrTbOtu55dj_eBSlVSjqzJM0dx1jMIpfrg8KemajF-ZPrdbPekK4MICXNIQYnZkKhN22x6qu1sUb9s801-Uizbej48g8u22nZ193LyzaJab_vs0cfHZEAtR9Sb1axbNu3zFeRSRkfJiSeNQMnie-RaOg1syZxw8AoSI-wazRnFFDx7lwKfYN9nWcGPQvLRIiftbxmS7krBqY5A3wQZCzGcs7QxS9Qonz3fVf-Epd7FklEfS_nAyCYucexZWmnMYjGQJ44AeX-B9iTllJTeTWIntSMLf1NhUqpYEnYhePAwk56BB0afqK-fkTf-SRK7J-VINvIKcQVSt894KL1zPkoSQBLnwjneywRTGVNMLilbMI6q8UxG7JEWlxy6T2Py31mAyT79sbiPk5ScArIdycQ7wJFBRtHHgG7xaBmxM06wBpYYfUpMilKpXSOZFMkKZuZBJaVwRtJ5JxLZByMKjn6QZLqPpAOW4BOjYWBlCsB7QzBUzTmNjhU9byOhJVRJjVPycAsT-Y9bZSBB4ZTF9V5xJWtEnlmZYuQYdlWS0ouPDo3gmNlDhN_U3g-3xgHmWbI7jL9rME2AjZxzpGQUwl5M6rOWDZIPqs7GmeYA5YnAr2Ceemq8_TnT4o95Wz8-rqrf66dfimH4wQrQeSc_NLLUATpz8fEJ47VZr6t517S7Qbhn8lqtFgg5y6dhTL7tdIXh28xnqwOvKF69dxEoDZXYTRRXOpeNXrOc4brJQSUfedyeBoujYA-IZridkAcJIaBLhmjE8DsLEf8UqDXlWEMqBjZzcqeFuAZ_fCISpYY_U0ek-cQDfIXvxpRyfSgJvGuMXkexCEqENxu8SxizNOkQyxLIwEfgDLATC9fB0y3w49wjXYm8sKj44M1F2aUL3yP5JhbwNaYB_AiLzy34WGsYMKE27_EU3ICPyWeyBHMAK0zU9A0CfErguYGcxgz8JQMEtAh1KJYHbCXB9MABDCAHEIP9ir-UzxUGGXvgJAnWJFHTIZZPeTPBfMIig8Un-FMKxXZTVeCAowH6rxfgZ5ebP6-11XnLzEnOrLVe39ZYNO8pMQYgJAz9HqtkhJxnzYeEYRLv0Jjk-QcRYYag4_arZ44lTPByorzgoU34eo30J4Kni1gOow1NnbCjkGEIossGjbHD0PeZnOAm3oW7xO9v4P-XCfvf8dsN_Bh5FwSIkOSYLYQj3OhosF7UBcGSkPXujgV4bVq4x_C8oXy4D9MaY5v1sErGqBSyPbiwN-dLuPGWJ9HlQHA5z3CLDBcrXLIBsMD6cnZwKuaBeb3M-Jh9bmmECQmuk3sbG_xRf1g-sIBFRm5wTPRXKfDZTNhu2vwaOSIho1OxzZrH204SbJoBLz_DmVAK5pl5gwaQtKRXUw7Q-SUqRfW4mwy90QdgLFtYSkLuJJKgIw_q6uVyXW1xEd1u8_itWj_lZYrxfpYHnypWgEQEm1_Mnjf9C7Hk6b1a1YuxTzHmySf8_gNJekY7";

const ogScene = decodeScene(OG_SCENE_ENC);
if (!ogScene) {
  throw new Error("Could not decode OG scene blob — has the codec changed?");
}

// ---------- viewport composition ----------------------------------------

const OG_W = 1200;
const OG_H = 630;
const OG_ASPECT = OG_W / OG_H;

// Hand-tuned framing for this scene: the ramp runs off the left, the
// pendulum's fixed pivot sits near the right edge, the car cluster + the
// hand-lettered header fill the middle. Tweak these if the underlying scene
// (OG_SCENE_ENC) changes meaningfully — the rest of the script derives the
// viewport from them.
//
// Vertical extent is pinned to the content: the top of the upper car ball
// (y≈7.96) and the bottom of the pendulum ball (y≈3.04 with a hair of
// padding). OG aspect determines the resulting width.
const VP_TOP_Y = 8.05;
const VP_BOTTOM_Y = 2.9;
const VP_HEIGHT = VP_TOP_Y - VP_BOTTOM_Y;
const VP_WIDTH = VP_HEIGHT * OG_ASPECT;
// World-x of the pendulum's pin (decoded from the scene). The pin lands at
// PIN_RIGHT_FRACTION of the viewport from the left, so the pendulum hangs
// from near the right edge.
const PIN_X = 1.65;
const PIN_RIGHT_FRACTION = 0.86;
const viewport = {
  centerX: PIN_X - (PIN_RIGHT_FRACTION - 0.5) * VP_WIDTH,
  centerY: (VP_TOP_Y + VP_BOTTOM_Y) / 2,
  width: VP_WIDTH,
  height: VP_HEIGHT,
};

/**
 * Favicon scene: a single ball, no chrome, near-zero margin so it
 * fills the icon. Reads unambiguously as "scribble circle" at 16–32px.
 */
function faviconScene() {
  let s = createScene();
  s = updateRoomSettings(s, 0, {
    size: { width: 2, height: 2 },
    walls: { floor: false, ceiling: false, left: false, right: false },
  });
  s = addBody(s, 0, {
    ...makeBody("ball", { x: 0, y: 1 }),
    props: { radius: 1, restitution: 0.7, density: 1 },
  }).scene;
  return s;
}

// ---------- render --------------------------------------------------------

const ogSvg = renderSceneToSvg(ogScene, {
  width: OG_W,
  height: OG_H,
  // Crop tight to the content bbox: skip the room frame + walls, but keep
  // the paper background so the card has a solid colour against dark or
  // light platform UI.
  chrome: false,
  paper: true,
  viewport,
  // Lock the hatch density to a typical canvas-renderer zoom (~85 px/m), not
  // the viewport's actual ~160 px/m. Without this, the world-scaled gaps
  // grow to ~24 px and the fills read as parallel stripes instead of a
  // hand-drawn hachure — making the body colours look washed out.
  fillScale: 85,
});
const favSvg = renderSceneToSvg(faviconScene(), {
  width: 64,
  height: 64,
  chrome: false,
  margin: 0.05,
});

writeFileSync(join(publicDir, "og-default.svg"), ogSvg);
writeFileSync(join(publicDir, "favicon.svg"), favSvg);

// Rasterise the OG SVG to PNG (Twitter / X rejects SVG card images). The
// OG scene includes a text body whose glyph runs through the renderer's
// own path output, so resvg doesn't need a font to rasterise it — but we
// keep Mynerve bundled in case a future scene leans on a system <text>.
const wasmBytes = readFileSync(wasmPath);
await initWasm(await WebAssembly.compile(wasmBytes));
const fontBytes = readFileSync(fontPath);
const resvg = new Resvg(ogSvg, {
  fitTo: { mode: "width", value: 1200 },
  font: {
    loadSystemFonts: false,
    fontBuffers: [fontBytes],
    defaultFontFamily: "Mynerve",
  },
});
const png = resvg.render().asPng();
writeFileSync(join(publicDir, "og-default.png"), png);

console.log(
  `wrote ${ogSvg.length}B og-default.svg, ${favSvg.length}B favicon.svg, ${png.length}B og-default.png`,
);
