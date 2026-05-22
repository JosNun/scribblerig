/**
 * Pure session-index logic, with no browser dependencies so it's unit-testable.
 * A "session" is one saved build; the index is the listable catalogue of them.
 * The localStorage/sessionStorage I/O that uses these lives in {@link storage}.
 */

import { type Scene } from "../scene/scene";

export interface SessionMeta {
  id: string;
  title: string;
  /** Epoch ms of the last save — drives "most recent" and list ordering. */
  updatedAt: number;
}

/** A short human label for a build, derived from its contents. */
export function deriveTitle(scene: Scene): string {
  const room = scene.rooms[0];
  const n = room.bodies.length + room.connectors.length;
  return n === 0 ? "Empty build" : `${n} object${n === 1 ? "" : "s"}`;
}

/** Insert or replace a session, keeping replacements in place and new ones first. */
export function upsertSession(index: SessionMeta[], meta: SessionMeta): SessionMeta[] {
  const i = index.findIndex((s) => s.id === meta.id);
  if (i === -1) return [meta, ...index];
  const next = index.slice();
  next[i] = meta;
  return next;
}

/** A copy ordered most-recently-updated first. */
export function sortByRecent(index: SessionMeta[]): SessionMeta[] {
  return [...index].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Drop a session from the index. */
export function removeSession(index: SessionMeta[], id: string): SessionMeta[] {
  return index.filter((s) => s.id !== id);
}

/** The most-recently-updated session, or null if there are none. */
export function mostRecent(index: SessionMeta[]): SessionMeta | null {
  return sortByRecent(index)[0] ?? null;
}
