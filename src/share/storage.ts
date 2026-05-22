/**
 * Browser-side glue around the pure {@link codec}: where a scene comes from on
 * startup (a shared URL fragment, else autosaved work, else the default), how it
 * autosaves, and how to build a share link. Kept apart from the codec so the
 * codec stays pure and unit-testable; everything here touches `window`.
 */

import { encodeScene, decodeScene } from "./codec";
import { tracerScene, type Scene } from "../scene/scene";

const STORAGE_KEY = "physics-sandbox:scene";

/**
 * The scene to open with. A shared link wins (someone deliberately sent it),
 * then autosaved in-progress work, then the default starter scene. All decoding
 * is tolerant, so a stale or partial payload degrades instead of throwing.
 */
export function loadInitialScene(): Scene {
  return sceneFromHash() ?? loadAutosave() ?? tracerScene();
}

/** Whether the URL currently carries a shared scene (so the boot can clear it). */
export function hasSharedScene(): boolean {
  return typeof location !== "undefined" && location.hash.replace(/^#/, "").length > 0;
}

function sceneFromHash(): Scene | null {
  if (typeof location === "undefined") return null;
  const hash = location.hash.replace(/^#/, "");
  return hash ? decodeScene(hash) : null;
}

function loadAutosave(): Scene | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? decodeScene(raw) : null;
  } catch {
    return null; // storage disabled (private mode, etc.)
  }
}

/** Persist the current scene so a refresh restores in-progress work. */
export function saveScene(scene: Scene): void {
  try {
    localStorage.setItem(STORAGE_KEY, encodeScene(scene));
  } catch {
    /* storage full or unavailable — autosave is best-effort */
  }
}

/** A shareable link that encodes the scene in the URL fragment. */
export function shareUrl(scene: Scene): string {
  const base = location.origin + location.pathname;
  return `${base}#${encodeScene(scene)}`;
}
