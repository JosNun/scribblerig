/**
 * Browser glue over the pure {@link codec} and {@link sessions} logic. Owns the
 * localStorage/sessionStorage layout for per-tab sessions (issue 18):
 *
 * - `physics-sandbox:sid`     (sessionStorage) — this tab's session id;
 * - `physics-sandbox:scene:<id>` (localStorage) — each build's encoded scene;
 * - `physics-sandbox:sessions`   (localStorage) — the index of saved builds.
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
import { createScene, tracerScene, type Scene } from "../scene/scene";

const SCENE_PREFIX = "physics-sandbox:scene:";
const THUMB_PREFIX = "physics-sandbox:thumb:";
const INDEX_KEY = "physics-sandbox:sessions";
const SID_KEY = "physics-sandbox:sid";
const LEGACY_KEY = "physics-sandbox:scene"; // single-key autosave from issue 08

export interface SessionBoot {
  id: string;
  scene: Scene;
}

/**
 * Decide this tab's session id and starting scene:
 *  1. a shared URL fragment → a fresh (lazy) session;
 *  2. else this tab's own persisted session (stable reload);
 *  3. else resume the most-recent build's content under a fresh id — a *lazy
 *     fork* that only becomes a saved session once edited (see `saveSession`).
 */
export function bootSession(): SessionBoot {
  migrateLegacy();

  const shared = sceneFromHash();
  if (shared) return { id: ensureSid(newId()), scene: shared };

  const existing = getSid();
  if (existing) {
    const own = readScene(existing);
    if (own) return { id: existing, scene: own };
  }

  const id = ensureSid(existing ?? newId());
  const recent = mostRecent(readIndex());
  return { id, scene: (recent && readScene(recent.id)) || tracerScene() };
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
  return typeof location !== "undefined" && location.hash.replace(/^#/, "").length > 0;
}

/** A shareable link that encodes the scene in the URL fragment. */
export function shareUrl(scene: Scene): string {
  return `${location.origin + location.pathname}#${encodeScene(scene)}`;
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

function sceneFromHash(): Scene | null {
  if (typeof location === "undefined") return null;
  const hash = location.hash.replace(/^#/, "");
  return hash ? decodeScene(hash) : null;
}
