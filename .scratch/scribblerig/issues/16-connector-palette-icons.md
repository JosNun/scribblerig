# 16 — Icons for the connector palette (Spring / Weld / Pin)

Status: done

## Parent

`.scratch/scribblerig/PRD.md`

## What to build

The body palette already shows a Rough.js `BodyPreview` thumbnail above each
label. The **connector** palette buttons (Spring, Weld, Pin) are still
text-only, so they read as plain buttons next to the illustrated body tiles.
Give each connector an on-theme glyph so the palette reads as one consistent,
illustrated toolset.

This is **design-led** (`needs-triage`): decide the rendering approach before
implementing.

- **Static icons** — the project now has an icon set under `src/assets/icons/`
  surfaced through `src/ui/Icon.tsx` (a CSS mask painted with `currentColor`).
  Candidate glyphs already present: `interface/link.svg` (spring/link),
  `interface/pin.svg` (pin); weld has no obvious match and may need a custom
  one. Quick to wire, but these are line icons, not the hand-drawn canvas style.
- **Rough.js previews** — mirror `BodyPreview` with a tiny `ConnectorPreview`
  drawing a doodled spring coil / weld seam / hinge. Most consistent with the
  canvas aesthetic; more work, and connectors have no single shape to depict.

Whichever way, keep the palette layout working in both the desktop floating
strip and the mobile horizontal scroll row, and keep the connector `label`/help
text for accessibility (tooltip / screen readers).

## Decision (triage) — Rough.js previews

Chose **Rough.js previews** over the static line icons. A new
[`src/ui/ConnectorPreview.tsx`](../../src/ui/ConnectorPreview.tsx) mirrors
`BodyPreview`: a small doodle drawn per connector type, painted in the
connector's own `stroke` colour, so the connector tiles read as the same
illustrated toolset as the body tiles rather than line icons next to doodles.
The glyphs reuse the on-canvas connector vocabulary so what you arm matches what
you draw:

- **Spring** — two anchor dots + a zigzag coil (purple).
- **Motor** — a hinge ring + a ~270° rotation arc with an arrowhead (green).
- **Weld** — a rigid bar with the two fused ends squared off (brown).
- **Pin** — a faint axis with a pivot ring (ink).

Static icons were rejected: they're line icons (off the hand-drawn vibe), weld
has no good glyph in the set, and a colourless mask icon can't show each
connector's identity colour.

## Comments

### 2026-05-22 — Implemented

`ConnectorPreview` wired into both palette layouts (desktop strip + mobile
scroll row); the connector tiles now stack preview-over-label like body tiles
(shared flex-column CSS). The armed-tool highlight changed from a dark fill to a
warm `#f0e9d8` inset-border highlight — the old dark fill would have swallowed
the dark-stroked Pin glyph. `label`/`help` text is kept for the tooltip and
screen readers. Verified in-browser: all four glyphs render in their connector
colours, the layout holds in both desktop and mobile palettes, and an armed Pin
tile stays legible. 84 tests pass; component is impure canvas (verified
in-browser, like `BodyPreview`, so no unit test).

### 2026-05-22 — Palette restyle (follow-on)

With the connector tiles now illustrated, restyled the **whole palette** to a
*sticker-tile* look so it reads as one card rather than boxes-in-a-box: per-tile
borders dropped (the panel is the only frame), doodles sit directly on the paper
with a soft warm hover wash + slight lift, and a `Shapes` header was added
(desktop) to balance the existing `Connect` divider. The armed-connector
highlight keeps the inset doodle border as the single strongest affordance.
Verified in both the desktop strip and the mobile scroll row.

## Notes

- Related: [issue 09](09-expressive-property-controls.md) covers theming the
  property-panel sliders/checkboxes — the same "match the doodle vibe" thread,
  but for the property controls rather than the palette.
- Precedent: `src/ui/BodyPreview.tsx` (Rough.js body thumbnails) and
  `src/ui/Icon.tsx` (mask-based static icons) are both available models.
