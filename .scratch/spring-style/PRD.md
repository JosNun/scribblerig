# PRD: Spring style reflects properties (and scales with zoom)

Status: done

## Parent

`.scratch/scribblerig/PRD.md`

## Problem

`strokeSpring()` in `src/renderer/renderer.ts` draws every spring the
same way:

```ts
const coils = 6;
const amp = 7;          // screen px
const lead = Math.min(12, len * 0.2);
```

Two issues fall out of this:

1. **No visual encoding of properties.** Spring has three knobs that
   meaningfully change its feel — `stiffness` (1–500), `damping`
   (0–50), `restLength` (0.1–12 m) — but the rendered coil looks
   identical for a `stiffness: 5` jelly band and a `stiffness: 400`
   piano-wire. You only learn the difference by selecting the spring
   and reading the property panel, or by hitting Play.

2. **Amplitude doesn't scale with zoom.** `amp = 7` is in screen
   pixels, so the coil is the same thickness whether the room is
   zoomed in close or pulled way out. At a far zoom-out, a 0.5 m
   spring becomes a few px long but still has a 7 px-wide zigzag —
   the coil reads as a thick blob, wider than the body it's attached
   to. The rest-length marker (`drawSpringRest`) does the right
   thing — converts world points through `worldToScreen` — but the
   coil itself doesn't.

## Solution

### Encode stiffness in coil density

Tighter zig-zags for stiffer springs. Map `stiffness` to coil count
along a log curve (stiffness ranges 1–500, so linear would put every
spring at the high end):

```ts
// Roughly: 3 coils at stiffness=1, 6 at default (80), 10 at 500.
const coils = Math.round(3 + Math.log2(stiffness) * 1.1);
```

Tune the constants once we see it on the canvas. The key property:
default (`stiffness: 80`) should look about the same as today's
6-coil baseline, so existing builds don't change look.

### Make amplitude scale with zoom

Hold amplitude constant in **world space**, not screen space, so the
coil's thickness tracks the rest of the scene as you zoom:

```ts
const ampWorld = 0.07; // metres — tune to match today's look at default zoom
const amp = ampWorld * cam.scale;
```

Today's `amp = 7` at the default zoom (~100 px/m) is 0.07 m, so this
is the same look at fit-zoom and the right look everywhere else.

Apply the same treatment to `lead` so the straight tails on either
end of the coil also breathe with zoom.

### Maybe: encode damping and rest length

Lower priority — try the stiffness change first and see if the
spring is already legible enough.

- **Damping** could modulate stroke alpha or line weight: heavy
  damping reads as a darker / thicker coil (a "stiff rubber" feel),
  light damping as a thin springy line. Risk: confuses with
  selection state (we already thicken on select).

- **Rest length** doesn't need to be encoded *here* — the dashed
  rest-length marker (`drawSpringRest`) already shows it when
  selected. Out of scope unless we find a reason to always show it.

## Out of scope

- Animating the coil with the live tension (interesting, but a much
  bigger lift — we'd need per-frame access to current vs. rest
  length, and we'd risk a busy / shimmery canvas).
- Restyling the other connectors (weld square / pin ring / motor
  arc). They're already type-distinct and don't have continuous
  properties worth encoding visually.

## Tests

- `renderer.ts` has no render tests today; verify manually:
  - Place a spring at default props, confirm the coil looks the
    same as before this change.
  - Drop stiffness to ~5 and bump to ~400 — coil density visibly
    changes.
  - Zoom out and in — coil thickness now grows / shrinks with the
    rest of the canvas instead of staying fixed.

## Notes

- `drawSpringRest` already uses `worldToScreen` and so already
  scales with zoom — only the coil itself is broken.
- The spring's `props` are already passed into `drawConnector`, so
  threading `stiffness` into `strokeSpring` is a one-line change at
  the call site.
