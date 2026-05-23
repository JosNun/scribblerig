/**
 * Pure helper: turn a scene into a short fallback title for OpenGraph
 * previews when the user hasn't named it explicitly. Output style is
 * `"3 balls · 2 platforms · 1 motor"` — bodies first (in body-registry
 * order), then connectors (in connector-registry order), each group's
 * label pluralised by count.
 *
 * Used by the worker for `?s=…` shares; named shares (`/s/<id>`) use the
 * stored `scene.title` instead.
 *
 * See [og-share PRD](.scratch/og-share/PRD.md).
 */

import type { Scene } from "../scene/scene";
import { bodyTypes, connectorTypes } from "../registry/registry";

const SEPARATOR = " · ";

export function deriveTitle(scene: Scene): string {
  const room = scene.rooms[0];
  if (!room) return "Empty room";

  const groups: string[] = [];

  // Bodies in registry order — drives the "ball before platform" ordering.
  for (const def of bodyTypes()) {
    const n = room.bodies.filter((b) => b.type === def.type).length;
    if (n > 0) groups.push(`${n} ${labelFor(def.label, n)}`);
  }

  // Connectors in registry order (CONNECTOR_ORDER: spring, motor, weld, pin).
  for (const def of connectorTypes()) {
    const n = room.connectors.filter((c) => c.type === def.type).length;
    if (n > 0) groups.push(`${n} ${labelFor(def.label, n)}`);
  }

  if (groups.length === 0) return "Empty room";
  return groups.join(SEPARATOR);
}

/**
 * Lowercase the registry's display label and pluralise. The registry's labels
 * are nouns ("Ball", "Platform", "Spring", …) so naïve `+ "s"` is correct
 * for v1's set. If a future type ever needs an irregular plural, this is the
 * one place to special-case it.
 */
function labelFor(displayLabel: string, count: number): string {
  const lower = displayLabel.toLowerCase();
  return count === 1 ? lower : `${lower}s`;
}
