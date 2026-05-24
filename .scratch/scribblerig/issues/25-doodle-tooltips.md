# 25 — Doodle-styled tooltips with grouped warm-up timing

Status: ready-for-agent

## Parent

`.scratch/scribblerig/PRD.md`

## Problem

Across the UI we use the browser-native `title=""` attribute for hints —
on transport buttons (Play / Pause / Reset / Fit), the icon toolbar
(Duplicate / Delete / Share / Builds), the body and connector palette
tiles, the inline selection chip, the per-build delete buttons, and the
disabled-Play "Loading physics…" hint that just landed in commit
`2a17a0e`. Twenty-five of these in `src/App.tsx` alone.

Two problems with that:

1. **Visual mismatch.** Native tooltips render in the OS chrome — sans-
   serif, rectangular, drop-shadowed. Against a UI built entirely from
   `DoodleBorder` + Mynerve hand-drawing they read as a leak from
   another app.
2. **Timing isn't great.** The browser's native delay is ~500ms on
   every hover, with no concept of a "group." So scanning the transport
   bar (Play → Pause → Reset → Fit) makes you wait 500ms on each one
   individually rather than reading them like a menu.

## What to build

A `<DoodleTooltip>` wrapper component, plus a sweep that replaces every
`title=""` in the codebase with it.

### Component shape

```tsx
<DoodleTooltip content="Play" shortcut="Space">
  <button>…</button>
</DoodleTooltip>
```

Behaviour:

- **Hand-drawn frame.** `DoodleBorder` around the content, Mynerve font,
  same warm paper background as the panels. Optional small hand-drawn
  pointer / tail to the trigger (decide in triage — see below).
- **Portal-rendered.** Floats above panels/popovers; not clipped by
  parent overflow. Lives above the mobile sheet but below modal
  overlays (e.g. the Share popover currently centres on top).
- **Auto-flip on edge collision.** A tooltip on the top-row Play button
  must flip down if it'd otherwise clip off-screen.

### Grouped warm-up / cool-down timing

Standard tooltip-group behaviour, mirrored from Radix Tooltip's
`Provider`:

- **Open delay (first hover):** ~500ms. You have to actually pause on
  a control, not just brush past it.
- **Skip-delay window (between tooltips):** while *any* tooltip is open
  — or within ~300ms of the last one closing — opening the next one is
  instant. So sliding Play → Pause → Reset reads at scan speed.
