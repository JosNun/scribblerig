import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { RoomSettings } from "../scene/scene";
import { RoomSettingsPanel } from "./RoomSettingsPanel";

/**
 * Schema-routing tests for the room panel. Gravity is stored as a `Vec2` but
 * edited through two schema fields (strength + direction). We verify the
 * panel decomposes the vector correctly into the right doodle controls.
 */
describe("RoomSettingsPanel", () => {
  const baseSettings: RoomSettings = {
    gravity: { x: 0, y: -9.8 }, // pulls down at 9.8 m/s²; angle = 0°
    walls: { floor: true, ceiling: false, left: false, right: true },
    size: { width: 12, height: 12 },
    snap: false,
  };

  it("renders gravity as a scrubber (strength) + doodle dial (direction)", () => {
    const html = renderToStaticMarkup(
      <RoomSettingsPanel settings={baseSettings} onChange={() => {}} />,
    );
    expect(html).toContain(`class="scrubber scrubber-rough"`);
    expect(html).toContain(`class="doodle-dial"`);
    // Strength = hypot(0, -9.8) = 9.8 → scrubber value
    expect(html).toContain(`aria-valuenow="9.8"`);
  });

  it("reads gravity direction as 0° for straight-down gravity", () => {
    const html = renderToStaticMarkup(
      <RoomSettingsPanel settings={baseSettings} onChange={() => {}} />,
    );
    // angleOf({ x: 0, y: -9.8 }) === 0 (straight down)
    expect(html).toMatch(/class="doodle-dial"[^>]*aria-valuenow="0"/);
  });

  it("reads sideways gravity as 90° (or 270°) on the dial", () => {
    // Gravity pulling right: (x: 9.8, y: 0). atan2(9.8, 0) / RAD = 90.
    const html = renderToStaticMarkup(
      <RoomSettingsPanel
        settings={{ ...baseSettings, gravity: { x: 9.8, y: 0 } }}
        onChange={() => {}}
      />,
    );
    expect(html).toMatch(/class="doodle-dial"[^>]*aria-valuenow="90"/);
  });

  it("renders each wall as a doodle checkbox reflecting its on/off state", () => {
    const html = renderToStaticMarkup(
      <RoomSettingsPanel settings={baseSettings} onChange={() => {}} />,
    );
    // Four wall booleans → four doodle checkboxes (one per row).
    const matches = html.match(/class="doodle-check"/g) ?? [];
    expect(matches.length).toBe(4);
    // floor: true → checked; ceiling: false → unchecked; left: false; right: true.
    // Easiest is to count `checked=""` occurrences for the inputs in the panel.
    // Strength + direction are not checkboxes, so checkboxes only come from
    // the wall fields.
    const checks = html.match(/class="doodle-check__input"[^>]*checked/g) ?? [];
    expect(checks.length).toBe(2); // floor + right
  });

  it("uses the `Room` title via the shared PropertyPanel", () => {
    const html = renderToStaticMarkup(
      <RoomSettingsPanel settings={baseSettings} onChange={() => {}} />,
    );
    expect(html).toContain(">Room<");
  });
});
