// One-off: fetch a shortlink, decode the scene, and rewrite
// src/share/tutorialScene.ts with the result.
//
//   bun run .scratch/onboarding-tutorial/regen-tutorial.ts <url>

import { decodeScene } from "../../src/share/codec";
import { writeFileSync } from "node:fs";

const url = process.argv[2];
if (!url) {
  console.error("Usage: bun run regen-tutorial.ts <shortlink-url>");
  process.exit(1);
}

const html = await (await fetch(url)).text();
const match = html.match(/id="og-data"[^>]*>(\{[^<]*\})<\/script>/);
if (!match) {
  console.error("No og-data script found in HTML.");
  process.exit(1);
}
const { sceneEnc } = JSON.parse(match[1]);
const scene = decodeScene(sceneEnc);
if (!scene) {
  console.error("Failed to decode scene.");
  process.exit(1);
}

// Force the title we want; users' working scenes may carry whatever title.
scene.title = "Tutorial";

const header = `/**
 * The onboarding tutorial scene: a single playable Rube-Goldberg chain that
 * exercises every body and connector type. Hand-authored by the maintainer
 * in the running app, then exported via the share link and re-emitted here
 * as a Scene literal.
 *
 * Regenerate with:
 *   bun run .scratch/onboarding-tutorial/regen-tutorial.ts <url>
 *
 * Wiring this into \`bootSession\` and a "Show tutorial" button is the next
 * step (PRD); this constant is the scene itself.
 */

import type { Scene } from "../scene/scene";

export const TUTORIAL_TITLE = "Tutorial";

export const tutorialScene: Scene = `;

const body = JSON.stringify(scene, null, 2) + ";\n";

writeFileSync("src/share/tutorialScene.ts", header + body);
console.log(`Wrote src/share/tutorialScene.ts (${scene.rooms[0].bodies.length} bodies, ${scene.rooms[0].connectors.length} connectors)`);
