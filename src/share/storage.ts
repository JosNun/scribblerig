/**
 * Browser glue over the pure {@link codec} and {@link sessions} logic. Owns the
 * localStorage/sessionStorage layout for per-tab sessions (issue 18):
 *
 * - `scribblerig:sid`     (sessionStorage) — this tab's session id;
 * - `scribblerig:scene:<id>` (localStorage) — each build's encoded scene;
 * - `scribblerig:sessions`   (localStorage) — the index of saved builds.
 *
 * Kept impure and thin; the testable logic lives in `codec` and `sessions`.
 */

import { encodeScene, decodeScene } from "./codec";
import {
  type SessionMeta,
  deriveTitle,
  upsertSession,
  removeSession,
  sortByRecent,
  mostRecent,
} from "./sessions";
import { createScene, tracerScene, type Scene, type Body, type Connector } from "../scene/scene";
import { tutorialScene } from "./tutorialScene";

const SCENE_PREFIX = "scribblerig:scene:";
const THUMB_PREFIX = "scribblerig:thumb:";
const INDEX_KEY = "scribblerig:sessions";
const SID_KEY = "scribblerig:sid";
const LEGACY_KEY = "scribblerig:scene"; // single-key autosave from issue 08

export interface SessionBoot {
  id: string;
  scene: Scene;
}

/**
 * Decide this tab's session id and starting scene:
 *  1. a shared URL fragment → a fresh (lazy) session;
 *  2. else this tab's own persisted session (stable reload);
 *  3. else resume the most-recent build's content under a fresh id — a *lazy
 *     fork* that only becomes a saved session once edited (see `saveSession`);
 *  4. else this is a first-ever visit: seed the tutorial scene as the
 *     starting lazy fork (PRD: onboarding-tutorial). The check is "no
 *     sessions in the index," not "no Tutorial in the index" — so deleting
 *     the tutorial doesn't re-seed it next reload.
 */
export function bootSession(): SessionBoot {
  migrateLegacy();

  // Inline `og-data` blob (worker-injected on /s/<id> visits) takes priority
  // over reading the URL — both carry the same `sceneEnc` payload, but the
  // inline form is one round trip shorter for the SPA on shortlink visits.
  const inline = sceneFromInlineData();
  if (inline) return { id: ensureSid(newId()), scene: inline };

  const shared = typeof location !== "undefined" ? sceneFromUrl(location.href) : null;
  if (shared) return { id: ensureSid(newId()), scene: shared };

  const existing = getSid();
  if (existing) {
    const own = readScene(existing);
    if (own) return { id: existing, scene: own };
  }

  const id = ensureSid(existing ?? newId());
  const idx = readIndex();
  if (idx.length === 0) {
    // First-ever visit — seed with the tutorial. Stays lazy (no save) until
    // the user's first edit, same as any other lazy-fork starting scene.
    return { id, scene: structuredClone(tutorialScene) };
  }
  const recent = mostRecent(idx);
  return { id, scene: (recent && readScene(recent.id)) || tracerScene() };
}

/**
 * Mint a fresh build seeded from the tutorial scene constant. The Builds
 * modal's "Show tutorial" button calls this so the user can always summon a
 * clean copy, even if they scribbled on the previous one. Lazy until the
 * first edit, same as `newSession()`.
 */
export function newTutorialBuild(): SessionBoot {
  return { id: ensureSid(newId()), scene: structuredClone(tutorialScene) };
}

/**
 * Persist a build, materializing a lazy fork on first call. An optional
 * thumbnail (data URL) is stored under its own key so the index stays small and
 * a thumbnail write that hits quota can't lose the build itself.
 */
export function saveSession(id: string, scene: Scene, thumbnail?: string | null): void {
  try {
    localStorage.setItem(SCENE_PREFIX + id, encodeScene(scene));
    writeIndex(upsertSession(readIndex(), { id, title: deriveTitle(scene), updatedAt: Date.now() }));
  } catch {
    /* storage full or unavailable — best-effort */
  }
  if (thumbnail) {
    try {
      localStorage.setItem(THUMB_PREFIX + id, thumbnail);
    } catch {
      /* thumbnail is non-essential — drop it rather than failing the save */
    }
  }
}

/** The saved preview image (data URL) for a build, if any. */
export function loadThumbnail(id: string): string | null {
  try {
    return localStorage.getItem(THUMB_PREFIX + id);
  } catch {
    return null;
  }
}

/** Saved builds, most-recent first. */
export function listSessions(): SessionMeta[] {
  return sortByRecent(readIndex());
}

export function loadSession(id: string): Scene | null {
  return readScene(id);
}

/** Point this tab at an existing build (e.g. when opening one from the list). */
export function adoptSession(id: string): void {
  ensureSid(id);
}

/** Start a fresh, empty build owned by this tab (lazy until edited). */
export function newSession(): SessionBoot {
  return { id: ensureSid(newId()), scene: createScene() };
}

export function deleteSession(id: string): void {
  try {
    localStorage.removeItem(SCENE_PREFIX + id);
    localStorage.removeItem(THUMB_PREFIX + id);
    writeIndex(removeSession(readIndex(), id));
  } catch {
    /* ignore */
  }
}

export function renameSession(id: string, title: string): void {
  const idx = readIndex();
  const m = idx.find((s) => s.id === id);
  if (m) writeIndex(upsertSession(idx, { ...m, title }));
}