- **Close behaviour:** tooltip hides immediately on `pointerleave`
  (don't try to keep it open while the user navigates away).
- **Focus.** Keyboard `:focus-visible` also opens, no delay. Escape
  closes.

A single `<DoodleTooltipProvider>` at the App root owns the shared
"is-any-tooltip-open + cool-down clock" state.

### Accessibility

- Trigger keeps `aria-label` (add one if it's not already there); the
  tooltip content is exposed via `aria-describedby`.
- Disabled buttons still need to show their tooltip. Native `title=""`
  works on `disabled` because the browser bypasses the disabled
  pointer-event filter; a custom wrapper has to do this explicitly
  (either wrap a `<span>` around the disabled child, or use
  `pointer-events` CSS to keep the wrapper hoverable). **Critical** for
  the "Loading physics…" hint, which by definition only appears on a
  disabled Play button.

### Touch

No hover on touch. Options (decide in triage):

- Suppress entirely.
- Long-press to reveal (Android pattern; iOS Safari is finicky).
- Tap-to-reveal once, second-tap-or-outside dismisses.

### Sweep scope

Every `title=""` in `src/App.tsx` (25 sites), plus:

- `src/ui/SharePopover.tsx` — Copy button, name field hint.
- `src/ui/PropertyPanel.tsx` — control labels with help text.
- Anywhere else `grep -rn 'title=' src/**.tsx` turns up.

Some sites are richer than a string (palette tile's `title` is a
multi-line `label\n\nhelp`); the tooltip should accept ReactNode or at
least handle `\n` cleanly.

## Decisions (triage)

- **Implementation:** Radix UI — `@radix-ui/react-tooltip` for the
  static labels and `@radix-ui/react-hover-card` for the interactive
  variant. `Tooltip.Provider` at the App root owns the grouped
  warm-up / skip-delay state. We own the visual layer only.
- **Two components, shared chrome:**
  - `<DoodleTooltip content={…}>` — wraps Radix Tooltip. Closes the
    moment the cursor leaves the trigger. For one-line labels:
    `Play`, `Pause`, `Delete`, `Share this build`, palette names, etc.
  - `<DoodleHoverCard content={…}>` — wraps Radix HoverCard. User can
    move the cursor *into* the content. Reserved for the
    [issue 10](10-property-demo-popovers.md) live-demo case where the
    tooltip contains a small interactive Rough.js preview of a
    property's effect.

  Both render through the same `DoodleBorder` + Mynerve + paper-bg
  presentation, so visual consistency is automatic.
- **Timing:** `delayDuration={500}` on first open;
  `skipDelayDuration={300}` for the "one tooltip already open →
  others open instantly" window. Matches Radix defaults; nothing to
  invent.
- **Tail:** none. Floating doodle-bordered box with a small consistent
  gap to the trigger. (Rough.js arrows look noisy at this size and
  each placement direction would need its own squiggle.)
- **Disabled-button delivery:** wrap disabled triggers in a
  hover-able `<span>`. The wrapper carries the tooltip listeners; the
  inner `<button disabled>` keeps its native disabled semantics. The
  Loading-physics example becomes:

  ```tsx
  <DoodleTooltip content={simReady ? "Play" : "Loading physics…"}>
    <span className="tooltip-trigger"><button onClick={play} disabled={!simReady || …}>…</button></span>
  </DoodleTooltip>
  ```

  Slight markup overhead per disabled-tooltip site, but no fragile
  CSS, no `aria-disabled` substitution.
- **Touch:** per-site via a `touchMode` prop.
  - `touchMode="suppress"` (default for `<DoodleTooltip>`) — no
    tooltip on touch; the action button just runs on tap. Used on
    transport, palette tiles, toolbar icons — anywhere the trigger has
    a primary action.
  - `touchMode="tap"` — tap once to reveal, tap-outside or
    tap-trigger-again to dismiss. Reserved for dedicated help
    affordances with no other action: the future `?` help-badge,
    property labels with extra context.
- **Content:** `content: ReactNode`. ReactNode rather than string so
  the same component handles a one-line label *and* the future
  property-demo case without an API split. Sites that need a richer
  layout (e.g. `Play  ␣` with a keyboard-shortcut chip) compose
  inline.
- **Play mode:** always on. Tooltips fire on UI chrome, never on the
  canvas itself, so the running sim isn't decorated with them.
  Consistency over mode-aware suppression.

## Implementation sketch

```
src/ui/DoodleTooltip.tsx    new — wraps Radix Tooltip
src/ui/DoodleHoverCard.tsx  new — wraps Radix HoverCard
src/ui/tooltip.css          new — shared chrome styles
src/App.tsx                 root <Tooltip.Provider delayDuration={500} skipDelayDuration={300}>
                            + replace all 25 `title=` sites with <DoodleTooltip>
src/ui/PropertyPanel.tsx    sweep `title=`
src/ui/SharePopover.tsx     sweep `title=`
```

Dependency: `@radix-ui/react-tooltip`, `@radix-ui/react-hover-card`
(latter can ship in a later PR if we want to keep this one small).

## Tests

- `DoodleTooltip.test.tsx` — renders, exposes content via
  `aria-describedby`, hides on `pointerleave`.
- `DoodleTooltip.test.tsx` (disabled-trigger case) — wrapping a
  disabled button: tooltip still appears on hover of the wrapper, the
  inner button stays disabled.
- Timing behaviour is hard to assert in vitest without flake; verify
  the Radix Provider props are wired (`delayDuration={500}`,
  `skipDelayDuration={300}`) and leave the timing itself to Radix.

## Notes

- Precedent in the codebase for portal-rendered floating UI:
  `src/ui/SharePopover.tsx` (centred overlay, but not a tooltip pattern
  — different positioning strategy).
- Today's `title=""` audit point: `grep -rn 'title=' src --include="*.tsx"`
  finds 25 sites in App.tsx + a handful in components.