/** Whether the URL currently carries a shared scene (so the boot can clear it). */
export function hasSharedScene(): boolean {
  if (typeof location === "undefined") return false;
  const params = new URLSearchParams(location.search);
  if (params.get(SHARE_PARAM)) return true;
  return location.hash.replace(/^#/, "").length > 0;
}

/**
 * A shareable link that encodes the scene as a `?s=` query parameter. We
 * switched away from `#…` so server-side OpenGraph rendering (see
 * `.scratch/og-share/PRD.md`) can read the share payload — fragments never
 * reach the server. Reader still accepts `#…` for backwards compatibility.
 */
export function shareUrl(scene: Scene): string {
  return `${location.origin + location.pathname}?${SHARE_PARAM}=${encodeScene(scene)}`;
}

/**
 * Strip a previously-imported share payload from `url` while preserving any
 * other query parameters. Returns the path + remaining query (no hash). Pure
 * — pass a URL string in, get a string back. Used by the App's boot effect.
 */
export function strippedUrl(url: string): string {
  const u = new URL(url);
  u.searchParams.delete(SHARE_PARAM);
  u.hash = "";
  // Preserve trailing `?` only if the caller had real params besides ours.
  const search = u.searchParams.toString();
  return u.pathname + (search ? `?${search}` : "");
}

/**
 * Decode a scene from the JSON payload inside the worker-injected
 * `<script id="og-data" type="application/json">{ "sceneEnc": "…" }</script>`
 * blob. The blob is the SPA's fast path for `/s/<id>` visits: the worker
 * does the KV read on the request, then hands us the encoded scene so we
 * don't need a second round trip. Pure (string in, value out).
 *
 * Returns `null` if the input is missing, malformed, has no `sceneEnc`,
 * or the encoded scene fails to decode.
 */
export function sceneFromInlineDataText(text: string | null): Scene | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as { sceneEnc?: unknown };
    return typeof parsed.sceneEnc === "string" ? decodeScene(parsed.sceneEnc) : null;
  } catch {
    return null;
  }
}

/**
 * Extract a Scene from a URL string. Tries `?s=` first (the current share
 * format), falls back to `#…` (legacy in-the-wild links). Returns `null` if
 * neither carries a usable payload. Pure — no `location` access — so unit
 * tests can pass any URL string.
 */
export function sceneFromUrl(url: string): Scene | null {
  let encoded: string | null;
  try {
    const u = new URL(url);
    encoded = u.searchParams.get(SHARE_PARAM);
    if (!encoded) encoded = u.hash.replace(/^#/, "") || null;
  } catch {
    return null;
  }
  return encoded ? decodeScene(encoded) : null;
}

/**
 * Bytes the share payload would occupy in a URL — useful upstream to decide
 * whether to auto-promote a long URL to a shortlink (see og-share issue 03).
 */
export function encodedLength(scene: Scene): number {
  return encodeScene(scene).length;
}

const SHARE_PARAM = "s";

/**
 * Share text carrying a subgraph (one or more bodies + the connectors among
 * them), written to the system clipboard on copy so the same selection can be
 * pasted in another tab or app (issue 17, extended for multi-select). Reuses
 * the scene codec — the subgraph rides inside an otherwise-empty scene.
 */
export function subgraphToShareText(subgraph: { bodies: Body[]; connectors: Connector[] }): string {
  const scene = createScene();
  scene.rooms[0].bodies = subgraph.bodies;
  scene.rooms[0].connectors = subgraph.connectors;
  return encodeScene(scene);
}

/** Recover a subgraph from share text written by {@link subgraphToShareText}.
 *  Returns null if nothing decodable was found. */
export function subgraphFromShareText(text: string): { bodies: Body[]; connectors: Connector[] } | null {
  const scene = decodeScene(text);
  if (!scene) return null;
  const room = scene.rooms[0];
  if (!room || room.bodies.length === 0) return null;
  return { bodies: room.bodies, connectors: room.connectors };
}

// ----- internals -----

function migrateLegacy(): void {
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (!legacy) return;
    const scene = decodeScene(legacy);
    if (scene) {
      const id = newId();
      localStorage.setItem(SCENE_PREFIX + id, legacy);
      writeIndex(upsertSession(readIndex(), { id, title: deriveTitle(scene), updatedAt: Date.now() }));
    }
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

function readScene(id: string): Scene | null {
  try {
    const raw = localStorage.getItem(SCENE_PREFIX + id);
    return raw ? decodeScene(raw) : null;
  } catch {
    return null;
  }
}

function readIndex(): SessionMeta[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(INDEX_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isMeta) : [];
  } catch {
    return [];
  }
}

function writeIndex(index: SessionMeta[]): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    /* ignore */
  }
}

function isMeta(v: unknown): v is SessionMeta {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as SessionMeta).id === "string" &&
    typeof (v as SessionMeta).title === "string" &&
    typeof (v as SessionMeta).updatedAt === "number"
  );
}

function getSid(): string | null {
  try {
    return sessionStorage.getItem(SID_KEY);
  } catch {
    return null;
  }
}

function ensureSid(id: string): string {
  try {
    sessionStorage.setItem(SID_KEY, id);
  } catch {
    /* sessionStorage unavailable — id still drives this tab in-memory */
  }
  return id;
}

function newId(): string {
  return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * Pull the `og-data` script's text out of the DOM and decode the scene
 * inside, then remove the element so a later boot (e.g. soft remount in
 * dev) doesn't accidentally re-import. The element is regenerated by the
 * worker on a real refresh, so this is purely a guard against same-page
 * double imports.
 */
function sceneFromInlineData(): Scene | null {
  if (typeof document === "undefined") return null;
  const el = document.getElementById("og-data");
  if (!el) return null;
  const text = el.textContent;
  el.remove();
  return sceneFromInlineDataText(text);
}

